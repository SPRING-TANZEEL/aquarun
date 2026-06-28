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

    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*, customers(full_name, mobile, customer_code, balance, rate_19l, rate_half_litre, rate_1_5l, own_bottles, our_bottles_placed)')
      .eq('rider_id', rider.id)
      .eq('status', 'assigned')
      .lte('delivery_date', today)

    if (ordersError) throw ordersError
    if (orders) await saveOrdersOffline(orders)

    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('*')
      .eq('is_active', true)
      .order('full_name')

    if (customersError) throw customersError
    if (customers) await saveCustomersOffline(customers)

    await saveRiderProfile(rider)

    return {
      success: true,
      ordersCount: orders?.length || 0,
      customersCount: customers?.length || 0
    }
  } catch (error) {
    console.error('Download failed:', error)
    return { success: false, error: error.message }
  }
}

export async function syncToServer() {
  if (syncInProgress) return { success: false, message: 'Sync already in progress' }
  if (!navigator.onLine) return { success: false, message: 'No internet connection' }

  syncInProgress = true
  notifyListeners({ syncing: true })

  let totalSynced = 0
  let errors = []

  try {
    // ── Sync Deliveries ──
    const pendingDeliveries = await getPendingDeliveries()
    console.log('Pending deliveries to sync:', pendingDeliveries.length)

    for (const delivery of pendingDeliveries) {
      try {
        const { local_id, synced, ...deliveryData } = delivery

        // Remove undefined fields
        const cleanData = Object.fromEntries(
          Object.entries(deliveryData).filter(([_, v]) => v !== undefined)
        )

        const { data: inserted, error } = await supabase
          .from('deliveries')
          .insert([cleanData])
          .select()

        if (error) {
          console.error('Delivery insert error:', error)
          errors.push('Delivery: ' + error.message)
          continue
        }

        // Update order status if linked
        if (cleanData.order_id) {
          await supabase.from('orders').update({
            status: 'completed',
            completed_at: cleanData.delivered_at || new Date().toISOString()
          }).eq('id', cleanData.order_id)
        }

        // Update customer balance
        if (cleanData.customer_id && Number(cleanData.credit_amount) > 0) {
          const { data: customer } = await supabase
            .from('customers')
            .select('balance')
            .eq('id', cleanData.customer_id)
            .single()
          if (customer) {
            await supabase.from('customers').update({
              balance: Number(customer.balance) + Number(cleanData.credit_amount)
            }).eq('id', cleanData.customer_id)
          }
        }

        await markDeliverySynced(local_id)
        totalSynced++
        console.log('Delivery synced:', local_id)
      } catch (err) {
        console.error('Delivery sync error:', err)
        errors.push('Delivery error: ' + err.message)
      }
    }

    // ── Sync Expenses ──
    const pendingExpenses = await getPendingExpenses()
    console.log('Pending expenses to sync:', pendingExpenses.length)

    for (const expense of pendingExpenses) {
      try {
        const { local_id, synced, ...expenseData } = expense
        const cleanData = Object.fromEntries(
          Object.entries(expenseData).filter(([_, v]) => v !== undefined)
        )
        const { error } = await supabase.from('expenses').insert([cleanData])
        if (error) {
          errors.push('Expense: ' + error.message)
          continue
        }
        await markExpenseSynced(local_id)
        totalSynced++
      } catch (err) {
        errors.push('Expense error: ' + err.message)
      }
    }

    // ── Sync Payments ──
    const pendingPayments = await getPendingPayments()
    console.log('Pending payments to sync:', pendingPayments.length)

    for (const payment of pendingPayments) {
      try {
        const { local_id, synced, ...paymentData } = payment
        const cleanData = Object.fromEntries(
          Object.entries(paymentData).filter(([_, v]) => v !== undefined)
        )
        const { error } = await supabase.from('payments').insert([cleanData])
        if (error) {
          errors.push('Payment: ' + error.message)
          continue
        }

        // Update customer balance for cash payments
        if (cleanData.customer_id && cleanData.payment_method === 'cash') {
          const { data: customer } = await supabase
            .from('customers')
            .select('balance')
            .eq('id', cleanData.customer_id)
            .single()
          if (customer) {
            await supabase.from('customers').update({
              balance: Number(customer.balance) - Number(cleanData.amount)
            }).eq('id', cleanData.customer_id)
          }
        }

        await markPaymentSynced(local_id)
        totalSynced++
      } catch (err) {
        errors.push('Payment error: ' + err.message)
      }
    }

    // ── Sync Quick Sales ──
    const pendingQuickSales = await getPendingQuickSales()
    console.log('Pending quick sales to sync:', pendingQuickSales.length)

    for (const sale of pendingQuickSales) {
      try {
        const { local_id, synced, ...saleData } = sale
        const cleanData = Object.fromEntries(
          Object.entries(saleData).filter(([_, v]) => v !== undefined)
        )
        const { error } = await supabase.from('deliveries').insert([cleanData])
        if (error) {
          errors.push('Quick sale: ' + error.message)
          continue
        }
        await markQuickSaleSynced(local_id)
        totalSynced++
      } catch (err) {
        errors.push('Quick sale error: ' + err.message)
      }
    }

    const pendingCount = await getPendingCount()
    notifyListeners({ syncing: false, pendingCount, lastSync: new Date().toISOString(), totalSynced })

    console.log('Sync complete. Synced:', totalSynced, 'Errors:', errors)

    return { success: true, totalSynced, errors, pendingCount }

  } catch (error) {
    console.error('Sync failed:', error)
    notifyListeners({ syncing: false, error: error.message })
    return { success: false, error: error.message }
  } finally {
    syncInProgress = false
  }
}

export function startAutoSync() {
  window.addEventListener('online', async () => {
    console.log('Internet restored — auto syncing...')
    await syncToServer()
  })

  setInterval(async () => {
    if (navigator.onLine) {
      const count = await getPendingCount()
      if (count > 0) {
        console.log('Auto sync — pending count:', count)
        await syncToServer()
      }
    }
  }, 30000)
}