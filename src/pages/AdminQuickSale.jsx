import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import InvoiceModal from '../components/InvoiceModal'

const RATES_19L = [90, 100, 110, 120, 150, 160, 170, 180]

export default function AdminQuickSale({ tenantId }) {
  const [mode, setMode] = useState('sale')
  const [products, setProducts] = useState([]) // all saleable products from DB
  const [quantities, setQuantities] = useState({})
  const [rates, setRates] = useState({})
  const [qty19l, setQty19l] = useState(1)
  const [rate19l, setRate19l] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [notes, setNotes] = useState('')
  const [bottlesReturned, setBottlesReturned] = useState(0)
  const [customerName, setCustomerName] = useState('')
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0])
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [showInvoice, setShowInvoice] = useState(false)
  const [lastDelivery, setLastDelivery] = useState(null)
  const [settings, setSettings] = useState({})
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethodReceipt, setPaymentMethodReceipt] = useState('cash')
  const [paymentSearch, setPaymentSearch] = useState('')
  const [paymentSearchResults, setPaymentSearchResults] = useState([])
  const [paymentCustomer, setPaymentCustomer] = useState(null)
  const [paymentNotes, setPaymentNotes] = useState('')

  useEffect(() => {
    if (tenantId) { fetchProducts(); fetchSettings() }
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [tenantId])

  async function fetchSettings() {
    const { data } = await supabase.from('business_settings').select('*').eq('tenant_id', tenantId)
    const map = {}
    data?.forEach(s => { map[s.setting_key] = s.setting_value })
    setSettings(map)
  }

  async function fetchProducts() {
    // Fetch all saleable products EXCEPT 19L (hardcoded)
    // Products with bottle_type = 'half_litre' or '1_5l' show as main bottle options
    // All others show as extra products
    const { data } = await supabase.from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .eq('is_saleable', true)
      .order('product_type').order('name')
    setProducts(data || [])
    const q = {}; const r = {}
    data?.forEach(p => {
      q[p.id] = 0
      r[p.id] = Number(p.sale_price) || 0
    })
    setQuantities(q); setRates(r)
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
    // Set rates for bottle-type products from customer rates
    const newRates = { ...rates }
    products.forEach(p => {
      if (p.bottle_type === 'half_litre' && c.rate_half_litre) newRates[p.id] = Number(c.rate_half_litre)
      if (p.bottle_type === '1_5l' && c.rate_1_5l) newRates[p.id] = Number(c.rate_1_5l)
    })
    setRates(newRates)
  }

  // Split products into bottle-mapped and extra
  const bottleProducts = products.filter(p => p.bottle_type === 'half_litre' || p.bottle_type === '1_5l')
  const extraProducts = products.filter(p => !p.bottle_type)

  // Calculate totals
  const bottleTotal = bottleProducts.reduce((s, p) => s + (quantities[p.id] || 0) * (rates[p.id] || 0), 0)
  const extraTotal = extraProducts.reduce((s, p) => s + (quantities[p.id] || 0) * (rates[p.id] || 0), 0)
  const subTotal = (qty19l * (rate19l || 0)) + bottleTotal + extraTotal
  const taxRate = selectedCustomer?.is_tax_applicable ? Number(settings.sales_tax_rate || 0) : 0
  const taxAmount = Math.round(subTotal * taxRate / 100 * 100) / 100
  const total = subTotal + taxAmount

  // Helper: get qty_half_litre and qty_1_5l from bottle products
  function getBottleQtys() {
    let qtyHalf = 0, qty15l = 0
    bottleProducts.forEach(p => {
      if (p.bottle_type === 'half_litre') qtyHalf += (quantities[p.id] || 0)
      if (p.bottle_type === '1_5l') qty15l += (quantities[p.id] || 0)
    })
    return { qtyHalf, qty15l }
  }

  // ── RECEIVE PAYMENT ─────────────────────────────────────────────
  async function receivePayment() {
    if (!paymentCustomer) return alert('Please select a customer')
    if (!paymentAmount || Number(paymentAmount) <= 0) return alert('Please enter payment amount')
    setSaving(true)

    const amount = Number(paymentAmount)
    const isJazz = paymentMethodReceipt === 'jazzcash'

    const { data: savedPayment, error } = await supabase.from('payments').insert([{
      tenant_id: tenantId,
      customer_id: paymentCustomer.id,
      amount,
      payment_method: paymentMethodReceipt,
      payment_date: new Date().toISOString().split('T')[0],
      jazzcash_confirmed: !isJazz,
      notes: paymentNotes || `Payment received from ${paymentCustomer.full_name}`,
      is_voided: false,
      rider_id: null // admin entry
    }]).select().single()

    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    if (!isJazz) {
      const newBalance = Number(paymentCustomer.balance || 0) - amount
      await supabase.from('customers').update({ balance: newBalance })
        .eq('id', paymentCustomer.id).eq('tenant_id', tenantId)
    }

    try {
      const { postPaymentJournal } = await import('../accountingEngine')
      await postPaymentJournal(savedPayment, tenantId, false) // false = admin entry → DR 1001 Cash
    } catch (err) { console.error('Journal error:', err) }

    setSuccess({
      type: 'payment', name: paymentCustomer.full_name, amount,
      method: paymentMethodReceipt,
      newBalance: !isJazz ? Number(paymentCustomer.balance || 0) - amount : paymentCustomer.balance,
      jazzPending: isJazz
    })
    setPaymentCustomer(null); setPaymentSearch(''); setPaymentAmount(''); setPaymentNotes('')
    setSaving(false)
  }

  // ── POST SALE ───────────────────────────────────────────────────
  async function postSale() {
    const { qtyHalf, qty15l } = getBottleQtys()
    const hasItems = qty19l > 0 || qtyHalf > 0 || qty15l > 0 || products.some(p => (quantities[p.id] || 0) > 0)
    if (!hasItems) return alert('Please enter at least one item')
    if (qty19l > 0 && !rate19l) return alert('Please select rate for 19L bottle')
    if (paymentMethod === 'credit' && !selectedCustomer) return alert('Please select a customer for credit sale')
    setSaving(true)

    const walkinName = selectedCustomer?.full_name || customerName || 'Walk-in Customer'
    const descParts = []
    if (qty19l > 0) descParts.push(`19L×${qty19l}@Rs.${rate19l}`)
    bottleProducts.filter(p => (quantities[p.id] || 0) > 0).forEach(p => {
      descParts.push(`${p.name}×${quantities[p.id]}@Rs.${rates[p.id]}`)
    })
    extraProducts.filter(p => (quantities[p.id] || 0) > 0).forEach(p => {
      descParts.push(`${p.name}×${quantities[p.id]}@Rs.${rates[p.id]}`)
    })

    const deliveryData = {
      tenant_id: tenantId,
      customer_id: selectedCustomer?.id || null,
      rider_id: null, // admin entry
      qty_19l: qty19l,
      qty_half_litre: qtyHalf,
      qty_1_5l: qty15l,
      rate_applied: rate19l || 0,
      total_amount: total,
      payment_method: paymentMethod,
      amount_received: paymentMethod === 'credit' ? 0 : paymentMethod === 'jazzcash' ? 0 : total,
      credit_amount: paymentMethod === 'credit' ? total : 0,
      jazzcash_confirmed: false,
      delivered_at: new Date(saleDate).toISOString(),
      is_voided: false,
      bottles_returned: bottlesReturned,
      notes: [walkinName !== 'Walk-in Customer' ? `Customer: ${walkinName}` : '', descParts.join(' | '), notes].filter(Boolean).join(' — '),
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total_with_tax: total
    }

    const { data: savedDelivery, error } = await supabase.from('deliveries').insert([deliveryData]).select().single()
    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    // Deduct stock + post COGS for ALL sold products (bottle-mapped + extra)
    const allSoldProducts = products.filter(p => (quantities[p.id] || 0) > 0)
    for (const p of allSoldProducts) {
      const qtySold = quantities[p.id]
      const avgCost = Number(p.average_cost || p.purchase_price || 0)
      const cogsCost = qtySold * avgCost

      // Reduce stock
      await supabase.from('products')
        .update({ current_stock: Math.max(0, Number(p.current_stock || 0) - qtySold) })
        .eq('id', p.id).eq('tenant_id', tenantId)

      // Post COGS journal for finished goods
      if (p.product_type === 'finished_good' && cogsCost > 0) {
        try {
          const { data: je } = await supabase.from('journal_entries').insert([{
            tenant_id: tenantId,
            entry_date: saleDate,
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

    if (paymentMethod === 'credit' && selectedCustomer) {
      await supabase.from('customers')
        .update({ balance: Number(selectedCustomer.balance || 0) + total })
        .eq('id', selectedCustomer.id).eq('tenant_id', tenantId)
    }

    if (selectedCustomer && (qty19l > 0 || bottlesReturned > 0)) {
      const currentBottles = Number(selectedCustomer.our_bottles_placed || 0)
      await supabase.from('customers')
        .update({ our_bottles_placed: Math.max(0, currentBottles + qty19l - bottlesReturned) })
        .eq('id', selectedCustomer.id).eq('tenant_id', tenantId)
    }

    try {
      const { postDeliveryJournal } = await import('../accountingEngine')
      await postDeliveryJournal(savedDelivery, selectedCustomer?.id || null, tenantId, false) // false = admin → DR 1001
    } catch (err) { console.error('Journal post error:', err) }

    setLastDelivery({ ...savedDelivery, tax_amount: taxAmount, total_with_tax: total })
    setSuccess({ type: 'sale', total, paymentMethod, name: walkinName, desc: descParts.join(', '), deliveryId: savedDelivery.id })

    // Reset
    setQty19l(1); setRate19l(null); setPaymentMethod('cash'); setNotes(''); setCustomerName(''); setBottlesReturned(0)
    setSaleDate(new Date().toISOString().split('T')[0])
    setSelectedCustomer(null); setCustomerSearch('')
    await fetchProducts()
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
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>⚡ Quick Sale & Payment</h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Walk-in sales and customer payment receipts</p>
      </div>

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

      {success && (
        <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
          {success.type === 'payment' ? (
            <>
              <p style={{ fontWeight: '700', color: '#1b5e20', margin: '0 0 4px' }}>✅ Payment Received!</p>
              <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>👤 {success.name}</p>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 2px' }}>Rs. {success.amount.toLocaleString()} — {success.method === 'jazzcash' ? '📱 JazzCash' : '💵 Cash'}</p>
              {success.jazzPending && <p style={{ fontSize: '12px', color: '#e65100', margin: '4px 0 0', fontWeight: '600' }}>⚠️ JazzCash — confirm in reconciliation to update balance</p>}
              {!success.jazzPending && <p style={{ fontSize: '12px', color: '#555', margin: '4px 0 0' }}>New balance: <strong style={{ color: success.newBalance > 0 ? '#f44336' : '#1a7a4a' }}>Rs. {Math.abs(success.newBalance).toLocaleString()} {success.newBalance > 0 ? 'outstanding' : success.newBalance < 0 ? 'advance' : 'clear'}</strong></p>}
            </>
          ) : (
            <>
              <p style={{ fontWeight: '700', color: '#1b5e20', margin: '0 0 4px' }}>✅ Sale Posted!</p>
              <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>👤 {success.name}</p>
              <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 4px' }}>{success.desc}</p>
              <p style={{ fontSize: '15px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>Rs. {success.total.toLocaleString()} — {success.paymentMethod}</p>
            </>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button onClick={() => setSuccess(null)} style={{ padding: '5px 14px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
              {mode === 'sale' ? '+ New Sale' : '+ New Payment'}
            </button>
            {success?.deliveryId && (
              <button onClick={() => setShowInvoice(true)} style={{ padding: '5px 14px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                🧾 Print Invoice
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── PAYMENT MODE ─────────────────────────────────────────── */}
      {mode === 'payment' && (
        <div>
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
                <button onClick={() => { setPaymentCustomer(null); setPaymentSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '20px', marginLeft: '8px' }}>✕</button>
              </div>
            ) : (
              <div>
                <input value={paymentSearch} onChange={e => searchPaymentCustomer(e.target.value)} placeholder="Search by name, mobile or customer ID..." style={inp} />
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
                          <p style={{ fontSize: '13px', fontWeight: '700', color: Number(c.balance) > 0 ? '#f44336' : '#1a7a4a', margin: 0 }}>Rs. {Math.abs(Number(c.balance)).toLocaleString()}</p>
                          <p style={{ fontSize: '10px', color: '#aaa', margin: 0 }}>{Number(c.balance) > 0 ? 'outstanding' : 'advance'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={card}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '10px', textTransform: 'uppercase' }}>Payment Method</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              {[{ key: 'cash', label: 'Cash', urdu: 'نقد', icon: '💵', color: '#1a7a4a' }, { key: 'jazzcash', label: 'JazzCash', urdu: 'جیز کیش', icon: '📱', color: '#9c27b0' }].map(pm => (
                <button key={pm.key} onClick={() => setPaymentMethodReceipt(pm.key)}
                  style={{ flex: 1, padding: '14px', border: '2px solid', borderColor: paymentMethodReceipt === pm.key ? pm.color : '#eee', borderRadius: '10px', cursor: 'pointer', background: paymentMethodReceipt === pm.key ? pm.color : 'white', color: paymentMethodReceipt === pm.key ? 'white' : '#555', fontWeight: '700', fontSize: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '24px' }}>{pm.icon}</span>
                  <span>{pm.urdu} {pm.label}</span>
                </button>
              ))}
            </div>
            {paymentMethodReceipt === 'jazzcash' && <p style={{ fontSize: '12px', color: '#9c27b0', margin: '10px 0 0', background: '#f3e5f5', padding: '8px 12px', borderRadius: '8px', fontWeight: '600' }}>📱 JazzCash payment will be pending until confirmed in JazzCash Reconciliation</p>}
            {paymentMethodReceipt === 'cash' && <p style={{ fontSize: '12px', color: '#1a7a4a', margin: '10px 0 0', background: '#e8f5e9', padding: '8px 12px', borderRadius: '8px', fontWeight: '600' }}>💵 Cash goes directly to CEO Cash in Hand — balance updated immediately</p>}
          </div>

          <div style={card}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '10px', textTransform: 'uppercase' }}>Amount Received (Rs.)</p>
            <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0" style={{ ...inp, fontSize: '28px', fontWeight: '700', textAlign: 'center', marginBottom: '10px' }} />
            {paymentCustomer && Number(paymentCustomer.balance) > 0 && (
              <button onClick={() => setPaymentAmount(String(paymentCustomer.balance))} style={{ width: '100%', padding: '8px', background: '#f0f7ff', border: '1px solid #c8d8ff', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#0f4c81', fontWeight: '600' }}>
                Full Balance: Rs. {Number(paymentCustomer.balance).toLocaleString()}
              </button>
            )}
          </div>

          <div style={card}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '8px', textTransform: 'uppercase' }}>Notes (optional)</p>
            <input value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="e.g. Monthly payment, partial payment..." style={inp} />
          </div>

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

      {/* ── SALE MODE ─────────────────────────────────────────────── */}
      {mode === 'sale' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', alignItems: 'start' }}>

          {/* LEFT COLUMN */}
          <div>
            <div style={card}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payment Method</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[{ key: 'cash', label: 'Cash', urdu: 'نقد', icon: '💵', color: '#1a7a4a' }, { key: 'jazzcash', label: 'JazzCash', urdu: 'JZC', icon: '📱', color: '#9c27b0' }, { key: 'credit', label: 'Credit', urdu: 'ادھار', icon: '📋', color: '#f44336' }].map(pm => (
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

            <div style={card}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Customer {paymentMethod === 'credit' ? <span style={{ color: '#f44336' }}>★ Required</span> : <span style={{ color: '#aaa', fontWeight: '400' }}>(Optional)</span>}
              </p>
              {selectedCustomer ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#e3f0ff', borderRadius: '8px', border: '1px solid #c8d8ff' }}>
                  <div>
                    <p style={{ fontWeight: '700', fontSize: '14px', margin: '0 0 2px', color: '#0f4c81' }}>{selectedCustomer.full_name}</p>
                    <p style={{ fontSize: '11px', color: '#555', margin: 0 }}>{selectedCustomer.mobile} · Balance: <strong style={{ color: Number(selectedCustomer.balance) > 0 ? '#f44336' : '#1a7a4a' }}>Rs. {Math.abs(Number(selectedCustomer.balance || 0)).toLocaleString()}</strong></p>
                  </div>
                  <button onClick={() => { setSelectedCustomer(null); setCustomerSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '18px', marginLeft: '8px' }}>✕</button>
                </div>
              ) : (
                <div>
                  {paymentMethod !== 'credit' && <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Walk-in name (optional)" style={{ ...inp, marginBottom: '8px' }} />}
                  <input value={customerSearch} onChange={e => searchCustomer(e.target.value)} placeholder="Search by name, mobile or ID..." style={inp} />
                  {customerResults.length > 0 && (
                    <div style={{ border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden', marginTop: '4px' }}>
                      {customerResults.map(c => (
                        <div key={c.id} onClick={() => selectCustomer(c)} style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white' }}>
                          <div>
                            <p style={{ fontWeight: '600', fontSize: '13px', margin: '0 0 1px' }}>{c.full_name}</p>
                            <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{c.mobile} · {c.customer_code}</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: '12px', fontWeight: '700', color: Number(c.balance) > 0 ? '#f44336' : '#1a7a4a', margin: '0 0 2px' }}>Rs. {Math.abs(Number(c.balance)).toLocaleString()}</p>
                            <p style={{ fontSize: '10px', color: '#aaa', margin: 0 }}>Rate: Rs.{c.rate_19l}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={card}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sale Date</p>
              <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} max={new Date().toISOString().split('T')[0]} style={{ ...inp, fontSize: '15px' }} />
              {saleDate !== new Date().toISOString().split('T')[0] && <p style={{ fontSize: '11px', color: '#e65100', margin: '6px 0 0', fontWeight: '600' }}>⚠️ Back-dated entry — {new Date(saleDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</p>}
            </div>

            <div style={card}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notes (optional)</p>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any note..." style={inp} />
            </div>

            <div style={{ ...card, border: '1px solid #fff3e0' }}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#e65100', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🫙 Empty Bottles Returned</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>
                <button onClick={() => setBottlesReturned(Math.max(0, bottlesReturned - 1))}
                  style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #ddd', background: '#f5f5f5', fontSize: '18px', cursor: 'pointer' }}>−</button>
                <span style={{ fontSize: '28px', fontWeight: '700', minWidth: '40px', textAlign: 'center', color: bottlesReturned > 0 ? '#e65100' : '#ccc' }}>{bottlesReturned}</span>
                <button onClick={() => setBottlesReturned(bottlesReturned + 1)}
                  style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #e65100', background: '#e65100', color: 'white', fontSize: '18px', cursor: 'pointer' }}>+</button>
              </div>
              {bottlesReturned > 0 && selectedCustomer && (
                <p style={{ fontSize: '11px', color: '#e65100', margin: '8px 0 0', textAlign: 'center', fontWeight: '600' }}>
                  🫙 {bottlesReturned} empty bottle{bottlesReturned > 1 ? 's' : ''} returned by {selectedCustomer.full_name}
                </p>
              )}
            </div>

            {/* Total & Submit */}
            <div style={{ ...card, border: '2px solid #e3f0ff' }}>
              {[
                qty19l > 0 && rate19l && { label: `🍶 19L ×${qty19l} @Rs.${rate19l}`, val: qty19l * rate19l },
                ...bottleProducts.filter(p => (quantities[p.id] || 0) > 0).map(p => ({ label: `${p.name} ×${quantities[p.id]} @Rs.${rates[p.id]}`, val: (quantities[p.id] || 0) * (rates[p.id] || 0) })),
                ...extraProducts.filter(p => (quantities[p.id] || 0) > 0).map(p => ({ label: `${p.name} ×${quantities[p.id]}`, val: (quantities[p.id] || 0) * (rates[p.id] || 0) }))
              ].filter(Boolean).map((row, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#555', marginBottom: '4px' }}>
                  <span>{row.label}</span>
                  <span style={{ fontWeight: '600' }}>Rs. {row.val.toLocaleString()}</span>
                </div>
              ))}
              {taxAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#f57f17', marginBottom: '4px', fontWeight: '600' }}>
                  <span>🧾 Sales Tax ({taxRate}%)</span>
                  <span>Rs. {taxAmount.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid #eee', paddingTop: '10px', marginTop: '8px', marginBottom: '14px' }}>
                <span style={{ fontSize: '16px', fontWeight: '700', color: '#333' }}>Total Amount</span>
                <span style={{ fontSize: '32px', fontWeight: '800', color: '#0f4c81', letterSpacing: '-1px' }}>Rs. {total.toLocaleString()}</span>
              </div>
              {paymentMethod === 'credit' && selectedCustomer && <p style={{ fontSize: '12px', color: '#f44336', background: '#ffebee', padding: '8px 10px', borderRadius: '6px', marginBottom: '10px', fontWeight: '600' }}>📋 Rs. {total.toLocaleString()} will be added to {selectedCustomer.full_name}'s balance</p>}
              <button onClick={postSale} disabled={saving}
                style={{ width: '100%', padding: '15px', background: paymentMethod === 'cash' ? 'linear-gradient(135deg,#1a7a4a,#2e7d32)' : paymentMethod === 'jazzcash' ? 'linear-gradient(135deg,#9c27b0,#7b1fa2)' : 'linear-gradient(135deg,#f44336,#c62828)', color: 'white', border: 'none', borderRadius: '10px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: '700', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                {saving ? '⏳ Saving...' : `✓ ${paymentMethod === 'cash' ? '💵 Cash Sale' : paymentMethod === 'jazzcash' ? '📱 JazzCash Sale' : '📋 Credit Sale'} — Rs. ${total.toLocaleString()}`}
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN — Products */}
          <div>
            {/* 19L — always hardcoded */}
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
              <input type="number" value={rate19l || ''} onChange={e => setRate19l(e.target.value === '' ? null : Number(e.target.value))} placeholder="Or type custom rate..."
                style={{ ...inp, fontSize: '15px', fontWeight: '700', textAlign: 'center', borderColor: rate19l ? '#0f4c81' : '#ddd' }} />
              {rate19l && qty19l > 0 && <p style={{ fontSize: '13px', color: '#0f4c81', fontWeight: '700', margin: '8px 0 0', textAlign: 'center', background: '#e3f0ff', padding: '8px', borderRadius: '8px' }}>{qty19l} × Rs.{rate19l} = <strong>Rs. {(qty19l * rate19l).toLocaleString()}</strong></p>}
            </div>

            {/* Bottle-mapped products (half litre, 1.5L etc from DB) */}
            {bottleProducts.map(p => (
              <div key={p.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: '0 0 2px' }}>
                      {p.bottle_type === 'half_litre' ? '💧' : '🧴'} {p.name}
                      <span style={{ fontSize: '11px', color: '#aaa', fontWeight: '400', marginLeft: '6px' }}>optional</span>
                    </p>
                    <p style={{ fontSize: '10px', color: '#888', margin: 0 }}>Stock: {p.current_stock} pcs</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {(quantities[p.id] || 0) > 0 && (
                      <input type="number" value={rates[p.id] || ''} onChange={e => setRates(r => ({ ...r, [p.id]: Number(e.target.value) || 0 }))}
                        placeholder="Rate"
                        style={{ width: '75px', padding: '7px 8px', border: '1.5px solid #ddd', borderRadius: '6px', fontSize: '13px', fontWeight: '700', outline: 'none', textAlign: 'center', color: '#333', background: 'white' }} />
                    )}
                    <SmallNumBtn val={quantities[p.id] || 0} onDec={() => setQuantities(q => ({ ...q, [p.id]: Math.max(0, (q[p.id] || 0) - 1) }))} onInc={() => setQuantities(q => ({ ...q, [p.id]: (q[p.id] || 0) + 1 }))} />
                  </div>
                </div>
                {(quantities[p.id] || 0) > 0 && (rates[p.id] || 0) > 0 && (
                  <p style={{ fontSize: '11px', color: '#0f4c81', fontWeight: '600', margin: '6px 0 0', textAlign: 'right' }}>
                    {quantities[p.id]} × Rs.{rates[p.id]} = Rs. {((quantities[p.id] || 0) * (rates[p.id] || 0)).toLocaleString()}
                  </p>
                )}
              </div>
            ))}

            {/* Extra products (trading items, no bottle_type) */}
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
                      {(quantities[p.id] || 0) > 0 && (
                        <input type="number" value={rates[p.id] || ''} onChange={e => setRates(r => ({ ...r, [p.id]: Number(e.target.value) || 0 }))}
                          placeholder="Rate"
                          style={{ width: '65px', padding: '5px 6px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', fontWeight: '700', outline: 'none', textAlign: 'center', color: '#333', background: 'white' }} />
                      )}
                      <button onClick={() => setQuantities(q => ({ ...q, [p.id]: Math.max(0, (q[p.id] || 0) - 1) }))} style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #ddd', background: '#f5f5f5', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>−</button>
                      <span style={{ fontSize: '14px', fontWeight: '700', minWidth: '20px', textAlign: 'center', color: (quantities[p.id] || 0) > 0 ? '#0f4c81' : '#ccc' }}>{quantities[p.id] || 0}</span>
                      <button onClick={() => setQuantities(q => ({ ...q, [p.id]: (q[p.id] || 0) + 1 }))} style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #0f4c81', background: '#0f4c81', color: 'white', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showInvoice && lastDelivery && (
        <InvoiceModal
          deliveries={[lastDelivery]}
          customer={selectedCustomer || { full_name: customerName || 'Walk-in', mobile: '', customer_code: '', address: '' }}
          settings={settings}
          onClose={() => setShowInvoice(false)}
        />
      )}
    </div>
  )
}
