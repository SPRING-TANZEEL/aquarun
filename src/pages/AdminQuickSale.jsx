import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const RATES_19L = [90, 100, 110, 120, 150, 160, 170, 180]

export default function AdminQuickSale({ tenantId }) {
  const [mode, setMode] = useState('sale') // 'sale' or 'payment'
  const [extraProducts, setExtraProducts] = useState([])
  const [extraQuantities, setExtraQuantities] = useState({})
  const [extraRates, setExtraRates] = useState({})
  const [qty19l, setQty19l] = useState(1)
  const [rate19l, setRate19l] = useState(null)
  const [qtyHalf, setQtyHalf] = useState(0)
  const [rateHalf, setRateHalf] = useState(0)
  const [qty15l, setQty15l] = useState(0)
  const [rate15l, setRate15l] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [notes, setNotes] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  // Payment receipt state
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethodReceipt, setPaymentMethodReceipt] = useState('cash')
  const [paymentSearch, setPaymentSearch] = useState('')
  const [paymentSearchResults, setPaymentSearchResults] = useState([])
  const [paymentCustomer, setPaymentCustomer] = useState(null)
  const [paymentNotes, setPaymentNotes] = useState('')

  useEffect(() => {
    if (tenantId) fetchExtraProducts()
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [tenantId])

  async function fetchExtraProducts() {
    const { data } = await supabase.from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .eq('is_saleable', true)
      .not('name', 'ilike', '%19%')
      .not('name', 'ilike', '%half%')
      .not('name', 'ilike', '%1.5%')
      .order('name')
    setExtraProducts(data || [])
    const q = {}; const r = {}
    data?.forEach(p => { q[p.id] = 0; r[p.id] = Number(p.sale_price) || 0 })
    setExtraQuantities(q); setExtraRates(r)
  }

  async function searchCustomer(val) {
    setCustomerSearch(val)
    if (val.length < 2) { setCustomerResults([]); return }
    const { data } = await supabase.from('customers').select('*')
      .eq('tenant_id', tenantId).eq('is_active', true)
      .or(`full_name.ilike.%${val}%,mobile.ilike.%${val}%,customer_code.ilike.%${val}%`).limit(5)
    setCustomerResults(data || [])
  }

  async function searchPaymentCustomer(val) {
    setPaymentSearch(val)
    if (val.length < 2) { setPaymentSearchResults([]); return }
    const { data } = await supabase.from('customers').select('*')
      .eq('tenant_id', tenantId).eq('is_active', true)
      .or(`full_name.ilike.%${val}%,mobile.ilike.%${val}%,customer_code.ilike.%${val}%`).limit(5)
    setPaymentSearchResults(data || [])
  }

  function selectCustomer(c) {
    setSelectedCustomer(c)
    setCustomerResults([])
    setCustomerName('')
    if (c.rate_19l) setRate19l(Number(c.rate_19l))
    if (c.rate_half_litre) setRateHalf(Number(c.rate_half_litre))
    if (c.rate_1_5l) setRate15l(Number(c.rate_1_5l))
  }

  const extraTotal = extraProducts.reduce((s, p) => s + (extraQuantities[p.id] || 0) * (extraRates[p.id] || 0), 0)
  const total = (qty19l * (rate19l || 0)) + (qtyHalf * rateHalf) + (qty15l * rate15l) + extraTotal

  // ── RECEIVE PAYMENT ─────────────────────────────────────────────
  async function receivePayment() {
    if (!paymentCustomer) return alert('Please select a customer')
    if (!paymentAmount || Number(paymentAmount) <= 0) return alert('Please enter payment amount')
    setSaving(true)

    const amount = Number(paymentAmount)
    const isJazz = paymentMethodReceipt === 'jazzcash'

    // Save to payments table
    const { data: savedPayment, error } = await supabase.from('payments').insert([{
      tenant_id: tenantId,
      customer_id: paymentCustomer.id,
      amount,
      payment_method: paymentMethodReceipt,
      payment_date: new Date().toISOString().split('T')[0],
      jazzcash_confirmed: !isJazz, // cash is auto-confirmed, jazz needs confirmation
      notes: paymentNotes || `Payment received from ${paymentCustomer.full_name}`,
      is_voided: false
    }]).select().single()

    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    // Update customer balance — reduce by payment amount
    if (!isJazz) {
      const newBalance = Number(paymentCustomer.balance || 0) - amount
      await supabase.from('customers')
        .update({ balance: newBalance })
        .eq('id', paymentCustomer.id)
        .eq('tenant_id', tenantId)
    }

    // Post journal entry
    // Cash payment: DR Cash in Hand (1001), CR Accounts Receivable (1100)
    // JazzCash: DR JazzCash Account (1002), CR Accounts Receivable (1100) — only after confirmation
    try {
      const cashAccount = isJazz
        ? { code: '1002', name: 'JazzCash Account' }
        : { code: '1001', name: 'Cash in Hand' }

      if (!isJazz) {
        const { data: je } = await supabase.from('journal_entries').insert([{
          tenant_id: tenantId,
          entry_date: new Date().toISOString().split('T')[0],
          reference_type: 'payment',
          reference_id: savedPayment.id,
          narration: `Payment received — ${paymentCustomer.full_name} — ${paymentMethodReceipt}`,
          total_amount: amount,
          created_by: 'admin'
        }]).select().single()

        if (je) {
          await supabase.from('journal_entry_lines').insert([
            { tenant_id: tenantId, journal_entry_id: je.id, account_code: cashAccount.code, account_name: cashAccount.name, debit: amount, credit: 0 },
            { tenant_id: tenantId, journal_entry_id: je.id, account_code: '1100', account_name: 'Accounts Receivable', debit: 0, credit: amount }
          ])
        }
      }
    } catch (err) { console.error('Journal error:', err) }

    setSuccess({
      type: 'payment',
      name: paymentCustomer.full_name,
      amount,
      method: paymentMethodReceipt,
      newBalance: !isJazz ? Number(paymentCustomer.balance || 0) - amount : paymentCustomer.balance,
      jazzPending: isJazz
    })

    setPaymentCustomer(null)
    setPaymentSearch('')
    setPaymentAmount('')
    setPaymentNotes('')
    setSaving(false)
  }

  // ── POST SALE ───────────────────────────────────────────────────
  async function postSale() {
    if (qty19l === 0 && qtyHalf === 0 && qty15l === 0 && !extraProducts.some(p => extraQuantities[p.id] > 0))
      return alert('Please enter at least one item')
    if (qty19l > 0 && !rate19l) return alert('Please select rate for 19L bottle')
    if (paymentMethod === 'credit' && !selectedCustomer) return alert('Please select a customer for credit sale')

    setSaving(true)
    const walkinName = selectedCustomer?.full_name || customerName || 'Walk-in Customer'

    const descParts = []
    if (qty19l > 0) descParts.push(`19L×${qty19l}@Rs.${rate19l}`)
    if (qtyHalf > 0) descParts.push(`Half×${qtyHalf}@Rs.${rateHalf}`)
    if (qty15l > 0) descParts.push(`1.5L×${qty15l}@Rs.${rate15l}`)
    extraProducts.filter(p => (extraQuantities[p.id] || 0) > 0).forEach(p => {
      descParts.push(`${p.name}×${extraQuantities[p.id]}@Rs.${extraRates[p.id]}`)
    })

    const deliveryData = {
      tenant_id: tenantId,
      customer_id: selectedCustomer?.id || null,
      rider_id: null,
      qty_19l: qty19l,
      qty_half_litre: qtyHalf,
      qty_1_5l: qty15l,
      rate_applied: rate19l || 0,
      total_amount: total,
      payment_method: paymentMethod,
      amount_received: paymentMethod === 'credit' ? 0 : paymentMethod === 'jazzcash' ? 0 : total,
      credit_amount: paymentMethod === 'credit' ? total : 0,
      jazzcash_confirmed: false,
      delivered_at: new Date().toISOString(),
      is_voided: false,
      notes: [walkinName !== 'Walk-in Customer' ? `Customer: ${walkinName}` : '', descParts.join(' | '), notes].filter(Boolean).join(' — ')
    }

    const { data: savedDelivery, error } = await supabase
      .from('deliveries').insert([deliveryData]).select().single()
    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    // ✅ COGS posting for finished goods (extra products)
    const soldFinishedGoods = extraProducts.filter(p =>
      (extraQuantities[p.id] || 0) > 0 && p.product_type === 'finished_good'
    )

    for (const p of soldFinishedGoods) {
      const qtySold = extraQuantities[p.id]
      const avgCost = Number(p.average_cost || p.purchase_price || 0)
      const cogsCost = qtySold * avgCost

      // Reduce stock
      await supabase.from('products')
        .update({ current_stock: Math.max(0, Number(p.current_stock || 0) - qtySold) })
        .eq('id', p.id).eq('tenant_id', tenantId)

      // Post COGS journal entry
      if (cogsCost > 0) {
        try {
          const { data: je } = await supabase.from('journal_entries').insert([{
            tenant_id: tenantId,
            entry_date: new Date().toISOString().split('T')[0],
            reference_type: 'cogs',
            reference_id: savedDelivery.id,
            narration: `COGS — ${p.name} × ${qtySold} sold`,
            total_amount: cogsCost,
            created_by: 'admin'
          }]).select().single()

          if (je) {
            await supabase.from('journal_entry_lines').insert([
              { tenant_id: tenantId, journal_entry_id: je.id, account_code: '5003', account_name: 'Cost of Goods Sold', debit: cogsCost, credit: 0 },
              { tenant_id: tenantId, journal_entry_id: je.id, account_code: '1201', account_name: 'Inventory - Finished Goods', debit: 0, credit: cogsCost }
            ])
          }
        } catch (err) { console.error('COGS journal error:', err) }
      }
    }

    // Reduce stock for trading items
    for (const p of extraProducts.filter(p => (extraQuantities[p.id] || 0) > 0 && p.product_type !== 'finished_good')) {
      await supabase.from('products')
        .update({ current_stock: Math.max(0, Number(p.current_stock || 0) - extraQuantities[p.id]) })
        .eq('id', p.id).eq('tenant_id', tenantId)
    }

    if (paymentMethod === 'credit' && selectedCustomer) {
      await supabase.from('customers')
        .update({ balance: Number(selectedCustomer.balance || 0) + total })
        .eq('id', selectedCustomer.id).eq('tenant_id', tenantId)
    }

    try {
      const { postDeliveryJournal } = await import('../accountingEngine')
      await postDeliveryJournal(savedDelivery, selectedCustomer?.id || null, tenantId)
    } catch (err) { console.error('Journal post error:', err) }

    setSuccess({ type: 'sale', total, paymentMethod, name: walkinName, desc: descParts.join(', ') })
    setQty19l(1); setRate19l(null)
    setQtyHalf(0); setRateHalf(0)
    setQty15l(0); setRate15l(0)
    setPaymentMethod('cash'); setNotes(''); setCustomerName('')
    setSelectedCustomer(null); setCustomerSearch('')
    const q = {}; extraProducts.forEach(p => { q[p.id] = 0 }); setExtraQuantities(q)
    await fetchExtraProducts()
    setSaving(false)
  }

  const inp = {
    width: '100%', padding: '10px 12px', border: '1.5px solid #e0e0e0',
    borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
    background: 'white', color: '#333', caretColor: '#0f4c81'
  }

  const card = {
    background: 'white', borderRadius: '12px', padding: '16px',
    marginBottom: '12px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
    border: '1px solid #f0f0f0'
  }

  function SmallNumBtn({ val, onDec, onInc, color = '#0f4c81' }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button onClick={onDec}
          style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1.5px solid #ddd', background: '#f5f5f5', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>−</button>
        <span style={{ fontSize: '18px', fontWeight: '700', minWidth: '24px', textAlign: 'center', color: val > 0 ? color : '#ccc' }}>{val}</span>
        <button onClick={onInc}
          style={{ width: '32px', height: '32px', borderRadius: '50%', border: `1.5px solid ${color}`, background: color, color: 'white', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>+</button>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>⚡ Quick Sale & Payment</h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Walk-in sales and customer payment receipts</p>
      </div>

      {/* Mode Toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button onClick={() => { setMode('sale'); setSuccess(null) }}
          style={{ flex: 1, padding: '14px', border: '2px solid', borderColor: mode === 'sale' ? '#0f4c81' : '#eee', borderRadius: '10px', cursor: 'pointer', background: mode === 'sale' ? '#0f4c81' : 'white', color: mode === 'sale' ? 'white' : '#555', fontWeight: '700', fontSize: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '22px' }}>⚡</span>
          <span>Quick Sale</span>
          <span style={{ fontSize: '11px', opacity: 0.8 }}>Sell products to customer</span>
        </button>
        <button onClick={() => { setMode('payment'); setSuccess(null) }}
          style={{ flex: 1, padding: '14px', border: '2px solid', borderColor: mode === 'payment' ? '#1a7a4a' : '#eee', borderRadius: '10px', cursor: 'pointer', background: mode === 'payment' ? '#1a7a4a' : 'white', color: mode === 'payment' ? 'white' : '#555', fontWeight: '700', fontSize: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '22px' }}>💰</span>
          <span>Receive Payment</span>
          <span style={{ fontSize: '11px', opacity: 0.8 }}>Collect outstanding balance</span>
        </button>
      </div>

      {/* Success */}
      {success && (
        <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
          {success.type === 'payment' ? (
            <>
              <p style={{ fontWeight: '700', color: '#1b5e20', margin: '0 0 4px' }}>✅ Payment Received!</p>
              <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>👤 {success.name}</p>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 2px' }}>
                Rs. {success.amount.toLocaleString()} — {success.method === 'jazzcash' ? '📱 JazzCash' : '💵 Cash'}
              </p>
              {success.jazzPending && (
                <p style={{ fontSize: '12px', color: '#e65100', margin: '4px 0 0', fontWeight: '600' }}>
                  ⚠️ JazzCash payment — confirm in JazzCash Reconciliation to update customer balance
                </p>
              )}
              {!success.jazzPending && (
                <p style={{ fontSize: '12px', color: '#555', margin: '4px 0 0' }}>
                  New balance: <strong style={{ color: success.newBalance > 0 ? '#f44336' : '#1a7a4a' }}>
                    Rs. {Math.abs(success.newBalance).toLocaleString()} {success.newBalance > 0 ? 'outstanding' : success.newBalance < 0 ? 'advance' : 'clear'}
                  </strong>
                </p>
              )}
            </>
          ) : (
            <>
              <p style={{ fontWeight: '700', color: '#1b5e20', margin: '0 0 4px' }}>✅ Sale Posted!</p>
              <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>👤 {success.name}</p>
              <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 4px' }}>{success.desc}</p>
              <p style={{ fontSize: '15px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>
                Rs. {success.total.toLocaleString()} — {success.paymentMethod}
              </p>
            </>
          )}
          <button onClick={() => setSuccess(null)}
            style={{ marginTop: '8px', padding: '5px 14px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
            {mode === 'sale' ? '+ New Sale' : '+ New Payment'}
          </button>
        </div>
      )}

      {/* ── PAYMENT RECEIPT MODE ─────────────────────────────────── */}
      {mode === 'payment' && (
        <div>
          {/* Customer Search */}
          <div style={card}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '10px', textTransform: 'uppercase' }}>Select Customer *</p>
            {paymentCustomer ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#e3f0ff', borderRadius: '8px', border: '1px solid #c8d8ff' }}>
                <div>
                  <p style={{ fontWeight: '700', fontSize: '15px', margin: '0 0 4px', color: '#0f4c81' }}>{paymentCustomer.full_name}</p>
                  <p style={{ fontSize: '12px', color: '#555', margin: '0 0 2px' }}>{paymentCustomer.mobile} · {paymentCustomer.customer_code}</p>
                  <p style={{ fontSize: '13px', fontWeight: '700', margin: 0, color: Number(paymentCustomer.balance) > 0 ? '#f44336' : '#1a7a4a' }}>
                    Outstanding: Rs. {Math.abs(Number(paymentCustomer.balance || 0)).toLocaleString()}
                    {Number(paymentCustomer.balance) <= 0 && ' (No balance due)'}
                  </p>
                </div>
                <button onClick={() => { setPaymentCustomer(null); setPaymentSearch('') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '20px', marginLeft: '8px' }}>✕</button>
              </div>
            ) : (
              <div>
                <input value={paymentSearch} onChange={e => searchPaymentCustomer(e.target.value)}
                  placeholder="Search by name, mobile or customer ID..."
                  style={inp} />
                {paymentSearchResults.length > 0 && (
                  <div style={{ border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden', marginTop: '4px' }}>
                    {paymentSearchResults.map(c => (
                      <div key={c.id} onClick={() => { setPaymentCustomer(c); setPaymentSearchResults([]); setPaymentSearch(''); if (c.balance > 0) setPaymentAmount(String(c.balance)) }}
                        style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white' }}>
                        <div>
                          <p style={{ fontWeight: '600', fontSize: '13px', margin: '0 0 2px' }}>{c.full_name}</p>
                          <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{c.mobile} · {c.customer_code}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: '13px', fontWeight: '700', color: Number(c.balance) > 0 ? '#f44336' : '#1a7a4a', margin: 0 }}>
                            Rs. {Math.abs(Number(c.balance)).toLocaleString()}
                          </p>
                          <p style={{ fontSize: '10px', color: '#aaa', margin: 0 }}>
                            {Number(c.balance) > 0 ? 'outstanding' : 'advance'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Payment Method */}
          <div style={card}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '10px', textTransform: 'uppercase' }}>Payment Method</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              {[
                { key: 'cash', label: 'Cash', urdu: 'نقد', icon: '💵', color: '#1a7a4a' },
                { key: 'jazzcash', label: 'JazzCash', urdu: 'جیز کیش', icon: '📱', color: '#9c27b0' },
              ].map(pm => (
                <button key={pm.key} onClick={() => setPaymentMethodReceipt(pm.key)}
                  style={{ flex: 1, padding: '14px', border: '2px solid', borderColor: paymentMethodReceipt === pm.key ? pm.color : '#eee', borderRadius: '10px', cursor: 'pointer', background: paymentMethodReceipt === pm.key ? pm.color : 'white', color: paymentMethodReceipt === pm.key ? 'white' : '#555', fontWeight: '700', fontSize: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '24px' }}>{pm.icon}</span>
                  <span>{pm.urdu} {pm.label}</span>
                </button>
              ))}
            </div>
            {paymentMethodReceipt === 'jazzcash' && (
              <p style={{ fontSize: '12px', color: '#9c27b0', margin: '10px 0 0', background: '#f3e5f5', padding: '8px 12px', borderRadius: '8px', fontWeight: '600' }}>
                📱 JazzCash payment will be pending until confirmed in JazzCash Reconciliation
              </p>
            )}
            {paymentMethodReceipt === 'cash' && (
              <p style={{ fontSize: '12px', color: '#1a7a4a', margin: '10px 0 0', background: '#e8f5e9', padding: '8px 12px', borderRadius: '8px', fontWeight: '600' }}>
                💵 Cash goes directly to CEO Cash in Hand — balance updated immediately
              </p>
            )}
          </div>

          {/* Amount */}
          <div style={card}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '10px', textTransform: 'uppercase' }}>Amount Received (Rs.)</p>
            <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
              placeholder="0"
              style={{ ...inp, fontSize: '28px', fontWeight: '700', textAlign: 'center', marginBottom: '10px' }} />
            {paymentCustomer && Number(paymentCustomer.balance) > 0 && (
              <button onClick={() => setPaymentAmount(String(paymentCustomer.balance))}
                style={{ width: '100%', padding: '8px', background: '#f0f7ff', border: '1px solid #c8d8ff', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#0f4c81', fontWeight: '600' }}>
                Full Balance: Rs. {Number(paymentCustomer.balance).toLocaleString()}
              </button>
            )}
          </div>

          {/* Notes */}
          <div style={card}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '8px', textTransform: 'uppercase' }}>Notes (optional)</p>
            <input value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)}
              placeholder="e.g. Monthly payment, partial payment..." style={inp} />
          </div>

          {/* Submit */}
          <div style={card}>
            {paymentCustomer && paymentAmount && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', padding: '12px', background: '#f0f7ff', borderRadius: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: '700', color: '#333' }}>Amount to Receive</span>
                <span style={{ fontSize: '28px', fontWeight: '800', color: '#0f4c81' }}>Rs. {Number(paymentAmount).toLocaleString()}</span>
              </div>
            )}
            <button onClick={receivePayment} disabled={saving}
              style={{ width: '100%', padding: '15px', background: paymentMethodReceipt === 'cash' ? 'linear-gradient(135deg,#1a7a4a,#2e7d32)' : 'linear-gradient(135deg,#9c27b0,#7b1fa2)', color: 'white', border: 'none', borderRadius: '10px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: '700', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              {saving ? '⏳ Saving...' : `✓ ${paymentMethodReceipt === 'cash' ? '💵 Receive Cash' : '📱 Record JazzCash'} — Rs. ${Number(paymentAmount || 0).toLocaleString()}`}
            </button>
          </div>
        </div>
      )}

      {/* ── QUICK SALE MODE ──────────────────────────────────────── */}
      {mode === 'sale' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', alignItems: 'start' }}>

          {/* LEFT COLUMN */}
          <div>
            {/* Payment Method */}
            <div style={card}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payment Method</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[
                  { key: 'cash', label: 'Cash', urdu: 'نقد', icon: '💵', color: '#1a7a4a' },
                  { key: 'jazzcash', label: 'JazzCash', urdu: 'JZC', icon: '📱', color: '#9c27b0' },
                  { key: 'credit', label: 'Credit', urdu: 'ادھار', icon: '📋', color: '#f44336' },
                ].map(pm => (
                  <button key={pm.key} onClick={() => { setPaymentMethod(pm.key); if (pm.key !== 'credit') { setSelectedCustomer(null); setCustomerSearch('') } }}
                    style={{ flex: 1, padding: '12px 4px', border: '2px solid', borderColor: paymentMethod === pm.key ? pm.color : '#eee', borderRadius: '10px', cursor: 'pointer', background: paymentMethod === pm.key ? pm.color : 'white', color: paymentMethod === pm.key ? 'white' : '#555', fontWeight: '700', fontSize: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                    <span style={{ fontSize: '20px' }}>{pm.icon}</span>
                    <span>{pm.urdu}</span>
                    <span style={{ fontSize: '10px', opacity: 0.8 }}>{pm.label}</span>
                  </button>
                ))}
              </div>
              <p style={{ fontSize: '11px', fontWeight: '600', margin: '10px 0 0', padding: '6px 10px', borderRadius: '6px', background: paymentMethod === 'cash' ? '#e8f5e9' : paymentMethod === 'jazzcash' ? '#f3e5f5' : '#ffebee', color: paymentMethod === 'cash' ? '#1a7a4a' : paymentMethod === 'jazzcash' ? '#9c27b0' : '#f44336' }}>
                {paymentMethod === 'cash' && '💵 Goes to CEO Cash in Hand'}
                {paymentMethod === 'jazzcash' && '📱 Goes to CEO JazzCash — confirm in reconciliation'}
                {paymentMethod === 'credit' && '📋 Select customer — added to their balance'}
              </p>
            </div>

            {/* Customer */}
            <div style={card}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Customer {paymentMethod === 'credit' ? <span style={{ color: '#f44336' }}>★ Required</span> : <span style={{ color: '#aaa', fontWeight: '400' }}>(Optional)</span>}
              </p>
              {selectedCustomer ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#e3f0ff', borderRadius: '8px', border: '1px solid #c8d8ff' }}>
                  <div>
                    <p style={{ fontWeight: '700', fontSize: '14px', margin: '0 0 2px', color: '#0f4c81' }}>{selectedCustomer.full_name}</p>
                    <p style={{ fontSize: '11px', color: '#555', margin: 0 }}>
                      {selectedCustomer.mobile} · Balance: <strong style={{ color: Number(selectedCustomer.balance) > 0 ? '#f44336' : '#1a7a4a' }}>Rs. {Math.abs(Number(selectedCustomer.balance || 0)).toLocaleString()}</strong>
                    </p>
                    <p style={{ fontSize: '11px', color: '#0f4c81', margin: '2px 0 0', fontWeight: '600' }}>
                      ✅ Rates: 19L=Rs.{selectedCustomer.rate_19l}
                      {selectedCustomer.rate_half_litre > 0 ? ` · Half=Rs.${selectedCustomer.rate_half_litre}` : ''}
                      {selectedCustomer.rate_1_5l > 0 ? ` · 1.5L=Rs.${selectedCustomer.rate_1_5l}` : ''}
                    </p>
                  </div>
                  <button onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); setRate19l(null); setRateHalf(0); setRate15l(0) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '18px', marginLeft: '8px' }}>✕</button>
                </div>
              ) : (
                <div>
                  {paymentMethod !== 'credit' && (
                    <input value={customerName} onChange={e => setCustomerName(e.target.value)}
                      placeholder="Walk-in name (optional)"
                      style={{ ...inp, marginBottom: '8px' }} />
                  )}
                  <input value={customerSearch} onChange={e => searchCustomer(e.target.value)}
                    placeholder="Search by name, mobile or ID..."
                    style={inp} />
                  {customerResults.length > 0 && (
                    <div style={{ border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden', marginTop: '4px' }}>
                      {customerResults.map(c => (
                        <div key={c.id} onClick={() => selectCustomer(c)}
                          style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white' }}>
                          <div>
                            <p style={{ fontWeight: '600', fontSize: '13px', margin: '0 0 1px' }}>{c.full_name}</p>
                            <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{c.mobile} · {c.customer_code}</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: '12px', fontWeight: '700', color: Number(c.balance) > 0 ? '#f44336' : '#1a7a4a', margin: '0 0 2px' }}>
                              Rs. {Math.abs(Number(c.balance)).toLocaleString()}
                            </p>
                            <p style={{ fontSize: '10px', color: '#aaa', margin: 0 }}>Rate: Rs.{c.rate_19l}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notes */}
            <div style={card}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notes (optional)</p>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any note..." style={inp} />
            </div>

            {/* Total & Submit */}
            <div style={{ ...card, border: '2px solid #e3f0ff' }}>
              {[
                qty19l > 0 && rate19l && { label: `🍶 19L ×${qty19l} @Rs.${rate19l}`, val: qty19l * rate19l },
                qtyHalf > 0 && rateHalf > 0 && { label: `💧 Half ×${qtyHalf} @Rs.${rateHalf}`, val: qtyHalf * rateHalf },
                qty15l > 0 && rate15l > 0 && { label: `🧴 1.5L ×${qty15l} @Rs.${rate15l}`, val: qty15l * rate15l },
                ...extraProducts.filter(p => extraQuantities[p.id] > 0).map(p => ({ label: `${p.name} ×${extraQuantities[p.id]}`, val: extraQuantities[p.id] * extraRates[p.id] }))
              ].filter(Boolean).map((row, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#555', marginBottom: '4px' }}>
                  <span>{row.label}</span>
                  <span style={{ fontWeight: '600' }}>Rs. {row.val.toLocaleString()}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid #eee', paddingTop: '10px', marginTop: '8px', marginBottom: '14px' }}>
                <span style={{ fontSize: '16px', fontWeight: '700', color: '#333' }}>Total Amount</span>
                <span style={{ fontSize: '32px', fontWeight: '800', color: '#0f4c81', letterSpacing: '-1px' }}>Rs. {total.toLocaleString()}</span>
              </div>
              {paymentMethod === 'credit' && selectedCustomer && (
                <p style={{ fontSize: '12px', color: '#f44336', background: '#ffebee', padding: '8px 10px', borderRadius: '6px', marginBottom: '10px', fontWeight: '600' }}>
                  📋 Rs. {total.toLocaleString()} will be added to {selectedCustomer.full_name}'s outstanding balance
                </p>
              )}
              <button onClick={postSale} disabled={saving}
                style={{ width: '100%', padding: '15px', background: paymentMethod === 'cash' ? 'linear-gradient(135deg,#1a7a4a,#2e7d32)' : paymentMethod === 'jazzcash' ? 'linear-gradient(135deg,#9c27b0,#7b1fa2)' : 'linear-gradient(135deg,#f44336,#c62828)', color: 'white', border: 'none', borderRadius: '10px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: '700', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                {saving ? '⏳ Saving...' : `✓ ${paymentMethod === 'cash' ? '💵 Cash Sale' : paymentMethod === 'jazzcash' ? '📱 JazzCash Sale' : '📋 Credit Sale'} — Rs. ${total.toLocaleString()}`}
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div>
            {/* 19L */}
            <div style={{ ...card, border: '2px solid #c8d8ff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <p style={{ fontSize: '16px', fontWeight: '700', color: '#0f4c81', margin: '0 0 2px' }}>🍶 19 Litre Bottle</p>
                  <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Main product · select quantity and rate</p>
                </div>
                <SmallNumBtn val={qty19l} onDec={() => setQty19l(Math.max(0, qty19l - 1))} onInc={() => setQty19l(qty19l + 1)} />
              </div>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#555', marginBottom: '8px' }}>Rate per bottle (Rs.)</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                {RATES_19L.map(r => (
                  <button key={r} onClick={() => setRate19l(r)}
                    style={{ padding: '8px 14px', border: '2px solid', borderColor: rate19l === r ? '#0f4c81' : '#eee', borderRadius: '8px', cursor: 'pointer', background: rate19l === r ? '#0f4c81' : '#f8f9fa', color: rate19l === r ? 'white' : '#333', fontWeight: '700', fontSize: '13px' }}>
                    Rs.{r}
                  </button>
                ))}
              </div>
              <input type="number" value={rate19l || ''} onChange={e => setRate19l(e.target.value === '' ? null : Number(e.target.value))}
                placeholder="Or type custom rate..."
                style={{ ...inp, fontSize: '15px', fontWeight: '700', textAlign: 'center', borderColor: rate19l ? '#0f4c81' : '#ddd' }} />
              {rate19l && qty19l > 0 && (
                <p style={{ fontSize: '13px', color: '#0f4c81', fontWeight: '700', margin: '8px 0 0', textAlign: 'center', background: '#e3f0ff', padding: '8px', borderRadius: '8px' }}>
                  {qty19l} × Rs.{rate19l} = <strong>Rs. {(qty19l * rate19l).toLocaleString()}</strong>
                </p>
              )}
            </div>

            {/* Half Litre */}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>💧 Half Litre <span style={{ fontSize: '11px', color: '#aaa', fontWeight: '400' }}>optional</span></p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {qtyHalf > 0 && (
                    <input type="number" value={rateHalf || ''} onChange={e => setRateHalf(Number(e.target.value) || 0)}
                      placeholder="Rate"
                      style={{ width: '75px', padding: '7px 8px', border: '1.5px solid #ddd', borderRadius: '6px', fontSize: '13px', fontWeight: '700', outline: 'none', textAlign: 'center', color: '#333', background: 'white' }} />
                  )}
                  <SmallNumBtn val={qtyHalf} onDec={() => setQtyHalf(Math.max(0, qtyHalf - 1))} onInc={() => setQtyHalf(qtyHalf + 1)} />
                </div>
              </div>
              {qtyHalf > 0 && rateHalf > 0 && (
                <p style={{ fontSize: '11px', color: '#0f4c81', fontWeight: '600', margin: '6px 0 0', textAlign: 'right' }}>
                  {qtyHalf} × Rs.{rateHalf} = Rs. {(qtyHalf * rateHalf).toLocaleString()}
                </p>
              )}
            </div>

            {/* 1.5L */}
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>🧴 1.5 Litre <span style={{ fontSize: '11px', color: '#aaa', fontWeight: '400' }}>optional</span></p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {qty15l > 0 && (
                    <input type="number" value={rate15l || ''} onChange={e => setRate15l(Number(e.target.value) || 0)}
                      placeholder="Rate"
                      style={{ width: '75px', padding: '7px 8px', border: '1.5px solid #ddd', borderRadius: '6px', fontSize: '13px', fontWeight: '700', outline: 'none', textAlign: 'center', color: '#333', background: 'white' }} />
                  )}
                  <SmallNumBtn val={qty15l} onDec={() => setQty15l(Math.max(0, qty15l - 1))} onInc={() => setQty15l(qty15l + 1)} />
                </div>
              </div>
              {qty15l > 0 && rate15l > 0 && (
                <p style={{ fontSize: '11px', color: '#0f4c81', fontWeight: '600', margin: '6px 0 0', textAlign: 'right' }}>
                  {qty15l} × Rs.{rate15l} = Rs. {(qty15l * rate15l).toLocaleString()}
                </p>
              )}
            </div>

            {/* Extra Products */}
            {extraProducts.length > 0 && (
              <div style={card}>
                <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Other Products</p>
                {extraProducts.map((p, i) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < extraProducts.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 1px', color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                      <p style={{ fontSize: '10px', color: '#aaa', margin: 0 }}>
                        Stock: {p.current_stock} · Rs.{p.sale_price}
                        {p.product_type === 'finished_good' && <span style={{ color: '#1a7a4a', marginLeft: '4px' }}>· Cost: Rs.{Number(p.average_cost || 0).toFixed(2)}</span>}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: '8px' }}>
                      {(extraQuantities[p.id] || 0) > 0 && (
                        <input type="number" value={extraRates[p.id] || ''}
                          onChange={e => setExtraRates(r => ({ ...r, [p.id]: Number(e.target.value) || 0 }))}
                          placeholder="Rate"
                          style={{ width: '65px', padding: '5px 6px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', fontWeight: '700', outline: 'none', textAlign: 'center', color: '#333', background: 'white' }} />
                      )}
                      <button onClick={() => setExtraQuantities(q => ({ ...q, [p.id]: Math.max(0, (q[p.id] || 0) - 1) }))}
                        style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #ddd', background: '#f5f5f5', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>−</button>
                      <span style={{ fontSize: '14px', fontWeight: '700', minWidth: '20px', textAlign: 'center', color: (extraQuantities[p.id] || 0) > 0 ? '#0f4c81' : '#ccc' }}>{extraQuantities[p.id] || 0}</span>
                      <button onClick={() => setExtraQuantities(q => ({ ...q, [p.id]: (q[p.id] || 0) + 1 }))}
                        style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #0f4c81', background: '#0f4c81', color: 'white', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}