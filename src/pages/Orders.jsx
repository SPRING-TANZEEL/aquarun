import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'
import {
  calcDailyRate, getProjection, formatDaysLeft, getUrgentIds, filterByTab, countByProjection
} from '../utils/bulkOrderUtils'

// ─── Constants ────────────────────────────────────────────────────

const STATUS_COLORS = {
  pending:   { bg: '#fff3e0', color: '#e65100',  label: 'Pending'   },
  assigned:  { bg: '#e3f0ff', color: '#0f4c81',  label: 'Assigned'  },
  completed: { bg: '#e8f5e9', color: '#1a7a4a',  label: 'Completed' },
  cancelled: { bg: '#ffebee', color: '#c62828',  label: 'Cancelled' },
}

const PROJ_STYLE = {
  ranout: { bg: '#ffebee', color: '#c62828', border: '#fecaca', dot: '#c62828' },
  today:  { bg: '#fff3e0', color: '#e65100', border: '#fed7aa', dot: '#e65100' },
  soon:   { bg: '#fff8e1', color: '#b45309', border: '#fde68a', dot: '#b45309' },
  ok:     { bg: '#e8f5e9', color: '#1a7a4a', border: '#bbf7d0', dot: '#1a7a4a' },
  nodata: { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0', dot: '#94a3b8' },
  new:    { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0', dot: '#94a3b8' },
}

const BULK_TABS = [
  { key: 'all',    label: 'All Customers' },
  { key: 'ranout', label: '● Ran Out'     },
  { key: 'today',  label: '● Needs Today' },
  { key: 'soon',   label: '● Needs Soon'  },
  { key: 'ok',     label: '● Sufficient'  },
  { key: 'nodata', label: '○ No Data'     },
]

const inp = {
  width: '100%', padding: '10px 12px', border: '1px solid #ddd',
  borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
}

// ─── Small Components ─────────────────────────────────────────────

function ProjectionBadge({ proj }) {
  if (!proj) return null
  const key = proj.key === 'new' ? 'nodata' : proj.key
  const s = PROJ_STYLE[key] || PROJ_STYLE.nodata
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 20, fontSize: '11px', fontWeight: 600,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, display: 'inline-block', flexShrink: 0 }} />
      {proj.label}
    </span>
  )
}

function StatPill({ label, value, color, bg }) {
  return (
    <div style={{
      background: bg, border: `1px solid ${color}33`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 8, padding: '10px 14px', minWidth: 100,
    }}>
      <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function ConfirmModal({ count, qty19l, qtyHalf, qty15l, riderName, onConfirm, onCancel, saving }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 28, width: 340,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)', border: '1px solid #e0e0e0',
      }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#1a1a2e' }}>Confirm Bulk Orders</h3>
        <p style={{ margin: '0 0 18px', fontSize: 12, color: '#888' }}>Review before generating</p>
        <div style={{ background: '#f8f9fa', borderRadius: 8, padding: '12px 14px', marginBottom: 20 }}>
          {[
            ['Customers',      `${count}`],
            ['Assigned Rider', riderName || '—'],
            ['Delivery Date',  new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })],
            ['19L Bottles',    `${qty19l}`],
            ['½ Litre',        `${qtyHalf}`],
            ['1.5 Litre',      `${qty15l}`],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #eee' }}>
              <span style={{ fontSize: 12, color: '#666' }}>{k}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e' }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid #ddd',
            background: '#fff', color: '#555', fontWeight: 600, cursor: 'pointer', fontSize: 13,
          }}>Cancel</button>
          <button onClick={onConfirm} disabled={saving} style={{
            flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
            background: '#1a7a4a', color: '#fff', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13,
          }}>{saving ? 'Generating...' : `✓ Generate ${count} Orders`}</button>
        </div>
      </div>
    </div>
  )
}

