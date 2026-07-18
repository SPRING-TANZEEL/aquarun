// ─── bulkOrderUtils.js ───────────────────────────────────────────
// Pure projection math for bulk order generation.
// No UI, no Supabase calls. Import and use anywhere.

/**
 * Given a customer's order history (array of { delivery_date, qty_19l, qty_half_litre, qty_1_5l }),
 * calculate their average daily consumption rate (in 19L-equivalent bottles).
 * Returns null if not enough data (< 5 orders).
 */
export function calcDailyRate(orderHistory) {
  if (!orderHistory || orderHistory.length < 5) return null

  // Sort ascending by delivery date
  const sorted = [...orderHistory].sort(
    (a, b) => new Date(a.delivery_date) - new Date(b.delivery_date)
  )

  const gaps = []
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].delivery_date)
    const curr = new Date(sorted[i].delivery_date)
    const dayGap = (curr - prev) / (1000 * 60 * 60 * 24)
    const qty = sorted[i - 1].qty_19l || 0  // using 19L as primary unit
    if (dayGap > 0) gaps.push(qty / dayGap)
  }

  if (gaps.length === 0) return null
  const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length
  return +avg.toFixed(3)
}

/**
 * Given last delivery info and daily rate, project customer status for today.
 * Returns: { key, label, daysLeft }
 *
 * key:    'ranout' | 'today' | 'soon' | 'ok' | 'nodata' | 'new'
 * label:  human-readable string
 * daysLeft: number (negative = already overdue) or null
 */
export function getProjection(lastDeliveryDate, lastQty19l, dailyRate, orderCount) {
  // Not enough history
  if (!orderCount || orderCount < 5) {
    return { key: 'new', label: 'No Data', daysLeft: null }
  }

  // Has history but rate couldn't be calculated
  if (!dailyRate || dailyRate <= 0) {
    return { key: 'nodata', label: 'No Data', daysLeft: null }
  }

  // No last delivery on record
  if (!lastDeliveryDate || !lastQty19l) {
    return { key: 'nodata', label: 'No Data', daysLeft: null }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const lastDate = new Date(lastDeliveryDate)
  lastDate.setHours(0, 0, 0, 0)

  const daysAgo = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24))
  const consumed = daysAgo * dailyRate
  const remaining = lastQty19l - consumed
  const daysLeft = +(remaining / dailyRate).toFixed(1)

  if (remaining <= 0) {
    return { key: 'ranout', label: 'Ran Out', daysLeft }
  }
  if (remaining <= dailyRate * 1.2) {
    return { key: 'today', label: 'Needs Today', daysLeft }
  }
  if (remaining <= dailyRate * 2.5) {
    return { key: 'soon', label: 'Needs Soon', daysLeft }
  }
  return { key: 'ok', label: 'Sufficient', daysLeft }
}

/**
 * Format daysLeft into a readable string for the table.
 */
export function formatDaysLeft(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return '—'
  if (daysLeft <= 0) return `${Math.abs(Math.round(daysLeft))}d overdue`
  return `~${daysLeft}d left`
}

/**
 * Given a list of enriched customers, return those that are urgent
 * (Ran Out or Needs Today).
 */
export function getUrgentIds(customers) {
  return customers
    .filter(c => c.projection?.key === 'ranout' || c.projection?.key === 'today')
    .map(c => c.id)
}

/**
 * Filter customers by active tab key.
 */
export function filterByTab(customers, tabKey) {
  if (tabKey === 'all') return customers
  return customers.filter(c => c.projection?.key === tabKey)
}

/**
 * Count customers per projection key. Returns object like:
 * { all: 15, ranout: 2, today: 3, soon: 4, ok: 5, nodata: 1 }
 */
export function countByProjection(customers) {
  const counts = { all: customers.length, ranout: 0, today: 0, soon: 0, ok: 0, nodata: 0, new: 0 }
  customers.forEach(c => {
    const key = c.projection?.key
    if (key && counts[key] !== undefined) counts[key]++
    // merge 'new' into nodata for display
    if (key === 'new') counts.nodata++
  })
  return counts
}
