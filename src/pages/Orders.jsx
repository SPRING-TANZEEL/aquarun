import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'

// ═══════════════════════════════════════════════════════════
// PROJECTION UTILS — based on deliveries table, 19L only
// ═══════════════════════════════════════════════════════════

function calcCustomerStats(deliveries) {
  // deliveries: array of { delivered_at, qty_19l } sorted desc
  if (!deliveries || deliveries.length < 2) return null
  const sorted = [...deliveries]
    .filter(d => d.qty_19l > 0)
    .sort((a, b) => new Date(a.delivered_at) - new Date(b.delivered_at))
  if (sorted.length < 2) return null

  const gaps = [], rates = []
  for (let i = 1; i < sorted.length; i++) {
    const gap = (new Date(sorted[i].delivered_at) - new Date(sorted[i - 1].delivered_at)) / 86400000
    if (gap > 0) {
      gaps.push(gap)
      rates.push(sorted[i - 1].qty_19l / gap)
    }
  }
  if (gaps.length === 0) return null

  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length
  const avgRate = rates.reduce((s, r) => s + r, 0) / rates.length
  const last = sorted[sorted.length - 1]
  return {
    avgGap: +avgGap.toFixed(1),
    avgRate: +avgRate.toFixed(3),
    lastDeliveredAt: last.delivered_at,
    lastQty19l: last.qty_19l,
    totalDeliveries: sorted.length,
  }
}

function getProjection(stats) {
  if (!stats) return { key: 'nodata', label: 'No Data', daysLeft: null, daysAgo: null }
  const today = new Date()
  const last = new Date(stats.lastDeliveredAt)
  const daysAgo = (today - last) / 86400000
  const remaining = stats.lastQty19l - daysAgo * stats.avgRate
  const daysLeft = remaining / stats.avgRate

  if (remaining <= 0)               return { key: 'ranout', label: 'Ran Out',     daysLeft: +daysLeft.toFixed(1), daysAgo: +daysAgo.toFixed(1) }
  if (remaining <= stats.avgRate * 1.2) return { key: 'today',  label: 'Needs Today', daysLeft: +daysLeft.toFixed(1), daysAgo: +daysAgo.toFixed(1) }
  if (remaining <= stats.avgRate * 2.5) return { key: 'soon',   label: 'Needs Soon',  daysLeft: +daysLeft.toFixed(1), daysAgo: +daysAgo.toFixed(1) }
  return                                   { key: 'ok',     label: 'Sufficient',  daysLeft: +daysLeft.toFixed(1), daysAgo: +daysAgo.toFixed(1) }
}

function formatDaysLeft(proj) {
  if (!proj || proj.daysLeft === null) return '—'
  if (proj.daysLeft <= 0) return `${Math.abs(Math.round(proj.daysLeft))}d overdue`
  return `~${proj.daysLeft.toFixed(1)}d left`
}

function countByKey(customers) {
  const c = { all: customers.length, ranout: 0, today: 0, soon: 0, ok: 0, nodata: 0 }
  customers.forEach(x => { if (c[x.proj?.key] !== undefined) c[x.proj.key]++ })
  return c
}

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

const STATUS_COLORS = {
  pending:   { bg: '#fff3e0', color: '#e65100', label: 'Pending'   },
  assigned:  { bg: '#e3f0ff', color: '#0f4c81', label: 'Assigned'  },
  completed: { bg: '#e8f5e9', color: '#1a7a4a', label: 'Completed' },
  cancelled: { bg: '#ffebee', color: '#c62828', label: 'Cancelled' },
}

const PROJ_STYLE = {
  ranout: { bg: '#ffebee', color: '#c62828', border: '#fecaca', dot: '#c62828' },
  today:  { bg: '#fff3e0', color: '#e65100', border: '#fed7aa', dot: '#e65100' },
  soon:   { bg: '#fff8e1', color: '#b45309', border: '#fde68a', dot: '#b45309' },
  ok:     { bg: '#e8f5e9', color: '#1a7a4a', border: '#bbf7d0', dot: '#1a7a4a' },
  nodata: { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0', dot: '#94a3b8' },
}

const BULK_TABS = [
  { key: 'all',    label: 'All'         },
  { key: 'ranout', label: 'Ran Out'     },
  { key: 'today',  label: 'Needs Today' },
  { key: 'soon',   label: 'Needs Soon'  },
  { key: 'ok',     label: 'Sufficient'  },
  { key: 'nodata', label: 'No Data'     },
]

const TAB_COLORS = {
  all: '#0f4c81', ranout: '#c62828', today: '#e65100',
  soon: '#b45309', ok: '#1a7a4a', nodata: '#64748b',
}

const inp = {
  width: '100%', padding: '10px 12px', border: '1px solid #ddd',
  borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
}

// ═══════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════

function ProjBadge({ proj }) {
  if (!proj) return null
  const s = PROJ_STYLE[proj.key] || PROJ_STYLE.nodata
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, display: 'inline-block', flexShrink: 0 }} />
      {proj.label}
    </span>
  )
}

function StatPill({ label, value, color, bg, active, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: active ? color : bg, border: `1px solid ${color}44`,
      borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '10px 12px',
      cursor: 'pointer', flex: '1 1 70px', minWidth: 65, transition: 'all 0.15s',
    }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: active ? '#fff' : color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: active ? '#ffffffcc' : '#666', marginTop: 2, lineHeight: 1.3 }}>{label}</div>
    </div>
  )
}

