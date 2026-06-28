// ─── OFFLINE DATABASE ───────────────────────────────────────────────
// Uses IndexedDB to store data locally on rider's phone

const DB_NAME = 'aquarun_offline'
const DB_VERSION = 1

let db = null

export async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = event.target.result

      // Store for today's orders
      if (!db.objectStoreNames.contains('orders')) {
        const ordersStore = db.createObjectStore('orders', { keyPath: 'id' })
        ordersStore.createIndex('status', 'status', { unique: false })
        ordersStore.createIndex('rider_id', 'rider_id', { unique: false })
      }

      // Store for customers
      if (!db.objectStoreNames.contains('customers')) {
        db.createObjectStore('customers', { keyPath: 'id' })
      }

      // Store for pending deliveries (not yet synced)
      if (!db.objectStoreNames.contains('pending_deliveries')) {
        const store = db.createObjectStore('pending_deliveries', { keyPath: 'local_id' })
        store.createIndex('synced', 'synced', { unique: false })
      }

      // Store for pending expenses
      if (!db.objectStoreNames.contains('pending_expenses')) {
        db.createObjectStore('pending_expenses', { keyPath: 'local_id' })
      }

      // Store for pending payments
      if (!db.objectStoreNames.contains('pending_payments')) {
        db.createObjectStore('pending_payments', { keyPath: 'local_id' })
      }

      // Store for pending quick sales
      if (!db.objectStoreNames.contains('pending_quicksales')) {
        db.createObjectStore('pending_quicksales', { keyPath: 'local_id' })
      }

      // Store for rider profile
      if (!db.objectStoreNames.contains('rider_profile')) {
        db.createObjectStore('rider_profile', { keyPath: 'id' })
      }

      // Store for sync log
      if (!db.objectStoreNames.contains('sync_log')) {
        db.createObjectStore('sync_log', { keyPath: 'id', autoIncrement: true })
      }
    }

    request.onsuccess = (event) => {
      db = event.target.result
      resolve(db)
    }

    request.onerror = (event) => {
      reject(event.target.error)
    }
  })
}

function getDB() {
  if (!db) throw new Error('Database not initialized')
  return db
}

// ─── GENERIC HELPERS ───────────────────────────────────────────────

