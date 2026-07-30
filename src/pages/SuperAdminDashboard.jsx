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

function FeatureToggle({ active, onToggle, icon, label }) {
  return (
    <button onClick={onToggle} style={{
      display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
      borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
      background: active ? '#e8f5e9' : '#f0f4f8',
      color: active ? '#1a7a4a' : '#888',
      transition: 'all 0.15s',
    }}>
      <span>{icon}</span>
      <span>{label}</span>
      <span style={{
        width: 28, height: 14, borderRadius: 7, position: 'relative',
        background: active ? '#1a7a4a' : '#ccc', transition: 'all 0.15s', flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', top: 2, left: active ? 16 : 2,
          width: 10, height: 10, borderRadius: '50%', background: 'white',
          transition: 'all 0.15s',
        }} />
      </span>
    </button>
  )
}

export default function SuperAdminDashboard({ onLogout }) {
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [form, setForm] = useState({
    tenant_code: '', business_name: '', admin_password: '', email: '',
    plan: 'basic', setup_fee: '', monthly_fee: '', notes: ''
  })

  useEffect(() => { fetchTenants() }, [])

  async function fetchTenants() {
    setLoading(true)
    const { data } = await supabase.from('tenants').select('*').order('created_at', { ascending: false })
    setTenants(data || [])
    setLoading(false)
  }

  // ── Stats ────────────────────────────────────────────────────
  const totalClients   = tenants.length
  const activeClients  = tenants.filter(t => t.is_active).length
  const monthlyRevenue = tenants.filter(t => t.is_active && t.tenant_code !== 'SW001').reduce((s, t) => s + Number(t.monthly_fee || 0), 0)
  const overdueCount   = tenants.filter(t => t.next_due_date && new Date(t.next_due_date) < new Date() && t.is_active && t.tenant_code !== 'SW001').length

  // ── Actions ──────────────────────────────────────────────────
  async function addTenant() {
    if (!form.tenant_code || !form.business_name || !form.admin_password) return alert('Business ID, Name and Password are required')
    if (!form.email) return alert('Email is required for client login')
    setSaving(true)
    try {
      const authRes = await superAdminAction({
        action: 'createAuthUser',
        email: form.email.trim().toLowerCase(),
        password: form.admin_password,
        tenantCode: form.tenant_code.toUpperCase()
      })
      if (!authRes.ok && !authRes.auth_user_id) { alert('Error creating auth account: ' + (authRes.error || 'Unknown error')); setSaving(false); return }

      const { data: hashData } = await supabase.rpc('hash_password', { password_input: form.admin_password })
      const hashedPassword = hashData || form.admin_password

      const createRes = await superAdminAction({
        action: 'createTenant',
        tenantData: {
          tenant_code: form.tenant_code.toUpperCase(),
          business_name: form.business_name,
          admin_password: hashedPassword,
          email: form.email.trim().toLowerCase(),
          auth_user_id: authRes.auth_user_id,
          plan: form.plan,
          setup_fee: Number(form.setup_fee) || 0,
          monthly_fee: Number(form.monthly_fee) || 0,
          notes: form.notes,
          setup_fee_paid: false,
          is_active: true,
          setup_date: new Date().toISOString().split('T')[0],
          next_due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        }
      })
      if (!createRes?.ok) { alert('Error: ' + (createRes?.error || 'Unknown error')); setSaving(false); return }

      setForm({ tenant_code: '', business_name: '', admin_password: '', email: '', plan: 'basic', setup_fee: '', monthly_fee: '', notes: '' })
      setShowAddForm(false)
      fetchTenants()
      alert(`✅ Client created!\n\nBusiness ID: ${form.tenant_code.toUpperCase()}\nEmail: ${form.email}\nPassword: ${form.admin_password}\n\nShare these credentials with the client.`)
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  async function toggleActive(t) {
    if (t.tenant_code === 'SW001') return alert('Cannot deactivate your own business')
    try {
      await superAdminAction({ action: 'toggleActive', tenantId: t.id, isActive: !t.is_active })
      fetchTenants()
    } catch (e) { alert('Error: ' + e.message) }
  }

  async function toggleFeature(t, field) {
    try {
      await supabase.from('tenants').update({ [field]: !t[field] }).eq('id', t.id)
      fetchTenants()
    } catch (e) { alert('Error: ' + e.message) }
  }

  async function recordPayment(t) {
    const amount = prompt(`Record payment for ${t.business_name}\nMonthly fee: Rs. ${t.monthly_fee}\nEnter amount received:`)
    if (!amount || isNaN(amount)) return
    const nextDue = new Date(); nextDue.setMonth(nextDue.getMonth() + 1)
    try {
      await superAdminAction({ action: 'recordPayment', tenantId: t.id, amount: Number(amount), lastPaymentDate: new Date().toISOString().split('T')[0], nextDueDate: nextDue.toISOString().split('T')[0] })
      fetchTenants(); alert('✅ Payment recorded!')
    } catch (e) { alert('Error: ' + e.message) }
  }

  async function resetPassword(t) {
    const newPass = prompt(`Reset password for ${t.business_name}\nEnter new password:`)
    if (!newPass || newPass.trim().length < 4) return alert('Password must be at least 4 characters')
    try {
      await superAdminAction({ action: 'resetPassword', tenantId: t.id, newPassword: newPass.trim() })
      alert(`✅ Password reset!\n\nBusiness ID: ${t.tenant_code}\nNew Password: ${newPass.trim()}`)
      fetchTenants()
    } catch (e) { alert('Error: ' + e.message) }
  }

  async function setTransactionPassword(t) {
    const txnPass = prompt(`Set transaction password for ${t.business_name}:`)
    if (!txnPass || txnPass.trim().length < 4) return alert('Password must be at least 4 characters')
    try {
      await superAdminAction({ action: 'setTransactionPassword', tenantId: t.id, txnPassword: txnPass.trim() })
      alert('✅ Transaction password set!')
    } catch (e) { alert('Error: ' + e.message) }
  }

  async function changeBusinessId(t) {
    const newId = prompt(`Change Business ID for ${t.business_name}\nCurrent: ${t.tenant_code}\nNew Business ID:`)
    if (!newId || newId.trim().length < 3) return alert('Business ID must be at least 3 characters')
    try {
      await superAdminAction({ action: 'changeBusinessId', tenantId: t.id, newCode: newId.trim().toUpperCase() })
      alert(`✅ Business ID changed to: ${newId.trim().toUpperCase()}`)
      fetchTenants()
    } catch (e) { alert('Error: ' + e.message) }
  }

  async function deleteTenant(t) {
    if (t.tenant_code === 'SW001') return alert('Cannot delete your own business')
    if (!window.confirm(`DELETE ${t.business_name}?\n\nThis will permanently delete ALL data. This cannot be undone.`)) return
    if (!window.confirm(`Final confirmation — delete ${t.business_name} permanently?`)) return
    try {
      await superAdminAction({ action: 'deleteTenant', tenantId: t.id, tenantCode: t.tenant_code })
      alert(`✅ ${t.business_name} deleted.`)
      fetchTenants()
    } catch (e) { alert('Error: ' + e.message) }
  }

  function copyWhatsApp(t) {
    const msg = `Assalam o Alaikum! 🎉\nYour AquaRun account is ready.\n\n🌐 Website: aquarun.pk\n🏢 Business ID: ${t.tenant_code}\n🔑 Password: [your password]\n\nPlease change your password after first login.\nSupport: +92 323 7919338`
    navigator.clipboard.writeText(msg).then(() => alert('✅ Message copied! Paste in WhatsApp.')).catch(() => prompt('Copy this:', msg))
  }

  const inp = {
    width: '100%', padding: '10px 12px', border: '1.5px solid #e0e0e0',
    borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box',
    background: 'white', color: '#333',
  }

  const isOverdue = (t) => t.next_due_date && new Date(t.next_due_date) < new Date() && t.is_active && t.tenant_code !== 'SW001'

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Top Bar */}
      <div style={{
        background: 'linear-gradient(135deg, #0f4c81 0%, #1a6bad 100%)',
        padding: '0 24px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>💧</div>
          <div>
            <p style={{ color: '#fff', fontWeight: 800, fontSize: 15, margin: 0, letterSpacing: '-0.3px' }}>AquaRun SuperAdmin</p>
            <p style={{ color: '#93c5fd', fontSize: 11, margin: 0 }}>Client Management Portal</p>
          </div>
        </div>
        <button onClick={onLogout} style={{ padding: '7px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Logout
        </button>
      </div>

      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '24px 16px' }}>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Total Clients', value: totalClients, icon: '🏢', color: '#0f4c81', bg: '#e3f0ff' },
            { label: 'Active Clients', value: activeClients, icon: '✅', color: '#1a7a4a', bg: '#e8f5e9' },
            { label: 'Monthly Revenue', value: `Rs. ${monthlyRevenue.toLocaleString()}`, icon: '💰', color: '#7c3aed', bg: '#f3e8ff' },
            { label: 'Overdue', value: overdueCount, icon: '⚠️', color: overdueCount > 0 ? '#c62828' : '#1a7a4a', bg: overdueCount > 0 ? '#ffebee' : '#e8f5e9' },
          ].map(s => (
            <div key={s.label} style={{ background: 'white', borderRadius: 12, padding: '16px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: `1px solid ${s.bg}`, borderLeft: `4px solid ${s.color}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 11, color: '#888', margin: '0 0 6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</p>
                  <p style={{ fontSize: 24, fontWeight: 800, color: s.color, margin: 0, lineHeight: 1 }}>{s.value}</p>
                </div>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{s.icon}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Client Accounts */}
        <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden', marginBottom: 20 }}>
          {/* Header */}
          <div style={{ padding: '18px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1a1a2e' }}>🏢 Client Accounts</h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888' }}>{activeClients} active · {totalClients} total</p>
            </div>
            <button onClick={() => setShowAddForm(!showAddForm)} style={{
              padding: '10px 20px', background: showAddForm ? '#6b7280' : '#0f4c81', color: 'white',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {showAddForm ? '✕ Cancel' : '+ Add New Client'}
            </button>
          </div>

          {/* Add Form */}
          {showAddForm && (
            <div style={{ padding: '20px 24px', background: '#f8fafc', borderBottom: '1px solid #e0e0e0' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 14, color: '#0f4c81', fontWeight: 700 }}>➕ New Client Account</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
                {[
                  { key: 'tenant_code', label: 'Business ID *', placeholder: 'e.g. ABC001' },
                  { key: 'business_name', label: 'Business Name *', placeholder: 'e.g. Pure Water Kamoke' },
                  { key: 'email', label: 'Email *', placeholder: 'admin@example.com' },
                  { key: 'admin_password', label: 'Password *', placeholder: 'Min 4 characters' },
                  { key: 'setup_fee', label: 'Setup Fee (Rs.)', placeholder: '0' },
                  { key: 'monthly_fee', label: 'Monthly Fee (Rs.)', placeholder: '2500' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 4, fontWeight: 600 }}>{f.label}</label>
                    <input value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                      placeholder={f.placeholder} style={inp} />
                  </div>
                ))}
                <div>
                  <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 4, fontWeight: 600 }}>Plan</label>
                  <select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}
                    style={{ ...inp }}>
                    <option value="basic">Basic</option>
                    <option value="standard">Standard</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 4, fontWeight: 600 }}>Notes</label>
                  <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                    placeholder="Any notes..." style={inp} />
                </div>
              </div>
              <button onClick={addTenant} disabled={saving} style={{
                padding: '11px 28px', background: '#1a7a4a', color: 'white', border: 'none',
                borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700,
              }}>{saving ? '⏳ Creating...' : '✓ Create Client Account'}</button>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#888' }}>Loading clients...</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    {['Business', 'Plan', 'Fees', 'Next Due', 'Features', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, color: '#666', fontWeight: 700, borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t, idx) => {
                    const plan = PLAN_COLORS[t.plan] || PLAN_COLORS.basic
                    const overdue = isOverdue(t)
                    const isExpanded = expandedId === t.id
                    const isOwner = t.tenant_code === 'SW001'
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
                              {t.notes && <p style={{ fontSize: 10, color: '#888', margin: '2px 0 0', fontStyle: 'italic' }}>{t.notes}</p>}
                            </div>
                          </div>
                        </td>

                        {/* Plan */}
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: plan.bg, color: plan.color }}>
                            {plan.label}
                          </span>
                        </td>

                        {/* Fees */}
                        <td style={{ padding: '14px 16px', fontSize: 12 }}>
                          {isOwner ? <span style={{ color: '#aaa' }}>—</span> : (
                            <div>
                              <p style={{ margin: '0 0 2px', color: '#555' }}>Setup: <strong>Rs. {Number(t.setup_fee || 0).toLocaleString()}</strong></p>
                              <p style={{ margin: 0, color: '#555' }}>Monthly: <strong style={{ color: '#1a7a4a' }}>Rs. {Number(t.monthly_fee || 0).toLocaleString()}</strong></p>
                              {t.last_payment_date && <p style={{ margin: '2px 0 0', fontSize: 10, color: '#888' }}>Last paid: {new Date(t.last_payment_date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })}</p>}
                            </div>
                          )}
                        </td>

                        {/* Next Due */}
                        <td style={{ padding: '14px 16px' }}>
                          {isOwner ? <span style={{ color: '#aaa' }}>—</span> : (
                            <span style={{
                              fontSize: 12, fontWeight: 600,
                              color: overdue ? '#c62828' : '#1a7a4a',
                              background: overdue ? '#ffebee' : '#e8f5e9',
                              padding: '4px 8px', borderRadius: 6,
                            }}>
                              {overdue ? '⚠️ ' : ''}
                              {t.next_due_date ? new Date(t.next_due_date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                            </span>
                          )}
                        </td>

                        {/* Features */}
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <FeatureToggle
                              active={t.has_map_feature}
                              onToggle={() => toggleFeature(t, 'has_map_feature')}
                              icon="🗺️" label="Map & Route"
                            />
                            <FeatureToggle
                              active={t.has_map_feature}
                              onToggle={() => toggleFeature(t, 'has_map_feature')}
                              icon="📡" label="Live Tracking"
                            />
                          </div>
                        </td>

                        {/* Status */}
                        <td style={{ padding: '14px 16px' }}>
                          {isOwner ? (
                            <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#fff8e1', color: '#b45309' }}>Your Business</span>
                          ) : (
                            <span onClick={() => toggleActive(t)} style={{
                              padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                              background: t.is_active ? '#e8f5e9' : '#ffebee',
                              color: t.is_active ? '#1a7a4a' : '#c62828',
                            }}>
                              {t.is_active ? '✅ Active' : '❌ Inactive'}
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '14px 16px' }}>
                          {!isOwner && (
                            <div>
                              <button onClick={() => setExpandedId(isExpanded ? null : t.id)} style={{
                                padding: '5px 12px', background: '#f0f4f8', color: '#555', border: 'none',
                                borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, marginBottom: 6,
                              }}>
                                {isExpanded ? '▲ Less' : '▼ Actions'}
                              </button>
                              {isExpanded && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    <button onClick={() => recordPayment(t)} style={{ padding: '5px 10px', background: '#e8f5e9', color: '#1a7a4a', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>💰 Payment</button>
                                    <button onClick={() => resetPassword(t)} style={{ padding: '5px 10px', background: '#e3f0ff', color: '#0f4c81', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>🔑 Password</button>
                                    <button onClick={() => setTransactionPassword(t)} style={{ padding: '5px 10px', background: '#fce4ec', color: '#c62828', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>🔐 Txn Pass</button>
                                  </div>
                                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    <button onClick={() => changeBusinessId(t)} style={{ padding: '5px 10px', background: '#fff3e0', color: '#e65100', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>🏢 Change ID</button>
                                    <button onClick={() => toggleActive(t)} style={{ padding: '5px 10px', background: t.is_active ? '#fff8e1' : '#e8f5e9', color: t.is_active ? '#f57f17' : '#1a7a4a', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                                      {t.is_active ? '⏸ Deactivate' : '▶ Activate'}
                                    </button>
                                    <button onClick={() => copyWhatsApp(t)} style={{ padding: '5px 10px', background: '#e8f5e9', color: '#1a7a4a', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>💬 WA Share</button>
                                    <button onClick={() => deleteTenant(t)} style={{ padding: '5px 10px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>🗑️ Delete</button>
                                  </div>
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

        {/* Login Credentials Helper */}
        <div style={{ background: 'linear-gradient(135deg, #1a1a2e, #0f3460)', borderRadius: 12, padding: '20px 24px', color: 'white' }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px' }}>📋 How to Share Login with New Client</p>
          <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 12px' }}>Copy this WhatsApp message template:</p>
          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '14px 16px', fontSize: 12, lineHeight: 2, fontFamily: 'monospace', border: '1px solid rgba(255,255,255,0.1)' }}>
            Assalam o Alaikum! 🎉<br />
            Your AquaRun account is ready.<br /><br />
            🌐 Website: aquarun.pk<br />
            🏢 Business ID: [TENANT_CODE]<br />
            📧 Email: [EMAIL]<br />
            🔑 Password: [PASSWORD]<br /><br />
            Please change your password after first login.<br />
            Support: +92 323 7919338
          </div>
        </div>

      </div>
    </div>
  )
}
