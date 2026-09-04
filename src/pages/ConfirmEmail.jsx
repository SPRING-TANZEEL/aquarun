import { useEffect } from 'react'
import { supabase } from '../supabase'

export default function ConfirmEmail() {
  useEffect(() => {
    async function activate() {
      // Wait for Supabase to process the token from URL hash
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const { data: { session } } = await supabase.auth.getSession()
      console.log('ConfirmEmail session:', session?.user?.id, session?.user?.email)
      
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
        console.log('No session — retrying...')
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