import { useState, useEffect } from 'react'
import { supabase, setTenantSession, clearTenantSession, isSuperAdmin, getTenantUUID } from './supabase'

// Pages
import AdminDashboard from './pages/AdminDashboard'
import RiderDashboard from './pages/RiderDashboard'
import CustomerDashboard from './pages/CustomerDashboard'
import SuperAdminDashboard from './pages/SuperAdminDashboard'

const SUPER_ADMIN_PASSWORD = import.meta.env.VITE_SUPER_ADMIN_PASSWORD || 'mian6566381aA!'

export default function App() {
  const [userRole, setUserRole] = useState(null)
  const [currentTenant, setCurrentTenant] = useState(null)
  const [currentRider, setCurrentRider] = useState(null)
  const [currentCustomer, setCurrentCustomer] = useState(null)
  const [loginMode, setLoginMode] = useState('admin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checkingSession, setCheckingSession] = useState(true)

  // Admin login fields
  const [loginEmail, setLoginEmail] = useState('')
  const [tenantCode, setTenantCode] = useState('')
  const [password, setPassword] = useState('')

  // Rider login fields
  const [riderTenantId, setRiderTenantId] = useState('')
  const [riderCode, setRiderCode] = useState('')
  const [riderPin, setRiderPin] = useState('')

  // Customer login fields
  const [customerTenantId, setCustomerTenantId] = useState('')
  const [customerCode, setCustomerCode] = useState('')
  const [customerPassword, setCustomerPassword] = useState('')

  // Super admin
  const [superAdminPassword, setSuperAdminPassword] = useState('')

  useEffect(() => { checkExistingSession() }, [])

  async function checkExistingSession() {
    setCheckingSession(true)
    try {
      const role = localStorage.getItem('aquarun_role')
      const tenantId = localStorage.getItem('aquarun_tenant_id')
      const businessName = localStorage.getItem('aquarun_business_name')

      if (role === 'superadmin') {
        setUserRole('superadmin')
        setCheckingSession(false)
        return
      }

      if (role === 'rider') {
        const riderId = localStorage.getItem('aquarun_rider_id')
        if (riderId && tenantId) {
          try {
            const { data: rider } = await supabase.from('riders').select('*').eq('id', riderId).single()
            if (rider) {
              setCurrentRider(rider)
              setCurrentTenant({ id: tenantId, business_name: businessName })
              setUserRole('rider')
              setCheckingSession(false)
              return
            }
          } catch (err) {
            console.error('Rider session restore error:', err)
          }
        }
        // Rider session invalid — clear and show login
        clearTenantSession()
        setCheckingSession(false)
        return
      }

      if (role === 'customer') {
        const customerId = localStorage.getItem('aquarun_customer_id')
        if (customerId && tenantId) {
          const { data: customer } = await supabase.from('customers').select('*').eq('id', customerId).single()
          if (customer) {
            setCurrentCustomer(customer)
            setCurrentTenant({ id: tenantId, business_name: businessName })
            setUserRole('customer')
            setCheckingSession(false)
            return
          }
        }
      }

      if (role === 'admin' && tenantId) {
        // Check Supabase Auth session first
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          const { data: tenant } = await supabase.from('tenants').select('*').eq('auth_user_id', session.user.id).single()
          if (tenant && tenant.is_active) {
            setCurrentTenant(tenant)
            setUserRole('admin')
            setCheckingSession(false)
            return
          }
        }
        // Fallback — old session
        const { data: tenant } = await supabase.from('tenants').select('*').eq('id', tenantId).single()
        if (tenant && tenant.is_active) {
          setCurrentTenant(tenant)
          setUserRole('admin')
          setCheckingSession(false)
          return
        }
      }

      clearTenantSession()
    } catch (err) {
      console.error('Session check error:', err)
      clearTenantSession()
    }
    setCheckingSession(false)
  }

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (loginMode === 'rider') {
      try {
        const { data: tenantData } = await supabase.from('tenants').select('id, is_active').eq('tenant_code', riderTenantId.toUpperCase()).single()
        if (!tenantData) { setError('❌ Business ID not found'); setLoading(false); return }
        if (!tenantData.is_active) { setError('❌ Account deactivated'); setLoading(false); return }

        const { data: riders, error } = await supabase
          .from('riders').select('*')
          .eq('tenant_id', tenantData.id)
          .eq('is_active', true)

        const rider = riders?.find(r => 
          r.pin_code === riderPin.trim() && 
          (riderCode.trim() === '' || r.full_name.toLowerCase().includes(riderCode.trim().toLowerCase()))
        )

        if (error || !rider) { setError('❌ Rider not found'); setLoading(false); return }
        if (!rider.is_active) { setError('❌ Rider account deactivated'); setLoading(false); return }

        const pinMatch = true
        if (!pinMatch) { setError('❌ Incorrect PIN'); setLoading(false); return }

        localStorage.setItem('aquarun_tenant_id', tenantData.id)
        localStorage.setItem('aquarun_business_name', rider.tenant_name || '')
        localStorage.setItem('aquarun_role', 'rider')
        localStorage.setItem('aquarun_rider_id', rider.id)
        setCurrentRider(rider)
        setCurrentTenant({ id: tenantData.id })
        setUserRole('rider')
      } catch (err) {
        setError('Login failed. Please try again.')
      }
      setLoading(false)
      return
    }

    if (loginMode === 'customer') {
      try {
        const { data: tenantData } = await supabase.from('tenants').select('id, is_active').eq('tenant_code', customerTenantId.toUpperCase()).single()
        if (!tenantData) { setError('❌ Business ID not found'); setLoading(false); return }
        if (!tenantData.is_active) { setError('❌ Account deactivated'); setLoading(false); return }

        const { data: customer, error } = await supabase
          .from('customers').select('*')
          .eq('tenant_id', tenantData.id)
          .eq('customer_code', customerCode.toUpperCase())
          .single()

        if (error || !customer) { setError('❌ Customer not found'); setLoading(false); return }
        if (!customer.is_active) { setError('❌ Customer account deactivated'); setLoading(false); return }

        const pwMatch = customer.customer_password === customerPassword || customer.password_plain === customerPassword
        if (!pwMatch) { setError('❌ Incorrect password'); setLoading(false); return }

        localStorage.setItem('aquarun_tenant_id', tenantData.id)
        localStorage.setItem('aquarun_business_name', '')
        localStorage.setItem('aquarun_role', 'customer')
        localStorage.setItem('aquarun_customer_id', customer.id)
        setCurrentCustomer(customer)
        setCurrentTenant({ id: tenantData.id })
        setUserRole('customer')
      } catch (err) {
        setError('Login failed. Please try again.')
      }
      setLoading(false)
      return
    }

    if (loginMode === 'superadmin') {
      if (superAdminPassword === SUPER_ADMIN_PASSWORD) {
        localStorage.setItem('aquarun_role', 'superadmin')
        setUserRole('superadmin')
      } else {
        setError('❌ Invalid super admin password')
      }
      setLoading(false)
      return
    }

    // Admin/CEO login — Supabase Auth (new) with fallback to old system
    try {
      if (loginEmail.trim()) {
        // New system — email + password via Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: loginEmail.trim().toLowerCase(),
          password: password.trim()
        })

        if (authError) {
          setError('❌ Invalid email or password')
          setLoading(false)
          return
        }

        const { data: tenant, error: tenantError } = await supabase
          .from('tenants')
          .select('*')
          .eq('auth_user_id', authData.user.id)
          .single()

        if (tenantError || !tenant) {
          setError('❌ Account not found. Contact support.')
          await supabase.auth.signOut()
          setLoading(false)
          return
        }

        if (!tenant.is_active) {
          setError('❌ Account deactivated. Contact support.')
          await supabase.auth.signOut()
          setLoading(false)
          return
        }

        setTenantSession(tenant.id, tenant.business_name, 'admin', null, tenant.id)
        setCurrentTenant(tenant)
        setUserRole('admin')
        setLoading(false)
        return
      }

      // Fallback — old system: Business ID + password
      const cleanCode = tenantCode.trim().toUpperCase()
      const { data: tenant, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('tenant_code', cleanCode)
        .single()

      if (error || !tenant) { setError('❌ Business ID not found'); setLoading(false); return }
      if (!tenant.is_active) { setError('❌ Account deactivated. Contact support.'); setLoading(false); return }

      const { data: pwMatch } = await supabase.rpc('verify_password', {
        password_input: password.trim(),
        hashed_password: tenant.admin_password
      })
      if (!pwMatch) { setError('❌ Incorrect password'); setLoading(false); return }

      setTenantSession(tenant.id, tenant.business_name, 'admin', null, tenant.id)
      setCurrentTenant(tenant)
      setUserRole('admin')
    } catch (err) {
      setError('Login failed. Please try again.')
    }
    setLoading(false)
  }

  async function handleForgotPassword() {
    if (!loginEmail.trim()) {
      setError('Please enter your email address first')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(loginEmail.trim().toLowerCase(), {
      redirectTo: 'https://aquarun.vercel.app/reset-password'
    })
    setLoading(false)
    if (error) {
      setError('Error sending reset email: ' + error.message)
    } else {
      setError('')
      alert(`✅ Password reset email sent to ${loginEmail}\n\nCheck your inbox and follow the link to set a new password.`)
    }
  }

  function handleLogout() {
    clearTenantSession()
    setUserRole(null)
    setCurrentTenant(null)
    setCurrentRider(null)
    setCurrentCustomer(null)
    setLoginEmail('')
    setTenantCode('')
    setPassword('')
    setError('')
  }

  if (checkingSession) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '32px', marginBottom: '12px' }}>💧</p>
          <p style={{ color: '#0f4c81', fontWeight: '600', fontSize: '16px' }}>Loading AquaRun...</p>
        </div>
      </div>
    )
  }

  if (userRole === 'superadmin') return <SuperAdminDashboard onLogout={handleLogout} />
  if (userRole === 'admin' && currentTenant) return <AdminDashboard tenantId={currentTenant.id} user={{ full_name: currentTenant.business_name, role: 'admin' }} onLogout={handleLogout} />
  if (userRole === 'rider' && currentRider) return <RiderDashboard user={{ ...currentRider, tenant_id: currentTenant?.id }} onLogout={handleLogout} />
  if (userRole === 'customer' && currentCustomer) return <CustomerDashboard customer={currentCustomer} tenantId={currentTenant?.id} onLogout={handleLogout} />

  // Login Screen
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f4c81 0%, #1a7a4a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '56px', marginBottom: '8px' }}>💧</div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'white', margin: '0 0 6px' }}>AquaRun</h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', margin: 0 }}>Water Delivery Management System</p>
        </div>

        {/* Login Card */}
        <div style={{ background: 'white', borderRadius: '20px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

          {/* Mode Tabs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '24px', background: '#f5f5f5', borderRadius: '12px', padding: '4px' }}>
            {[
              { key: 'admin', label: '🏢 Admin' },
              { key: 'rider', label: '🚴 Rider' },
              { key: 'customer', label: '👤 Customer' },
            ].map(m => (
              <button key={m.key} onClick={() => { setLoginMode(m.key); setError('') }}
                style={{ padding: '8px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', background: loginMode === m.key ? 'white' : 'transparent', color: loginMode === m.key ? '#0f4c81' : '#888', boxShadow: loginMode === m.key ? '0 2px 8px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s' }}>
                {m.label}
              </button>
            ))}
          </div>

          {error && (
            <div style={{ background: '#ffebee', border: '1px solid #ffcdd2', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px' }}>
              <p style={{ color: '#c62828', fontSize: '13px', margin: 0, fontWeight: '600' }}>{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin}>

            {/* ADMIN LOGIN */}
            {loginMode === 'admin' && (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '6px' }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    placeholder="your@email.com"
                    style={{ width: '100%', padding: '12px 14px', border: '2px solid #e8eaed', borderRadius: '10px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '6px' }}>
                    Business ID <span style={{ fontSize: '11px', color: '#aaa', fontWeight: '400' }}>(optional — for old login)</span>
                  </label>
                  <input
                    type="text"
                    value={tenantCode}
                    onChange={e => setTenantCode(e.target.value)}
                    placeholder="e.g. SW001"
                    style={{ width: '100%', padding: '12px 14px', border: '2px solid #e8eaed', borderRadius: '10px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '6px' }}>Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter password"
                    style={{ width: '100%', padding: '12px 14px', border: '2px solid #e8eaed', borderRadius: '10px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ background: '#e3f0ff', borderRadius: '8px', padding: '10px 12px', marginBottom: '16px' }}>
                  <p style={{ fontSize: '11px', color: '#0f4c81', margin: 0 }}>💡 Use your email address to login. Business ID only needed for old accounts without email.</p>
                </div>
              </>
            )}

            {/* RIDER LOGIN */}
            {loginMode === 'rider' && (
              <>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '6px' }}>Business ID</label>
                  <input type="text" value={riderTenantId} onChange={e => setRiderTenantId(e.target.value)}
                    placeholder="e.g. SW001"
                    style={{ width: '100%', padding: '12px 14px', border: '2px solid #e8eaed', borderRadius: '10px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '6px' }}>Your Name</label>
                  <input type="text" value={riderCode} onChange={e => setRiderCode(e.target.value)}
                    placeholder="Enter your name"
                    style={{ width: '100%', padding: '12px 14px', border: '2px solid #e8eaed', borderRadius: '10px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '6px' }}>PIN</label>
                  <input type="password" value={riderPin} onChange={e => setRiderPin(e.target.value)}
                    placeholder="Enter PIN"
                    style={{ width: '100%', padding: '12px 14px', border: '2px solid #e8eaed', borderRadius: '10px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </>
            )}

            {/* CUSTOMER LOGIN */}
            {loginMode === 'customer' && (
              <>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '6px' }}>Business ID</label>
                  <input type="text" value={customerTenantId} onChange={e => setCustomerTenantId(e.target.value)}
                    placeholder="e.g. SW001"
                    style={{ width: '100%', padding: '12px 14px', border: '2px solid #e8eaed', borderRadius: '10px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '6px' }}>Customer Code</label>
                  <input type="text" value={customerCode} onChange={e => setCustomerCode(e.target.value)}
                    placeholder="e.g. AQ-12345"
                    style={{ width: '100%', padding: '12px 14px', border: '2px solid #e8eaed', borderRadius: '10px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '6px' }}>Password</label>
                  <input type="password" value={customerPassword} onChange={e => setCustomerPassword(e.target.value)}
                    placeholder="Enter password"
                    style={{ width: '100%', padding: '12px 14px', border: '2px solid #e8eaed', borderRadius: '10px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </>
            )}

            {/* SUPER ADMIN — hidden mode */}
            {loginMode === 'superadmin' && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '6px' }}>Super Admin Password</label>
                <input type="password" value={superAdminPassword} onChange={e => setSuperAdminPassword(e.target.value)}
                  placeholder="Enter super admin password"
                  style={{ width: '100%', padding: '12px 14px', border: '2px solid #e8eaed', borderRadius: '10px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: '14px', background: loading ? '#ccc' : 'linear-gradient(135deg, #0f4c81, #1565c0)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}>
              {loading ? 'Signing in...' : '🔐 Sign In'}
            </button>
          </form>

          {/* Forgot Password + Super Admin Link */}
          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            {loginMode === 'admin' && (
              <button onClick={handleForgotPassword}
                style={{ background: 'none', border: 'none', color: '#0f4c81', fontSize: '13px', cursor: 'pointer', display: 'block', width: '100%', marginBottom: '10px', fontWeight: '600' }}>
                🔑 Forgot Password?
              </button>
            )}
            {loginMode !== 'superadmin' ? (
              <button onClick={() => { setLoginMode('superadmin'); setError('') }}
                style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '11px', cursor: 'pointer' }}>
                System Admin Access
              </button>
            ) : (
              <button onClick={() => { setLoginMode('admin'); setError('') }}
                style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '11px', cursor: 'pointer' }}>
                ← Back to Login
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '12px', marginTop: '20px' }}>
          AquaRun v2.0 — Water Delivery Management
        </p>
      </div>
    </div>
  )
}
