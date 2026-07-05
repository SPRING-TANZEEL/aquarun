import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function CustomerDashboard({ customer, onLogout }) {
  const tenantId = customer.tenant_id
  const [activeTab, setActiveTab] = useState('home')
  const [deliveries, setDeliveries] = useState([])
  const [payments, setPayments] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState({})
  const [orderForm, setOrderForm] = useState({ qty_19l: 0, qty_half_litre: 0, qty_1_5l: 0, notes: '' })
  const [placingOrder, setPlacingOrder] = useState(false)
  const [orderSuccess, setOrderSuccess] = useState(false)

  useEffect(() => { if (tenantId) fetchAll() }, [tenantId])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchDeliveries(), fetchPayments(), fetchOrders(), fetchSettings()])
    setLoading(false)
  }

  async function fetchSettings() {
    const { data } = await supabase.from('business_settings')
      .select('*')
      .eq('tenant_id', tenantId)
    const map = {}
    data?.forEach(s => { map[s.setting_key] = s.setting_value })
    setSettings(map)
  }

  async function fetchDeliveries() {
    const { data } = await supabase.from('deliveries')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customer.id)
      .eq('is_voided', false)
      .order('delivered_at', { ascending: false })
      .limit(30)
    setDeliveries(data || [])
  }

  async function fetchPayments() {
    const { data } = await supabase.from('payments')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customer.id)
      .eq('is_voided', false)
      .order('created_at', { ascending: false })
      .limit(20)
    setPayments(data || [])
  }

  async function fetchOrders() {
    const { data } = await supabase.from('orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(10)
    setOrders(data || [])
  }

  async function placeOrder() {
    const { qty_19l, qty_half_litre, qty_1_5l } = orderForm
    if (qty_19l === 0 && qty_half_litre === 0 && qty_1_5l === 0)
      return alert('Please enter at least one bottle quantity')
    setPlacingOrder(true)
    const { error } = await supabase.from('orders').insert([{
      tenant_id: tenantId,
      customer_id: customer.id,
      qty_19l,
      qty_half_litre,
      qty_1_5l,
      notes: orderForm.notes,
      delivery_date: new Date().toISOString().split('T')[0],
      status: 'pending'
    }])
    if (error) { alert('Error: ' + error.message); setPlacingOrder(false); return }
    setOrderSuccess(true)
    setOrderForm({ qty_19l: 0, qty_half_litre: 0, qty_1_5l: 0, notes: '' })
    fetchOrders()
    setPlacingOrder(false)
    setTimeout(() => setOrderSuccess(false), 4000)
  }

  const balance = Number(customer.balance || 0)
  const totalBottles19l = deliveries.reduce((s, d) => s + Number(d.qty_19l || 0), 0)
  const totalSpent = deliveries.reduce((s, d) => s + Number(d.total_amount || 0), 0)

  const TABS = [
    { key: 'home', icon: '🏠', label: 'Home' },
    { key: 'order', icon: '📦', label: 'Order' },
    { key: 'history', icon: '📋', label: 'History' },
    { key: 'account', icon: '💰', label: 'Account' },
  ]

  function numBtn(val, field) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => setOrderForm(f => ({ ...f, [field]: Math.max(0, f[field] - 1) }))}
          style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid #ddd', background: '#f5f5f5', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
        <span style={{ fontSize: '26px', fontWeight: '700', minWidth: '36px', textAlign: 'center' }}>{val}</span>
        <button onClick={() => setOrderForm(f => ({ ...f, [field]: f[field] + 1 }))}
          style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid #0f4c81', background: '#0f4c81', color: 'white', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
      </div>
    )
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f5f7fa' }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>💧</div>
      <p style={{ color: '#888', fontSize: '14px' }}>Loading your account...</p>
    </div>
  )

  return (
    <div style={{ maxWidth: '430px', margin: '0 auto', minHeight: '100vh', background: '#f5f7fa', position: 'relative', paddingBottom: '70px' }}>

      {/* TOP NAV */}
      <div style={{ background: '#0f4c81', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {settings.business_logo && (
            <img src={settings.business_logo} alt="logo"
              style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'contain', background: 'white', padding: '2px' }} />
          )}
          <div>
            <p style={{ fontSize: '16px', fontWeight: '700', color: 'white', margin: 0 }}>
              {settings.business_name || 'AquaRun'}
            </p>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', margin: 0 }}>{customer.full_name}</p>
          </div>
        </div>
        <button onClick={onLogout}
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
          Logout
        </button>
      </div>

      {/* HOME TAB */}
      {activeTab === 'home' && (
        <div style={{ padding: '16px' }}>
          {/* Balance Card */}
          <div style={{
            background: balance > 0 ? 'linear-gradient(135deg, #c62828, #e65100)' : balance < 0 ? 'linear-gradient(135deg, #0f4c81, #1a7a4a)' : 'linear-gradient(135deg, #1a7a4a, #0f4c81)',
            borderRadius: '16px', padding: '24px', marginBottom: '16px', color: 'white', textAlign: 'center'
          }}>
            <p style={{ fontSize: '13px', opacity: 0.8, margin: '0 0 8px' }}>
              {balance > 0 ? '⚠️ Outstanding Balance' : balance < 0 ? '✅ Advance Credit' : '✅ Account Clear'}
            </p>
            <p style={{ fontSize: '44px', fontWeight: '700', margin: '0 0 6px' }}>
              Rs. {Math.abs(balance).toLocaleString()}
            </p>
            <p style={{ fontSize: '12px', opacity: 0.7, margin: 0 }}>
              {balance > 0 ? 'Please pay your outstanding amount' : balance < 0 ? 'You have advance credit' : 'No outstanding balance'}
            </p>
            <p style={{ fontSize: '11px', opacity: 0.6, margin: '8px 0 0' }}>
              ID: {customer.customer_code}
            </p>
          </div>

          {/* Quick Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            <div style={{ background: 'white', borderRadius: '12px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
              <p style={{ fontSize: '11px', color: '#888', margin: '0 0 6px' }}>Total Deliveries</p>
              <p style={{ fontSize: '28px', fontWeight: '700', color: '#0f4c81', margin: '0 0 2px' }}>{deliveries.length}</p>
              <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>Last 30 orders</p>
            </div>
            <div style={{ background: 'white', borderRadius: '12px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
              <p style={{ fontSize: '11px', color: '#888', margin: '0 0 6px' }}>Bottles Received</p>
              <p style={{ fontSize: '28px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 2px' }}>{totalBottles19l}</p>
              <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>19L bottles</p>
            </div>
          </div>

          {/* Rate Info */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', margin: '0 0 10px', textTransform: 'uppercase' }}>Your Rates</p>
            <div style={{ display: 'flex', gap: '16px' }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>19 Litre</p>
                <p style={{ fontSize: '18px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {customer.rate_19l}</p>
              </div>
              {customer.rate_half_litre > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>Half Litre</p>
                  <p style={{ fontSize: '18px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {customer.rate_half_litre}</p>
                </div>
              )}
              {customer.rate_1_5l > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>1.5 Litre</p>
                  <p style={{ fontSize: '18px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {customer.rate_1_5l}</p>
                </div>
              )}
            </div>
          </div>

          {/* Contact Info */}
          {(settings.complaint_number || settings.whatsapp_number) && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', margin: '0 0 10px', textTransform: 'uppercase' }}>Contact Us</p>
              {settings.complaint_number && (
                <a href={`tel:${settings.complaint_number}`} style={{ textDecoration: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: settings.whatsapp_number ? '1px solid #f0f0f0' : 'none' }}>
                    <span style={{ fontSize: '20px' }}>📞</span>
                    <div>
                      <p style={{ fontSize: '12px', color: '#888', margin: '0 0 2px' }}>Complaint / Support</p>
                      <p style={{ fontSize: '14px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>{settings.complaint_number}</p>
                    </div>
                  </div>
                </a>
              )}
              {settings.whatsapp_number && (
                <a href={`https://wa.me/92${settings.whatsapp_number?.replace(/^0/, '')}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0' }}>
                    <span style={{ fontSize: '20px' }}>💬</span>
                    <div>
                      <p style={{ fontSize: '12px', color: '#888', margin: '0 0 2px' }}>WhatsApp</p>
                      <p style={{ fontSize: '14px', fontWeight: '700', color: '#25d366', margin: 0 }}>{settings.whatsapp_number}</p>
                    </div>
                  </div>
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* ORDER TAB */}
      {activeTab === 'order' && (
        <div style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '4px' }}>📦 Place Order</h3>
          <p style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>Request your next water delivery</p>

          {orderSuccess && (
            <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
              <p style={{ fontWeight: '700', color: '#1b5e20', marginBottom: '4px' }}>✅ Order Placed!</p>
              <p style={{ fontSize: '13px', color: '#2e7d32', margin: 0 }}>Your order has been submitted. Our rider will deliver soon.</p>
            </div>
          )}

          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '16px' }}>Select Bottles</p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <p style={{ fontSize: '15px', fontWeight: '600', margin: '0 0 2px' }}>19 Litre</p>
                <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Rs. {customer.rate_19l} each</p>
              </div>
              {numBtn(orderForm.qty_19l, 'qty_19l')}
            </div>

            {customer.rate_half_litre > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: '600', margin: '0 0 2px' }}>Half Litre</p>
                  <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Rs. {customer.rate_half_litre} each</p>
                </div>
                {numBtn(orderForm.qty_half_litre, 'qty_half_litre')}
              </div>
            )}

            {customer.rate_1_5l > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: '600', margin: '0 0 2px' }}>1.5 Litre</p>
                  <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Rs. {customer.rate_1_5l} each</p>
                </div>
                {numBtn(orderForm.qty_1_5l, 'qty_1_5l')}
              </div>
            )}

            <div style={{ marginTop: '8px' }}>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>Special Instructions (optional)</label>
              <input value={orderForm.notes} onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. Please deliver in the morning..."
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {(orderForm.qty_19l > 0 || orderForm.qty_half_litre > 0 || orderForm.qty_1_5l > 0) && (
            <div style={{ background: '#e8f5e9', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 6px' }}>Order Summary</p>
              {orderForm.qty_19l > 0 && <p style={{ fontSize: '13px', color: '#555', margin: '0 0 2px' }}>19L × {orderForm.qty_19l} = Rs. {(orderForm.qty_19l * customer.rate_19l).toLocaleString()}</p>}
              {orderForm.qty_half_litre > 0 && <p style={{ fontSize: '13px', color: '#555', margin: '0 0 2px' }}>Half × {orderForm.qty_half_litre} = Rs. {(orderForm.qty_half_litre * customer.rate_half_litre).toLocaleString()}</p>}
              {orderForm.qty_1_5l > 0 && <p style={{ fontSize: '13px', color: '#555', margin: '0 0 2px' }}>1.5L × {orderForm.qty_1_5l} = Rs. {(orderForm.qty_1_5l * customer.rate_1_5l).toLocaleString()}</p>}
              <div style={{ borderTop: '1px solid #c8e6c9', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a' }}>Estimated Total</span>
                <span style={{ fontSize: '16px', fontWeight: '700', color: '#1a7a4a' }}>
                  Rs. {((orderForm.qty_19l * customer.rate_19l) + (orderForm.qty_half_litre * customer.rate_half_litre) + (orderForm.qty_1_5l * customer.rate_1_5l)).toLocaleString()}
                </span>
              </div>
            </div>
          )}

          <button onClick={placeOrder} disabled={placingOrder}
            style={{ width: '100%', padding: '16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '16px', fontWeight: '700' }}>
            {placingOrder ? 'Placing Order...' : '✓ Place Order'}
          </button>

          {orders.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>Recent Orders</p>
              {orders.slice(0, 5).map(o => (
                <div key={o.id} style={{ background: 'white', borderRadius: '10px', padding: '12px 14px', marginBottom: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>
                      {o.qty_19l > 0 ? `19L×${o.qty_19l} ` : ''}
                      {o.qty_half_litre > 0 ? `Half×${o.qty_half_litre} ` : ''}
                      {o.qty_1_5l > 0 ? `1.5L×${o.qty_1_5l}` : ''}
                    </p>
                    <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>{new Date(o.created_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })}</p>
                  </div>
                  <span style={{
                    padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '700',
                    background: o.status === 'completed' ? '#e8f5e9' : o.status === 'assigned' ? '#e3f0ff' : o.status === 'cancelled' ? '#ffebee' : '#fff3e0',
                    color: o.status === 'completed' ? '#2e7d32' : o.status === 'assigned' ? '#0f4c81' : o.status === 'cancelled' ? '#c62828' : '#e65100'
                  }}>
                    {o.status === 'completed' ? '✅ Done' : o.status === 'assigned' ? '🚴 On the way' : o.status === 'cancelled' ? '✕ Cancelled' : '⏳ Pending'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* HISTORY TAB */}
      {activeTab === 'history' && (
        <div style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>📋 Delivery History</h3>
          {deliveries.length === 0 ? (
            <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '32px', marginBottom: '8px' }}>📦</p>
              <p style={{ color: '#888' }}>No deliveries yet</p>
            </div>
          ) : deliveries.map(d => (
            <div key={d.id} style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>
                    {d.qty_19l > 0 ? `19L×${d.qty_19l} ` : ''}
                    {d.qty_half_litre > 0 ? `Half×${d.qty_half_litre} ` : ''}
                    {d.qty_1_5l > 0 ? `1.5L×${d.qty_1_5l}` : ''}
                  </p>
                  <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
                    {new Date(d.delivered_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '16px', fontWeight: '700', color: '#0f4c81', margin: '0 0 4px' }}>Rs. {Number(d.total_amount).toLocaleString()}</p>
                  <span style={{
                    fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: '600',
                    background: d.payment_method === 'cash' ? '#e8f5e9' : d.payment_method === 'jazzcash' ? '#f3e5f5' : '#fff3e0',
                    color: d.payment_method === 'cash' ? '#2e7d32' : d.payment_method === 'jazzcash' ? '#7b1fa2' : '#e65100'
                  }}>
                    {d.payment_method === 'cash' ? '💵 Cash' : d.payment_method === 'jazzcash' ? '📱 JazzCash' : '📋 Credit'}
                  </span>
                </div>
              </div>
              {Number(d.credit_amount) > 0 && (
                <div style={{ background: '#fff3e0', borderRadius: '6px', padding: '6px 10px' }}>
                  <p style={{ fontSize: '11px', color: '#e65100', margin: 0 }}>
                    📋 Rs. {Number(d.credit_amount).toLocaleString()} added to balance
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ACCOUNT TAB */}
      {activeTab === 'account' && (
        <div style={{ padding: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>💰 Account Statement</h3>

          <div style={{ background: balance > 0 ? 'linear-gradient(135deg, #c62828, #e65100)' : 'linear-gradient(135deg, #0f4c81, #1a7a4a)', color: 'white', borderRadius: '12px', padding: '20px', marginBottom: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: '13px', opacity: 0.8, margin: '0 0 6px' }}>
              {balance > 0 ? 'Outstanding Balance' : balance < 0 ? 'Advance Credit' : 'Account Clear'}
            </p>
            <p style={{ fontSize: '36px', fontWeight: '700', margin: '0 0 4px' }}>Rs. {Math.abs(balance).toLocaleString()}</p>
            <p style={{ fontSize: '11px', opacity: 0.6, margin: 0 }}>ID: {customer.customer_code}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            <div style={{ background: 'white', borderRadius: '10px', padding: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
              <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>Total Spent</p>
              <p style={{ fontSize: '16px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {totalSpent.toLocaleString()}</p>
            </div>
            <div style={{ background: 'white', borderRadius: '10px', padding: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
              <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>Payments Made</p>
              <p style={{ fontSize: '16px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>{payments.length}</p>
            </div>
          </div>

          {payments.length > 0 && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>Recent Payments</p>
              {payments.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>
                      {p.payment_method === 'cash' ? '💵 Cash' : p.payment_method === 'jazzcash' ? '📱 JazzCash' : '🏦 Bank'} Payment
                      {p.payment_method === 'jazzcash' && !p.jazzcash_confirmed && (
                        <span style={{ fontSize: '10px', color: '#e65100', marginLeft: '6px' }}>(Pending)</span>
                      )}
                    </p>
                    <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>{new Date(p.created_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                    {p.notes && <p style={{ fontSize: '11px', color: '#888', margin: '2px 0 0' }}>{p.notes}</p>}
                  </div>
                  <p style={{ fontSize: '15px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>Rs. {Number(p.amount).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}

          {settings.jazzcash_number_1 && (
            <div style={{ background: '#f3e5f5', border: '1px solid #e1bee7', borderRadius: '12px', padding: '16px', marginTop: '16px' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#7b1fa2', margin: '0 0 10px' }}>📱 Pay via JazzCash</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: settings.jazzcash_number_2 ? '1px solid #e1bee7' : 'none' }}>
                <span style={{ fontSize: '13px', color: '#555' }}>{settings.jazzcash_name_1 || 'Account 1'}</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#7b1fa2' }}>{settings.jazzcash_number_1}</span>
              </div>
              {settings.jazzcash_number_2 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ fontSize: '13px', color: '#555' }}>{settings.jazzcash_name_2 || 'Account 2'}</span>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#7b1fa2' }}>{settings.jazzcash_number_2}</span>
                </div>
              )}
              <p style={{ fontSize: '11px', color: '#888', margin: '10px 0 0' }}>
                After sending JazzCash, inform your delivery rider or call us.
              </p>
            </div>
          )}
        </div>
      )}

      {/* BOTTOM NAV */}
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '430px', background: 'white', borderTop: '1px solid #eee', display: 'flex', zIndex: 100, boxShadow: '0 -2px 10px rgba(0,0,0,0.08)' }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ flex: 1, padding: '10px 4px', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
            <span style={{ fontSize: '22px' }}>{tab.icon}</span>
            <span style={{ fontSize: '10px', fontWeight: activeTab === tab.key ? '700' : '400', color: activeTab === tab.key ? '#0f4c81' : '#888' }}>{tab.label}</span>
            {activeTab === tab.key && <div style={{ width: '20px', height: '3px', background: '#0f4c81', borderRadius: '2px' }} />}
          </button>
        ))}
      </div>
    </div>
  )
}