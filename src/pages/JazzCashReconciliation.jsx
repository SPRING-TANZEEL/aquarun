import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function JazzCashReconciliation({ tenantId, onUpdate }) {
  const [deliveries, setDeliveries] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [confirming, setConfirming] = useState(null)
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0])
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [rejectReason, setRejectReason] = useState('')
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectType, setRejectType] = useState(null)
  const [jazzSummary, setJazzSummary] = useState({ in: 0, out: 0, pending: 0 })

  useEffect(() => { if (tenantId) fetchEntries() }, [filter, dateFrom, dateTo, tenantId])

  async function fetchEntries() {
    setLoading(true)

    let dQuery = supabase.from('deliveries')
      .select('*, customers(full_name, mobile, customer_code), riders(full_name)')
      .eq('tenant_id', tenantId)
      .eq('payment_method', 'jazzcash')
      .gte('delivered_at', dateFrom + 'T00:00:00')
      .lte('delivered_at', dateTo + 'T23:59:59')
      .order('delivered_at', { ascending: false })

    if (filter === 'pending') dQuery = dQuery.eq('jazzcash_confirmed', false).eq('is_voided', false)
    if (filter === 'confirmed') dQuery = dQuery.eq('jazzcash_confirmed', true)

    const { data: dData } = await dQuery
    setDeliveries(dData || [])

    let pQuery = supabase.from('payments')
      .select('*, customers(full_name, mobile, customer_code), riders(full_name)')
      .eq('tenant_id', tenantId)
      .eq('payment_method', 'jazzcash')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59')
      .order('created_at', { ascending: false })

    if (filter === 'pending') pQuery = pQuery.eq('jazzcash_confirmed', false).eq('is_voided', false)
    if (filter === 'confirmed') pQuery = pQuery.eq('jazzcash_confirmed', true)

    const { data: pData } = await pQuery
    setPayments(pData || [])

    // Jazz summary — all statuses in date range
    const { data: allDeliveries } = await supabase.from('deliveries')
      .select('total_amount, jazzcash_confirmed, is_voided')
      .eq('tenant_id', tenantId).eq('payment_method', 'jazzcash')
      .gte('delivered_at', dateFrom + 'T00:00:00')
      .lte('delivered_at', dateTo + 'T23:59:59')

    const { data: allPayments } = await supabase.from('payments')
      .select('amount, jazzcash_confirmed, is_voided')
      .eq('tenant_id', tenantId).eq('payment_method', 'jazzcash')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59')

    const { data: jazzTransfers } = await supabase.from('cash_transfers')
      .select('amount')
      .eq('tenant_id', tenantId)
      .eq('transfer_type', 'jazzcash')
      .eq('status', 'confirmed')
      .gte('transfer_date', dateFrom)
      .lte('transfer_date', dateTo)

    let jazzIn = 0, jazzPending = 0
    allDeliveries?.forEach(d => {
      if (d.is_voided) return
      if (d.jazzcash_confirmed) jazzIn += Number(d.total_amount)
      else jazzPending += Number(d.total_amount)
    })
    allPayments?.forEach(p => {
      if (p.is_voided) return
      if (p.jazzcash_confirmed) jazzIn += Number(p.amount)
      else jazzPending += Number(p.amount)
    })
    const jazzOut = jazzTransfers?.reduce((s, t) => s + Number(t.amount), 0) || 0

    setJazzSummary({ in: jazzIn, out: jazzOut, pending: jazzPending })
    setLoading(false)
  }

  async function confirmDelivery(entry) {
    setConfirming('d-' + entry.id)

    const { data: confirmed, error } = await supabase.from('deliveries').update({
      jazzcash_confirmed: true,
      jazzcash_confirmed_at: new Date().toISOString(),
      jazzcash_confirmed_by: 'Admin',
      amount_received: entry.total_amount
    })
      .eq('id', entry.id)
      .eq('tenant_id', tenantId)
      .select().single()

    if (error) { alert('Error: ' + error.message); setConfirming(null); return }

    // Auto-post journal entry — JazzCash confirmed
    try {
      const { postJazzCashConfirmationJournal } = await import('../accountingEngine')
      await postJazzCashConfirmationJournal(confirmed, 'delivery', tenantId)
    } catch (err) { console.error('Journal post error:', err) }

    fetchEntries()
    if (onUpdate) onUpdate()
    setConfirming(null)
  }

  async function unconfirmDelivery(entry) {
    setConfirming('d-' + entry.id)
    const { error } = await supabase.from('deliveries').update({
      jazzcash_confirmed: false,
      jazzcash_confirmed_at: null,
      jazzcash_confirmed_by: null,
      amount_received: 0
    })
      .eq('id', entry.id)
      .eq('tenant_id', tenantId)
    if (error) { alert('Error: ' + error.message) }
    else { fetchEntries(); if (onUpdate) onUpdate() }
    setConfirming(null)
  }

  async function rejectDelivery(entry) {
    if (!rejectReason.trim()) return alert('Please enter a reason for rejection')
    setConfirming('d-' + entry.id)

    // Void the delivery and reverse customer balance
    const { error } = await supabase.from('deliveries').update({
      is_voided: true,
      voided_at: new Date().toISOString(),
      voided_by: 'Admin',
      void_reason: 'JazzCash rejected — ' + rejectReason
    })
      .eq('id', entry.id)
      .eq('tenant_id', tenantId)

    if (error) { alert('Error: ' + error.message); setConfirming(null); return }

    // Reverse customer balance if credit was added
    if (entry.customer_id) {
      const { data: customer } = await supabase.from('customers')
        .select('balance')
        .eq('id', entry.customer_id)
        .eq('tenant_id', tenantId)
        .single()
      if (customer) {
        await supabase.from('customers').update({
          balance: Number(customer.balance) - Number(entry.total_amount)
        })
          .eq('id', entry.customer_id)
          .eq('tenant_id', tenantId)
      }
    }

    setRejectingId(null)
    setRejectReason('')
    setRejectType(null)
    fetchEntries()
    if (onUpdate) onUpdate()
    setConfirming(null)
    alert('❌ JazzCash delivery rejected and voided. Customer balance reversed.')
  }

  async function confirmPayment(entry) {
    setConfirming('p-' + entry.id)

    const { data: confirmed, error } = await supabase.from('payments').update({
      jazzcash_confirmed: true
    })
      .eq('id', entry.id)
      .eq('tenant_id', tenantId)
      .select().single()

    if (error) { alert('Error: ' + error.message); setConfirming(null); return }

    // Reduce customer balance
    const { data: customer } = await supabase.from('customers')
      .select('balance')
      .eq('id', entry.customer_id)
      .eq('tenant_id', tenantId)
      .single()
    if (customer) {
      await supabase.from('customers').update({
        balance: Number(customer.balance) - Number(entry.amount)
      })
        .eq('id', entry.customer_id)
        .eq('tenant_id', tenantId)
    }

    // Auto-post journal entry
    try {
      const { postJazzCashConfirmationJournal } = await import('../accountingEngine')
      await postJazzCashConfirmationJournal(confirmed, 'payment')
    } catch (err) { console.error('Journal post error:', err) }

    fetchEntries()
    if (onUpdate) onUpdate()
    setConfirming(null)
  }

  async function unconfirmPayment(entry) {
    setConfirming('p-' + entry.id)
    const { error } = await supabase.from('payments')
      .update({ jazzcash_confirmed: false })
      .eq('id', entry.id)
      .eq('tenant_id', tenantId)
    if (error) { alert('Error: ' + error.message); setConfirming(null); return }

    const { data: customer } = await supabase.from('customers')
      .select('balance')
      .eq('id', entry.customer_id)
      .eq('tenant_id', tenantId)
      .single()
    if (customer) {
      await supabase.from('customers').update({
        balance: Number(customer.balance) + Number(entry.amount)
      })
        .eq('id', entry.customer_id)
        .eq('tenant_id', tenantId)
    }

    fetchEntries()
    if (onUpdate) onUpdate()
    setConfirming(null)
  }

  async function rejectPayment(entry) {
    if (!rejectReason.trim()) return alert('Please enter a reason for rejection')
    setConfirming('p-' + entry.id)

    const { error } = await supabase.from('payments').update({
      is_voided: true,
      voided_at: new Date().toISOString(),
      voided_by: 'Admin',
      void_reason: 'JazzCash rejected — ' + rejectReason
    })
      .eq('id', entry.id)
      .eq('tenant_id', tenantId)

    if (error) { alert('Error: ' + error.message); setConfirming(null); return }

    setRejectingId(null)
    setRejectReason('')
    setRejectType(null)
    fetchEntries()
    if (onUpdate) onUpdate()
    setConfirming(null)
    alert('❌ JazzCash payment rejected and voided.')
  }

  const totalDeliveryPending = deliveries.filter(e => !e.jazzcash_confirmed && !e.is_voided).reduce((s, e) => s + Number(e.total_amount), 0)
  const totalPaymentPending = payments.filter(e => !e.jazzcash_confirmed && !e.is_voided).reduce((s, e) => s + Number(e.amount), 0)
  const totalConfirmed = [
    ...deliveries.filter(e => e.jazzcash_confirmed).map(e => Number(e.total_amount)),
    ...payments.filter(e => e.jazzcash_confirmed).map(e => Number(e.amount))
  ].reduce((s, v) => s + v, 0)

  function sectionHead(title, count) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '20px 0 10px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: 0 }}>{title}</h3>
        {count > 0 && (
          <span style={{ background: '#e65100', color: 'white', fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: '700' }}>
            {count}
          </span>
        )}
      </div>
    )
  }

  function statusBadge(entry) {
    if (entry.is_voided) return (
      <div>
        <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', background: '#ffebee', color: '#c62828' }}>❌ Rejected</span>
        {entry.void_reason && <p style={{ fontSize: '10px', color: '#aaa', margin: '3px 0 0' }}>{entry.void_reason}</p>}
      </div>
    )
    if (entry.jazzcash_confirmed) return (
      <div>
        <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', background: '#f3e5f5', color: '#7b1fa2' }}>✅ Confirmed</span>
        {entry.jazzcash_confirmed_at && <p style={{ fontSize: '10px', color: '#aaa', margin: '3px 0 0' }}>{new Date(entry.jazzcash_confirmed_at).toLocaleString('en-PK', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}</p>}
      </div>
    )
    return <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', background: '#fff3e0', color: '#e65100' }}>⏳ Pending</span>
  }

  function ActionButtons({ entry, type }) {
    const id = type + '-' + entry.id
    const isDelivery = type === 'd'
    const isRejecting = rejectingId === entry.id && rejectType === type

    if (entry.is_voided) return (
      <span style={{ fontSize: '11px', color: '#aaa' }}>Voided</span>
    )

    if (entry.jazzcash_confirmed) return (
      <button onClick={() => isDelivery ? unconfirmDelivery(entry) : unconfirmPayment(entry)}
        disabled={confirming === id}
        style={{ padding: '7px 14px', background: '#f5f5f5', color: '#888', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
        {confirming === id ? '...' : '↩ Undo'}
      </button>
    )

    if (isRejecting) return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '200px' }}>
        <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
          placeholder="Reason for rejection..."
          style={{ padding: '8px 10px', border: '2px solid #f44336', borderRadius: '6px', fontSize: '12px', outline: 'none' }} />
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => { setRejectingId(null); setRejectReason(''); setRejectType(null) }}
            style={{ flex: 1, padding: '6px', background: '#f5f5f5', color: '#888', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }}>
            Cancel
          </button>
          <button onClick={() => isDelivery ? rejectDelivery(entry) : rejectPayment(entry)}
            disabled={confirming === id}
            style={{ flex: 2, padding: '6px', background: '#f44336', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}>
            {confirming === id ? '...' : '❌ Confirm Reject'}
          </button>
        </div>
      </div>
    )

    return (
      <div style={{ display: 'flex', gap: '6px' }}>
        <button onClick={() => isDelivery ? confirmDelivery(entry) : confirmPayment(entry)}
          disabled={confirming === id}
          style={{ padding: '7px 14px', background: '#9c27b0', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
          {confirming === id ? '...' : '✓ Confirm'}
        </button>
        <button onClick={() => { setRejectingId(entry.id); setRejectType(type); setRejectReason('') }}
          style={{ padding: '7px 12px', background: '#ffebee', color: '#c62828', border: '1px solid #ffcdd2', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
          ❌ Reject
        </button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>📱 JazzCash Reconciliation</h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Check your JazzCash account and confirm or reject each payment.</p>
      </div>

      {/* Filters */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>From Date</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>To Date</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { key: 'pending', label: '⏳ Pending' },
              { key: 'confirmed', label: '✅ Confirmed' },
              { key: 'all', label: '📋 All' },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                style={{ padding: '8px 14px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: filter === f.key ? '#0f4c81' : '#f0f0f0', color: filter === f.key ? 'white' : '#555', fontWeight: filter === f.key ? '700' : '400', fontSize: '13px' }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          📱 JazzCash Position — {new Date(dateFrom).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })} to {new Date(dateTo).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          {[
            { label: '📥 Confirmed In', value: jazzSummary.in, color: '#1a7a4a', bg: '#e8f5e9', desc: 'Sales + Collections confirmed' },
            { label: '📤 Transferred Out', value: jazzSummary.out, color: '#0f4c81', bg: '#e3f0ff', desc: 'Jazz transfers to office' },
            { label: '⏳ Still Pending', value: jazzSummary.pending, color: '#e65100', bg: '#fff3e0', desc: 'Not yet confirmed' },
            { label: '💰 Net in Hand', value: jazzSummary.in - jazzSummary.out, color: jazzSummary.in - jazzSummary.out >= 0 ? '#9c27b0' : '#c62828', bg: '#f3e5f5', desc: 'Confirmed − Transferred' },
          ].map(card => (
            <div key={card.label} style={{ background: card.bg, borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
              <p style={{ fontSize: '11px', color: '#666', margin: '0 0 4px', fontWeight: '600' }}>{card.label}</p>
              <p style={{ fontSize: '18px', fontWeight: '700', color: card.color, margin: '0 0 4px' }}>Rs. {Math.abs(card.value).toLocaleString()}</p>
              <p style={{ fontSize: '10px', color: '#aaa', margin: 0 }}>{card.desc}</p>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          {[
            { label: 'Sales Pending', value: totalDeliveryPending, color: '#e65100' },
            { label: 'Payments Pending', value: totalPaymentPending, color: '#f44336' },
            { label: 'Total Confirmed', value: totalConfirmed, color: '#9c27b0' },
          ].map(card => (
            <div key={card.label} style={{ background: '#f8f9fa', borderRadius: '8px', padding: '10px', borderLeft: `3px solid ${card.color}` }}>
              <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>{card.label}</p>
              <p style={{ fontSize: '15px', fontWeight: '700', color: card.color, margin: 0 }}>Rs. {card.value.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>
      ) : (
        <div>
          {/* JazzCash Sales */}
          {sectionHead('🍶 JazzCash Sales (Deliveries)', deliveries.filter(e => !e.jazzcash_confirmed && !e.is_voided).length)}
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'auto', marginBottom: '20px' }}>
            {deliveries.length === 0 ? (
              <p style={{ padding: '24px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No JazzCash sales for this period.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    {['Date', 'Customer', 'Rider', 'Bottles', 'Amount', 'Status', 'Action'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: '11px', color: '#666', fontWeight: '600', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map(e => (
                    <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0', background: e.is_voided ? '#fff5f5' : e.jazzcash_confirmed ? '#fafffe' : '#fffbf5' }}>
                      <td style={{ padding: '12px 14px', fontSize: '12px', color: '#555', whiteSpace: 'nowrap' }}>
                        {new Date(e.delivered_at).toLocaleDateString('en-PK')}<br />
                        <span style={{ color: '#aaa', fontSize: '11px' }}>{new Date(e.delivered_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {e.customers ? (
                          <div>
                            <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>{e.customers.full_name}</p>
                            <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{e.customers.mobile}</p>
                          </div>
                        ) : <span style={{ fontSize: '12px', color: '#888' }}>Walk-in</span>}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '13px', color: '#555' }}>{e.riders?.full_name || '—'}</td>
                      <td style={{ padding: '12px 14px', fontSize: '12px', color: '#555' }}>
                        {e.qty_19l > 0 ? `19L×${e.qty_19l} ` : ''}
                        {e.qty_half_litre > 0 ? `Half×${e.qty_half_litre} ` : ''}
                        {e.qty_1_5l > 0 ? `1.5L×${e.qty_1_5l}` : ''}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '14px', fontWeight: '700', color: '#0f4c81', whiteSpace: 'nowrap' }}>Rs. {Number(e.total_amount).toLocaleString()}</td>
                      <td style={{ padding: '12px 14px' }}>{statusBadge(e)}</td>
                      <td style={{ padding: '12px 14px' }}><ActionButtons entry={e} type="d" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* JazzCash Payments */}
          {sectionHead('💵 JazzCash Payments (Balance Collections)', payments.filter(e => !e.jazzcash_confirmed && !e.is_voided).length)}
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'auto' }}>
            {payments.length === 0 ? (
              <p style={{ padding: '24px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No JazzCash payments for this period.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    {['Date', 'Customer', 'Rider', 'Amount', 'Notes', 'Status', 'Action'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: '11px', color: '#666', fontWeight: '600', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map(e => (
                    <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0', background: e.is_voided ? '#fff5f5' : e.jazzcash_confirmed ? '#fafffe' : '#fffbf5' }}>
                      <td style={{ padding: '12px 14px', fontSize: '12px', color: '#555', whiteSpace: 'nowrap' }}>
                        {new Date(e.created_at).toLocaleDateString('en-PK')}<br />
                        <span style={{ color: '#aaa', fontSize: '11px' }}>{new Date(e.created_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {e.customers ? (
                          <div>
                            <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>{e.customers.full_name}</p>
                            <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{e.customers.mobile}</p>
                          </div>
                        ) : <span style={{ fontSize: '12px', color: '#888' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '13px', color: '#555' }}>{e.riders?.full_name || '—'}</td>
                      <td style={{ padding: '12px 14px', fontSize: '14px', fontWeight: '700', color: '#1a7a4a', whiteSpace: 'nowrap' }}>Rs. {Number(e.amount).toLocaleString()}</td>
                      <td style={{ padding: '12px 14px', fontSize: '12px', color: '#888', maxWidth: '160px' }}>{e.notes || '—'}</td>
                      <td style={{ padding: '12px 14px' }}>{statusBadge(e)}</td>
                      <td style={{ padding: '12px 14px' }}><ActionButtons entry={e} type="p" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}