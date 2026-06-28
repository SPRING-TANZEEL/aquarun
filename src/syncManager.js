// ─── SYNC MANAGER ──────────────────────────────────────────────────
// Syncs offline data to Supabase when internet is available

import { supabase } from './supabase'
import {
  getPendingDeliveries, markDeliverySynced,
  getPendingExpenses, markExpenseSynced,
  getPendingPayments, markPaymentSynced,
  getPendingQuickSales, markQuickSaleSynced,
  saveOrdersOffline, saveCustomersOffline,
  saveRiderProfile, getPendingCount
} from './offlineDB'

let syncInProgress = false
let syncListeners = []

export function onSyncUpdate(callback) {
  syncListeners.push(callback)
  return () => { syncListeners = syncListeners.filter(l => l !== callback) }
}

function notifyListeners(status) {
  syncListeners.forEach(l => l(status))
}

export async function downloadRiderData(rider) {
  try {
    const today = new Date().toISOString().split('T')[0]

    // Download today's orders
    const { data: orders } = await supabase
      .from('orders')
      .select('*, customers(full_name, mobile, customer_code, balance, rate_19l, rate_half_litre, rate_1_5l, own_bottles, our_bottles_placed)')
      .eq('rider_id', rider.id)
      .eq('status', 'assigned')
      .lte('delivery_date', today)

    if (orders) await saveOrdersOffline(orders)

    // Download all active customers
    const { data: customers } = await supabase
      .from('customers')
      .select('*')
      .eq('is_active', true)
      .order('full_name')

    if (customers) await saveCustomersOffline(customers)

    // Save rider profile
    await saveRiderProfile(rider)

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
  notifyListeners({ syncing: true, pendingCount: 0 })

  let totalSynced = 0
  let errors = []

  try {
    // Sync deliveries
    const pendingDeliveries = await getPendingDeliveries()
    for (const delivery of pendingDeliveries) {
      try {
        const { local_id, synced, ...deliveryData } = delivery
        const { error } = await supabase.from('deliveries').insert([deliveryData])
        if (error) throw error

        // Update order status on server
        if (deliveryData.order_id) {
          await supabase.from('orders').update({
            status: 'completed',
            completed_at: deliveryData.delivered_at || new Date().toISOString()
          }).eq('id', deliveryData.order_id)
        }

        // Update customer balance on server
        if (deliveryData.customer_id && deliveryData.credit_amount > 0) {
          const { data: customer } = await supabase
            .from('customers').select('balance').eq('id', deliveryData.customer_id).single()
          if (customer) {
            await supabase.from('customers').update({
              balance: Number(customer.balance) + Number(deliveryData.credit_amount)
            }).eq('id', deliveryData.customer_id)
          }
        }

        await markDeliverySynced(local_id)
        totalSynced++
      } catch (err) {
        errors.push('Delivery sync failed: ' + err.message)
      }
    }

    // Sync expenses
    const pendingExpenses = await getPendingExpenses()
    for (const expense of pendingExpenses) {
      try {
        const { local_id, synced, ...expenseData } = expense
        const { error } = await supabase.from('expenses').insert([expenseData])
        if (error) throw error
        await markExpenseSynced(local_id)
        totalSynced++
      } catch (err) {
        errors.push('Expense sync failed: ' + err.message)
      }
    }

    // Sync payments
    const pendingPayments = await getPendingPayments()
    for (const payment of pendingPayments) {
      try {
        const { local_id, synced, ...paymentData } = payment
        const { error } = await supabase.from('payments').insert([paymentData])
        if (error) throw error

        // Update customer balance on server
        if (paymentData.customer_id && !paymentData.jazzcash_confirmed) {
          // Cash payment — reduce balance immediately
          if (paymentData.payment_method === 'cash') {
            const { data: customer } = await supabase
              .from('customers').select('balance').eq('id', paymentData.customer_id).single()
            if (customer) {
              await supabase.from('customers').update({
                balance: Number(customer.balance) - Number(paymentData.amount)
              }).eq('id', paymentData.customer_id)
            }
          }
        }

        await markPaymentSynced(local_id)
        totalSynced++
      } catch (err) {
        errors.push('Payment sync failed: ' + err.message)
      }
    }

    // Sync quick sales
    const pendingQuickSales = await getPendingQuickSales()
    for (const sale of pendingQuickSales) {
      try {
        const { local_id, synced, ...saleData } = sale
        const { error } = await supabase.from('deliveries').insert([saleData])
        if (error) throw error
        await markQuickSaleSynced(local_id)
        totalSynced++
      } catch (err) {
        errors.push('Quick sale sync failed: ' + err.message)
      }
    }

    const pendingCount = await getPendingCount()
    notifyListeners({ syncing: false, pendingCount, lastSync: new Date().toISOString(), totalSynced })

    return { success: true, totalSynced, errors, pendingCount }
  } catch (error) {
    notifyListeners({ syncing: false, error: error.message })
    return { success: false, error: error.message }
  } finally {
    syncInProgress = false
  }
}

// Auto sync when internet comes back
export function startAutoSync() {
  window.addEventListener('online', async () => {
    console.log('Internet restored — syncing...')
    await syncToServer()
  })

  // Sync every 2 minutes if online
  setInterval(async () => {
    if (navigator.onLine) {
      const count = await getPendingCount()
      if (count > 0) await syncToServer()
    }
  }, 120000)
}