function put(storeName, data) {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const request = store.put(data)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function getAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function deleteRecord(storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const request = store.delete(key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

function clearStore(storeName) {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    const request = store.clear()
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

// ─── ORDERS ────────────────────────────────────────────────────────

export async function saveOrdersOffline(orders) {
  await clearStore('orders')
  for (const order of orders) {
    await put('orders', order)
  }
}

export async function getOrdersOffline() {
  return await getAll('orders')
}

export async function updateOrderStatusOffline(orderId, status) {
  const tx = getDB().transaction('orders', 'readwrite')
  const store = tx.objectStore('orders')
  return new Promise((resolve, reject) => {
    const getReq = store.get(orderId)
    getReq.onsuccess = () => {
      const order = getReq.result
      if (order) {
        order.status = status
        order.completed_at = new Date().toISOString()
        store.put(order)
      }
      resolve()
    }
    getReq.onerror = () => reject(getReq.error)
  })
}

// ─── CUSTOMERS ─────────────────────────────────────────────────────

export async function saveCustomersOffline(customers) {
  await clearStore('customers')
  for (const customer of customers) {
    await put('customers', customer)
  }
}

export async function getCustomersOffline() {
  return await getAll('customers')
}

export async function updateCustomerBalanceOffline(customerId, newBalance) {
  const tx = getDB().transaction('customers', 'readwrite')
  const store = tx.objectStore('customers')
  return new Promise((resolve, reject) => {
    const getReq = store.get(customerId)
    getReq.onsuccess = () => {
      const customer = getReq.result
      if (customer) {
        customer.balance = newBalance
        store.put(customer)
      }
      resolve()
    }
    getReq.onerror = () => reject(getReq.error)
  })
}

// ─── PENDING DELIVERIES ────────────────────────────────────────────

export async function savePendingDelivery(delivery) {
  const local_id = 'delivery_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  await put('pending_deliveries', { ...delivery, local_id, synced: false, created_at: new Date().toISOString() })
  return local_id
}

export async function getPendingDeliveries() {
  const all = await getAll('pending_deliveries')
  return all.filter(d => !d.synced)
}

export async function markDeliverySynced(local_id) {
  const tx = getDB().transaction('pending_deliveries', 'readwrite')
  const store = tx.objectStore('pending_deliveries')
  return new Promise((resolve, reject) => {
    const getReq = store.get(local_id)
    getReq.onsuccess = () => {
      const record = getReq.result
      if (record) {
        record.synced = true
        store.put(record)
      }
      resolve()
    }
    getReq.onerror = () => reject(getReq.error)
  })
}

// ─── PENDING EXPENSES ──────────────────────────────────────────────

export async function savePendingExpense(expense) {
  const local_id = 'expense_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  await put('pending_expenses', { ...expense, local_id, synced: false, created_at: new Date().toISOString() })
  return local_id
}

export async function getPendingExpenses() {
  const all = await getAll('pending_expenses')
  return all.filter(e => !e.synced)
}

export async function markExpenseSynced(local_id) {
  const tx = getDB().transaction('pending_expenses', 'readwrite')
  const store = tx.objectStore('pending_expenses')
  return new Promise((resolve, reject) => {
    const getReq = store.get(local_id)
    getReq.onsuccess = () => {
      const record = getReq.result
      if (record) {
        record.synced = true
        store.put(record)
      }
      resolve()
    }
    getReq.onerror = () => reject(getReq.error)
  })
}

// ─── PENDING PAYMENTS ──────────────────────────────────────────────

export async function savePendingPayment(payment) {
  const local_id = 'payment_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  await put('pending_payments', { ...payment, local_id, synced: false, created_at: new Date().toISOString() })
  return local_id
}

export async function getPendingPayments() {
  const all = await getAll('pending_payments')
  return all.filter(p => !p.synced)
}

export async function markPaymentSynced(local_id) {
  const tx = getDB().transaction('pending_payments', 'readwrite')
  const store = tx.objectStore('pending_payments')
  return new Promise((resolve, reject) => {
    const getReq = store.get(local_id)
    getReq.onsuccess = () => {
      const record = getReq.result
      if (record) {
        record.synced = true
        store.put(record)
      }
      resolve()
    }
    getReq.onerror = () => reject(getReq.error)
  })
}

// ─── PENDING QUICK SALES ───────────────────────────────────────────

export async function savePendingQuickSale(sale) {
  const local_id = 'quicksale_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  await put('pending_quicksales', { ...sale, local_id, synced: false, created_at: new Date().toISOString() })
  return local_id
}

export async function getPendingQuickSales() {
  const all = await getAll('pending_quicksales')
  return all.filter(s => !s.synced)
}

export async function markQuickSaleSynced(local_id) {
  const tx = getDB().transaction('pending_quicksales', 'readwrite')
  const store = tx.objectStore('pending_quicksales')
  return new Promise((resolve, reject) => {
    const getReq = store.get(local_id)
    getReq.onsuccess = () => {
      const record = getReq.result
      if (record) {
        record.synced = true
        store.put(record)
      }
      resolve()
    }
    getReq.onerror = () => reject(getReq.error)
  })
}

// ─── RIDER PROFILE ─────────────────────────────────────────────────

export async function saveRiderProfile(rider) {
  await put('rider_profile', rider)
}

export async function getRiderProfile(riderId) {
  const all = await getAll('rider_profile')
  return all.find(r => r.id === riderId) || null
}

// ─── SYNC STATUS ───────────────────────────────────────────────────

export async function getPendingCount() {
  const [deliveries, expenses, payments, quicksales] = await Promise.all([
    getPendingDeliveries(),
    getPendingExpenses(),
    getPendingPayments(),
    getPendingQuickSales()
  ])
  return deliveries.length + expenses.length + payments.length + quicksales.length
}