// Rider assign popup
function RiderPopup({ riders, selectedIds, onConfirm, onCancel, saving, ridersMap }) {
  const [riderId, setRiderId] = useState('')
  const suggested = (() => {
    // find most frequent previous rider among selected customers
    const freq = {}
    selectedIds.forEach(id => {
      const r = ridersMap[id]
      if (r) freq[r] = (freq[r] || 0) + 1
    })
    if (Object.keys(freq).length === 0) return null
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]
  })()

  useEffect(() => { if (suggested && !riderId) setRiderId(suggested) }, [suggested])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 20px 32px',
        width: '100%', maxWidth: 480, boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
      }}>
        <div style={{ width: 36, height: 4, background: '#ddd', borderRadius: 2, margin: '0 auto 18px' }} />
        <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#1a1a2e' }}>Assign Rider</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#888' }}>
          Generating orders for <strong>{selectedIds.length} customers</strong>
        </p>

        {suggested && ridersMap && (
          <div style={{
            background: '#e3f0ff', border: '1px solid #bfdbfe', borderRadius: 8,
            padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#0f4c81',
          }}>
            💡 Previously used rider suggested
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {riders.map(r => (
            <div key={r.id} onClick={() => setRiderId(r.id)} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
              border: riderId === r.id ? '2px solid #0f4c81' : '1px solid #e0e0e0',
              background: riderId === r.id ? '#e3f0ff' : '#fff',
              transition: 'all 0.12s',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: riderId === r.id ? '#0f4c81' : '#f0f0f0',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, color: riderId === r.id ? '#fff' : '#888',
              }}>🚴</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a2e' }}>
                  {r.full_name} {r.is_main_rider ? '⭐' : ''}
                </div>
                {suggested === r.id && (
                  <div style={{ fontSize: 11, color: '#0f4c81', marginTop: 1 }}>Previously assigned to these customers</div>
                )}
              </div>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                border: riderId === r.id ? '6px solid #0f4c81' : '2px solid #ddd',
                background: '#fff', transition: 'all 0.12s',
              }} />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid #ddd',
            background: '#fff', color: '#555', fontWeight: 600, cursor: 'pointer', fontSize: 14,
          }}>Cancel</button>
          <button onClick={() => riderId && onConfirm(riderId)} disabled={!riderId || saving} style={{
            flex: 2, padding: '12px 0', borderRadius: 10, border: 'none',
            background: riderId ? '#1a7a4a' : '#e0e0e0',
            color: riderId ? '#fff' : '#aaa',
            fontWeight: 700, cursor: riderId ? 'pointer' : 'not-allowed', fontSize: 14,
          }}>{saving ? 'Generating...' : `✓ Generate ${selectedIds.length} Orders`}</button>
        </div>
      </div>
    </div>
  )
}

function ResultModal({ created, skipped, riderName, onClose, onAnother }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 20px 36px',
        width: '100%', maxWidth: 480, textAlign: 'center',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
      }}>
        <div style={{ width: 36, height: 4, background: '#ddd', borderRadius: 2, margin: '0 auto 20px' }} />
        <div style={{ fontSize: 44, marginBottom: 10 }}>✅</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', marginBottom: 4 }}>{created} Orders Created</div>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>Assigned to <strong>{riderName}</strong></div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
          {new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
        </div>
        {skipped > 0 && (
          <div style={{
            fontSize: 12, color: '#e65100', background: '#fff3e0',
            border: '1px solid #fed7aa', borderRadius: 8,
            padding: '8px 12px', marginBottom: 16, textAlign: 'left',
          }}>⚠ {skipped} skipped — already had an order today</div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onAnother} style={{
            flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid #ddd',
            background: '#fff', color: '#555', fontWeight: 600, cursor: 'pointer', fontSize: 14,
          }}>New Batch</button>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
            background: '#0f4c81', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14,
          }}>View Orders</button>
        </div>
      </div>
    </div>
  )
}