function ResultModal({ created, skipped, onClose, onAnother }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 28, width: 340, textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1a2e', marginBottom: 4 }}>{created} Orders Created</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
          {new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
        </div>
        {skipped > 0 && (
          <div style={{
            fontSize: 12, color: '#e65100', background: '#fff3e0',
            border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 12px', marginBottom: 16, textAlign: 'left',
          }}>
            ⚠ {skipped} skipped — already had an order today
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onAnother} style={{
            flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid #ddd',
            background: '#fff', color: '#555', fontWeight: 600, cursor: 'pointer', fontSize: 12,
          }}>New Batch</button>
          <button onClick={onClose} style={{
            flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
            background: '#0f4c81', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12,
          }}>View Orders</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────

export default function Orders({ tenantId }) {

  // ── Existing state ──
  const [orders, setOrders]               = useState([])
  const [riders, setRiders]               = useState([])
  const [loading, setLoading]             = useState(true)
  const [filter, setFilter]               = useState('pending')
  const [selectedOrders, setSelectedOrders] = useState([])
  const [assignRiderId, setAssignRiderId] = useState('')
  const [assigning, setAssigning]         = useState(false)
  const [showAddForm, setShowAddForm]     = useState(false)
  const [form, setForm]                   = useState({
    customer_id: '', qty_19l: 0, qty_half_litre: 0,
    qty_1_5l: 0, delivery_date: new Date().toISOString().split('T')[0], notes: ''
  })
  const [saving, setSaving]               = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  // ── Bulk Generate state ──
  const [allCustomers, setAllCustomers]   = useState([])   // enriched with projection
  const [bulkLoading, setBulkLoading]     = useState(false)
  const [bulkSearch, setBulkSearch]       = useState('')
  const [bulkArea, setBulkArea]           = useState('All Areas')
  const [bulkTab, setBulkTab]             = useState('all')
  const [bulkSelected, setBulkSelected]   = useState(new Set())
  const [bulkRiderId, setBulkRiderId]     = useState('')
  const [showConfirm, setShowConfirm]     = useState(false)
  const [bulkSaving, setBulkSaving]       = useState(false)
  const [bulkResult, setBulkResult]       = useState(null)  // { created, skipped }

  // ── Effects ──
  useEffect(() => {
    if (tenantId) { fetchOrders(); fetchRiders() }
  }, [filter, tenantId])

  useEffect(() => {
    if (tenantId && filter === 'bulk') fetchBulkCustomers()
  }, [tenantId, filter])

  // ── Existing fetch functions ──
  async function fetchOrders() {
    setLoading(true)
    let query = supabase
      .from('orders')
      .select('*, customers(full_name, mobile, customer_code, rate_19l, rate_half_litre, rate_1_5l), riders(full_name)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    if (filter !== 'all' && filter !== 'bulk') query = query.eq('status', filter)
    const { data } = await query
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

  // ── Bulk Generate functions ──
  async function fetchBulkCustomers() {
    setBulkLoading(true)
    setBulkSelected(new Set())

    // 1. Fetch all active customers
    const { data: customers } = await supabase
      .from('customers')
      .select('id, full_name, address, default_qty_19l, default_qty_half, default_qty_1_5l, customer_code, mobile')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('full_name')

    if (!customers) { setBulkLoading(false); return }

    // 2. Fetch all order history for projection calculation
    const { data: orderHistory } = await supabase
      .from('orders')
      .select('customer_id, delivery_date, qty_19l, qty_half_litre, qty_1_5l')
      .eq('tenant_id', tenantId)
      .eq('status', 'completed')
      .order('delivery_date', { ascending: false })

    const historyMap = {}
    ;(orderHistory || []).forEach(o => {
      if (!historyMap[o.customer_id]) historyMap[o.customer_id] = []
      historyMap[o.customer_id].push(o)
    })

    // 3. Enrich each customer with projection
    const enriched = customers.map(c => {
      const history = historyMap[c.id] || []
      const orderCount = history.length
      const dailyRate = calcDailyRate(history)
      const last = history[0]  // most recent (already sorted desc)
      const lastDeliveryDate = last?.delivery_date || null
      const lastQty = last?.qty_19l || 0
      const projection = getProjection(lastDeliveryDate, lastQty, dailyRate, orderCount)

      return {
        ...c,
        orderCount,
        dailyRate,
        lastDeliveryDate,
        lastQty,
        projection,
        // address already in ...c spread
      }
    })

    setAllCustomers(enriched)
    setBulkLoading(false)
  }

  // ── Bulk derived data ──
  const areas = useMemo(() => ['All Areas', ...new Set(allCustomers.map(c => c.address).filter(Boolean))], [allCustomers])

  const projCounts = useMemo(() => countByProjection(allCustomers), [allCustomers])

  const filteredBulk = useMemo(() => {
    let list = filterByTab(allCustomers, bulkTab)
    if (bulkArea !== 'All Areas') list = list.filter(c => c.address === bulkArea)
    if (bulkSearch) {
      const q = bulkSearch.toLowerCase()
      list = list.filter(c => c.full_name?.toLowerCase().includes(q) || c.address?.toLowerCase().includes(q) || c.mobile?.toLowerCase().includes(q))
    }
    return list
  }, [allCustomers, bulkTab, bulkArea, bulkSearch])

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
    const urgentIds = getUrgentIds(allCustomers)
    const n = new Set(bulkSelected)
    urgentIds.forEach(id => n.add(id))
    setBulkSelected(n)
  }

  const selectedBulkCustomers = allCustomers.filter(c => bulkSelected.has(c.id))
  const totalBulkQty19l = selectedBulkCustomers.reduce((s, c) => s + (c.default_qty_19l || 0), 0)
  const totalBulkQtyHalf = selectedBulkCustomers.reduce((s, c) => s + (c.default_qty_half || 0), 0)
  const totalBulkQty15l = selectedBulkCustomers.reduce((s, c) => s + (c.default_qty_1_5l || 0), 0)
  const totalBulkQty = totalBulkQty19l // used in confirm modal for 19L
  const selectedRider = riders.find(r => r.id === bulkRiderId)

  async function generateOrders() {
    if (!bulkRiderId) return
    setBulkSaving(true)

    const today = new Date().toISOString().split('T')[0]

    // Check which customers already have an order today
    const { data: existing } = await supabase
      .from('orders')
      .select('customer_id')
      .eq('tenant_id', tenantId)
      .eq('delivery_date', today)
      .in('customer_id', selectedBulkCustomers.map(c => c.id))

    const alreadyOrdered = new Set((existing || []).map(o => o.customer_id))
    const toCreate = selectedBulkCustomers.filter(c => !alreadyOrdered.has(c.id))
    const skipped = selectedBulkCustomers.length - toCreate.length

    if (toCreate.length > 0) {
      const rows = toCreate.map(c => ({
        tenant_id: tenantId,
        customer_id: c.id,
        rider_id: bulkRiderId,
        qty_19l: c.default_qty_19l || 0,
        qty_half_litre: c.default_qty_half || 0,
        qty_1_5l: c.default_qty_1_5l || 0,
        delivery_date: today,
        status: 'assigned',
        assigned_at: new Date().toISOString(),
        notes: 'Bulk generated',
      }))
      const { error } = await supabase.from('orders').insert(rows)
      if (error) { alert('Error: ' + error.message); setBulkSaving(false); return }
    }

    setBulkSaving(false)
    setShowConfirm(false)
    setBulkResult({ created: toCreate.length, skipped })
  }

  function resetBulk() {
    setBulkSelected(new Set())
    setBulkRiderId('')
    setBulkResult(null)
    fetchBulkCustomers()
  }

  function handleViewOrders() {
    setBulkResult(null)
    setFilter('assigned')
  }

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div>
      {/* Modals */}
      {showConfirm && (
        <ConfirmModal
          count={bulkSelected.size}
          qty19l={totalBulkQty19l}
          qtyHalf={totalBulkQtyHalf}
          qty15l={totalBulkQty15l}
          riderName={selectedRider ? selectedRider.full_name : ''}
          onConfirm={generateOrders}
          onCancel={() => setShowConfirm(false)}
          saving={bulkSaving}
        />
      )}
      {bulkResult && (
        <ResultModal
          created={bulkResult.created}
          skipped={bulkResult.skipped}
          onClose={handleViewOrders}
          onAnother={resetBulk}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', color: '#333' }}>Orders</h2>
        {filter !== 'bulk' && (
          <button onClick={() => setShowAddForm(!showAddForm)} style={{
            padding: '10px 20px', background: '#0f4c81', color: 'white',
            border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600'
          }}>
            {showAddForm ? '✕ Cancel' : '+ New Order'}
          </button>
        )}
      </div>

      {/* Add Order Form — unchanged */}
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            {[
              { key: 'qty_19l', label: '19 Litre Bottles' },
              { key: 'qty_half_litre', label: 'Half Litre Bottles' },
              { key: 'qty_1_5l', label: '1.5 Litre Bottles' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                <input type="number" value={form[f.key]}
                  onChange={e => setForm({ ...form, [f.key]: Number(e.target.value) })}
                  min="0" style={inp} />
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Delivery Date</label>
              <input type="date" value={form.delivery_date}
                onChange={e => setForm({ ...form, delivery_date: e.target.value })} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Notes (optional)</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Any special instructions..." style={inp} />
            </div>
          </div>
          <button onClick={saveOrder} disabled={saving} style={{
            padding: '12px 28px', background: '#1a7a4a', color: 'white',
            border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontWeight: '600'
          }}>{saving ? 'Saving...' : '✓ Create Order'}</button>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[
          { key: 'pending',   label: '⏳ Pending'   },
          { key: 'assigned',  label: '🚴 Assigned'  },
          { key: 'completed', label: '✅ Completed' },
          { key: 'cancelled', label: '✕ Cancelled'  },
          { key: 'all',       label: '📋 All'        },
          { key: 'bulk',      label: '📦 Bulk Generate' },
        ].map(f => (
          <button key={f.key} onClick={() => { setFilter(f.key); setShowAddForm(false) }}
            style={{
              padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer',
              background: filter === f.key
                ? f.key === 'bulk' ? '#1a7a4a' : '#0f4c81'
                : '#f0f0f0',
              color: filter === f.key ? 'white' : '#555',
              fontWeight: filter === f.key ? '700' : '400', fontSize: '13px'
            }}>{f.label}</button>
        ))}
      </div>

      {/* ── BULK GENERATE VIEW ── */}
      {filter === 'bulk' && (
        <div>
          {bulkLoading ? (
            <p style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading customers...</p>
          ) : (
            <>
              {/* Stat Pills */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <StatPill label="Total Customers" value={projCounts.all}    color="#0f4c81" bg="#e3f0ff" />
                <StatPill label="Ran Out"          value={projCounts.ranout} color="#c62828" bg="#ffebee" />
                <StatPill label="Needs Today"      value={projCounts.today}  color="#e65100" bg="#fff3e0" />
                <StatPill label="Needs Soon"       value={projCounts.soon}   color="#b45309" bg="#fff8e1" />
                <StatPill label="Selected"         value={bulkSelected.size} color="#1a7a4a" bg="#e8f5e9" />
              </div>

              {/* Search + Area + Auto-select */}
              <div style={{
                background: 'white', borderRadius: '10px', padding: '12px 16px',
                marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap'
              }}>
                <input
                  value={bulkSearch} onChange={e => setBulkSearch(e.target.value)}
                  placeholder="Search name or area..."
                  style={{ ...inp, width: 'auto', flex: 1, minWidth: 160 }}
                />
                <select value={bulkArea} onChange={e => setBulkArea(e.target.value)}
                  style={{ padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none', color: '#555' }}>
                  {areas.map(a => <option key={a}>{a}</option>)}
                </select>
                <button onClick={autoSelectUrgent} style={{
                  padding: '10px 16px', background: '#fff3e0', border: '1px solid #fed7aa',
                  borderRadius: '8px', color: '#c45309', fontSize: '13px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap'
                }}>⚡ Auto-select Urgent</button>
              </div>

              {/* Sub-tabs */}
              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                {BULK_TABS.map(t => {
                  const active = bulkTab === t.key
                  const dotColor = { all: '#0f4c81', ranout: '#c62828', today: '#e65100', soon: '#b45309', ok: '#1a7a4a', nodata: '#94a3b8' }[t.key]
                  const count = t.key === 'nodata' ? projCounts.nodata : projCounts[t.key]
                  return (
                    <button key={t.key} onClick={() => setBulkTab(t.key)} style={{
                      padding: '7px 14px', border: active ? `1px solid ${dotColor}` : '1px solid #e0e0e0',
                      borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: active ? '700' : '400',
                      background: active ? (dotColor + '18') : '#f8f9fa',
                      color: active ? dotColor : '#666',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      {t.label}
                      <span style={{
                        fontSize: 10, fontWeight: 700, minWidth: 18, textAlign: 'center',
                        background: active ? dotColor : '#e0e0e0',
                        color: active ? '#fff' : '#888',
                        padding: '1px 5px', borderRadius: 10,
                      }}>{count ?? 0}</span>
                    </button>
                  )
                })}
              </div>

              {/* Customer Table */}
              <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'auto', marginBottom: bulkSelected.size > 0 ? 72 : 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      <th style={{ padding: '12px 16px', width: 40 }}>
                        <input type="checkbox"
                          checked={allBulkChecked}
                          ref={el => { if (el) el.indeterminate = someBulkChecked }}
                          onChange={toggleBulkAll}
                          style={{ width: 16, height: 16, cursor: 'pointer' }}
                        />
                      </th>
                      {['Customer', 'Address', 'Last Delivery', 'Daily Rate', 'Projection', 'Est. Days Left', 'Default Qty'].map(h => (
                        <th key={h} style={{
                          padding: '12px 14px', textAlign: 'left', fontSize: '11px',
                          color: '#666', fontWeight: '600', borderBottom: '1px solid #eee', whiteSpace: 'nowrap'
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBulk.map(c => {
                      const isSel = bulkSelected.has(c.id)
                      return (
                        <tr key={c.id}
                          onClick={() => toggleBulkOne(c.id)}
                          style={{
                            borderBottom: '1px solid #f0f0f0',
                            background: isSel ? '#f0f7ff' : 'white',
                            cursor: 'pointer',
                          }}>
                          <td style={{ padding: '12px 16px' }}>
                            <input type="checkbox" checked={isSel}
                              onChange={() => toggleBulkOne(c.id)}
                              onClick={e => e.stopPropagation()}
                              style={{ width: 16, height: 16, cursor: 'pointer' }} />
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px', color: '#1a1a2e' }}>{c.full_name}</p>
                            {c.orderCount < 5 && (
                              <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>
                                {c.orderCount === 0 ? 'New customer' : `${c.orderCount} orders — building data`}
                              </p>
                            )}
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: '13px', color: '#555', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.address || '—'}</td>
                          <td style={{ padding: '12px 14px', fontSize: '13px', color: '#555' }}>
                            {c.lastDeliveryDate
                              ? new Date(c.lastDeliveryDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })
                              : '—'}
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: '13px', color: '#555' }}>
                            {c.dailyRate ? `${c.dailyRate} btl/day` : '—'}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <ProjectionBadge proj={c.projection} />
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600,
                            color: c.projection?.key === 'ranout' ? '#c62828'
                              : c.projection?.key === 'today' ? '#e65100'
                              : c.projection?.key === 'soon' ? '#b45309'
                              : '#555'
                          }}>
                            {formatDaysLeft(c.projection?.daysLeft)}
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: 12, color: '#555' }}>
                            {(c.default_qty_19l || 0) > 0 && <span style={{ display: 'block' }}>
                              <span style={{ background: '#e3f0ff', color: '#0f4c81', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>19L × {c.default_qty_19l}</span>
                            </span>}
                            {(c.default_qty_half || 0) > 0 && <span style={{ display: 'block', marginTop: 2 }}>
                              <span style={{ background: '#e8f5e9', color: '#1a7a4a', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>½L × {c.default_qty_half}</span>
                            </span>}
                            {(c.default_qty_1_5l || 0) > 0 && <span style={{ display: 'block', marginTop: 2 }}>
                              <span style={{ background: '#fff3e0', color: '#e65100', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>1.5L × {c.default_qty_1_5l}</span>
                            </span>}
                            {!(c.default_qty_19l || 0) && !(c.default_qty_half || 0) && !(c.default_qty_1_5l || 0) && <span style={{ color: '#ccc' }}>—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {filteredBulk.length === 0 && (
                  <div style={{ padding: '40px', textAlign: 'center' }}>
                    <p style={{ fontSize: '28px', marginBottom: '8px' }}>🔍</p>
                    <p style={{ color: '#888', fontSize: '14px' }}>No customers match your filters.</p>
                  </div>
                )}

                {/* Table footer */}
                <div style={{
                  padding: '10px 16px', borderTop: '1px solid #f0f0f0',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <span style={{ fontSize: '12px', color: '#888' }}>
                    {bulkSelected.size} of {allCustomers.length} customers selected
                    {bulkSelected.size > 0 && ` · ${totalBulkQty} bottles total`}
                  </span>
                  {bulkSelected.size > 0 && (
                    <button onClick={() => setBulkSelected(new Set())}
                      style={{ fontSize: '12px', color: '#c62828', background: 'none', border: 'none', cursor: 'pointer' }}>
                      Clear selection
                    </button>
                  )}
                </div>
              </div>

              {/* Sticky Bottom Assign Bar */}
              {bulkSelected.size > 0 && (
                <div style={{
                  position: 'fixed', bottom: 0, left: 0, right: 0,
                  background: '#0f4c81', padding: '12px 24px',
                  display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                  boxShadow: '0 -4px 20px rgba(0,0,0,0.2)', zIndex: 100,
                }}>
                  <div>
                    <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>
                      {bulkSelected.size} customers
                    </span>
                    <span style={{ color: '#93c5fd', fontSize: 13, marginLeft: 8 }}>
                      {totalBulkQty19l > 0 && `· ${totalBulkQty19l} × 19L `}
                      {totalBulkQtyHalf > 0 && `· ${totalBulkQtyHalf} × ½L `}
                      {totalBulkQty15l > 0 && `· ${totalBulkQty15l} × 1.5L`}
                    </span>
                  </div>
                  <div style={{ flex: 1 }} />
                  <span style={{ color: '#93c5fd', fontSize: 13 }}>Assign to</span>
                  <select value={bulkRiderId} onChange={e => setBulkRiderId(e.target.value)}
                    style={{
                      padding: '9px 14px', borderRadius: 8, border: '1px solid #1e40af',
                      background: '#1e3a8a', color: bulkRiderId ? '#fff' : '#93c5fd',
                      fontSize: 13, minWidth: 200, outline: 'none', cursor: 'pointer'
                    }}>
                    <option value="">Select a rider...</option>
                    {riders.map(r => (
                      <option key={r.id} value={r.id}>{r.full_name}{r.is_main_rider ? ' ⭐' : ''}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => { if (bulkRiderId) setShowConfirm(true) }}
                    disabled={!bulkRiderId}
                    style={{
                      padding: '10px 22px', borderRadius: 8, border: 'none',
                      background: bulkRiderId ? '#1a7a4a' : '#1e3a8a',
                      color: bulkRiderId ? '#fff' : '#64748b',
                      fontWeight: 700, fontSize: 14,
                      cursor: bulkRiderId ? 'pointer' : 'not-allowed',
                    }}>
                    ✓ Generate {bulkSelected.size} Orders
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── EXISTING ORDERS VIEW ── */}
      {filter !== 'bulk' && (
        <>
          {/* Bulk Assign Bar — unchanged */}
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
                    {riders.map(r => (
                      <option key={r.id} value={r.id}>{r.full_name}{r.is_main_rider ? ' ⭐' : ''}</option>
                    ))}
                  </select>
                  <button onClick={assignOrders} disabled={assigning} style={{
                    padding: '8px 16px', background: '#1a7a4a', color: 'white',
                    border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600'
                  }}>{assigning ? 'Assigning...' : `✓ Assign ${selectedOrders.length} Order${selectedOrders.length > 1 ? 's' : ''}`}</button>
                </>
              )}
            </div>
          )}

          {/* Orders Table — unchanged */}
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'auto' }}>
            {loading ? (
              <p style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</p>
            ) : orders.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <p style={{ fontSize: '32px', marginBottom: '8px' }}>📦</p>
                <p style={{ color: '#888', fontSize: '14px' }}>No {filter === 'all' ? '' : filter} orders found.</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    <th style={{ padding: '12px 16px', width: '40px' }}></th>
                    {['Customer', 'Bottles', 'Delivery Date', 'Assigned Rider', 'Notes', 'Status', 'Action'].map(h => (
                      <th key={h} style={{
                        padding: '12px 14px', textAlign: 'left', fontSize: '11px',
                        color: '#666', fontWeight: '600', borderBottom: '1px solid #eee', whiteSpace: 'nowrap'
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => {
                    const s = STATUS_COLORS[o.status] || STATUS_COLORS.pending
                    const isSelected = selectedOrders.includes(o.id)
                    return (
                      <tr key={o.id} style={{ borderBottom: '1px solid #f0f0f0', background: isSelected ? '#f0f7ff' : 'white' }}>
                        <td style={{ padding: '12px 16px' }}>
                          {(o.status === 'pending' || o.status === 'assigned') && (
                            <input type="checkbox" checked={isSelected}
                              onChange={() => toggleSelectOrder(o.id)}
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
                          {o.riders ? (
                            <span style={{ color: '#0f4c81', fontWeight: '600' }}>🚴 {o.riders.full_name}</span>
                          ) : (
                            <span style={{ color: '#ccc' }}>Not assigned</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '12px', color: '#888', maxWidth: '140px' }}>
                          {o.notes || '—'}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
                            background: s.bg, color: s.color, whiteSpace: 'nowrap'
                          }}>{s.label}</span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {o.status !== 'completed' && o.status !== 'cancelled' && (
                            <button onClick={() => cancelOrder(o.id)} style={{
                              padding: '5px 10px', background: '#ffebee', color: '#c62828',
                              border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '600'
                            }}>✕ Cancel</button>
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
