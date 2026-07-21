import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  
  const { tenantCode, password } = req.body
  
  try {
    const { data, error } = await supabase.rpc('verify_tenant_password', {
      tenant_code_input: tenantCode,
      password_input: password
    })
    
    if (error) throw error
    
    if (data) {
      // Password correct — return tenant info
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id, tenant_code, business_name, business_logo')
        .eq('tenant_code', tenantCode)
        .single()
      res.json({ success: true, tenant })
    } else {
      res.status(401).json({ success: false, error: 'Invalid password' })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}