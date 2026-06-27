import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function CEOCashPosition() {
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0])
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [data, setData] = useState({
    cashFromRiders: 0,
    jazzCashConfirmed: 0,
    advancesGivenByCEO: 0,
    officeExpenses: 0,
    salariesPaid: 0,
    netCash: 0,
    breakdown: {
      riderTransfers: [],
      jazzSales: [],
      jazzPayments: [],
      advances: [],
      expenses: [],
      salaries: []
    }
  })
  const [expandedSection, setExpandedSection] = useState(null)

  useEffect(() => { fetchData() }, [dateFrom, dateTo])

  async function fetchData() {
    setLoading(true)

    // 1. Cash received from riders (confirmed transfers to office)
    const { data: riderTransfers } = await supabase
      .from('cash_transfers')
      .select('*, from_rider:from_rider_id(full_name)')
      .eq('to_office', true)
      .eq('status', 'confirmed')
      .gte('transfer_date', dateFrom)
      .lte('transfer_date', dateTo)
    const cashFromRiders = riderTransfers?.reduce((s, t) => s + Number(t.amount), 0) || 0

    // 2. JazzCash confirmed — sales
    const { data: jazzSales } = await supabase
      .from('deliveries')
      .select('*, customers(full_name), riders(full_name)')
      .eq('payment_method', 'jazzcash')
      .eq('jazzcash_confirmed', true)
      .gte('delivered_at', dateFrom + 'T00:00:00')
      .lte('delivered_at', dateTo + 'T23:59:59')
    const jazzSalesTotal = jazzSales?.reduce((s, d) => s + Number(d.total_amount), 0) || 0

    // 3. JazzCash confirmed — payments
    const { data: jazzPayments } = await supabase
      .from('payments')
      .select('*, customers(full_name), riders(full_name)')
      .eq('payment_method', 'jazzcash')
      .eq('jazzcash_confirmed', true)
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59')
    const jazzPaymentsTotal = jazzPayments?.reduce((s, p) => s + Number(p.amount), 0) || 0
    const jazzCashConfirmed = jazzSalesTotal + jazzPaymentsTotal

    // 4. Salary advances given by CEO
    const { data: advances } = await supabase
      .from('salary_advances')
      .select('*, rider:rider_id(full_name)')
      .eq('requested_from', 'ceo')
      .eq('status', 'approved')
      .gte('approved_at', dateFrom + 'T00:00:00')
      .lte('approved_at', dateTo + 'T23:59:59')
    const advancesGivenByCEO = advances?.reduce((s, a) => s + Number(a.amount), 0) || 0

    // 5. Office expenses paid by CEO
    const { data: expenses } = await supabase
      .from('office_expenses')
      .select('*')
      .eq('paid_by', 'ceo')
      .gte('expense_date', dateFrom)
      .lte('expense_date', dateTo)
    const officeExpenses = expenses?.reduce((s, e) => s + Number(e.amount), 0) || 0

    // 6. Salaries paid by CEO
    const { data: salaries } = await supabase
      .from('salary_payments')
      .select('*, rider:rider_id(full_name)')
      .eq('paid_by', 'ceo')
      .gte('payment_date', dateFrom)
      .lte('payment_date', dateTo)
    const salariesPaid = salaries?.reduce((s, p) => s + Number(p.amount_paid), 0) || 0

    // Net cash
    const netCash = cashFromRiders + jazzCashConfirmed - advancesGivenByCEO - officeExpenses - salariesPaid

    setData({
      cashFromRiders,
      jazzCashConfirmed,
      jazzSalesTotal,
      jazzPaymentsTotal,
      advancesGivenByCEO,
      officeExpenses,
      salariesPaid,
      netCash,
      breakdown: {
        riderTransfers: riderTransfers || [],
        jazzSales: jazzSales || [],
        jazzPayments: jazzPayments || [],
        advances: advances || [],
        expenses: expenses || [],
        salaries: salaries || []
      }
    })
    setLoading(false)
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

  function Section({ id, title, amount, color, positive, children }) {
    const isExpanded = expandedSection === id
    return (
      <div style={{ marginBottom: '8px' }}>
        <div
          onClick={() => setExpandedSection(isExpanded ? null : id)}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', background: 'white', borderRadius: isExpanded ? '10px 10px 0 0' : '10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: 'pointer',
            borderLeft: '4px solid ' + color
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#333' }}>{title}</span>
            {children && <span style={{ fontSize: '11px', color: '#aaa' }}>{isExpanded ? '▲ hide' : '▼ details'}</span>}
          </div>
          <span style={{ fontSize: '16px', fontWeight: '700', color: positive ? '#1a7a4a' : '#e65100' }}>
            {positive ? '+' : '−'} Rs. {Math.abs(amount).toLocaleString()}
          </span>
        </div>
        {isExpanded && children && (
          <div style={{ background: '#fafafa', border: '1px solid #eee', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '12px 16px' }}>
            {children}
          </div>
        )}
      </div>
    )
  }

  if (loading) return <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>🏦 CEO Cash Position</h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Complete breakdown of cash in hand at office level.</p>
      </div>

      {/* Date Filter */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
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
              { label: 'Today', from: new Date().toISOString().split('T')[0], to: new Date().toISOString().split('T')[0] },
              { label: 'This Month', from: new Date().toISOString().slice(0, 7) + '-01', to: new Date().toISOString().split('T')[0] },
              { label: 'All Time', from: '2024-01-01', to: new Date().toISOString().split('T')[0] },
            ].map(p => (
              <button key={p.label} onClick={() => { setDateFrom(p.from); setDateTo(p.to) }}
                style={{
                  padding: '8px 14px', border: 'none', borderRadius: '8px', cursor: 'pointer',
                  background: '#f0f0f0', color: '#555', fontSize: '12px', fontWeight: '500'
                }}>{p.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Net Cash Card */}
      <div style={{
        background: data.netCash >= 0 ? '#0f4c81' : '#c62828',
        color: 'white', borderRadius: '14px', padding: '24px',
        marginBottom: '16px', textAlign: 'center'
      }}>
        <p style={{ fontSize: '13px', opacity: 0.8, margin: '0 0 8px' }}>Net Cash in Hand — CEO/Office</p>
        <p style={{ fontSize: '48px', fontWeight: '700', margin: '0 0 8px' }}>
          Rs. {data.netCash.toLocaleString()}
        </p>
        <p style={{ fontSize: '12px', opacity: 0.7, margin: 0 }}>
          {dateFrom === dateTo
            ? new Date(dateFrom).toLocaleDateString('en-PK', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
            : `${new Date(dateFrom).toLocaleDateString('en-PK')} — ${new Date(dateTo).toLocaleDateString('en-PK')}`}
        </p>
      </div>

      {/* Inflows */}
      <p style={{ fontSize: '12px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
        Cash Inflows
      </p>

      <Section id="riders" title="Cash Received from Riders" amount={data.cashFromRiders} color="#4caf50" positive={true}>
        {data.breakdown.riderTransfers.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>No cash transfers confirmed for this period.</p>
        ) : data.breakdown.riderTransfers.map(t => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>🚴 {t.from_rider?.full_name}</span>
              <span style={{ fontSize: '11px', color: '#888', marginLeft: '8px' }}>{new Date(t.confirmed_at).toLocaleDateString('en-PK')}</span>
            </div>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#1a7a4a' }}>Rs. {Number(t.amount).toLocaleString()}</span>
          </div>
        ))}
      </Section>

      <Section id="jazz" title={`JazzCash Confirmed (Sales + Payments)`} amount={data.jazzCashConfirmed} color="#9c27b0" positive={true}>
        {data.breakdown.jazzSales.length === 0 && data.breakdown.jazzPayments.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>No JazzCash confirmed for this period.</p>
        ) : (
          <div>
            {data.breakdown.jazzSales.length > 0 && (
              <div style={{ marginBottom: '10px' }}>
                <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', margin: '0 0 6px' }}>Sales</p>
                {data.breakdown.jazzSales.map(d => (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <div>
                      <span style={{ fontSize: '13px' }}>{d.customers?.full_name || 'Walk-in'}</span>
                      <span style={{ fontSize: '11px', color: '#888', marginLeft: '8px' }}>
                        {new Date(d.jazzcash_confirmed_at || d.delivered_at).toLocaleDateString('en-PK')}
                      </span>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#9c27b0' }}>Rs. {Number(d.total_amount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
            {data.breakdown.jazzPayments.length > 0 && (
              <div>
                <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', margin: '0 0 6px' }}>Balance Payments</p>
                {data.breakdown.jazzPayments.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <div>
                      <span style={{ fontSize: '13px' }}>{p.customers?.full_name || '—'}</span>
                      <span style={{ fontSize: '11px', color: '#888', marginLeft: '8px' }}>{new Date(p.created_at).toLocaleDateString('en-PK')}</span>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#9c27b0' }}>Rs. {Number(p.amount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* Outflows */}
      <p style={{ fontSize: '12px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '16px 0 8px' }}>
        Cash Outflows
      </p>

      <Section id="advances" title="Salary Advances Given by CEO" amount={data.advancesGivenByCEO} color="#e65100" positive={false}>
        {data.breakdown.advances.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>No advances given for this period.</p>
        ) : data.breakdown.advances.map(a => (
          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>🚴 {a.rider?.full_name}</span>
              <span style={{ fontSize: '11px', color: '#888', marginLeft: '8px' }}>{new Date(a.approved_at).toLocaleDateString('en-PK')}</span>
              {a.notes && <span style={{ fontSize: '11px', color: '#aaa', marginLeft: '6px' }}>— {a.notes}</span>}
            </div>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#e65100' }}>Rs. {Number(a.amount).toLocaleString()}</span>
          </div>
        ))}
      </Section>

      <Section id="expenses" title="Office Expenses" amount={data.officeExpenses} color="#f44336" positive={false}>
        {data.breakdown.expenses.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>No office expenses for this period.</p>
        ) : data.breakdown.expenses.map(e => (
          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>
                {EXPENSE_CATEGORIES[e.category]?.icon} {EXPENSE_CATEGORIES[e.category]?.label}
              </span>
              {e.description && <span style={{ fontSize: '11px', color: '#888', marginLeft: '6px' }}>— {e.description}</span>}
              <span style={{ fontSize: '11px', color: '#aaa', marginLeft: '8px' }}>{new Date(e.expense_date).toLocaleDateString('en-PK')}</span>
            </div>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#f44336' }}>Rs. {Number(e.amount).toLocaleString()}</span>
          </div>
        ))}
      </Section>

      <Section id="salaries" title="Salaries Paid" amount={data.salariesPaid} color="#795548" positive={false}>
        {data.breakdown.salaries.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>No salaries paid for this period.</p>
        ) : data.breakdown.salaries.map(s => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>🚴 {s.rider?.full_name}</span>
              <span style={{ fontSize: '11px', color: '#888', marginLeft: '8px' }}>{new Date(s.payment_date).toLocaleDateString('en-PK')}</span>
              {s.notes && <span style={{ fontSize: '11px', color: '#aaa', marginLeft: '6px' }}>— {s.notes}</span>}
            </div>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#795548' }}>Rs. {Number(s.amount_paid).toLocaleString()}</span>
          </div>
        ))}
      </Section>

      {/* Summary Table */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginTop: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>Summary</p>
        {[
          { label: 'Cash from Riders', value: data.cashFromRiders, color: '#1a7a4a', sign: '+' },
          { label: 'JazzCash Confirmed', value: data.jazzCashConfirmed, color: '#9c27b0', sign: '+' },
          { label: 'Salary Advances Given', value: data.advancesGivenByCEO, color: '#e65100', sign: '−' },
          { label: 'Office Expenses', value: data.officeExpenses, color: '#f44336', sign: '−' },
          { label: 'Salaries Paid', value: data.salariesPaid, color: '#795548', sign: '−' },
        ].map(row => (
          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: '13px', color: '#555' }}>{row.sign} {row.label}</span>
            <span style={{ fontSize: '13px', fontWeight: '700', color: row.color }}>Rs. {row.value.toLocaleString()}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0' }}>
          <span style={{ fontSize: '15px', fontWeight: '700', color: '#333' }}>= Net Cash in Hand</span>
          <span style={{ fontSize: '18px', fontWeight: '700', color: data.netCash >= 0 ? '#0f4c81' : '#c62828' }}>
            Rs. {data.netCash.toLocaleString()}
          </span>
        </div>
      </div>

      <button onClick={fetchData}
        style={{
          width: '100%', padding: '12px', background: '#f0f4ff', color: '#0f4c81',
          border: '1px solid #c8d8ff', borderRadius: '10px', cursor: 'pointer',
          fontSize: '14px', fontWeight: '600', marginTop: '16px'
        }}>
        🔄 Refresh
      </button>
    </div>
  )
}