// Mobile card for bulk view
function CustomerCard({ c, isSelected, onToggle }) {
  const s = PROJ_STYLE[c.proj?.key] || PROJ_STYLE.nodata
  return (
    <div onClick={onToggle} style={{
      background: isSelected ? '#e3f0ff' : '#fff',
      border: isSelected ? '2px solid #0f4c81' : '1px solid #eee',
      borderRadius: 10, padding: '12px 14px', marginBottom: 8,
      display: 'flex', alignItems: 'flex-start', gap: 10,
      cursor: 'pointer', transition: 'all 0.12s',
    }}>
      <input type="checkbox" checked={isSelected} onChange={onToggle}
        onClick={e => e.stopPropagation()}
        style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, accentColor: '#0f4c81' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.full_name}
          </p>
          <ProjBadge proj={c.proj} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap', fontSize: 11, color: '#888' }}>
          {c.mobile && <span>📱 {c.mobile}</span>}
          {c.stats?.lastDeliveredAt
            ? <span>🚚 {new Date(c.stats.lastDeliveredAt).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })}</span>
            : <span style={{ color: '#ccc' }}>No deliveries yet</span>}
          {c.stats && <span>Avg every {c.stats.avgGap}d</span>}
          {c.proj?.daysLeft !== null && (
            <span style={{ fontWeight: 600, color: s.color }}>{formatDaysLeft(c.proj)}</span>
          )}
        </div>
        {c.lastRiderName && (
          <div style={{ marginTop: 4, fontSize: 11, color: '#0f4c81' }}>🚴 Usually: {c.lastRiderName}</div>
        )}
        <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(c.default_qty_19l || 0) > 0 && <span style={{ fontSize: 10, background: '#e3f0ff', color: '#0f4c81', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>19L × {c.default_qty_19l}</span>}
          {(c.default_qty_half || 0) > 0 && <span style={{ fontSize: 10, background: '#e8f5e9', color: '#1a7a4a', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>½L × {c.default_qty_half}</span>}
          {(c.default_qty_1_5l || 0) > 0 && <span style={{ fontSize: 10, background: '#fff3e0', color: '#e65100', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>1.5L × {c.default_qty_1_5l}</span>}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export default function Orders({ tenantId }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  // ── existing order state ──
  const [orders, setOrders]           = useState([])
  const [riders, setRiders]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState('pending')
  const [selectedOrders, setSelectedOrders] = useState([])
  const [assignRiderId, setAssignRiderId]   = useState('')
  const [assigning, setAssigning]     = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm]               = useState({
    customer_id: '', qty_19l: 0, qty_half_litre: 0, qty_1_5l: 0,
    delivery_date: new Date().toISOString().split('T')[0], notes: '',
  })
  const [saving, setSaving]           = useState(false)
  const [customerSearch, setCustomerSearch]   = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  // ── bulk state ──
  const [allCustomers, setAllCustomers] = useState([])
  const [bulkLoading, setBulkLoading]   = useState(false)
  const [bulkSearch, setBulkSearch]     = useState('')
  const [bulkTab, setBulkTab]           = useState('all')
  const [bulkRiderFilter, setBulkRiderFilter] = useState('all')
  const [bulkSelected, setBulkSelected] = useState(new Set())
  const [showRiderPopup, setShowRiderPopup] = useState(false)
  const [bulkSaving, setBulkSaving]     = useState(false)
  const [bulkResult, setBulkResult]     = useState(null)
  // ridersMap: { customer_id -> rider_id } from last delivery
  const [lastRiderMap, setLastRiderMap] = useState({})

  // ── effects ──
  useEffect(() => { if (tenantId) { fetchOrders(); fetchRiders() } }, [filter, tenantId])
  useEffect(() => { if (tenantId && filter === 'bulk') fetchBulkData() }, [tenantId, filter])

  // ── existing functions ──
  async function fetchOrders() {
    setLoading(true)
    let q = supabase
      .from('orders')
      .select('*, customers(full_name, mobile, customer_code, rate_19l, rate_half_litre, rate_1_5l), riders(full_name)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    if (filter !== 'all' && filter !== 'bulk') q = q.eq('status', filter)
    const { data } = await q
    setOrders(data || [])
    setSelectedOrders([])
    setLoading(false)
  }

  async function fetchRiders() {
    const { data } = await supabase.from('riders')
      .select('*').eq('tenant_id', tenantId).eq('is_active', true)
    setRiders(data || [])
  }

  async function searchCustomer(val) {
    setCustomerSearch(val)
    if (val.length < 2) { setCustomerResults([]); return }
    const { data } = await supabase.from('customers').select('*')
      .eq('tenant_id', tenantId).eq('is_active', true)
      .or(`full_name.ilike.%${val}%,mobile.ilike.%${val}%,customer_code.ilike.%${val}%`).limit(5)
    setCustomerResults(data || [])
  }

  function toggleSelectOrder(id) {
    setSelectedOrders(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggleSelectAll() {
    if (selectedOrders.length === orders.length) setSelectedOrders([])
    else setSelectedOrders(orders.map(o => o.id))
  }

  async function assignOrders() {
    if (!assignRiderId) return alert('Please select a rider')
    if (!selectedOrders.length) return alert('Please select at least one order')
    setAssigning(true)
    const { error } = await supabase.from('orders')
      .update({ rider_id: assignRiderId, status: 'assigned', assigned_at: new Date().toISOString() })
      .in('id', selectedOrders).eq('tenant_id', tenantId)
    if (error) { alert('Error: ' + error.message); setAssigning(false); return }
    alert(`${selectedOrders.length} order${selectedOrders.length > 1 ? 's' : ''} assigned successfully!`)
    setSelectedOrders([]); setAssignRiderId(''); fetchOrders(); setAssigning(false)
  }

  async function cancelOrder(id) {
    if (!window.confirm('Cancel this order?')) return
    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', id).eq('tenant_id', tenantId)
    fetchOrders()
  }

  async function saveOrder() {
    if (!selectedCustomer) return alert('Please select a customer')
    if (!form.qty_19l && !form.qty_half_litre && !form.qty_1_5l)
      return alert('Please enter at least one bottle quantity')
    setSaving(true)
    const { error } = await supabase.from('orders').insert([{
      tenant_id: tenantId, customer_id: selectedCustomer.id,
      qty_19l: form.qty_19l, qty_half_litre: form.qty_half_litre, qty_1_5l: form.qty_1_5l,
      delivery_date: form.delivery_date, notes: form.notes, status: 'pending',
    }])
    if (error) { alert('Error: ' + error.message); setSaving(false); return }
    alert('Order created successfully!')
    setShowAddForm(false); setSelectedCustomer(null); setCustomerSearch('')
    setForm({ customer_id: '', qty_19l: 0, qty_half_litre: 0, qty_1_5l: 0, delivery_date: new Date().toISOString().split('T')[0], notes: '' })
    fetchOrders(); setSaving(false)
  }

  // ── bulk data fetch ──
  async function fetchBulkData() {
    setBulkLoading(true)
    setBulkSelected(new Set())

    // 1. All active customers
    const { data: customers } = await supabase
      .from('customers')
      .select('id, full_name, mobile, address, default_qty_19l, default_qty_half, default_qty_1_5l, customer_code')
      .eq('tenant_id', tenantId).eq('is_active', true).order('full_name')

    if (!customers) { setBulkLoading(false); return }

    // 2. All deliveries (not voided) for projection + rider history
    const { data: deliveries } = await supabase
      .from('deliveries')
      .select('customer_id, delivered_at, qty_19l, rider_id')
      .eq('tenant_id', tenantId)
      .eq('is_voided', false)
      .order('delivered_at', { ascending: false })

    // 3. Group deliveries by customer
    const delivMap = {}
    const riderMap = {} // customer_id -> last rider_id
    ;(deliveries || []).forEach(d => {
      if (!delivMap[d.customer_id]) delivMap[d.customer_id] = []
      delivMap[d.customer_id].push(d)
      // first entry per customer is the most recent (sorted desc)
      if (!riderMap[d.customer_id] && d.rider_id) riderMap[d.customer_id] = d.rider_id
    })

    // 4. Build rider name lookup
    const { data: riderList } = await supabase
      .from('riders').select('id, full_name').eq('tenant_id', tenantId)
    const riderNameMap = {}
    ;(riderList || []).forEach(r => { riderNameMap[r.id] = r.full_name })

    // 5. Enrich customers
    const enriched = customers.map(c => {
      const hist = delivMap[c.id] || []
      const stats = calcCustomerStats(hist)
      const proj = getProjection(stats)
      const lastRiderId = riderMap[c.id] || null
      return {
        ...c,
        stats,
        proj,
        deliveryCount: hist.length,
        lastRiderId,
        lastRiderName: lastRiderId ? riderNameMap[lastRiderId] : null,
      }
    })

    setAllCustomers(enriched)
    setLastRiderMap(riderMap)
    setBulkLoading(false)
  }

  // ── bulk derived ──
  const projCounts = useMemo(() => countByKey(allCustomers), [allCustomers])

  const riderOptions = useMemo(() => {
    const used = new Set(Object.values(lastRiderMap))
    return riders.filter(r => used.has(r.id) || true) // show all riders
  }, [riders, lastRiderMap])

  const filteredBulk = useMemo(() => {
    let list = bulkTab === 'all' ? allCustomers : allCustomers.filter(c => c.proj?.key === bulkTab)
    if (bulkRiderFilter !== 'all') {
      list = list.filter(c => c.lastRiderId === bulkRiderFilter)
    }
    if (bulkSearch) {
      const q = bulkSearch.toLowerCase()
      list = list.filter(c =>
        c.full_name?.toLowerCase().includes(q) ||
        c.mobile?.toLowerCase().includes(q) ||
        c.address?.toLowerCase().includes(q)
      )
    }
    return list
  }, [allCustomers, bulkTab, bulkRiderFilter, bulkSearch])

  const allBulkChecked = filteredBulk.length > 0 && filteredBulk.every(c => bulkSelected.has(c.id))
  const someBulkChecked = filteredBulk.some(c => bulkSelected.has(c.id)) && !allBulkChecked

  function toggleBulkAll() {
    const n = new Set(bulkSelected)
    if (allBulkChecked) filteredBulk.forEach(c => n.delete(c.id))
    else filteredBulk.forEach(c => n.add(c.id))
    setBulkSelected(n)
  }
  function toggleBulkOne(id) {
    const n = new Set(bulkSelected)
    n.has(id) ? n.delete(id) : n.add(id)
    setBulkSelected(n)
  }
  function autoSelectUrgent() {
    const n = new Set(bulkSelected)
    allCustomers.filter(c => c.proj?.key === 'ranout' || c.proj?.key === 'today').forEach(c => n.add(c.id))
    setBulkSelected(n)
  }

  const selectedBulkCustomers = allCustomers.filter(c => bulkSelected.has(c.id))
  const totalQty19l  = selectedBulkCustomers.reduce((s, c) => s + (c.default_qty_19l  || 0), 0)
  const totalQtyHalf = selectedBulkCustomers.reduce((s, c) => s + (c.default_qty_half || 0), 0)
  const totalQty15l  = selectedBulkCustomers.reduce((s, c) => s + (c.default_qty_1_5l || 0), 0)

  // ridersMap for popup: customer_id -> rider_id from history
  const selectedRiderHistoryMap = useMemo(() => {
    const m = {}
    selectedBulkCustomers.forEach(c => { if (c.lastRiderId) m[c.id] = c.lastRiderId })
    return m
  }, [bulkSelected, allCustomers])

  async function generateOrders(riderId) {
    setBulkSaving(true)
    const today = new Date().toISOString().split('T')[0]

    // Check already has order today
    const { data: existing } = await supabase
      .from('orders').select('customer_id')
      .eq('tenant_id', tenantId).eq('delivery_date', today)
      .in('customer_id', selectedBulkCustomers.map(c => c.id))

    const alreadyOrdered = new Set((existing || []).map(o => o.customer_id))
    const toCreate = selectedBulkCustomers.filter(c => !alreadyOrdered.has(c.id))
    const skipped  = selectedBulkCustomers.length - toCreate.length

    if (toCreate.length > 0) {
      const { error } = await supabase.from('orders').insert(
        toCreate.map(c => ({
          tenant_id: tenantId,
          customer_id: c.id,
          rider_id: riderId,
          qty_19l: c.default_qty_19l || 0,
          qty_half_litre: c.default_qty_half || 0,
          qty_1_5l: c.default_qty_1_5l || 0,
          delivery_date: today,
          status: 'assigned',
          assigned_at: new Date().toISOString(),
          notes: 'Bulk generated',
        }))
      )
      if (error) { alert('Error: ' + error.message); setBulkSaving(false); return }
    }

    const riderName = riders.find(r => r.id === riderId)?.full_name || ''
    setBulkSaving(false)
    setShowRiderPopup(false)
    setBulkResult({ created: toCreate.length, skipped, riderName })
  }

  function resetBulk() {
    setBulkSelected(new Set()); setBulkResult(null); fetchBulkData()
  }
  function handleViewOrders() { setBulkResult(null); setFilter('assigned') }

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div>
      {/* Rider popup */}
      {showRiderPopup && (
        <RiderPopup
          riders={riders}
          selectedIds={[...bulkSelected]}
          ridersMap={selectedRiderHistoryMap}
          onConfirm={generateOrders}
          onCancel={() => setShowRiderPopup(false)}
          saving={bulkSaving}
        />
      )}
      {bulkResult && (
        <ResultModal
          created={bulkResult.created} skipped={bulkResult.skipped}
          riderName={bulkResult.riderName}
          onClose={handleViewOrders} onAnother={resetBulk}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, color: '#333' }}>Orders</h2>
        {filter !== 'bulk' && (
          <button onClick={() => setShowAddForm(!showAddForm)} style={{
            padding: '10px 20px', background: '#0f4c81', color: 'white',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600,
          }}>{showAddForm ? '✕ Cancel' : '+ New Order'}</button>
        )}
      </div>

      {/* Add Order Form */}
      {showAddForm && filter !== 'bulk' && (
        <div style={{
          background: 'white', borderRadius: 12, padding: 20, marginBottom: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #e3f0ff',
        }}>
          <h3 style={{ margin: '0 0 16px', color: '#0f4c81' }}>➕ New Order</h3>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Customer *</label>
            {selectedCustomer ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#e3f0ff', borderRadius: 8 }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 14, margin: '0 0 2px' }}>{selectedCustomer.full_name}</p>
                  <p style={{ fontSize: 12, color: '#555', margin: 0 }}>{selectedCustomer.mobile} · {selectedCustomer.customer_code}</p>
                </div>
                <button onClick={() => { setSelectedCustomer(null); setCustomerSearch('') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: 18 }}>✕</button>
              </div>
            ) : (
              <div>
                <input value={customerSearch} onChange={e => searchCustomer(e.target.value)}
                  placeholder="Search by name, mobile, or ID..." style={inp} />
                {customerResults.map(c => (
                  <div key={c.id} onClick={() => { setSelectedCustomer(c); setCustomerResults([]) }}
                    style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', background: 'white' }}>
                    <p style={{ fontWeight: 600, fontSize: 13, margin: '0 0 2px' }}>{c.full_name}</p>
                    <p style={{ fontSize: 11, color: '#888', margin: 0 }}>{c.mobile} · {c.customer_code}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
            {[{ key: 'qty_19l', label: '19 Litre' }, { key: 'qty_half_litre', label: 'Half Litre' }, { key: 'qty_1_5l', label: '1.5 Litre' }].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>{f.label}</label>
                <input type="number" value={form[f.key]} min="0"
                  onChange={e => setForm({ ...form, [f.key]: Number(e.target.value) })} style={inp} />
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Delivery Date</label>
              <input type="date" value={form.delivery_date} onChange={e => setForm({ ...form, delivery_date: e.target.value })} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any special instructions..." style={inp} />
            </div>
          </div>
          <button onClick={saveOrder} disabled={saving} style={{
            padding: '12px 28px', background: '#1a7a4a', color: 'white', border: 'none',
            borderRadius: 8, cursor: 'pointer', fontSize: 15, fontWeight: 600,
            width: isMobile ? '100%' : 'auto',
          }}>{saving ? 'Saving...' : '✓ Create Order'}</button>
        </div>
      )}

      {/* Main filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch' }}>
        {[
          { key: 'pending',   label: '⏳ Pending'       },
          { key: 'assigned',  label: '🚴 Assigned'      },
          { key: 'completed', label: '✅ Completed'     },
          { key: 'cancelled', label: '✕ Cancelled'      },
          { key: 'all',       label: '📋 All'            },
          { key: 'bulk',      label: '📦 Bulk Generate'  },
        ].map(f => (
          <button key={f.key} onClick={() => { setFilter(f.key); setShowAddForm(false) }} style={{
            padding: '8px 14px', border: 'none', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
            background: filter === f.key ? (f.key === 'bulk' ? '#1a7a4a' : '#0f4c81') : '#f0f0f0',
            color: filter === f.key ? 'white' : '#555',
            fontWeight: filter === f.key ? 700 : 400, fontSize: 13, flexShrink: 0,
          }}>{f.label}</button>
        ))}
      </div>

      {/* ══ BULK GENERATE VIEW ══ */}
      {filter === 'bulk' && (
        <div>
          {bulkLoading ? (
            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
              <p style={{ color: '#888', fontSize: 14 }}>Loading customers & delivery history...</p>
            </div>
          ) : (
            <>
              {/* Stat pills — tap to filter */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
                {[
                  { key: 'all',    label: 'Total',      color: '#0f4c81', bg: '#e3f0ff' },
                  { key: 'ranout', label: 'Ran Out',    color: '#c62828', bg: '#ffebee' },
                  { key: 'today',  label: 'Needs Today',color: '#e65100', bg: '#fff3e0' },
                  { key: 'soon',   label: 'Needs Soon', color: '#b45309', bg: '#fff8e1' },
                  { key: 'ok',     label: 'Sufficient', color: '#1a7a4a', bg: '#e8f5e9' },
                  { key: 'nodata', label: 'No Data',    color: '#64748b', bg: '#f1f5f9' },
                ].map(s => (
                  <StatPill key={s.key} label={s.label} value={projCounts[s.key] ?? 0}
                    color={s.color} bg={s.bg} active={bulkTab === s.key}
                    onClick={() => { setBulkTab(s.key); setBulkRiderFilter('all') }} />
                ))}
              </div>

              {/* Search + rider filter + auto-select */}
              <div style={{
                background: 'white', borderRadius: 10, padding: 12, marginBottom: 10,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
              }}>
                <input value={bulkSearch} onChange={e => setBulkSearch(e.target.value)}
                  placeholder="Search name, mobile or address..."
                  style={{ ...inp, flex: 1, minWidth: 160, padding: '9px 12px' }} />
                <select value={bulkRiderFilter} onChange={e => setBulkRiderFilter(e.target.value)}
                  style={{ padding: '9px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, color: '#555', outline: 'none', background: '#fff' }}>
                  <option value="all">All Riders</option>
                  {riders.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                </select>
                <button onClick={autoSelectUrgent} style={{
                  padding: '9px 14px', background: '#fff3e0', border: '1px solid #fed7aa',
                  borderRadius: 8, color: '#c45309', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}>⚡ Auto-select Urgent</button>
              </div>

              {/* Projection sub-tabs */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', paddingBottom: 4 }}>
                {BULK_TABS.map(t => {
                  const active = bulkTab === t.key
                  const col = TAB_COLORS[t.key]
                  const cnt = projCounts[t.key] ?? 0
                  return (
                    <button key={t.key} onClick={() => setBulkTab(t.key)} style={{
                      padding: '6px 12px', border: active ? `1.5px solid ${col}` : '1px solid #e0e0e0',
                      borderRadius: 20, cursor: 'pointer', fontSize: 12,
                      fontWeight: active ? 700 : 400,
                      background: active ? col + '18' : '#f8f9fa',
                      color: active ? col : '#666',
                      display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                    }}>
                      {t.label}
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        background: active ? col : '#ddd', color: active ? '#fff' : '#888',
                        padding: '1px 5px', borderRadius: 8, minWidth: 16, textAlign: 'center',
                      }}>{cnt}</span>
                    </button>
                  )
                })}
              </div>

              {/* Select all bar */}
              <div style={{
                background: 'white', borderRadius: 10, padding: '10px 14px', marginBottom: 8,
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <input type="checkbox" checked={allBulkChecked}
                  ref={el => { if (el) el.indeterminate = someBulkChecked }}
                  onChange={toggleBulkAll}
                  style={{ width: 17, height: 17, cursor: 'pointer', accentColor: '#0f4c81' }} />
                <span style={{ fontSize: 13, color: '#555', flex: 1 }}>
                  {bulkSelected.size === 0
                    ? `Select all ${filteredBulk.length} shown`
                    : `${bulkSelected.size} of ${allCustomers.length} selected`}
                </span>
                {bulkSelected.size > 0 && (
                  <button onClick={() => setBulkSelected(new Set())}
                    style={{ fontSize: 12, color: '#c62828', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Clear
                  </button>
                )}
              </div>

              {/* Customer list */}
              {filteredBulk.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', background: 'white', borderRadius: 12 }}>
                  <p style={{ fontSize: 28, marginBottom: 8 }}>🔍</p>
                  <p style={{ color: '#888', fontSize: 14 }}>No customers match your filters.</p>
                </div>
              ) : isMobile ? (
                <div style={{ marginBottom: bulkSelected.size > 0 ? 80 : 0 }}>
                  {filteredBulk.map(c => (
                    <CustomerCard key={c.id} c={c} isSelected={bulkSelected.has(c.id)} onToggle={() => toggleBulkOne(c.id)} />
                  ))}
                </div>
              ) : (
                <div style={{
                  background: 'white', borderRadius: 12,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'auto',
                  marginBottom: bulkSelected.size > 0 ? 72 : 0,
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
                    <thead>
                      <tr style={{ background: '#f8f9fa' }}>
                        <th style={{ padding: '11px 14px', width: 40 }}>
                          <input type="checkbox" checked={allBulkChecked}
                            ref={el => { if (el) el.indeterminate = someBulkChecked }}
                            onChange={toggleBulkAll}
                            style={{ width: 15, height: 15, cursor: 'pointer' }} />
                        </th>
                        {['Customer', 'Last Delivery', 'Avg Gap', '19L Rate', 'Deliveries', 'Usual Rider', 'Projection', 'Days Left', 'Default Qty'].map(h => (
                          <th key={h} style={{
                            padding: '11px 10px', textAlign: 'left', fontSize: 11,
                            color: '#666', fontWeight: 600, borderBottom: '1px solid #eee', whiteSpace: 'nowrap',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBulk.map(c => {
                        const isSel = bulkSelected.has(c.id)
                        const ps = PROJ_STYLE[c.proj?.key] || PROJ_STYLE.nodata
                        return (
                          <tr key={c.id} onClick={() => toggleBulkOne(c.id)}
                            style={{ borderBottom: '1px solid #f0f0f0', background: isSel ? '#f0f7ff' : 'white', cursor: 'pointer' }}>
                            <td style={{ padding: '11px 14px' }}>
                              <input type="checkbox" checked={isSel} onChange={() => toggleBulkOne(c.id)}
                                onClick={e => e.stopPropagation()}
                                style={{ width: 15, height: 15, cursor: 'pointer' }} />
                            </td>
                            <td style={{ padding: '11px 10px' }}>
                              <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 2px', color: '#1a1a2e' }}>{c.full_name}</p>
                              <p style={{ fontSize: 11, color: '#888', margin: 0 }}>{c.mobile}</p>
                              {c.deliveryCount < 5 && (
                                <p style={{ fontSize: 10, color: '#aaa', margin: '2px 0 0' }}>
                                  {c.deliveryCount === 0 ? 'No deliveries yet' : `${c.deliveryCount} deliveries — learning`}
                                </p>
                              )}
                            </td>
                            <td style={{ padding: '11px 10px', fontSize: 12, color: '#555' }}>
                              {c.stats?.lastDeliveredAt
                                ? new Date(c.stats.lastDeliveredAt).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })
                                : '—'}
                            </td>
                            <td style={{ padding: '11px 10px', fontSize: 12, color: '#555' }}>
                              {c.stats ? `${c.stats.avgGap}d` : '—'}
                            </td>
                            <td style={{ padding: '11px 10px', fontSize: 12, color: '#555' }}>
                              {c.stats ? `${c.stats.avgRate.toFixed(2)}/day` : '—'}
                            </td>
                            <td style={{ padding: '11px 10px', fontSize: 12, color: '#555', textAlign: 'center' }}>
                              <span style={{
                                background: '#f0f0f0', color: '#555', borderRadius: 4,
                                padding: '2px 7px', fontSize: 11, fontWeight: 600,
                              }}>{c.deliveryCount}</span>
                            </td>
                            <td style={{ padding: '11px 10px', fontSize: 12 }}>
                              {c.lastRiderName
                                ? <span style={{ color: '#0f4c81', fontWeight: 600 }}>🚴 {c.lastRiderName}</span>
                                : <span style={{ color: '#ccc' }}>—</span>}
                            </td>
                            <td style={{ padding: '11px 10px' }}>
                              <ProjBadge proj={c.proj} />
                            </td>
                            <td style={{ padding: '11px 10px', fontSize: 12, fontWeight: 600, color: ps.color }}>
                              {formatDaysLeft(c.proj)}
                            </td>
                            <td style={{ padding: '11px 10px', fontSize: 11 }}>
                              {(c.default_qty_19l || 0) > 0 && <div><span style={{ background: '#e3f0ff', color: '#0f4c81', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>19L×{c.default_qty_19l}</span></div>}
                              {(c.default_qty_half || 0) > 0 && <div style={{ marginTop: 2 }}><span style={{ background: '#e8f5e9', color: '#1a7a4a', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>½L×{c.default_qty_half}</span></div>}
                              {(c.default_qty_1_5l || 0) > 0 && <div style={{ marginTop: 2 }}><span style={{ background: '#fff3e0', color: '#e65100', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>1.5L×{c.default_qty_1_5l}</span></div>}
                              {!(c.default_qty_19l) && !(c.default_qty_half) && !(c.default_qty_1_5l) && <span style={{ color: '#ccc' }}>—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div style={{ padding: '10px 14px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#888' }}>
                      {bulkSelected.size} of {allCustomers.length} selected
                      {bulkSelected.size > 0 && ` · 19L: ${totalQty19l}${totalQtyHalf > 0 ? ` · ½L: ${totalQtyHalf}` : ''}${totalQty15l > 0 ? ` · 1.5L: ${totalQty15l}` : ''}`}
                    </span>
                    {bulkSelected.size > 0 && (
                      <button onClick={() => setBulkSelected(new Set())}
                        style={{ fontSize: 12, color: '#c62828', background: 'none', border: 'none', cursor: 'pointer' }}>
                        Clear selection
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Sticky bottom bar — only shows when customers selected */}
              {bulkSelected.size > 0 && (
                <div style={{
                  position: 'fixed', bottom: 0, left: 0, right: 0, background: '#0f4c81',
                  padding: isMobile ? '12px 16px' : '14px 24px',
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  boxShadow: '0 -4px 20px rgba(0,0,0,0.2)', zIndex: 100,
                }}>
                  <div>
                    <span style={{ color: '#fff', fontWeight: 700, fontSize: isMobile ? 14 : 15 }}>
                      {bulkSelected.size} customers selected
                    </span>
                    <div style={{ color: '#93c5fd', fontSize: 11, marginTop: 1 }}>
                      {totalQty19l > 0 && `19L: ${totalQty19l}  `}
                      {totalQtyHalf > 0 && `½L: ${totalQtyHalf}  `}
                      {totalQty15l > 0 && `1.5L: ${totalQty15l}`}
                    </div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={() => setShowRiderPopup(true)}
                    style={{
                      padding: isMobile ? '10px 18px' : '11px 28px',
                      borderRadius: 9, border: 'none',
                      background: '#1a7a4a', color: '#fff',
                      fontWeight: 700, fontSize: isMobile ? 13 : 15,
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>
                    ✓ Generate {bulkSelected.size} Orders →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ══ EXISTING ORDERS VIEW ══ */}
      {filter !== 'bulk' && (
        <>
          {(filter === 'pending' || filter === 'assigned' || filter === 'all') && orders.length > 0 && (
            <div style={{
              background: 'white', borderRadius: 10, padding: '12px 16px', marginBottom: 12,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <input type="checkbox"
                checked={selectedOrders.length === orders.length && orders.length > 0}
                onChange={toggleSelectAll}
                style={{ width: 18, height: 18, cursor: 'pointer' }} />
              <span style={{ fontSize: 13, color: '#555' }}>
                {selectedOrders.length === 0 ? 'Select all' : `${selectedOrders.length} selected`}
              </span>
              {selectedOrders.length > 0 && (
                <>
                  <select value={assignRiderId} onChange={e => setAssignRiderId(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, outline: 'none' }}>
                    <option value="">Select Rider...</option>
                    {riders.map(r => <option key={r.id} value={r.id}>{r.full_name}{r.is_main_rider ? ' ⭐' : ''}</option>)}
                  </select>
                  <button onClick={assignOrders} disabled={assigning} style={{
                    padding: '8px 16px', background: '#1a7a4a', color: 'white',
                    border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}>{assigning ? 'Assigning...' : `✓ Assign ${selectedOrders.length} Order${selectedOrders.length > 1 ? 's' : ''}`}</button>
                </>
              )}
            </div>
          )}

          <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'auto' }}>
            {loading ? (
              <p style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading...</p>
            ) : orders.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <p style={{ fontSize: 32, marginBottom: 8 }}>📦</p>
                <p style={{ color: '#888', fontSize: 14 }}>No {filter === 'all' ? '' : filter} orders found.</p>
              </div>
            ) : isMobile ? (
              <div style={{ padding: 8 }}>
                {orders.map(o => {
                  const s = STATUS_COLORS[o.status] || STATUS_COLORS.pending
                  const isSel = selectedOrders.includes(o.id)
                  return (
                    <div key={o.id} style={{
                      background: isSel ? '#f0f7ff' : '#fff',
                      border: isSel ? '2px solid #0f4c81' : '1px solid #eee',
                      borderRadius: 10, padding: '12px 14px', marginBottom: 8,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 0 }}>
                          {(o.status === 'pending' || o.status === 'assigned') && (
                            <input type="checkbox" checked={isSel} onChange={() => toggleSelectOrder(o.id)}
                              style={{ width: 17, height: 17, flexShrink: 0, accentColor: '#0f4c81' }} />
                          )}
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: '#1a1a2e' }}>{o.customers?.full_name}</p>
                            <p style={{ fontSize: 11, color: '#888', margin: '2px 0 0' }}>{o.customers?.mobile}</p>
                          </div>
                        </div>
                        <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, whiteSpace: 'nowrap', flexShrink: 0 }}>{s.label}</span>
                      </div>
                      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: '#555' }}>
                        <span>{[o.qty_19l > 0 && `19L×${o.qty_19l}`, o.qty_half_litre > 0 && `½L×${o.qty_half_litre}`, o.qty_1_5l > 0 && `1.5L×${o.qty_1_5l}`].filter(Boolean).join('  ')}</span>
                        {o.delivery_date && <span>📅 {new Date(o.delivery_date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })}</span>}
                        {o.riders && <span style={{ color: '#0f4c81', fontWeight: 600 }}>🚴 {o.riders.full_name}</span>}
                      </div>
                      {o.status !== 'completed' && o.status !== 'cancelled' && (
                        <button onClick={() => cancelOrder(o.id)} style={{
                          marginTop: 10, padding: '5px 12px', background: '#ffebee', color: '#c62828',
                          border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                        }}>✕ Cancel</button>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    <th style={{ padding: '12px 16px', width: 40 }}></th>
                    {['Customer', 'Bottles', 'Delivery Date', 'Assigned Rider', 'Notes', 'Status', 'Action'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: 11, color: '#666', fontWeight: 600, borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => {
                    const s = STATUS_COLORS[o.status] || STATUS_COLORS.pending
                    const isSel = selectedOrders.includes(o.id)
                    return (
                      <tr key={o.id} style={{ borderBottom: '1px solid #f0f0f0', background: isSel ? '#f0f7ff' : 'white' }}>
                        <td style={{ padding: '12px 16px' }}>
                          {(o.status === 'pending' || o.status === 'assigned') && (
                            <input type="checkbox" checked={isSel} onChange={() => toggleSelectOrder(o.id)}
                              style={{ width: 16, height: 16, cursor: 'pointer' }} />
                          )}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 2px' }}>{o.customers?.full_name}</p>
                          <p style={{ fontSize: 11, color: '#888', margin: 0 }}>{o.customers?.mobile}</p>
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: '#555' }}>
                          {o.qty_19l > 0 && <span style={{ display: 'block' }}>19L × {o.qty_19l}</span>}
                          {o.qty_half_litre > 0 && <span style={{ display: 'block' }}>Half × {o.qty_half_litre}</span>}
                          {o.qty_1_5l > 0 && <span style={{ display: 'block' }}>1.5L × {o.qty_1_5l}</span>}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 13, color: '#555', whiteSpace: 'nowrap' }}>
                          {o.delivery_date ? new Date(o.delivery_date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 13 }}>
                          {o.riders ? <span style={{ color: '#0f4c81', fontWeight: 600 }}>🚴 {o.riders.full_name}</span> : <span style={{ color: '#ccc' }}>Not assigned</span>}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: 12, color: '#888', maxWidth: 140 }}>{o.notes || '—'}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{s.label}</span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {o.status !== 'completed' && o.status !== 'cancelled' && (
                            <button onClick={() => cancelOrder(o.id)} style={{ padding: '5px 10px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✕ Cancel</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}