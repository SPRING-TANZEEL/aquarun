import { useState } from 'react'
import { supabase } from '../supabase'

const RATES = [90, 100, 110, 120, 150, 160, 170, 180]

export default function RiderQuickSale({ rider, tenantId }) {
  const [selectedRate, setSelectedRate] = useState(null)
  const [qty, setQty] = useState(1)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)

  async function postQuickSale() {
    if (!selectedRate) return alert('Please select a rate first')
    if (qty < 1) return alert('Quantity must be at least 1')

    setSaving(true)
    const total = selectedRate * qty

    const { data: savedDelivery, error } = await supabase.from('deliveries').insert([{
      tenant_id: tenantId,
      customer_id: null,
      rider_id: rider.id,
      qty_19l: qty,
      qty_half_litre: 0,
      qty_1_5l: 0,
      rate_applied: selectedRate,
      total_amount: total,
      payment_method: paymentMethod,
      amount_received: paymentMethod === 'jazzcash' ? 0 : total,
      credit_amount: 0,
      jazzcash_confirmed: false,
      delivered_at: new Date().toISOString(),
      is_voided: false
    }]).select().single()

    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    try {
      const { postDeliveryJournal } = await import('../accountingEngine')
      await postDeliveryJournal(savedDelivery, null, tenantId, true) // true = rider entry → DR 1101
    } catch (err) { console.error('Journal error:', err) }

    setSuccess({ qty, rate: selectedRate, total, paymentMethod })
    setSelectedRate(null)
    setQty(1)
    setPaymentMethod('cash')
    setSaving(false)
  }

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '4px' }}>⚡ Quick Sale</h2>
      <p style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>Walk-in or roadside customer — no account needed</p>

      {success && (
        <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
          <p style={{ fontWeight: '700', color: '#1b5e20', marginBottom: '4px' }}>✅ Sale Posted!</p>
          <p style={{ fontSize: '13px', color: '#2e7d32' }}>
            {success.qty} bottle × Rs. {success.rate} = <strong>Rs. {success.total.toLocaleString()}</strong> — {success.paymentMethod}
          </p>
          <button onClick={() => setSuccess(null)}
            style={{ marginTop: '8px', padding: '4px 12px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '12px' }}>
            New Sale
          </button>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>Select Rate — 19 Litre</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          {RATES.map(r => (
            <button key={r} onClick={() => setSelectedRate(r)}
              style={{ padding: '18px', border: '2px solid', borderColor: selectedRate === r ? '#0f4c81' : '#eee', borderRadius: '12px', cursor: 'pointer', background: selectedRate === r ? '#0f4c81' : '#f8f9fa', color: selectedRate === r ? 'white' : '#333', fontWeight: '700', fontSize: '20px' }}>
              Rs. {r}
            </button>
          ))}
        </div>
        <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>یا خود لکھیں (Manual Rate)</p>
        <input
          type="number"
          value={selectedRate || ''}
          onChange={e => setSelectedRate(e.target.value === '' ? null : Number(e.target.value))}
          placeholder="e.g. 130"
          style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '24px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }}
        />
        {selectedRate && (
          <p style={{ fontSize: '12px', color: '#0f4c81', fontWeight: '600', margin: '6px 0 0', textAlign: 'center' }}>
            ✅ Rate: Rs. {selectedRate} per bottle
          </p>
        )}
      </div>

      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>Quantity — 19L Bottles</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
          <button onClick={() => setQty(Math.max(1, qty - 1))}
            style={{ width: '50px', height: '50px', borderRadius: '50%', border: '2px solid #ddd', background: '#f5f5f5', fontSize: '24px', cursor: 'pointer' }}>−</button>
          <span style={{ fontSize: '48px', fontWeight: '700', color: '#0f4c81', minWidth: '60px', textAlign: 'center' }}>{qty}</span>
          <button onClick={() => setQty(qty + 1)}
            style={{ width: '50px', height: '50px', borderRadius: '50%', border: '2px solid #ddd', background: '#f5f5f5', fontSize: '24px', cursor: 'pointer' }}>+</button>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>Payment</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          {[
            { key: 'cash', label: 'نقد', sublabel: 'Cash', color: '#1a7a4a' },
            { key: 'jazzcash', label: 'جیز کیش', sublabel: 'JazzCash', color: '#9c27b0' },
          ].map(pm => (
            <button key={pm.key} onClick={() => setPaymentMethod(pm.key)}
              style={{ flex: 1, padding: '14px', border: '2px solid', borderColor: paymentMethod === pm.key ? pm.color : '#eee', borderRadius: '10px', cursor: 'pointer', background: paymentMethod === pm.key ? pm.color : 'white', color: paymentMethod === pm.key ? 'white' : '#555', fontWeight: '700', fontSize: '15px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <span>{pm.label}</span>
              <span style={{ fontSize: '10px', opacity: 0.8 }}>{pm.sublabel}</span>
            </button>
          ))}
        </div>
        {paymentMethod === 'jazzcash' && (
          <div style={{ marginTop: '10px', padding: '10px', background: '#fff3e0', borderRadius: '8px' }}>
            <p style={{ fontSize: '12px', color: '#e65100', margin: 0 }}>
              ⚠️ JazzCash goes directly to office. Admin will confirm when received.
            </p>
          </div>
        )}
      </div>

      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <p style={{ fontSize: '16px', color: '#555', margin: 0 }}>Total Amount</p>
          <p style={{ fontSize: '32px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>
            Rs. {((selectedRate || 0) * qty).toLocaleString()}
          </p>
        </div>
        <button onClick={postQuickSale} disabled={saving}
          style={{ width: '100%', padding: '16px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '16px', fontWeight: '700' }}>
          {saving ? 'Saving...' : '✓ محفوظ کریں'}
        </button>
      </div>
    </div>
  )
}