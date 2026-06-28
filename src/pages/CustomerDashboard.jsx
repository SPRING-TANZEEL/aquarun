import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function CustomerDashboard({ user, onLogout }) {
  const [activePage, setActivePage] = useState('home')
  const [orders, setOrders] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [payments, setPayments] = useState([])
  const [settings, setSettings] = useState({})
  const [saleableProducts, setSaleableProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    qty_19l: 0, qty_half_litre: 0, qty_1_5l: 0,
    delivery_date: new Date().toISOString().split('T')[0], notes: ''
  })
  const [productQtys, setProductQtys] = useState({})
  const [placing, setPlacing] = useState(false)
  const [orderSuccess, setOrderSuccess] = useState(false)
  const [showJazzCash, setShowJazzCash] = useState(false)
  const [jazzAmount, setJazzAmount] = useState('')
  const [jazzSubmitting, setJazzSubmitting] = useState(false)
  const [jazzSuccess, setJazzSuccess] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)

    const { data: ordersData } = await supabase
      .from('orders').select('*')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })
    setOrders(ordersData || [])

    const { data: deliveriesData } = await supabase
      .from('deliveries').select('*')
      .eq('customer_id', user.id)
      .order('delivered_at', { ascending: false })
    setDeliveries(deliveriesData || [])

    const { data: paymentsData } = await supabase
      .from('payments').select('*')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false })
    setPayments(paymentsData || [])

    const { data: settingsData } = await supabase
      .from('business_settings').select('*')
    const map = {}
    settingsData?.forEach(s => { map[s.setting_key] = s.setting_value })
    setSettings(map)

    // Fetch all saleable inventory products (excluding water bottles handled separately)
    const { data: productsData } = await supabase
      .from('products')
      .select('*')
      .eq('is_saleable', true)
      .eq('is_active', true)
      .gt('sale_price', 0)
      .order('name')
    setSaleableProducts(productsData || [])

    setLoading(false)
  }

  async function placeOrder() {
    const hasWater = form.qty_19l > 0 || form.qty_half_litre > 0 || form.qty_1_5l > 0
    const hasProducts = Object.values(productQtys).some(q => q > 0)

    if (!hasWater && !hasProducts)
      return alert('Please select at least one item to order')
    if (!form.delivery_date) return alert('Please select delivery date')

    setPlacing(true)

    // Build extra products note
    const productLines = saleableProducts
      .filter(p => productQtys[p.id] > 0)
      .map(p => `${p.name} × ${productQtys[p.id]}`)
    const productNote = productLines.length > 0 ? '\nExtra Items: ' + productLines.join(', ') : ''

    const { error } = await supabase.from('orders').insert([{
      customer_id: user.id,
      qty_19l: form.qty_19l,
      qty_half_litre: form.qty_half_litre,
      qty_1_5l: form.qty_1_5l,
      delivery_date: form.delivery_date,
      notes: (form.notes || '') + productNote,
      status: 'pending',
      extra_items: productLines.length > 0 ? JSON.stringify(
        saleableProducts
          .filter(p => productQtys[p.id] > 0)
          .map(p => ({ id: p.id, name: p.name, qty: productQtys[p.id], price: p.sale_price }))
      ) : null
    }])

    if (error) { alert('Error: ' + error.message); setPlacing(false); return }

    setOrderSuccess(true)
    setForm({ qty_19l: 0, qty_half_litre: 0, qty_1_5l: 0, delivery_date: new Date().toISOString().split('T')[0], notes: '' })
    setProductQtys({})
    fetchData()
    setPlacing(false)
    setTimeout(() => setOrderSuccess(false), 4000)
  }

  async function submitJazzCash() {
    if (!jazzAmount || Number(jazzAmount) <= 0) return alert('Please enter amount')
    if (Number(jazzAmount) > Number(user.balance)) return alert('Amount cannot exceed your balance of Rs. ' + Number(user.balance).toLocaleString())

    setJazzSubmitting(true)
    const { error } = await supabase.from('payments').insert([{
      customer_id: user.id,
      rider_id: null,
      amount: Number(jazzAmount),
      payment_method: 'jazzcash',
      payment_date: new Date().toISOString().split('T')[0],
      notes: 'JazzCash payment submitted by customer — pending admin confirmation',
      jazzcash_confirmed: false
    }])

    if (error) { alert('Error: ' + error.message); setJazzSubmitting(false); return }

    setJazzSuccess(true)
    setJazzAmount('')
    setJazzSubmitting(false)
    fetchData()
  }

  const STATUS = {
    pending: { label: 'Pending', color: '#e65100', bg: '#fff3e0' },
    assigned: { label: 'On the way 🚴', color: '#0f4c81', bg: '#e3f0ff' },
    completed: { label: 'Delivered ✅', color: '#1a7a4a', bg: '#e8f5e9' },
    cancelled: { label: 'Cancelled', color: '#c62828', bg: '#ffebee' },
  }

  function numBtn(val, key) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => setForm(f => ({ ...f, [key]: Math.max(0, f[key] - 1) }))}
          style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid #ddd', background: '#f5f5f5', fontSize: '20px', cursor: 'pointer', fontWeight: '700' }}>−</button>
        <span style={{ fontSize: '26px', fontWeight: '700', minWidth: '36px', textAlign: 'center', color: '#0f4c81' }}>{val}</span>
        <button onClick={() => setForm(f => ({ ...f, [key]: f[key] + 1 }))}
          style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid #0f4c81', background: '#0f4c81', color: 'white', fontSize: '20px', cursor: 'pointer', fontWeight: '700' }}>+</button>
      </div>
    )
  }

  function productNumBtn(productId) {
    const val = productQtys[productId] || 0
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button onClick={() => setProductQtys(q => ({ ...q, [productId]: Math.max(0, (q[productId] || 0) - 1) }))}
          style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid #ddd', background: '#f5f5f5', fontSize: '18px', cursor: 'pointer', fontWeight: '700' }}>−</button>
        <span style={{ fontSize: '22px', fontWeight: '700', minWidth: '30px', textAlign: 'center', color: '#0f4c81' }}>{val}</span>
        <button onClick={() => setProductQtys(q => ({ ...q, [productId]: (q[productId] || 0) + 1 }))}
          style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid #0f4c81', background: '#0f4c81', color: 'white', fontSize: '18px', cursor: 'pointer', fontWeight: '700' }}>+</button>
      </div>
    )
  }

  const menu = [
    { key: 'home', icon: '🏠', label: 'Home' },
    { key: 'order', icon: '💧', label: 'Order' },
    { key: 'history', icon: '📋', label: 'History' },
    { key: 'account', icon: '💰', label: 'Account' },
  ]

  const pendingJazzPayments = payments.filter(p => p.payment_method === 'jazzcash' && !p.jazzcash_confirmed)
  const totalPendingJazz = pendingJazzPayments.reduce((s, p) => s + Number(p.amount), 0)

  // Order total calculation
  const waterTotal = form.qty_19l * (user.rate_19l || 100) +
    form.qty_half_litre * (user.rate_half_litre || 0) +
    form.qty_1_5l * (user.rate_1_5l || 0)
  const productsTotal = saleableProducts.reduce((sum, p) => sum + (productQtys[p.id] || 0) * p.sale_price, 0)
  const orderTotal = waterTotal + productsTotal

  return (
    <div style={{ minHeight: '100vh', background: '#f5f6fa', fontFamily: 'sans-serif' }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0f4c81, #1a7a4a)',
        color: 'white', padding: '16px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {settings.business_logo ? (
            <img src={settings.business_logo} alt="logo"
              style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'contain', background: 'white', padding: '2px' }} />
          ) : (
            <span style={{ fontSize: '28px' }}>💧</span>
          )}
          <div>
            <div style={{ fontWeight: '700', fontSize: '16px' }}>{settings.business_name || 'AquaRun'}</div>
            <div style={{ fontSize: '12px', opacity: 0.8 }}>Welcome, {user.full_name}</div>
          </div>
        </div>
        <button onClick={onLogout}
          style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
          Logout
        </button>
      </div>

      <div style={{ padding: '16px', paddingBottom: '80px' }}>

        {/* HOME */}
        {activePage === 'home' && (
          <div>
            {/* Balance Card */}
            <div style={{
  background: Number(user.balance) > 0
    ? 'linear-gradient(135deg, #c62828, #e65100)'
    : Number(user.balance) < 0
    ? 'linear-gradient(135deg, #0f4c81, #1a7a4a)'
    : 'linear-gradient(135deg, #1a7a4a, #0f4c81)',
  color: 'white', borderRadius: '16px', padding: '24px',
  marginBottom: '16px', textAlign: 'center'
}}>
  <p style={{ fontSize: '13px', opacity: 0.8, margin: '0 0 8px' }}>
    {Number(user.balance) > 0 ? 'Outstanding Balance' : Number(user.balance) < 0 ? '💚 Advance Credit' : 'Account Balance'}
  </p>
  <p style={{ fontSize: '42px', fontWeight: '700', margin: '0 0 6px' }}>
    Rs. {Math.abs(Number(user.balance || 0)).toLocaleString()}
  </p>
  <p style={{ fontSize: '12px', opacity: 0.7, margin: 0 }}>
    {Number(user.balance) > 0
      ? 'Please clear your outstanding amount'
      : Number(user.balance) < 0
      ? 'You have advance credit for future deliveries'
      : 'Your account is clear'}
  </p>
</div>
              
            {/* Pending JazzCash Notice */}
            {totalPendingJazz > 0 && (
              <div style={{ background: '#fff3e0', border: '1px solid #ffe082', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#e65100', margin: '0 0 4px' }}>⏳ JazzCash Payment Pending Confirmation</p>
                <p style={{ fontSize: '12px', color: '#795548', margin: 0 }}>
                  Rs. {totalPendingJazz.toLocaleString()} sent via JazzCash — waiting for admin to confirm. Balance will update once confirmed.
                </p>
              </div>
            )}

            {/* Pay via JazzCash Button */}
            {user.balance > 0 && !showJazzCash && !jazzSuccess && (
              <button onClick={() => setShowJazzCash(true)}
                style={{
                  width: '100%', padding: '14px', background: '#9c27b0', color: 'white',
                  border: 'none', borderRadius: '12px', cursor: 'pointer',
                  fontSize: '15px', fontWeight: '700', marginBottom: '12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}>
                📱 Pay via JazzCash (Full or Partial)
              </button>
            )}

            {/* JazzCash Success */}
            {jazzSuccess && (
              <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
                <p style={{ fontWeight: '700', color: '#1b5e20', marginBottom: '8px' }}>✅ JazzCash Payment Recorded!</p>
                <p style={{ fontSize: '13px', color: '#2e7d32', marginBottom: '8px' }}>
                  Your payment has been recorded. Please send the screenshot on WhatsApp to confirm.
                </p>
                <div style={{ background: 'white', borderRadius: '8px', padding: '10px 12px', marginBottom: '8px' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>📲 Send Screenshot to WhatsApp:</p>
                  <p style={{ fontSize: '15px', fontWeight: '700', color: '#9c27b0', margin: 0 }}>{settings.whatsapp_number || '—'}</p>
                </div>
                <button onClick={() => setJazzSuccess(false)}
                  style={{ padding: '6px 14px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '12px' }}>
                  OK
                </button>
              </div>
            )}

            {/* JazzCash Payment Form */}
            {showJazzCash && !jazzSuccess && (
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #ce93d8' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: '#9c27b0', margin: 0 }}>📱 Pay via JazzCash</p>
                  <button onClick={() => { setShowJazzCash(false); setJazzAmount('') }}
                    style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#888' }}>✕</button>
                </div>

                <div style={{ background: '#f3e5f5', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
                  <p style={{ fontSize: '12px', fontWeight: '700', color: '#6a1b9a', margin: '0 0 10px' }}>Send JazzCash to:</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ background: 'white', borderRadius: '8px', padding: '10px' }}>
                      <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>Account 1</p>
                      <p style={{ fontSize: '15px', fontWeight: '700', color: '#333', margin: '0 0 2px' }}>{settings.jazzcash_number_1 || '—'}</p>
                      <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>{settings.jazzcash_name_1 || '—'}</p>
                    </div>
                    <div style={{ background: 'white', borderRadius: '8px', padding: '10px' }}>
                      <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>Account 2</p>
                      <p style={{ fontSize: '15px', fontWeight: '700', color: '#333', margin: '0 0 2px' }}>{settings.jazzcash_number_2 || '—'}</p>
                      <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>{settings.jazzcash_name_2 || '—'}</p>
                    </div>
                  </div>
                  <div style={{ background: '#fff3e0', borderRadius: '8px', padding: '10px', border: '1px solid #ffe082' }}>
                    <p style={{ fontSize: '12px', fontWeight: '700', color: '#e65100', margin: '0 0 4px' }}>⚠️ After sending, share screenshot on WhatsApp:</p>
                    <p style={{ fontSize: '15px', fontWeight: '700', color: '#e65100', margin: 0 }}>{settings.whatsapp_number || '—'}</p>
                  </div>
                </div>

                <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '4px' }}>Amount Sending (Rs.)</p>
                <p style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>You can send partial amount — remaining will stay as outstanding balance.</p>
                <input type="number" value={jazzAmount}
                  onChange={e => setJazzAmount(e.target.value)}
                  placeholder="Enter amount you are sending"
                  style={{ width: '100%', padding: '12px', border: '2px solid #ce93d8', borderRadius: '8px', fontSize: '22px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center', marginBottom: '8px' }} />

                {user.balance > 0 && (
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <button onClick={() => setJazzAmount(String(user.balance))}
                      style={{ padding: '6px 12px', background: '#f3e5f5', border: '1px solid #ce93d8', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#9c27b0', fontWeight: '600' }}>
                      Full: Rs. {Number(user.balance).toLocaleString()}
                    </button>
                    <button onClick={() => setJazzAmount(String(Math.floor(Number(user.balance) / 2)))}
                      style={{ padding: '6px 12px', background: '#f3e5f5', border: '1px solid #ce93d8', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#9c27b0', fontWeight: '600' }}>
                      Half: Rs. {Math.floor(Number(user.balance) / 2).toLocaleString()}
                    </button>
                  </div>
                )}

                {jazzAmount && Number(jazzAmount) > 0 && (
                  <div style={{ background: '#fff8e1', borderRadius: '8px', padding: '12px', marginBottom: '12px', border: '1px solid #ffe082' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', color: '#555' }}>Amount Sending</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#9c27b0' }}>Rs. {Number(jazzAmount).toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', color: '#555' }}>Current Balance</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#f44336' }}>Rs. {Number(user.balance).toLocaleString()}</span>
                    </div>
                    <div style={{ borderTop: '1px solid #ffe082', paddingTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#333' }}>Remaining After Payment</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: Number(jazzAmount) >= Number(user.balance) ? '#1a7a4a' : '#e65100' }}>
                        Rs. {Math.max(0, Number(user.balance) - Number(jazzAmount)).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                <button onClick={submitJazzCash} disabled={jazzSubmitting}
                  style={{ width: '100%', padding: '14px', background: '#9c27b0', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
                  {jazzSubmitting ? 'Recording...' : '✓ I Have Sent the Payment'}
                </button>
              </div>
            )}

            {/* Quick Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
                <p style={{ fontSize: '28px', margin: '0 0 4px' }}>📦</p>
                <p style={{ fontSize: '22px', fontWeight: '700', color: '#0f4c81', margin: '0 0 4px' }}>
                  {orders.filter(o => o.status === 'pending' || o.status === 'assigned').length}
                </p>
                <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Active Orders</p>
              </div>
              <div style={{ background: 'white', borderRadius: '12px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '12px', fontWeight: '700', color: '#333', margin: '0 0 8px' }}>🍶 Bottles at Home</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span style={{ fontSize: '11px', color: '#888' }}>Your own</span>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#0f4c81' }}>{user.own_bottles || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span style={{ fontSize: '11px', color: '#888' }}>Spring Water</span>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#e65100' }}>{user.our_bottles_placed || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#333' }}>Total</span>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a' }}>{(user.own_bottles || 0) + (user.our_bottles_placed || 0)}</span>
                </div>
              </div>
            </div>

            {/* Active Orders */}
            {orders.filter(o => o.status === 'pending' || o.status === 'assigned').length > 0 && (
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
                <p style={{ fontSize: '14px', fontWeight: '700', color: '#333', marginBottom: '12px' }}>Active Orders</p>
                {orders.filter(o => o.status === 'pending' || o.status === 'assigned').map(o => {
                  const s = STATUS[o.status]
                  return (
                    <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <div>
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
                          {o.qty_19l > 0 && <span style={{ fontSize: '12px', background: '#e3f0ff', color: '#0f4c81', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>19L × {o.qty_19l}</span>}
                          {o.qty_half_litre > 0 && <span style={{ fontSize: '12px', background: '#e3f0ff', color: '#0f4c81', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>Half × {o.qty_half_litre}</span>}
                          {o.qty_1_5l > 0 && <span style={{ fontSize: '12px', background: '#e3f0ff', color: '#0f4c81', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>1.5L × {o.qty_1_5l}</span>}
                        </div>
                        {o.notes && <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>📝 {o.notes}</p>}
                        <p style={{ fontSize: '11px', color: '#aaa', margin: '2px 0 0' }}>
                          {o.delivery_date ? new Date(o.delivery_date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' }) : ''}
                        </p>
                      </div>
                      <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', background: s.bg, color: s.color }}>
                        {s.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Contact Info */}
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#333', marginBottom: '10px' }}>📞 Contact Us</p>
              {[
                { icon: '🚴', label: 'Delivery', value: settings.delivery_number },
                { icon: '📞', label: 'Complaints', value: settings.complaint_number },
                { icon: '📍', label: 'Address', value: settings.business_address },
              ].filter(item => item.value).map(item => (
                <div key={item.label} style={{ display: 'flex', gap: '10px', padding: '6px 0', borderBottom: '1px solid #f5f5f5', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '16px' }}>{item.icon}</span>
                  <div>
                    <p style={{ fontSize: '11px', color: '#aaa', margin: '0 0 1px' }}>{item.label}</p>
                    <p style={{ fontSize: '13px', fontWeight: '600', color: '#333', margin: 0 }}>{item.value}</p>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={() => setActivePage('order')}
              style={{ width: '100%', padding: '16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '16px', fontWeight: '700' }}>
              💧 Place New Order
            </button>
          </div>
        )}

        {/* ORDER */}
        {activePage === 'order' && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>💧 Place Order</h2>

            {orderSuccess && (
              <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
                <p style={{ fontWeight: '700', color: '#1b5e20', marginBottom: '4px' }}>✅ Order Placed Successfully!</p>
                <p style={{ fontSize: '13px', color: '#2e7d32', margin: 0 }}>Your order has been received. We will deliver soon.</p>
              </div>
            )}

            {/* Water Bottles Section */}
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81', marginBottom: '14px' }}>💧 Water Bottles</p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>19 Litre</p>
                  <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Rs. {user.rate_19l || 100} per bottle</p>
                </div>
                {numBtn(form.qty_19l, 'qty_19l')}
              </div>

              {user.rate_half_litre > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>Half Litre</p>
                    <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Rs. {user.rate_half_litre} per bottle</p>
                  </div>
                  {numBtn(form.qty_half_litre, 'qty_half_litre')}
                </div>
              )}

              {user.rate_1_5l > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>1.5 Litre</p>
                    <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Rs. {user.rate_1_5l} per bottle</p>
                  </div>
                  {numBtn(form.qty_1_5l, 'qty_1_5l')}
                </div>
              )}
            </div>

            {/* Other Products Section */}
            {saleableProducts.length > 0 && (
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#1a7a4a', marginBottom: '4px' }}>🛒 Other Products</p>
                <p style={{ fontSize: '11px', color: '#888', marginBottom: '14px' }}>Dispensers, cans, accessories and more</p>
                {saleableProducts.map((p, idx) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: idx < saleableProducts.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>{p.name}</p>
                      <p style={{ fontSize: '12px', color: '#1a7a4a', fontWeight: '600', margin: 0 }}>Rs. {Number(p.sale_price).toLocaleString()} each</p>
                      {p.current_stock > 0 && (
                        <p style={{ fontSize: '11px', color: '#aaa', margin: '2px 0 0' }}>In stock: {Number(p.current_stock).toLocaleString()}</p>
                      )}
                    </div>
                    {productNumBtn(p.id)}
                  </div>
                ))}
              </div>
            )}

            {/* Delivery Date */}
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '8px' }}>Delivery Date</p>
              <input type="date" value={form.delivery_date}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))}
                style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Notes */}
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '8px' }}>Special Instructions (optional)</p>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. Call before delivery..."
                style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Order Summary */}
            {orderTotal > 0 && (
              <div style={{ background: '#e3f0ff', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81', marginBottom: '10px' }}>Order Summary</p>
                {form.qty_19l > 0 && <p style={{ fontSize: '13px', color: '#333', margin: '0 0 4px' }}>19L × {form.qty_19l} = Rs. {(form.qty_19l * (user.rate_19l || 100)).toLocaleString()}</p>}
                {form.qty_half_litre > 0 && <p style={{ fontSize: '13px', color: '#333', margin: '0 0 4px' }}>Half × {form.qty_half_litre} = Rs. {(form.qty_half_litre * (user.rate_half_litre || 0)).toLocaleString()}</p>}
                {form.qty_1_5l > 0 && <p style={{ fontSize: '13px', color: '#333', margin: '0 0 4px' }}>1.5L × {form.qty_1_5l} = Rs. {(form.qty_1_5l * (user.rate_1_5l || 0)).toLocaleString()}</p>}
                {saleableProducts.filter(p => productQtys[p.id] > 0).map(p => (
                  <p key={p.id} style={{ fontSize: '13px', color: '#333', margin: '0 0 4px' }}>
                    {p.name} × {productQtys[p.id]} = Rs. {(productQtys[p.id] * p.sale_price).toLocaleString()}
                  </p>
                ))}
                <div style={{ borderTop: '1px solid #c8d8ff', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '15px', fontWeight: '700', color: '#0f4c81' }}>Total</span>
                  <span style={{ fontSize: '18px', fontWeight: '700', color: '#0f4c81' }}>Rs. {orderTotal.toLocaleString()}</span>
                </div>
              </div>
            )}

            <button onClick={placeOrder} disabled={placing}
              style={{ width: '100%', padding: '16px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '16px', fontWeight: '700' }}>
              {placing ? 'Placing Order...' : '✓ Place Order'}
            </button>
          </div>
        )}

        {/* HISTORY */}
        {activePage === 'history' && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>📋 Order History</h2>
            {loading ? (
              <p style={{ textAlign: 'center', color: '#888' }}>Loading...</p>
            ) : orders.length === 0 ? (
              <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '32px', marginBottom: '8px' }}>📦</p>
                <p style={{ color: '#888' }}>No orders yet.</p>
              </div>
            ) : orders.map(o => {
              const s = STATUS[o.status] || STATUS.pending
              return (
                <div key={o.id} style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
                      {o.qty_19l > 0 && <span style={{ fontSize: '12px', background: '#e3f0ff', color: '#0f4c81', padding: '3px 8px', borderRadius: '10px', fontWeight: '600' }}>19L × {o.qty_19l}</span>}
                      {o.qty_half_litre > 0 && <span style={{ fontSize: '12px', background: '#e3f0ff', color: '#0f4c81', padding: '3px 8px', borderRadius: '10px', fontWeight: '600' }}>Half × {o.qty_half_litre}</span>}
                      {o.qty_1_5l > 0 && <span style={{ fontSize: '12px', background: '#e3f0ff', color: '#0f4c81', padding: '3px 8px', borderRadius: '10px', fontWeight: '600' }}>1.5L × {o.qty_1_5l}</span>}
                    </div>
                    <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
                      {s.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: '12px', color: '#aaa', margin: 0 }}>
                      {new Date(o.created_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                    {o.delivery_date && (
                      <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
                        Delivery: {new Date(o.delivery_date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })}
                      </p>
                    )}
                  </div>
                  {o.notes && <p style={{ fontSize: '11px', color: '#888', margin: '4px 0 0' }}>📝 {o.notes}</p>}
                </div>
              )
            })}
          </div>
        )}

        {/* ACCOUNT */}
        {activePage === 'account' && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>💰 My Account</h2>

            <div style={{
  background: user.balance > 0
    ? 'linear-gradient(135deg, #c62828, #e65100)'
    : user.balance < 0
    ? 'linear-gradient(135deg, #0f4c81, #1a7a4a)'
    : 'linear-gradient(135deg, #1a7a4a, #0f4c81)',
  color: 'white', borderRadius: '14px', padding: '20px', marginBottom: '16px', textAlign: 'center'
}}>
  <p style={{ fontSize: '13px', opacity: 0.8, margin: '0 0 6px' }}>
    {user.balance > 0 ? 'Outstanding Balance' : user.balance < 0 ? '💚 Advance Credit' : 'Account Balance'}
  </p>
  <p style={{ fontSize: '38px', fontWeight: '700', margin: '0 0 4px' }}>
    Rs. {Math.abs(Number(user.balance || 0)).toLocaleString()}
  </p>
  <p style={{ fontSize: '12px', opacity: 0.7, margin: 0 }}>
    {user.balance > 0
      ? 'Amount due to ' + (settings.business_name || 'Spring Water Kamoke')
      : user.balance < 0
      ? 'Advance credit — will be used for future deliveries'
      : 'No outstanding amount ✅'}
  </p>
</div>

            {pendingJazzPayments.length > 0 && (
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #ffe082' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#e65100', marginBottom: '10px' }}>⏳ Pending JazzCash Payments</p>
                {pendingJazzPayments.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>📱 JazzCash Sent</p>
                      <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{new Date(p.created_at).toLocaleDateString('en-PK')} — Awaiting confirmation</p>
                    </div>
                    <p style={{ fontSize: '14px', fontWeight: '700', color: '#e65100', margin: 0 }}>Rs. {Number(p.amount).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}

            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>🍶 Bottles at Your Home</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ fontSize: '13px', color: '#888' }}>Your Own Bottles</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f4c81' }}>{user.own_bottles || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ fontSize: '13px', color: '#888' }}>{settings.business_name || 'Spring Water'} Bottles</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#e65100' }}>{user.our_bottles_placed || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#333' }}>Total Bottles</span>
                <span style={{ fontSize: '18px', fontWeight: '700', color: '#1a7a4a' }}>{(user.own_bottles || 0) + (user.our_bottles_placed || 0)}</span>
              </div>
            </div>

            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>Account Details</p>
              {[
                { label: 'Name', value: user.full_name },
                { label: 'Customer ID', value: user.customer_code },
                { label: 'Mobile', value: user.mobile },
                { label: 'Address', value: user.address },
                { label: 'Rate — 19L', value: 'Rs. ' + (user.rate_19l || 100) },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <span style={{ fontSize: '13px', color: '#888' }}>{item.label}</span>
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>{item.value}</span>
                </div>
              ))}
            </div>

            {deliveries.length > 0 && (
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>Recent Deliveries</p>
                {deliveries.slice(0, 10).map(d => (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>
                        {d.qty_19l > 0 ? `19L × ${d.qty_19l} ` : ''}
                        {d.qty_half_litre > 0 ? `Half × ${d.qty_half_litre} ` : ''}
                        {d.qty_1_5l > 0 ? `1.5L × ${d.qty_1_5l}` : ''}
                      </p>
                      <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>
                        {new Date(d.delivered_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })} —
                        {d.payment_method === 'cash' ? ' Cash' : d.payment_method === 'jazzcash' ? ' JazzCash' : ' Credit'}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '14px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {Number(d.total_amount).toLocaleString()}</p>
                      {d.credit_amount > 0 && <p style={{ fontSize: '11px', color: '#f44336', margin: 0 }}>Credit: Rs. {Number(d.credit_amount).toLocaleString()}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {payments.length > 0 && (
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>Payment History</p>
                {payments.slice(0, 10).map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>
                        {p.payment_method === 'cash' ? '💵 Cash' : '📱 JazzCash'}
                        {!p.jazzcash_confirmed && p.payment_method === 'jazzcash' ? ' (Pending)' : ''}
                      </p>
                      <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>
                        {new Date(p.created_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>Rs. {Number(p.amount).toLocaleString()}</p>
                      {p.payment_method === 'jazzcash' && (
                        <p style={{ fontSize: '11px', color: p.jazzcash_confirmed ? '#1a7a4a' : '#e65100', margin: 0 }}>
                          {p.jazzcash_confirmed ? '✅ Confirmed' : '⏳ Pending'}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #eee', display: 'flex', zIndex: 100 }}>
        {menu.map(m => (
          <button key={m.key} onClick={() => setActivePage(m.key)}
            style={{
              flex: 1, padding: '10px 4px', border: 'none',
              background: activePage === m.key ? '#e3f0ff' : 'white',
              color: activePage === m.key ? '#0f4c81' : '#888',
              cursor: 'pointer', fontSize: '11px',
              fontWeight: activePage === m.key ? '700' : '400',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
              borderTop: activePage === m.key ? '3px solid #0f4c81' : '3px solid transparent'
            }}>
            <span style={{ fontSize: '20px' }}>{m.icon}</span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}