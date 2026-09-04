import { useEffect } from 'react'
import { supabase } from '../supabase'

export default function ConfirmEmail() {
  useEffect(() => {
    async function activate() {
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
      } else {
        console.log('No session found on confirm-email page')
      }
      window.location.href = '/'
    }
    activate()
  }, [])
  return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0f4c81',color:'white',fontSize:20}}>✅ Activating your account...</div>
}