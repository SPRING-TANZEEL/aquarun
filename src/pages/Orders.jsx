import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'

// ═══════════════════════════════════════════════════════════
// INLINE UTILS — projection for 19L only
// ═══════════════════════════════════════════════════════════

function calcDailyRate(orderHistory) {
  if (!orderHistory || orderHistory.length < 5) return null
  const sorted = [...orderHistory].sort((a, b) => new Date(a.delivery_date) - new Date(b.delivery_date))
  const gaps = []
  for (let i = 1; i < sorted.length; i++) {
    const dayGap = (new Date(sorted[i].delivery_date) - new Date(sorted[i - 1].delivery_date)) / 86400000
    const qty = sorted[i - 1].qty_19l || 0
    if (dayGap > 0 && qty > 0) gaps.push(qty / dayGap)
  }
  if (gaps.length === 0) return null
  return +(gaps.reduce((s, g) => s + g, 0) / gaps.length).toFixed(3)
}

function getProjection(lastDeliveryDate, lastQty19l, dailyRate, orderCount) {
  if (!orderCount || orderCount < 5)
    return { key: 'nodata', label: 'No Data', daysLeft: null }
  if (!dailyRate || dailyRate <= 0 || !lastDeliveryDate || !lastQty19l)
    return { key: 'nodata', label: 'No Data', daysLeft: null }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const last = new Date(lastDeliveryDate); last.setHours(0, 0, 0, 0)
  const daysAgo = Math.floor((today - last) / 86400000)
  const remaining = lastQty19l - daysAgo * dailyRate
  const daysLeft = +(remaining / dailyRate).toFixed(1)
  if (remaining <= 0)              return { key: 'ranout', label: 'Ran Out',     daysLeft }
  if (remaining <= dailyRate * 1.2) return { key: 'today',  label: 'Needs Today', daysLeft }
  if (remaining <= dailyRate * 2.5) return { key: 'soon',   label: 'Needs Soon',  daysLeft }
  return                                  { key: 'ok',     label: 'Sufficient',  daysLeft }
}

function formatDaysLeft(daysLeft) {
  if (daysLeft === null || daysLeft === undefined) return '—'
  if (daysLeft <= 0) return `${Math.abs(Math.round(daysLeft))}d overdue`
  return `~${daysLeft}d left`
}

function countByProjection(customers) {
  const c = { all: customers.length, ranout: 0, today: 0, soon: 0, ok: 0, nodata: 0 }
  customers.forEach(x => { if (c[x.projection?.key] !== undefined) c[x.projection.key]++ })
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
  { key: 'all',    label: 'All'        },
  { key: 'ranout', label: 'Ran Out'    },
  { key: 'today',  label: 'Needs Today'},
  { key: 'soon',   label: 'Needs Soon' },
  { key: 'ok',     label: 'Sufficient' },
  { key: 'nodata', label: 'No Data'    },
]

const TAB_COLORS = {
  all: '#0f4c81', ranout: '#c62828', today: '#e65100',
  soon: '#b45309', ok: '#1a7a4a', nodata: '#64748b'
}

const inp = {
  width: '100%', padding: '10px 12px', border: '1px solid #ddd',
  borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
}

// ═══════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════

function ProjectionBadge({ proj }) {
  if (!proj) return null
  const s = PROJ_STYLE[proj.key] || PROJ_STYLE.nodata
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 20, fontSize: '11px', fontWeight: 600,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, display: 'inline-block', flexShrink: 0 }} />
      {proj.label}
    </span>
  )
}

function StatPill({ label, value, color, bg, onClick, active }) {
  return (
    <div onClick={onClick} style={{
      background: active ? color : bg,
      border: `1px solid ${color}44`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 8, padding: '10px 12px',
      cursor: onClick ? 'pointer' : 'default',
      flex: '1 1 80px', minWidth: 70,
      transition: 'all 0.15s',
    }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: active ? '#fff' : color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: active ? '#ffffffcc' : '#666', marginTop: 2, lineHeight: 1.3 }}>{label}</div>
    </div>
  )
}

