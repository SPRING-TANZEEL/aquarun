import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function JazzCashReconciliation({ tenantId, onUpdate }) {
  const [activeTab, setActiveTab] = useState('statement')
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

  // Statement state
  const [stmtFrom, setStmtFrom] = useState('2024-01-01')
  const [stmtTo, setStmtTo] = useState(new Date().toISOString().split('T')[0])
  const [stmtEntries, setStmtEntries] = useState([])
  const [stmtLoading, setStmtLoading] = useState(false)
  const [stmtSummary, setStmtSummary] = useState({ totalIn: 0, totalOut: 0, closing: 0 })

  useEffect(() => { if (tenantId) fetchEntries() }, [filter, dateFrom, dateTo, tenantId])
  useEffect(() => { if (tenantId && activeTab === 'statement') fetchStatement() }, [stmtFrom, stmtTo, tenantId, activeTab])

  async function fetchStatement() {
    setStmtLoading(true)
    const entries = []

    // Opening balance from settings
    const { data: settingsData } = await supabase.from('business_settings')
      .select('setting_value')
      .eq('tenant_id', tenantId)
      .eq('setting_key', 'jazzcash_opening_balance')
      .single()
    const openingBalance = Number(settingsData?.setting_value || 0)

    // ── MONEY IN ──
    // 1. Confirmed JazzCash deliveries (sales)
    const { data: confDeliveries } = await supabase.from('deliveries')
      .select('*, customers(full_name, customer_code)')
      .eq('tenant_id', tenantId)
      .eq('payment_method', 'jazzcash')
      .eq('jazzcash_confirmed', true)
      .eq('is_voided', false)
      .gte('delivered_at', stmtFrom + 'T00:00:00')
      .lte('delivered_at', stmtTo + 'T23:59:59')

    confDeliveries?.forEach(d => {
      entries.push({
        date: d.delivered_at,
        type: 'in',
        category: 'sale',
        label: d.customers?.full_name || 'Walk-in',
        sublabel: `Sale — ${d.qty_19l > 0 ? `19L×${d.qty_19l}` : ''}${d.qty_half_litre > 0 ? ` Half×${d.qty_half_litre}` : ''}${d.qty_1_5l > 0 ? ` 1.5L×${d.qty_1_5l}` : ''}`,
        amount: Number(d.total_amount),
        id: 'd-' + d.id
      })
    })

    // Confirmed JazzCash payments (balance collections)
    const { data: confPayments } = await supabase.from('payments')
      .select('*, customers(full_name, customer_code)')
      .eq('tenant_id', tenantId)
      .eq('payment_method', 'jazzcash')
      .eq('jazzcash_confirmed', true)
      .eq('is_voided', false)
      .gte('created_at', stmtFrom + 'T00:00:00')
      .lte('created_at', stmtTo + 'T23:59:59')

    confPayments?.forEach(p => {
      entries.push({
        date: p.created_at,
        type: 'in',
        category: 'collection',
        label: p.customers?.full_name || '—',
        sublabel: 'Payment Received — JazzCash',
        amount: Number(p.amount),
        id: 'p-' + p.id
      })
    })

    // 3. Rider Jazz Transfers to Office — money coming IN to your jazz account
    const { data: jazzTransfersIn } = await supabase.from('cash_transfers')
      .select('*, riders:from_rider_id(full_name)')
      .eq('tenant_id', tenantId)
      .eq('transfer_type', 'jazzcash')
      .eq('status', 'confirmed')
      .eq('to_office', true)
      .gte('transfer_date', stmtFrom)
      .lte('transfer_date', stmtTo)

    jazzTransfersIn?.forEach(t => {
      entries.push({
        date: t.confirmed_at || t.transfer_date + 'T12:00:00',
        type: 'in',
        category: 'rider_transfer',
        label: `Rider Transfer — ${t.riders?.full_name || '—'}`,
        sublabel: 'Rider forwarded jazz to office account',
        amount: Number(t.amount),
        id: 'ct-' + t.id
      })
    })

    // ── MONEY OUT ──
    // 4. Office expenses paid from JazzCash
    const { data: officeExp } = await supabase.from('office_expenses')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('payment_method', 'jazzcash')
      .eq('is_voided', false)
      .gte('expense_date', stmtFrom)
      .lte('expense_date', stmtTo)

    officeExp?.forEach(e => {
      entries.push({
        date: e.expense_date + 'T12:00:00',
        type: 'out',
        category: 'expense',
        label: e.category ? e.category.charAt(0).toUpperCase() + e.category.slice(1) : 'Office Expense',
        sublabel: e.description || 'Office Expense',
        amount: Number(e.amount),
        id: 'oe-' + e.id
      })
    })

    // Rider expenses paid from JazzCash
    const { data: riderExp } = await supabase.from('expenses')
      .select('*, riders(full_name)')
      .eq('tenant_id', tenantId)
      .eq('payment_method', 'jazzcash')
      .eq('is_voided', false)
      .gte('expense_date', stmtFrom)
      .lte('expense_date', stmtTo)

    riderExp?.forEach(e => {
      entries.push({
        date: e.expense_date + 'T12:00:00',
        type: 'out',
        category: 'expense',
        label: e.expense_type ? e.expense_type.charAt(0).toUpperCase() + e.expense_type.slice(1) : 'Rider Expense',
        sublabel: (e.description || '') + (e.riders?.full_name ? ` — ${e.riders.full_name}` : ''),
        amount: Number(e.amount),
        id: 're-' + e.id
      })
    })

    // Salary payments from JazzCash
    const { data: salaryPay } = await supabase.from('salary_payments')
      .select('*, riders(full_name)')
      .eq('tenant_id', tenantId)
      .eq('payment_method', 'jazzcash')
      .gte('payment_date', stmtFrom)
      .lte('payment_date', stmtTo)

    salaryPay?.forEach(s => {
      entries.push({
        date: s.payment_date + 'T12:00:00',
        type: 'out',
        category: 'salary',
        label: `Salary — ${s.riders?.full_name || '—'}`,
        sublabel: s.notes || 'Salary Payment',
        amount: Number(s.amount_paid),
        id: 'sp-' + s.id
      })
    })

    // Sort by date ascending
    entries.sort((a, b) => new Date(a.date) - new Date(b.date))

    // Running balance starting from opening balance
    let balance = openingBalance
    const withBalance = entries.map(e => {
      if (e.type === 'in') balance += e.amount
      else balance -= e.amount
      return { ...e, balance }
    })

    const totalIn = entries.filter(e => e.type === 'in').reduce((s, e) => s + e.amount, 0)
    const totalOut = entries.filter(e => e.type === 'out').reduce((s, e) => s + e.amount, 0)

    setStmtEntries(withBalance)
    setStmtSummary({ totalIn, totalOut, closing: openingBalance + totalIn - totalOut, openingBalance })
    setStmtLoading(false)
  }

  async function fetchEntries() {
    setLoading(true)

    let dQuery = supabase.from('deliveries')
      .select('*, customers(full_name, mobile, customer_code), riders(full_name)')
      .eq('tenant_id', tenantId).eq('payment_method', 'jazzcash')
      .gte('delivered_at', dateFrom + 'T00:00:00').lte('delivered_at', dateTo + 'T23:59:59')
      .order('delivered_at', { ascending: false })
    if (filter === 'pending') dQuery = dQuery.eq('jazzcash_confirmed', false).eq('is_voided', false)
    if (filter === 'confirmed') dQuery = dQuery.eq('jazzcash_confirmed', true)
    const { data: dData } = await dQuery
    setDeliveries(dData || [])

    let pQuery = supabase.from('payments')
      .select('*, customers(full_name, mobile, customer_code), riders(full_name)')
      .eq('tenant_id', tenantId).eq('payment_method', 'jazzcash')
      .gte('created_at', dateFrom + 'T00:00:00').lte('created_at', dateTo + 'T23:59:59')
      .order('created_at', { ascending: false })
    if (filter === 'pending') pQuery = pQuery.eq('jazzcash_confirmed', false).eq('is_voided', false)
    if (filter === 'confirmed') pQuery = pQuery.eq('jazzcash_confirmed', true)
    const { data: pData } = await pQuery
    setPayments(pData || [])

    const { data: allDeliveries } = await supabase.from('deliveries')
      .select('total_amount, jazzcash_confirmed, is_voided')
      .eq('tenant_id', tenantId).eq('payment_method', 'jazzcash')
      .gte('delivered_at', dateFrom + 'T00:00:00').lte('delivered_at', dateTo + 'T23:59:59')
    const { data: allPayments } = await supabase.from('payments')
      .select('amount, jazzcash_confirmed, is_voided')
      .eq('tenant_id', tenantId).eq('payment_method', 'jazzcash')
      .gte('created_at', dateFrom + 'T00:00:00').lte('created_at', dateTo + 'T23:59:59')
    const { data: jazzTransfers } = await supabase.from('cash_transfers')
      .select('amount').eq('tenant_id', tenantId).eq('transfer_type', 'jazzcash')
      .eq('status', 'confirmed').gte('transfer_date', dateFrom).lte('transfer_date', dateTo)

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
      jazzcash_confirmed: true, jazzcash_confirmed_at: new Date().toISOString(),
      jazzcash_confirmed_by: 'Admin', amount_received: entry.total_amount
    }).eq('id', entry.id).eq('tenant_id', tenantId).select().single()
    if (error) { alert('Error: ' + error.message); setConfirming(null); return }
    try {
      const { postJazzCashConfirmationJournal } = await import('../accountingEngine')
      await postJazzCashConfirmationJournal(confirmed, 'delivery', tenantId)
    } catch (err) { console.error('Journal post error:', err) }
    fetchEntries(); if (onUpdate) onUpdate(); setConfirming(null)
  }

  async function unconfirmDelivery(entry) {
    setConfirming('d-' + entry.id)
    const { error } = await supabase.from('deliveries').update({
      jazzcash_confirmed: false, jazzcash_confirmed_at: null, jazzcash_confirmed_by: null, amount_received: 0
    }).eq('id', entry.id).eq('tenant_id', tenantId)
    if (error) { alert('Error: ' + error.message) }
    else { fetchEntries(); if (onUpdate) onUpdate() }
    setConfirming(null)
  }

  async function rejectDelivery(entry) {
    if (!rejectReason.trim()) return alert('Please enter a reason for rejection')
    setConfirming('d-' + entry.id)
    const { error } = await supabase.from('deliveries').update({
      is_voided: true, voided_at: new Date().toISOString(),
      voided_by: 'Admin', void_reason: 'JazzCash rejected — ' + rejectReason
    }).eq('id', entry.id).eq('tenant_id', tenantId)
    if (error) { alert('Error: ' + error.message); setConfirming(null); return }
    if (entry.customer_id) {
      const { data: customer } = await supabase.from('customers').select('balance').eq('id', entry.customer_id).eq('tenant_id', tenantId).single()
      if (customer) await supabase.from('customers').update({ balance: Number(customer.balance) - Number(entry.total_amount) }).eq('id', entry.customer_id).eq('tenant_id', tenantId)
    }
    setRejectingId(null); setRejectReason(''); setRejectType(null)
    fetchEntries(); if (onUpdate) onUpdate(); setConfirming(null)
    alert('❌ JazzCash delivery rejected and voided.')
  }

  async function confirmPayment(entry) {
    setConfirming('p-' + entry.id)
    const { data: confirmed, error } = await supabase.from('payments').update({ jazzcash_confirmed: true })
      .eq('id', entry.id).eq('tenant_id', tenantId).select().single()
    if (error) { alert('Error: ' + error.message); setConfirming(null); return }
    const { data: customer } = await supabase.from('customers').select('balance').eq('id', entry.customer_id).eq('tenant_id', tenantId).single()
    if (customer) await supabase.from('customers').update({ balance: Number(customer.balance) - Number(entry.amount) }).eq('id', entry.customer_id).eq('tenant_id', tenantId)
    try {
      const { postJazzCashConfirmationJournal } = await import('../accountingEngine')
      await postJazzCashConfirmationJournal(confirmed, 'payment')
    } catch (err) { console.error('Journal post error:', err) }
    fetchEntries(); if (onUpdate) onUpdate(); setConfirming(null)
  }

  async function unconfirmPayment(entry) {
    setConfirming('p-' + entry.id)
    const { error } = await supabase.from('payments').update({ jazzcash_confirmed: false }).eq('id', entry.id).eq('tenant_id', tenantId)
    if (error) { alert('Error: ' + error.message); setConfirming(null); return }
    const { data: customer } = await supabase.from('customers').select('balance').eq('id', entry.customer_id).eq('tenant_id', tenantId).single()
    if (customer) await supabase.from('customers').update({ balance: Number(customer.balance) + Number(entry.amount) }).eq('id', entry.customer_id).eq('tenant_id', tenantId)
    fetchEntries(); if (onUpdate) onUpdate(); setConfirming(null)
  }

  async function rejectPayment(entry) {
    if (!rejectReason.trim()) return alert('Please enter a reason for rejection')
    setConfirming('p-' + entry.id)
    const { error } = await supabase.from('payments').update({
      is_voided: true, voided_at: new Date().toISOString(), voided_by: 'Admin', void_reason: 'JazzCash rejected — ' + rejectReason
    }).eq('id', entry.id).eq('tenant_id', tenantId)
    if (error) { alert('Error: ' + error.message); setConfirming(null); return }
    setRejectingId(null); setRejectReason(''); setRejectType(null)
    fetchEntries(); if (onUpdate) onUpdate(); setConfirming(null)
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
        {count > 0 && <span style={{ background: '#e65100', color: 'white', fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: '700' }}>{count}</span>}
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
    if (entry.is_voided) return <span style={{ fontSize: '11px', color: '#aaa' }}>Voided</span>
    if (entry.jazzcash_confirmed) return (
      <button onClick={() => isDelivery ? unconfirmDelivery(entry) : unconfirmPayment(entry)} disabled={confirming === id}
        style={{ padding: '7px 14px', background: '#f5f5f5', color: '#888', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
        {confirming === id ? '...' : '↩ Undo'}
      </button>
    )
    if (isRejecting) return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '200px' }}>
        <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection..."
          style={{ padding: '8px 10px', border: '2px solid #f44336', borderRadius: '6px', fontSize: '12px', outline: 'none' }} />
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => { setRejectingId(null); setRejectReason(''); setRejectType(null) }}
            style={{ flex: 1, padding: '6px', background: '#f5f5f5', color: '#888', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }}>Cancel</button>
          <button onClick={() => isDelivery ? rejectDelivery(entry) : rejectPayment(entry)} disabled={confirming === id}
            style={{ flex: 2, padding: '6px', background: '#f44336', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}>
            {confirming === id ? '...' : '❌ Confirm Reject'}
          </button>
        </div>
      </div>
    )
    return (
      <div style={{ display: 'flex', gap: '6px' }}>
        <button onClick={() => isDelivery ? confirmDelivery(entry) : confirmPayment(entry)} disabled={confirming === id}
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

  const categoryIcon = { sale: '🍶', collection: '💰', rider_transfer: '🚴', transfer: '🏢', expense: '🧾', salary: '💼' }
  const categoryLabel = { sale: 'Sale', collection: 'Payment', rider_transfer: 'Rider Transfer', transfer: 'Office Transfer', expense: 'Expense', salary: 'Salary' }

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>📱 JazzCash</h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Statement and reconciliation of all JazzCash transactions.</p>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', background: 'white', padding: '6px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        {[
          { key: 'statement', label: '📊 Statement' },
          { key: 'reconcile', label: '✅ Reconcile' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: activeTab === tab.key ? '700' : '400', background: activeTab === tab.key ? '#9c27b0' : '#f0f0f0', color: activeTab === tab.key ? 'white' : '#555' }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── STATEMENT TAB ── */}
      {activeTab === 'statement' && (
        <div>
          {/* Date filter */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>From</label>
                <input type="date" value={stmtFrom} onChange={e => setStmtFrom(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>To</label>
                <input type="date" value={stmtTo} onChange={e => setStmtTo(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { label: 'Today', fn: () => { const t = new Date().toISOString().split('T')[0]; setStmtFrom(t); setStmtTo(t) } },
                  { label: 'This Month', fn: () => { const d = new Date(); setStmtFrom(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]); setStmtTo(d.toISOString().split('T')[0]) } },
                  { label: 'Last 30', fn: () => { const d = new Date(); const f = new Date(d); f.setDate(f.getDate() - 30); setStmtFrom(f.toISOString().split('T')[0]); setStmtTo(d.toISOString().split('T')[0]) } },
                ].map(q => (
                  <button key={q.label} onClick={q.fn}
                    style={{ padding: '8px 12px', background: '#f0f0f0', color: '#555', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {stmtLoading ? (
            <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading statement...</p>
          ) : (
            <>
              {/* Summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                <div style={{ background: 'linear-gradient(135deg, #0f4c81, #1565c0)', color: 'white', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                  <p style={{ fontSize: '11px', opacity: 0.8, margin: '0 0 4px' }}>🏦 Opening</p>
                  <p style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>Rs. {(stmtSummary.openingBalance || 0).toLocaleString()}</p>
                </div>
                <div style={{ background: 'linear-gradient(135deg, #1a7a4a, #2e7d32)', color: 'white', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                  <p style={{ fontSize: '11px', opacity: 0.8, margin: '0 0 4px' }}>📥 Total In</p>
                  <p style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>Rs. {stmtSummary.totalIn.toLocaleString()}</p>
                </div>
                <div style={{ background: 'linear-gradient(135deg, #c62828, #e65100)', color: 'white', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                  <p style={{ fontSize: '11px', opacity: 0.8, margin: '0 0 4px' }}>📤 Total Out</p>
                  <p style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>Rs. {stmtSummary.totalOut.toLocaleString()}</p>
                </div>
                <div style={{ background: stmtSummary.closing >= 0 ? 'linear-gradient(135deg, #7b1fa2, #9c27b0)' : 'linear-gradient(135deg, #c62828, #7b1fa2)', color: 'white', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                  <p style={{ fontSize: '11px', opacity: 0.8, margin: '0 0 4px' }}>💰 Balance</p>
                  <p style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>Rs. {(stmtSummary.closing || 0).toLocaleString()}</p>
                </div>
              </div>

              {/* Statement */}
              <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: '14px' }}>
                {/* Header */}
                <div style={{ background: '#9c27b0', padding: '14px 16px' }}>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: 'white', margin: '0 0 2px' }}>📱 JazzCash Account Statement</p>
                  <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', margin: 0 }}>
                    {new Date(stmtFrom).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })} — {new Date(stmtTo).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>

                {stmtEntries.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center' }}>
                    <p style={{ fontSize: '32px', margin: '0 0 8px' }}>📭</p>
                    <p style={{ color: '#888', fontSize: '13px' }}>No JazzCash transactions in this period</p>
                  </div>
                ) : (
                  <>
                    {/* Opening */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f8f9fa', borderBottom: '2px solid #e0e0e0' }}>
                      <div>
                        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', margin: 0 }}>Opening Balance</p>
                        <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>Before {new Date(stmtFrom).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })}</p>
                      </div>
                      <p style={{ fontSize: '16px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {(stmtSummary.openingBalance || 0).toLocaleString()}</p>
                    </div>

                    {/* Entries */}
                    {stmtEntries.map((e, idx) => (
                      <div key={e.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 16px', borderBottom: '1px solid #f5f5f5',
                        background: idx % 2 === 0 ? 'white' : '#fafafa'
                      }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1, minWidth: 0 }}>
                          <div style={{
                            width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                            background: e.type === 'in' ? '#e8f5e9' : '#ffebee',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px'
                          }}>
                            {categoryIcon[e.category] || '📋'}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: '13px', fontWeight: '600', color: '#333', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {e.label}
                            </p>
                            <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {e.sublabel}
                            </p>
                            <p style={{ fontSize: '10px', color: '#bbb', margin: 0 }}>
                              {new Date(e.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                              {' · '}<span style={{ background: e.type === 'in' ? '#e8f5e9' : '#ffebee', color: e.type === 'in' ? '#1a7a4a' : '#c62828', padding: '1px 5px', borderRadius: '4px', fontWeight: '600', fontSize: '10px' }}>
                                {categoryLabel[e.category]}
                              </span>
                            </p>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                          <p style={{ fontSize: '14px', fontWeight: '700', margin: '0 0 2px', color: e.type === 'in' ? '#1a7a4a' : '#c62828' }}>
                            {e.type === 'in' ? '+' : '−'} Rs. {e.amount.toLocaleString()}
                          </p>
                          <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>
                            Bal: Rs. {e.balance.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}

                    {/* Closing */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: '#f3e5f5', borderTop: '2px solid #9c27b0' }}>
                      <div>
                        <p style={{ fontSize: '14px', fontWeight: '700', color: '#7b1fa2', margin: '0 0 2px' }}>Closing Balance</p>
                        <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>
                          In Rs. {stmtSummary.totalIn.toLocaleString()} − Out Rs. {stmtSummary.totalOut.toLocaleString()}
                        </p>
                      </div>
                      <p style={{ fontSize: '22px', fontWeight: '700', color: stmtSummary.closing >= 0 ? '#7b1fa2' : '#c62828', margin: 0 }}>
                        Rs. {stmtSummary.closing.toLocaleString()}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* IN/OUT breakdown */}
              {stmtEntries.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {/* Money In breakdown */}
                  <div style={{ background: 'white', borderRadius: '12px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <p style={{ fontSize: '12px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 10px' }}>📥 Money In</p>
                    {['sale', 'collection', 'rider_transfer'].map(cat => {
                      const total = stmtEntries.filter(e => e.type === 'in' && e.category === cat).reduce((s, e) => s + e.amount, 0)
                      if (total === 0) return null
                      return (
                        <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
                          <span style={{ fontSize: '12px', color: '#555' }}>{categoryIcon[cat]} {categoryLabel[cat]}</span>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: '#1a7a4a' }}>Rs. {total.toLocaleString()}</span>
                        </div>
                      )
                    })}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#333' }}>Total</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a' }}>Rs. {stmtSummary.totalIn.toLocaleString()}</span>
                    </div>
                  </div>
                  {/* Money Out breakdown */}
                  <div style={{ background: 'white', borderRadius: '12px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <p style={{ fontSize: '12px', fontWeight: '700', color: '#c62828', margin: '0 0 10px' }}>📤 Money Out</p>
                    {['transfer', 'expense', 'salary'].map(cat => {
                      const total = stmtEntries.filter(e => e.type === 'out' && e.category === cat).reduce((s, e) => s + e.amount, 0)
                      if (total === 0) return null
                      return (
                        <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
                          <span style={{ fontSize: '12px', color: '#555' }}>{categoryIcon[cat]} {categoryLabel[cat]}</span>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: '#c62828' }}>Rs. {total.toLocaleString()}</span>
                        </div>
                      )
                    })}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#333' }}>Total</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#c62828' }}>Rs. {stmtSummary.totalOut.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── RECONCILE TAB ── */}
      {activeTab === 'reconcile' && (
        <div>
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
                {[{ key: 'pending', label: '⏳ Pending' }, { key: 'confirmed', label: '✅ Confirmed' }, { key: 'all', label: '📋 All' }].map(f => (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    style={{ padding: '8px 14px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: filter === f.key ? '#0f4c81' : '#f0f0f0', color: filter === f.key ? 'white' : '#555', fontWeight: filter === f.key ? '700' : '400', fontSize: '13px' }}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Summary */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', margin: '0 0 12px', textTransform: 'uppercase' }}>
              📱 JazzCash Position — {new Date(dateFrom).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })} to {new Date(dateTo).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              {[
                { label: '📥 Confirmed In', value: jazzSummary.in, color: '#1a7a4a', bg: '#e8f5e9' },
                { label: '📤 Transferred Out', value: jazzSummary.out, color: '#0f4c81', bg: '#e3f0ff' },
                { label: '⏳ Still Pending', value: jazzSummary.pending, color: '#e65100', bg: '#fff3e0' },
                { label: '💰 Net in Hand', value: jazzSummary.in - jazzSummary.out, color: jazzSummary.in - jazzSummary.out >= 0 ? '#9c27b0' : '#c62828', bg: '#f3e5f5' },
              ].map(card => (
                <div key={card.label} style={{ background: card.bg, borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <p style={{ fontSize: '11px', color: '#666', margin: '0 0 4px', fontWeight: '600' }}>{card.label}</p>
                  <p style={{ fontSize: '18px', fontWeight: '700', color: card.color, margin: 0 }}>Rs. {Math.abs(card.value).toLocaleString()}</p>
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
                  <p style={{ fontSize: '14px', fontWeight: '700', color: card.color, margin: 0 }}>Rs. {card.value.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>

          {loading ? <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p> : (
            <div>
              {/* JazzCash Sales — mobile cards */}
              {sectionHead('🍶 JazzCash Sales', deliveries.filter(e => !e.jazzcash_confirmed && !e.is_voided).length)}
              {deliveries.length === 0 ? (
                <div style={{ background: 'white', borderRadius: '12px', padding: '24px', textAlign: 'center', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>No JazzCash sales for this period.</p>
                </div>
              ) : deliveries.map(e => (
                <div key={e.id} style={{ background: e.is_voided ? '#fff5f5' : e.jazzcash_confirmed ? '#fafffe' : '#fffbf5', borderRadius: '12px', padding: '14px 16px', marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid ' + (e.is_voided ? '#ffcdd2' : e.jazzcash_confirmed ? '#e1bee7' : '#ffe082') }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: '0 0 2px' }}>{e.customers?.full_name || 'Walk-in'}</p>
                      <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>{e.customers?.mobile || ''}</p>
                      <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>
                        🚴 {e.riders?.full_name || '—'} · {new Date(e.delivered_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })} {new Date(e.delivered_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '18px', fontWeight: '700', color: '#9c27b0', margin: '0 0 4px' }}>Rs. {Number(e.total_amount).toLocaleString()}</p>
                      {statusBadge(e)}
                    </div>
                  </div>
                  <p style={{ fontSize: '12px', color: '#555', margin: '0 0 10px' }}>
                    {e.qty_19l > 0 ? `19L×${e.qty_19l} ` : ''}{e.qty_half_litre > 0 ? `Half×${e.qty_half_litre} ` : ''}{e.qty_1_5l > 0 ? `1.5L×${e.qty_1_5l}` : ''}
                  </p>
                  <ActionButtons entry={e} type="d" />
                </div>
              ))}

              {/* JazzCash Payments — mobile cards */}
              {sectionHead('💵 JazzCash Payments', payments.filter(e => !e.jazzcash_confirmed && !e.is_voided).length)}
              {payments.length === 0 ? (
                <div style={{ background: 'white', borderRadius: '12px', padding: '24px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <p style={{ color: '#888', fontSize: '13px', margin: 0 }}>No JazzCash payments for this period.</p>
                </div>
              ) : payments.map(e => (
                <div key={e.id} style={{ background: e.is_voided ? '#fff5f5' : e.jazzcash_confirmed ? '#fafffe' : '#fffbf5', borderRadius: '12px', padding: '14px 16px', marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid ' + (e.is_voided ? '#ffcdd2' : e.jazzcash_confirmed ? '#e1bee7' : '#ffe082') }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: '0 0 2px' }}>{e.customers?.full_name || '—'}</p>
                      <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>{e.customers?.mobile || ''}</p>
                      <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>
                        🚴 {e.riders?.full_name || '—'} · {new Date(e.created_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })} {new Date(e.created_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '18px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 4px' }}>Rs. {Number(e.amount).toLocaleString()}</p>
                      {statusBadge(e)}
                    </div>
                  </div>
                  {e.notes && <p style={{ fontSize: '12px', color: '#888', margin: '0 0 10px', fontStyle: 'italic' }}>{e.notes}</p>}
                  <ActionButtons entry={e} type="p" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
