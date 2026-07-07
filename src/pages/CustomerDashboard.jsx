import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

// ── PAY BILL MODAL — outside main component to prevent re-render focus loss ──
function PayBillModal({ balance, settings, customer, payBillAmount, setPayBillAmount, payBillSending, payBillDone, submitPayBill, onClose }) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: '480px', padding: '28px 24px', boxShadow: '0 -10px 40px rgba(0,0,0,0.2)' }}>
        {!payBillDone ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: 0 }}>💳 Pay Your Bill</h3>
              <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#888' }}>✕</button>
            </div>

            {settings.jazzcash_number_1 && (
              <div style={{ background: '#f3e5f5', border: '1px solid #e1bee7', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#7b1fa2', margin: '0 0 10px' }}>📱 Send payment to JazzCash:</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: settings.jazzcash_number_2 ? '8px' : '0' }}>
                  <span style={{ fontSize: '14px', color: '#555' }}>{settings.jazzcash_name_1 || 'Account'}</span>
                  <span style={{ fontSize: '18px', fontWeight: '700', color: '#7b1fa2' }}>{settings.jazzcash_number_1}</span>
                </div>
                {settings.jazzcash_number_2 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', color: '#555' }}>{settings.jazzcash_name_2 || 'Account 2'}</span>
                    <span style={{ fontSize: '18px', fontWeight: '700', color: '#7b1fa2' }}>{settings.jazzcash_number_2}</span>
                  </div>
                )}
              </div>
            )}

            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>Amount to Pay (Rs.)</p>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button onClick={() => setPayBillAmount(String(balance))}
                style={{ flex: 1, padding: '12px', border: '2px solid', borderColor: payBillAmount === String(balance) ? '#7b1fa2' : '#eee', borderRadius: '10px', cursor: 'pointer', background: payBillAmount === String(balance) ? '#7b1fa2' : '#f8f9fa', color: payBillAmount === String(balance) ? 'white' : '#333', fontWeight: '700', fontSize: '13px' }}>
                Full: Rs. {balance.toLocaleString()}
              </button>
              <button onClick={() => setPayBillAmount('')}
                style={{ flex: 1, padding: '12px', border: '2px solid', borderColor: payBillAmount !== String(balance) && payBillAmount !== '' ? '#7b1fa2' : '#eee', borderRadius: '10px', cursor: 'pointer', background: payBillAmount !== String(balance) && payBillAmount !== '' ? '#7b1fa2' : '#f8f9fa', color: payBillAmount !== String(balance) && payBillAmount !== '' ? 'white' : '#333', fontWeight: '700', fontSize: '13px' }}>
                Other Amount
              </button>
            </div>
            <input
              type="number"
              value={payBillAmount}
              onChange={e => setPayBillAmount(e.target.value)}
              placeholder={`e.g. ${balance}`}
              style={{ width: '100%', padding: '14px', border: '2px solid #ddd', borderRadius: '10px', fontSize: '24px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center', color: '#333', caretColor: '#7b1fa2', marginBottom: '16px' }}
            />

            <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px' }}>
              <p style={{ fontSize: '12px', color: '#f57f17', fontWeight: '600', margin: '0 0 4px' }}>📸 Important</p>
              <p style={{ fontSize: '12px', color: '#795548', margin: 0 }}>After sending JazzCash payment, tap the button below and send a screenshot to our WhatsApp to confirm your payment.</p>
            </div>

            <button onClick={submitPayBill} disabled={payBillSending}
              style={{ width: '100%', padding: '16px', background: '#25d366', color: 'white', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', marginBottom: '10px' }}>
              {payBillSending ? 'Recording...' : `✓ I've Sent Rs. ${Number(payBillAmount || 0).toLocaleString()} via JazzCash`}
            </button>
            <button onClick={onClose}
              style={{ width: '100%', padding: '12px', background: 'none', border: '1px solid #ddd', borderRadius: '10px', fontSize: '14px', color: '#888', cursor: 'pointer' }}>
              Cancel
            </button>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p style={{ fontSize: '52px', margin: '0 0 16px' }}>✅</p>
            <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#333', margin: '0 0 8px' }}>Payment Recorded!</h3>
            <p style={{ fontSize: '14px', color: '#888', margin: '0 0 24px', lineHeight: 1.6 }}>
              Your payment of <strong>Rs. {Number(payBillAmount).toLocaleString()}</strong> has been recorded.<br />
              Please send your JazzCash screenshot to WhatsApp to confirm.
            </p>
            {settings.whatsapp_number && (
              <a href={`https://wa.me/92${settings.whatsapp_number?.replace(/^0/, '')}?text=Assalam o Alaikum! I have sent JazzCash payment of Rs. ${Number(payBillAmount).toLocaleString()}. My account ID is ${customer.customer_code}. Please confirm my payment.`}
                target="_blank" rel="noreferrer"
                style={{ display: 'block', width: '100%', padding: '16px', background: '#25d366', color: 'white', borderRadius: '12px', fontSize: '16px', fontWeight: '700', textDecoration: 'none', textAlign: 'center', marginBottom: '12px', boxSizing: 'border-box' }}>
                💬 Send Screenshot on WhatsApp
              </a>
            )}
            <button onClick={onClose}
              style={{ width: '100%', padding: '12px', background: 'none', border: '1px solid #ddd', borderRadius: '10px', fontSize: '14px', color: '#888', cursor: 'pointer' }}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function CustomerDashboard({ customer, onLogout }) {
  const tenantId = customer.tenant_id
  const [activeTab, setActiveTab] = useState('home')
  const [deliveries, setDeliveries] = useState([])
  const [payments, setPayments] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState({})
  const [orderForm, setOrderForm] = useState({ qty_19l: 0, qty_half_litre: 0, qty_1_5l: 0, notes: '', delivery_date: new Date().toISOString().split('T')[0] })
  const [placingOrder, setPlacingOrder] = useState(false)
  const [orderSuccess, setOrderSuccess] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [showPayBill, setShowPayBill] = useState(false)
  const [payBillAmount, setPayBillAmount] = useState('')
  const [payBillSending, setPayBillSending] = useState(false)
  const [payBillDone, setPayBillDone] = useState(false)

  useEffect(() => {
    if (tenantId) fetchAll()
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [tenantId])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchDeliveries(), fetchPayments(), fetchOrders(), fetchSettings()])
    setLoading(false)
  }

  async function fetchSettings() {
    const { data } = await supabase.from('business_settings').select('*').eq('tenant_id', tenantId)
    const map = {}
    data?.forEach(s => { map[s.setting_key] = s.setting_value })
    setSettings(map)
  }

  async function fetchDeliveries() {
    const { data } = await supabase.from('deliveries').select('*')
      .eq('tenant_id', tenantId).eq('customer_id', customer.id)
      .eq('is_voided', false).order('delivered_at', { ascending: false }).limit(30)
    setDeliveries(data || [])
  }

  async function fetchPayments() {
    const { data } = await supabase.from('payments').select('*')
      .eq('tenant_id', tenantId).eq('customer_id', customer.id)
      .eq('is_voided', false).order('created_at', { ascending: false }).limit(20)
    setPayments(data || [])
  }

  async function fetchOrders() {
    const { data } = await supabase.from('orders').select('*')
      .eq('tenant_id', tenantId).eq('customer_id', customer.id)
      .order('created_at', { ascending: false }).limit(10)
    setOrders(data || [])
  }

  async function placeOrder() {
    const { qty_19l, qty_half_litre, qty_1_5l } = orderForm
    if (qty_19l === 0 && qty_half_litre === 0 && qty_1_5l === 0) return alert('Please enter at least one bottle quantity')
    setPlacingOrder(true)
    const { error } = await supabase.from('orders').insert([{
      tenant_id: tenantId, customer_id: customer.id,
      qty_19l, qty_half_litre, qty_1_5l,
      notes: orderForm.notes,
      delivery_date: orderForm.delivery_date || new Date().toISOString().split('T')[0],
      status: 'pending'
    }])
    if (error) { alert('Error: ' + error.message); setPlacingOrder(false); return }
    setOrderSuccess(true)
    setOrderForm({ qty_19l: 0, qty_half_litre: 0, qty_1_5l: 0, notes: '', delivery_date: new Date().toISOString().split('T')[0] })
    fetchOrders()
    setPlacingOrder(false)
    setTimeout(() => setOrderSuccess(false), 4000)
  }

  async function submitPayBill() {
    if (!payBillAmount || Number(payBillAmount) <= 0) return alert('Please enter amount')
    setPayBillSending(true)
    await supabase.from('payments').insert([{
      tenant_id: tenantId,
      customer_id: customer.id,
      amount: Number(payBillAmount),
      payment_method: 'jazzcash',
      payment_date: new Date().toISOString().split('T')[0],
      jazzcash_confirmed: false,
      notes: `Customer self-reported JazzCash payment — awaiting screenshot confirmation`,
      is_voided: false
    }])
    setPayBillSending(false)
    setPayBillDone(true)
    fetchPayments()
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

  // ── DESKTOP LAYOUT ──────────────────────────────────────────────
  if (!isMobile) {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f7fa', fontFamily: "'Inter', sans-serif" }}>
        {showPayBill && <PayBillModal balance={balance} settings={settings} customer={customer} payBillAmount={payBillAmount} setPayBillAmount={setPayBillAmount} payBillSending={payBillSending} payBillDone={payBillDone} submitPayBill={submitPayBill} onClose={() => { setShowPayBill(false); setPayBillDone(false) }} />}

        {/* TOP NAV */}
        <div style={{ background: '#0f4c81', padding: '0 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '64px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {settings.business_logo && <img src={settings.business_logo} alt="logo" style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'contain', background: 'white', padding: '2px' }} />}
            <div>
              <p style={{ fontSize: '16px', fontWeight: '700', color: 'white', margin: 0 }}>{settings.business_name || 'AquaRun'}</p>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>Customer Portal</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '14px', fontWeight: '600', color: 'white', margin: 0 }}>{customer.full_name}</p>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>ID: {customer.customer_code}</p>
            </div>
            <button onClick={onLogout}
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
              Logout
            </button>
          </div>
        </div>

        {/* TAB BAR */}
        <div style={{ background: 'white', borderBottom: '1px solid #eee', padding: '0 40px', display: 'flex', gap: '4px' }}>
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{ padding: '16px 24px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '14px', fontWeight: activeTab === tab.key ? '700' : '400', color: activeTab === tab.key ? '#0f4c81' : '#888', borderBottom: activeTab === tab.key ? '3px solid #0f4c81' : '3px solid transparent', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* CONTENT */}
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 40px' }}>

          {/* HOME */}
          {activeTab === 'home' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                <div style={{ gridColumn: '1 / 2', background: balance > 0 ? 'linear-gradient(135deg, #c62828, #e65100)' : 'linear-gradient(135deg, #0f4c81, #1a7a4a)', borderRadius: '16px', padding: '24px', color: 'white' }}>
                  <p style={{ fontSize: '12px', opacity: 0.8, margin: '0 0 8px' }}>{balance > 0 ? 'Outstanding Balance' : balance < 0 ? 'Advance Credit' : 'Account Clear'}</p>
                  <p style={{ fontSize: '36px', fontWeight: '700', margin: '0 0 4px', letterSpacing: '-1px' }}>Rs. {Math.abs(balance).toLocaleString()}</p>
                  <p style={{ fontSize: '12px', opacity: 0.6, margin: balance > 0 ? '0 0 12px' : '0' }}>{balance > 0 ? 'Please pay at earliest' : balance < 0 ? 'You have advance credit' : 'No outstanding amount'}</p>
                  {balance > 0 && (
                    <button onClick={() => { setShowPayBill(true); setPayBillAmount(String(balance)); setPayBillDone(false) }}
                      style={{ width: '100%', padding: '10px', background: '#25d366', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      💳 Pay Your Bill
                    </button>
                  )}
                </div>
                <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', borderTop: '4px solid #0f4c81' }}>
                  <p style={{ fontSize: '12px', color: '#888', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deliveries</p>
                  <p style={{ fontSize: '36px', fontWeight: '700', color: '#0f4c81', margin: '0 0 4px' }}>{deliveries.length}</p>
                  <p style={{ fontSize: '12px', color: '#aaa', margin: 0 }}>Last 30 orders</p>
                </div>
                <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', borderTop: '4px solid #1a7a4a' }}>
                  <p style={{ fontSize: '12px', color: '#888', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bottles Received</p>
                  <p style={{ fontSize: '36px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 4px' }}>{totalBottles19l}</p>
                  <p style={{ fontSize: '12px', color: '#aaa', margin: 0 }}>19L bottles total</p>
                </div>
                <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', borderTop: '4px solid #9c27b0' }}>
                  <p style={{ fontSize: '12px', color: '#888', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Spent</p>
                  <p style={{ fontSize: '36px', fontWeight: '700', color: '#9c27b0', margin: '0 0 4px' }}>Rs. {totalSpent.toLocaleString()}</p>
                  <p style={{ fontSize: '12px', color: '#aaa', margin: 0 }}>All time</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#333', margin: '0 0 16px' }}>Your Bottle Rates</h3>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ flex: 1, background: '#e3f0ff', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                      <p style={{ fontSize: '12px', color: '#888', margin: '0 0 6px' }}>19 Litre</p>
                      <p style={{ fontSize: '28px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {customer.rate_19l}</p>
                    </div>
                    {customer.rate_half_litre > 0 && (
                      <div style={{ flex: 1, background: '#e3f0ff', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                        <p style={{ fontSize: '12px', color: '#888', margin: '0 0 6px' }}>Half Litre</p>
                        <p style={{ fontSize: '28px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {customer.rate_half_litre}</p>
                      </div>
                    )}
                    {customer.rate_1_5l > 0 && (
                      <div style={{ flex: 1, background: '#e3f0ff', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
                        <p style={{ fontSize: '12px', color: '#888', margin: '0 0 6px' }}>1.5 Litre</p>
                        <p style={{ fontSize: '28px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {customer.rate_1_5l}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#333', margin: '0 0 16px' }}>Contact Us</h3>
                  {settings.complaint_number && (
                    <a href={`tel:${settings.complaint_number}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#f0f7ff', borderRadius: '10px', marginBottom: '10px' }}>
                      <span style={{ fontSize: '24px' }}>📞</span>
                      <div>
                        <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Complaint / Support</p>
                        <p style={{ fontSize: '16px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>{settings.complaint_number}</p>
                      </div>
                    </a>
                  )}
                  {settings.whatsapp_number && (
                    <a href={`https://wa.me/92${settings.whatsapp_number?.replace(/^0/, '')}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: '#f0fff4', borderRadius: '10px' }}>
                      <span style={{ fontSize: '24px' }}>💬</span>
                      <div>
                        <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>WhatsApp</p>
                        <p style={{ fontSize: '16px', fontWeight: '700', color: '#25d366', margin: 0 }}>{settings.whatsapp_number}</p>
                      </div>
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ORDER */}
          {activeTab === 'order' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div>
                <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>📦 Place Order</h2>
                <p style={{ fontSize: '14px', color: '#888', margin: '0 0 24px' }}>Request your next water delivery</p>
                {orderSuccess && (
                  <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
                    <p style={{ fontWeight: '700', color: '#1b5e20', margin: '0 0 4px' }}>✅ Order Placed!</p>
                    <p style={{ fontSize: '13px', color: '#2e7d32', margin: 0 }}>Your order has been submitted. Our rider will deliver soon.</p>
                  </div>
                )}
                <div style={{ background: 'white', borderRadius: '16px', padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: '#555', marginBottom: '20px' }}>Select Bottles</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div><p style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 4px' }}>19 Litre</p><p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Rs. {customer.rate_19l} each</p></div>
                    {numBtn(orderForm.qty_19l, 'qty_19l')}
                  </div>
                  {customer.rate_half_litre > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <div><p style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 4px' }}>Half Litre</p><p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Rs. {customer.rate_half_litre} each</p></div>
                      {numBtn(orderForm.qty_half_litre, 'qty_half_litre')}
                    </div>
                  )}
                  {customer.rate_1_5l > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <div><p style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 4px' }}>1.5 Litre</p><p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Rs. {customer.rate_1_5l} each</p></div>
                      {numBtn(orderForm.qty_1_5l, 'qty_1_5l')}
                    </div>
                  )}
                  <div>
                    <label style={{ fontSize: '13px', color: '#555', display: 'block', marginBottom: '8px', fontWeight: '600' }}>Special Instructions</label>
                      <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '13px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>Delivery Date *</label>
                      <input type="date" value={orderForm.delivery_date}
                        onChange={e => setOrderForm(f => ({ ...f, delivery_date: e.target.value }))}
                        min={new Date().toISOString().split('T')[0]}
                        style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <input value={orderForm.notes} onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="e.g. Please deliver in the morning..."
                      style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <button onClick={placeOrder} disabled={placingOrder}
                  style={{ width: '100%', padding: '16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '16px', fontWeight: '700' }}>
                  {placingOrder ? 'Placing Order...' : '✓ Place Order'}
                </button>
              </div>
              <div>
                {(orderForm.qty_19l > 0 || orderForm.qty_half_litre > 0 || orderForm.qty_1_5l > 0) && (
                  <div style={{ background: '#e8f5e9', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
                    <p style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 12px' }}>Order Summary</p>
                    {orderForm.qty_19l > 0 && <p style={{ fontSize: '14px', color: '#555', margin: '0 0 6px' }}>19L × {orderForm.qty_19l} = Rs. {(orderForm.qty_19l * customer.rate_19l).toLocaleString()}</p>}
                    {orderForm.qty_half_litre > 0 && <p style={{ fontSize: '14px', color: '#555', margin: '0 0 6px' }}>Half × {orderForm.qty_half_litre} = Rs. {(orderForm.qty_half_litre * customer.rate_half_litre).toLocaleString()}</p>}
                    {orderForm.qty_1_5l > 0 && <p style={{ fontSize: '14px', color: '#555', margin: '0 0 6px' }}>1.5L × {orderForm.qty_1_5l} = Rs. {(orderForm.qty_1_5l * customer.rate_1_5l).toLocaleString()}</p>}
                    <div style={{ borderTop: '1px solid #c8e6c9', marginTop: '10px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '16px', fontWeight: '700', color: '#1a7a4a' }}>Estimated Total</span>
                      <span style={{ fontSize: '20px', fontWeight: '700', color: '#1a7a4a' }}>Rs. {((orderForm.qty_19l * customer.rate_19l) + (orderForm.qty_half_litre * customer.rate_half_litre) + (orderForm.qty_1_5l * customer.rate_1_5l)).toLocaleString()}</span>
                    </div>
                  </div>
                )}
                <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                  <p style={{ fontSize: '15px', fontWeight: '700', color: '#333', margin: '0 0 16px' }}>Recent Orders</p>
                  {orders.length === 0 ? <p style={{ color: '#888', fontSize: '14px' }}>No orders yet</p> : orders.slice(0, 5).map(o => (
                    <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <div>
                        <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>{o.qty_19l > 0 ? `19L×${o.qty_19l} ` : ''}{o.qty_half_litre > 0 ? `Half×${o.qty_half_litre} ` : ''}{o.qty_1_5l > 0 ? `1.5L×${o.qty_1_5l}` : ''}</p>
                        <p style={{ fontSize: '12px', color: '#aaa', margin: 0 }}>{new Date(o.created_at).toLocaleDateString('en-PK')}</p>
                      </div>
                      <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '700', background: o.status === 'completed' ? '#e8f5e9' : o.status === 'assigned' ? '#e3f0ff' : o.status === 'cancelled' ? '#ffebee' : '#fff3e0', color: o.status === 'completed' ? '#2e7d32' : o.status === 'assigned' ? '#0f4c81' : o.status === 'cancelled' ? '#c62828' : '#e65100' }}>
                        {o.status === 'completed' ? '✅ Done' : o.status === 'assigned' ? '🚴 On the way' : o.status === 'cancelled' ? '✕ Cancelled' : '⏳ Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* HISTORY */}
          {activeTab === 'history' && (
            <div>
              <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#333', margin: '0 0 24px' }}>📋 Delivery History</h2>
              {deliveries.length === 0 ? (
                <div style={{ background: 'white', borderRadius: '16px', padding: '60px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                  <p style={{ fontSize: '40px', margin: '0 0 12px' }}>📦</p>
                  <p style={{ color: '#888', fontSize: '16px' }}>No deliveries yet</p>
                </div>
              ) : (
                <div style={{ background: 'white', borderRadius: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8f9fa' }}>
                        {['Date', 'Bottles', 'Amount', 'Payment Method', 'Credit'].map(h => (
                          <th key={h} style={{ padding: '14px 20px', textAlign: 'left', fontSize: '12px', color: '#888', fontWeight: '600', borderBottom: '1px solid #eee', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {deliveries.map((d, i) => (
                        <tr key={d.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                          <td style={{ padding: '14px 20px', fontSize: '13px', color: '#555' }}>{new Date(d.delivered_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                          <td style={{ padding: '14px 20px', fontSize: '13px', color: '#333' }}>{d.qty_19l > 0 ? `19L×${d.qty_19l} ` : ''}{d.qty_half_litre > 0 ? `Half×${d.qty_half_litre} ` : ''}{d.qty_1_5l > 0 ? `1.5L×${d.qty_1_5l}` : ''}</td>
                          <td style={{ padding: '14px 20px', fontSize: '14px', fontWeight: '700', color: '#0f4c81' }}>Rs. {Number(d.total_amount).toLocaleString()}</td>
                          <td style={{ padding: '14px 20px' }}>
                            <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', background: d.payment_method === 'cash' ? '#e8f5e9' : d.payment_method === 'jazzcash' ? '#f3e5f5' : '#fff3e0', color: d.payment_method === 'cash' ? '#2e7d32' : d.payment_method === 'jazzcash' ? '#7b1fa2' : '#e65100' }}>
                              {d.payment_method === 'cash' ? '💵 Cash' : d.payment_method === 'jazzcash' ? '📱 JazzCash' : '📋 Credit'}
                            </span>
                          </td>
                          <td style={{ padding: '14px 20px', fontSize: '13px', color: Number(d.credit_amount) > 0 ? '#f44336' : '#aaa' }}>
                            {Number(d.credit_amount) > 0 ? `Rs. ${Number(d.credit_amount).toLocaleString()}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ACCOUNT */}
          {activeTab === 'account' && (
            <div>
              <h2 style={{ fontSize: '22px', fontWeight: '700', color: '#333', margin: '0 0 24px' }}>💰 Account Statement</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <div style={{ background: balance > 0 ? 'linear-gradient(135deg, #c62828, #e65100)' : 'linear-gradient(135deg, #0f4c81, #1a7a4a)', color: 'white', borderRadius: '16px', padding: '28px', marginBottom: '20px' }}>
                    <p style={{ fontSize: '13px', opacity: 0.8, margin: '0 0 8px' }}>{balance > 0 ? 'Outstanding Balance' : balance < 0 ? 'Advance Credit' : 'Account Clear'}</p>
                    <p style={{ fontSize: '48px', fontWeight: '700', margin: '0 0 6px', letterSpacing: '-2px' }}>Rs. {Math.abs(balance).toLocaleString()}</p>
                    <p style={{ fontSize: '12px', opacity: 0.6, margin: balance > 0 ? '0 0 12px' : '0' }}>ID: {customer.customer_code}</p>
                    {balance > 0 && (
                      <button onClick={() => { setShowPayBill(true); setPayBillAmount(String(balance)); setPayBillDone(false) }}
                        style={{ width: '100%', padding: '10px', background: '#25d366', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
                        💳 Pay Your Bill
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                    <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
                      <p style={{ fontSize: '12px', color: '#888', margin: '0 0 6px' }}>Total Spent</p>
                      <p style={{ fontSize: '24px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {totalSpent.toLocaleString()}</p>
                    </div>
                    <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
                      <p style={{ fontSize: '12px', color: '#888', margin: '0 0 6px' }}>Payments Made</p>
                      <p style={{ fontSize: '24px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>{payments.length}</p>
                    </div>
                  </div>
                  {settings.jazzcash_number_1 && (
                    <div style={{ background: '#f3e5f5', border: '1px solid #e1bee7', borderRadius: '12px', padding: '20px' }}>
                      <p style={{ fontSize: '14px', fontWeight: '700', color: '#7b1fa2', margin: '0 0 12px' }}>📱 Pay via JazzCash</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: settings.jazzcash_number_2 ? '1px solid #e1bee7' : 'none' }}>
                        <span style={{ fontSize: '14px', color: '#555' }}>{settings.jazzcash_name_1 || 'Account 1'}</span>
                        <span style={{ fontSize: '15px', fontWeight: '700', color: '#7b1fa2' }}>{settings.jazzcash_number_1}</span>
                      </div>
                      {settings.jazzcash_number_2 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                          <span style={{ fontSize: '14px', color: '#555' }}>{settings.jazzcash_name_2 || 'Account 2'}</span>
                          <span style={{ fontSize: '15px', fontWeight: '700', color: '#7b1fa2' }}>{settings.jazzcash_number_2}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                  <p style={{ fontSize: '15px', fontWeight: '700', color: '#333', margin: '0 0 16px' }}>Payment History</p>
                  {payments.length === 0 ? (
                    <p style={{ color: '#888', fontSize: '14px' }}>No payments recorded yet</p>
                  ) : payments.map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <div>
                        <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>
                          {p.payment_method === 'cash' ? '💵 Cash' : p.payment_method === 'jazzcash' ? '📱 JazzCash' : '🏦 Bank'} Payment
                          {p.payment_method === 'jazzcash' && !p.jazzcash_confirmed && <span style={{ fontSize: '11px', color: '#e65100', marginLeft: '6px' }}>(Pending)</span>}
                        </p>
                        <p style={{ fontSize: '12px', color: '#aaa', margin: 0 }}>{new Date(p.created_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                      </div>
                      <p style={{ fontSize: '16px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>Rs. {Number(p.amount).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── MOBILE LAYOUT ───────────────────────────────────────────────
  return (
    <div style={{ maxWidth: '430px', margin: '0 auto', minHeight: '100vh', background: '#f5f7fa', position: 'relative', paddingBottom: '80px', width: '100%' }}>
      {showPayBill && <PayBillModal balance={balance} settings={settings} customer={customer} payBillAmount={payBillAmount} setPayBillAmount={setPayBillAmount} payBillSending={payBillSending} payBillDone={payBillDone} submitPayBill={submitPayBill} onClose={() => { setShowPayBill(false); setPayBillDone(false) }} />}

      {/* TOP NAV */}
      <div style={{ background: '#0f4c81', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {settings.business_logo && <img src={settings.business_logo} alt="logo" style={{ width: '36px', height: '36px', borderRadius: '8px', objectFit: 'contain', background: 'white', padding: '2px' }} />}
          <div>
            <p style={{ fontSize: '16px', fontWeight: '700', color: 'white', margin: 0 }}>{settings.business_name || 'AquaRun'}</p>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', margin: 0 }}>{customer.full_name}</p>
          </div>
        </div>
        <button onClick={onLogout} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Logout</button>
      </div>

      <div style={{ padding: '16px' }}>

        {/* HOME */}
        {activeTab === 'home' && (
          <div>
            <div style={{ background: balance > 0 ? 'linear-gradient(135deg, #c62828, #e65100)' : balance < 0 ? 'linear-gradient(135deg, #0f4c81, #1a7a4a)' : 'linear-gradient(135deg, #1a7a4a, #0f4c81)', borderRadius: '16px', padding: '24px', marginBottom: '12px', color: 'white', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', opacity: 0.8, margin: '0 0 8px' }}>{balance > 0 ? '⚠️ Outstanding Balance' : balance < 0 ? '✅ Advance Credit' : '✅ Account Clear'}</p>
              <p style={{ fontSize: '44px', fontWeight: '700', margin: '0 0 6px' }}>Rs. {Math.abs(balance).toLocaleString()}</p>
              <p style={{ fontSize: '11px', opacity: 0.6, margin: 0 }}>ID: {customer.customer_code}</p>
            </div>
            {balance > 0 && (
              <button onClick={() => { setShowPayBill(true); setPayBillAmount(String(balance)); setPayBillDone(false) }}
                style={{ width: '100%', padding: '14px', background: '#25d366', color: 'white', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                💳 Pay Your Bill
              </button>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              <div style={{ background: 'white', borderRadius: '12px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
                <p style={{ fontSize: '11px', color: '#888', margin: '0 0 6px' }}>Total Deliveries</p>
                <p style={{ fontSize: '28px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>{deliveries.length}</p>
              </div>
              <div style={{ background: 'white', borderRadius: '12px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
                <p style={{ fontSize: '11px', color: '#888', margin: '0 0 6px' }}>Bottles Received</p>
                <p style={{ fontSize: '28px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>{totalBottles19l}</p>
              </div>
            </div>
            <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', margin: '0 0 10px', textTransform: 'uppercase' }}>Your Rates</p>
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>19 Litre</p>
                  <p style={{ fontSize: '18px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {customer.rate_19l}</p>
                </div>
                {customer.rate_half_litre > 0 && <div style={{ textAlign: 'center' }}><p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>Half Litre</p><p style={{ fontSize: '18px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {customer.rate_half_litre}</p></div>}
                {customer.rate_1_5l > 0 && <div style={{ textAlign: 'center' }}><p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>1.5 Litre</p><p style={{ fontSize: '18px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {customer.rate_1_5l}</p></div>}
              </div>
            </div>
            {(settings.complaint_number || settings.whatsapp_number) && (
              <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', margin: '0 0 10px', textTransform: 'uppercase' }}>Contact Us</p>
                {settings.complaint_number && <a href={`tel:${settings.complaint_number}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: settings.whatsapp_number ? '1px solid #f0f0f0' : 'none' }}><span style={{ fontSize: '20px' }}>📞</span><div><p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Complaint / Support</p><p style={{ fontSize: '14px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>{settings.complaint_number}</p></div></a>}
                {settings.whatsapp_number && <a href={`https://wa.me/92${settings.whatsapp_number?.replace(/^0/, '')}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0' }}><span style={{ fontSize: '20px' }}>💬</span><div><p style={{ fontSize: '12px', color: '#888', margin: 0 }}>WhatsApp</p><p style={{ fontSize: '14px', fontWeight: '700', color: '#25d366', margin: 0 }}>{settings.whatsapp_number}</p></div></a>}
              </div>
            )}
          </div>
        )}

        {/* ORDER */}
        {activeTab === 'order' && (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '4px' }}>📦 Place Order</h3>
            <p style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>Request your next water delivery</p>
            {orderSuccess && <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}><p style={{ fontWeight: '700', color: '#1b5e20', margin: '0 0 4px' }}>✅ Order Placed!</p><p style={{ fontSize: '13px', color: '#2e7d32', margin: 0 }}>Your order has been submitted.</p></div>}
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}><div><p style={{ fontSize: '15px', fontWeight: '600', margin: '0 0 2px' }}>19 Litre</p><p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Rs. {customer.rate_19l} each</p></div>{numBtn(orderForm.qty_19l, 'qty_19l')}</div>
              {customer.rate_half_litre > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}><div><p style={{ fontSize: '15px', fontWeight: '600', margin: '0 0 2px' }}>Half Litre</p><p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Rs. {customer.rate_half_litre} each</p></div>{numBtn(orderForm.qty_half_litre, 'qty_half_litre')}</div>}
              {customer.rate_1_5l > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}><div><p style={{ fontSize: '15px', fontWeight: '600', margin: '0 0 2px' }}>1.5 Litre</p><p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Rs. {customer.rate_1_5l} each</p></div>{numBtn(orderForm.qty_1_5l, 'qty_1_5l')}</div>}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Delivery Date *</label>
                <input type="date" value={orderForm.delivery_date}
                  onChange={e => setOrderForm(f => ({ ...f, delivery_date: e.target.value }))}
                  min={new Date().toISOString().split('T')[0]}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <input value={orderForm.notes} onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))} placeholder="Special instructions..." style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            {(orderForm.qty_19l > 0 || orderForm.qty_half_litre > 0 || orderForm.qty_1_5l > 0) && (
              <div style={{ background: '#e8f5e9', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a' }}>Estimated Total</span>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: '#1a7a4a' }}>Rs. {((orderForm.qty_19l * customer.rate_19l) + (orderForm.qty_half_litre * customer.rate_half_litre) + (orderForm.qty_1_5l * customer.rate_1_5l)).toLocaleString()}</span>
                </div>
              </div>
            )}
            <button onClick={placeOrder} disabled={placingOrder} style={{ width: '100%', padding: '16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '16px', fontWeight: '700' }}>
              {placingOrder ? 'Placing Order...' : '✓ Place Order'}
            </button>
          </div>
        )}

        {/* HISTORY */}
        {activeTab === 'history' && (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>📋 Delivery History</h3>
            {deliveries.length === 0 ? <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center' }}><p style={{ fontSize: '32px', margin: '0 0 8px' }}>📦</p><p style={{ color: '#888' }}>No deliveries yet</p></div> : deliveries.map(d => (
              <div key={d.id} style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: '0 0 2px' }}>{d.qty_19l > 0 ? `19L×${d.qty_19l} ` : ''}{d.qty_half_litre > 0 ? `Half×${d.qty_half_litre} ` : ''}{d.qty_1_5l > 0 ? `1.5L×${d.qty_1_5l}` : ''}</p>
                    <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>{new Date(d.delivered_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '16px', fontWeight: '700', color: '#0f4c81', margin: '0 0 4px' }}>Rs. {Number(d.total_amount).toLocaleString()}</p>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: '600', background: d.payment_method === 'cash' ? '#e8f5e9' : d.payment_method === 'jazzcash' ? '#f3e5f5' : '#fff3e0', color: d.payment_method === 'cash' ? '#2e7d32' : d.payment_method === 'jazzcash' ? '#7b1fa2' : '#e65100' }}>
                      {d.payment_method === 'cash' ? '💵 Cash' : d.payment_method === 'jazzcash' ? '📱 JazzCash' : '📋 Credit'}
                    </span>
                  </div>
                </div>
                {Number(d.credit_amount) > 0 && <div style={{ background: '#fff3e0', borderRadius: '6px', padding: '6px 10px' }}><p style={{ fontSize: '11px', color: '#e65100', margin: 0 }}>📋 Rs. {Number(d.credit_amount).toLocaleString()} added to balance</p></div>}
              </div>
            ))}
          </div>
        )}

        {/* ACCOUNT */}
        {activeTab === 'account' && (
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>💰 Account Statement</h3>
            <div style={{ background: balance > 0 ? 'linear-gradient(135deg, #c62828, #e65100)' : 'linear-gradient(135deg, #0f4c81, #1a7a4a)', color: 'white', borderRadius: '12px', padding: '20px', marginBottom: '12px', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', opacity: 0.8, margin: '0 0 6px' }}>{balance > 0 ? 'Outstanding Balance' : balance < 0 ? 'Advance Credit' : 'Account Clear'}</p>
              <p style={{ fontSize: '36px', fontWeight: '700', margin: '0 0 4px' }}>Rs. {Math.abs(balance).toLocaleString()}</p>
              <p style={{ fontSize: '11px', opacity: 0.6, margin: 0 }}>ID: {customer.customer_code}</p>
            </div>
            {balance > 0 && (
              <button onClick={() => { setShowPayBill(true); setPayBillAmount(String(balance)); setPayBillDone(false) }}
                style={{ width: '100%', padding: '14px', background: '#25d366', color: 'white', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                💳 Pay Your Bill
              </button>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              <div style={{ background: 'white', borderRadius: '10px', padding: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}><p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>Total Spent</p><p style={{ fontSize: '16px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {totalSpent.toLocaleString()}</p></div>
              <div style={{ background: 'white', borderRadius: '10px', padding: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}><p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>Payments Made</p><p style={{ fontSize: '16px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>{payments.length}</p></div>
            </div>
            {payments.length > 0 && (
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>Recent Payments</p>
                {payments.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <div><p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>{p.payment_method === 'cash' ? '💵' : p.payment_method === 'jazzcash' ? '📱' : '🏦'} Payment{p.payment_method === 'jazzcash' && !p.jazzcash_confirmed && <span style={{ fontSize: '10px', color: '#e65100', marginLeft: '4px' }}>(Pending)</span>}</p><p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>{new Date(p.created_at).toLocaleDateString('en-PK')}</p></div>
                    <p style={{ fontSize: '15px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>Rs. {Number(p.amount).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
            {settings.jazzcash_number_1 && (
              <div style={{ background: '#f3e5f5', border: '1px solid #e1bee7', borderRadius: '12px', padding: '16px' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#7b1fa2', margin: '0 0 10px' }}>📱 Pay via JazzCash</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: settings.jazzcash_number_2 ? '1px solid #e1bee7' : 'none' }}><span style={{ fontSize: '13px', color: '#555' }}>{settings.jazzcash_name_1 || 'Account 1'}</span><span style={{ fontSize: '14px', fontWeight: '700', color: '#7b1fa2' }}>{settings.jazzcash_number_1}</span></div>
                {settings.jazzcash_number_2 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><span style={{ fontSize: '13px', color: '#555' }}>{settings.jazzcash_name_2 || 'Account 2'}</span><span style={{ fontSize: '14px', fontWeight: '700', color: '#7b1fa2' }}>{settings.jazzcash_number_2}</span></div>}
              </div>
            )}
          </div>
        )}
      </div>

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
