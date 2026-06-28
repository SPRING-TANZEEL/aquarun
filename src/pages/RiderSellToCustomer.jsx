import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { getCustomersOffline, savePendingDelivery, savePendingPayment, savePendingQuickSale, updateCustomerBalanceOffline } from '../offlineDB'

const RATES = [90, 100, 110, 120, 150, 160, 170, 180]

export default function RiderSellToCustomer({ rider, preSelectedCustomer, onClearPreSelected, isOnline, dbReady }) {
  const [mode, setMode] = useState(null)
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [saleMode, setSaleMode] = useState(null)

  const [qty19l, setQty19l] = useState(1)
  const [qtyHalf, setQtyHalf] = useState(0)
  const [qty15l, setQty15l] = useState(0)
  const [selectedRate, setSelectedRate] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState(null)
  const [cashReceived, setCashReceived] = useState('')

  const [paymentAmount, setPaymentAmount] = useState('')

  const [walkInRate, setWalkInRate] = useState(null)
  const [walkInQty, setWalkInQty] = useState(1)
  const [walkInPayment, setWalkInPayment] = useState(null)
  const [walkInCash, setWalkInCash] = useState('')

  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    if (preSelectedCustomer) {
      selectCustomer(preSelectedCustomer)
      if (onClearPreSelected) onClearPreSelected()
    }
  }, [preSelectedCustomer])

  async function searchCustomer(val) {
    setSearch(val)
    if (val.length < 2) { setCustomers([]); return }
    setSearching(true)

    try {
      if (isOnline) {
        const { data } = await supabase.from('customers')
          .select('*').eq('is_active', true)
          .or(`full_name.ilike.%${val}%,mobile.ilike.%${val}%,customer_code.ilike.%${val}%`)
          .limit(6)
        setCustomers(data || [])
      } else {
        // Search from offline storage
        const offlineCustomers = await getCustomersOffline()
        const filtered = offlineCustomers.filter(c =>
          c.is_active && (
            c.full_name?.toLowerCase().includes(val.toLowerCase()) ||
            c.mobile?.includes(val) ||
            c.customer_code?.toLowerCase().includes(val.toLowerCase())
          )
        ).slice(0, 6)
        setCustomers(filtered)
      }
    } catch (err) {
      console.error('Search error:', err)
      setCustomers([])
    }

    setSearching(false)
  }

  function selectCustomer(c) {
    setSelectedCustomer(c)
    setSelectedRate(c.rate_19l)
    setCustomers([])
    setSearch('')
    setSuccess(null)
    setSaleMode(null)
    setCashReceived('')
    setPaymentAmount('')
    setMode('search')
  }

  function resetAll() {
    setMode(null)
    setSelectedCustomer(null)
    setSaleMode(null)
    setQty19l(1)
    setQtyHalf(0)
    setQty15l(0)
    setSelectedRate(null)
    setPaymentMethod(null)
    setCashReceived('')
    setPaymentAmount('')
    setWalkInRate(null)
    setWalkInQty(1)
    setWalkInPayment(null)
    setWalkInCash('')
    setSearch('')
    setCustomers([])
  }

  function totalSaleAmount() {
    return (qty19l * (selectedRate || 0)) +
      (qtyHalf * (selectedCustomer?.rate_half_litre || 0)) +
      (qty15l * (selectedCustomer?.rate_1_5l || 0))
  }

  function walkInTotal() {
    return walkInQty * (walkInRate || 0)
  }

  async function postSale() {
    if (!paymentMethod) return alert('Please select payment method')
    if (qty19l === 0 && qtyHalf === 0 && qty15l === 0) return alert('Please enter at least one bottle')
    if (qty19l > 0 && !selectedRate) return alert('Please select rate for 19L')

    const total = totalSaleAmount()
    if (paymentMethod === 'cash') {
      const received = Number(cashReceived)
      if (!cashReceived || received < 0) return alert('Please enter cash received amount')
      if (received > total) return alert('Cash received cannot be more than total Rs. ' + total.toLocaleString())
    }

    setSaving(true)
    const isJazz = paymentMethod === 'jazzcash'
    const isCredit = paymentMethod === 'credit'
    const isCash = paymentMethod === 'cash'
    const received = isCash ? Number(cashReceived) : 0
    const creditPortion = isCredit ? total : isCash ? (total - received) : 0
    const now = new Date().toISOString()

    const deliveryData = {
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
      is_voided: false
    }

    if (isOnline) {
      const { error } = await supabase.from('deliveries').insert([deliveryData])
      if (error) { alert('Error: ' + error.message); setSaving(false); return }
      if (creditPortion > 0) {
        const newBalance = Number(selectedCustomer.balance) + creditPortion
        await supabase.from('customers').update({ balance: newBalance }).eq('id', selectedCustomer.id)
      }
    } else {
      await savePendingDelivery(deliveryData)
      if (creditPortion > 0) {
        const newBalance = Number(selectedCustomer.balance) + creditPortion
        await updateCustomerBalanceOffline(selectedCustomer.id, newBalance)
      }
    }

    setSuccess({
      type: 'sale', customer: selectedCustomer.full_name,
      total, received, creditPortion, paymentMethod,
      savedOffline: !isOnline
    })
    resetAll()
    setSaving(false)
  }

  async function postPayment() {
    if (!paymentMethod) return alert('Please select payment method')
    if (!paymentAmount || Number(paymentAmount) <= 0) return alert('Please enter amount')

    const amount = Number(paymentAmount)
    const isJazz = paymentMethod === 'jazzcash'
    setSaving(true)

    const paymentData = {
      customer_id: selectedCustomer.id,
      rider_id: rider.id,
      amount,
      payment_method: paymentMethod,
      payment_date: new Date().toISOString().split('T')[0],
      notes: isJazz ? 'JazzCash — pending admin confirmation' : 'Cash received by rider',
      jazzcash_confirmed: isJazz ? false : true,
      is_voided: false
    }

    if (isOnline) {
      const { error } = await supabase.from('payments').insert([paymentData])
      if (error) { alert('Error: ' + error.message); setSaving(false); return }
      if (!isJazz) {
        await supabase.from('customers').update({
          balance: Number(selectedCustomer.balance) - amount
        }).eq('id', selectedCustomer.id)
      }
    } else {
      await savePendingPayment(paymentData)
      if (!isJazz) {
        const newBalance = Number(selectedCustomer.balance) - amount
        await updateCustomerBalanceOffline(selectedCustomer.id, newBalance)
      }
    }

    setSuccess({
      type: 'payment', customer: selectedCustomer.full_name,
      amount, paymentMethod,
      note: isJazz ? 'Balance reduces after admin confirms.' : 'Balance reduced immediately.',
      savedOffline: !isOnline
    })
    resetAll()
    setSaving(false)
  }

  async function postWalkIn() {
    if (!walkInRate) return alert('Please select rate')
    if (walkInQty <= 0) return alert('Please enter quantity')
    if (!walkInPayment) return alert('Please select payment method')

    const total = walkInTotal()
    if (walkInPayment === 'cash') {
      const cash = Number(walkInCash)
      if (!walkInCash || cash < 0) return alert('Please enter cash received')
      if (cash > total) return alert('Cash cannot exceed total Rs. ' + total.toLocaleString())
    }

    setSaving(true)
    const isCash = walkInPayment === 'cash'
    const isJazz = walkInPayment === 'jazzcash'
    const received = isCash ? Number(walkInCash) : total
    const credit = isCash ? (total - received) : 0
    const now = new Date().toISOString()

    const saleData = {
      customer_id: null,
      rider_id: rider.id,
      qty_19l: walkInQty,
      qty_half_litre: 0,
      qty_1_5l: 0,
      rate_applied: walkInRate,
      total_amount: total,
      payment_method: walkInPayment,
      amount_received: isJazz ? 0 : received,
      credit_amount: credit,
      jazzcash_confirmed: false,
      delivered_at: now,
      is_voided: false
    }

    if (isOnline) {
      const { error } = await supabase.from('deliveries').insert([saleData])
      if (error) { alert('Error: ' + error.message); setSaving(false); return }
    } else {
      await savePendingQuickSale(saleData)
    }

    setSuccess({
      type: 'walkin', total, received, credit,
      paymentMethod: walkInPayment, qty: walkInQty, rate: walkInRate,
      savedOffline: !isOnline
    })
    resetAll()
    setSaving(false)
  }

  function numBtn(val, setVal, min = 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button onClick={() => setVal(Math.max(min, val - 1))}
          style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #ddd', background: '#f5f5f5', fontSize: '18px', cursor: 'pointer' }}>−</button>
        <span style={{ fontSize: '22px', fontWeight: '700', minWidth: '30px', textAlign: 'center' }}>{val}</span>
        <button onClick={() => setVal(val + 1)}
          style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #0f4c81', background: '#0f4c81', color: 'white', fontSize: '18px', cursor: 'pointer' }}>+</button>
      </div>
    )
  }

  const total = totalSaleAmount()
  const cashReceivedNum = Number(cashReceived) || 0
  const wTotal = walkInTotal()
  const wCashNum = Number(walkInCash) || 0

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>👤 Customer & Sales</h2>

      {/* Offline Notice */}
      {!isOnline && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
          <p style={{ fontSize: '12px', color: '#ea580c', fontWeight: '600', margin: 0 }}>
            📵 Offline — entries will sync when internet is available
          </p>
        </div>
      )}

      {/* Success */}
      {success && (
        <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
          <p style={{ fontWeight: '700', color: '#1b5e20', marginBottom: '4px' }}>
            {success.type === 'walkin' ? '✅ Walk-in Sale Posted!' : success.type === 'sale' ? '✅ Sale Posted!' : '✅ Payment Recorded!'}
          </p>
          {success.type === 'walkin' ? (
            <div>
              <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>19L × {success.qty} @ Rs. {success.rate} = Rs. {success.total.toLocaleString()}</p>
              {success.received > 0 && <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>Cash: Rs. {success.received.toLocaleString()}</p>}
              {success.credit > 0 && <p style={{ fontSize: '13px', color: '#f44336', margin: 0 }}>Unpaid: Rs. {success.credit.toLocaleString()}</p>}
            </div>
          ) : success.type === 'sale' ? (
            <div>
              <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>{success.customer} — Rs. {success.total.toLocaleString()}</p>
              {success.received > 0 && <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>Cash: Rs. {success.received.toLocaleString()}</p>}
              {success.creditPortion > 0 && <p style={{ fontSize: '13px', color: '#f44336', margin: 0 }}>Credit: Rs. {success.creditPortion.toLocaleString()}</p>}
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>{success.customer} — Rs. {success.amount.toLocaleString()} — {success.paymentMethod}</p>
              {success.note && <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>{success.note}</p>}
            </div>
          )}
          {success.savedOffline && (
            <p style={{ fontSize: '12px', color: '#ea580c', margin: '6px 0 0', fontWeight: '600' }}>
              📵 Saved offline — will sync when internet returns
            </p>
          )}
          <button onClick={() => setSuccess(null)}
            style={{ marginTop: '8px', padding: '4px 12px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '12px' }}>
            New
          </button>
        </div>
      )}

      {/* Mode Selection */}
      {!mode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button onClick={() => setMode('search')}
            style={{ padding: '20px', border: '2px solid #e3f0ff', borderRadius: '14px', cursor: 'pointer', background: '#f0f7ff', display: 'flex', alignItems: 'center', gap: '16px', textAlign: 'left' }}>
            <span style={{ fontSize: '36px' }}>👤</span>
            <div>
              <p style={{ fontSize: '16px', fontWeight: '700', color: '#0f4c81', margin: '0 0 4px' }}>Customer Sale / Payment</p>
              <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Search registered customer, sell bottles or collect balance</p>
            </div>
          </button>
          <button onClick={() => setMode('walkin')}
            style={{ padding: '20px', border: '2px solid #e8f5e9', borderRadius: '14px', cursor: 'pointer', background: '#f0fff4', display: 'flex', alignItems: 'center', gap: '16px', textAlign: 'left' }}>
            <span style={{ fontSize: '36px' }}>⚡</span>
            <div>
              <p style={{ fontSize: '16px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 4px' }}>Walk-in / Quick Sale</p>
              <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Sell 19L bottles to unregistered walk-in customer</p>
            </div>
          </button>
        </div>
      )}

      {/* Customer Search */}
      {mode === 'search' && !selectedCustomer && (
        <div>
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', color: '#555', marginBottom: '8px', fontWeight: '600' }}>
              Search Customer {!isOnline ? '(Offline)' : ''}
            </p>
            <input value={search} onChange={e => searchCustomer(e.target.value)}
              placeholder="Type name, mobile, or ID..."
              style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }} />
            {searching && <p style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>Searching...</p>}
            {!isOnline && search.length < 2 && (
              <p style={{ fontSize: '11px', color: '#ea580c', marginTop: '6px' }}>📵 Searching from downloaded data — type at least 2 characters</p>
            )}
            {customers.map(c => (
              <div key={c.id} onClick={() => selectCustomer(c)}
                style={{ padding: '12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontWeight: '600', fontSize: '14px', margin: '0 0 2px' }}>{c.full_name}</p>
                  <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>{c.mobile} · {c.customer_code}</p>
                </div>
                <p style={{ fontSize: '13px', color: Number(c.balance) > 0 ? '#f44336' : '#4caf50', fontWeight: '700', margin: 0 }}>
                  Rs. {Math.abs(Number(c.balance)).toLocaleString()}
                </p>
              </div>
            ))}
            {search.length >= 2 && customers.length === 0 && !searching && (
              <p style={{ fontSize: '12px', color: '#888', textAlign: 'center', padding: '12px 0' }}>
                {isOnline ? 'No customers found' : 'Not found in offline data — try different spelling'}
              </p>
            )}
          </div>
          <button onClick={resetAll}
            style={{ width: '100%', padding: '12px', background: '#f5f5f5', color: '#888', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px' }}>
            ← Back
          </button>
        </div>
      )}

      {/* Customer Selected */}
      {mode === 'search' && selectedCustomer && (
        <div>
          <div style={{ background: '#0f4c81', color: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: '700', fontSize: '16px', margin: '0 0 2px' }}>{selectedCustomer.full_name}</p>
              <p style={{ fontSize: '12px', opacity: 0.8, margin: 0 }}>{selectedCustomer.mobile} · {selectedCustomer.customer_code}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '11px', opacity: 0.7, margin: '0 0 2px' }}>
                {Number(selectedCustomer.balance) < 0 ? 'Advance Credit' : 'Outstanding'}
              </p>
              <p style={{ fontSize: '20px', fontWeight: '700', margin: 0, color: Number(selectedCustomer.balance) > 0 ? '#ffcdd2' : '#c8e6c9' }}>
                Rs. {Math.abs(Number(selectedCustomer.balance)).toLocaleString()}
              </p>
            </div>
          </div>

          {!saleMode && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>What do you want to do?</p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setSaleMode('sale')}
                  style={{ flex: 1, padding: '20px', border: '2px solid #e3f0ff', borderRadius: '12px', cursor: 'pointer', background: '#f0f7ff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '32px' }}>🍶</span>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f4c81' }}>Deliver Bottles</span>
                </button>
                <button onClick={() => setSaleMode('payment')}
                  style={{ flex: 1, padding: '20px', border: '2px solid #e8f5e9', borderRadius: '12px', cursor: 'pointer', background: '#f0fff4', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '32px' }}>💵</span>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a' }}>Receive Payment</span>
                </button>
              </div>
              <button onClick={resetAll}
                style={{ width: '100%', marginTop: '12px', padding: '10px', background: '#f5f5f5', color: '#888', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                ← Search Again
              </button>
            </div>
          )}

          {/* Sell Bottles */}
          {saleMode === 'sale' && (
            <div>
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '14px' }}>Bottles</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>19 Litre</p>
                    <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Rate: Rs. {selectedRate}</p>
                  </div>
                  {numBtn(qty19l, setQty19l, 0)}
                </div>
                {selectedCustomer.rate_half_litre > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>Half Litre</p>
                      <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Rate: Rs. {selectedCustomer.rate_half_litre}</p>
                    </div>
                    {numBtn(qtyHalf, setQtyHalf, 0)}
                  </div>
                )}
                {selectedCustomer.rate_1_5l > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>1.5 Litre</p>
                      <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Rate: Rs. {selectedCustomer.rate_1_5l}</p>
                    </div>
                    {numBtn(qty15l, setQty15l, 0)}
                  </div>
                )}
              </div>

              {qty19l > 0 && (
                <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>Rate — 19L</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {RATES.map(r => (
                      <button key={r} onClick={() => setSelectedRate(r)}
                        style={{ padding: '10px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: selectedRate === r ? '#0f4c81' : '#f0f0f0', color: selectedRate === r ? 'white' : '#333', fontWeight: '700', fontSize: '14px' }}>
                        Rs. {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>Payment Method</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { key: 'cash', label: 'نقد', sub: 'Cash', color: '#1a7a4a' },
                    { key: 'jazzcash', label: 'جیز کیش', sub: 'JazzCash', color: '#9c27b0' },
                    { key: 'credit', label: 'ادھار', sub: 'Credit', color: '#f44336' },
                  ].map(pm => (
                    <button key={pm.key} onClick={() => { setPaymentMethod(pm.key); setCashReceived('') }}
                      style={{ flex: 1, padding: '12px 6px', border: '2px solid', borderColor: paymentMethod === pm.key ? pm.color : '#eee', borderRadius: '10px', cursor: 'pointer', background: paymentMethod === pm.key ? pm.color : 'white', color: paymentMethod === pm.key ? 'white' : '#555', fontWeight: '700', fontSize: '13px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <span>{pm.label}</span>
                      <span style={{ fontSize: '10px', opacity: 0.8 }}>{pm.sub}</span>
                    </button>
                  ))}
                </div>

                {paymentMethod === 'cash' && total > 0 && (
                  <div style={{ marginTop: '14px', background: '#f0f7ff', borderRadius: '10px', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{ fontSize: '13px', color: '#555' }}>Total Amount</span>
                      <span style={{ fontSize: '15px', fontWeight: '700', color: '#0f4c81' }}>Rs. {total.toLocaleString()}</span>
                    </div>
                    <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>Cash Received</label>
                    <input type="number" value={cashReceived} onChange={e => setCashReceived(e.target.value)}
                      placeholder={total.toString()}
                      style={{ width: '100%', padding: '12px', border: '2px solid #c8e0ff', borderRadius: '8px', fontSize: '20px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }} />
                    <button onClick={() => setCashReceived(String(total))}
                      style={{ marginTop: '8px', padding: '6px 14px', background: '#e3f0ff', border: '1px solid #c8e0ff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#0f4c81', fontWeight: '600' }}>
                      Full: Rs. {total.toLocaleString()}
                    </button>
                    {cashReceived && cashReceivedNum < total && cashReceivedNum >= 0 && (
                      <div style={{ marginTop: '10px', padding: '10px', background: '#ffebee', borderRadius: '8px', border: '1px solid #ffcdd2' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: '#c62828', fontWeight: '600' }}>Remaining on Credit</span>
                          <span style={{ fontSize: '14px', fontWeight: '700', color: '#c62828' }}>Rs. {(total - cashReceivedNum).toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                    {cashReceived && cashReceivedNum >= total && (
                      <div style={{ marginTop: '10px', padding: '8px 10px', background: '#e8f5e9', borderRadius: '8px' }}>
                        <p style={{ fontSize: '12px', color: '#1a7a4a', fontWeight: '600', margin: 0 }}>✅ Full payment — no credit</p>
                      </div>
                    )}
                  </div>
                )}
                {paymentMethod === 'jazzcash' && (
                  <div style={{ marginTop: '10px', padding: '10px', background: '#fff3e0', borderRadius: '8px' }}>
                    <p style={{ fontSize: '12px', color: '#e65100', margin: 0 }}>⚠️ JazzCash goes directly to office. Admin confirms.</p>
                  </div>
                )}
              </div>

              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <p style={{ fontSize: '16px', color: '#555', margin: 0 }}>Total</p>
                  <p style={{ fontSize: '28px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {total.toLocaleString()}</p>
                </div>
                {!isOnline && <p style={{ fontSize: '11px', color: '#ea580c', textAlign: 'center', margin: '0 0 10px' }}>📵 Will save offline and sync later</p>}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setSaleMode(null)}
                    style={{ flex: 1, padding: '14px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px' }}>
                    ← Back
                  </button>
                  <button onClick={postSale} disabled={saving}
                    style={{ flex: 2, padding: '14px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
                    {saving ? 'Saving...' : '✓ محفوظ کریں'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Receive Payment */}
          {saleMode === 'payment' && (
            <div>
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>Amount Received (Rs.)</p>
                <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                  placeholder="0"
                  style={{ width: '100%', padding: '14px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '28px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center', marginBottom: '8px' }} />
                {Number(selectedCustomer.balance) > 0 && (
                  <button onClick={() => setPaymentAmount(String(selectedCustomer.balance))}
                    style={{ padding: '6px 12px', background: '#f0f4ff', border: '1px solid #d0d9ff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#0f4c81', fontWeight: '600' }}>
                    Full Balance: Rs. {Number(selectedCustomer.balance).toLocaleString()}
                  </button>
                )}
              </div>

              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>Payment Method</p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {[
                    { key: 'cash', label: 'نقد', sub: 'Cash', color: '#1a7a4a' },
                    { key: 'jazzcash', label: 'جیز کیش', sub: 'JazzCash', color: '#9c27b0' },
                  ].map(pm => (
                    <button key={pm.key} onClick={() => setPaymentMethod(pm.key)}
                      style={{ flex: 1, padding: '16px 8px', border: '2px solid', borderColor: paymentMethod === pm.key ? pm.color : '#eee', borderRadius: '10px', cursor: 'pointer', background: paymentMethod === pm.key ? pm.color : 'white', color: paymentMethod === pm.key ? 'white' : '#555', fontWeight: '700', fontSize: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <span>{pm.label}</span>
                      <span style={{ fontSize: '11px', opacity: 0.8 }}>{pm.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {!isOnline && <p style={{ fontSize: '11px', color: '#ea580c', textAlign: 'center', margin: '0 0 10px' }}>📵 Will save offline and sync later</p>}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setSaleMode(null)}
                  style={{ flex: 1, padding: '14px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px' }}>
                  ← Back
                </button>
                <button onClick={postPayment} disabled={saving}
                  style={{ flex: 2, padding: '14px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
                  {saving ? 'Saving...' : '✓ محفوظ کریں'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Walk-in Mode */}
      {mode === 'walkin' && (
        <div>
          <div style={{ background: '#1a7a4a', color: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: '700', fontSize: '16px', margin: '0 0 2px' }}>⚡ Walk-in Customer</p>
              <p style={{ fontSize: '12px', opacity: 0.8, margin: 0 }}>Quick sale — cash or JazzCash only</p>
            </div>
            <button onClick={resetAll}
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px' }}>
              ← Back
            </button>
          </div>

          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>Rate per 19L Bottle</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {RATES.map(r => (
                <button key={r} onClick={() => setWalkInRate(r)}
                  style={{ padding: '12px 18px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: walkInRate === r ? '#1a7a4a' : '#f0f0f0', color: walkInRate === r ? 'white' : '#333', fontWeight: '700', fontSize: '15px' }}>
                  Rs. {r}
                </button>
              ))}
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '14px' }}>Quantity — 19L Bottles</p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {numBtn(walkInQty, setWalkInQty, 1)}
            </div>
            {walkInRate && (
              <p style={{ textAlign: 'center', fontSize: '20px', fontWeight: '700', color: '#0f4c81', marginTop: '12px' }}>
                Rs. {wTotal.toLocaleString()}
              </p>
            )}
          </div>

          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>Payment Method</p>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
              {[
                { key: 'cash', label: 'نقد', sub: 'Cash', color: '#1a7a4a' },
                { key: 'jazzcash', label: 'جیز کیش', sub: 'JazzCash', color: '#9c27b0' },
              ].map(pm => (
                <button key={pm.key} onClick={() => { setWalkInPayment(pm.key); setWalkInCash('') }}
                  style={{ flex: 1, padding: '16px 8px', border: '2px solid', borderColor: walkInPayment === pm.key ? pm.color : '#eee', borderRadius: '10px', cursor: 'pointer', background: walkInPayment === pm.key ? pm.color : 'white', color: walkInPayment === pm.key ? 'white' : '#555', fontWeight: '700', fontSize: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <span>{pm.label}</span>
                  <span style={{ fontSize: '11px', opacity: 0.8 }}>{pm.sub}</span>
                </button>
              ))}
            </div>

            {walkInPayment === 'cash' && wTotal > 0 && (
              <div style={{ background: '#f0f7ff', borderRadius: '10px', padding: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', color: '#555' }}>Total Amount</span>
                  <span style={{ fontSize: '15px', fontWeight: '700', color: '#0f4c81' }}>Rs. {wTotal.toLocaleString()}</span>
                </div>
                <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>Cash Received</label>
                <input type="number" value={walkInCash} onChange={e => setWalkInCash(e.target.value)}
                  placeholder={wTotal.toString()}
                  style={{ width: '100%', padding: '12px', border: '2px solid #c8e0ff', borderRadius: '8px', fontSize: '20px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }} />
                <button onClick={() => setWalkInCash(String(wTotal))}
                  style={{ marginTop: '8px', padding: '6px 14px', background: '#e3f0ff', border: '1px solid #c8e0ff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#0f4c81', fontWeight: '600' }}>
                  Full: Rs. {wTotal.toLocaleString()}
                </button>
                {walkInCash && wCashNum < wTotal && wCashNum >= 0 && (
                  <div style={{ marginTop: '10px', padding: '10px', background: '#ffebee', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', color: '#c62828', fontWeight: '600' }}>Unpaid</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#c62828' }}>Rs. {(wTotal - wCashNum).toLocaleString()}</span>
                    </div>
                  </div>
                )}
                {walkInCash && wCashNum >= wTotal && (
                  <div style={{ marginTop: '10px', padding: '8px 10px', background: '#e8f5e9', borderRadius: '8px' }}>
                    <p style={{ fontSize: '12px', color: '#1a7a4a', fontWeight: '600', margin: 0 }}>✅ Full payment received</p>
                  </div>
                )}
              </div>
            )}
            {walkInPayment === 'jazzcash' && (
              <div style={{ padding: '10px', background: '#fff3e0', borderRadius: '8px' }}>
                <p style={{ fontSize: '12px', color: '#e65100', margin: 0 }}>⚠️ JazzCash goes directly to office. Admin confirms.</p>
              </div>
            )}
          </div>

          {!isOnline && <p style={{ fontSize: '11px', color: '#ea580c', textAlign: 'center', margin: '0 0 10px' }}>📵 Will save offline and sync later</p>}
          <button onClick={postWalkIn} disabled={saving}
            style={{ width: '100%', padding: '16px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
            {saving ? 'Saving...' : '✓ Post Walk-in Sale'}
          </button>
        </div>
      )}
    </div>
  )
}