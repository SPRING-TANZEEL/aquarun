import { useEffect } from 'react'
import { supabase } from '../supabase'

export default function ConfirmEmail() {
  useEffect(() => {
    async function activate() {
      // Let Supabase process the hash token from URL
      const hashParams = new URLSearchParams(window.location.hash.slice(1))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      
      let session = null
      if (accessToken) {
        const { data } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        session = data.session
      } else {
        const { data } = await supabase.auth.getSession()
        session = data.session
      }
        console.log('activateTenant result:', data)
      
      if (session?.user) {
        const res = await fetch('/api/super-admin-actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'activateTenant', authUserId: session.user.id })
        })
        const data = await res.json()
        console.log('activateTenant result:', data)
        window.location.href = '/'
      } else {

        // Listen for auth state change
        supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === 'SIGNED_IN' && session?.user) {
            const res = await fetch('/api/super-admin-actions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'activateTenant', authUserId: session.user.id })
            })
            const data = await res.json()
            console.log('activateTenant result (auth change):', data)
            window.location.href = '/'
          }
        })
      }
    }
    activate()
  }, [])
  return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0f4c81',color:'white',fontSize:20}}>✅ Activating your account...</div>
}