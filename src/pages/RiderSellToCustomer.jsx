import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { savePendingDelivery, updateCustomerBalanceOffline } from '../offlineDB'
import RiderQuickSale from './RiderQuickSale'

const RATES = [90, 100, 110, 120, 150, 160, 170, 180]

export default function RiderSellToCustomer({ rider, tenantId, preSelectedCustomer, onClearPreSelected, isOnline, dbReady }) {
  const [subTab, setSubTab] = useState('customer')
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [qty19l, setQty19l] = useState(1)
  const [qtyHalf, setQtyHalf] = useState(0)
  const [qty15l, setQty15l] = useState(0)
  const [selectedRate, setSelectedRate] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState(null)
  const [cashReceived, setCashReceived] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [step, setStep] = useState(1)
  const [bottlesReturned, setBottlesReturned] = useState(0)

  // Payment receipt state
  const [paySearch, setPaySearch] = useState('')
  const [payResults, setPayResults] = useState([])
  const [payCustomer, setPayCustomer] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payNotes, setPayNotes] = useState('')
  const [paySuccess, setPaySuccess] = useState(null)
  const [paySaving, setPaySaving] = useState(false)

  useEffect(() => {
    if (preSelectedCustomer) {
      setSelectedCustomer(preSelectedCustomer)
      setSelectedRate(preSelectedCustomer.rate_19l || 100)
      setStep(2)
      setSubTab('customer')
    }
  }, [preSelectedCustomer])

  async function searchCustomer(val) {
    setSearch(val)
    if (val.length < 2) { setSearchResults([]); return }
    if (!isOnline) { setSearchResults([]); return }
    const { data } = await supabase.from('customers')
      .select('*').eq('tenant_id', tenantId).eq('is_active', true)
      .or(`full_name.ilike.%${val}%,mobile.ilike.%${val}%,customer_code.ilike.%${val}%`).limit(5)
    setSearchResults(data || [])
  }

  async function searchPayCustomer(val) {
    setPaySearch(val)
    if (val.length < 2) { setPayResults([]); return }
    if (!isOnline) { setPayResults([]); return }
    const { data } = await supabase.from('customers')
      .select('*').eq('tenant_id', tenantId).eq('is_active', true)
      .or(`full_name.ilike.%${val}%,mobile.ilike.%${val}%,customer_code.ilike.%${val}%`).limit(5)
    setPayResults(data || [])
  }

  function selectCustomer(c) {
    setSelectedCustomer(c)
    setSelectedRate(c.rate_19l || 100)
    setSearch('')
    setSearchResults([])
    setStep(2)
  }

  function totalAmount() {
    return (qty19l * (selectedRate || 0)) +
      (qtyHalf * (selectedCustomer?.rate_half_litre || 0)) +
      (qty15l * (selectedCustomer?.rate_1_5l || 0))
  }

  async function receivePayment() {
    if (!payCustomer) return alert('Please select a customer')
    if (!payAmount || Number(payAmount) <= 0) return alert('Please enter payment amount')
    setPaySaving(true)

    const amount = Number(payAmount)
    const isJazz = payMethod === 'jazzcash'

    if (!isOnline) {
      // Offline — just show success, sync later
      setPaySuccess({ name: payCustomer.full_name, amount, method: payMethod, newBalance: Number(payCustomer.balance || 0) - amount, jazzPending: payMethod === 'jazzcash', savedOffline: true })
      setPayCustomer(null); setPaySearch(''); setPayAmount(''); setPayNotes('')
      setPaySaving(false)
      return
    }

    const { data: savedPayment, error } = await supabase.from('payments').insert([{
      tenant_id: tenantId,
      customer_id: payCustomer.id,
      rider_id: rider.id,
      amount,
      payment_method: payMethod,
      payment_date: new Date().toISOString().split('T')[0],
      jazzcash_confirmed: !isJazz,
      notes: payNotes || `Payment received by rider ${rider.full_name}`,
      is_voided: false
    }]).select().single()

    if (error) { alert('Error: ' + error.message); setPaySaving(false); return }

    // Cash: reduce customer balance + post journal
    if (!isJazz) {
      const newBalance = Number(payCustomer.balance || 0) - amount
      await supabase.from('customers')
        .update({ balance: newBalance })
        .eq('id', payCustomer.id)
        .eq('tenant_id', tenantId)

      // Journal: DR Cash in Hand (1001), CR Accounts Receivable (1100)
      try {
        const { data: je } = await supabase.from('journal_entries').insert([{
          tenant_id: tenantId,
          entry_date: new Date().toISOString().split('T')[0],
          reference_type: 'payment',
          reference_id: savedPayment.id,
          narration: `Payment received — ${payCustomer.full_name} — Cash — Rider: ${rider.full_name}`,
          total_amount: amount,
          created_by: rider.full_name
        }]).select().single()

        if (je) {
          await supabase.from('journal_entry_lines').insert([
            { tenant_id: tenantId, journal_entry_id: je.id, account_code: '1001', account_name: 'Cash in Hand', debit: amount, credit: 0 },
            { tenant_id: tenantId, journal_entry_id: je.id, account_code: '1100', account_name: 'Accounts Receivable', debit: 0, credit: amount }
          ])
        }
      } catch (err) { console.error('Journal error:', err) }
    }

    // JazzCash: goes to admin, no balance update until confirmed
    if (isJazz) {
      try {
        const { data: je } = await supabase.from('journal_entries').insert([{
          tenant_id: tenantId,
          entry_date: new Date().toISOString().split('T')[0],
          reference_type: 'payment',
          reference_id: savedPayment.id,
          narration: `JazzCash payment pending — ${payCustomer.full_name} — Rider: ${rider.full_name}`,
          total_amount: amount,
          created_by: rider.full_name
        }]).select().single()

        if (je) {
          await supabase.from('journal_entry_lines').insert([
            { tenant_id: tenantId, journal_entry_id: je.id, account_code: '1002', account_name: 'JazzCash Account', debit: amount, credit: 0 },
            { tenant_id: tenantId, journal_entry_id: je.id, account_code: '1100', account_name: 'Accounts Receivable', debit: 0, credit: amount }
          ])
        }
      } catch (err) { console.error('Journal error:', err) }
    }

    setPaySuccess({
      name: payCustomer.full_name,
      amount,
      method: payMethod,
      newBalance: !isJazz ? Number(payCustomer.balance || 0) - amount : payCustomer.balance,
      jazzPending: isJazz
    })
    setPayCustomer(null)
    setPaySearch('')
    setPayAmount('')
    setPayNotes('')
    setPaySaving(false)
  }

  async function completeSale() {
    if (!paymentMethod) return alert('Please select payment method')
    if (qty19l === 0 && qtyHalf === 0 && qty15l === 0) return alert('Please add at least one bottle')
    if (qty19l > 0 && !selectedRate) return alert('Please select rate for 19L')

    const total = totalAmount()
    if (paymentMethod === 'cash') {
      const received = Number(cashReceived)
      if (!cashReceived || received < 0) return alert('Please enter cash received')
      if (received > total) return alert('Cash received cannot exceed total Rs. ' + total.toLocaleString())
    }

    setSaving(true)
    const isCash = paymentMethod === 'cash'
    const isJazz = paymentMethod === 'jazzcash'
    const isCredit = paymentMethod === 'credit'
    const received = isCash ? Number(cashReceived) : 0
    const creditPortion = isCredit ? total : isCash ? (total - received) : 0
    const now = new Date().toISOString()

    let deliveryLat = null
    let deliveryLng = null
    try {
      const position = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
      )
      deliveryLat = position.coords.latitude
      deliveryLng = position.coords.longitude
    } catch (err) { console.log('GPS not available:', err.message) }

    const deliveryData = {
      tenant_id: tenantId,
      customer_id: selectedCustomer.id,
      rider_id: rider.id,
      qty_19l: qty19l,
      qty_half_litre: qtyHalf,
      qty_1_5l: qty15l,
      rate_applied: selectedRate || 0,
      total_amount: total,
      payment_method: paymentMethod,
      amount_received: isJazz ? 0 : received,
      credit_amount: creditPortion,
      jazzcash_confirmed: false,
      delivered_at: now,
      is_voided: false,
      delivery_lat: deliveryLat,
      delivery_lng: deliveryLng,
      bottles_returned: bottlesReturned
    }

    if (isOnline) {
      const { data: savedDelivery, error } = await supabase
        .from('deliveries').insert([deliveryData]).select().single()
      if (error) { alert('Error: ' + error.message); setSaving(false); return }

      if (creditPortion > 0) {
        const newBalance = Number(selectedCustomer.balance) + creditPortion
        await supabase.from('customers').update({ balance: newBalance }).eq('id', selectedCustomer.id)
      }

      // Update our bottles with customer
      const currentBottles = Number(selectedCustomer.our_bottles_placed || 0)
      const newBottles = Math.max(0, currentBottles + qty19l - bottlesReturned)
      await supabase.from('customers')
        .update({ our_bottles_placed: newBottles })
        .eq('id', selectedCustomer.id)
        .eq('tenant_id', tenantId)

      try {
        const { postDeliveryJournal } = await import('../accountingEngine')
        await postDeliveryJournal(savedDelivery, selectedCustomer.id, tenantId)
      } catch (err) { console.error('Journal post error:', err) }

      if (deliveryLat && deliveryLng && selectedCustomer.id) {
        const { data: cust } = await supabase.from('customers')
          .select('latitude, longitude')
          .eq('id', selectedCustomer.id).eq('tenant_id', tenantId).single()
        if (cust && !cust.latitude) {
          await supabase.from('customers').update({
            latitude: String(deliveryLat), longitude: String(deliveryLng)
          }).eq('id', selectedCustomer.id).eq('tenant_id', tenantId)
        }
      }
    } else {
      await savePendingDelivery(deliveryData)
      if (creditPortion > 0) {
        const newBalance = Number(selectedCustomer.balance || 0) + creditPortion
        await updateCustomerBalanceOffline(selectedCustomer.id, newBalance)
      }
    }

    setSuccess({ customer: selectedCustomer.full_name, total, received, creditPortion, paymentMethod, savedOffline: !isOnline })
    setSelectedCustomer(null)
    setQty19l(1); setQtyHalf(0); setQty15l(0)
    setSelectedRate(null); setPaymentMethod(null); setCashReceived('')
    setBottlesReturned(0)
    setStep(1)
    if (onClearPreSelected) onClearPreSelected()
    setSaving(false)
  }

  function numBtn(val, setVal) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button onClick={() => setVal(Math.max(0, val - 1))}
          style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #ddd', background: '#f5f5f5', fontSize: '18px', cursor: 'pointer' }}>−</button>
        <span style={{ fontSize: '22px', fontWeight: '700', minWidth: '30px', textAlign: 'center' }}>{val}</span>
        <button onClick={() => setVal(val + 1)}
          style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #0f4c81', background: '#0f4c81', color: 'white', fontSize: '18px', cursor: 'pointer' }}>+</button>
      </div>
    )
  }

  const total = totalAmount()
  const cashReceivedNum = Number(cashReceived) || 0

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '12px' }}>🏪 Sell & Receive</h2>

      {/* Sub Tab Toggle — 3 tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        <button onClick={() => { setSubTab('customer'); setSuccess(null) }}
          style={{ flex: 1, padding: '10px 6px', border: '2px solid', borderColor: subTab === 'customer' ? '#0f4c81' : '#eee', borderRadius: '10px', cursor: 'pointer', background: subTab === 'customer' ? '#0f4c81' : 'white', color: subTab === 'customer' ? 'white' : '#555', fontWeight: '700', fontSize: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
          <span style={{ fontSize: '20px' }}>👤</span>
          <span>Sell to</span>
          <span>Customer</span>
        </button>
        <button onClick={() => { setSubTab('quicksale'); setSuccess(null) }}
          style={{ flex: 1, padding: '10px 6px', border: '2px solid', borderColor: subTab === 'quicksale' ? '#1a7a4a' : '#eee', borderRadius: '10px', cursor: 'pointer', background: subTab === 'quicksale' ? '#1a7a4a' : 'white', color: subTab === 'quicksale' ? 'white' : '#555', fontWeight: '700', fontSize: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
          <span style={{ fontSize: '20px' }}>⚡</span>
          <span>Quick</span>
          <span>Sale</span>
        </button>
        <button onClick={() => { setSubTab('payment'); setPaySuccess(null) }}
          style={{ flex: 1, padding: '10px 6px', border: '2px solid', borderColor: subTab === 'payment' ? '#f59e0b' : '#eee', borderRadius: '10px', cursor: 'pointer', background: subTab === 'payment' ? '#f59e0b' : 'white', color: subTab === 'payment' ? 'white' : '#555', fontWeight: '700', fontSize: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
          <span style={{ fontSize: '20px' }}>💰</span>
          <span>Receive</span>
          <span>Payment</span>
        </button>
      </div>

      {/* Quick Sale */}
      {subTab === 'quicksale' && <RiderQuickSale rider={rider} tenantId={tenantId} />}

      {/* Receive Payment */}
      {subTab === 'payment' && (
        <div>
          {!isOnline && (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
              <p style={{ fontSize: '12px', color: '#ea580c', fontWeight: '600', margin: 0 }}>📵 Offline — payment will be saved but customer balance will update when internet is restored</p>
            </div>
          )}

          {paySuccess && (
            <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
              <p style={{ fontWeight: '700', color: '#1b5e20', margin: '0 0 4px' }}>✅ Payment Received!</p>
              <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>👤 {paySuccess.name}</p>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 2px' }}>
                Rs. {paySuccess.amount.toLocaleString()} — {paySuccess.method === 'jazzcash' ? '📱 JazzCash' : '💵 Cash'}
              </p>
              {paySuccess.jazzPending && (
                <p style={{ fontSize: '11px', color: '#e65100', margin: '4px 0 0', fontWeight: '600' }}>
                  ⚠️ JazzCash — admin will confirm and update balance
                </p>
              )}
              {!paySuccess.jazzPending && (
                <p style={{ fontSize: '12px', color: '#555', margin: '4px 0 0' }}>
                  New balance: <strong style={{ color: paySuccess.newBalance > 0 ? '#f44336' : '#1a7a4a' }}>
                    Rs. {Math.abs(paySuccess.newBalance).toLocaleString()} {paySuccess.newBalance > 0 ? 'still owed' : paySuccess.newBalance < 0 ? 'advance' : '✅ clear'}
                  </strong>
                </p>
              )}
              <button onClick={() => setPaySuccess(null)}
                style={{ marginTop: '8px', padding: '4px 12px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '12px' }}>
                + New Payment
              </button>
            </div>
          )}

          {/* Customer Search */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>Search Customer</p>
            {payCustomer ? (
              <div style={{ padding: '12px 14px', background: '#e3f0ff', borderRadius: '8px', border: '1px solid #c8d8ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontWeight: '700', fontSize: '15px', margin: '0 0 2px', color: '#0f4c81' }}>{payCustomer.full_name}</p>
                  <p style={{ fontSize: '12px', color: '#555', margin: '0 0 4px' }}>{payCustomer.mobile}</p>
                  <p style={{ fontSize: '14px', fontWeight: '700', margin: 0, color: Number(payCustomer.balance) > 0 ? '#f44336' : '#1a7a4a' }}>
                    Outstanding: Rs. {Math.abs(Number(payCustomer.balance || 0)).toLocaleString()}
                    {Number(payCustomer.balance) <= 0 && ' ✅'}
                  </p>
                </div>
                <button onClick={() => { setPayCustomer(null); setPaySearch(''); setPayAmount('') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '20px' }}>✕</button>
              </div>
            ) : (
              <div>
                <input value={paySearch} onChange={e => searchPayCustomer(e.target.value)}
                  placeholder="Name, mobile or customer ID..."
                  style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '15px', outline: 'none', boxSizing: 'border-box', color: '#333' }} />
                {payResults.map(c => (
                  <div key={c.id} onClick={() => { setPayCustomer(c); setPayResults([]); setPaySearch(''); if (c.balance > 0) setPayAmount(String(c.balance)) }}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}>
                    <div>
                      <p style={{ fontWeight: '600', fontSize: '14px', margin: '0 0 2px' }}>{c.full_name}</p>
                      <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>{c.mobile}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '14px', fontWeight: '700', color: Number(c.balance) > 0 ? '#f44336' : '#1a7a4a', margin: 0 }}>
                        Rs. {Math.abs(Number(c.balance)).toLocaleString()}
                      </p>
                      <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>
                        {Number(c.balance) > 0 ? 'owes' : 'advance'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment Method */}
          
          {/* Bottles Returned */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #fff3e0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: '700', color: '#e65100', margin: '0 0 4px' }}>🫙 Empty Bottles Returned</p>
                    <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>
                      Our bottles with customer: <strong>{Number(selectedCustomer?.our_bottles_placed || 0)}</strong>
                    </p>
                    {bottlesReturned > 0 && (
                      <p style={{ fontSize: '11px', color: '#1a7a4a', margin: '4px 0 0', fontWeight: '600' }}>
                        After delivery: {Math.max(0, Number(selectedCustomer?.our_bottles_placed || 0) + qty19l - bottlesReturned)} our bottles
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button onClick={() => setBottlesReturned(Math.max(0, bottlesReturned - 1))}
                      style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #ddd', background: '#f5f5f5', fontSize: '18px', cursor: 'pointer' }}>−</button>
                    <span style={{ fontSize: '22px', fontWeight: '700', minWidth: '30px', textAlign: 'center', color: bottlesReturned > 0 ? '#e65100' : '#ccc' }}>{bottlesReturned}</span>
                    <button onClick={() => setBottlesReturned(bottlesReturned + 1)}
                      style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #e65100', background: '#e65100', color: 'white', fontSize: '18px', cursor: 'pointer' }}>+</button>
                  </div>
                </div>
              </div>

              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>Payment Method</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              {[
                { key: 'cash', label: 'نقد', sublabel: 'Cash — goes to rider', color: '#1a7a4a' },
                { key: 'jazzcash', label: 'جیز کیش', sublabel: 'JazzCash — goes to admin', color: '#9c27b0' },
              ].map(pm => (
                <button key={pm.key} onClick={() => setPayMethod(pm.key)}
                  style={{ flex: 1, padding: '14px 8px', border: '2px solid', borderColor: payMethod === pm.key ? pm.color : '#eee', borderRadius: '10px', cursor: 'pointer', background: payMethod === pm.key ? pm.color : 'white', color: payMethod === pm.key ? 'white' : '#555', fontWeight: '700', fontSize: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <span>{pm.label}</span>
                  <span style={{ fontSize: '10px', opacity: 0.8, textAlign: 'center' }}>{pm.sublabel}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>Amount Received (Rs.)</p>
            <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
              placeholder="0"
              style={{ width: '100%', padding: '14px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '28px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center', color: '#333', caretColor: '#0f4c81' }} />
            {payCustomer && Number(payCustomer.balance) > 0 && (
              <button onClick={() => setPayAmount(String(payCustomer.balance))}
                style={{ marginTop: '8px', width: '100%', padding: '8px', background: '#f0f7ff', border: '1px solid #c8d8ff', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#0f4c81', fontWeight: '600' }}>
                Full Balance: Rs. {Number(payCustomer.balance).toLocaleString()}
              </button>
            )}
          </div>

          {/* Notes */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '8px' }}>Notes (optional)</p>
            <input value={payNotes} onChange={e => setPayNotes(e.target.value)}
              placeholder="e.g. Monthly payment..."
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: '#333' }} />
          </div>

          {/* Submit */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            {payCustomer && payAmount && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', padding: '12px', background: '#f0f7ff', borderRadius: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: '700', color: '#333' }}>Amount</span>
                <span style={{ fontSize: '28px', fontWeight: '800', color: '#0f4c81' }}>Rs. {Number(payAmount).toLocaleString()}</span>
              </div>
            )}
            <button onClick={receivePayment} disabled={paySaving}
              style={{ width: '100%', padding: '16px', background: payMethod === 'cash' ? '#1a7a4a' : '#9c27b0', color: 'white', border: 'none', borderRadius: '10px', cursor: paySaving ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: '700' }}>
              {paySaving ? 'Saving...' : `✓ ${payMethod === 'cash' ? '💵 Receive Cash' : '📱 Record JazzCash'} — Rs. ${Number(payAmount || 0).toLocaleString()}`}
            </button>
          </div>
        </div>
      )}

      {/* Sell to Customer */}
      {subTab === 'customer' && (
        <div>
          {!isOnline && (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
              <p style={{ fontSize: '12px', color: '#ea580c', fontWeight: '600', margin: 0 }}>📵 Offline — sale will sync when internet is available</p>
            </div>
          )}

          {success && (
            <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
              <p style={{ fontWeight: '700', color: '#1b5e20', marginBottom: '4px' }}>✅ Sale Complete!</p>
              <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>{success.customer} — Rs. {success.total.toLocaleString()}</p>
              {success.received > 0 && <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>Cash: Rs. {success.received.toLocaleString()}</p>}
              {success.creditPortion > 0 && <p style={{ fontSize: '13px', color: '#f44336', margin: '0 0 2px' }}>Credit: Rs. {success.creditPortion.toLocaleString()}</p>}
              {success.savedOffline && <p style={{ fontSize: '12px', color: '#ea580c', margin: '4px 0 0', fontWeight: '600' }}>📵 Saved offline — will sync later</p>}
              <button onClick={() => setSuccess(null)}
                style={{ marginTop: '8px', padding: '4px 12px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '12px' }}>
                New Sale
              </button>
            </div>
          )}

          {step === 1 && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>Search Customer</p>
              <input value={search} onChange={e => searchCustomer(e.target.value)}
                placeholder="Name, mobile or customer ID..."
                style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '15px', outline: 'none', boxSizing: 'border-box', color: '#333' }} />
              {searchResults.map(c => (
                <div key={c.id} onClick={() => selectCustomer(c)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}>
                  <div>
                    <p style={{ fontWeight: '600', fontSize: '14px', margin: '0 0 2px' }}>{c.full_name}</p>
                    <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>{c.mobile} · {c.customer_code}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '13px', fontWeight: '700', color: Number(c.balance) > 0 ? '#f44336' : '#4caf50', margin: '0 0 2px' }}>
                      Rs. {Math.abs(Number(c.balance)).toLocaleString()}
                    </p>
                    <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>{Number(c.balance) > 0 ? 'owes' : Number(c.balance) < 0 ? 'advance' : 'clear'}</p>
                  </div>
                </div>
              ))}
              {!isOnline && (
                <p style={{ fontSize: '12px', color: '#aaa', textAlign: 'center', margin: '12px 0 0' }}>Customer search not available offline</p>
              )}
            </div>
          )}

          {step === 2 && selectedCustomer && (
            <div>
              <div style={{ background: '#0f4c81', color: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontWeight: '700', fontSize: '16px', margin: '0 0 2px' }}>{selectedCustomer.full_name}</p>
                  <p style={{ fontSize: '12px', opacity: 0.8, margin: 0 }}>{selectedCustomer.mobile} · {selectedCustomer.customer_code}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '11px', opacity: 0.7, margin: '0 0 2px' }}>Balance</p>
                  <p style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: selectedCustomer.balance > 0 ? '#ffcdd2' : '#c8e6c9' }}>
                    Rs. {Number(selectedCustomer.balance || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '14px' }}>Bottles</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <p style={{ fontSize: '14px', fontWeight: '600', margin: 0 }}>19 Litre</p>
                  {numBtn(qty19l, setQty19l)}
                </div>
                {(selectedCustomer.rate_half_litre > 0 || qtyHalf > 0) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <p style={{ fontSize: '14px', fontWeight: '600', margin: 0 }}>Half Litre</p>
                    {numBtn(qtyHalf, setQtyHalf)}
                  </div>
                )}
                {(selectedCustomer.rate_1_5l > 0 || qty15l > 0) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ fontSize: '14px', fontWeight: '600', margin: 0 }}>1.5 Litre</p>
                    {numBtn(qty15l, setQty15l)}
                  </div>
                )}
              </div>

              {qty19l > 0 && (
                <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>Rate — 19L</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                    {RATES.map(r => (
                      <button key={r} onClick={() => setSelectedRate(r)}
                        style={{ padding: '10px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: selectedRate === r ? '#0f4c81' : '#f0f0f0', color: selectedRate === r ? 'white' : '#333', fontWeight: '700', fontSize: '14px' }}>
                        Rs. {r}
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>یا خود لکھیں (Manual Rate)</p>
                  <input type="number" value={selectedRate || ''} onChange={e => setSelectedRate(e.target.value === '' ? null : Number(e.target.value))}
                    placeholder="e.g. 130"
                    style={{ width: '100%', padding: '10px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '20px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center', color: '#333' }} />
                  {selectedRate && (
                    <p style={{ fontSize: '12px', color: '#0f4c81', fontWeight: '600', margin: '6px 0 0', textAlign: 'center' }}>
                      ✅ Rate: Rs. {selectedRate} per bottle
                    </p>
                  )}
                </div>
              )}

              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>Payment Method</p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {[
                    { key: 'cash', label: 'نقد', sublabel: 'Cash', color: '#1a7a4a' },
                    { key: 'jazzcash', label: 'جیز کیش', sublabel: 'JazzCash', color: '#9c27b0' },
                    { key: 'credit', label: 'ادھار', sublabel: 'Credit', color: '#f44336' },
                  ].map(pm => (
                    <button key={pm.key} onClick={() => { setPaymentMethod(pm.key); setCashReceived('') }}
                      style={{ flex: 1, padding: '14px 8px', border: '2px solid', borderColor: paymentMethod === pm.key ? pm.color : '#eee', borderRadius: '10px', cursor: 'pointer', background: paymentMethod === pm.key ? pm.color : 'white', color: paymentMethod === pm.key ? 'white' : '#555', fontWeight: '700', fontSize: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <span>{pm.label}</span>
                      <span style={{ fontSize: '10px', opacity: 0.8 }}>{pm.sublabel}</span>
                    </button>
                  ))}
                </div>

                {paymentMethod === 'cash' && total > 0 && (
                  <div style={{ marginTop: '14px', background: '#f0f7ff', borderRadius: '10px', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{ fontSize: '13px', color: '#555' }}>Total</span>
                      <span style={{ fontSize: '15px', fontWeight: '700', color: '#0f4c81' }}>Rs. {total.toLocaleString()}</span>
                    </div>
                    <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>Cash Received</label>
                    <input type="number" value={cashReceived} onChange={e => setCashReceived(e.target.value)}
                      placeholder={total.toString()}
                      style={{ width: '100%', padding: '12px', border: '2px solid #c8e0ff', borderRadius: '8px', fontSize: '20px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center', color: '#333' }} />
                    <button onClick={() => setCashReceived(String(total))}
                      style={{ marginTop: '8px', padding: '6px 14px', background: '#e3f0ff', border: '1px solid #c8e0ff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#0f4c81', fontWeight: '600' }}>
                      Full: Rs. {total.toLocaleString()}
                    </button>
                    {cashReceived && cashReceivedNum < total && cashReceivedNum >= 0 && (
                      <div style={{ marginTop: '10px', padding: '10px', background: '#ffebee', borderRadius: '8px', border: '1px solid #ffcdd2' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: '#c62828', fontWeight: '600' }}>Credit Portion</span>
                          <span style={{ fontSize: '14px', fontWeight: '700', color: '#c62828' }}>Rs. {(total - cashReceivedNum).toLocaleString()}</span>
                        </div>
                        <p style={{ fontSize: '11px', color: '#e57373', margin: '4px 0 0' }}>Will be added to customer balance</p>
                      </div>
                    )}
                    {cashReceived && cashReceivedNum >= total && (
                      <div style={{ marginTop: '10px', padding: '8px 10px', background: '#e8f5e9', borderRadius: '8px' }}>
                        <p style={{ fontSize: '12px', color: '#1a7a4a', fontWeight: '600', margin: 0 }}>✅ Full payment received</p>
                      </div>
                    )}
                  </div>
                )}
                {paymentMethod === 'jazzcash' && (
                  <div style={{ marginTop: '10px', padding: '10px', background: '#fff3e0', borderRadius: '8px' }}>
                    <p style={{ fontSize: '12px', color: '#e65100', margin: 0 }}>⚠️ JazzCash goes to office — admin will confirm payment.</p>
                  </div>
                )}
              </div>

              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <p style={{ fontSize: '16px', color: '#555', margin: 0 }}>Total</p>
                  <p style={{ fontSize: '28px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {total.toLocaleString()}</p>
                </div>
                {!isOnline && (
                  <p style={{ fontSize: '12px', color: '#ea580c', margin: '0 0 10px', textAlign: 'center' }}>📵 Will save offline</p>
                )}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => { setStep(1); setSelectedCustomer(null); if (onClearPreSelected) onClearPreSelected() }}
                    style={{ flex: 1, padding: '14px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                    ← Back
                  </button>
                  <button onClick={completeSale} disabled={saving}
                    style={{ flex: 2, padding: '14px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
                    {saving ? 'Saving...' : '✓ Complete Sale'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}