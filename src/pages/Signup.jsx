import { useState } from 'react'
import { supabase } from '../supabase'

const TENANT_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function generateTenantCode(businessName) {
  const prefix = businessName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'X')
  const suffix = Math.floor(100 + Math.random() * 900)
  return prefix + suffix
}

const DEFAULT_COA = [
  { code: '1001', name: 'Cash in Hand', type: 'asset', subtype: 'current_asset' },
  { code: '1002', name: 'JazzCash Account', type: 'asset', subtype: 'current_asset' },
  { code: '1003', name: 'Bank Account', type: 'asset', subtype: 'current_asset' },
  { code: '1004', name: 'EasyPaisa Account', type: 'asset', subtype: 'current_asset' },
  { code: '1100', name: 'Accounts Receivable', type: 'asset', subtype: 'current_asset' },
  { code: '1101', name: 'Receivable from Riders', type: 'asset', subtype: 'current_asset' },
  { code: '1102', name: 'JazzCash Clearing - Pending', type: 'asset', subtype: 'current_asset' },
  { code: '1103', name: 'EasyPaisa Clearing - Pending', type: 'asset', subtype: 'current_asset' },
  { code: '1104', name: 'Salary Advances to Riders', type: 'asset', subtype: 'current_asset' },
  { code: '1105', name: 'Bank Transfer Clearing', type: 'asset', subtype: 'current_asset' },
  { code: '1106', name: 'Bottles with Customers', type: 'asset', subtype: 'current_asset' },
  { code: '1200', name: 'Inventory - Raw Materials', type: 'asset', subtype: 'current_asset' },
  { code: '1201', name: 'Inventory - Finished Goods', type: 'asset', subtype: 'current_asset' },
  { code: '1202', name: 'Inventory - Trading Items', type: 'asset', subtype: 'current_asset' },
  { code: '1500', name: 'Fixed Assets', type: 'asset', subtype: 'fixed_asset' },
  { code: '2100', name: 'Salary Payable', type: 'liability', subtype: 'current_liability' },
  { code: '2200', name: 'Accounts Payable', type: 'liability', subtype: 'current_liability' },
  { code: '2300', name: 'Tax Payable', type: 'liability', subtype: 'current_liability' },
  { code: '3001', name: 'Owner Capital', type: 'equity', subtype: 'equity' },
  { code: '3002', name: 'Retained Earnings', type: 'equity', subtype: 'equity' },
  { code: '3003', name: 'Owner Drawings', type: 'equity', subtype: 'equity' },
  { code: '4001', name: 'Water Sales - 19L', type: 'revenue', subtype: 'revenue' },
  { code: '4002', name: 'Water Sales - Half Litre', type: 'revenue', subtype: 'revenue' },
  { code: '4003', name: 'Water Sales - 1.5L', type: 'revenue', subtype: 'revenue' },
  { code: '4004', name: 'Other Sales', type: 'revenue', subtype: 'revenue' },
  { code: '5001', name: 'Raw Material Purchases', type: 'expense', subtype: 'cogs' },
  { code: '5002', name: 'Manufacturing Overhead', type: 'expense', subtype: 'cogs' },
  { code: '5003', name: 'Cost of Goods Sold', type: 'expense', subtype: 'cogs' },
  { code: '6001', name: 'Rider Salaries', type: 'expense', subtype: 'operating_expense' },
  { code: '6002', name: 'Staff Salaries', type: 'expense', subtype: 'operating_expense' },
  { code: '6003', name: 'Office Rent', type: 'expense', subtype: 'operating_expense' },
  { code: '6004', name: 'Utilities', type: 'expense', subtype: 'operating_expense' },
  { code: '6005', name: 'Marketing & Advertising', type: 'expense', subtype: 'operating_expense' },
  { code: '6006', name: 'Office Supplies', type: 'expense', subtype: 'operating_expense' },
  { code: '6007', name: 'Vehicle Expenses', type: 'expense', subtype: 'operating_expense' },
  { code: '6008', name: 'Maintenance & Repairs', type: 'expense', subtype: 'operating_expense' },
  { code: '6009', name: 'Other Expenses', type: 'expense', subtype: 'operating_expense' },
  { code: '6010', name: 'Bank Charges', type: 'expense', subtype: 'operating_expense' },
  { code: '6011', name: 'Depreciation', type: 'expense', subtype: 'operating_expense' },
  { code: '6012', name: 'Insurance', type: 'expense', subtype: 'operating_expense' },
  { code: '6013', name: 'Professional Fees', type: 'expense', subtype: 'operating_expense' },
  { code: '6014', name: 'Taxes & Licenses', type: 'expense', subtype: 'operating_expense' },
  { code: '6015', name: 'Telephone & Internet', type: 'expense', subtype: 'operating_expense' },
  { code: '6016', name: 'Travel & Transportation', type: 'expense', subtype: 'operating_expense' },
  { code: '6017', name: 'Rider Fuel & Vehicle', type: 'expense', subtype: 'operating_expense' },
  { code: '6018', name: 'Rider Refreshments', type: 'expense', subtype: 'operating_expense' },
  { code: '6019', name: 'Rider Repairs', type: 'expense', subtype: 'operating_expense' },
  { code: '6020', name: 'Miscellaneous', type: 'expense', subtype: 'operating_expense' },
]

