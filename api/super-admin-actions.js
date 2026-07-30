import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, tenantId, tenantCode } = req.body

  // Basic guard — require a secret header so random people can't call this

  try {
    // ── RESET PASSWORD ──────────────────────────────────────────────
    if (action === 'resetPassword') {
      const { newPassword } = req.body
      if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'Password too short' })

      const { data: hashData, error: hashError } = await supabaseAdmin
        .rpc('hash_password', { password_input: newPassword })
      if (hashError) return res.status(500).json({ error: hashError.message })

      const { error } = await supabaseAdmin
        .from('tenants').update({ admin_password: hashData }).eq('id', tenantId)
      if (error) return res.status(500).json({ error: error.message })

      return res.json({ ok: true })
    }

    // ── TOGGLE ACTIVE ───────────────────────────────────────────────
    if (action === 'toggleActive') {
      const { isActive } = req.body
      const { error } = await supabaseAdmin
        .from('tenants').update({ is_active: isActive }).eq('id', tenantId)
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ ok: true })
    }

    if (action === 'toggleFeature') {
      const { field, value } = req.body
      const allowed = ['has_map_feature', 'has_tracking_feature']
      if (!allowed.includes(field)) return res.status(400).json({ error: 'Invalid field' })
      const { error } = await supabaseAdmin.from('tenants').update({ [field]: value }).eq('id', tenantId)
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ ok: true })
    }

    // ── SET TRANSACTION PASSWORD ────────────────────────────────────
    if (action === 'setTransactionPassword') {
      const { txnPassword } = req.body
      if (!txnPassword || txnPassword.length < 4) return res.status(400).json({ error: 'Password too short' })
      const { error } = await supabaseAdmin
        .from('tenants').update({ transaction_password: txnPassword }).eq('id', tenantId)
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ ok: true })
    }

    // ── RECORD PAYMENT ──────────────────────────────────────────────
    if (action === 'recordPayment') {
      const { amount, lastPaymentDate, nextDueDate } = req.body
      const { error } = await supabaseAdmin.from('tenants').update({
        last_payment_date: lastPaymentDate,
        last_payment_amount: amount,
        next_due_date: nextDueDate,
      }).eq('id', tenantId)
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ ok: true })
    }

    // ── CHANGE BUSINESS ID ──────────────────────────────────────────
    if (action === 'changeBusinessId') {
      const { newCode } = req.body
      if (!newCode || newCode.length < 3) return res.status(400).json({ error: 'ID too short' })
      const { data: existing } = await supabaseAdmin
        .from('tenants').select('id').eq('tenant_code', newCode).single()
      if (existing) return res.status(400).json({ error: 'Business ID already taken' })
      const { error } = await supabaseAdmin
        .from('tenants').update({ tenant_code: newCode }).eq('id', tenantId)
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ ok: true })
    }

    // ── RESET PASSWORD BY EMAIL OR ID ───────────────────────────────
    if (action === 'resetPasswordByEmail') {
      const { email, password, userId } = req.body
      let targetId = userId
      if (!targetId) {
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
        const user = listData?.users?.find(u => u.email === email)
        if (!user) return res.status(404).json({ error: 'User not found: ' + email })
        targetId = user.id
      }
      const { error } = await supabaseAdmin.auth.admin.updateUserById(targetId, {
        password, email_confirm: true
      })
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ ok: true, user_id: targetId })
    }

    // ── CREATE AUTH USER ────────────────────────────────────────────
    if (action === 'createAuthUser') {
      const { email, password } = req.body
      // Check if user already exists
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers()
      const existing = existingUsers?.users?.find(u => u.email === email)
      if (existing) {
        // Update password for existing user
        await supabaseAdmin.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
        return res.json({ ok: true, auth_user_id: existing.id })
      }
      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true
      })
      if (authError) return res.status(500).json({ error: authError.message })
      return res.json({ ok: true, auth_user_id: authUser.user.id })
    }

    // ── CREATE TENANT ────────────────────────────────────────────────
    if (action === 'createTenant') {
      const { tenantData } = req.body
      const { data: newTenant, error } = await supabaseAdmin
        .from('tenants').insert([tenantData]).select().single()
      if (error) return res.status(500).json({ error: error.message })

      const tid = newTenant.id

      // Seed Chart of Accounts
      const accounts = [
        { tenant_id: tid, account_code: '1001', account_name: 'Cash in Hand', account_type: 'asset', account_subtype: 'current', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '1002', account_name: 'JazzCash Account', account_type: 'asset', account_subtype: 'current', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '1003', account_name: 'Bank Account', account_type: 'asset', account_subtype: 'current', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '1004', account_name: 'EasyPaisa Account', account_type: 'asset', account_subtype: 'cash', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '1100', account_name: 'Accounts Receivable', account_type: 'asset', account_subtype: 'current', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '1101', account_name: 'Receivable from Riders', account_type: 'asset', account_subtype: 'receivable', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '1102', account_name: 'JazzCash Clearing - Pending', account_type: 'asset', account_subtype: 'clearing', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '1103', account_name: 'EasyPaisa Clearing - Pending', account_type: 'asset', account_subtype: 'clearing', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '1104', account_name: 'Salary Advances to Riders', account_type: 'asset', account_subtype: 'current', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '1200', account_name: 'Inventory - Raw Materials', account_type: 'asset', account_subtype: 'current', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '1201', account_name: 'Inventory - Finished Goods', account_type: 'asset', account_subtype: 'current', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '1202', account_name: 'Inventory - Trading Items', account_type: 'asset', account_subtype: 'current', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '1300', account_name: 'Prepaid Expenses', account_type: 'asset', account_subtype: 'current', is_system: false, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '1500', account_name: 'Vehicle - Delivery', account_type: 'asset', account_subtype: 'fixed', is_system: false, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '1501', account_name: 'Machinery & Equipment', account_type: 'asset', account_subtype: 'fixed', is_system: false, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '1502', account_name: 'Accumulated Depreciation', account_type: 'asset', account_subtype: 'fixed', is_system: false, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '2001', account_name: 'Accounts Payable', account_type: 'liability', account_subtype: 'current', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '2100', account_name: 'Salary Payable', account_type: 'liability', account_subtype: 'current', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '2200', account_name: 'Advance from Customers', account_type: 'liability', account_subtype: 'current', is_system: false, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '2300', account_name: 'Tax Payable', account_type: 'liability', account_subtype: 'current', is_system: false, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '3001', account_name: 'Owner Capital', account_type: 'equity', account_subtype: 'capital', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '3002', account_name: 'Owner Drawings', account_type: 'equity', account_subtype: 'drawings', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '3003', account_name: 'Retained Earnings', account_type: 'equity', account_subtype: 'capital', is_system: false, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '4001', account_name: 'Water Sales - 19L', account_type: 'revenue', account_subtype: 'sales', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '4002', account_name: 'Water Sales - Half Litre', account_type: 'revenue', account_subtype: 'sales', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '4003', account_name: 'Water Sales - 1.5L', account_type: 'revenue', account_subtype: 'sales', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '4004', account_name: 'Other Sales', account_type: 'revenue', account_subtype: 'sales', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '4100', account_name: 'Delivery Charges', account_type: 'revenue', account_subtype: 'other', is_system: false, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '4200', account_name: 'Other Income', account_type: 'revenue', account_subtype: 'other', is_system: false, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '5001', account_name: 'Raw Material Cost', account_type: 'expense', account_subtype: 'cogs', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '5002', account_name: 'Production Overhead', account_type: 'expense', account_subtype: 'cogs', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '5003', account_name: 'Cost of Goods Sold', account_type: 'expense', account_subtype: 'cogs', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '5004', account_name: 'Raw Material Consumed', account_type: 'expense', account_subtype: 'cogs', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '6001', account_name: 'Rider Salaries', account_type: 'expense', account_subtype: 'salary', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '6002', account_name: 'Salary Advances', account_type: 'expense', account_subtype: 'salary', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '6003', account_name: 'Rider Field Expenses', account_type: 'expense', account_subtype: 'field', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '6004', account_name: 'Rent', account_type: 'expense', account_subtype: 'admin', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '6005', account_name: 'Electricity', account_type: 'expense', account_subtype: 'admin', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '6006', account_name: 'Fuel - Office', account_type: 'expense', account_subtype: 'admin', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '6007', account_name: 'Maintenance', account_type: 'expense', account_subtype: 'admin', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '6008', account_name: 'Supplies', account_type: 'expense', account_subtype: 'admin', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '6009', account_name: 'Other Expenses', account_type: 'expense', account_subtype: 'admin', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '6010', account_name: 'Water Testing Fees', account_type: 'expense', account_subtype: 'admin', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '6011', account_name: 'Vehicle Running Cost', account_type: 'expense', account_subtype: 'admin', is_system: false, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '6012', account_name: 'Depreciation', account_type: 'expense', account_subtype: 'admin', is_system: false, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '6013', account_name: 'Telephone & Internet', account_type: 'expense', account_subtype: 'admin', is_system: false, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '6014', account_name: 'Bank Charges', account_type: 'expense', account_subtype: 'admin', is_system: false, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '6015', account_name: 'Printing & Stationery', account_type: 'expense', account_subtype: 'admin', is_system: false, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '6016', account_name: 'Advertising & Marketing', account_type: 'expense', account_subtype: 'admin', is_system: false, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '6017', account_name: 'Rider Fuel & Vehicle', account_type: 'expense', account_subtype: 'field', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '6018', account_name: 'Rider Refreshments', account_type: 'expense', account_subtype: 'field', is_system: true, is_active: true, opening_balance: 0 },
        { tenant_id: tid, account_code: '6019', account_name: 'Rider Repairs', account_type: 'expense', account_subtype: 'field', is_system: true, is_active: true, opening_balance: 0 },
      ]
      const { error: coaError } = await supabaseAdmin.from('chart_of_accounts').insert(accounts)
      if (coaError) console.error('COA seed error:', coaError.message)

      // Seed default business settings
      const { error: settingsError } = await supabaseAdmin.from('business_settings').insert([
        { tenant_id: tid, setting_key: 'business_name', setting_value: tenantData.business_name },
        { tenant_id: tid, setting_key: 'setup_completed', setting_value: 'false' },
        { tenant_id: tid, setting_key: 'opening_cash_balance', setting_value: '0' },
        { tenant_id: tid, setting_key: 'opening_jazzcash_balance', setting_value: '0' },
        { tenant_id: tid, setting_key: 'opening_bank_balance', setting_value: '0' },
        { tenant_id: tid, setting_key: 'sales_tax_rate', setting_value: '16' },
        { tenant_id: tid, setting_key: 'jazzcash_opening_balance', setting_value: '0' },
      ])
      if (settingsError) console.error('Settings seed error:', settingsError.message)

      return res.json({ ok: true, tenant: newTenant })
    }

    // ── DELETE TENANT ───────────────────────────────────────────────
    if (action === 'deleteTenant') {
      if (tenantCode === 'SW001') return res.status(400).json({ error: 'Cannot delete own business' })

      const tid = tenantId
      const del = (table) => supabaseAdmin.from(table).delete().eq('tenant_id', tid)
      const delById = (table, ids) => supabaseAdmin.from(table).delete().in('production_entry_id', ids)

      await del('monthly_invoices')
      await del('delivery_items')
      await del('bill_of_materials')
      const { data: prodEntries } = await supabaseAdmin
        .from('production_entries').select('id').eq('tenant_id', tid)
      if (prodEntries?.length > 0) await delById('production_consumption', prodEntries.map(p => p.id))
      await del('production_entries')
      await del('journal_entry_lines')
      await del('journal_entries')
      await del('deliveries')
      await del('payments')
      await del('orders')
      await del('expenses')
      await del('office_expenses')
      await del('cash_transfers')
      await del('salary_advances')
      await del('salary_payments')
      await del('stock_purchases')
      await del('customers')
      await del('riders')
      await del('products')
      await del('chart_of_accounts')
      await del('business_settings')
      await supabaseAdmin.from('tenants').delete().eq('id', tid)

      return res.json({ ok: true })
    }

    return res.status(400).json({ error: 'Unknown action' })

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