function ConfirmModal({ count, qty19l, qtyHalf, qty15l, riderName, onConfirm, onCancel, saving }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      padding: '0 0 env(safe-area-inset-bottom, 0)',
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 20px 28px',
        width: '100%', maxWidth: 480,
        boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
      }}>
        <div style={{ width: 36, height: 4, background: '#ddd', borderRadius: 2, margin: '0 auto 16px' }} />
        <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#1a1a2e' }}>Confirm Bulk Orders</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#888' }}>Review before generating</p>
        <div style={{ background: '#f8f9fa', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
          {[
            ['Customers',      `${count}`],
            ['Rider',          riderName || '—'],
            ['Date',           new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })],
            ['19L Bottles',    `${qty19l}`],
            ...(qtyHalf  > 0 ? [['½ Litre',  `${qtyHalf}`]]  : []),
            ...(qty15l   > 0 ? [['1.5 Litre', `${qty15l}`]]  : []),
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #eee' }}>
              <span style={{ fontSize: 13, color: '#666' }}>{k}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e' }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid #ddd',
            background: '#fff', color: '#555', fontWeight: 600, cursor: 'pointer', fontSize: 14,
          }}>Cancel</button>
          <button onClick={onConfirm} disabled={saving} style={{
            flex: 2, padding: '12px 0', borderRadius: 10, border: 'none',
            background: '#1a7a4a', color: '#fff', fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer', fontSize: 14,
          }}>{saving ? 'Generating...' : `✓ Generate ${count} Orders`}</button>
        </div>
      </div>
    </div>
  )
}

