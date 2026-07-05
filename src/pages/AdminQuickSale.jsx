import { useState } from 'react'
import { supabase } from '../supabase'

const RATES = [90, 100, 110, 120, 150, 160, 170, 180]

export default function AdminQuickSale({ tenantId }) {
  const [selectedRate, setSelectedRate] = useState(null)
  const [qty, setQty] = useState(1)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [notes, setNotes] = useState('')

  async function postQuickSale() {
    if (!selectedRate) return alert('Please select a rate first')
    if (qty < 1) return alert('Quantity must be at least 1')
    setSaving(true)
    const total = selectedRate * qty

    const { data: savedDelivery, error } = await supabase.from('deliveries').insert([{
      tenant_id: tenantId,
      customer_id: null,
      rider_id: null,
      qty_19l: qty,
      qty_half_litre: 0,
      qty_1_5l: 0,
      rate_applied: selectedRate,
      total_amount: total,
      payment_method: 'cash',
      amount_received: total,
      credit_amount: 0,
      jazzcash_confirmed: false,
      notes: notes || 'Walk-in cash sale — Admin',
      delivered_at: new Date().toISOString(),
      is_voided: false
    }]).select().single()

    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    // Post journal entry — cash in hand increases
    try {
      const { postDeliveryJournal } = await import('../accountingEngine')
      await postDeliveryJournal(savedDelivery, null, tenantId)
    } catch (err) { console.error('Journal post error:', err) }

    setSuccess({ qty, rate: selectedRate, total })
    setSelectedRate(null)
    setQty(1)
    setNotes('')
    setSaving(false)
  }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>⚡ Quick Sale — Walk-in</h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Cash sale from shop — goes directly to CEO Cash in Hand</p>
      </div>

      {success && (
        <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <p style={{ fontWeight: '700', color: '#1b5e20', marginBottom: '4px' }}>✅ Sale Posted!</p>
          <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>
            {success.qty} bottle × Rs. {success.rate} = <strong>Rs. {success.total.toLocaleString()}</strong>
          </p>
          <p style={{ fontSize: '12px', color: '#888', margin: '4px 0 0' }}>
            💵 Rs. {success.total.toLocaleString()} added to CEO Cash in Hand
          </p>
          <button onClick={() => setSuccess(null)}
            style={{ marginTop: '10px', padding: '6px 16px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
            + New Sale
          </button>
        </div>
      )}

      {/* Rate Selection */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px', textTransform: 'uppercase' }}>Rate — 19 Litre Bottle</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          {RATES.map(r => (
            <button key={r} onClick={() => setSelectedRate(r)}
              style={{
                padding: '16px', border: '2px solid',
                borderColor: selectedRate === r ? '#0f4c81' : '#eee',
                borderRadius: '10px', cursor: 'pointer',
                background: selectedRate === r ? '#0f4c81' : '#f8f9fa',
                color: selectedRate === r ? 'white' : '#333',
                fontWeight: '700', fontSize: '18px'
              }}>
              Rs. {r}
            </button>
          ))}
        </div>
        <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>Manual Rate</p>
        <input
          type="number"
          value={selectedRate || ''}
          onChange={e => setSelectedRate(e.target.value === '' ? null : Number(e.target.value))}
          placeholder="Type any rate e.g. 130"
          style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '20px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }}
        />
        {selectedRate && (
          <p style={{ fontSize: '12px', color: '#0f4c81', fontWeight: '600', margin: '6px 0 0', textAlign: 'center' }}>
            ✅ Rate: Rs. {selectedRate} per bottle
          </p>
        )}
      </div>

      {/* Quantity */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '16px', textTransform: 'uppercase' }}>Quantity — 19L Bottles</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px' }}>
          <button onClick={() => setQty(Math.max(1, qty - 1))}
            style={{ width: '52px', height: '52px', borderRadius: '50%', border: '2px solid #ddd', background: '#f5f5f5', fontSize: '26px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
          <span style={{ fontSize: '52px', fontWeight: '700', color: '#0f4c81', minWidth: '70px', textAlign: 'center' }}>{qty}</span>
          <button onClick={() => setQty(qty + 1)}
            style={{ width: '52px', height: '52px', borderRadius: '50%', border: '2px solid #0f4c81', background: '#0f4c81', color: 'white', fontSize: '26px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
        </div>
      </div>

      {/* Notes */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '8px' }}>Notes (optional)</p>
        <input value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="e.g. Walk-in customer, roadside sale..."
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* Total & Submit */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '15px', color: '#555' }}>Total Amount</span>
          <span style={{ fontSize: '32px', fontWeight: '700', color: '#0f4c81' }}>
            Rs. {((selectedRate || 0) * qty).toLocaleString()}
          </span>
        </div>
        <div style={{ background: '#e8f5e9', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px' }}>
          <p style={{ fontSize: '12px', color: '#1a7a4a', fontWeight: '600', margin: 0 }}>
            💵 This cash will go directly to CEO Cash in Hand balance
          </p>
        </div>
        <button onClick={postQuickSale} disabled={saving}
          style={{ width: '100%', padding: '16px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '16px', fontWeight: '700' }}>
          {saving ? 'Saving...' : '✓ Complete Cash Sale'}
        </button>
      </div>
    </div>
  )
}