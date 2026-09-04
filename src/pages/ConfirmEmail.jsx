import { useEffect } from 'react'
import { supabase } from '../supabase'

export default function ConfirmEmail() {
  useEffect(() => {
    async function activate() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        await fetch('/api/super-admin-actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'activateTenant', authUserId: session.user.id })
        })
      }
      window.location.href = '/'
    }
    activate()
  }, [])
  return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0f4c81',color:'white',fontSize:20}}>✅ Activating your account...</div>
}