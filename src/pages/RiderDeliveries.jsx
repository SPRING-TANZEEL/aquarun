import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import {
  getOrdersOffline, updateOrderStatusOffline,
  savePendingDelivery, updateCustomerBalanceOffline
} from '../offlineDB'

const RATES = [90, 100, 110, 120, 150, 160, 170, 180]

export default function RiderDeliveries({ rider, isOnline, dbReady }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [qty19l, setQty19l] = useState(0)
  const [qtyHalf, setQtyHalf] = useState(0)
  const [qty15l, setQty15l] = useState(0)
  const [selectedRate, setSelectedRate] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState(null)
  const [cashReceived, setCashReceived] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [filter, setFilter] = useState('today')

  useEffect(() => { fetchOrders() }, [filter, isOnline, dbReady])

  async function fetchOrders() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    try {
      if (isOnline) {
        let query = supabase
          .from('orders')
          .select('*, customers(full_name, mobile, customer_code, balance, rate_19l, rate_half_litre, rate_1_5l)')
          .eq('rider_id', rider.id)
          .eq('status', 'assigned')
          .order('delivery_date', { ascending: true })
        if (filter === 'today') query = query.lte('delivery_date', today)
        const { data } = await query
        setOrders(data || [])
      } else {
        if (dbReady) {
          const offlineOrders = await getOrdersOffline()
          let filtered = offlineOrders.filter(o => o.rider_id === rider.id && o.status === 'assigned')
          if (filter === 'today') {
            filtered = filtered.filter(o => !o.delivery_date || o.delivery_date <= today)
          }
          setOrders(filtered)
        } else {
          setOrders([])
        }
      }
    } catch (err) {
      console.error('Error fetching orders:', err)
      setOrders([])
    }
    setLoading(false)
  }

  function selectOrder(order) {
    setSelectedOrder(order)
    setQty19l(order.qty_19l || 0)
    setQtyHalf(order.qty_half_litre || 0)
    setQty15l(order.qty_1_5l || 0)
    setSelectedRate(order.customers?.rate_19l || 100)
    setPaymentMethod(null)
    setCashReceived('')
    setSuccess(null)
  }

  function totalAmount() {
    return (qty19l * (selectedRate || 0)) +
      (qtyHalf * (selectedOrder?.customers?.rate_half_litre || 0)) +
      (qty15l * (selectedOrder?.customers?.rate_1_5l || 0))
  }

  async function completeDelivery() {
    if (!paymentMethod) return alert('Please select payment method')
    if (qty19l === 0 && qtyHalf === 0 && qty15l === 0) return alert('Please enter at least one bottle')
    if (qty19l > 0 && !selectedRate) return alert('Please select rate for 19L')

    const total = totalAmount()
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
      order_id: selectedOrder.id,
      customer_id: selectedOrder.customer_id,
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
      const { data: savedDelivery, error } = await supabase
        .from('deliveries').insert([deliveryData]).select().single()
      if (error) { alert('Error: ' + error.message); setSaving(false); return }

      await supabase.from('orders').update({
        status: 'completed', completed_at: now
      }).eq('id', selectedOrder.id)

      if (creditPortion > 0) {
        const newBalance = Number(selectedOrder.customers.balance) + creditPortion
        await supabase.from('customers').update({ balance: newBalance }).eq('id', selectedOrder.customer_id)
      }

      // Auto-post journal entry
      try {
        const { postDeliveryJournal } = await import('../accountingEngine')
        await postDeliveryJournal(savedDelivery)
      } catch (err) { console.error('Journal post error:', err) }

    } else {
      await savePendingDelivery(deliveryData)
      await updateOrderStatusOffline(selectedOrder.id, 'completed')
      if (creditPortion > 0) {
        const newBalance = Number(selectedOrder.customers?.balance || 0) + creditPortion
        await updateCustomerBalanceOffline(selectedOrder.customer_id, newBalance)
      }
    }

    setSuccess({
      customer: selectedOrder.customers?.full_name,
      total, received, creditPortion, paymentMethod,
      savedOffline: !isOnline
    })
    setSelectedOrder(null)
    setPaymentMethod(null)
    setCashReceived('')
    fetchOrders()
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
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '4px' }}>📦 My Deliveries</h2>
      {!isOnline && (
        <p style={{ fontSize: '12px', color: '#ea580c', marginBottom: '12px', background: '#fff7ed', padding: '6px 10px', borderRadius: '6px', border: '1px solid #fed7aa' }}>
          📵 Offline — deliveries will sync when internet is available
        </p>
      )}

      {success && (
        <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
          <p style={{ fontWeight: '700', color: '#1b5e20', marginBottom: '4px' }}>✅ Delivery Completed!</p>
          <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>
            {success.customer} — Total: Rs. {success.total.toLocaleString()}
          </p>
          {success.received > 0 && <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>Cash: Rs. {success.received.toLocaleString()}</p>}
          {success.creditPortion > 0 && <p style={{ fontSize: '13px', color: '#f44336', margin: '0 0 2px' }}>Credit: Rs. {success.creditPortion.toLocaleString()}</p>}
          {success.savedOffline && (
            <p style={{ fontSize: '12px', color: '#ea580c', margin: '4px 0 0', fontWeight: '600' }}>
              📵 Saved offline — will sync when internet available
            </p>
          )}
          <button onClick={() => setSuccess(null)}
            style={{ marginTop: '8px', padding: '4px 12px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '12px' }}>
            OK
          </button>
        </div>
      )}

      {selectedOrder ? (
        <div>
          <div style={{ background: '#0f4c81', color: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: '700', fontSize: '16px', margin: '0 0 2px' }}>{selectedOrder.customers?.full_name}</p>
              <p style={{ fontSize: '12px', opacity: 0.8, margin: 0 }}>{selectedOrder.customers?.mobile}</p>
              {selectedOrder.notes && <p style={{ fontSize: '11px', opacity: 0.7, margin: '4px 0 0' }}>📝 {selectedOrder.notes}</p>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '11px', opacity: 0.7, margin: '0 0 2px' }}>Outstanding</p>
              <p style={{ fontSize: '18px', fontWeight: '700', margin: 0, color: selectedOrder.customers?.balance > 0 ? '#ffcdd2' : '#c8e6c9' }}>
                Rs. {Number(selectedOrder.customers?.balance || 0).toLocaleString()}
              </p>
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '14px' }}>Bottles to Deliver</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>19 Litre</p>
                <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Ordered: {selectedOrder.qty_19l}</p>
              </div>
              {numBtn(qty19l, setQty19l)}
            </div>
            {selectedOrder.qty_half_litre > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>Half Litre</p>
                  <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Ordered: {selectedOrder.qty_half_litre}</p>
                </div>
                {numBtn(qtyHalf, setQtyHalf)}
              </div>
            )}
            {selectedOrder.qty_1_5l > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>1.5 Litre</p>
                  <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Ordered: {selectedOrder.qty_1_5l}</p>
                </div>
                {numBtn(qty15l, setQty15l)}
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
                    <p style={{ fontSize: '11px', color: '#e57373', margin: '4px 0 0' }}>Will be added to customer balance</p>
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
                <p style={{ fontSize: '12px', color: '#e65100', margin: 0 }}>⚠️ JazzCash goes directly to office. Admin will confirm.</p>
              </div>
            )}
          </div>

          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <p style={{ fontSize: '16px', color: '#555', margin: 0 }}>Total Amount</p>
              <p style={{ fontSize: '28px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {total.toLocaleString()}</p>
            </div>
            {!isOnline && (
              <p style={{ fontSize: '12px', color: '#ea580c', margin: '0 0 10px', textAlign: 'center' }}>
                📵 Will save offline and sync later
              </p>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setSelectedOrder(null); setCashReceived('') }}
                style={{ flex: 1, padding: '14px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                ← Back
              </button>
              <button onClick={completeDelivery} disabled={saving}
                style={{ flex: 2, padding: '14px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
                {saving ? 'Saving...' : '✓ Complete Delivery'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            {[
              { key: 'today', label: "Today's Orders" },
              { key: 'all', label: 'All Assigned' },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: filter === f.key ? '#1a7a4a' : '#f0f0f0', color: filter === f.key ? 'white' : '#555', fontWeight: filter === f.key ? '700' : '400', fontSize: '13px' }}>
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>
          ) : orders.length === 0 ? (
            <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '40px', marginBottom: '12px' }}>✅</p>
              <p style={{ fontWeight: '700', color: '#1a7a4a', marginBottom: '4px' }}>All done!</p>
              <p style={{ color: '#888', fontSize: '13px' }}>No pending deliveries.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>{orders.length} delivery pending</p>
              {orders.map(o => (
                <div key={o.id} onClick={() => selectOrder(o)}
                  style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: 'pointer', border: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontWeight: '700', fontSize: '15px', margin: '0 0 4px', color: '#333' }}>{o.customers?.full_name}</p>
                    <p style={{ fontSize: '12px', color: '#888', margin: '0 0 6px' }}>{o.customers?.mobile}</p>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {o.qty_19l > 0 && <span style={{ fontSize: '12px', background: '#e3f0ff', color: '#0f4c81', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>19L × {o.qty_19l}</span>}
                      {o.qty_half_litre > 0 && <span style={{ fontSize: '12px', background: '#e3f0ff', color: '#0f4c81', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>Half × {o.qty_half_litre}</span>}
                      {o.qty_1_5l > 0 && <span style={{ fontSize: '12px', background: '#e3f0ff', color: '#0f4c81', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>1.5L × {o.qty_1_5l}</span>}
                    </div>
                    {o.notes && <p style={{ fontSize: '11px', color: '#888', margin: '4px 0 0' }}>📝 {o.notes}</p>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '12px', color: o.customers?.balance > 0 ? '#f44336' : '#4caf50', fontWeight: '600', margin: '0 0 4px' }}>
                      Rs. {Number(o.customers?.balance || 0).toLocaleString()}
                    </p>
                    <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>
                      {o.delivery_date ? new Date(o.delivery_date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' }) : ''}
                    </p>
                    <span style={{ fontSize: '20px', color: '#ccc' }}>›</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}