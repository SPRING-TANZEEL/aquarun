import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

async function superAdminAction(payload) {
  const res = await fetch('/api/super-admin-actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Server error')
  return data
}

const PLAN_COLORS = {
  basic:    { bg: '#e3f0ff', color: '#0f4c81', label: 'Basic' },
  standard: { bg: '#e8f5e9', color: '#1a7a4a', label: 'Standard' },
  premium:  { bg: '#f3e8ff', color: '#7c3aed', label: 'Premium' },
  owner:    { bg: '#fff8e1', color: '#b45309', label: 'Owner' },
}

const SUB_STATUS = {
  trial:   { bg: '#e3f0ff', color: '#0f4c81', label: '🔵 Trial' },
  active:  { bg: '#e8f5e9', color: '#1a7a4a', label: '✅ Active' },
  grace:   { bg: '#fff8e1', color: '#b45309', label: '⚠️ Grace' },
  expired: { bg: '#ffebee', color: '#c62828', label: '❌ Expired' },
  paused:  { bg: '#f5f5f5', color: '#888',    label: '⏸️ Paused' },
}

function FeatureToggle({ active, onToggle, icon, label }) {
  return (
    <button onClick={onToggle} style={{
      display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
      borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
      background: active ? '#e8f5e9' : '#f0f4f8',
      color: active ? '#1a7a4a' : '#888',
    }}>
      <span>{icon}</span>
      <span>{label}</span>
      <span style={{ width: 28, height: 14, borderRadius: 7, position: 'relative', background: active ? '#1a7a4a' : '#ccc', flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 2, left: active ? 16 : 2, width: 10, height: 10, borderRadius: '50%', background: 'white', transition: 'all 0.15s' }} />
      </span>
    </button>
  )
}

