import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const RATES = [90, 100, 110, 120, 150, 160, 170, 180]

export default function AdminQuickSale({ tenantId }) {
  const [products, setProducts] = useState([])
  const [quantities, setQuantities] = useState({})
  const [rates, setRates] = useState({})
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [notes, setNotes] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  useEffect(() => { if (tenantId) fetchProducts() }, [tenantId])

  async function fetchProducts() {
    const { data } = await supabase.from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .eq('is_saleable', true)
      .order('product_type').order('name')
    setProducts(data || [])
    // Initialize quantities to 0
    const q = {}
    const r = {}
    data?.forEach(p => {
      // Default 19L to quantity 1, others to 0
      const is19l = p.name.includes('19')
      q[p.id] = is19l ? 1 : 0
      r[p.id] = Number(p.sale_price) || 0
    })
    setQuantities(q)
    setRates(r)
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

  const total = products.reduce((sum, p) => {
    return sum + (quantities[p.id] || 0) * (rates[p.id] || 0)
  }, 0)

  const hasItems = products.some(p => (quantities[p.id] || 0) > 0)

  async function postSale() {
    if (!hasItems) return alert('Please enter at least one item')
    if (paymentMethod === 'credit' && !selectedCustomer) return alert('Please select a customer for credit sale')

    // Check all selected items have a rate
    for (const p of products) {
      if ((quantities[p.id] || 0) > 0 && !(rates[p.id] || 0)) {
        return alert(`Please enter rate for ${p.name}`)
      }
    }

    setSaving(true)

    // Build delivery data — map products to delivery columns
    const qty19l = quantities[products.find(p => p.name.includes('19'))?.id] || 0
    const qtyHalf = quantities[products.find(p => p.name.toLowerCase().includes('half'))?.id] || 0
    const qty15l = quantities[products.find(p => p.name.includes('1.5'))?.id] || 0

    // For custom products not matching standard names, use notes
    const customItems = products
      .filter(p => (quantities[p.id] || 0) > 0 && !p.name.includes('19') && !p.name.toLowerCase().includes('half') && !p.name.includes('1.5'))
      .map(p => `${p.name} x${quantities[p.id]} @ Rs.${rates[p.id]}`)
      .join(', ')

    const rate19l = rates[products.find(p => p.name.includes('19'))?.id] || 0

    const deliveryData = {
      tenant_id: tenantId,
      customer_id: selectedCustomer?.id || null,
      rider_id: null,
      qty_19l: qty19l,
      qty_half_litre: qtyHalf,
      qty_1_5l: qty15l,
      rate_applied: rate19l,
      total_amount: total,
      payment_method: paymentMethod,
      amount_received: paymentMethod === 'credit' ? 0 : paymentMethod === 'jazzcash' ? 0 : total,
      credit_amount: paymentMethod === 'credit' ? total : 0,
      jazzcash_confirmed: false,
      delivered_at: new Date().toISOString(),
      is_voided: false,
      notes: [notes, customItems].filter(Boolean).join(' | ') || 'Walk-in sale — Admin'
    }

    const { data: savedDelivery, error } = await supabase
      .from('deliveries').insert([deliveryData]).select().single()

    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    // Update customer balance if credit
    if (paymentMethod === 'credit' && selectedCustomer) {
      await supabase.from('customers')
        .update({ balance: Number(selectedCustomer.balance || 0) + total })
        .eq('id', selectedCustomer.id)
        .eq('tenant_id', tenantId)
    }

    // Post journal entry
    try {
      const { postDeliveryJournal } = await import('../accountingEngine')
      await postDeliveryJournal(savedDelivery, selectedCustomer?.id || null, tenantId)
    } catch (err) { console.error('Journal post error:', err) }

    // Reset
    setSuccess({ total, paymentMethod, customer: selectedCustomer?.full_name, items: products.filter(p => (quantities[p.id] || 0) > 0).map(p => `${p.name} × ${quantities[p.id]} @ Rs.${rates[p.id]}`) })
    const q = {}
    products.forEach(p => { q[p.id] = 0 })
    setQuantities(q)
    setPaymentMethod('cash')
    setNotes('')
    setSelectedCustomer(null)
    setCustomerSearch('')
    setSaving(false)
  }

  function numBtn(id) {
    const val = quantities[id] || 0
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => setQuantities(q => ({ ...q, [id]: Math.max(0, (q[id] || 0) - 1) }))}
          style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid #ddd', background: '#f5f5f5', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
        <span style={{ fontSize: '24px', fontWeight: '700', minWidth: '36px', textAlign: 'center' }}>{val}</span>
        <button onClick={() => setQuantities(q => ({ ...q, [id]: (q[id] || 0) + 1 }))}
          style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid #0f4c81', background: '#0f4c81', color: 'white', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
      </div>
    )
  }

  const inp = { width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>⚡ Quick Sale — Walk-in</h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Cash, JazzCash or Credit sale from shop</p>
      </div>

      {success && (
        <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <p style={{ fontWeight: '700', color: '#1b5e20', marginBottom: '6px' }}>✅ Sale Posted!</p>
          {success.items.map((item, i) => <p key={i} style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>{item}</p>)}
          <p style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a', margin: '6px 0 2px' }}>Total: Rs. {success.total.toLocaleString()} — {success.paymentMethod}</p>
          {success.customer && <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>Customer: {success.customer}</p>}
          <button onClick={() => setSuccess(null)}
            style={{ marginTop: '10px', padding: '6px 16px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
            + New Sale
          </button>
        </div>
      )}

      {/* Payment Method */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
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
        {paymentMethod === 'jazzcash' && <p style={{ fontSize: '12px', color: '#9c27b0', margin: '10px 0 0', background: '#f3e5f5', padding: '8px 12px', borderRadius: '8px' }}>📱 Confirm in JazzCash Reconciliation after receiving</p>}
        {paymentMethod === 'credit' && <p style={{ fontSize: '12px', color: '#f44336', margin: '10px 0 0', background: '#ffebee', padding: '8px 12px', borderRadius: '8px' }}>📋 Select customer below — balance will be updated</p>}
      </div>

      {/* Customer Search — credit only */}
      {paymentMethod === 'credit' && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px', textTransform: 'uppercase' }}>Select Customer *</p>
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
              <input value={customerSearch} onChange={e => searchCustomer(e.target.value)}
                placeholder="Search by name, mobile or ID..."
                style={inp} />
              {customerResults.map(c => (
                <div key={c.id} onClick={() => { setSelectedCustomer(c); setCustomerResults([]) }}
                  style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontWeight: '600', fontSize: '13px', margin: '0 0 2px' }}>{c.full_name}</p>
                    <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{c.mobile} · {c.customer_code}</p>
                  </div>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: Number(c.balance) > 0 ? '#f44336' : '#1a7a4a', margin: 0 }}>Rs. {Math.abs(Number(c.balance)).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Products */}
      {products.length === 0 ? (
        <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '12px' }}>
          <p style={{ fontSize: '32px', marginBottom: '8px' }}>📦</p>
          <p style={{ fontWeight: '700', color: '#333', marginBottom: '4px' }}>No Saleable Products Found</p>
          <p style={{ fontSize: '13px', color: '#888' }}>Go to Inventory → Products → mark products as "Show in Customer Portal"</p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '16px', textTransform: 'uppercase' }}>Select Products</p>
          {products.map((p, i) => (
            <div key={p.id} style={{ paddingBottom: '16px', marginBottom: '16px', borderBottom: i < products.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: (quantities[p.id] || 0) > 0 ? '12px' : '0' }}>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: '600', margin: '0 0 2px' }}>{p.name}</p>
                  <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
                    Default rate: Rs. {Number(p.sale_price || 0).toLocaleString()}
                    {p.current_stock > 0 && <span style={{ marginLeft: '8px', color: '#1a7a4a' }}>Stock: {p.current_stock}</span>}
                  </p>
                </div>
                {numBtn(p.id)}
              </div>

              {/* Rate input — only show if quantity > 0 */}
              {(quantities[p.id] || 0) > 0 && (
                <div style={{ background: '#f0f7ff', borderRadius: '8px', padding: '12px' }}>
                  <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '8px' }}>Rate for {p.name} (Rs.)</p>
                  {p.name.includes('19') && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                      {RATES.map(r => (
                        <button key={r} onClick={() => setRates(prev => ({ ...prev, [p.id]: r }))}
                          style={{ padding: '8px 12px', border: '2px solid', borderColor: rates[p.id] === r ? '#0f4c81' : '#eee', borderRadius: '8px', cursor: 'pointer', background: rates[p.id] === r ? '#0f4c81' : 'white', color: rates[p.id] === r ? 'white' : '#333', fontWeight: '700', fontSize: '13px' }}>
                          Rs. {r}
                        </button>
                      ))}
                    </div>
                  )}
                  <input type="number"
                    value={rates[p.id] || ''}
                    onChange={e => setRates(prev => ({ ...prev, [p.id]: Number(e.target.value) || 0 }))}
                    placeholder={`Rate e.g. ${p.sale_price || 100}`}
                    style={{ ...inp, fontSize: '16px', fontWeight: '700', textAlign: 'center' }} />
                  {rates[p.id] > 0 && quantities[p.id] > 0 && (
                    <p style={{ fontSize: '12px', color: '#0f4c81', fontWeight: '600', margin: '6px 0 0', textAlign: 'center' }}>
                      {quantities[p.id]} × Rs. {rates[p.id]} = Rs. {(quantities[p.id] * rates[p.id]).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '8px' }}>Notes (optional)</p>
        <input value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="e.g. Walk-in customer, roadside sale..."
          style={inp} />
      </div>

      {/* Total & Submit */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '15px', color: '#555' }}>Total Amount</span>
          <span style={{ fontSize: '32px', fontWeight: '700', color: '#0f4c81' }}>Rs. {total.toLocaleString()}</span>
        </div>

        {/* Item breakdown */}
        {products.filter(p => (quantities[p.id] || 0) > 0).map(p => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#888', marginBottom: '4px' }}>
            <span>{p.name} × {quantities[p.id]}</span>
            <span>Rs. {((quantities[p.id] || 0) * (rates[p.id] || 0)).toLocaleString()}</span>
          </div>
        ))}

        {paymentMethod === 'credit' && selectedCustomer && (
          <div style={{ background: '#ffebee', borderRadius: '8px', padding: '10px 14px', margin: '12px 0' }}>
            <p style={{ fontSize: '12px', color: '#f44336', fontWeight: '600', margin: 0 }}>📋 Rs. {total.toLocaleString()} will be added to {selectedCustomer.full_name}'s balance</p>
          </div>
        )}

        <button onClick={postSale} disabled={saving || !hasItems}
          style={{ width: '100%', padding: '16px', marginTop: '12px', background: !hasItems ? '#ccc' : paymentMethod === 'cash' ? '#1a7a4a' : paymentMethod === 'jazzcash' ? '#9c27b0' : '#f44336', color: 'white', border: 'none', borderRadius: '10px', cursor: hasItems ? 'pointer' : 'not-allowed', fontSize: '16px', fontWeight: '700' }}>
          {saving ? 'Saving...' : `✓ Complete ${paymentMethod === 'cash' ? 'Cash' : paymentMethod === 'jazzcash' ? 'JazzCash' : 'Credit'} Sale`}
        </button>
      </div>
    </div>
  )
}