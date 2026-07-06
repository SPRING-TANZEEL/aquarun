import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const RATES_19L = [90, 100, 110, 120, 150, 160, 170, 180]

export default function AdminQuickSale({ tenantId }) {
  const [extraProducts, setExtraProducts] = useState([])
  const [extraQuantities, setExtraQuantities] = useState({})
  const [extraRates, setExtraRates] = useState({})

  // 19L — always shown by default
  const [qty19l, setQty19l] = useState(1)
  const [rate19l, setRate19l] = useState(null)

  // Half litre and 1.5L — always shown
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
    const q = {}
    const r = {}
    data?.forEach(p => { q[p.id] = 0; r[p.id] = Number(p.sale_price) || 0 })
    setExtraQuantities(q)
    setExtraRates(r)
  }

  async function searchCustomer(val) {
    setCustomerSearch(val)
    if (val.length < 2) { setCustomerResults([]); return }
    const { data } = await supabase.from('customers')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .or(`full_name.ilike.%${val}%,mobile.ilike.%${val}%,customer_code.ilike.%${val}%`)
      .limit(5)
    setCustomerResults(data || [])
  }

  const extraTotal = extraProducts.reduce((s, p) => s + (extraQuantities[p.id] || 0) * (extraRates[p.id] || 0), 0)
  const total = (qty19l * (rate19l || 0)) + (qtyHalf * rateHalf) + (qty15l * rate15l) + extraTotal

  async function postSale() {
    if (qty19l === 0 && qtyHalf === 0 && qty15l === 0 && !extraProducts.some(p => extraQuantities[p.id] > 0)) return alert('Please enter at least one item')
    if (qty19l > 0 && !rate19l) return alert('Please select or enter rate for 19L bottle')
    if (paymentMethod === 'credit' && !selectedCustomer) return alert('Please select a customer for credit sale')

    setSaving(true)

    // Customer name for record
    const walkinName = selectedCustomer?.full_name || customerName || 'Walk-in Customer'

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
      notes: [
        walkinName !== 'Walk-in Customer' ? `Customer: ${walkinName}` : '',
        notes,
        extraProducts.filter(p => extraQuantities[p.id] > 0).map(p => `${p.name} x${extraQuantities[p.id]} @ Rs.${extraRates[p.id]}`).join(', ')
      ].filter(Boolean).join(' | ') || 'Walk-in sale — Admin'
    }

    const { data: savedDelivery, error } = await supabase
      .from('deliveries').insert([deliveryData]).select().single()
    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    if (paymentMethod === 'credit' && selectedCustomer) {
      await supabase.from('customers')
        .update({ balance: Number(selectedCustomer.balance || 0) + total })
        .eq('id', selectedCustomer.id)
        .eq('tenant_id', tenantId)
    }

    try {
      const { postDeliveryJournal } = await import('../accountingEngine')
      await postDeliveryJournal(savedDelivery, selectedCustomer?.id || null, tenantId)
    } catch (err) { console.error('Journal post error:', err) }

    setSuccess({ total, paymentMethod, name: walkinName, qty19l, qtyHalf, qty15l, rate19l })
    setQty19l(1); setRate19l(null)
    setQtyHalf(0); setRateHalf(0)
    setQty15l(0); setRate15l(0)
    setPaymentMethod('cash')
    setNotes(''); setCustomerName('')
    setSelectedCustomer(null); setCustomerSearch('')
    const q = {}; extraProducts.forEach(p => { q[p.id] = 0 })
    setExtraQuantities(q)
    setSaving(false)
  }

  function numBtn(val, setVal, min = 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => setVal(Math.max(min, val - 1))}
          style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid #ddd', background: val === 0 ? '#f5f5f5' : '#fff', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
        <span style={{ fontSize: '24px', fontWeight: '700', minWidth: '36px', textAlign: 'center', color: val > 0 ? '#0f4c81' : '#ccc' }}>{val}</span>
        <button onClick={() => setVal(val + 1)}
          style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid #0f4c81', background: '#0f4c81', color: 'white', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
      </div>
    )
  }

  const inp = { width: '100%', padding: '11px 14px', border: '1.5px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }
  const card = { background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>⚡ Quick Sale — Walk-in</h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Cash, JazzCash or Credit sale — goes to Admin / CEO account</p>
      </div>

      {success && (
        <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <p style={{ fontWeight: '700', color: '#1b5e20', marginBottom: '6px' }}>✅ Sale Posted!</p>
          <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>👤 {success.name}</p>
          {success.qty19l > 0 && <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>19L × {success.qty19l} @ Rs. {success.rate19l} = Rs. {(success.qty19l * success.rate19l).toLocaleString()}</p>}
          {success.qtyHalf > 0 && <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>Half Litre × {success.qtyHalf}</p>}
          {success.qty15l > 0 && <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>1.5L × {success.qty15l}</p>}
          <p style={{ fontSize: '15px', fontWeight: '700', color: '#1a7a4a', margin: '8px 0 0' }}>
            Total: Rs. {success.total.toLocaleString()} — {success.paymentMethod === 'cash' ? '💵 Cash' : success.paymentMethod === 'jazzcash' ? '📱 JazzCash' : '📋 Credit'}
          </p>
          <button onClick={() => setSuccess(null)}
            style={{ marginTop: '10px', padding: '6px 16px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
            + New Sale
          </button>
        </div>
      )}

      {/* PAYMENT METHOD */}
      <div style={card}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px', textTransform: 'uppercase' }}>Payment Method</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          {[
            { key: 'cash', label: 'نقد Cash', icon: '💵', color: '#1a7a4a' },
            { key: 'jazzcash', label: 'JazzCash', icon: '📱', color: '#9c27b0' },
            { key: 'credit', label: 'ادھار Credit', icon: '📋', color: '#f44336' },
          ].map(pm => (
            <button key={pm.key} onClick={() => { setPaymentMethod(pm.key); if (pm.key !== 'credit') { setSelectedCustomer(null); setCustomerSearch('') } }}
              style={{ flex: 1, padding: '14px 8px', border: '2px solid', borderColor: paymentMethod === pm.key ? pm.color : '#eee', borderRadius: '10px', cursor: 'pointer', background: paymentMethod === pm.key ? pm.color : 'white', color: paymentMethod === pm.key ? 'white' : '#555', fontWeight: '700', fontSize: '13px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '22px' }}>{pm.icon}</span>
              <span>{pm.label}</span>
            </button>
          ))}
        </div>
        {paymentMethod === 'cash' && <p style={{ fontSize: '12px', color: '#1a7a4a', margin: '10px 0 0', background: '#e8f5e9', padding: '8px 12px', borderRadius: '8px' }}>💵 Goes directly to CEO Cash in Hand</p>}
        {paymentMethod === 'jazzcash' && <p style={{ fontSize: '12px', color: '#9c27b0', margin: '10px 0 0', background: '#f3e5f5', padding: '8px 12px', borderRadius: '8px' }}>📱 Goes to CEO JazzCash — confirm in JazzCash Reconciliation</p>}
        {paymentMethod === 'credit' && <p style={{ fontSize: '12px', color: '#f44336', margin: '10px 0 0', background: '#ffebee', padding: '8px 12px', borderRadius: '8px' }}>📋 Select customer below — will be added to their balance</p>}
      </div>

      {/* CUSTOMER — required for credit, optional for cash/jazzcash */}
      <div style={card}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '4px', textTransform: 'uppercase' }}>
          Customer {paymentMethod === 'credit' ? '* (Required)' : '(Optional — for record)'}
        </p>
        <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '12px' }}>
          {paymentMethod === 'credit' ? 'Must select customer for credit sale' : 'Enter name or search existing customer'}
        </p>

        {selectedCustomer ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#e3f0ff', borderRadius: '8px' }}>
            <div>
              <p style={{ fontWeight: '600', fontSize: '14px', margin: '0 0 2px' }}>{selectedCustomer.full_name}</p>
              <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>{selectedCustomer.mobile} · Balance: Rs. {Number(selectedCustomer.balance || 0).toLocaleString()}</p>
            </div>
            <button onClick={() => { setSelectedCustomer(null); setCustomerSearch('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '18px' }}>✕</button>
          </div>
        ) : (
          <div>
            {/* Walk-in name for cash/jazzcash */}
            {paymentMethod !== 'credit' && (
              <input value={customerName} onChange={e => setCustomerName(e.target.value)}
                placeholder="Walk-in customer name (optional)"
                style={{ ...inp, marginBottom: '8px' }} />
            )}
            {/* Customer search */}
            <input value={customerSearch} onChange={e => searchCustomer(e.target.value)}
              placeholder="Or search existing customer..."
              style={inp} />
            {customerResults.map(c => (
              <div key={c.id} onClick={() => { setSelectedCustomer(c); setCustomerResults([]); setCustomerName('') }}
                style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', background: 'white' }}>
                <div>
                  <p style={{ fontWeight: '600', fontSize: '13px', margin: '0 0 2px' }}>{c.full_name}</p>
                  <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{c.mobile} · {c.customer_code}</p>
                </div>
                <p style={{ fontSize: '13px', fontWeight: '700', color: Number(c.balance) > 0 ? '#f44336' : '#1a7a4a', margin: 0 }}>
                  Rs. {Math.abs(Number(c.balance)).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 19L BOTTLE — always shown, default qty 1 */}
      <div style={{ ...card, border: '2px solid #e3f0ff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <p style={{ fontSize: '16px', fontWeight: '700', color: '#0f4c81', margin: '0 0 2px' }}>🍶 19 Litre Bottle</p>
            <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Main product — select rate below</p>
          </div>
          {numBtn(qty19l, setQty19l, 0)}
        </div>

        {/* Rate buttons — always visible */}
        <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '8px' }}>Select Rate (Rs. per bottle)</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
          {RATES_19L.map(r => (
            <button key={r} onClick={() => setRate19l(r)}
              style={{ padding: '10px 16px', border: '2px solid', borderColor: rate19l === r ? '#0f4c81' : '#eee', borderRadius: '10px', cursor: 'pointer', background: rate19l === r ? '#0f4c81' : '#f8f9fa', color: rate19l === r ? 'white' : '#333', fontWeight: '700', fontSize: '15px' }}>
              Rs. {r}
            </button>
          ))}
        </div>
        <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>یا خود لکھیں (Manual Rate)</p>
        <input type="number"
          value={rate19l || ''}
          onChange={e => setRate19l(e.target.value === '' ? null : Number(e.target.value))}
          placeholder="Type any rate e.g. 130"
          style={{ ...inp, fontSize: '18px', fontWeight: '700', textAlign: 'center' }} />
        {rate19l && qty19l > 0 && (
          <p style={{ fontSize: '13px', color: '#0f4c81', fontWeight: '700', margin: '8px 0 0', textAlign: 'center', background: '#e3f0ff', padding: '8px', borderRadius: '8px' }}>
            {qty19l} × Rs. {rate19l} = Rs. {(qty19l * rate19l).toLocaleString()}
          </p>
        )}
      </div>

      {/* HALF LITRE */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: qtyHalf > 0 ? '12px' : '0' }}>
          <div>
            <p style={{ fontSize: '15px', fontWeight: '600', color: '#333', margin: '0 0 2px' }}>💧 Half Litre Bottle</p>
            <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Optional</p>
          </div>
          {numBtn(qtyHalf, setQtyHalf)}
        </div>
        {qtyHalf > 0 && (
          <div style={{ marginTop: '12px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>Rate (Rs. per bottle)</p>
            <input type="number" value={rateHalf || ''} onChange={e => setRateHalf(Number(e.target.value) || 0)}
              placeholder="e.g. 50" style={{ ...inp, fontSize: '16px', fontWeight: '700', textAlign: 'center' }} />
            {rateHalf > 0 && <p style={{ fontSize: '12px', color: '#0f4c81', fontWeight: '600', margin: '6px 0 0', textAlign: 'center' }}>{qtyHalf} × Rs. {rateHalf} = Rs. {(qtyHalf * rateHalf).toLocaleString()}</p>}
          </div>
        )}
      </div>

      {/* 1.5L */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: qty15l > 0 ? '12px' : '0' }}>
          <div>
            <p style={{ fontSize: '15px', fontWeight: '600', color: '#333', margin: '0 0 2px' }}>🧴 1.5 Litre Bottle</p>
            <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Optional</p>
          </div>
          {numBtn(qty15l, setQty15l)}
        </div>
        {qty15l > 0 && (
          <div style={{ marginTop: '12px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>Rate (Rs. per bottle)</p>
            <input type="number" value={rate15l || ''} onChange={e => setRate15l(Number(e.target.value) || 0)}
              placeholder="e.g. 80" style={{ ...inp, fontSize: '16px', fontWeight: '700', textAlign: 'center' }} />
            {rate15l > 0 && <p style={{ fontSize: '12px', color: '#0f4c81', fontWeight: '600', margin: '6px 0 0', textAlign: 'center' }}>{qty15l} × Rs. {rate15l} = Rs. {(qty15l * rate15l).toLocaleString()}</p>}
          </div>
        )}
      </div>

      {/* EXTRA PRODUCTS FROM INVENTORY */}
      {extraProducts.length > 0 && (
        <div style={card}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '16px', textTransform: 'uppercase' }}>Other Products</p>
          {extraProducts.map((p, i) => (
            <div key={p.id} style={{ paddingBottom: '14px', marginBottom: '14px', borderBottom: i < extraProducts.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: (extraQuantities[p.id] || 0) > 0 ? '10px' : '0' }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>{p.name}</p>
                  <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Rs. {p.sale_price} · Stock: {p.current_stock}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button onClick={() => setExtraQuantities(q => ({ ...q, [p.id]: Math.max(0, (q[p.id] || 0) - 1) }))}
                    style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid #ddd', background: '#f5f5f5', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                  <span style={{ fontSize: '20px', fontWeight: '700', minWidth: '28px', textAlign: 'center', color: (extraQuantities[p.id] || 0) > 0 ? '#0f4c81' : '#ccc' }}>{extraQuantities[p.id] || 0}</span>
                  <button onClick={() => setExtraQuantities(q => ({ ...q, [p.id]: (q[p.id] || 0) + 1 }))}
                    style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid #0f4c81', background: '#0f4c81', color: 'white', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                </div>
              </div>
              {(extraQuantities[p.id] || 0) > 0 && (
                <div>
                  <input type="number" value={extraRates[p.id] || ''}
                    onChange={e => setExtraRates(r => ({ ...r, [p.id]: Number(e.target.value) || 0 }))}
                    placeholder={`Rate e.g. ${p.sale_price}`}
                    style={{ ...inp, fontSize: '15px', fontWeight: '700', textAlign: 'center' }} />
                  {extraRates[p.id] > 0 && <p style={{ fontSize: '12px', color: '#0f4c81', fontWeight: '600', margin: '4px 0 0', textAlign: 'center' }}>{extraQuantities[p.id]} × Rs. {extraRates[p.id]} = Rs. {(extraQuantities[p.id] * extraRates[p.id]).toLocaleString()}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* NOTES */}
      <div style={card}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '8px' }}>Notes (optional)</p>
        <input value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Any special note..." style={inp} />
      </div>

      {/* TOTAL & SUBMIT */}
      <div style={card}>
        {/* Breakdown */}
        {qty19l > 0 && rate19l && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#555', marginBottom: '4px' }}><span>🍶 19L × {qty19l} @ Rs.{rate19l}</span><span>Rs. {(qty19l * rate19l).toLocaleString()}</span></div>}
        {qtyHalf > 0 && rateHalf > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#555', marginBottom: '4px' }}><span>💧 Half × {qtyHalf} @ Rs.{rateHalf}</span><span>Rs. {(qtyHalf * rateHalf).toLocaleString()}</span></div>}
        {qty15l > 0 && rate15l > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#555', marginBottom: '4px' }}><span>🧴 1.5L × {qty15l} @ Rs.{rate15l}</span><span>Rs. {(qty15l * rate15l).toLocaleString()}</span></div>}
        {extraProducts.filter(p => extraQuantities[p.id] > 0).map(p => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#555', marginBottom: '4px' }}>
            <span>{p.name} × {extraQuantities[p.id]}</span>
            <span>Rs. {(extraQuantities[p.id] * extraRates[p.id]).toLocaleString()}</span>
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '2px solid #eee', marginTop: '8px', marginBottom: '12px' }}>
          <span style={{ fontSize: '16px', fontWeight: '700', color: '#333' }}>Total Amount</span>
          <span style={{ fontSize: '36px', fontWeight: '700', color: '#0f4c81' }}>Rs. {total.toLocaleString()}</span>
        </div>

        {paymentMethod === 'credit' && selectedCustomer && (
          <div style={{ background: '#ffebee', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
            <p style={{ fontSize: '12px', color: '#f44336', fontWeight: '600', margin: 0 }}>📋 Rs. {total.toLocaleString()} added to {selectedCustomer.full_name}'s balance</p>
          </div>
        )}

        <button onClick={postSale} disabled={saving}
          style={{ width: '100%', padding: '16px', background: paymentMethod === 'cash' ? '#1a7a4a' : paymentMethod === 'jazzcash' ? '#9c27b0' : '#f44336', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '16px', fontWeight: '700' }}>
          {saving ? 'Saving...' : `✓ Complete ${paymentMethod === 'cash' ? '💵 Cash' : paymentMethod === 'jazzcash' ? '📱 JazzCash' : '📋 Credit'} Sale — Rs. ${total.toLocaleString()}`}
        </button>
      </div>
    </div>
  )
}