export default function SuperAdminDashboard({ onLogout }) {
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('clients')
  const [showAddForm, setShowAddForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [subEditId, setSubEditId] = useState(null)
  const [subForm, setSubForm] = useState({ status: 'active', plan: 'monthly', expiry: '' })
  const [form, setForm] = useState({
    tenant_code: '', business_name: '', admin_password: '', email: '',
    plan: 'basic', setup_fee: '', monthly_fee: '', notes: ''
  })
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => { fetchTenants() }, [])

  async function fetchTenants() {
    setLoading(true)
    const { data } = await supabase.from('tenants').select('*').order('created_at', { ascending: false })
    setTenants(data || [])
    setLoading(false)
  }

  // Stats
  const totalClients   = tenants.length
  const activeClients  = tenants.filter(t => t.is_active).length
  const trialClients   = tenants.filter(t => t.subscription_status === 'trial').length
  const expiredClients = tenants.filter(t => ['expired', 'grace'].includes(t.subscription_status)).length
  const monthlyRevenue = tenants.filter(t => t.is_active && t.subscription_status === 'active').reduce((s, t) => s + Number(t.monthly_fee || 2500), 0)

  // Subscription helper
  function getSubInfo(t) {
    const today = new Date(); today.setHours(0,0,0,0)
    const status = t.subscription_status || 'trial'
    if (status === 'trial') {
      const end = t.trial_ends_at ? new Date(t.trial_ends_at) : null
      const daysLeft = end ? Math.ceil((end - today) / 86400000) : null
      return { status, daysLeft, label: daysLeft !== null ? `${daysLeft}d left` : 'Trial' }
    }
    if (status === 'active') {
      const end = t.subscription_expiry ? new Date(t.subscription_expiry) : null
      const daysLeft = end ? Math.ceil((end - today) / 86400000) : null
      return { status, daysLeft, label: daysLeft !== null ? `${daysLeft}d left` : 'Active' }
    }
    return { status, daysLeft: null, label: status }
  }

  async function addTenant() {
    if (!form.tenant_code || !form.business_name || !form.admin_password) return alert('Business ID, Name and Password are required')
    setSaving(true)
    try {
      await superAdminAction({
        action: 'createTenant',
        tenantCode: form.tenant_code.toUpperCase(),
        tenantData: {
          tenant_code: form.tenant_code.toUpperCase(),
          business_name: form.business_name,
          admin_password: form.admin_password,
          email: form.email,
          plan: form.plan,
          setup_fee: Number(form.setup_fee) || 0,
          monthly_fee: Number(form.monthly_fee) || 2500,
          notes: form.notes,
          is_active: true,
          subscription_status: 'trial',
          trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
        }
      })
      setShowAddForm(false)
      setForm({ tenant_code: '', business_name: '', admin_password: '', email: '', plan: 'basic', setup_fee: '', monthly_fee: '', notes: '' })
      alert(`✅ Client created!\n\nBusiness ID: ${form.tenant_code.toUpperCase()}\nEmail: ${form.email}\nPassword: ${form.admin_password}\n\n14-day free trial started.`)
      fetchTenants()
    } catch (e) { alert('Error: ' + e.message) }
    setSaving(false)
  }

  async function updateSubscription(t) {
    try {
      await supabase.rpc('update_tenant_subscription', {
        p_tenant_id: t.id,
        p_status: subForm.status,
        p_plan: subForm.plan,
        p_expiry: subForm.expiry || null,
      })
      setSubEditId(null)
      fetchTenants()
      alert('✅ Subscription updated!')
    } catch (e) { alert('Error: ' + e.message) }
  }

  async function activateSubscription(t, plan) {
    const days = plan === 'monthly' ? 30 : 365
    const expiry = new Date(Date.now() + days * 86400000).toISOString().split('T')[0]
    try {
      await supabase.rpc('update_tenant_subscription', {
        p_tenant_id: t.id,
        p_status: 'active',
        p_plan: plan,
        p_expiry: expiry,
        p_fee: plan === 'monthly' ? 2500 : 25000,
      })
      fetchTenants()
      alert(`✅ ${plan === 'monthly' ? 'Monthly' : 'Yearly'} subscription activated!\nExpiry: ${expiry}`)
    } catch (e) { alert('Error: ' + e.message) }
  }

  async function toggleActive(t) {
    if (t.tenant_code === 'SW001') return alert('Cannot deactivate your own business')
    await superAdminAction({ action: 'toggleActive', tenantId: t.id, isActive: !t.is_active })
    fetchTenants()
  }

  async function toggleFeature(t, field) {
    const newVal = !t[field]
    await superAdminAction({ action: 'toggleFeature', tenantId: t.id, field, value: newVal })
    setTenants(prev => prev.map(x => x.id === t.id ? { ...x, [field]: newVal } : x))
  }

    const [emailEditId, setEmailEditId] = useState(null)
  const [newEmail, setNewEmail] = useState('')
  const [emailSaving, setEmailSaving] = useState(false)

  async function updateEmail(t) {
    if (!newEmail.trim()) return alert('Please enter new email')
    if (!newEmail.includes('@')) return alert('Invalid email address')
    setEmailSaving(true)
    try {
      // Update in Supabase Auth
      const result = await superAdminAction({ action: 'updateEmail', tenantId: t.id, newEmail: newEmail.trim().toLowerCase() })
      // Update in tenants table
      await supabase.from('tenants').update({ email: newEmail.trim().toLowerCase() }).eq('id', t.id)
      alert(`✅ Email updated!\n\nNew email: ${newEmail.trim().toLowerCase()}`)
      setEmailEditId(null)
      setNewEmail('')
      fetchTenants()
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setEmailSaving(false)
  }

  async function resetPassword(t) {
    const newPass = prompt(`Reset password for ${t.business_name}:`)
    if (!newPass?.trim()) return
    try {
      if (t.email) {
        const result = await superAdminAction({ action: 'createAuthUser', email: t.email, password: newPass.trim() })
        alert('Auth result: ' + JSON.stringify(result))
        if (result.auth_user_id) {
          const rpcResult = await supabase.rpc('update_tenant_auth_user', { p_tenant_id: t.id, p_auth_user_id: result.auth_user_id })
          alert('RPC result: ' + JSON.stringify(rpcResult))
        }
      } else {
        await superAdminAction({ action: 'resetPassword', tenantId: t.id, newPassword: newPass.trim() })
      }
      alert(`✅ Done!\n\nEmail: ${t.email || t.tenant_code}\nNew Password: ${newPass.trim()}`)
      fetchTenants()
    } catch (e) { alert('Error: ' + e.message) }
  }

  async function deleteTenant(t) {
    if (t.tenant_code === 'SW001') return alert('Cannot delete your own business')
    if (!window.confirm(`DELETE ${t.business_name}?\n\nThis will permanently delete ALL data.`)) return
    if (!window.confirm(`Final confirmation — delete ${t.business_name} permanently?`)) return
    try {
      await superAdminAction({ action: 'deleteTenant', tenantId: t.id, tenantCode: t.tenant_code })
      alert(`✅ ${t.business_name} deleted.`)
      fetchTenants()
    } catch (e) { alert('Error: ' + e.message) }
  }

  function copyWhatsApp(t) {
    const msg = `Assalam o Alaikum! 🎉\nYour AquaRun account is ready.\n\n🌐 Website: aquarun.vercel.app\n🏢 Business ID: ${t.tenant_code}\n📧 Email: ${t.email || ''}\n🔑 Password: [your password]\n\nYou have 14 days free trial.\nSupport: +92 323 7919338`
    navigator.clipboard.writeText(msg).then(() => alert('✅ Message copied!')).catch(() => prompt('Copy this:', msg))
  }

  const inp = { width: '100%', padding: '10px 12px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: 'white', color: '#333' }

  const filteredTenants = tenants.filter(t =>
    !searchQuery ||
    t.business_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.tenant_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.email?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Top Bar */}
      <div style={{ background: 'linear-gradient(135deg, #0f4c81 0%, #1a6bad 100%)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>💧</div>
          <div>
            <p style={{ color: '#fff', fontWeight: 800, fontSize: 15, margin: 0 }}>AquaRun SuperAdmin</p>
            <p style={{ color: '#93c5fd', fontSize: 11, margin: 0 }}>Client Management Portal</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#93c5fd', fontSize: 12 }}>Tanzeel · +92 323 7919338</span>
          <button onClick={onLogout} style={{ padding: '7px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Logout</button>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 16px' }}>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Total Clients', value: totalClients, icon: '🏢', color: '#0f4c81', bg: '#e3f0ff' },
            { label: 'Active Clients', value: activeClients, icon: '✅', color: '#1a7a4a', bg: '#e8f5e9' },
            { label: 'On Trial', value: trialClients, icon: '🔵', color: '#7c3aed', bg: '#f3e8ff' },
            { label: 'Expired/Grace', value: expiredClients, icon: '⚠️', color: expiredClients > 0 ? '#c62828' : '#1a7a4a', bg: expiredClients > 0 ? '#ffebee' : '#e8f5e9' },
            { label: 'Monthly Revenue', value: `Rs. ${monthlyRevenue.toLocaleString()}`, icon: '💰', color: '#b45309', bg: '#fff8e1' },
          ].map(s => (
            <div key={s.label} style={{ background: 'white', borderRadius: 12, padding: '16px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${s.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 11, color: '#888', margin: '0 0 6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: s.color, margin: 0 }}>{s.value}</p>
                </div>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{s.icon}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, background: 'white', padding: 5, borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', marginBottom: 20 }}>
          {[
            { key: 'clients', label: '🏢 Clients' },
            { key: 'subscriptions', label: '💳 Subscriptions' },
            { key: 'expiring', label: `⚠️ Expiring (${tenants.filter(t => { const s = getSubInfo(t); return s.daysLeft !== null && s.daysLeft <= 7 && s.daysLeft >= 0 }).length})` },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              style={{ flex: 1, padding: '9px 8px', border: 'none', borderRadius: 7, cursor: 'pointer', background: activeTab === t.key ? '#0f4c81' : 'transparent', color: activeTab === t.key ? 'white' : '#666', fontWeight: activeTab === t.key ? 700 : 500, fontSize: 13 }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── CLIENTS TAB ── */}
        {activeTab === 'clients' && (
          <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1a1a2e' }}>🏢 Client Accounts</h2>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888' }}>{activeClients} active · {totalClients} total</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="🔍 Search clients..." style={{ ...inp, width: '200px' }} />
                <button onClick={() => setShowAddForm(!showAddForm)} style={{ padding: '10px 20px', background: showAddForm ? '#6b7280' : '#0f4c81', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {showAddForm ? '✕ Cancel' : '+ New Client'}
                </button>
              </div>
            </div>

            {showAddForm && (
              <div style={{ padding: '20px 24px', background: '#f8fafc', borderBottom: '1px solid #e0e0e0' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 14, color: '#0f4c81', fontWeight: 700 }}>➕ New Client Account</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
                  {[
                    { key: 'tenant_code', label: 'Business ID *', placeholder: 'e.g. ABC001' },
                    { key: 'business_name', label: 'Business Name *', placeholder: 'e.g. Pure Water Kamoke' },
                    { key: 'email', label: 'Email *', placeholder: 'admin@example.com' },
                    { key: 'admin_password', label: 'Password *', placeholder: 'Min 4 characters' },
                    { key: 'monthly_fee', label: 'Monthly Fee (Rs.)', placeholder: '2500' },
                    { key: 'notes', label: 'Notes', placeholder: 'Any notes...' },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 4, fontWeight: 600 }}>{f.label}</label>
                      <input value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} style={inp} />
                    </div>
                  ))}
                </div>
                <button onClick={addTenant} disabled={saving} style={{ padding: '11px 28px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700 }}>
                  {saving ? '⏳ Creating...' : '✓ Create Client (14-day trial)'}
                </button>
              </div>
            )}

            {loading ? (
              <div style={{ padding: 60, textAlign: 'center', color: '#888' }}>Loading clients...</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      {['Business', 'Subscription', 'Features', 'Status', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, color: '#666', fontWeight: 700, borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTenants.map((t, idx) => {
                      const isOwner = t.tenant_code === 'SW001'
                      const isExpanded = expandedId === t.id
                      const subInfo = getSubInfo(t)
                      const subStyle = SUB_STATUS[subInfo.status] || SUB_STATUS.trial
                      const isSubEdit = subEditId === t.id
                      return (
                        <tr key={t.id} style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                          {/* Business */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 36, height: 36, borderRadius: 8, background: isOwner ? '#fff8e1' : '#e3f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                                {isOwner ? '⭐' : '🏢'}
                              </div>
                              <div>
                                <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 1px', color: '#1a1a2e' }}>{t.business_name}</p>
                                <p style={{ fontSize: 11, color: '#0f4c81', margin: '0 0 1px', fontWeight: 600 }}>{t.tenant_code}</p>
                                {t.email && <p style={{ fontSize: 10, color: '#aaa', margin: 0 }}>{t.email}</p>}
                              </div>
                            </div>
                          </td>

                          {/* Subscription */}
                          <td style={{ padding: '14px 16px' }}>
                            {isOwner ? <span style={{ color: '#aaa', fontSize: 12 }}>Owner</span> : (
                              <div>
                                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: subStyle.bg, color: subStyle.color, display: 'inline-block', marginBottom: 4 }}>
                                  {subStyle.label}
                                </span>
                                <p style={{ fontSize: 11, color: '#888', margin: 0 }}>
                                  {subInfo.daysLeft !== null ? (
                                    subInfo.daysLeft > 0
                                      ? `${subInfo.daysLeft} days remaining`
                                      : `Expired ${Math.abs(subInfo.daysLeft)} days ago`
                                  ) : '—'}
                                </p>
                                {t.subscription_expiry && <p style={{ fontSize: 10, color: '#aaa', margin: '2px 0 0' }}>Until: {new Date(t.subscription_expiry).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</p>}
                                {t.subscription_plan && <p style={{ fontSize: 10, color: '#aaa', margin: '1px 0 0' }}>{t.subscription_plan === 'monthly' ? 'Rs. 2,500/month' : t.subscription_plan === 'yearly' ? 'Rs. 25,000/year' : ''}</p>}
                              </div>
                            )}
                          </td>

                          {/* Features */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <FeatureToggle active={t.has_map_feature || false} onToggle={() => toggleFeature(t, 'has_map_feature')} icon="🗺️" label="Map" />
                              <FeatureToggle active={t.has_tracking_feature || false} onToggle={() => toggleFeature(t, 'has_tracking_feature')} icon="📡" label="Tracking" />
                              <FeatureToggle active={t.has_churn_intelligence || false} onToggle={() => toggleFeature(t, 'has_churn_intelligence')} icon="🔍" label="Churn AI" />
                              <FeatureToggle active={t.has_premium_reports || false} onToggle={() => toggleFeature(t, 'has_premium_reports')} icon="📋" label="Reports" />
                            </div>
                          </td>

                          {/* Status */}
                          <td style={{ padding: '14px 16px' }}>
                            {isOwner ? (
                              <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#fff8e1', color: '#b45309' }}>Your Business</span>
                            ) : (
                              <span onClick={() => toggleActive(t)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: t.is_active ? '#e8f5e9' : '#ffebee', color: t.is_active ? '#1a7a4a' : '#c62828' }}>
                                {t.is_active ? '✅ Active' : '❌ Inactive'}
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '14px 16px' }}>
                            {!isOwner && (
                              <div>
                                <button onClick={() => setExpandedId(isExpanded ? null : t.id)} style={{ padding: '5px 12px', background: '#f0f4f8', color: '#555', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
                                  {isExpanded ? '▲ Less' : '▼ Actions'}
                                </button>
                                {isExpanded && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                      <button onClick={() => { setSubEditId(t.id); setSubForm({ status: t.subscription_status || 'trial', plan: t.subscription_plan || 'monthly', expiry: t.subscription_expiry || '' }) }} style={{ padding: '5px 10px', background: '#e3f0ff', color: '#0f4c81', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>💳 Subscription</button>
                                      <button onClick={() => activateSubscription(t, 'monthly')} style={{ padding: '5px 10px', background: '#e8f5e9', color: '#1a7a4a', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>+30d</button>
                                      <button onClick={() => activateSubscription(t, 'yearly')} style={{ padding: '5px 10px', background: '#e8f5e9', color: '#1a7a4a', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>+365d</button>
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                                            <button onClick={() => resetPassword(t)} style={{ padding: '5px 10px', background: '#e3f0ff', color: '#0f4c81', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>🔑 Password</button>
                      <button onClick={() => { setEmailEditId(emailEditId === t.id ? null : t.id); setNewEmail(t.email || '') }} style={{ padding: '5px 10px', background: '#f3e8ff', color: '#7c3aed', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✏️ Email</button>
                                      <button onClick={() => toggleActive(t)} style={{ padding: '5px 10px', background: t.is_active ? '#fff8e1' : '#e8f5e9', color: t.is_active ? '#f57f17' : '#1a7a4a', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>{t.is_active ? '⏸ Pause' : '▶ Activate'}</button>
                                      <button onClick={() => copyWhatsApp(t)} style={{ padding: '5px 10px', background: '#e8f5e9', color: '#1a7a4a', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>💬 WA</button>
                                      <button onClick={() => deleteTenant(t)} style={{ padding: '5px 10px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>🗑️</button>
                                    </div>
                                                                        {/* Email Edit Form */}
                                    {emailEditId === t.id && (
                                      <div style={{ background: '#f3e8ff', borderRadius: 8, padding: '12px', border: '1px solid #c4b5fd', marginTop: 4 }}>
                                        <p style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', margin: '0 0 8px' }}>✏️ Update Email</p>
                                        <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>Current: {t.email || 'No email set'}</p>
                                        <input
                                          type="email"
                                          value={newEmail}
                                          onChange={e => setNewEmail(e.target.value)}
                                          placeholder="new@email.com"
                                          style={{ ...inp, fontSize: 12, padding: '6px 8px', marginBottom: 8 }}
                                        />
                                        <div style={{ display: 'flex', gap: 6 }}>
                                          <button onClick={() => updateEmail(t)} disabled={emailSaving} style={{ flex: 1, padding: '7px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                                            {emailSaving ? '⏳ Saving...' : '✓ Update Email'}
                                          </button>
                                          <button onClick={() => { setEmailEditId(null); setNewEmail('') }} style={{ padding: '7px 12px', background: '#f0f4f8', color: '#555', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Cancel</button>
                                        </div>
                                      </div>
                                    )}

                                    {/* Subscription Edit Form */}
                                    {isSubEdit && (
                                      <div style={{ background: '#f0f7ff', borderRadius: 8, padding: '12px', border: '1px solid #c8d8ff', marginTop: 4 }}>
                                        <p style={{ fontSize: 12, fontWeight: 700, color: '#0f4c81', margin: '0 0 8px' }}>💳 Edit Subscription</p>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                          <div>
                                            <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Status</label>
                                            <select value={subForm.status} onChange={e => setSubForm({ ...subForm, status: e.target.value })} style={{ ...inp, fontSize: 12, padding: '6px 8px' }}>
                                              <option value="trial">Trial</option>
                                              <option value="active">Active</option>
                                              <option value="grace">Grace Period</option>
                                              <option value="expired">Expired</option>
                                              <option value="paused">Paused</option>
                                            </select>
                                          </div>
                                          <div>
                                            <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Plan</label>
                                            <select value={subForm.plan} onChange={e => setSubForm({ ...subForm, plan: e.target.value })} style={{ ...inp, fontSize: 12, padding: '6px 8px' }}>
                                              <option value="monthly">Monthly (Rs. 2,500)</option>
                                              <option value="yearly">Yearly (Rs. 25,000)</option>
                                            </select>
                                          </div>
                                        </div>
                                        <div style={{ marginBottom: 8 }}>
                                          <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 3 }}>Expiry Date</label>
                                          <input type="date" value={subForm.expiry} onChange={e => setSubForm({ ...subForm, expiry: e.target.value })} style={{ ...inp, fontSize: 12, padding: '6px 8px' }} />
                                        </div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                          <button onClick={() => updateSubscription(t)} style={{ flex: 1, padding: '7px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>✓ Save</button>
                                          <button onClick={() => setSubEditId(null)} style={{ padding: '7px 12px', background: '#f0f4f8', color: '#555', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Cancel</button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── SUBSCRIPTIONS TAB ── */}
        {activeTab === 'subscriptions' && (
          <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', padding: '20px 24px', marginBottom: 20 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: '#1a1a2e' }}>💳 Subscription Overview</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              {['trial', 'active', 'grace', 'expired', 'paused'].map(status => {
                const group = tenants.filter(t => (t.subscription_status || 'trial') === status && t.tenant_code !== 'SW001')
                if (group.length === 0) return null
                const style = SUB_STATUS[status]
                return (
                  <div key={status} style={{ border: `2px solid ${style.color}`, borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ background: style.bg, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: style.color }}>{style.label}</span>
                      <span style={{ fontSize: 20, fontWeight: 800, color: style.color }}>{group.length}</span>
                    </div>
                    {group.map(t => {
                      const subInfo = getSubInfo(t)
                      return (
                        <div key={t.id} style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 2px' }}>{t.business_name}</p>
                            <p style={{ fontSize: 11, color: '#888', margin: 0 }}>{t.tenant_code} · {subInfo.daysLeft !== null ? `${subInfo.daysLeft}d remaining` : ''}</p>
                          </div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => activateSubscription(t, 'monthly')} style={{ padding: '4px 8px', background: '#e8f5e9', color: '#1a7a4a', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>+30d</button>
                            <button onClick={() => activateSubscription(t, 'yearly')} style={{ padding: '4px 8px', background: '#e3f0ff', color: '#0f4c81', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 10, fontWeight: 700 }}>+1yr</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── EXPIRING TAB ── */}
        {activeTab === 'expiring' && (
          <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', padding: '20px 24px', marginBottom: 20 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: '#1a1a2e' }}>⚠️ Expiring Soon</h2>
            <p style={{ fontSize: 13, color: '#888', margin: '0 0 16px' }}>Clients expiring within 7 days — contact and renew</p>
            {tenants.filter(t => { const s = getSubInfo(t); return s.daysLeft !== null && s.daysLeft <= 7 && t.tenant_code !== 'SW001' }).length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <p style={{ fontSize: 32, margin: '0 0 8px' }}>✅</p>
                <p style={{ color: '#1a7a4a', fontWeight: 700 }}>No clients expiring in next 7 days</p>
              </div>
            ) : (
              tenants.filter(t => { const s = getSubInfo(t); return s.daysLeft !== null && s.daysLeft <= 7 && t.tenant_code !== 'SW001' })
                .sort((a, b) => getSubInfo(a).daysLeft - getSubInfo(b).daysLeft)
                .map(t => {
                  const subInfo = getSubInfo(t)
                  const urgent = subInfo.daysLeft <= 2
                  return (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', marginBottom: 10, background: urgent ? '#fff5f5' : '#fffbf0', borderRadius: 10, border: `1px solid ${urgent ? '#ffcdd2' : '#ffe082'}` }}>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 2px', color: '#1a1a2e' }}>{t.business_name}</p>
                        <p style={{ fontSize: 12, color: '#888', margin: '0 0 2px' }}>{t.tenant_code} · {t.email || 'No email'}</p>
                        <span style={{ fontSize: 12, fontWeight: 700, color: urgent ? '#c62828' : '#b45309' }}>
                          {subInfo.daysLeft <= 0 ? `Expired ${Math.abs(subInfo.daysLeft)} days ago` : `Expires in ${subInfo.daysLeft} day${subInfo.daysLeft > 1 ? 's' : ''}`}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => activateSubscription(t, 'monthly')} style={{ padding: '8px 14px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Renew 30d</button>
                        <button onClick={() => activateSubscription(t, 'yearly')} style={{ padding: '8px 14px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Renew 1yr</button>
                        <button onClick={() => copyWhatsApp(t)} style={{ padding: '8px 14px', background: '#25d366', color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>💬</button>
                      </div>
                    </div>
                  )
                })
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ background: 'linear-gradient(135deg, #1a1a2e, #0f3460)', borderRadius: 12, padding: '20px 24px', color: 'white' }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>📋 WhatsApp Template for New Clients</p>
          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '14px 16px', fontSize: 12, lineHeight: 2, fontFamily: 'monospace', border: '1px solid rgba(255,255,255,0.1)' }}>
            Assalam o Alaikum! 🎉<br />
            Your AquaRun account is ready.<br /><br />
            🌐 Website: aquarun.vercel.app<br />
            🏢 Business ID: [TENANT_CODE]<br />
            📧 Email: [EMAIL]<br />
            🔑 Password: [PASSWORD]<br /><br />
            You have 14 days free trial — no payment needed.<br />
            After trial: Rs. 2,500/month or Rs. 25,000/year<br />
            Support: +92 323 7919338
          </div>
        </div>

      </div>
    </div>
  )
}
