import { useState, useEffect } from 'react'
import { supabase, getTenantId, setTenantSession, clearTenantSession, isSuperAdmin } from './supabase'
import AdminDashboard from './pages/AdminDashboard'
import RiderDashboard from './pages/RiderDashboard'
import CustomerDashboard from './pages/CustomerDashboard'
import SuperAdminDashboard from './pages/SuperAdminDashboard'

export default function App() {
  const [screen, setScreen] = useState('login')
  const [role, setRole] = useState(null)
  const [rider, setRider] = useState(null)
  const [loggedInCustomer, setLoggedInCustomer] = useState(null)
  const [tenantId, setTenantId] = useState(null)
  const [loginError, setLoginError] = useState('')
  const [logging, setLogging] = useState(false)

  // Form state
  const [tenantCode, setTenantCode] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    const savedTenant = localStorage.getItem('aquarun_tenant_id')
    const savedRole = localStorage.getItem('aquarun_role')
    const savedUser = localStorage.getItem('aquarun_user')

    if (savedRole === 'superadmin') {
      setScreen('superadmin')
      setRole('superadmin')
      return
    }

    if (savedTenant && savedRole) {
      setTenantId(savedTenant)
      setRole(savedRole)
      if (savedRole === 'rider' && savedUser) {
        setRider(JSON.parse(savedUser))
      }
      if (savedRole === 'customer' && savedUser) {
        setLoggedInCustomer(JSON.parse(savedUser))
      }
      setScreen('app')
    }
  }, [])

  async function handleLogin() {
    setLoginError('')
    setLogging(true)

    // Super admin login
    if (tenantCode.toUpperCase() === 'SUPERADMIN') {
      const authRes = await fetch('/api/super-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
      const authData = await authRes.json()
      if (authData.success) {
        localStorage.setItem('aquarun_role', 'superadmin')
        setRole('superadmin')
        setScreen('superadmin')
        setLogging(false)
        return
      } else {
        setLoginError('Invalid super admin password')
        setLogging(false)
        return
      }
    }

    // Validate tenant — get full tenant record including UUID id
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('*')
      .eq('tenant_code', tenantCode.toUpperCase())
      .eq('is_active', true)
      .single()

    if (tenantError || !tenant) {
      setLoginError('Business ID not found or inactive. Please contact support.')
      setLogging(false)
      return
    }

    // ✅ Always use tenant.id (UUID) — never tenant.tenant_code
    const tenantUUID = tenant.id

    // Admin login
    if (username.toLowerCase() === 'admin') {
      if (password === tenant.admin_password) {
        localStorage.setItem('aquarun_tenant_id', tenantUUID)
        localStorage.setItem('aquarun_role', 'admin')
        localStorage.setItem('aquarun_user', JSON.stringify({ full_name: 'Admin', name: 'Admin' }))
        setTenantId(tenantUUID)
        setRole('admin')
        setScreen('app')
        setLogging(false)
        return
      } else {
        setLoginError('Invalid password')
        setLogging(false)
        return
      }
    }

    // Rider login — use UUID to find rider
    const { data: riderData } = await supabase
      .from('riders')
      .select('*')
      .eq('tenant_id', tenantUUID)
      .eq('is_active', true)
      .ilike('full_name', username)
      .single()

    if (riderData) {
      if (password !== riderData.pin_code && password !== (riderData.password || 'rider123')) {
        setLoginError('Invalid password or PIN')
        setLogging(false)
        return
      }
      localStorage.setItem('aquarun_tenant_id', tenantUUID)
      localStorage.setItem('aquarun_role', 'rider')
      localStorage.setItem('aquarun_user', JSON.stringify(riderData))
      setTenantId(tenantUUID)
      setRider(riderData)
      setRole('rider')
      setScreen('app')
      setLogging(false)
      return
    }

    // Customer login
    const { data: customerData } = await supabase
      .from('customers')
      .select('*')
      .eq('tenant_id', tenantUUID)
      .eq('is_active', true)
      .eq('customer_code', username.toUpperCase())
      .single()

    if (customerData) {
      if (password !== customerData.customer_password && password !== customerData.password_plain) {
        setLoginError('Invalid password')
        setLogging(false)
        return
      }
      localStorage.setItem('aquarun_tenant_id', tenantUUID)
      localStorage.setItem('aquarun_role', 'customer')
      localStorage.setItem('aquarun_user', JSON.stringify(customerData))
      setTenantId(tenantUUID)
      setLoggedInCustomer(customerData)
      setRole('customer')
      setScreen('app')
      setLogging(false)
      return
    }

    setLoginError('User not found. Check your username or contact admin.')
    setLogging(false)
  }

  function handleLogout() {
    localStorage.removeItem('aquarun_tenant_id')
    localStorage.removeItem('aquarun_role')
    localStorage.removeItem('aquarun_user')
    setScreen('login')
    setRole(null)
    setRider(null)
    setLoggedInCustomer(null)
    setTenantId(null)
    setTenantCode('')
    setUsername('')
    setPassword('')
  }

  if (screen === 'superadmin') {
    return <SuperAdminDashboard onLogout={handleLogout} />
  }

  if (screen === 'app') {
    if (role === 'admin') return <AdminDashboard user={{ full_name: 'Admin', name: 'Admin' }} tenantId={tenantId} onLogout={handleLogout} />
    if (role === 'rider') return <RiderDashboard user={rider} rider={rider} tenantId={tenantId} onLogout={handleLogout} />
    if (role === 'customer') return <CustomerDashboard customer={loggedInCustomer} tenantId={tenantId} onLogout={handleLogout} />
  }

  // Login Screen
  const inp = {
    width: '100%', padding: '14px', border: '2px solid #e8eaed',
    borderRadius: '10px', fontSize: '15px', outline: 'none',
    boxSizing: 'border-box', marginBottom: '12px', fontFamily: 'inherit'
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f4c81 0%, #1a7a4a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ background: 'white', borderRadius: '20px', padding: '40px 32px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>💧</div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#0f4c81', margin: '0 0 4px' }}>AquaRun</h1>
          <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Water Delivery Management System</p>
        </div>

        {loginError && (
          <div style={{ background: '#ffebee', border: '1px solid #ffcdd2', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
            <p style={{ fontSize: '13px', color: '#c62828', margin: 0, fontWeight: '600' }}>⚠️ {loginError}</p>
          </div>
        )}

        <div>
          <label style={{ fontSize: '12px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '6px' }}>Business ID</label>
          <input value={tenantCode} onChange={e => setTenantCode(e.target.value.toUpperCase())}
            placeholder="e.g. SW001"
            style={inp}
            onFocus={e => e.target.style.borderColor = '#0f4c81'}
            onBlur={e => e.target.style.borderColor = '#e8eaed'} />

          <label style={{ fontSize: '12px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '6px' }}>Username</label>
          <input value={username} onChange={e => setUsername(e.target.value)}
            placeholder="admin / rider name / customer ID"
            style={inp}
            onFocus={e => e.target.style.borderColor = '#0f4c81'}
            onBlur={e => e.target.style.borderColor = '#e8eaed'} />

          <label style={{ fontSize: '12px', fontWeight: '700', color: '#555', display: 'block', marginBottom: '6px' }}>Password / PIN</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Enter password or PIN"
            style={{ ...inp, marginBottom: '20px' }}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            onFocus={e => e.target.style.borderColor = '#0f4c81'}
            onBlur={e => e.target.style.borderColor = '#e8eaed'} />

          <button onClick={handleLogin} disabled={logging}
            style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #0f4c81, #1a7a4a)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '16px', fontWeight: '700' }}>
            {logging ? 'Signing in...' : '→ Sign In'}
          </button>
        </div>

        <p style={{ fontSize: '11px', color: '#aaa', textAlign: 'center', margin: '20px 0 0' }}>
          Powered by AquaRun · Contact +92 323 7919338
        </p>
      </div>
    </div>
  )
}