import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [validSession, setValidSession] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    // Supabase puts the token in the URL hash — listen for auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setValidSession(true)
        setChecking(false)
      }
    })

    // Also check if there's already a session from the reset link
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setValidSession(true)
      }
      setChecking(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleReset() {
    if (!password || password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirmPassword) { setError('Passwords do not match'); return }
    setLoading(true); setError('')

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError('Error: ' + error.message)
      setLoading(false)
      return
    }

    setMessage('✅ Password updated successfully! Redirecting to login...')
    await supabase.auth.signOut()
    setTimeout(() => { window.location.href = '/' }, 2000)
    setLoading(false)
  }

  const inp = { width: '100%', padding: '12px 14px', border: '2px solid #e8eaed', borderRadius: '10px', fontSize: '15px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' }

  if (checking) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f4c81, #1a7a4a)' }}>
      <div style={{ textAlign: 'center', color: 'white' }}>
        <p style={{ fontSize: '32px', marginBottom: '12px' }}>💧</p>
        <p style={{ fontWeight: '600' }}>Verifying reset link...</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f4c81, #1a7a4a)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <p style={{ fontSize: '48px', marginBottom: '8px' }}>💧</p>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'white', margin: '0 0 6px' }}>AquaRun</h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', margin: 0 }}>Reset Your Password</p>
        </div>

        <div style={{ background: 'white', borderRadius: '20px', padding: '28px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 6px' }}>🔑 Set New Password</h2>
          <p style={{ fontSize: '13px', color: '#888', margin: '0 0 24px' }}>Enter your new password below.</p>

          {message && (
            <div style={{ background: '#e8f5e9', border: '1px solid #4caf50', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
              <p style={{ color: '#1a7a4a', fontSize: '13px', fontWeight: '600', margin: 0 }}>{message}</p>
            </div>
          )}

          {error && (
            <div style={{ background: '#ffebee', border: '1px solid #ffcdd2', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
              <p style={{ color: '#c62828', fontSize: '13px', fontWeight: '600', margin: 0 }}>{error}</p>
            </div>
          )}

          {!validSession && !message && (
            <div style={{ background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
              <p style={{ color: '#e65100', fontSize: '13px', fontWeight: '600', margin: 0 }}>⚠️ Invalid or expired reset link. Please request a new password reset.</p>
            </div>
          )}

          {validSession && !message && (
            <>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '6px' }}>New Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min 6 characters" style={inp} />

              <label style={{ fontSize: '13px', fontWeight: '600', color: '#555', display: 'block', marginBottom: '6px' }}>Confirm New Password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password" style={inp} />

              <button onClick={handleReset} disabled={loading}
                style={{ width: '100%', padding: '14px', background: loading ? '#ccc' : 'linear-gradient(135deg, #0f4c81, #1565c0)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Updating...' : '🔑 Update Password'}
              </button>
            </>
          )}

          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <a href="/" style={{ color: '#0f4c81', fontSize: '13px', fontWeight: '600', textDecoration: 'none' }}>← Back to Login</a>
          </div>
        </div>
      </div>
    </div>
  )
}
