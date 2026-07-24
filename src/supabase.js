import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
})

// Tenant session management
export function getTenantId() {
  return localStorage.getItem('aquarun_tenant_id') || null
}

export function setTenantSession(tenantCode, businessName, role, riderId = null, tenantUUID = null) {
  localStorage.setItem('aquarun_tenant_id', tenantCode)
  localStorage.setItem('aquarun_tenant_uuid', tenantUUID || '')
  localStorage.setItem('aquarun_business_name', businessName)
  localStorage.setItem('aquarun_role', role)
  if (riderId) localStorage.setItem('aquarun_rider_id', riderId)
}

export function clearTenantSession() {
  localStorage.removeItem('aquarun_tenant_id')
  localStorage.removeItem('aquarun_tenant_uuid')
  localStorage.removeItem('aquarun_business_name')
  localStorage.removeItem('aquarun_role')
  localStorage.removeItem('aquarun_rider_id')
  localStorage.removeItem('aquarun_user')
  supabase.auth.signOut()
}

export function isSuperAdmin() {
  return localStorage.getItem('aquarun_role') === 'superadmin'
}

export function getTenantUUID() {
  return localStorage.getItem('aquarun_tenant_uuid') || null
}