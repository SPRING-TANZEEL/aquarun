import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, tenantId, tenantCode } = req.body

  // Basic guard — require a secret header so random people can't call this
  if (req.headers['x-super-secret'] !== process.env.SUPER_ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

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

    // ── DELETE TENANT ───────────────────────────────────────────────
    if (action === 'deleteTenant') {
      if (tenantCode === 'SW001') return res.status(400).json({ error: 'Cannot delete own business' })

      const tid = tenantId
      const del = (table) => supabaseAdmin.from(table).delete().eq('tenant_id', tid)
      const delById = (table, ids) => supabaseAdmin.from(table).delete().in('production_entry_id', ids)

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
