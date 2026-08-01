import { supabase } from './supabase'
import {
  getPendingDeliveries, removePendingDelivery,
  getPendingExpenses, removePendingExpense,
  getPendingPayments, removePendingPayment,
  getPendingQuickSales, removePendingQuickSale,
  saveOrdersOffline, saveCustomersOffline,
  saveRiderProfile, getPendingCount
} from './offlineDB'
import * as AccountingEngine from './accountingEngine'

let syncInProgress = false
let syncListeners = []

export function onSyncUpdate(callback) {
  syncListeners.push(callback)
  return () => { syncListeners = syncListeners.filter(l => l !== callback) }
}

function notify(status) {
  syncListeners.forEach(l => l(status))
}

export async function downloadRiderData(rider) {
  try {
    const today = new Date().toISOString().split('T')[0]

    const { data: orders } = await supabase
      .from('orders')
      .select('*, customers(full_name, mobile, customer_code, balance, rate_19l, rate_half_litre, rate_1_5l, own_bottles, our_bottles_placed)')
      .eq('tenant_id', rider.tenant_id)
      .eq('rider_id', rider.id)
      .eq('status', 'assigned')
      .lte('delivery_date', today)

    if (orders) await saveOrdersOffline(orders)

    const { data: customers } = await supabase
      .from('customer_balances')
      .select('*')
      .eq('tenant_id', rider.tenant_id)
      .eq('is_active', true)
      .order('full_name')

    if (customers) await saveCustomersOffline(customers)
    await saveRiderProfile(rider)

    // Sync stored customer balances with view for accurate offline/online balance display
    try {
      await supabase.rpc('sync_customer_balances', { p_tenant_id: rider.tenant_id })
      console.log('Customer balances synced')
    } catch (e) {
      console.log('Balance sync skipped:', e.message)
    }

    console.log('Downloaded orders:', orders?.length, 'customers:', customers?.length)
    return { success: true, ordersCount: orders?.length || 0, customersCount: customers?.length || 0 }
  } catch (error) {
    console.error('Download failed:', error)
    return { success: false, error: error.message }
  }
}

export async function syncToServer() {
  if (syncInProgress) return { success: false, message: 'Sync already in progress' }
  if (!navigator.onLine) return { success: false, message: 'No internet connection' }

  syncInProgress = true
  notify({ syncing: true })

  let totalSynced = 0
  let errors = []

  try {
    // ── Deliveries ──
    const deliveries = await getPendingDeliveries()
    console.log('Syncing deliveries:', deliveries.length)

    for (const record of deliveries) {
      try {
        const { local_id, ...data } = record
        console.log('Posting delivery:', data)

        const { data: savedDelivery, error } = await supabase.from('deliveries').insert([data]).select().single()
        if (error) {
          console.error('Delivery insert error:', error)
          errors.push('Delivery error: ' + error.message)
          continue
        }

        // Update order status
        if (data.order_id) {
          await supabase.from('orders').update({
            status: 'completed',
            completed_at: data.delivered_at || new Date().toISOString()
          }).eq('id', data.order_id)
        }

        // Balance is calculated dynamically from customer_balances view — no manual update needed

        // Post delivery journal entry
        try {
          await AccountingEngine.postDeliveryJournal(savedDelivery, data.customer_id, data.tenant_id, true)
        } catch (err) {
          console.error('Delivery journal error:', err)
        }

        // Generate invoice number
        try {
          const year = new Date().getFullYear()
          const counterKey = `invoice_counter_${year}`
          const { data: counterRows } = await supabase.from('business_settings')
            .select('setting_value').eq('tenant_id', data.tenant_id).eq('setting_key', counterKey)
          const counter = Number(counterRows?.[0]?.setting_value || 0) + 1
          const { data: tenantData } = await supabase.from('tenants').select('tenant_code').eq('id', data.tenant_id).single()
          const code = tenantData?.tenant_code || 'INV'
          const invoiceNumber = `${code}-${year}-${String(counter).padStart(4, '0')}`
          await supabase.from('business_settings').upsert(
            { tenant_id: data.tenant_id, setting_key: counterKey, setting_value: String(counter) },
            { onConflict: 'tenant_id,setting_key' }
          )
          await supabase.from('deliveries').update({ invoice_number: invoiceNumber }).eq('id', savedDelivery.id)
        } catch (err) {
          console.error('Invoice number error:', err)
        }

        await removePendingDelivery(local_id)
        totalSynced++
        console.log('Delivery synced and removed:', local_id)
      } catch (err) {
        console.error('Delivery sync error:', err)
        errors.push(err.message)
      }
    }

    // ── Expenses ──
    const expenses = await getPendingExpenses()
    console.log('Syncing expenses:', expenses.length)

    for (const record of expenses) {
      try {
        const { local_id, ...data } = record
        const { data: savedExpense, error } = await supabase.from('expenses').insert([data]).select().single()
        if (error) { errors.push('Expense: ' + error.message); continue }

        // Post expense journal entry
        try {
          await AccountingEngine.postRiderExpenseJournal(savedExpense, data.tenant_id)
        } catch (err) {
          console.error('Expense journal error:', err)
        }

        await removePendingExpense(local_id)
        totalSynced++
      } catch (err) {
        errors.push(err.message)
      }
    }

    // ── Payments ──
    const payments = await getPendingPayments()
    console.log('Syncing payments:', payments.length)

    for (const record of payments) {
      try {
        const { local_id, ...data } = record
        const { data: savedPayment, error } = await supabase.from('payments').insert([data]).select().single()
        if (error) { errors.push('Payment: ' + error.message); continue }

        // Balance is calculated dynamically from customer_balances view — no manual update needed

        // Post payment journal entry
        try {
          await AccountingEngine.postPaymentJournal(savedPayment, data.tenant_id, true)
        } catch (err) {
          console.error('Payment journal error:', err)
        }

        await removePendingPayment(local_id)
        totalSynced++
      } catch (err) {
        errors.push(err.message)
      }
    }

    // ── Quick Sales ──
    const quicksales = await getPendingQuickSales()
    console.log('Syncing quick sales:', quicksales.length)

    for (const record of quicksales) {
      try {
        const { local_id, ...data } = record
        const { data: savedDelivery, error } = await supabase.from('deliveries').insert([data]).select().single()
        if (error) { errors.push('QuickSale: ' + error.message); continue }

        // Balance is calculated dynamically from customer_balances view — no manual update needed

        // Post delivery journal entry for quick sale
        try {
          await AccountingEngine.postDeliveryJournal(savedDelivery, data.customer_id, data.tenant_id, false)
        } catch (err) {
          console.error('QuickSale journal error:', err)
        }

        await removePendingQuickSale(local_id)
        totalSynced++
      } catch (err) {
        errors.push(err.message)
      }
    }

    const pendingCount = await getPendingCount()
    notify({ syncing: false, pendingCount, lastSync: new Date().toISOString(), totalSynced })
    console.log('Sync done. Synced:', totalSynced, 'Remaining:', pendingCount, 'Errors:', errors)

    return { success: true, totalSynced, errors, pendingCount }

  } catch (error) {
    console.error('Sync failed:', error)
    notify({ syncing: false, error: error.message })
    return { success: false, error: error.message }
  } finally {
    syncInProgress = false
  }
}

export function startAutoSync() {
  window.addEventListener('online', async () => {
    console.log('Back online — auto syncing...')
    await syncToServer()
  })

  setInterval(async () => {
    if (navigator.onLine) {
      const count = await getPendingCount()
      if (count > 0) {
        console.log('Auto sync interval — pending:', count)
        await syncToServer()
      }
    }
  }, 30000)
}
