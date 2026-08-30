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
  const printRef = useRef(null)

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

    // ── Summary ──
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

    // ── Expenses by category ──
    const expByCategory = {}
    expenses?.forEach(e => {
      const cat = e.expense_type || 'other'
      expByCategory[cat] = (expByCategory[cat] || 0) + Number(e.amount)
    })
    const totalExpenses = Object.values(expByCategory).reduce((s, v) => s + v, 0)
    const totalTransferred = transfers?.reduce((s, t) => s + Number(t.amount), 0) || 0
    const netToOffice = cashSales + cashCollections - totalExpenses - totalTransferred

    // ── Customer breakdown ──
    const customerMap = {}
    deliveries?.forEach(d => {
      const id = d.customer_id
      const name = d.customers?.full_name || 'Walk-in'
      if (!customerMap[id]) customerMap[id] = {
        name, deliveries: 0, bottles19: 0, bottlesHalf: 0,
        totalSales: 0, cash: 0, jazz: 0, credit: 0, lastDate: null
      }
      customerMap[id].deliveries++
      customerMap[id].bottles19 += Number(d.qty_19l || 0)
      customerMap[id].bottlesHalf += Number(d.qty_half_litre || 0)
      const amt = Number(d.total_with_tax || d.total_amount || 0)
      customerMap[id].totalSales += amt
      if (d.payment_method === 'cash') customerMap[id].cash += Number(d.amount_received || 0)
      else if (d.payment_method === 'jazzcash') customerMap[id].jazz += amt
      else if (d.payment_method === 'credit') customerMap[id].credit += amt
      const date = d.delivered_at?.split('T')[0]
      if (!customerMap[id].lastDate || date > customerMap[id].lastDate) customerMap[id].lastDate = date
    })
    // Add balance payments to customer map
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

  function handlePrint() {
    window.print()
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
      ['Cash Collections (Balance)', report.cashCollections],
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
      ...report.customers.map(c => [
        c.name, c.deliveries, c.bottles19,
        c.totalSales, c.cash, c.jazz, c.credit, c.lastDate
      ])
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

  const expCategoryLabels = {
    fuel: '⛽ Fuel', refreshment: '🍱 Refreshment',
    repair: '🔧 Repair', other: '📦 Other', salary: '💼 Salary'
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      zIndex: 9999, display: 'flex', alignItems: 'flex-start',
      justifyContent: 'center', padding: '20px', overflowY: 'auto'
    }}>
      <div style={{
        background: 'white', borderRadius: '16px',
        width: '100%', maxWidth: '860px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        fontFamily: 'system-ui, sans-serif'
      }} ref={printRef}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #0f4c81, #1a6bad)', padding: '20px 24px', borderRadius: '16px 16px 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>Rider Performance Report</p>
              <h2 style={{ color: 'white', fontSize: 22, fontWeight: 800, margin: '0 0 6px' }}>🚴 {rider.full_name}</h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0 }}>
                {new Date(dateFrom).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })} — {new Date(dateTo).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={handlePrint}
                style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                🖨️ Print / PDF
              </button>
              <button onClick={handleExcelExport}
                style={{ padding: '8px 16px', background: 'rgba(52,211,153,0.25)', border: '1px solid rgba(52,211,153,0.4)', color: '#6ee7b7', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                📊 Export CSV
              </button>
              <button onClick={onClose}
                style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                ✕ Close
              </button>
            </div>
          </div>

          {/* Date selectors */}
          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'From', value: dateFrom, onChange: setDateFrom },
              { label: 'To', value: dateTo, onChange: setDateTo },
            ].map(f => (
              <div key={f.label}>
                <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                <input type="date" value={f.value} onChange={e => f.onChange(e.target.value)}
                  style={{ padding: '6px 10px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, fontSize: 13, background: 'rgba(255,255,255,0.1)', color: 'white', outline: 'none' }} />
              </div>
            ))}
            {[
              { label: 'This Month', onClick: () => { const d = new Date(); setDateFrom(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]); setDateTo(d.toISOString().split('T')[0]) } },
              { label: 'Last Month', onClick: () => { const d = new Date(); setDateFrom(new Date(d.getFullYear(), d.getMonth()-1, 1).toISOString().split('T')[0]); setDateTo(new Date(d.getFullYear(), d.getMonth(), 0).toISOString().split('T')[0]) } },
              { label: 'Last 7 Days', onClick: () => { const d = new Date(); const f = new Date(d); f.setDate(d.getDate()-6); setDateFrom(f.toISOString().split('T')[0]); setDateTo(d.toISOString().split('T')[0]) } },
            ].map(b => (
              <button key={b.label} onClick={b.onClick}
                style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, alignSelf: 'flex-end' }}>
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <p style={{ fontSize: 32, marginBottom: 8 }}>📊</p>
            <p style={{ color: '#888', fontSize: 14 }}>Loading report...</p>
          </div>
        ) : !report ? null : (
          <div style={{ padding: '20px 24px' }}>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
              {[
                { label: 'Deliveries', value: report.deliveriesCount, icon: '📦', color: '#0f4c81' },
                { label: 'Customers', value: report.customersCount, icon: '👥', color: '#7c3aed' },
                { label: '19L Bottles', value: report.totalBottles19, icon: '🍶', color: '#0891b2' },
                { label: 'Total Sales', value: 'Rs. ' + report.totalSales.toLocaleString(), icon: '💰', color: '#1a7a4a' },
                { label: 'Collection Rate', value: report.collectionRate + '%', icon: '📈', color: report.collectionRate >= 80 ? '#1a7a4a' : '#c62828' },
                { label: 'Net to Office', value: 'Rs. ' + report.netToOffice.toLocaleString(), icon: '🏢', color: '#0f4c81' },
              ].map(k => (
                <div key={k.label} style={{ background: '#f8fafc', border: '1px solid #e0e7ff', borderRadius: 12, padding: '14px 16px', borderLeft: `4px solid ${k.color}` }}>
                  <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>{k.icon} {k.label}</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: k.color, margin: 0 }}>{k.value}</p>
                </div>
              ))}
            </div>

            {/* Sales Breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

              {/* Sales by Method */}
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, border: '1px solid #e0e0e0' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#0f4c81', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 0.5 }}>💰 Sales by Method</p>
                {[
                  { label: 'Cash Sales', value: report.cashSales, color: '#1a7a4a' },
                  { label: 'JazzCash Sales', value: report.jazzSales, color: '#9c27b0' },
                  { label: 'Credit Sales', value: report.creditSales, color: '#c62828' },
                  { label: 'Cash Collections', value: report.cashCollections, color: '#0891b2' },
                  { label: 'JazzCash Collections', value: report.jazzCollections, color: '#9c27b0' },
                ].filter(r => r.value > 0).map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <span style={{ fontSize: 13, color: '#555' }}>{r.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: r.color }}>Rs. {r.value.toLocaleString()}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', borderTop: '2px solid #0f4c81', marginTop: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0f4c81' }}>Total Sales</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#0f4c81' }}>Rs. {report.totalSales.toLocaleString()}</span>
                </div>
              </div>

              {/* Expenses by Category */}
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, border: '1px solid #e0e0e0' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#e65100', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 0.5 }}>🧾 Expenses by Category</p>
                {Object.entries(report.expByCategory).length === 0 ? (
                  <p style={{ fontSize: 13, color: '#aaa', textAlign: 'center', padding: '20px 0' }}>No expenses in this period</p>
                ) : Object.entries(report.expByCategory).map(([cat, amt]) => (
                  <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <span style={{ fontSize: 13, color: '#555' }}>{expCategoryLabels[cat] || cat}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#e65100' }}>Rs. {amt.toLocaleString()}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', borderTop: '2px solid #e65100', marginTop: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#e65100' }}>Total Expenses</span>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#e65100' }}>Rs. {report.totalExpenses.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Collection Rate Bar */}
            <div style={{ background: '#f0f9ff', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid #bae6fd' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f4c81' }}>📈 Collection Performance</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: report.collectionRate >= 80 ? '#1a7a4a' : '#c62828' }}>{report.collectionRate}%</span>
              </div>
              <div style={{ height: 10, background: '#e0e0e0', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(report.collectionRate, 100)}%`, background: report.collectionRate >= 80 ? '#1a7a4a' : report.collectionRate >= 60 ? '#f59e0b' : '#c62828', borderRadius: 5, transition: 'width 0.5s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#888' }}>
                <span>Collected: Rs. {report.totalCollected.toLocaleString()}</span>
                <span>Total: Rs. {report.totalSales.toLocaleString()}</span>
              </div>
            </div>

            {/* Customer Breakdown Table */}
            <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e0e0e0', overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ background: '#1e3a5f', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ color: 'white', fontWeight: 700, fontSize: 14, margin: 0 }}>👥 Customer Breakdown ({report.customers.length})</p>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f0f4ff' }}>
                      {['Customer', 'Deliveries', '19L', 'Total', 'Cash', 'JazzCash', 'Credit', 'Last Visit'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Customer' ? 'left' : 'right', fontWeight: 700, color: '#0f4c81', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap', borderBottom: '2px solid #e0e7ff' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.customers.map((c, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1a1a2e', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#0f4c81', fontWeight: 700 }}>{c.deliveries}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#0891b2', fontWeight: 600 }}>{c.bottles19}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#1a7a4a', fontWeight: 700 }}>Rs. {c.totalSales.toLocaleString()}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#1a7a4a' }}>{c.cash > 0 ? `Rs. ${c.cash.toLocaleString()}` : '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#9c27b0' }}>{c.jazz > 0 ? `Rs. ${c.jazz.toLocaleString()}` : '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#c62828' }}>{c.credit > 0 ? `Rs. ${c.credit.toLocaleString()}` : '—'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#888', fontSize: 11 }}>{c.lastDate ? new Date(c.lastDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' }) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#1e3a5f' }}>
                      <td style={{ padding: '12px', fontWeight: 700, color: 'white', fontSize: 13 }}>TOTAL</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: 'white' }}>{report.deliveriesCount}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: 'white' }}>{report.totalBottles19}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#6ee7b7' }}>Rs. {report.totalSales.toLocaleString()}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#6ee7b7' }}>Rs. {(report.cashSales + report.cashCollections).toLocaleString()}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#e9d5ff' }}>Rs. {(report.jazzSales + report.jazzCollections).toLocaleString()}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#fca5a5' }}>Rs. {report.creditSales.toLocaleString()}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

          </div>
        )}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: fixed; top: 0; left: 0; width: 100%; }
        }
      `}</style>
    </div>
  )
}
