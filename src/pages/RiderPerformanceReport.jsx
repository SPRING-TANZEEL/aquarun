import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

export default function RiderPerformanceReport({ rider, tenantId, onClose }) {
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState(null)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { fetchReport() }, [dateFrom, dateTo])

  async function fetchReport() {
    setLoading(true)
    const from = dateFrom + 'T00:00:00'
    const to = dateTo + 'T23:59:59'

    const [
      { data: deliveries },
      { data: payments },
      { data: expenses },
      { data: transfers },
    ] = await Promise.all([
      supabase.from('deliveries')
        .select('*, customers(full_name, customer_code)')
        .eq('rider_id', rider.id).eq('tenant_id', tenantId)
        .eq('is_voided', false)
        .gte('delivered_at', from).lte('delivered_at', to),
      supabase.from('payments')
        .select('*, customers(full_name)')
        .eq('rider_id', rider.id).eq('tenant_id', tenantId)
        .eq('is_voided', false)
        .gte('created_at', from).lte('created_at', to),
      supabase.from('expenses')
        .select('*')
        .eq('rider_id', rider.id).eq('tenant_id', tenantId)
        .eq('is_voided', false)
        .gte('created_at', from).lte('created_at', to),
      supabase.from('cash_transfers')
        .select('*')
        .eq('from_rider_id', rider.id).eq('tenant_id', tenantId)
        .eq('to_office', true).eq('status', 'confirmed')
        .gte('transfer_date', dateFrom).lte('transfer_date', dateTo),
    ])

    let totalSales = 0, cashSales = 0, jazzSales = 0, creditSales = 0
    let totalBottles19 = 0, totalBottlesHalf = 0
    deliveries?.forEach(d => {
      const amt = Number(d.total_with_tax || d.total_amount || 0)
      totalSales += amt
      totalBottles19 += Number(d.qty_19l || 0)
      totalBottlesHalf += Number(d.qty_half_litre || 0)
      if (d.payment_method === 'cash') cashSales += Number(d.amount_received || 0)
      else if (d.payment_method === 'jazzcash') jazzSales += amt
      else if (d.payment_method === 'credit') creditSales += amt
    })

    const cashCollections = payments?.filter(p => p.payment_method === 'cash').reduce((s, p) => s + Number(p.amount), 0) || 0
    const jazzCollections = payments?.filter(p => p.payment_method === 'jazzcash').reduce((s, p) => s + Number(p.amount), 0) || 0
    const totalCollected = cashSales + cashCollections + jazzSales + jazzCollections
    const collectionRate = totalSales > 0 ? Math.round(totalCollected / totalSales * 100) : 0

    const expByCategory = {}
    expenses?.forEach(e => {
      const cat = e.expense_type || 'other'
      expByCategory[cat] = (expByCategory[cat] || 0) + Number(e.amount)
    })
    const totalExpenses = Object.values(expByCategory).reduce((s, v) => s + v, 0)
    const totalTransferred = transfers?.reduce((s, t) => s + Number(t.amount), 0) || 0
    const netToOffice = cashSales + cashCollections - totalExpenses - totalTransferred

    const customerMap = {}
    deliveries?.forEach(d => {
      const id = d.customer_id
      const name = d.customers?.full_name || 'Walk-in'
      if (!customerMap[id]) customerMap[id] = {
        name, deliveries: 0, bottles19: 0,
        totalSales: 0, cash: 0, jazz: 0, credit: 0, lastDate: null
      }
      customerMap[id].deliveries++
      customerMap[id].bottles19 += Number(d.qty_19l || 0)
      const amt = Number(d.total_with_tax || d.total_amount || 0)
      customerMap[id].totalSales += amt
      if (d.payment_method === 'cash') customerMap[id].cash += Number(d.amount_received || 0)
      else if (d.payment_method === 'jazzcash') customerMap[id].jazz += amt
      else if (d.payment_method === 'credit') customerMap[id].credit += amt
      const date = d.delivered_at?.split('T')[0]
      if (!customerMap[id].lastDate || date > customerMap[id].lastDate) customerMap[id].lastDate = date
    })
    payments?.forEach(p => {
      const id = p.customer_id
      if (customerMap[id]) {
        if (p.payment_method === 'cash') customerMap[id].cash += Number(p.amount)
        else if (p.payment_method === 'jazzcash') customerMap[id].jazz += Number(p.amount)
      }
    })

    const customers = Object.values(customerMap).sort((a, b) => b.totalSales - a.totalSales)

    setReport({
      totalSales, cashSales, jazzSales, creditSales,
      cashCollections, jazzCollections,
      totalCollected, collectionRate,
      totalBottles19, totalBottlesHalf,
      expByCategory, totalExpenses,
      totalTransferred, netToOffice,
      customers,
      deliveriesCount: deliveries?.length || 0,
      customersCount: customers.length,
    })
    setLoading(false)
  }

  async function handleExcelExport() {
    if (!report) return
    const rows = [
      ['Rider Performance Report'],
      [`Rider: ${rider.full_name}`],
      [`Period: ${dateFrom} to ${dateTo}`],
      [],
      ['SUMMARY'],
      ['Total Deliveries', report.deliveriesCount],
      ['Customers Served', report.customersCount],
      ['Total 19L Bottles', report.totalBottles19],
      ['Total Sales', report.totalSales],
      ['Cash Sales', report.cashSales],
      ['JazzCash Sales', report.jazzSales],
      ['Credit Sales', report.creditSales],
      ['Cash Collections', report.cashCollections],
      ['Collection Rate %', report.collectionRate + '%'],
      ['Total Expenses', report.totalExpenses],
      ['Transferred to Office', report.totalTransferred],
      ['Net to Office', report.netToOffice],
      [],
      ['EXPENSES BY CATEGORY'],
      ...Object.entries(report.expByCategory).map(([cat, amt]) => [cat.toUpperCase(), amt]),
      [],
      ['CUSTOMER BREAKDOWN'],
      ['Customer', 'Deliveries', '19L Bottles', 'Total Sales', 'Cash', 'JazzCash', 'Credit', 'Last Delivery'],
      ...report.customers.map(c => [c.name, c.deliveries, c.bottles19, c.totalSales, c.cash, c.jazz, c.credit, c.lastDate])
    ]
    const csvContent = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${rider.full_name}_report_${dateFrom}_${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const expIcons = { fuel: '⛽', refreshment: '🍱', repair: '🔧', other: '📦', salary: '💼' }

  const fmt = n => 'Rs. ' + Number(n || 0).toLocaleString()

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(15,28,48,0.85)',
      zIndex: 9999, display: 'flex',
      alignItems: 'flex-start', justifyContent: 'center',
      padding: '16px', overflowY: 'auto',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: '#f4f6f9', borderRadius: 16,
        width: '100%', maxWidth: 900,
        boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        overflow: 'hidden',
      }}>

        {/* ── TOP BAR ── */}
        <div style={{ background: '#0d1e35', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56, borderBottom: '1px solid #1e3a5f' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🚴</div>
            <span style={{ color: 'white', fontWeight: 700, fontSize: 15, letterSpacing: '-0.3px' }}>Rider Performance Report</span>
            <span style={{ background: '#1e3a5f', color: '#93c5fd', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>{rider.full_name}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => window.print()} style={{ padding: '7px 14px', background: '#1e3a5f', border: 'none', color: '#93c5fd', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>🖨️ Print</button>
            <button onClick={handleExcelExport} style={{ padding: '7px 14px', background: '#14532d', border: 'none', color: '#86efac', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>📊 Export CSV</button>
            <button onClick={onClose} style={{ padding: '7px 14px', background: '#1e293b', border: 'none', color: '#94a3b8', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✕ Close</button>
          </div>
        </div>

        {/* ── DATE CONTROLS ── */}
        <div style={{ background: '#0f2235', padding: '12px 24px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #1e3a5f' }}>
          {[
            { label: 'From', value: dateFrom, set: setDateFrom },
            { label: 'To', value: dateTo, set: setDateTo },
          ].map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{f.label}</span>
              <input type="date" value={f.value} onChange={e => f.set(e.target.value)}
                style={{ padding: '5px 10px', background: '#1e3a5f', border: '1px solid #2d4a6b', color: 'white', borderRadius: 6, fontSize: 12, outline: 'none' }} />
            </div>
          ))}
          <div style={{ height: 20, width: 1, background: '#1e3a5f' }} />
          {[
            { label: 'This Month', fn: () => { const d = new Date(); setDateFrom(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]); setDateTo(d.toISOString().split('T')[0]) } },
            { label: 'Last Month', fn: () => { const d = new Date(); setDateFrom(new Date(d.getFullYear(), d.getMonth()-1, 1).toISOString().split('T')[0]); setDateTo(new Date(d.getFullYear(), d.getMonth(), 0).toISOString().split('T')[0]) } },
            { label: 'Last 7 Days', fn: () => { const d = new Date(); const f = new Date(d); f.setDate(d.getDate()-6); setDateFrom(f.toISOString().split('T')[0]); setDateTo(d.toISOString().split('T')[0]) } },
          ].map(b => (
            <button key={b.label} onClick={b.fn}
              style={{ padding: '5px 12px', background: 'transparent', border: '1px solid #2d4a6b', color: '#64748b', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.15s' }}
              onMouseEnter={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.color = '#93c5fd' }}
              onMouseLeave={e => { e.target.style.borderColor = '#2d4a6b'; e.target.style.color = '#64748b' }}>
              {b.label}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569' }}>
            {new Date(dateFrom).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })} — {new Date(dateTo).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: 80, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
            <p style={{ color: '#64748b', fontSize: 14 }}>Generating report...</p>
          </div>
        ) : !report ? null : (
          <div style={{ padding: '20px 24px' }}>

            {/* ── KPI ROW ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 18 }}>
              {[
                { label: 'Deliveries', value: report.deliveriesCount.toLocaleString(), sub: 'Total trips', icon: '📦', accent: '#3b82f6' },
                { label: 'Customers', value: report.customersCount.toLocaleString(), sub: 'Unique served', icon: '👥', accent: '#8b5cf6' },
                { label: '19L Bottles', value: report.totalBottles19.toLocaleString(), sub: 'Units delivered', icon: '🍶', accent: '#06b6d4' },
                { label: 'Total Sales', value: fmt(report.totalSales), sub: 'All methods', icon: '💹', accent: '#10b981' },
                { label: 'Collection', value: report.collectionRate + '%', sub: 'Of total sales', icon: '📈', accent: report.collectionRate >= 80 ? '#10b981' : report.collectionRate >= 60 ? '#f59e0b' : '#ef4444' },
                { label: 'Net to Office', value: fmt(report.netToOffice), sub: 'Cash − Exp − Trans', icon: '🏦', accent: report.netToOffice >= 0 ? '#10b981' : '#ef4444' },
              ].map(k => (
                <div key={k.label} style={{
                  background: 'white', borderRadius: 10, padding: '14px 16px',
                  borderTop: `3px solid ${k.accent}`,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k.label}</span>
                    <span style={{ fontSize: 14 }}>{k.icon}</span>
                  </div>
                  <p style={{ fontSize: 18, fontWeight: 800, color: k.accent, margin: '0 0 2px', lineHeight: 1 }}>{k.value}</p>
                  <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>{k.sub}</p>
                </div>
              ))}
            </div>

            {/* ── SALES + EXPENSES ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>

              {/* Sales */}
              <div style={{ background: 'white', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ background: '#0d1e35', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13 }}>💰</span>
                  <span style={{ color: 'white', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Sales Breakdown</span>
                </div>
                <div style={{ padding: '14px 16px' }}>
                  {[
                    { label: 'Cash Sales', value: report.cashSales, color: '#10b981' },
                    { label: 'JazzCash Sales', value: report.jazzSales, color: '#8b5cf6' },
                    { label: 'Credit Sales', value: report.creditSales, color: '#ef4444' },
                    { label: 'Cash Collections', value: report.cashCollections, color: '#06b6d4' },
                    { label: 'JazzCash Collections', value: report.jazzCollections, color: '#8b5cf6' },
                  ].filter(r => r.value > 0).map(r => (
                    <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 3, height: 14, background: r.color, borderRadius: 2 }} />
                        <span style={{ fontSize: 13, color: '#475569' }}>{r.label}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: r.color }}>{fmt(r.value)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', marginTop: 4, borderTop: '2px solid #0d1e35' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0d1e35' }}>Total Sales</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#0d1e35' }}>{fmt(report.totalSales)}</span>
                  </div>
                </div>
              </div>

              {/* Expenses */}
              <div style={{ background: 'white', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ background: '#7c1a1a', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13 }}>🧾</span>
                  <span style={{ color: 'white', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Expenses by Category</span>
                </div>
                <div style={{ padding: '14px 16px' }}>
                  {Object.entries(report.expByCategory).length === 0 ? (
                    <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No expenses in this period</p>
                  ) : Object.entries(report.expByCategory).sort((a,b) => b[1]-a[1]).map(([cat, amt]) => (
                    <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 3, height: 14, background: '#f87171', borderRadius: 2 }} />
                        <span style={{ fontSize: 13, color: '#475569', textTransform: 'capitalize' }}>{expIcons[cat] || '📦'} {cat}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>{fmt(amt)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', marginTop: 4, borderTop: '2px solid #7c1a1a' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#7c1a1a' }}>Total Expenses</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#ef4444' }}>{fmt(report.totalExpenses)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── COLLECTION RATE ── */}
            <div style={{ background: 'white', borderRadius: 10, padding: '16px 20px', marginBottom: 18, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>📈 Collection Performance</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: report.collectionRate >= 80 ? '#10b981' : report.collectionRate >= 60 ? '#f59e0b' : '#ef4444' }}>{report.collectionRate}%</span>
                </div>
                <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(report.collectionRate, 100)}%`, background: report.collectionRate >= 80 ? 'linear-gradient(90deg,#10b981,#059669)' : report.collectionRate >= 60 ? 'linear-gradient(90deg,#f59e0b,#d97706)' : 'linear-gradient(90deg,#ef4444,#dc2626)', borderRadius: 4 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
                  <span>Collected: {fmt(report.totalCollected)}</span>
                  <span>Target: {fmt(report.totalSales)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {[
                  { label: 'Transferred', value: fmt(report.totalTransferred), color: '#3b82f6' },
                  { label: 'Net to Office', value: fmt(report.netToOffice), color: report.netToOffice >= 0 ? '#10b981' : '#ef4444' },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</p>
                    <p style={{ fontSize: 16, fontWeight: 800, color: s.color, margin: 0 }}>{s.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── CUSTOMER TABLE ── */}
            <div style={{ background: 'white', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ background: '#0d1e35', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>👥</span>
                  <span style={{ color: 'white', fontWeight: 700, fontSize: 13 }}>Customer Breakdown</span>
                  <span style={{ background: '#1e3a5f', color: '#93c5fd', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12 }}>{report.customers.length} customers</span>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      {['#', 'Customer', 'Deliveries', '19L', 'Total Sales', 'Cash', 'JazzCash', 'Credit', 'Last Visit'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Customer' || h === '#' ? 'left' : 'right', fontWeight: 700, color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.customers.map((c, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafbfc' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                        onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'white' : '#fafbfc'}>
                        <td style={{ padding: '9px 12px', color: '#94a3b8', fontWeight: 600, width: 32 }}>{i + 1}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: '#1e293b', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                          <span style={{ background: '#eff6ff', color: '#3b82f6', fontWeight: 700, padding: '2px 8px', borderRadius: 6, fontSize: 11 }}>{c.deliveries}</span>
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: '#06b6d4', fontWeight: 600 }}>{c.bottles19}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: '#0d1e35', fontWeight: 700 }}>{fmt(c.totalSales)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{c.cash > 0 ? fmt(c.cash) : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: '#8b5cf6', fontWeight: 600 }}>{c.jazz > 0 ? fmt(c.jazz) : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{c.credit > 0 ? fmt(c.credit) : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: '#94a3b8', fontSize: 11 }}>{c.lastDate ? new Date(c.lastDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' }) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#0d1e35', borderTop: '2px solid #1e3a5f' }}>
                      <td colSpan={2} style={{ padding: '11px 12px', fontWeight: 700, color: 'white', fontSize: 12 }}>TOTAL</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right', color: '#93c5fd', fontWeight: 700 }}>{report.deliveriesCount}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right', color: '#67e8f9', fontWeight: 700 }}>{report.totalBottles19}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right', color: '#6ee7b7', fontWeight: 800 }}>{fmt(report.totalSales)}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right', color: '#6ee7b7', fontWeight: 700 }}>{fmt(report.cashSales + report.cashCollections)}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right', color: '#c4b5fd', fontWeight: 700 }}>{fmt(report.jazzSales + report.jazzCollections)}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right', color: '#fca5a5', fontWeight: 700 }}>{fmt(report.creditSales)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div style={{ textAlign: 'center', marginTop: 16, padding: '12px', borderTop: '1px solid #e2e8f0' }}>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>
                AquaRun · Generated {new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
