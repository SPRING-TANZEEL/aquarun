import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function CEOCashPosition() {
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0])
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [openingCash, setOpeningCash] = useState(0)
  const [openingJazz, setOpeningJazz] = useState(0)
  const [editingOpening, setEditingOpening] = useState(false)
  const [tempCash, setTempCash] = useState('')
  const [tempJazz, setTempJazz] = useState('')
  const [savingOpening, setSavingOpening] = useState(false)
  const [data, setData] = useState(null)
  const [expandedSection, setExpandedSection] = useState(null)

  useEffect(() => { fetchAll() }, [dateFrom, dateTo])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchOpeningBalances(), fetchTransactions()])
    setLoading(false)
  }

  async function fetchOpeningBalances() {
    const { data } = await supabase
      .from('business_settings')
      .select('*')
      .in('setting_key', ['opening_cash_balance', 'opening_jazzcash_balance'])

    const map = {}
    data?.forEach(s => { map[s.setting_key] = s.setting_value })
    const cash = Number(map['opening_cash_balance'] || 0)
    const jazz = Number(map['opening_jazzcash_balance'] || 0)
    setOpeningCash(cash)
    setOpeningJazz(jazz)
    setTempCash(String(cash))
    setTempJazz(String(jazz))
    return { cash, jazz }
  }

  async function saveOpeningBalances() {
    setSavingOpening(true)
    await supabase.from('business_settings')
      .upsert([
        { setting_key: 'opening_cash_balance', setting_value: String(Number(tempCash) || 0) },
        { setting_key: 'opening_jazzcash_balance', setting_value: String(Number(tempJazz) || 0) },
      ], { onConflict: 'setting_key' })
    setOpeningCash(Number(tempCash) || 0)
    setOpeningJazz(Number(tempJazz) || 0)
    setEditingOpening(false)
    setSavingOpening(false)
    fetchAll()
  }

  async function fetchTransactions() {
    // Cash from riders
    const { data: riderTransfers } = await supabase
      .from('cash_transfers')
      .select('*, from_rider:from_rider_id(full_name)')
      .eq('to_office', true)
      .eq('status', 'confirmed')
      .gte('transfer_date', dateFrom)
      .lte('transfer_date', dateTo)
    const cashFromRiders = riderTransfers?.reduce((s, t) => s + Number(t.amount), 0) || 0

    // JazzCash confirmed sales
    const { data: jazzSales } = await supabase
      .from('deliveries')
      .select('*, customers(full_name), riders(full_name)')
      .eq('payment_method', 'jazzcash')
      .eq('jazzcash_confirmed', true)
      .eq('is_voided', false)
      .gte('delivered_at', dateFrom + 'T00:00:00')
      .lte('delivered_at', dateTo + 'T23:59:59')
    const jazzSalesTotal = jazzSales?.reduce((s, d) => s + Number(d.total_amount), 0) || 0

    // JazzCash confirmed payments
    const { data: jazzPayments } = await supabase
      .from('payments')
      .select('*, customers(full_name), riders(full_name)')
      .eq('payment_method', 'jazzcash')
      .eq('jazzcash_confirmed', true)
      .eq('is_voided', false)
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59')
    const jazzPaymentsTotal = jazzPayments?.reduce((s, p) => s + Number(p.amount), 0) || 0
    const jazzCashConfirmed = jazzSalesTotal + jazzPaymentsTotal

    // Advances given by CEO
    const { data: advances } = await supabase
      .from('salary_advances')
      .select('*, rider:rider_id(full_name)')
      .eq('requested_from', 'ceo')
      .eq('status', 'approved')
      .eq('is_voided', false)
      .gte('approved_at', dateFrom + 'T00:00:00')
      .lte('approved_at', dateTo + 'T23:59:59')
    const advancesGivenByCEO = advances?.reduce((s, a) => s + Number(a.amount), 0) || 0

    // Office expenses
    const { data: expenses } = await supabase
      .from('office_expenses')
      .select('*')
      .eq('is_voided', false)
      .gte('expense_date', dateFrom)
      .lte('expense_date', dateTo)
    const officeExpenses = expenses?.reduce((s, e) => s + Number(e.amount), 0) || 0

    // Salaries paid
    const { data: salaries } = await supabase
      .from('salary_payments')
      .select('*, rider:rider_id(full_name)')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59')
    const salariesPaid = salaries?.reduce((s, p) => s + Number(p.amount_paid), 0) || 0

    // JazzCash pending
    const { data: jazzPendingSales } = await supabase
      .from('deliveries')
      .select('total_amount')
      .eq('payment_method', 'jazzcash')
      .eq('jazzcash_confirmed', false)
      .eq('is_voided', false)
    const { data: jazzPendingPay } = await supabase
      .from('payments')
      .select('amount')
      .eq('payment_method', 'jazzcash')
      .eq('jazzcash_confirmed', false)
      .eq('is_voided', false)
    const jazzPending = (jazzPendingSales?.reduce((s, d) => s + Number(d.total_amount), 0) || 0) +
      (jazzPendingPay?.reduce((s, p) => s + Number(p.amount), 0) || 0)

    setData({
      cashFromRiders, jazzCashConfirmed, jazzSalesTotal, jazzPaymentsTotal,
      advancesGivenByCEO, officeExpenses, salariesPaid, jazzPending,
      breakdown: {
        riderTransfers: riderTransfers || [],
        jazzSales: jazzSales || [],
        jazzPayments: jazzPayments || [],
        advances: advances || [],
        expenses: expenses || [],
        salaries: salaries || []
      }
    })
  }

  function Section({ id, title, amount, color, positive, children, count }) {
    const isExpanded = expandedSection === id
    return (
      <div style={{ marginBottom: '8px' }}>
        <div onClick={() => setExpandedSection(isExpanded ? null : id)}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', background: 'white',
            borderRadius: isExpanded ? '10px 10px 0 0' : '10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: 'pointer',
            borderLeft: '4px solid ' + color
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>{title}</span>
            {count > 0 && <span style={{ fontSize: '10px', background: '#f0f0f0', color: '#888', padding: '2px 6px', borderRadius: '10px' }}>{count}</span>}
            <span style={{ fontSize: '11px', color: '#aaa' }}>{isExpanded ? '▲' : '▼'}</span>
          </div>
          <span style={{ fontSize: '15px', fontWeight: '700', color: positive ? '#1a7a4a' : '#e65100' }}>
            {positive ? '+' : '−'} Rs. {Math.abs(amount).toLocaleString()}
          </span>
        </div>
        {isExpanded && (
          <div style={{ background: '#fafafa', border: '1px solid #eee', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '12px 16px' }}>
            {children}
          </div>
        )}
      </div>
    )
  }

  const EXPENSE_CATEGORIES = {
    rent: { label: 'Rent', icon: '🏠' },
    electricity: { label: 'Electricity', icon: '⚡' },
    supplies: { label: 'Supplies', icon: '📦' },
    fuel: { label: 'Fuel', icon: '⛽' },
    salary: { label: 'Salary', icon: '💼' },
    maintenance: { label: 'Maintenance', icon: '🔧' },
    other: { label: 'Other', icon: '📝' },
  }

  if (loading) return <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>

  const netCash = (openingCash + (data?.cashFromRiders || 0)) -
    ((data?.advancesGivenByCEO || 0) + (data?.officeExpenses || 0) + (data?.salariesPaid || 0))

  const netJazz = openingJazz + (data?.jazzCashConfirmed || 0)

  const totalPosition = netCash + netJazz

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>🏦 CEO Cash Position</h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Complete breakdown of cash and JazzCash position.</p>
      </div>

      {/* Opening Balances Card */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e3f0ff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>📋 Opening Balances</p>
          <button onClick={() => setEditingOpening(!editingOpening)}
            style={{ padding: '4px 12px', background: editingOpening ? '#ffebee' : '#e3f0ff', color: editingOpening ? '#c62828' : '#0f4c81', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
            {editingOpening ? '✕ Cancel' : '✏️ Edit'}
          </button>
        </div>

        {editingOpening ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>💵 Cash in Hand Opening</label>
                <input type="number" value={tempCash} onChange={e => setTempCash(e.target.value)}
                  placeholder="0"
                  style={{ width: '100%', padding: '10px', border: '2px solid #c8d8ff', borderRadius: '8px', fontSize: '16px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>📱 JazzCash Opening</label>
                <input type="number" value={tempJazz} onChange={e => setTempJazz(e.target.value)}
                  placeholder="0"
                  style={{ width: '100%', padding: '10px', border: '2px solid #e9d5ff', borderRadius: '8px', fontSize: '16px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }} />
              </div>
            </div>
            <div style={{ background: '#f0f7ff', borderRadius: '8px', padding: '10px', marginBottom: '12px' }}>
              <p style={{ fontSize: '11px', color: '#0f4c81', margin: 0 }}>
                💡 Enter the cash you had in hand and JazzCash account balance before starting to use this software. This is a one-time entry.
              </p>
            </div>
            <button onClick={saveOpeningBalances} disabled={savingOpening}
              style={{ width: '100%', padding: '10px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
              {savingOpening ? 'Saving...' : '✓ Save Opening Balances'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ background: '#f0f7ff', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
              <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>💵 Cash Opening</p>
              <p style={{ fontSize: '22px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {openingCash.toLocaleString()}</p>
            </div>
            <div style={{ background: '#fdf4ff', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
              <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>📱 JazzCash Opening</p>
              <p style={{ fontSize: '22px', fontWeight: '700', color: '#9c27b0', margin: 0 }}>Rs. {openingJazz.toLocaleString()}</p>
            </div>
          </div>
        )}
      </div>

      {/* Date Filter */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', margin: '0 0 10px', textTransform: 'uppercase' }}>Transaction Period</p>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { label: 'Today', from: new Date().toISOString().split('T')[0], to: new Date().toISOString().split('T')[0] },
              { label: 'This Month', from: new Date().toISOString().slice(0, 7) + '-01', to: new Date().toISOString().split('T')[0] },
              { label: 'All Time', from: '2024-01-01', to: new Date().toISOString().split('T')[0] },
            ].map(p => (
              <button key={p.label} onClick={() => { setDateFrom(p.from); setDateTo(p.to) }}
                style={{ padding: '8px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: '#f0f0f0', color: '#555', fontSize: '12px' }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Position Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <div style={{ background: 'linear-gradient(135deg, #0f4c81, #1565c0)', color: 'white', borderRadius: '14px', padding: '18px', textAlign: 'center' }}>
          <p style={{ fontSize: '11px', opacity: 0.7, margin: '0 0 6px', textTransform: 'uppercase' }}>💵 Cash in Hand</p>
          <p style={{ fontSize: '28px', fontWeight: '700', margin: '0 0 6px' }}>Rs. {netCash.toLocaleString()}</p>
          <div style={{ fontSize: '10px', opacity: 0.6 }}>
            <p style={{ margin: '2px 0' }}>Opening: Rs. {openingCash.toLocaleString()}</p>
            <p style={{ margin: '2px 0' }}>+ From Riders: Rs. {(data?.cashFromRiders || 0).toLocaleString()}</p>
            <p style={{ margin: '2px 0' }}>− Out: Rs. {((data?.advancesGivenByCEO || 0) + (data?.officeExpenses || 0) + (data?.salariesPaid || 0)).toLocaleString()}</p>
          </div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #6a1b9a, #9c27b0)', color: 'white', borderRadius: '14px', padding: '18px', textAlign: 'center' }}>
          <p style={{ fontSize: '11px', opacity: 0.7, margin: '0 0 6px', textTransform: 'uppercase' }}>📱 JazzCash</p>
          <p style={{ fontSize: '28px', fontWeight: '700', margin: '0 0 6px' }}>Rs. {netJazz.toLocaleString()}</p>
          <div style={{ fontSize: '10px', opacity: 0.6 }}>
            <p style={{ margin: '2px 0' }}>Opening: Rs. {openingJazz.toLocaleString()}</p>
            <p style={{ margin: '2px 0' }}>+ Confirmed: Rs. {(data?.jazzCashConfirmed || 0).toLocaleString()}</p>
            {data?.jazzPending > 0 && <p style={{ margin: '2px 0', color: '#ffcc80' }}>⏳ Pending: Rs. {data.jazzPending.toLocaleString()}</p>}
          </div>
        </div>
      </div>

      {/* Total Position Banner */}
      <div style={{
        background: totalPosition >= 0 ? 'linear-gradient(135deg, #0f4c81, #1a7a4a)' : 'linear-gradient(135deg, #c62828, #e65100)',
        color: 'white', borderRadius: '14px', padding: '20px',
        marginBottom: '20px', textAlign: 'center',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
      }}>
        <p style={{ fontSize: '12px', opacity: 0.7, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total Position (Cash + JazzCash)</p>
        <p style={{ fontSize: '44px', fontWeight: '700', margin: '0 0 4px', letterSpacing: '-1px' }}>
          Rs. {totalPosition.toLocaleString()}
        </p>
        <p style={{ fontSize: '11px', opacity: 0.6, margin: 0 }}>
          Cash Rs. {netCash.toLocaleString()} + JazzCash Rs. {netJazz.toLocaleString()}
        </p>
      </div>

      {/* JazzCash Pending Alert */}
      {data?.jazzPending > 0 && (
        <div style={{ background: '#fff3e0', border: '1px solid #ffe082', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#e65100', margin: '0 0 4px' }}>⏳ JazzCash Pending Confirmation</p>
          <p style={{ fontSize: '12px', color: '#795548', margin: 0 }}>
            Rs. {data.jazzPending.toLocaleString()} in JazzCash payments are awaiting your confirmation. Once confirmed they will be added to your JazzCash balance.
          </p>
        </div>
      )}

      {/* Cash Inflows */}
      <p style={{ fontSize: '12px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
        💵 Cash Inflows
      </p>

      <Section id="riders" title="Cash Received from Riders"
        amount={data?.cashFromRiders || 0} color="#4caf50" positive={true}
        count={data?.breakdown.riderTransfers.length}>
        {data?.breakdown.riderTransfers.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>No cash transfers for this period.</p>
        ) : data?.breakdown.riderTransfers.map(t => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>🚴 {t.from_rider?.full_name}</span>
              <span style={{ fontSize: '11px', color: '#888', marginLeft: '8px' }}>{new Date(t.transfer_date).toLocaleDateString('en-PK')}</span>
            </div>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#1a7a4a' }}>Rs. {Number(t.amount).toLocaleString()}</span>
          </div>
        ))}
      </Section>

      {/* JazzCash Inflows */}
      <p style={{ fontSize: '12px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '16px 0 8px' }}>
        📱 JazzCash Inflows
      </p>

      <Section id="jazz" title="JazzCash Confirmed (Sales + Payments)"
        amount={data?.jazzCashConfirmed || 0} color="#9c27b0" positive={true}
        count={(data?.breakdown.jazzSales.length || 0) + (data?.breakdown.jazzPayments.length || 0)}>
        {data?.breakdown.jazzSales.length === 0 && data?.breakdown.jazzPayments.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>No JazzCash confirmed for this period.</p>
        ) : (
          <div>
            {data?.breakdown.jazzSales.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', margin: '0 0 6px' }}>Sales</p>
                {data.breakdown.jazzSales.map(d => (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <span style={{ fontSize: '13px' }}>{d.customers?.full_name || 'Walk-in'}</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#9c27b0' }}>Rs. {Number(d.total_amount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
            {data?.breakdown.jazzPayments.length > 0 && (
              <div>
                <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', margin: '0 0 6px' }}>Balance Payments</p>
                {data.breakdown.jazzPayments.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <span style={{ fontSize: '13px' }}>{p.customers?.full_name || '—'}</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#9c27b0' }}>Rs. {Number(p.amount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Cash Outflows */}
      <p style={{ fontSize: '12px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '16px 0 8px' }}>
        📤 Cash Outflows
      </p>

      <Section id="advances" title="Salary Advances Given by CEO"
        amount={data?.advancesGivenByCEO || 0} color="#e65100" positive={false}
        count={data?.breakdown.advances.length}>
        {data?.breakdown.advances.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>No advances for this period.</p>
        ) : data?.breakdown.advances.map(a => (
          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>🚴 {a.rider?.full_name}</span>
              <span style={{ fontSize: '11px', color: '#888', marginLeft: '8px' }}>{new Date(a.approved_at).toLocaleDateString('en-PK')}</span>
            </div>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#e65100' }}>Rs. {Number(a.amount).toLocaleString()}</span>
          </div>
        ))}
      </Section>

      <Section id="expenses" title="Office Expenses"
        amount={data?.officeExpenses || 0} color="#f44336" positive={false}
        count={data?.breakdown.expenses.length}>
        {data?.breakdown.expenses.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>No office expenses for this period.</p>
        ) : data?.breakdown.expenses.map(e => (
          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>
                {EXPENSE_CATEGORIES[e.category]?.icon} {EXPENSE_CATEGORIES[e.category]?.label || e.category}
              </span>
              {e.description && <span style={{ fontSize: '11px', color: '#888', marginLeft: '6px' }}>— {e.description}</span>}
              <span style={{ fontSize: '11px', color: '#aaa', marginLeft: '8px' }}>{new Date(e.expense_date).toLocaleDateString('en-PK')}</span>
            </div>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#f44336' }}>Rs. {Number(e.amount).toLocaleString()}</span>
          </div>
        ))}
      </Section>

      <Section id="salaries" title="Salaries Paid"
        amount={data?.salariesPaid || 0} color="#795548" positive={false}
        count={data?.breakdown.salaries.length}>
        {data?.breakdown.salaries.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>No salaries paid for this period.</p>
        ) : data?.breakdown.salaries.map(s => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>🚴 {s.rider?.full_name}</span>
              <span style={{ fontSize: '11px', color: '#888', marginLeft: '8px' }}>{new Date(s.created_at).toLocaleDateString('en-PK')}</span>
            </div>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#795548' }}>Rs. {Number(s.amount_paid).toLocaleString()}</span>
          </div>
        ))}
      </Section>

      {/* Summary Table */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginTop: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>📊 Full Summary</p>
        {[
          { label: '+ Opening Cash', value: openingCash, color: '#0f4c81' },
          { label: '+ Cash from Riders', value: data?.cashFromRiders || 0, color: '#1a7a4a' },
          { label: '− Advances Given', value: -(data?.advancesGivenByCEO || 0), color: '#e65100' },
          { label: '− Office Expenses', value: -(data?.officeExpenses || 0), color: '#f44336' },
          { label: '− Salaries Paid', value: -(data?.salariesPaid || 0), color: '#795548' },
          { label: '+ Opening JazzCash', value: openingJazz, color: '#6a1b9a' },
          { label: '+ JazzCash Confirmed', value: data?.jazzCashConfirmed || 0, color: '#9c27b0' },
        ].filter(r => r.value !== 0).map(r => (
          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: '13px', color: '#555' }}>{r.label}</span>
            <span style={{ fontSize: '13px', fontWeight: '700', color: r.color }}>
              {r.value < 0 ? '− ' : '+ '}Rs. {Math.abs(r.value).toLocaleString()}
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 4px', borderTop: '2px solid #0f4c81', marginTop: '4px' }}>
          <span style={{ fontSize: '14px', fontWeight: '700', color: '#333' }}>💵 Cash in Hand</span>
          <span style={{ fontSize: '18px', fontWeight: '700', color: '#0f4c81' }}>Rs. {netCash.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 4px' }}>
          <span style={{ fontSize: '14px', fontWeight: '700', color: '#333' }}>📱 JazzCash Balance</span>
          <span style={{ fontSize: '18px', fontWeight: '700', color: '#9c27b0' }}>Rs. {netJazz.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', borderTop: '2px solid #333', marginTop: '8px' }}>
          <span style={{ fontSize: '15px', fontWeight: '700', color: '#333' }}>= Total Position</span>
          <span style={{ fontSize: '22px', fontWeight: '700', color: totalPosition >= 0 ? '#0f4c81' : '#c62828' }}>
            Rs. {totalPosition.toLocaleString()}
          </span>
        </div>
      </div>

      <button onClick={fetchAll}
        style={{ width: '100%', padding: '12px', background: '#f0f4ff', color: '#0f4c81', border: '1px solid #c8d8ff', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', marginTop: '16px' }}>
        🔄 Refresh
      </button>
    </div>
  )
}