import { supabase } from './supabase'
import {
  getPendingDeliveries, removePendingDelivery,
  getPendingExpenses, removePendingExpense,
  getPendingPayments, removePendingPayment,
  getPendingQuickSales, removePendingQuickSale,
  saveOrdersOffline, saveCustomersOffline,
  saveRiderProfile, getPendingCount
} from './offlineDB'

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
      .eq('rider_id', rider.id)
      .eq('status', 'assigned')
      .lte('delivery_date', today)

    if (orders) await saveOrdersOffline(orders)

    const { data: customers } = await supabase
      .from('customers')
      .select('*')
      .eq('is_active', true)
      .order('full_name')

    if (customers) await saveCustomersOffline(customers)
    await saveRiderProfile(rider)

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

        const { error } = await supabase.from('deliveries').insert([data])
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

        // Update customer balance correctly based on payment method
        if (data.customer_id) {
          const { data: cust } = await supabase.from('customers').select('balance').eq('id', data.customer_id).single()
          if (cust) {
            let newBalance = Number(cust.balance)

            if (data.payment_method === 'credit') {
              // Full amount added to balance — customer owes everything
              newBalance += Number(data.total_amount)
            } else if (data.payment_method === 'cash') {
              // Only the credit portion (unpaid amount) adds to balance
              const creditPortion = Number(data.credit_amount || 0)
              newBalance += creditPortion
            } else if (data.payment_method === 'jazzcash') {
              // JazzCash — add to balance until admin confirms
              // When admin confirms jazzcash — balance will be reduced then
              newBalance += Number(data.total_amount)
            }

            await supabase.from('customers').update({ balance: newBalance }).eq('id', data.customer_id)
          }
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
        const { error } = await supabase.from('expenses').insert([data])
        if (error) { errors.push('Expense: ' + error.message); continue }
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
        const { error } = await supabase.from('payments').insert([data])
        if (error) { errors.push('Payment: ' + error.message); continue }

        // Update customer balance based on payment method
        if (data.customer_id) {
          const { data: cust } = await supabase.from('customers').select('balance').eq('id', data.customer_id).single()
          if (cust) {
            let newBalance = Number(cust.balance)

            if (data.payment_method === 'cash') {
              // Cash payment — immediately reduces balance
              newBalance -= Number(data.amount)
            } else if (data.payment_method === 'jazzcash') {
              // JazzCash payment — only reduces balance when admin confirms
              // Do not reduce balance here — admin will confirm later
            }

            await supabase.from('customers').update({ balance: newBalance }).eq('id', data.customer_id)
          }
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
        const { error } = await supabase.from('deliveries').insert([data])
        if (error) { errors.push('QuickSale: ' + error.message); continue }

        // Update customer balance for quick sales too
        if (data.customer_id) {
          const { data: cust } = await supabase.from('customers').select('balance').eq('id', data.customer_id).single()
          if (cust) {
            let newBalance = Number(cust.balance)
            if (data.payment_method === 'credit') {
              newBalance += Number(data.total_amount)
            } else if (data.payment_method === 'cash') {
              newBalance += Number(data.credit_amount || 0)
            } else if (data.payment_method === 'jazzcash') {
              newBalance += Number(data.total_amount)
            }
            await supabase.from('customers').update({ balance: newBalance }).eq('id', data.customer_id)
          }
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