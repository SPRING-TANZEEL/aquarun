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

  useEffect(() => { if (tenantId) fetchExtraProducts() }, [tenantId])

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

  const extraTotal = extraProducts.reduce((s, p) => s + (extraQuantities[p.id] || 0) * (extraRates[p.id] || 0), 0)
  const total = (qty19l * (rate19l || 0)) + (qtyHalf * rateHalf) + (qty15l * rate15l) + extraTotal

  async function postSale() {
    if (qty19l === 0 && qtyHalf === 0 && qty15l === 0 && !extraProducts.some(p => extraQuantities[p.id] > 0))
      return alert('Please enter at least one item')
    if (qty19l > 0 && !rate19l) return alert('Please select or enter rate for 19L bottle')
    if (paymentMethod === 'credit' && !selectedCustomer) return alert('Please select a customer for credit sale')

    setSaving(true)
    const walkinName = selectedCustomer?.full_name || customerName || 'Walk-in Customer'

    // Build description including extra products
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

    // ✅ Reduce stock for extra products
    for (const p of extraProducts.filter(p => (extraQuantities[p.id] || 0) > 0)) {
      const newStock = Math.max(0, Number(p.current_stock || 0) - extraQuantities[p.id])
      await supabase.from('products')
        .update({ current_stock: newStock })
        .eq('id', p.id)
        .eq('tenant_id', tenantId)
    }

    // Update customer balance if credit
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
    await fetchExtraProducts() // refresh stock
    setSaving(false)
  }

  const inp = { width: '100%', padding: '10px 12px', border: '1.5px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'start' }}>

      {/* LEFT COLUMN */}
      <div>

        {success && (
          <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '12px 16px', marginBottom: '12px' }}>
            <p style={{ fontWeight: '700', color: '#1b5e20', margin: '0 0 4px' }}>✅ Sale Posted!</p>
            <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>👤 {success.name}</p>
            <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 4px' }}>{success.desc}</p>
            <p style={{ fontSize: '15px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>Rs. {success.total.toLocaleString()} — {success.paymentMethod}</p>
            <button onClick={() => setSuccess(null)}
              style={{ marginTop: '8px', padding: '4px 14px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '12px' }}>
              + New Sale
            </button>
          </div>
        )}

        {/* Payment Method */}
        <div style={{ background: 'white', borderRadius: '10px', padding: '14px', marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: '#888', marginBottom: '8px', textTransform: 'uppercase' }}>Payment Method</p>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[
              { key: 'cash', label: 'نقد Cash', icon: '💵', color: '#1a7a4a' },
              { key: 'jazzcash', label: 'JazzCash', icon: '📱', color: '#9c27b0' },
              { key: 'credit', label: 'ادھار', icon: '📋', color: '#f44336' },
            ].map(pm => (
              <button key={pm.key} onClick={() => { setPaymentMethod(pm.key); if (pm.key !== 'credit') { setSelectedCustomer(null); setCustomerSearch('') } }}
                style={{ flex: 1, padding: '10px 4px', border: '2px solid', borderColor: paymentMethod === pm.key ? pm.color : '#eee', borderRadius: '8px', cursor: 'pointer', background: paymentMethod === pm.key ? pm.color : 'white', color: paymentMethod === pm.key ? 'white' : '#555', fontWeight: '700', fontSize: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                <span style={{ fontSize: '18px' }}>{pm.icon}</span>
                <span>{pm.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Customer */}
        <div style={{ background: 'white', borderRadius: '10px', padding: '14px', marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: '#888', marginBottom: '8px', textTransform: 'uppercase' }}>
            Customer {paymentMethod === 'credit' ? '★ Required' : '(Optional)'}
          </p>
          {selectedCustomer ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#e3f0ff', borderRadius: '8px' }}>
              <div>
                <p style={{ fontWeight: '600', fontSize: '13px', margin: '0 0 2px' }}>{selectedCustomer.full_name}</p>
                <p style={{ fontSize: '11px', color: '#555', margin: 0 }}>Balance: Rs. {Number(selectedCustomer.balance || 0).toLocaleString()}</p>
              </div>
              <button onClick={() => { setSelectedCustomer(null); setCustomerSearch('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '16px' }}>✕</button>
            </div>
          ) : (
            <div>
              {paymentMethod !== 'credit' && (
                <input value={customerName} onChange={e => setCustomerName(e.target.value)}
                  placeholder="Walk-in name (optional)" style={{ ...inp, marginBottom: '6px' }} />
              )}
              <input value={customerSearch} onChange={e => searchCustomer(e.target.value)}
                placeholder="Search existing customer..." style={inp} />
              {customerResults.map(c => (
                <div key={c.id} onClick={() => { setSelectedCustomer(c); setCustomerResults([]); setCustomerName('') }}
                  style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', background: 'white' }}>
                  <div>
                    <p style={{ fontWeight: '600', fontSize: '12px', margin: '0 0 1px' }}>{c.full_name}</p>
                    <p style={{ fontSize: '10px', color: '#888', margin: 0 }}>{c.mobile}</p>
                  </div>
                  <p style={{ fontSize: '12px', fontWeight: '700', color: Number(c.balance) > 0 ? '#f44336' : '#1a7a4a', margin: 0 }}>
                    Rs. {Math.abs(Number(c.balance)).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div style={{ background: 'white', borderRadius: '10px', padding: '14px', marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: '#888', marginBottom: '6px', textTransform: 'uppercase' }}>Notes (optional)</p>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any note..." style={inp} />
        </div>

        {/* TOTAL & SUBMIT */}
        <div style={{ background: 'white', borderRadius: '10px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          {qty19l > 0 && rate19l && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#555', marginBottom: '3px' }}><span>🍶 19L ×{qty19l} @Rs.{rate19l}</span><span>Rs. {(qty19l * rate19l).toLocaleString()}</span></div>}
          {qtyHalf > 0 && rateHalf > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#555', marginBottom: '3px' }}><span>💧 Half ×{qtyHalf} @Rs.{rateHalf}</span><span>Rs. {(qtyHalf * rateHalf).toLocaleString()}</span></div>}
          {qty15l > 0 && rate15l > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#555', marginBottom: '3px' }}><span>🧴 1.5L ×{qty15l} @Rs.{rate15l}</span><span>Rs. {(qty15l * rate15l).toLocaleString()}</span></div>}
          {extraProducts.filter(p => (extraQuantities[p.id] || 0) > 0).map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#555', marginBottom: '3px' }}>
              <span>{p.name} ×{extraQuantities[p.id]}</span>
              <span>Rs. {(extraQuantities[p.id] * extraRates[p.id]).toLocaleString()}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid #eee', paddingTop: '10px', marginTop: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '15px', fontWeight: '700' }}>Total</span>
            <span style={{ fontSize: '28px', fontWeight: '700', color: '#0f4c81' }}>Rs. {total.toLocaleString()}</span>
          </div>
          {paymentMethod === 'credit' && selectedCustomer && (
            <p style={{ fontSize: '12px', color: '#f44336', background: '#ffebee', padding: '8px 10px', borderRadius: '6px', marginBottom: '10px', fontWeight: '600' }}>
              📋 Added to {selectedCustomer.full_name}'s balance
            </p>
          )}
          <button onClick={postSale} disabled={saving}
            style={{ width: '100%', padding: '14px', background: paymentMethod === 'cash' ? '#1a7a4a' : paymentMethod === 'jazzcash' ? '#9c27b0' : '#f44336', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
            {saving ? 'Saving...' : `✓ ${paymentMethod === 'cash' ? '💵 Cash Sale' : paymentMethod === 'jazzcash' ? '📱 JazzCash Sale' : '📋 Credit Sale'} — Rs. ${total.toLocaleString()}`}
          </button>
        </div>
      </div>

      {/* RIGHT COLUMN */}
      <div>

        {/* 19L — Main Product */}
        <div style={{ background: 'white', borderRadius: '10px', padding: '16px', marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #e3f0ff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <p style={{ fontSize: '15px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>🍶 19 Litre Bottle</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button onClick={() => setQty19l(Math.max(0, qty19l - 1))}
                style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid #ddd', background: '#f5f5f5', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
              <span style={{ fontSize: '22px', fontWeight: '700', minWidth: '32px', textAlign: 'center', color: '#0f4c81' }}>{qty19l}</span>
              <button onClick={() => setQty19l(qty19l + 1)}
                style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid #0f4c81', background: '#0f4c81', color: 'white', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
            </div>
          </div>
          {/* Rate buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
            {RATES_19L.map(r => (
              <button key={r} onClick={() => setRate19l(r)}
                style={{ padding: '8px 12px', border: '2px solid', borderColor: rate19l === r ? '#0f4c81' : '#eee', borderRadius: '8px', cursor: 'pointer', background: rate19l === r ? '#0f4c81' : '#f8f9fa', color: rate19l === r ? 'white' : '#333', fontWeight: '700', fontSize: '13px' }}>
                Rs.{r}
              </button>
            ))}
          </div>
          <input type="number" value={rate19l || ''} onChange={e => setRate19l(e.target.value === '' ? null : Number(e.target.value))}
            placeholder="Manual rate e.g. 130"
            style={{ ...inp, fontSize: '15px', fontWeight: '700', textAlign: 'center' }} />
          {rate19l && qty19l > 0 && <p style={{ fontSize: '12px', color: '#0f4c81', fontWeight: '700', margin: '6px 0 0', textAlign: 'center' }}>= Rs. {(qty19l * rate19l).toLocaleString()}</p>}
        </div>

        {/* Half Litre */}
        <div style={{ background: 'white', borderRadius: '10px', padding: '12px 16px', marginBottom: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>💧 Half Litre</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {qtyHalf > 0 && (
                <input type="number" value={rateHalf || ''} onChange={e => setRateHalf(Number(e.target.value) || 0)}
                  placeholder="Rate" style={{ width: '80px', padding: '6px 8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', fontWeight: '700', outline: 'none', textAlign: 'center' }} />
              )}
              <button onClick={() => setQtyHalf(Math.max(0, qtyHalf - 1))}
                style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid #ddd', background: '#f5f5f5', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
              <span style={{ fontSize: '18px', fontWeight: '700', minWidth: '24px', textAlign: 'center', color: qtyHalf > 0 ? '#333' : '#ccc' }}>{qtyHalf}</span>
              <button onClick={() => setQtyHalf(qtyHalf + 1)}
                style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid #0f4c81', background: '#0f4c81', color: 'white', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
            </div>
          </div>
          {qtyHalf > 0 && rateHalf > 0 && <p style={{ fontSize: '11px', color: '#0f4c81', fontWeight: '600', margin: '4px 0 0', textAlign: 'right' }}>= Rs. {(qtyHalf * rateHalf).toLocaleString()}</p>}
        </div>

        {/* 1.5L */}
        <div style={{ background: 'white', borderRadius: '10px', padding: '12px 16px', marginBottom: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>🧴 1.5 Litre</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {qty15l > 0 && (
                <input type="number" value={rate15l || ''} onChange={e => setRate15l(Number(e.target.value) || 0)}
                  placeholder="Rate" style={{ width: '80px', padding: '6px 8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px', fontWeight: '700', outline: 'none', textAlign: 'center' }} />
              )}
              <button onClick={() => setQty15l(Math.max(0, qty15l - 1))}
                style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid #ddd', background: '#f5f5f5', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
              <span style={{ fontSize: '18px', fontWeight: '700', minWidth: '24px', textAlign: 'center', color: qty15l > 0 ? '#333' : '#ccc' }}>{qty15l}</span>
              <button onClick={() => setQty15l(qty15l + 1)}
                style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid #0f4c81', background: '#0f4c81', color: 'white', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
            </div>
          </div>
          {qty15l > 0 && rate15l > 0 && <p style={{ fontSize: '11px', color: '#0f4c81', fontWeight: '600', margin: '4px 0 0', textAlign: 'right' }}>= Rs. {(qty15l * rate15l).toLocaleString()}</p>}
        </div>

        {/* Extra Products — compact one-line each */}
        {extraProducts.length > 0 && (
          <div style={{ background: 'white', borderRadius: '10px', padding: '12px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#888', marginBottom: '10px', textTransform: 'uppercase' }}>Other Products</p>
            {extraProducts.map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>{p.name}</span>
                  <span style={{ fontSize: '11px', color: '#aaa', marginLeft: '6px' }}>Stock: {p.current_stock}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {(extraQuantities[p.id] || 0) > 0 && (
                    <input type="number" value={extraRates[p.id] || ''}
                      onChange={e => setExtraRates(r => ({ ...r, [p.id]: Number(e.target.value) || 0 }))}
                      placeholder="Rate"
                      style={{ width: '70px', padding: '5px 6px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', fontWeight: '700', outline: 'none', textAlign: 'center' }} />
                  )}
                  <button onClick={() => setExtraQuantities(q => ({ ...q, [p.id]: Math.max(0, (q[p.id] || 0) - 1) }))}
                    style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #ddd', background: '#f5f5f5', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                  <span style={{ fontSize: '15px', fontWeight: '700', minWidth: '20px', textAlign: 'center', color: (extraQuantities[p.id] || 0) > 0 ? '#0f4c81' : '#ccc' }}>{extraQuantities[p.id] || 0}</span>
                  <button onClick={() => setExtraQuantities(q => ({ ...q, [p.id]: (q[p.id] || 0) + 1 }))}
                    style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #0f4c81', background: '#0f4c81', color: 'white', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}