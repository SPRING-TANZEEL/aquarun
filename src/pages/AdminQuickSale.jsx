import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const RATES_19L = [90, 100, 110, 120, 150, 160, 170, 180]

export default function AdminQuickSale({ tenantId }) {
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

  // ✅ Auto-fetch customer rates when customer selected
  function selectCustomer(c) {
    setSelectedCustomer(c)
    setCustomerResults([])
    setCustomerName('')
    // Auto-set rates from customer profile
    if (c.rate_19l) setRate19l(Number(c.rate_19l))
    if (c.rate_half_litre) setRateHalf(Number(c.rate_half_litre))
    if (c.rate_1_5l) setRate15l(Number(c.rate_1_5l))
  }

  const extraTotal = extraProducts.reduce((s, p) => s + (extraQuantities[p.id] || 0) * (extraRates[p.id] || 0), 0)
  const total = (qty19l * (rate19l || 0)) + (qtyHalf * rateHalf) + (qty15l * rate15l) + extraTotal

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

    // Reduce stock for extra products
    for (const p of extraProducts.filter(p => (extraQuantities[p.id] || 0) > 0)) {
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

    setSuccess({ total, paymentMethod, name: walkinName, desc: descParts.join(', ') })
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
    background: 'white'
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
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>⚡ Quick Sale</h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Walk-in · Cash · JazzCash · Credit</p>
      </div>

      {/* Success */}
      {success && (
        <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
          <p style={{ fontWeight: '700', color: '#1b5e20', margin: '0 0 4px' }}>✅ Sale Posted!</p>
          <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>👤 {success.name}</p>
          <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 4px' }}>{success.desc}</p>
          <p style={{ fontSize: '15px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>Rs. {success.total.toLocaleString()} — {success.paymentMethod}</p>
          <button onClick={() => setSuccess(null)}
            style={{ marginTop: '8px', padding: '5px 14px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
            + New Sale
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', alignItems: 'start' }}>

        {/* ── LEFT / TOP COLUMN ── */}
        <div>

          {/* Payment Method */}
          <div style={card}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payment Method</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { key: 'cash', label: 'Cash', urdu: 'نقد', icon: '💵', color: '#1a7a4a', bg: '#e8f5e9' },
                { key: 'jazzcash', label: 'JazzCash', urdu: 'JZC', icon: '📱', color: '#9c27b0', bg: '#f3e5f5' },
                { key: 'credit', label: 'Credit', urdu: 'ادھار', icon: '📋', color: '#f44336', bg: '#ffebee' },
              ].map(pm => (
                <button key={pm.key} onClick={() => { setPaymentMethod(pm.key); if (pm.key !== 'credit') { setSelectedCustomer(null); setCustomerSearch('') } }}
                  style={{ flex: 1, padding: '12px 4px', border: '2px solid', borderColor: paymentMethod === pm.key ? pm.color : '#eee', borderRadius: '10px', cursor: 'pointer', background: paymentMethod === pm.key ? pm.color : 'white', color: paymentMethod === pm.key ? 'white' : '#555', fontWeight: '700', fontSize: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', transition: 'all 0.15s' }}>
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
                    ✅ Rates auto-loaded: 19L=Rs.{selectedCustomer.rate_19l}
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
            {/* Breakdown */}
            {[
              qty19l > 0 && rate19l && { label: `🍶 19L ×${qty19l}`, val: qty19l * rate19l },
              qtyHalf > 0 && rateHalf > 0 && { label: `💧 Half ×${qtyHalf}`, val: qtyHalf * rateHalf },
              qty15l > 0 && rate15l > 0 && { label: `🧴 1.5L ×${qty15l}`, val: qty15l * rate15l },
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

        {/* ── RIGHT / BOTTOM COLUMN ── */}
        <div>

          {/* 19L — Main */}
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
                  style={{ padding: '8px 14px', border: '2px solid', borderColor: rate19l === r ? '#0f4c81' : '#eee', borderRadius: '8px', cursor: 'pointer', background: rate19l === r ? '#0f4c81' : '#f8f9fa', color: rate19l === r ? 'white' : '#333', fontWeight: '700', fontSize: '13px', transition: 'all 0.1s' }}>
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

          {/* Half Litre — compact */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>💧 Half Litre <span style={{ fontSize: '11px', color: '#aaa', fontWeight: '400' }}>optional</span></p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {qtyHalf > 0 && (
                  <input type="number" value={rateHalf || ''} onChange={e => setRateHalf(Number(e.target.value) || 0)}
                    placeholder="Rate"
                    style={{ width: '75px', padding: '7px 8px', border: '1.5px solid #ddd', borderRadius: '6px', fontSize: '13px', fontWeight: '700', outline: 'none', textAlign: 'center' }} />
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

          {/* 1.5L — compact */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>🧴 1.5 Litre <span style={{ fontSize: '11px', color: '#aaa', fontWeight: '400' }}>optional</span></p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {qty15l > 0 && (
                  <input type="number" value={rate15l || ''} onChange={e => setRate15l(Number(e.target.value) || 0)}
                    placeholder="Rate"
                    style={{ width: '75px', padding: '7px 8px', border: '1.5px solid #ddd', borderRadius: '6px', fontSize: '13px', fontWeight: '700', outline: 'none', textAlign: 'center' }} />
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

          {/* Extra Products — compact rows */}
          {extraProducts.length > 0 && (
            <div style={card}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Other Products</p>
              {extraProducts.map((p, i) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < extraProducts.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 1px', color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                    <p style={{ fontSize: '10px', color: '#aaa', margin: 0 }}>Stock: {p.current_stock} · Rs.{p.sale_price}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: '8px' }}>
                    {(extraQuantities[p.id] || 0) > 0 && (
                      <input type="number" value={extraRates[p.id] || ''}
                        onChange={e => setExtraRates(r => ({ ...r, [p.id]: Number(e.target.value) || 0 }))}
                        placeholder="Rate"
                        style={{ width: '65px', padding: '5px 6px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', fontWeight: '700', outline: 'none', textAlign: 'center' }} />
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
    </div>
  )
}