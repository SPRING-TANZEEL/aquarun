import { useEffect } from 'react'
import { supabase } from '../supabase'

export default function ConfirmEmail() {
  useEffect(() => {
    async function activate() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        await supabase.from('tenants').update({ is_active: true }).eq('auth_user_id', session.user.id)
      }
      window.location.href = '/'
    }
    activate()
  }, [])
  return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0f4c81',color:'white',fontSize:20}}>✅ Activating your account...</div>
}