function ResultModal({ created, skipped, onClose, onAnother }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 20px 32px',
        width: '100%', maxWidth: 480, textAlign: 'center',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
      }}>
        <div style={{ width: 36, height: 4, background: '#ddd', borderRadius: 2, margin: '0 auto 20px' }} />
        <div style={{ fontSize: 44, marginBottom: 10 }}>✅</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', marginBottom: 4 }}>{created} Orders Created</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
          {new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
        </div>
        {skipped > 0 && (
          <div style={{
            fontSize: 12, color: '#e65100', background: '#fff3e0',
            border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 12px', marginBottom: 16, textAlign: 'left',
          }}>⚠ {skipped} skipped — already had an order today</div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
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

// Mobile customer card for bulk view
function CustomerCard({ c, isSelected, onToggle }) {
  const s = PROJ_STYLE[c.projection?.key] || PROJ_STYLE.nodata
  return (
    <div onClick={onToggle} style={{
      background: isSelected ? '#e3f0ff' : '#fff',
      border: isSelected ? '1.5px solid #0f4c81' : '1px solid #eee',
      borderRadius: 10, padding: '12px 14px', marginBottom: 8,
      display: 'flex', alignItems: 'center', gap: 12,
      cursor: 'pointer', transition: 'all 0.12s',
    }}>
      <input type="checkbox" checked={isSelected} onChange={onToggle}
        onClick={e => e.stopPropagation()}
        style={{ width: 18, height: 18, flexShrink: 0, accentColor: '#0f4c81' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</p>
          <ProjectionBadge proj={c.projection} />
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
          {c.mobile && <span style={{ fontSize: 11, color: '#888' }}>📱 {c.mobile}</span>}
          {c.lastDeliveryDate
            ? <span style={{ fontSize: 11, color: '#888' }}>🚚 {new Date(c.lastDeliveryDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })}</span>
            : <span style={{ fontSize: 11, color: '#ccc' }}>No deliveries yet</span>}
          {c.projection?.daysLeft !== null && (
            <span style={{ fontSize: 11, fontWeight: 600, color: s.color }}>{formatDaysLeft(c.projection?.daysLeft)}</span>
          )}
        </div>
        <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(c.default_qty_19l || 0) > 0 && <span style={{ fontSize: 10, background: '#e3f0ff', color: '#0f4c81', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>19L × {c.default_qty_19l}</span>}
          {(c.default_qty_half || 0) > 0 && <span style={{ fontSize: 10, background: '#e8f5e9', color: '#1a7a4a', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>½L × {c.default_qty_half}</span>}
          {(c.default_qty_1_5l || 0) > 0 && <span style={{ fontSize: 10, background: '#fff3e0', color: '#e65100', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>1.5L × {c.default_qty_1_5l}</span>}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export default function Orders({ tenantId }) {

  // detect mobile
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  // ── existing state ──
  const [orders, setOrders]             = useState([])
  const [riders, setRiders]             = useState([])
  const [loading, setLoading]           = useState(true)
  const [filter, setFilter]             = useState('pending')
  const [selectedOrders, setSelectedOrders] = useState([])
  const [assignRiderId, setAssignRiderId]   = useState('')
  const [assigning, setAssigning]       = useState(false)
  const [showAddForm, setShowAddForm]   = useState(false)
  const [form, setForm]                 = useState({
    customer_id: '', qty_19l: 0, qty_half_litre: 0, qty_1_5l: 0,
    delivery_date: new Date().toISOString().split('T')[0], notes: ''
  })
  const [saving, setSaving]             = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  // ── bulk state ──
  const [allCustomers, setAllCustomers] = useState([])
  const [bulkLoading, setBulkLoading]   = useState(false)
  const [bulkSearch, setBulkSearch]     = useState('')
  const [bulkTab, setBulkTab]           = useState('all')
  const [bulkSelected, setBulkSelected] = useState(new Set())
  const [bulkRiderId, setBulkRiderId]   = useState('')
  const [showConfirm, setShowConfirm]   = useState(false)
  const [bulkSaving, setBulkSaving]     = useState(false)
  const [bulkResult, setBulkResult]     = useState(null)

  // ── effects ──
  useEffect(() => { if (tenantId) { fetchOrders(); fetchRiders() } }, [filter, tenantId])
  useEffect(() => { if (tenantId && filter === 'bulk') fetchBulkCustomers() }, [tenantId, filter])

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
    const { data } = await supabase.from('riders').select('*').eq('tenant_id', tenantId).eq('is_active', true)
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
    if (selectedOrders.length === 0) return alert('Please select at least one order')
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
    if (form.qty_19l === 0 && form.qty_half_litre === 0 && form.qty_1_5l === 0)
      return alert('Please enter at least one bottle quantity')
    setSaving(true)
    const { error } = await supabase.from('orders').insert([{
      tenant_id: tenantId, customer_id: selectedCustomer.id,
      qty_19l: form.qty_19l, qty_half_litre: form.qty_half_litre, qty_1_5l: form.qty_1_5l,
      delivery_date: form.delivery_date, notes: form.notes, status: 'pending'
    }])
    if (error) { alert('Error: ' + error.message); setSaving(false); return }
    alert('Order created successfully!')
    setShowAddForm(false); setSelectedCustomer(null); setCustomerSearch('')
    setForm({ customer_id: '', qty_19l: 0, qty_half_litre: 0, qty_1_5l: 0, delivery_date: new Date().toISOString().split('T')[0], notes: '' })
    fetchOrders(); setSaving(false)
  }

  // ── bulk functions ──
  async function fetchBulkCustomers() {
    setBulkLoading(true)
    setBulkSelected(new Set())

    const { data: customers } = await supabase
      .from('customers')
      .select('id, full_name, mobile, address, default_qty_19l, default_qty_half, default_qty_1_5l, customer_code')
      .eq('tenant_id', tenantId).eq('is_active', true).order('full_name')

    if (!customers) { setBulkLoading(false); return }

    // fetch only completed 19L order history for projection
    const { data: history } = await supabase
      .from('orders')
      .select('customer_id, delivery_date, qty_19l')
      .eq('tenant_id', tenantId)
      .eq('status', 'completed')
      .gt('qty_19l', 0)
      .order('delivery_date', { ascending: false })

    const histMap = {}
    ;(history || []).forEach(o => {
      if (!histMap[o.customer_id]) histMap[o.customer_id] = []
      histMap[o.customer_id].push(o)
    })

    const enriched = customers.map(c => {
      const hist = histMap[c.id] || []
      const dailyRate = calcDailyRate(hist)
      const last = hist[0]
      const projection = getProjection(last?.delivery_date || null, last?.qty_19l || 0, dailyRate, hist.length)
      return { ...c, orderCount: hist.length, dailyRate, lastDeliveryDate: last?.delivery_date || null, lastQty19l: last?.qty_19l || 0, projection }
    })

    setAllCustomers(enriched)
    setBulkLoading(false)
  }

  const projCounts = useMemo(() => countByProjection(allCustomers), [allCustomers])

  const filteredBulk = useMemo(() => {
    let list = bulkTab === 'all' ? allCustomers : allCustomers.filter(c => c.projection?.key === bulkTab)
    if (bulkSearch) {
      const q = bulkSearch.toLowerCase()
      list = list.filter(c =>
        c.full_name?.toLowerCase().includes(q) ||
        c.mobile?.toLowerCase().includes(q) ||
        c.address?.toLowerCase().includes(q)
      )
    }
    return list
  }, [allCustomers, bulkTab, bulkSearch])

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
    allCustomers.filter(c => c.projection?.key === 'ranout' || c.projection?.key === 'today').forEach(c => n.add(c.id))
    setBulkSelected(n)
  }

  const selectedBulkCustomers = allCustomers.filter(c => bulkSelected.has(c.id))
  const totalBulkQty19l  = selectedBulkCustomers.reduce((s, c) => s + (c.default_qty_19l  || 0), 0)
  const totalBulkQtyHalf = selectedBulkCustomers.reduce((s, c) => s + (c.default_qty_half || 0), 0)
  const totalBulkQty15l  = selectedBulkCustomers.reduce((s, c) => s + (c.default_qty_1_5l || 0), 0)
  const selectedRider    = riders.find(r => r.id === bulkRiderId)

  async function generateOrders() {
    if (!bulkRiderId) return
    setBulkSaving(true)
    const today = new Date().toISOString().split('T')[0]
    const { data: existing } = await supabase
      .from('orders').select('customer_id').eq('tenant_id', tenantId).eq('delivery_date', today)
      .in('customer_id', selectedBulkCustomers.map(c => c.id))
    const alreadyOrdered = new Set((existing || []).map(o => o.customer_id))
    const toCreate = selectedBulkCustomers.filter(c => !alreadyOrdered.has(c.id))
    const skipped  = selectedBulkCustomers.length - toCreate.length
    if (toCreate.length > 0) {
      const { error } = await supabase.from('orders').insert(
        toCreate.map(c => ({
          tenant_id: tenantId, customer_id: c.id, rider_id: bulkRiderId,
          qty_19l: c.default_qty_19l || 0, qty_half_litre: c.default_qty_half || 0, qty_1_5l: c.default_qty_1_5l || 0,
          delivery_date: today, status: 'assigned', assigned_at: new Date().toISOString(), notes: 'Bulk generated',
        }))
      )
      if (error) { alert('Error: ' + error.message); setBulkSaving(false); return }
    }
    setBulkSaving(false); setShowConfirm(false)
    setBulkResult({ created: toCreate.length, skipped })
  }

  function resetBulk() { setBulkSelected(new Set()); setBulkRiderId(''); setBulkResult(null); fetchBulkCustomers() }
  function handleViewOrders() { setBulkResult(null); setFilter('assigned') }

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div>
      {/* Modals */}
      {showConfirm && (
        <ConfirmModal
          count={bulkSelected.size} qty19l={totalBulkQty19l}
          qtyHalf={totalBulkQtyHalf} qty15l={totalBulkQty15l}
          riderName={selectedRider?.full_name || ''}
          onConfirm={generateOrders} onCancel={() => setShowConfirm(false)} saving={bulkSaving}
        />
      )}
      {bulkResult && (
        <ResultModal created={bulkResult.created} skipped={bulkResult.skipped} onClose={handleViewOrders} onAnother={resetBulk} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', color: '#333' }}>Orders</h2>
        {filter !== 'bulk' && (
          <button onClick={() => setShowAddForm(!showAddForm)} style={{
            padding: '10px 20px', background: '#0f4c81', color: 'white',
            border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600'
          }}>{showAddForm ? '✕ Cancel' : '+ New Order'}</button>
        )}
      </div>

      {/* Add Order Form */}
      {showAddForm && filter !== 'bulk' && (
        <div style={{
          background: 'white', borderRadius: '12px', padding: '20px',
          marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #e3f0ff'
        }}>
          <h3 style={{ margin: '0 0 16px', color: '#0f4c81' }}>➕ New Order</h3>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Customer *</label>
            {selectedCustomer ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#e3f0ff', borderRadius: '8px' }}>
                <div>
                  <p style={{ fontWeight: '600', fontSize: '14px', margin: '0 0 2px' }}>{selectedCustomer.full_name}</p>
                  <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>{selectedCustomer.mobile} · {selectedCustomer.customer_code}</p>
                </div>
                <button onClick={() => { setSelectedCustomer(null); setCustomerSearch('') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '18px' }}>✕</button>
              </div>
            ) : (
              <div>
                <input value={customerSearch} onChange={e => searchCustomer(e.target.value)}
                  placeholder="Search by name, mobile, or ID..." style={inp} />
                {customerResults.map(c => (
                  <div key={c.id} onClick={() => { setSelectedCustomer(c); setCustomerResults([]) }}
                    style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', background: 'white' }}>
                    <p style={{ fontWeight: '600', fontSize: '13px', margin: '0 0 2px' }}>{c.full_name}</p>
                    <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{c.mobile} · {c.customer_code}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            {[
              { key: 'qty_19l', label: '19 Litre' },
              { key: 'qty_half_litre', label: 'Half Litre' },
              { key: 'qty_1_5l', label: '1.5 Litre' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                <input type="number" value={form[f.key]}
                  onChange={e => setForm({ ...form, [f.key]: Number(e.target.value) })}
                  min="0" style={inp} />
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Delivery Date</label>
              <input type="date" value={form.delivery_date} onChange={e => setForm({ ...form, delivery_date: e.target.value })} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Notes (optional)</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Any special instructions..." style={inp} />
            </div>
          </div>
          <button onClick={saveOrder} disabled={saving} style={{
            padding: '12px 28px', background: '#1a7a4a', color: 'white',
            border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontWeight: '600', width: isMobile ? '100%' : 'auto'
          }}>{saving ? 'Saving...' : '✓ Create Order'}</button>
        </div>
      )}

      {/* Filter Tabs — scrollable on mobile */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch' }}>
        {[
          { key: 'pending',   label: '⏳ Pending'      },
          { key: 'assigned',  label: '🚴 Assigned'     },
          { key: 'completed', label: '✅ Completed'    },
          { key: 'cancelled', label: '✕ Cancelled'     },
          { key: 'all',       label: '📋 All'           },
          { key: 'bulk',      label: '📦 Bulk Generate' },
        ].map(f => (
          <button key={f.key} onClick={() => { setFilter(f.key); setShowAddForm(false) }}
            style={{
              padding: '8px 14px', border: 'none', borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap',
              background: filter === f.key ? (f.key === 'bulk' ? '#1a7a4a' : '#0f4c81') : '#f0f0f0',
              color: filter === f.key ? 'white' : '#555',
              fontWeight: filter === f.key ? '700' : '400', fontSize: '13px', flexShrink: 0,
            }}>{f.label}</button>
        ))}
      </div>

      {/* ══ BULK GENERATE VIEW ══ */}
      {filter === 'bulk' && (
        <div>
          {bulkLoading ? (
            <p style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading customers...</p>
          ) : (
            <>
              {/* Stat Pills — tap to filter on mobile */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
                {[
                  { key: 'all',    label: 'Total',       color: '#0f4c81', bg: '#e3f0ff' },
                  { key: 'ranout', label: 'Ran Out',      color: '#c62828', bg: '#ffebee' },
                  { key: 'today',  label: 'Needs Today',  color: '#e65100', bg: '#fff3e0' },
                  { key: 'soon',   label: 'Needs Soon',   color: '#b45309', bg: '#fff8e1' },
                  { key: 'ok',     label: 'Sufficient',   color: '#1a7a4a', bg: '#e8f5e9' },
                  { key: 'nodata', label: 'No Data',      color: '#64748b', bg: '#f1f5f9' },
                ].map(s => (
                  <StatPill key={s.key} label={s.label} value={projCounts[s.key] ?? 0}
                    color={s.color} bg={s.bg} active={bulkTab === s.key}
                    onClick={() => setBulkTab(s.key)} />
                ))}
              </div>

              {/* Search + Auto-select */}
              <div style={{
                background: 'white', borderRadius: '10px', padding: '12px',
                marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center'
              }}>
                <input value={bulkSearch} onChange={e => setBulkSearch(e.target.value)}
                  placeholder="Search name, mobile, or address..."
                  style={{ ...inp, flex: 1, minWidth: 160, padding: '9px 12px' }} />
                <button onClick={autoSelectUrgent} style={{
                  padding: '9px 14px', background: '#fff3e0', border: '1px solid #fed7aa',
                  borderRadius: '8px', color: '#c45309', fontSize: '13px', fontWeight: '600',
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}>⚡ Auto-select Urgent</button>
              </div>

              {/* Sub-tabs — pill style, scrollable */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', paddingBottom: 4 }}>
                {BULK_TABS.map(t => {
                  const active = bulkTab === t.key
                  const col = TAB_COLORS[t.key]
                  const cnt = t.key === 'nodata' ? projCounts.nodata : (projCounts[t.key] ?? 0)
                  return (
                    <button key={t.key} onClick={() => setBulkTab(t.key)} style={{
                      padding: '6px 12px', border: active ? `1.5px solid ${col}` : '1px solid #e0e0e0',
                      borderRadius: 20, cursor: 'pointer', fontSize: '12px',
                      fontWeight: active ? 700 : 400,
                      background: active ? col + '18' : '#f8f9fa',
                      color: active ? col : '#666',
                      display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                    }}>
                      {t.label}
                      <span style={{
                        fontSize: 10, fontWeight: 700, minWidth: 16, textAlign: 'center',
                        background: active ? col : '#ddd', color: active ? '#fff' : '#888',
                        padding: '1px 4px', borderRadius: 8,
                      }}>{cnt}</span>
                    </button>
                  )
                })}
              </div>

              {/* Select all row */}
              <div style={{
                background: 'white', borderRadius: 10, padding: '10px 14px', marginBottom: 8,
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                display: 'flex', alignItems: 'center', gap: 10
              }}>
                <input type="checkbox" checked={allBulkChecked}
                  ref={el => { if (el) el.indeterminate = someBulkChecked }}
                  onChange={toggleBulkAll}
                  style={{ width: 17, height: 17, cursor: 'pointer', accentColor: '#0f4c81' }} />
                <span style={{ fontSize: 13, color: '#555' }}>
                  {bulkSelected.size === 0 ? `Select all (${filteredBulk.length} shown)` : `${bulkSelected.size} selected`}
                </span>
                {bulkSelected.size > 0 && (
                  <button onClick={() => setBulkSelected(new Set())}
                    style={{ marginLeft: 'auto', fontSize: 12, color: '#c62828', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Clear
                  </button>
                )}
              </div>

              {/* Customer list — cards on mobile, table on desktop */}
              {isMobile ? (
                <div style={{ marginBottom: bulkSelected.size > 0 ? 90 : 0 }}>
                  {filteredBulk.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center' }}>
                      <p style={{ fontSize: 28, marginBottom: 8 }}>🔍</p>
                      <p style={{ color: '#888', fontSize: 14 }}>No customers match.</p>
                    </div>
                  ) : filteredBulk.map(c => (
                    <CustomerCard key={c.id} c={c} isSelected={bulkSelected.has(c.id)} onToggle={() => toggleBulkOne(c.id)} />
                  ))}
                </div>
              ) : (
                <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'auto', marginBottom: bulkSelected.size > 0 ? 72 : 0 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                    <thead>
                      <tr style={{ background: '#f8f9fa' }}>
                        <th style={{ padding: '11px 16px', width: 40 }}>
                          <input type="checkbox" checked={allBulkChecked}
                            ref={el => { if (el) el.indeterminate = someBulkChecked }}
                            onChange={toggleBulkAll}
                            style={{ width: 15, height: 15, cursor: 'pointer' }} />
                        </th>
                        {['Customer', 'Last 19L Delivery', '19L Rate', 'Projection', 'Est. Days Left', 'Default Qty'].map(h => (
                          <th key={h} style={{
                            padding: '11px 12px', textAlign: 'left', fontSize: '11px',
                            color: '#666', fontWeight: '600', borderBottom: '1px solid #eee', whiteSpace: 'nowrap'
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBulk.length === 0 ? (
                        <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#888' }}>No customers match your filters.</td></tr>
                      ) : filteredBulk.map(c => {
                        const isSel = bulkSelected.has(c.id)
                        const ps = PROJ_STYLE[c.projection?.key] || PROJ_STYLE.nodata
                        return (
                          <tr key={c.id} onClick={() => toggleBulkOne(c.id)}
                            style={{ borderBottom: '1px solid #f0f0f0', background: isSel ? '#f0f7ff' : 'white', cursor: 'pointer' }}>
                            <td style={{ padding: '11px 16px' }}>
                              <input type="checkbox" checked={isSel} onChange={() => toggleBulkOne(c.id)}
                                onClick={e => e.stopPropagation()} style={{ width: 15, height: 15, cursor: 'pointer' }} />
                            </td>
                            <td style={{ padding: '11px 12px' }}>
                              <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 2px', color: '#1a1a2e' }}>{c.full_name}</p>
                              <p style={{ fontSize: 11, color: '#888', margin: 0 }}>{c.mobile}</p>
                              {c.orderCount < 5 && <p style={{ fontSize: 10, color: '#aaa', margin: '2px 0 0' }}>{c.orderCount === 0 ? 'New customer' : `${c.orderCount} orders — building data`}</p>}
                            </td>
                            <td style={{ padding: '11px 12px', fontSize: 13, color: '#555' }}>
                              {c.lastDeliveryDate
                                ? new Date(c.lastDeliveryDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })
                                : '—'}
                            </td>
                            <td style={{ padding: '11px 12px', fontSize: 13, color: '#555' }}>
                              {c.dailyRate ? `${c.dailyRate} btl/day` : '—'}
                            </td>
                            <td style={{ padding: '11px 12px' }}>
                              <ProjectionBadge proj={c.projection} />
                            </td>
                            <td style={{ padding: '11px 12px', fontSize: 13, fontWeight: 600, color: ps.color }}>
                              {formatDaysLeft(c.projection?.daysLeft)}
                            </td>
                            <td style={{ padding: '11px 12px', fontSize: 12 }}>
                              {(c.default_qty_19l || 0) > 0 && <span style={{ display: 'block' }}><span style={{ background: '#e3f0ff', color: '#0f4c81', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>19L × {c.default_qty_19l}</span></span>}
                              {(c.default_qty_half || 0) > 0 && <span style={{ display: 'block', marginTop: 2 }}><span style={{ background: '#e8f5e9', color: '#1a7a4a', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>½L × {c.default_qty_half}</span></span>}
                              {(c.default_qty_1_5l || 0) > 0 && <span style={{ display: 'block', marginTop: 2 }}><span style={{ background: '#fff3e0', color: '#e65100', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>1.5L × {c.default_qty_1_5l}</span></span>}
                              {!(c.default_qty_19l || 0) && !(c.default_qty_half || 0) && !(c.default_qty_1_5l || 0) && <span style={{ color: '#ccc' }}>—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div style={{ padding: '10px 16px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#888' }}>{bulkSelected.size} of {allCustomers.length} customers selected{bulkSelected.size > 0 && ` · 19L: ${totalBulkQty19l}`}</span>
                    {bulkSelected.size > 0 && <button onClick={() => setBulkSelected(new Set())} style={{ fontSize: 12, color: '#c62828', background: 'none', border: 'none', cursor: 'pointer' }}>Clear selection</button>}
                  </div>
                </div>
              )}

              {/* Sticky bottom bar */}
              {bulkSelected.size > 0 && (
                <div style={{
                  position: 'fixed', bottom: 0, left: 0, right: 0,
                  background: '#0f4c81', padding: isMobile ? '12px 16px' : '12px 24px',
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  boxShadow: '0 -4px 20px rgba(0,0,0,0.2)', zIndex: 100,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ color: '#fff', fontWeight: 700, fontSize: isMobile ? 14 : 15 }}>{bulkSelected.size} customers</span>
                    <span style={{ color: '#93c5fd', fontSize: 12, marginLeft: 6 }}>
                      {totalBulkQty19l > 0 && `· ${totalBulkQty19l}×19L `}
                      {totalBulkQtyHalf > 0 && `· ${totalBulkQtyHalf}×½L `}
                      {totalBulkQty15l > 0 && `· ${totalBulkQty15l}×1.5L`}
                    </span>
                  </div>
                  <div style={{ flex: 1 }} />
                  <select value={bulkRiderId} onChange={e => setBulkRiderId(e.target.value)}
                    style={{
                      padding: isMobile ? '8px 10px' : '9px 14px', borderRadius: 8,
                      border: '1px solid #1e40af', background: '#1e3a8a',
                      color: bulkRiderId ? '#fff' : '#93c5fd',
                      fontSize: 13, minWidth: isMobile ? 140 : 200, outline: 'none', cursor: 'pointer'
                    }}>
                    <option value="">Select rider...</option>
                    {riders.map(r => <option key={r.id} value={r.id}>{r.full_name}{r.is_main_rider ? ' ⭐' : ''}</option>)}
                  </select>
                  <button onClick={() => { if (bulkRiderId) setShowConfirm(true) }} disabled={!bulkRiderId}
                    style={{
                      padding: isMobile ? '8px 14px' : '10px 22px', borderRadius: 8, border: 'none',
                      background: bulkRiderId ? '#1a7a4a' : '#1e3a8a',
                      color: bulkRiderId ? '#fff' : '#64748b',
                      fontWeight: 700, fontSize: isMobile ? 13 : 14,
                      cursor: bulkRiderId ? 'pointer' : 'not-allowed',
                    }}>
                    ✓ Generate {bulkSelected.size}
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
              background: 'white', borderRadius: '10px', padding: '12px 16px',
              marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap'
            }}>
              <input type="checkbox"
                checked={selectedOrders.length === orders.length && orders.length > 0}
                onChange={toggleSelectAll}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
              <span style={{ fontSize: '13px', color: '#555' }}>
                {selectedOrders.length === 0 ? 'Select all' : `${selectedOrders.length} selected`}
              </span>
              {selectedOrders.length > 0 && (
                <>
                  <select value={assignRiderId} onChange={e => setAssignRiderId(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none' }}>
                    <option value="">Select Rider...</option>
                    {riders.map(r => <option key={r.id} value={r.id}>{r.full_name}{r.is_main_rider ? ' ⭐' : ''}</option>)}
                  </select>
                  <button onClick={assignOrders} disabled={assigning} style={{
                    padding: '8px 16px', background: '#1a7a4a', color: 'white',
                    border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600'
                  }}>{assigning ? 'Assigning...' : `✓ Assign ${selectedOrders.length} Order${selectedOrders.length > 1 ? 's' : ''}`}</button>
                </>
              )}
            </div>
          )}

          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'auto' }}>
            {loading ? (
              <p style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</p>
            ) : orders.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <p style={{ fontSize: '32px', marginBottom: '8px' }}>📦</p>
                <p style={{ color: '#888', fontSize: '14px' }}>No {filter === 'all' ? '' : filter} orders found.</p>
              </div>
            ) : isMobile ? (
              /* Mobile order cards */
              <div style={{ padding: '8px' }}>
                {orders.map(o => {
                  const s = STATUS_COLORS[o.status] || STATUS_COLORS.pending
                  const isSel = selectedOrders.includes(o.id)
                  return (
                    <div key={o.id} style={{
                      background: isSel ? '#f0f7ff' : '#fff', border: isSel ? '1.5px solid #0f4c81' : '1px solid #eee',
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
                      <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: '#555' }}>
                        <span>
                          {o.qty_19l > 0 && `19L×${o.qty_19l} `}
                          {o.qty_half_litre > 0 && `½L×${o.qty_half_litre} `}
                          {o.qty_1_5l > 0 && `1.5L×${o.qty_1_5l}`}
                        </span>
                        {o.delivery_date && <span>📅 {new Date(o.delivery_date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })}</span>}
                        {o.riders && <span style={{ color: '#0f4c81', fontWeight: 600 }}>🚴 {o.riders.full_name}</span>}
                      </div>
                      {(o.status !== 'completed' && o.status !== 'cancelled') && (
                        <button onClick={() => cancelOrder(o.id)} style={{
                          marginTop: 10, padding: '5px 12px', background: '#ffebee', color: '#c62828',
                          border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600
                        }}>✕ Cancel</button>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              /* Desktop table — unchanged */
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    <th style={{ padding: '12px 16px', width: '40px' }}></th>
                    {['Customer', 'Bottles', 'Delivery Date', 'Assigned Rider', 'Notes', 'Status', 'Action'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: '11px', color: '#666', fontWeight: '600', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>{h}</th>
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
                              style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                          )}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>{o.customers?.full_name}</p>
                          <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{o.customers?.mobile}</p>
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '13px', color: '#555' }}>
                          {o.qty_19l > 0 && <span style={{ display: 'block' }}>19L × {o.qty_19l}</span>}
                          {o.qty_half_litre > 0 && <span style={{ display: 'block' }}>Half × {o.qty_half_litre}</span>}
                          {o.qty_1_5l > 0 && <span style={{ display: 'block' }}>1.5L × {o.qty_1_5l}</span>}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '13px', color: '#555', whiteSpace: 'nowrap' }}>
                          {o.delivery_date ? new Date(o.delivery_date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '13px' }}>
                          {o.riders ? <span style={{ color: '#0f4c81', fontWeight: '600' }}>🚴 {o.riders.full_name}</span> : <span style={{ color: '#ccc' }}>Not assigned</span>}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '12px', color: '#888', maxWidth: '140px' }}>{o.notes || '—'}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{s.label}</span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {o.status !== 'completed' && o.status !== 'cancelled' && (
                            <button onClick={() => cancelOrder(o.id)} style={{ padding: '5px 10px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>✕ Cancel</button>
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
