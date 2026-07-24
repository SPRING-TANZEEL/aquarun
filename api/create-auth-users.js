import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export default async function handler(req, res) {
  const key = req.method === 'GET' ? req.query.key : req.headers['x-setup-key']
  if (key !== process.env.SUPER_ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const users = [
    { email: 'mian.tanzeel62@gmail.com', password: 'aquarun2026', tenant_code: 'SW001' },
    { email: 'jaariawater@gmail.com',     password: 'aquarun2026', tenant_code: 'JRW001' },
    { email: 'demo001@aquarun.pk',        password: 'aquarun2026', tenant_code: 'DEMO001' },
    { email: 'crw001@aquarun.pk',         password: 'aquarun2026', tenant_code: 'CRW001' },
  ]

  const results = []

  // List all existing auth users
  const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers()
  if (listError) return res.status(500).json({ error: 'Cannot list users: ' + listError.message })

  for (const user of users) {
    const existing = listData.users.find(u => u.email === user.email)

    if (existing) {
      // Reset password using admin API
      const { error } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        password: user.password,
        email_confirm: true
      })
      if (error) {
        results.push({ tenant_code: user.tenant_code, status: 'error', message: error.message })
      } else {
        await supabaseAdmin.from('tenants').update({ auth_user_id: existing.id }).eq('tenant_code', user.tenant_code)
        results.push({ tenant_code: user.tenant_code, status: 'password_reset', auth_id: existing.id })
      }
    } else {
      // Create new user
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true
      })
      if (error) {
        results.push({ tenant_code: user.tenant_code, status: 'error', message: error.message })
      } else {
        await supabaseAdmin.from('tenants').update({ auth_user_id: data.user.id }).eq('tenant_code', user.tenant_code)
        results.push({ tenant_code: user.tenant_code, status: 'created', auth_id: data.user.id })
      }
    }
  }

  return res.json({ results })
}
