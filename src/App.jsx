import { useState, useEffect } from 'react'
import { useJsApiLoader } from '@react-google-maps/api'

const MAPS_LIBRARIES = ['geometry', 'directions']
import { supabase, setTenantSession, clearTenantSession, isSuperAdmin, getTenantUUID } from './supabase'

// Pages
import AdminDashboard from './pages/AdminDashboard'
import RiderDashboard from './pages/RiderDashboard'
import CustomerDashboard from './pages/CustomerDashboard'
import SuperAdminDashboard from './pages/SuperAdminDashboard'
import ResetPassword from './pages/ResetPassword'
import Signup from './pages/Signup'
import ConfirmEmail from './pages/ConfirmEmail'
import aquarunLogo from './assets/aquarun-logo.png'
import Landing from './pages/Landing'

const SUPER_ADMIN_PASSWORD = import.meta.env.VITE_SUPER_ADMIN_PASSWORD || 'mian6566381aA!'

export default function App() {
  const [userRole, setUserRole] = useState(null)
  const [currentTenant, setCurrentTenant] = useState(null)
  const [currentRider, setCurrentRider] = useState(null)
  const [currentCustomer, setCurrentCustomer] = useState(null)
  const [loginMode, setLoginMode] = useState('admin')
  const [loading, setLoading] = useState(false)
  const [subscriptionWarning, setSubscriptionWarning] = useState(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [error, setError] = useState('')
  const [checkingSession, setCheckingSession] = useState(true)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [showLanding, setShowLanding] = useState(() => {
    return sessionStorage.getItem('aquarun_show_login') !== 'true'
  })

  // Load Google Maps once at app level to prevent remount conflicts
  useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY || '',
    libraries: MAPS_LIBRARIES,
    version: 'weekly',
  })

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      setInstallPrompt(e)
      setShowInstallBanner(true)
    })
  }, [])

  async function handleInstall() {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setShowInstallBanner(false)
  }

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
    sessionStorage.removeItem('aquarun_show_login')
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
        const riderName = localStorage.getItem('aquarun_rider_name')
        if (riderId && tenantId) {
          // If offline, use cached data immediately
          if (!navigator.onLine) {
            if (riderName) {
              setCurrentRider({ id: riderId, full_name: riderName, tenant_id: tenantId })
              setCurrentTenant({ id: tenantId, business_name: businessName })
              setUserRole('rider')
              setCheckingSession(false)
              return
            }
          } else {
            try {
              const { data: rider } = await supabase.from('riders').select('*').eq('id', riderId).single()
              if (rider) {
                localStorage.setItem('aquarun_rider_name', rider.full_name)
                setCurrentRider(rider)
                setCurrentTenant({ id: tenantId, business_name: businessName })
                setUserRole('rider')
                setCheckingSession(false)
                return
              }
            } catch (err) {
              if (riderName) {
                setCurrentRider({ id: riderId, full_name: riderName, tenant_id: tenantId })
                setCurrentTenant({ id: tenantId, business_name: businessName })
                setUserRole('rider')
                setCheckingSession(false)
                return
              }
            }
          }
        }
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
        if (session && session.user.email_confirmed_at) {
          const { data: tenant } = await supabase.from('tenants').select('*').eq('auth_user_id', session.user.id).single()
          if (tenant && tenant.is_active) {
            const subCheck = checkSubscription(tenant)
            if (subCheck.warning) setSubscriptionWarning(subCheck.warning)
            setCurrentTenant({ ...tenant, isReadOnly: subCheck.isReadOnly || false })
            setUserRole('admin')
            setCheckingSession(false)
            return
          }
        }
        // Fallback — old session
        const { data: tenant } = await supabase.from('tenants').select('*').eq('id', tenantId).single()
        if (tenant && tenant.is_active) {
          const subCheck = checkSubscription(tenant)
          if (subCheck.warning) setSubscriptionWarning(subCheck.warning)
          setCurrentTenant({ ...tenant, isReadOnly: subCheck.isReadOnly || false })
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

  function checkSubscription(tenant) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const status = tenant.subscription_status || 'trial'

    if (status === 'trial') {
      const trialEnd = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : null
      if (!trialEnd) return { blocked: false, warning: null }
      const daysLeft = Math.ceil((trialEnd - today) / (1000 * 60 * 60 * 24))
      if (daysLeft <= 0) return { blocked: true, message: '⏰ Your free trial has ended. Please contact us to activate your subscription.', type: 'expired' }
      if (daysLeft <= 5) return { blocked: false, warning: `⏰ Your free trial will end in ${daysLeft} day${daysLeft > 1 ? 's' : ''}. Please subscribe to continue.` }
      return { blocked: false, warning: null }
    }

    if (status === 'active') {
      const expiry = tenant.subscription_expiry ? new Date(tenant.subscription_expiry) : null
      if (!expiry) return { blocked: false, warning: null }
      const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
      if (daysLeft <= 0) {
        // Check grace period (4 days)
        const graceDays = Math.ceil((today - expiry) / (1000 * 60 * 60 * 24))
        if (graceDays > 4) return { blocked: true, message: '❌ Your subscription has expired. Please renew to continue.', type: 'expired' }
        const graceLeft = 4 - graceDays + 1
        return { blocked: false, isReadOnly: true, warning: `⚠️ Your subscription has expired. You have ${graceLeft} day${graceLeft > 1 ? 's' : ''} grace period remaining. Please renew immediately. Contact: +92 323 7919338` }
      }
      if (daysLeft <= 5) return { blocked: false, warning: `⏰ Your subscription will end in ${daysLeft} day${daysLeft > 1 ? 's' : ''}. Please renew to avoid interruption.` }
      return { blocked: false, warning: null }
    }

    if (status === 'expired') return { blocked: true, message: '❌ Your subscription has expired. Please contact us to renew.', type: 'expired' }
    if (status === 'paused') return { blocked: true, message: '⏸️ Your account has been paused. Please contact support.', type: 'paused' }
    return { blocked: false, warning: null }
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
          if (authError.message?.includes('Email not confirmed')) {
            setError('❌ Please confirm your email first. Check your inbox for the verification link.')
          } else {
            setError('❌ Invalid email or password')
          }
          setLoading(false)
          return
        }

        // Check email confirmation
        if (!authData.user.email_confirmed_at) {
          setError('❌ Please confirm your email first. Check your inbox for the verification link.')
          await supabase.auth.signOut()
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

        const subCheck1 = checkSubscription(tenant)
        if (subCheck1.blocked) { setError(subCheck1.message); await supabase.auth.signOut(); setLoading(false); return }
        if (subCheck1.warning) setSubscriptionWarning(subCheck1.warning)
        setTenantSession(tenant.id, tenant.business_name, 'admin', null, tenant.id)
        setCurrentTenant({ ...tenant, isReadOnly: subCheck1.isReadOnly || false })
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

      const subCheck2 = checkSubscription(tenant)
      if (subCheck2.blocked) { setError(subCheck2.message); setLoading(false); return }
      if (subCheck2.warning) setSubscriptionWarning(subCheck2.warning)
      setTenantSession(tenant.id, tenant.business_name, 'admin', null, tenant.id)
      setCurrentTenant({ ...tenant, isReadOnly: subCheck2.isReadOnly || false })
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
      redirectTo: 'https://aquarun.pk/reset-password'
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

  // Handle password reset page
  if (window.location.pathname === '/reset-password') {
    return <ResetPassword />
  }

  // Handle signup page
  if (window.location.pathname === '/signup') {
    return <Signup />
  }

  // Show landing page if not logged in and no session being checked
  if (!checkingSession && !userRole && showLanding) {
    return <Landing onLogin={() => {
      sessionStorage.setItem('aquarun_show_login', 'true')
      setShowLanding(false)
    }} />
  }

  // Handle email confirmation — must be before session check
  if (window.location.pathname === '/confirm-email') {
    return <ConfirmEmail />
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
  if (userRole === 'admin' && currentTenant) return (
    <>
      {subscriptionWarning && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999, background: '#ff6f00', color: 'white', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', flexWrap: 'wrap', gap: '8px' }}>
          <p style={{ margin: 0, fontSize: '13px', fontWeight: '600', flex: 1 }}>⚠️ {subscriptionWarning}</p>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={() => setShowPaymentModal(true)} style={{ padding: '6px 14px', background: 'white', color: '#ff6f00', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}>💳 Pay Now</button>
            <button onClick={() => setSubscriptionWarning(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '18px' }}>✕</button>
          </div>
        </div>
      )}
      <AdminDashboard tenantId={currentTenant.id} hasMapFeature={currentTenant.has_map_feature || false} hasTrackingFeature={currentTenant.has_tracking_feature || false} isReadOnly={currentTenant.isReadOnly || false} user={{ full_name: currentTenant.business_name, role: 'admin' }} onLogout={handleLogout} />
    {showPaymentModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '28px 24px', maxWidth: '380px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 14px', background: '#f8f9fa', borderRadius: '8px', marginBottom: '8px', gap: '4px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#1a1a2e' }}>💳 Subscribe to AquaRun</h2>
              <button onClick={() => setShowPaymentModal(false)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#888' }}>✕</button>
            </div>
            <div style={{ background: '#f8f9fa', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subscription Plans</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ background: 'white', borderRadius: '8px', padding: '12px', border: '2px solid #0f4c81', textAlign: 'center' }}>
                  <p style={{ fontSize: '12px', color: '#888', margin: '0 0 4px' }}>Monthly</p>
                  <p style={{ fontSize: '20px', fontWeight: '800', color: '#0f4c81', margin: 0 }}>Rs. 2,500</p>
                </div>
                <div style={{ background: 'white', borderRadius: '8px', padding: '12px', border: '2px solid #1a7a4a', textAlign: 'center' }}>
                  <p style={{ fontSize: '12px', color: '#888', margin: '0 0 4px' }}>Yearly</p>
                  <p style={{ fontSize: '20px', fontWeight: '800', color: '#1a7a4a', margin: 0 }}>Rs. 25,000</p>
                  <p style={{ fontSize: '10px', color: '#1a7a4a', margin: '2px 0 0', fontWeight: '600' }}>Save Rs. 5,000</p>
                </div>
              </div>
            </div>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payment Methods</p>
            {[
              { icon: '🏦', label: 'Bank Transfer (HBL)', value: 'PK87HABB0004117901217499', name: 'Muhammad' },
            ].map(pm => (
              <div key={pm.label} style={{ padding: '10px 14px', background: '#f8f9fa', borderRadius: '8px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700', margin: 0 }}>{pm.icon} {pm.label}</p>
                  <p style={{ fontSize: '12px', fontWeight: '700', color: '#0f4c81', margin: 0, letterSpacing: '0.5px' }}>{pm.value}</p>
                </div>
                <p style={{ fontSize: '11px', color: '#888', margin: 0, textAlign: 'right' }}>A/C Title: {pm.name}</p>
              </div>
            ))}
            <div style={{ marginTop: '16px', padding: '12px', background: '#fff8e1', borderRadius: '8px', border: '1px solid #ffe082' }}>
              <p style={{ fontSize: '12px', color: '#b45309', margin: 0, fontWeight: '600' }}>⚠️ After payment, send screenshot to WhatsApp for quick activation</p>
            </div>
            <a href="https://wa.me/923237919338?text=I have paid for AquaRun subscription. Please activate my account." target="_blank" rel="noreferrer"
              style={{ display: 'block', textAlign: 'center', marginTop: '14px', padding: '12px', background: '#25d366', color: 'white', borderRadius: '10px', textDecoration: 'none', fontWeight: '700', fontSize: '14px' }}>
              💬 Send Payment Screenshot on WhatsApp
            </a>
          </div>
        </div>
      )}
    </>
  )
  if (userRole === 'rider' && currentRider) return <RiderDashboard user={{ ...currentRider, tenant_id: currentTenant?.id }} onLogout={handleLogout} />
  if (userRole === 'customer' && currentCustomer) return <CustomerDashboard customer={currentCustomer} tenantId={currentTenant?.id} onLogout={handleLogout} />

  // Login Screen
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f4c81 0%, #1a7a4a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      {showInstallBanner && (
        <div style={{ position: 'fixed', bottom: '20px', left: '16px', right: '16px', background: 'white', borderRadius: '16px', padding: '14px 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '12px', zIndex: 9999 }}>
          <img src={aquarunLogo} alt="AquaRun" style={{ width: '48px', height: '48px', borderRadius: '10px' }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: '0 0 2px' }}>Install AquaRun</p>
            <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Add to home screen for quick access</p>
          </div>
          <button onClick={handleInstall}
            style={{ padding: '8px 16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700' }}>
            Install
          </button>
          <button onClick={() => setShowInstallBanner(false)}
            style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#aaa', padding: '4px' }}>✕</button>
        </div>
      )}
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img
            src={aquarunLogo}
            alt="AquaRun"
            onClick={() => {
              const now = Date.now()
              if (!window._tapStart || now - window._tapStart > 3000) { window._tapStart = now; window._tapCount = 1 }
              else { window._tapCount = (window._tapCount || 0) + 1 }
              if (window._tapCount >= 5) { setLoginMode('superadmin'); window._tapCount = 0 }
            }}
            style={{ width: '120px', height: '120px', marginBottom: '8px', cursor: 'pointer', borderRadius: '22px' }}
          />
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
            {loginMode === 'superadmin' && (
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
