const DB_NAME = 'aquarun_offline'
const DB_VERSION = 2
let db = null

export async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      const stores = ['orders', 'customers', 'rider_profile', 'pending_deliveries', 'pending_expenses', 'pending_payments', 'pending_quicksales']
      stores.forEach(name => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: name === 'orders' || name === 'customers' || name === 'rider_profile' ? 'id' : 'local_id' })
        }
      })
    }
    request.onsuccess = (event) => { db = event.target.result; resolve(db) }
    request.onerror = (event) => reject(event.target.error)
  })
}

function getDB() { return db }

function txPut(storeName, data) {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const req = store.put(data)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

function txGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const req = store.getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

function txDelete(storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const req = store.delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

function txClear(storeName) {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const req = store.clear()
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// ─── ORDERS ────────────────────────────────────────────────────────
export async function saveOrdersOffline(orders) {
  await txClear('orders')
  for (const o of orders) await txPut('orders', o)
}

export async function getOrdersOffline() {
  return await txGetAll('orders')
}

export async function updateOrderStatusOffline(orderId, status) {
  const orders = await txGetAll('orders')
  const order = orders.find(o => o.id === orderId)
  if (order) {
    order.status = status
    order.completed_at = new Date().toISOString()
    await txPut('orders', order)
  }
}

// ─── CUSTOMERS ─────────────────────────────────────────────────────
export async function saveCustomersOffline(customers) {
  await txClear('customers')
  for (const c of customers) await txPut('customers', c)
}

export async function getCustomersOffline() {
  return await txGetAll('customers')
}

export async function updateCustomerBalanceOffline(customerId, newBalance) {
  const customers = await txGetAll('customers')
  const customer = customers.find(c => c.id === customerId)
  if (customer) {
    customer.balance = newBalance
    await txPut('customers', customer)
  }
}

// ─── RIDER PROFILE ─────────────────────────────────────────────────
export async function saveRiderProfile(rider) {
  await txPut('rider_profile', rider)
}

export async function getRiderProfile(riderId) {
  const all = await txGetAll('rider_profile')
  return all.find(r => r.id === riderId) || null
}

// ─── PENDING DELIVERIES ────────────────────────────────────────────
export async function savePendingDelivery(data) {
  const local_id = 'del_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)
  const record = { local_id, ...data }
  await txPut('pending_deliveries', record)
  console.log('Saved pending delivery:', local_id, record)
  return local_id
}

export async function getPendingDeliveries() {
  const all = await txGetAll('pending_deliveries')
  console.log('getPendingDeliveries — all records:', all)
  return all
}

export async function removePendingDelivery(local_id) {
  await txDelete('pending_deliveries', local_id)
}

// ─── PENDING EXPENSES ──────────────────────────────────────────────
export async function savePendingExpense(data) {
  const local_id = 'exp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)
  const record = { local_id, ...data }
  await txPut('pending_expenses', record)
  console.log('Saved pending expense:', local_id)
  return local_id
}

export async function getPendingExpenses() {
  return await txGetAll('pending_expenses')
}

export async function removePendingExpense(local_id) {
  await txDelete('pending_expenses', local_id)
}

// ─── PENDING PAYMENTS ──────────────────────────────────────────────
export async function savePendingPayment(data) {
  const local_id = 'pay_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)
  const record = { local_id, ...data }
  await txPut('pending_payments', record)
  console.log('Saved pending payment:', local_id)
  return local_id
}

export async function getPendingPayments() {
  return await txGetAll('pending_payments')
}

export async function removePendingPayment(local_id) {
  await txDelete('pending_payments', local_id)
}

// ─── PENDING QUICK SALES ───────────────────────────────────────────
export async function savePendingQuickSale(data) {
  const local_id = 'qs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)
  const record = { local_id, ...data }
  await txPut('pending_quicksales', record)
  console.log('Saved pending quick sale:', local_id)
  return local_id
}

export async function getPendingQuickSales() {
  return await txGetAll('pending_quicksales')
}

export async function removePendingQuickSale(local_id) {
  await txDelete('pending_quicksales', local_id)
}

// ─── PENDING COUNT ─────────────────────────────────────────────────
export async function getPendingCount() {
  try {
    const [d, e, p, q] = await Promise.all([
      getPendingDeliveries(),
      getPendingExpenses(),
      getPendingPayments(),
      getPendingQuickSales()
    ])
    const total = d.length + e.length + p.length + q.length
    console.log('getPendingCount:', total, '— del:', d.length, 'exp:', e.length, 'pay:', p.length, 'qs:', q.length)
    return total
  } catch (err) {
    console.error('getPendingCount error:', err)
    return 0
  }
}

// ─── CLEAR ALL ─────────────────────────────────────────────────────
export async function clearAllPending() {
  await txClear('pending_deliveries')
  await txClear('pending_expenses')
  await txClear('pending_payments')
  await txClear('pending_quicksales')
  console.log('Cleared all pending stores')
}