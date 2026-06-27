import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import AdminDashboard from './pages/AdminDashboard'
import RiderDashboard from './pages/RiderDashboard'
import CustomerDashboard from './pages/CustomerDashboard'

export default function App() {
  const [pin, setPin] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('admin')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [checking, setChecking] = useState(true)

  // Check localStorage on app start
  useEffect(() => {
    const saved = localStorage.getItem('aquarun_user')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setCurrentUser(parsed)
        setLoggedIn(true)
      } catch (e) {
        localStorage.removeItem('aquarun_user')
      }
    }
    setChecking(false)
  }, [])

  async function handleLogin() {
    setError('')
    setLoading(true)

    if (role === 'rider') {
      const { data, error } = await supabase
        .from('riders')
        .select('*')
        .eq('pin_code', pin)
        .eq('is_active', true)
        .single()

      if (error || !data) {
        setError('Wrong PIN. Please try again.')
      } else {
        const userData = { ...data, role: 'rider' }
        localStorage.setItem('aquarun_user', JSON.stringify(userData))
        setCurrentUser(userData)
        setLoggedIn(true)
      }

    } else if (role === 'admin') {
      if (username === 'admin' && password === 'aquarun123') {
        const userData = { full_name: 'Admin', role: 'admin' }
        localStorage.setItem('aquarun_user', JSON.stringify(userData))
        setCurrentUser(userData)
        setLoggedIn(true)
      } else {
        setError('Username or password is incorrect.')
      }

    } else if (role === 'customer') {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('customer_code', username.trim().toUpperCase())
        .eq('is_active', true)
        .single()

      if (error || !data) {
        setError('Customer ID not found.')
      } else if (data.customer_password !== password && data.password_plain !== password) {
        setError('Incorrect password.')
      } else {
        const userData = { ...data, role: 'customer' }
        localStorage.setItem('aquarun_user', JSON.stringify(userData))
        setCurrentUser(userData)
        setLoggedIn(true)
      }
    }
    setLoading(false)
  }

  function handleLogout() {
    localStorage.removeItem('aquarun_user')
    setLoggedIn(false)
    setCurrentUser(null)
    setPin('')
    setUsername('')
    setPassword('')
  }

  // Show nothing while checking localStorage
  if (checking) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f4c81 0%, #1a7a4a 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>💧</div>
          <p style={{ fontSize: '16px', opacity: 0.8 }}>Loading AquaRun...</p>
        </div>
      </div>
    )
  }

  if (loggedIn && currentUser?.role === 'admin') {
    return <AdminDashboard user={currentUser} onLogout={handleLogout} />
  }

  if (loggedIn && currentUser?.role === 'rider') {
    return <RiderDashboard user={currentUser} onLogout={handleLogout} />
  }

  if (loggedIn && currentUser?.role === 'customer') {
    return <CustomerDashboard user={currentUser} onLogout={handleLogout} />
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f4c81 0%, #1a7a4a 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'sans-serif'
    }}>
      <div style={{
        background: 'white', borderRadius: '16px', padding: '40px',
        width: '100%', maxWidth: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '48px' }}>💧</div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f4c81', margin: '8px 0 4px' }}>AquaRun</h1>
          <p style={{ color: '#888', fontSize: '13px' }}>Spring Water Kamoke</p>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          {['admin', 'rider', 'customer'].map(r => (
            <button key={r} onClick={() => { setRole(r); setError(''); setPin('') }}
              style={{
                flex: 1, padding: '8px', border: 'none', borderRadius: '8px',
                background: role === r ? '#0f4c81' : '#f0f0f0',
                color: role === r ? 'white' : '#555',
                fontWeight: role === r ? '600' : '400',
                cursor: 'pointer', fontSize: '12px'
              }}>
              {r === 'admin' ? '👨‍💼 Admin' : r === 'rider' ? '🚴 Rider' : '👤 Customer'}
            </button>
          ))}
        </div>

        {role === 'rider' && (
          <div>
            <p style={{ textAlign: 'center', color: '#555', marginBottom: '12px', fontSize: '14px' }}>Enter your PIN</p>
            <input type="password" placeholder="PIN" value={pin}
              onChange={e => setPin(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              style={{
                width: '100%', padding: '14px', fontSize: '24px', textAlign: 'center',
                border: '2px solid #ddd', borderRadius: '10px', letterSpacing: '8px',
                outline: 'none', boxSizing: 'border-box'
              }} />
          </div>
        )}

        {role !== 'rider' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input type="text"
              placeholder={role === 'admin' ? 'Username' : 'Customer ID (e.g. AQ-12345)'}
              value={username} onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              style={{
                width: '100%', padding: '12px 14px', fontSize: '15px',
                border: '2px solid #ddd', borderRadius: '10px',
                outline: 'none', boxSizing: 'border-box'
              }} />
            <input type="password" placeholder="Password"
              value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              style={{
                width: '100%', padding: '12px 14px', fontSize: '15px',
                border: '2px solid #ddd', borderRadius: '10px',
                outline: 'none', boxSizing: 'border-box'
              }} />
          </div>
        )}

        {error && <p style={{ color: '#e53935', fontSize: '13px', marginTop: '10px', textAlign: 'center' }}>{error}</p>}

        <button onClick={handleLogin} disabled={loading}
          style={{
            width: '100%', padding: '14px', marginTop: '20px',
            background: '#0f4c81', color: 'white', border: 'none',
            borderRadius: '10px', fontSize: '16px', fontWeight: '600', cursor: 'pointer'
          }}>
          {loading ? 'Please wait...' : 'Login / لاگ ان'}
        </button>
      </div>
    </div>
  )
}