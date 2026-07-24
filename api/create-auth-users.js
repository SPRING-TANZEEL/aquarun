import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const key = req.query.key
    if (key !== process.env.SUPER_ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' })
    // Continue with GET — same logic below
  } else if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  } else if (req.headers['x-setup-key'] !== process.env.SUPER_ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const users = [
    { email: 'mian.tanzeel62@gmail.com', password: 'aquarun2026', tenant_code: 'SW001' },
    { email: 'jaariawater@gmail.com', password: 'aquarun2026', tenant_code: 'JRW001' },
    { email: 'demo001@aquarun.pk', password: 'aquarun2026', tenant_code: 'DEMO001' },
    { email: 'crw001@aquarun.pk', password: 'aquarun2026', tenant_code: 'CRW001' },
  ]

  const results = []

  for (const user of users) {
    try {
      // Create auth user
      const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true
      })

      if (createError) {
        results.push({ tenant_code: user.tenant_code, error: createError.message })
        continue
      }

      // Link to tenant
      const { error: updateError } = await supabaseAdmin
        .from('tenants')
        .update({ auth_user_id: authUser.user.id })
        .eq('tenant_code', user.tenant_code)

      if (updateError) {
        results.push({ tenant_code: user.tenant_code, auth_id: authUser.user.id, error: 'Created but link failed: ' + updateError.message })
        continue
      }

      results.push({ tenant_code: user.tenant_code, auth_id: authUser.user.id, status: 'success' })
    } catch (err) {
      results.push({ tenant_code: user.tenant_code, error: err.message })
    }
  }

  return res.json({ results })
}
