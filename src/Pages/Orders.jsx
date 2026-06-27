import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const STATUS_COLORS = {
  pending: { bg: '#fff3e0', color: '#e65100', label: 'Pending' },
  assigned: { bg: '#e3f0ff', color: '#0f4c81', label: 'Assigned' },
  completed: { bg: '#e8f5e9', color: '#1a7a4a', label: 'Completed' },
  cancelled: { bg: '#ffebee', color: '#c62828', label: 'Cancelled' },
}

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [riders, setRiders] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [selectedOrders, setSelectedOrders] = useState([])
  const [assignRiderId, setAssignRiderId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState({
    customer_id: '', qty_19l: 0, qty_half_litre: 0,
    qty_1_5l: 0, delivery_date: new Date().toISOString().split('T')[0], notes: ''
  })
  const [saving, setSaving] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  useEffect(() => { fetchOrders(); fetchRiders() }, [filter])

  async function fetchOrders() {
    setLoading(true)
    let query = supabase
      .from('orders')
      .select('*, customers(full_name, mobile, customer_code, rate_19l, rate_half_litre, rate_1_5l), riders(full_name)')
      .order('created_at', { ascending: false })

    if (filter !== 'all') query = query.eq('status', filter)

    const { data } = await query
    setOrders(data || [])
    setSelectedOrders([])
    setLoading(false)
  }

  async function fetchRiders() {
    const { data } = await supabase.from('riders').select('*').eq('is_active', true)
    setRiders(data || [])
  }

  async function searchCustomer(val) {
    setCustomerSearch(val)
    if (val.length < 2) { setCustomerResults([]); return }
    const { data } = await supabase.from('customers').select('*').eq('is_active', true)
      .or(`full_name.ilike.%${val}%,mobile.ilike.%${val}%,customer_code.ilike.%${val}%`).limit(5)
    setCustomerResults(data || [])
  }

  function toggleSelectOrder(id) {
    setSelectedOrders(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function toggleSelectAll() {
    if (selectedOrders.length === orders.length) {
      setSelectedOrders([])
    } else {
      setSelectedOrders(orders.map(o => o.id))
    }
  }

  async function assignOrders() {
    if (!assignRiderId) return alert('Please select a rider')
    if (selectedOrders.length === 0) return alert('Please select at least one order')
    setAssigning(true)

    const { error } = await supabase.from('orders')
      .update({
        rider_id: assignRiderId,
        status: 'assigned',
        assigned_at: new Date().toISOString()
      })
      .in('id', selectedOrders)

    if (error) { alert('Error: ' + error.message); setAssigning(false); return }

    alert(`${selectedOrders.length} order${selectedOrders.length > 1 ? 's' : ''} assigned successfully!`)
    setSelectedOrders([])
    setAssignRiderId('')
    fetchOrders()
    setAssigning(false)
  }

  async function cancelOrder(id) {
    if (!window.confirm('Cancel this order?')) return
    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', id)
    fetchOrders()
  }

  async function saveOrder() {
    if (!selectedCustomer) return alert('Please select a customer')
    if (form.qty_19l === 0 && form.qty_half_litre === 0 && form.qty_1_5l === 0)
      return alert('Please enter at least one bottle quantity')

    setSaving(true)
    const { error } = await supabase.from('orders').insert([{
      customer_id: selectedCustomer.id,
      qty_19l: form.qty_19l,
      qty_half_litre: form.qty_half_litre,
      qty_1_5l: form.qty_1_5l,
      delivery_date: form.delivery_date,
      notes: form.notes,
      status: 'pending'
    }])

    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    alert('Order created successfully!')
    setShowAddForm(false)
    setSelectedCustomer(null)
    setCustomerSearch('')
    setForm({ customer_id: '', qty_19l: 0, qty_half_litre: 0, qty_1_5l: 0, delivery_date: new Date().toISOString().split('T')[0], notes: '' })
    fetchOrders()
    setSaving(false)
  }

  const inp = {
    width: '100%', padding: '10px 12px', border: '1px solid #ddd',
    borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
  }

  const pendingCount = orders.filter(o => o.status === 'pending').length

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', color: '#333' }}>Orders</h2>
        <button onClick={() => setShowAddForm(!showAddForm)}
          style={{
            padding: '10px 20px', background: '#0f4c81', color: 'white',
            border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600'
          }}>
          {showAddForm ? '✕ Cancel' : '+ New Order'}
        </button>
      </div>

      {/* Add Order Form */}
      {showAddForm && (
        <div style={{
          background: 'white', borderRadius: '12px', padding: '20px',
          marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #e3f0ff'
        }}>
          <h3 style={{ margin: '0 0 16px', color: '#0f4c81' }}>➕ New Order</h3>

          {/* Customer Search */}
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
                  placeholder="Search by name, mobile, or ID..."
                  style={inp} />
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

          {/* Quantities */}
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

          {/* Delivery Date & Notes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Delivery Date</label>
              <input type="date" value={form.delivery_date}
                onChange={e => setForm({ ...form, delivery_date: e.target.value })}
                style={inp} />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Notes (optional)</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Any special instructions..." style={inp} />
            </div>
          </div>

          <button onClick={saveOrder} disabled={saving}
            style={{
              padding: '12px 28px', background: '#1a7a4a', color: 'white',
              border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontWeight: '600'
            }}>
            {saving ? 'Saving...' : '✓ Create Order'}
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {[
          { key: 'pending', label: '⏳ Pending' },
          { key: 'assigned', label: '🚴 Assigned' },
          { key: 'completed', label: '✅ Completed' },
          { key: 'cancelled', label: '✕ Cancelled' },
          { key: 'all', label: '📋 All' },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{
              padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer',
              background: filter === f.key ? '#0f4c81' : '#f0f0f0',
              color: filter === f.key ? 'white' : '#555',
              fontWeight: filter === f.key ? '700' : '400', fontSize: '13px'
            }}>{f.label}</button>
        ))}
      </div>

      {/* Bulk Assign Bar */}
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
              <button onClick={assignOrders} disabled={assigning}
                style={{
                  padding: '8px 16px', background: '#1a7a4a', color: 'white',
                  border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600'
                }}>
                {assigning ? 'Assigning...' : `✓ Assign ${selectedOrders.length} Order${selectedOrders.length > 1 ? 's' : ''}`}
              </button>
            </>
          )}
        </div>
      )}

      {/* Orders Table */}
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
                        <button onClick={() => cancelOrder(o.id)}
                          style={{
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
    </div>
  )
}