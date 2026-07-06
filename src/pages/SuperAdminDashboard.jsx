import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function SuperAdminDashboard({ onLogout }) {
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('clients')
  const [showAddForm, setShowAddForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    tenant_code: '', business_name: '', admin_password: '',
    plan: 'basic', setup_fee: '', monthly_fee: '', notes: ''
  })

  useEffect(() => { fetchTenants() }, [])

  async function fetchTenants() {
    setLoading(true)
    const { data } = await supabase.from('tenants').select('*').order('created_at', { ascending: false })
    setTenants(data || [])
    setLoading(false)
  }

  async function addTenant() {
    if (!form.tenant_code || !form.business_name || !form.admin_password) {
      return alert('Business ID, Name and Password are required')
    }
    setSaving(true)

    const { data: newTenant, error } = await supabase.from('tenants').insert([{
      tenant_code: form.tenant_code.toUpperCase(),
      business_name: form.business_name,
      admin_password: form.admin_password,
      plan: form.plan,
      setup_fee: Number(form.setup_fee) || 0,
      monthly_fee: Number(form.monthly_fee) || 0,
      notes: form.notes,
      setup_fee_paid: false,
      is_active: true,
      setup_date: new Date().toISOString().split('T')[0],
      next_due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    }]).select().single()

    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    // ✅ Use tenant UUID not tenant_code
    const tenantUUID = newTenant.id
    await createDefaultCOA(tenantUUID)
    await createDefaultSettings(tenantUUID, form.business_name)

    setForm({ tenant_code: '', business_name: '', admin_password: '', plan: 'basic', setup_fee: '', monthly_fee: '', notes: '' })
    setShowAddForm(false)
    fetchTenants()
    setSaving(false)
    alert('✅ Client created! Business ID: ' + form.tenant_code.toUpperCase())
  }

  async function createDefaultCOA(tenantId) {
    const accounts = [
      // Assets — Current
      { tenant_id: tenantId, account_code: '1001', account_name: 'Cash in Hand', account_type: 'asset', account_subtype: 'current', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '1002', account_name: 'JazzCash Account', account_type: 'asset', account_subtype: 'current', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '1003', account_name: 'Bank Account', account_type: 'asset', account_subtype: 'current', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '1100', account_name: 'Accounts Receivable', account_type: 'asset', account_subtype: 'current', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '1200', account_name: 'Inventory - Raw Materials', account_type: 'asset', account_subtype: 'current', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '1201', account_name: 'Inventory - Finished Goods', account_type: 'asset', account_subtype: 'current', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '1300', account_name: 'Prepaid Expenses', account_type: 'asset', account_subtype: 'current', is_system: false, is_active: true, opening_balance: 0 },
      // Assets — Fixed
      { tenant_id: tenantId, account_code: '1500', account_name: 'Vehicle - Delivery', account_type: 'asset', account_subtype: 'fixed', is_system: false, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '1501', account_name: 'Machinery & Equipment', account_type: 'asset', account_subtype: 'fixed', is_system: false, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '1502', account_name: 'Accumulated Depreciation', account_type: 'asset', account_subtype: 'fixed', is_system: false, is_active: true, opening_balance: 0 },
      // Liabilities
      { tenant_id: tenantId, account_code: '2001', account_name: 'Accounts Payable', account_type: 'liability', account_subtype: 'current', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '2100', account_name: 'Salary Payable', account_type: 'liability', account_subtype: 'current', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '2200', account_name: 'Advance from Customers', account_type: 'liability', account_subtype: 'current', is_system: false, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '2300', account_name: 'Tax Payable', account_type: 'liability', account_subtype: 'current', is_system: false, is_active: true, opening_balance: 0 },
      // Equity
      { tenant_id: tenantId, account_code: '3001', account_name: 'Owner Capital', account_type: 'equity', account_subtype: 'capital', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '3002', account_name: 'Owner Drawings', account_type: 'equity', account_subtype: 'drawings', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '3003', account_name: 'Retained Earnings', account_type: 'equity', account_subtype: 'capital', is_system: false, is_active: true, opening_balance: 0 },
      // Revenue
      { tenant_id: tenantId, account_code: '4001', account_name: 'Water Sales - 19L', account_type: 'revenue', account_subtype: 'sales', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '4002', account_name: 'Water Sales - Half Litre', account_type: 'revenue', account_subtype: 'sales', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '4003', account_name: 'Water Sales - 1.5L', account_type: 'revenue', account_subtype: 'sales', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '4004', account_name: 'Other Sales', account_type: 'revenue', account_subtype: 'sales', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '4100', account_name: 'Delivery Charges', account_type: 'revenue', account_subtype: 'other', is_system: false, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '4200', account_name: 'Other Income', account_type: 'revenue', account_subtype: 'other', is_system: false, is_active: true, opening_balance: 0 },
      // Cost of Goods Sold
      { tenant_id: tenantId, account_code: '5001', account_name: 'Raw Material Cost', account_type: 'expense', account_subtype: 'cogs', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '5002', account_name: 'Production Overhead', account_type: 'expense', account_subtype: 'cogs', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '5003', account_name: 'Cost of Goods Sold', account_type: 'expense', account_subtype: 'cogs', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '5004', account_name: 'Raw Material Consumed', account_type: 'expense', account_subtype: 'cogs', is_system: true, is_active: true, opening_balance: 0 },
      // Expenses
      { tenant_id: tenantId, account_code: '6001', account_name: 'Rider Salaries', account_type: 'expense', account_subtype: 'salary', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '6002', account_name: 'Salary Advances', account_type: 'expense', account_subtype: 'salary', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '6003', account_name: 'Rider Field Expenses', account_type: 'expense', account_subtype: 'field', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '6004', account_name: 'Rent', account_type: 'expense', account_subtype: 'admin', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '6005', account_name: 'Electricity', account_type: 'expense', account_subtype: 'admin', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '6006', account_name: 'Fuel - Office', account_type: 'expense', account_subtype: 'admin', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '6007', account_name: 'Maintenance', account_type: 'expense', account_subtype: 'admin', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '6008', account_name: 'Supplies', account_type: 'expense', account_subtype: 'admin', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '6009', account_name: 'Other Expenses', account_type: 'expense', account_subtype: 'admin', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '6010', account_name: 'Water Testing Fees', account_type: 'expense', account_subtype: 'admin', is_system: true, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '6011', account_name: 'Vehicle Running Cost', account_type: 'expense', account_subtype: 'admin', is_system: false, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '6012', account_name: 'Depreciation', account_type: 'expense', account_subtype: 'admin', is_system: false, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '6013', account_name: 'Telephone & Internet', account_type: 'expense', account_subtype: 'admin', is_system: false, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '6014', account_name: 'Bank Charges', account_type: 'expense', account_subtype: 'admin', is_system: false, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '6015', account_name: 'Printing & Stationery', account_type: 'expense', account_subtype: 'admin', is_system: false, is_active: true, opening_balance: 0 },
      { tenant_id: tenantId, account_code: '6016', account_name: 'Advertising & Marketing', account_type: 'expense', account_subtype: 'admin', is_system: false, is_active: true, opening_balance: 0 },
    ]
    await supabase.from('chart_of_accounts').insert(accounts)
  }

  async function createDefaultSettings(tenantId, businessName) {
    const settings = [
      { setting_key: 'business_name', setting_value: businessName, tenant_id: tenantId },
      { setting_key: 'setup_completed', setting_value: 'false', tenant_id: tenantId },
      { setting_key: 'opening_cash_balance', setting_value: '0', tenant_id: tenantId },
      { setting_key: 'opening_jazzcash_balance', setting_value: '0', tenant_id: tenantId },
      { setting_key: 'opening_bank_balance', setting_value: '0', tenant_id: tenantId },
    ]
    await supabase.from('business_settings').insert(settings)
  }

  async function toggleActive(tenant) {
    if (tenant.tenant_code === 'SW001') return alert('Cannot deactivate your own business')
    await supabase.from('tenants').update({ is_active: !tenant.is_active }).eq('id', tenant.id)
    fetchTenants()
  }

  async function recordPayment(tenant) {
    const amount = prompt(`Record payment for ${tenant.business_name}\nMonthly fee: Rs. ${tenant.monthly_fee}\nEnter amount received:`)
    if (!amount || isNaN(amount)) return
    const nextDue = new Date()
    nextDue.setMonth(nextDue.getMonth() + 1)
    await supabase.from('tenants').update({
      last_payment_date: new Date().toISOString().split('T')[0],
      last_payment_amount: Number(amount),
      next_due_date: nextDue.toISOString().split('T')[0],
    }).eq('id', tenant.id)
    fetchTenants()
    alert('✅ Payment recorded!')
  }

  const totalMonthly = tenants.filter(t => t.is_active && t.tenant_code !== 'SW001').reduce((s, t) => s + Number(t.monthly_fee || 0), 0)
  const totalClients = tenants.filter(t => t.tenant_code !== 'SW001').length
  const activeClients = tenants.filter(t => t.is_active && t.tenant_code !== 'SW001').length
  const overdueClients = tenants.filter(t => {
    if (!t.next_due_date || t.tenant_code === 'SW001') return false
    return new Date(t.next_due_date) < new Date()
  }).length

  const inp = { width: '100%', padding: '10px 14px', border: '1.5px solid #e8eaed', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '12px', color: '#333', background: 'white' }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: "'Segoe UI', sans-serif" }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1a1a2e, #0f4c81)', color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontSize: '28px' }}>💧</div>
          <div>
            <p style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>AquaRun SuperAdmin</p>
            <p style={{ fontSize: '12px', opacity: 0.6, margin: 0 }}>Client Management Portal</p>
          </div>
        </div>
        <button onClick={onLogout}
          style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
          Logout
        </button>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 20px' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          {[
            { label: 'Total Clients', value: totalClients, icon: '🏢', color: '#0f4c81' },
            { label: 'Active Clients', value: activeClients, icon: '✅', color: '#1a7a4a' },
            { label: 'Monthly Revenue', value: `Rs. ${totalMonthly.toLocaleString()}`, icon: '💰', color: '#9c27b0' },
            { label: 'Overdue', value: overdueClients, icon: '⚠️', color: '#f44336' },
          ].map(s => (
            <div key={s.label} style={{ background: 'white', borderRadius: '12px', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', borderTop: `4px solid ${s.color}` }}>
              <p style={{ fontSize: '11px', color: '#888', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
              <p style={{ fontSize: '28px', margin: '0 0 2px' }}>{s.icon}</p>
              <p style={{ fontSize: '22px', fontWeight: '700', color: s.color, margin: 0 }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Main Card */}
        <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: 0 }}>🏢 Client Accounts</h2>
            <button onClick={() => setShowAddForm(!showAddForm)}
              style={{ padding: '10px 20px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
              {showAddForm ? '✕ Cancel' : '+ Add New Client'}
            </button>
          </div>

          {/* Add Form */}
          {showAddForm && (
            <div style={{ background: '#f8f9fa', borderRadius: '12px', padding: '20px', marginBottom: '20px', border: '1px solid #e8eaed' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#333', margin: '0 0 16px' }}>New Client Setup</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Business ID * <span style={{ color: '#888', fontWeight: '400' }}>(e.g. ABC001)</span></label>
                  <input value={form.tenant_code} onChange={e => setForm({ ...form, tenant_code: e.target.value.toUpperCase() })}
                    placeholder="ABC001" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Business Name *</label>
                  <input value={form.business_name} onChange={e => setForm({ ...form, business_name: e.target.value })}
                    placeholder="ABC Water Company" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Admin Password *</label>
                  <input value={form.admin_password} onChange={e => setForm({ ...form, admin_password: e.target.value })}
                    placeholder="Strong password" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Plan</label>
                  <select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })} style={inp}>
                    <option value="basic">Basic</option>
                    <option value="standard">Standard</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Setup Fee (Rs.)</label>
                  <input type="number" value={form.setup_fee} onChange={e => setForm({ ...form, setup_fee: e.target.value })}
                    placeholder="15000" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Monthly Fee (Rs.)</label>
                  <input type="number" value={form.monthly_fee} onChange={e => setForm({ ...form, monthly_fee: e.target.value })}
                    placeholder="2000" style={inp} />
                </div>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '4px' }}>Notes</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="Client contact, location, any notes..." style={inp} />
              </div>
              <div style={{ background: '#e3f0ff', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px' }}>
                <p style={{ fontSize: '12px', color: '#0f4c81', fontWeight: '600', margin: 0 }}>
                  ✅ Full Chart of Accounts (42 accounts) will be created automatically
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setShowAddForm(false)}
                  style={{ flex: 1, padding: '12px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}>
                  Cancel
                </button>
                <button onClick={addTenant} disabled={saving}
                  style={{ flex: 2, padding: '12px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>
                  {saving ? 'Creating...' : '✓ Create Client Account'}
                </button>
              </div>
            </div>
          )}

          {/* Clients Table */}
          {loading ? <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    {['Business ID', 'Business Name', 'Plan', 'Setup Fee', 'Monthly Fee', 'Next Due', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: '11px', color: '#666', fontWeight: '700', borderBottom: '2px solid #eee', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tenants.map(t => {
                    const isOverdue = t.next_due_date && new Date(t.next_due_date) < new Date() && t.tenant_code !== 'SW001'
                    return (
                      <tr key={t.id} style={{ borderBottom: '1px solid #f0f0f0', background: isOverdue ? '#fff5f5' : 'white' }}>
                        <td style={{ padding: '14px', fontSize: '13px', fontWeight: '700', color: '#0f4c81' }}>{t.tenant_code}</td>
                        <td style={{ padding: '14px' }}>
                          <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>{t.business_name}</p>
                          {t.notes && <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{t.notes}</p>}
                        </td>
                        <td style={{ padding: '14px' }}>
                          <span style={{ fontSize: '11px', background: '#e3f0ff', color: '#0f4c81', padding: '3px 10px', borderRadius: '20px', fontWeight: '600', textTransform: 'capitalize' }}>
                            {t.plan}
                          </span>
                        </td>
                        <td style={{ padding: '14px', fontSize: '13px', color: '#333' }}>
                          Rs. {Number(t.setup_fee || 0).toLocaleString()}
                          {t.setup_fee_paid && <span style={{ fontSize: '10px', color: '#1a7a4a', marginLeft: '4px' }}>✅</span>}
                        </td>
                        <td style={{ padding: '14px', fontSize: '13px', fontWeight: '600', color: '#1a7a4a' }}>
                          {t.tenant_code === 'SW001' ? '—' : 'Rs. ' + Number(t.monthly_fee || 0).toLocaleString()}
                        </td>
                        <td style={{ padding: '14px', fontSize: '12px', color: isOverdue ? '#f44336' : '#555', fontWeight: isOverdue ? '700' : '400' }}>
                          {t.tenant_code === 'SW001' ? '—' : t.next_due_date ? new Date(t.next_due_date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                          {isOverdue && <span style={{ display: 'block', fontSize: '10px', color: '#f44336' }}>OVERDUE</span>}
                        </td>
                        <td style={{ padding: '14px' }}>
                          <span onClick={() => t.tenant_code !== 'SW001' && toggleActive(t)}
                            style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', cursor: t.tenant_code === 'SW001' ? 'default' : 'pointer', background: t.is_active ? '#e8f5e9' : '#ffebee', color: t.is_active ? '#1a7a4a' : '#c62828' }}>
                            {t.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ padding: '14px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {t.tenant_code !== 'SW001' && (
                              <button onClick={() => recordPayment(t)}
                                style={{ padding: '6px 12px', background: '#e8f5e9', color: '#1a7a4a', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>
                                💰 Payment
                              </button>
                            )}
                            {t.tenant_code === 'SW001' && (
                              <span style={{ fontSize: '11px', color: '#aaa' }}>Your Business</span>
                            )}
                          </div>
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
        <div style={{ background: '#1a1a2e', borderRadius: '12px', padding: '20px', color: 'white' }}>
          <p style={{ fontSize: '14px', fontWeight: '700', margin: '0 0 12px' }}>📋 How to Share Login with New Client</p>
          <p style={{ fontSize: '12px', opacity: 0.7, margin: '0 0 12px' }}>Send this WhatsApp message to your new client:</p>
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '14px', fontSize: '12px', lineHeight: 1.8, fontFamily: 'monospace' }}>
            Assalam o Alaikum! 🎉<br />
            Your AquaRun account is ready.<br /><br />
            🌐 Website: aquarun.vercel.app<br />
            🏢 Business ID: [TENANT_CODE]<br />
            👤 Username: admin<br />
            🔑 Password: [PASSWORD]<br /><br />
            Please change your password after first login.<br />
            Support: +92 323 7919338
          </div>
        </div>
      </div>
    </div>
  )
}