export default function Signup({ onSuccess }) {
  const [step, setStep] = useState(1) // 1=form, 2=verify
  const [form, setForm] = useState({
    businessName: '',
    email: '',
    password: '',
    confirmPassword: '',
    mobile: '',
    city: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  function f(k) { return e => setForm(p => ({ ...p, [k]: e.target.value })) }

  function formatMobile(e) {
    let val = e.target.value.replace(/[^\d+]/g, '')
    if (val.startsWith('0') && val.length > 1) val = '+92' + val.slice(1)
    else if (val.startsWith('3') && !val.startsWith('+')) val = '+92' + val
    if (val.startsWith('+92') && val.length > 3) {
      const num = val.slice(3)
      if (num.length <= 3) val = '+92 ' + num
      else if (num.length <= 7) val = '+92 ' + num.slice(0, 3) + ' ' + num.slice(3)
      else val = '+92 ' + num.slice(0, 3) + ' ' + num.slice(3, 7) + ' ' + num.slice(7, 11) 
    }
    setForm(p => ({ ...p, mobile: val }))
  }

  async function handleSignup(e) {
    e.preventDefault()
    setError('')

    if (!form.businessName.trim()) return setError('Please enter your business name')
    if (!form.email.trim()) return setError('Please enter your email')
    if (!form.mobile.trim()) return setError('Please enter your mobile number')
    if (form.password.length < 8) return setError('Password must be at least 8 characters')
    if (form.password !== form.confirmPassword) return setError('Passwords do not match')

    setLoading(true)

    try {
      // 1 — Create Supabase Auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        options: {
          emailRedirectTo: 'https://aquarun.pk/',
          data: { business_name: form.businessName.trim() }
        }
      })

      if (authError) { setError(authError.message); setLoading(false); return }

      const authUserId = authData.user?.id
      if (!authUserId) { setError('Signup failed. Please try again.'); setLoading(false); return }

      // 2 — Generate unique tenant code
      let tenantCode = generateTenantCode(form.businessName)
      const { data: existing } = await supabase.from('tenants').select('id').eq('tenant_code', tenantCode)
      if (existing?.length > 0) tenantCode = tenantCode.slice(0, 3) + Math.floor(100 + Math.random() * 900)

      // 3 — Create tenant record

      const { data: tenant, error: tenantError } = await supabase.from('tenants').insert([{
        tenant_code: tenantCode,
        business_name: form.businessName.trim(),
        email: form.email.trim().toLowerCase(),
        mobile: form.mobile.trim() || null,
        city: form.city.trim() || null,
        plan: 'free',
        subscription_status: 'active',
        is_active: true,
        auth_user_id: authUserId,
        has_tracking_feature: false,
        has_map_feature: false,
        has_premium_reports: false,
      }]).select().single()

      if (tenantError) { setError('Error creating account: ' + tenantError.message); setLoading(false); return }

      const tenantId = tenant.id

      // 4 — Seed COA
      const coaRows = DEFAULT_COA.map(a => ({ ...a, tenant_id: tenantId, is_active: true }))
      await supabase.from('chart_of_accounts').insert(coaRows)

      // 5 — Seed default products
      const products = [
        { tenant_id: tenantId, name: '19 Litre Water Bottle (Tracking Only)', product_type: 'trading', bottle_type: '19l', unit: 'piece', current_stock: 0, average_cost: 900, sale_price: 0, is_active: true, is_saleable: false, income_account_code: '4001', income_account_name: 'Water Sales - 19L', cogs_account_code: '5003', cogs_account_name: 'Cost of Goods Sold' },
        { tenant_id: tenantId, name: 'Table Top Dispenser', product_type: 'trading', unit: 'piece', current_stock: 0, average_cost: 0, sale_price: 0, is_active: true, is_saleable: true, income_account_code: '4004', income_account_name: 'Other Sales', cogs_account_code: '5003', cogs_account_name: 'Cost of Goods Sold' },
        { tenant_id: tenantId, name: 'Bottle Tap', product_type: 'trading', unit: 'piece', current_stock: 0, average_cost: 0, sale_price: 0, is_active: true, is_saleable: true, income_account_code: '4004', income_account_name: 'Other Sales', cogs_account_code: '5003', cogs_account_name: 'Cost of Goods Sold' },
        { tenant_id: tenantId, name: 'Bottle Stand', product_type: 'trading', unit: 'piece', current_stock: 0, average_cost: 0, sale_price: 0, is_active: true, is_saleable: true, income_account_code: '4004', income_account_name: 'Other Sales', cogs_account_code: '5003', cogs_account_name: 'Cost of Goods Sold' },
        { tenant_id: tenantId, name: 'Half Litre PET (Pure)', product_type: 'finished_good', bottle_type: 'half_litre', unit: 'pet', current_stock: 0, average_cost: 0, sale_price: 0, is_active: true, is_saleable: true, income_account_code: '4002', income_account_name: 'Water Sales - Half Litre', cogs_account_code: '5003', cogs_account_name: 'Cost of Goods Sold' },
        { tenant_id: tenantId, name: '1.5 Litre PET (Pure)', product_type: 'finished_good', bottle_type: '1_5l', unit: 'pet', current_stock: 0, average_cost: 0, sale_price: 0, is_active: true, is_saleable: true, income_account_code: '4003', income_account_name: 'Water Sales - 1.5L', cogs_account_code: '5003', cogs_account_name: 'Cost of Goods Sold' },
      ]
      await supabase.from('products').insert(products)

      // 6 — Seed COA, products, BOM via existing SuperAdmin API
      await fetch('/api/super-admin-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seedTenant', tenantId, businessName: form.businessName.trim() })
      })
    } catch (err) {
      setError('Unexpected error: ' + err.message)
    }
    setLoading(false)
  }

  const inp = { width: '100%', padding: '11px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }

  if (step === 2) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0a3d6b,#0d2d52)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: 'white', borderRadius: 16, padding: 40, maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
          <h2 style={{ color: '#0f4c81', marginBottom: 12, fontSize: 22 }}>Check Your Email!</h2>
          <p style={{ color: '#555', marginBottom: 24, lineHeight: 1.6 }}>
            We sent a verification link to <strong>{form.email}</strong>.<br/>
            Click the link in the email to activate your account.
          </p>
          <div style={{ background: '#e8f5e9', borderRadius: 10, padding: 16, marginBottom: 24 }}>
            <p style={{ color: '#1b5e20', fontWeight: 700, margin: '0 0 6px' }}>✅ Account Created!</p>
            <p style={{ color: '#2e7d32', fontSize: 13, margin: 0 }}>After verifying your email, login at <strong>aquarun.pk</strong> with your email and password.</p>
          </div>
          <button onClick={() => window.location.href = '/'} style={{ width: '100%', padding: 13, background: '#0f4c81', color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
            Go to Login →
          </button>
          <p style={{ marginTop: 16, fontSize: 12, color: '#888' }}>Didn't receive the email? Check your spam folder or <a href="/signup" style={{ color: '#0f4c81' }}>try again</a></p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0a3d6b,#0d2d52)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 16, padding: '36px 40px', maxWidth: 500, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{ width: 42, height: 42, background: '#0f4c81', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>💧</div>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#0f4c81' }}>AquaRun</span>
        </div>

        <h1 style={{ fontSize: 22, color: '#1a1a2e', marginBottom: 6 }}>Create Your Account</h1>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 24 }}>No credit card required.</p>

        {error && (
          <div style={{ background: '#ffebee', border: '1px solid #ffcdd2', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
            <p style={{ color: '#c62828', fontSize: 13, margin: 0 }}>❌ {error}</p>
          </div>
        )}

        <form onSubmit={handleSignup}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#333', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Business Name *</label>
            <input style={inp} placeholder="e.g. Spring Water Kamoke" value={form.businessName} onChange={f('businessName')} required />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#333', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Email Address *</label>
            <input style={inp} type="email" placeholder="admin@yourbusiness.com" value={form.email} onChange={f('email')} required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#333', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Password *</label>
              <input style={inp} type="password" placeholder="Min 8 characters" value={form.password} onChange={f('password')} required />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#333', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Confirm Password *</label>
              <input style={inp} type="password" placeholder="Repeat password" value={form.confirmPassword} onChange={f('confirmPassword')} required />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#333', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Mobile *</label>
              <input style={inp} placeholder="+92 300 1234567" value={form.mobile} onChange={formatMobile} required />
            </div>  
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#333', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>City (optional)</label>
              <input style={inp} placeholder="Lahore" value={form.city} onChange={f('city')} />
            </div>
          </div>

        <div style={{ background: '#e8f5e9', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
            <p style={{ fontSize: 12, color: '#1b5e20', margin: 0 }}>✅ <strong>Free forever</strong> for up to 20 customers · No credit card needed</p>
          </div>

          <button type="submit" disabled={loading} style={{ width: '100%', padding: 14, background: loading ? '#ccc' : '#0f4c81', color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? '⏳ Creating Account...' : '🚀 Create Free Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#888' }}>
          Already have an account? <a href="/" style={{ color: '#0f4c81', fontWeight: 700 }}>Login here</a>
        </p>

        <p style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: '#aaa' }}>
          By signing up you agree to our <a href="/privacy-policy.html" style={{ color: '#888' }}>Privacy Policy</a>
        </p>
      </div>
    </div>
  )
}
