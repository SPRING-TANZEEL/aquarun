import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import InvoiceModal from '../components/InvoiceModal'

export default function Reports({ tenantId }) {
  const [activeTab, setActiveTab] = useState('daily')
  const tabs = [
    { key: 'daily', label: '💵 Cash Flow' },
    { key: 'ledger', label: '📒 Customer Ledger' },
    { key: 'ageing', label: '⏳ Receivables' },
    { key: 'sales', label: '📊 Sales Summary' },
    { key: 'pl', label: '📈 P&L' },
    { key: 'tax', label: '🧾 Tax Report' },
    { key: 'executive', label: '📋 Executive' },
    { key: 'churn', label: '📋 Churn Risk' },
    { key: 'collection', label: '📥 Collections' },
    { key: 'bottles', label: '🫙 Bottles' },
    { key: 'custsales', label: '👤 Customer Sales' },
    { key: 'bulk', label: '📨 Bulk Share' },
  ]
  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>📈 Reports</h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Business reports and financial summaries.</p>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ padding: '8px 14px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: activeTab === t.key ? '#0f4c81' : '#f0f0f0', color: activeTab === t.key ? 'white' : '#555', fontWeight: activeTab === t.key ? '700' : '400', fontSize: '13px' }}>
            {t.label}
          </button>
        ))}
      </div>
      {activeTab === 'daily' && <DailyCashReport tenantId={tenantId} />}
      {activeTab === 'ledger' && <CustomerLedger tenantId={tenantId} />}
      {activeTab === 'ageing' && <ReceivablesAgeing tenantId={tenantId} />}
      {activeTab === 'sales' && <SalesSummary tenantId={tenantId} />}
      {activeTab === 'pl' && <ProfitLoss tenantId={tenantId} />}
      {activeTab === 'tax' && <SalesTaxReport tenantId={tenantId} />}
      {activeTab === 'executive' && <ExecutiveSummary tenantId={tenantId} />}
      {activeTab === 'churn' && <ChurnRisk tenantId={tenantId} />}
      {activeTab === 'collection' && <CollectionAnalysis tenantId={tenantId} />}
      {activeTab === 'bottles' && <BottleBalance tenantId={tenantId} />}
      {activeTab === 'custsales' && <CustomerSales tenantId={tenantId} />}
      {activeTab === 'bulk' && <BulkWhatsAppShare tenantId={tenantId} />}
    </div>
  )
}

// ─── DAILY CASH FLOW REPORT ─────────────────────────────────────────────
function DailyCashReport({ tenantId }) {
  const today = new Date().toISOString().split('T')[0]
  const firstOfMonth = new Date().toISOString().slice(0, 7) + '-01'

  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo]     = useState(today)
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const [bizName, setBizName]   = useState('')

  useEffect(() => { if (tenantId) { fetchBizName(); fetchReport() } }, [tenantId])

  async function fetchBizName() {
    const { data: s } = await supabase.from('business_settings').select('setting_value').eq('tenant_id', tenantId).eq('setting_key', 'business_name').maybeSingle()
    setBizName(s?.setting_value || '')
  }

  async function fetchReport(from = dateFrom, to = dateTo) {
    setLoading(true)
    const fromDT = from + 'T00:00:00'
    const toDT   = to   + 'T23:59:59'

    const [
      { data: deliveries },
      { data: payments },
      { data: expenses },
      { data: officeExpenses },
      { data: advances },
      { data: salaryPayments },
    ] = await Promise.all([
      supabase.from('deliveries').select('*, riders(full_name)').eq('tenant_id', tenantId).gte('delivered_at', fromDT).lte('delivered_at', toDT).eq('is_voided', false),
      supabase.from('payments').select('*, riders(full_name)').eq('tenant_id', tenantId).gte('payment_date', from).lte('payment_date', to).eq('is_voided', false),
      supabase.from('expenses').select('*, riders(full_name)').eq('tenant_id', tenantId).gte('expense_date', from).lte('expense_date', to).eq('is_voided', false),
      supabase.from('office_expenses').select('*').eq('tenant_id', tenantId).gte('expense_date', from).lte('expense_date', to).eq('is_voided', false),
      supabase.from('salary_advances').select('*, riders(full_name)').eq('tenant_id', tenantId).eq('status', 'approved').eq('is_voided', false).gte('approved_at', fromDT).lte('approved_at', toDT),
      supabase.from('salary_payments').select('*, riders(full_name)').eq('tenant_id', tenantId).gte('created_at', fromDT).lte('created_at', toDT),
    ])

    let cashFromSales = 0, cashFromPayments = 0
    let jazzConfirmed = 0, jazzPending = 0
    let epConfirmed = 0, epPending = 0
    let bankConfirmed = 0, bankPending = 0
    let creditSales = 0, totalSalesValue = 0
    const riderCash = {}

    deliveries?.forEach(d => {
      const amt = Number(d.total_with_tax || d.total_amount)
      totalSalesValue += amt
      const pm = d.payment_method
      if (pm === 'cash') {
        cashFromSales += Number(d.amount_received || amt)
        const name = d.riders?.full_name || 'Walk-in / Admin'
        riderCash[name] = (riderCash[name] || 0) + Number(d.amount_received || amt)
      }
      if (pm === 'jazzcash')  { d.jazzcash_confirmed ? jazzConfirmed += amt : jazzPending += amt }
      if (pm === 'easypaisa') { d.jazzcash_confirmed ? epConfirmed   += amt : epPending   += amt }
      if (pm === 'bank')      { d.jazzcash_confirmed ? bankConfirmed += amt : bankPending  += amt }
      if (pm === 'credit')    { creditSales += amt }
    })

    payments?.forEach(p => {
      const amt = Number(p.amount)
      const pm = p.payment_method
      if (pm === 'cash') {
        cashFromPayments += amt
        const name = p.riders?.full_name || 'Admin'
        riderCash[name] = (riderCash[name] || 0) + amt
      }
      if (pm === 'jazzcash')  { p.jazzcash_confirmed ? jazzConfirmed += amt : jazzPending += amt }
      if (pm === 'easypaisa') { p.jazzcash_confirmed ? epConfirmed   += amt : epPending   += amt }
      if (pm === 'bank')      { p.jazzcash_confirmed ? bankConfirmed += amt : bankPending  += amt }
    })

    const totalCashIn    = cashFromSales + cashFromPayments
    const riderExpTotal  = expenses?.reduce((s, e) => s + Number(e.amount), 0) || 0
    const officeExpTotal = officeExpenses?.reduce((s, e) => s + Number(e.amount), 0) || 0
    const advancesTotal  = advances?.reduce((s, a) => s + Number(a.amount), 0) || 0
    const salariesTotal  = salaryPayments?.reduce((s, p) => s + Number(p.amount_paid), 0) || 0
    const totalCashOut   = riderExpTotal + officeExpTotal + advancesTotal + salariesTotal
    const netCash        = totalCashIn - totalCashOut

    setData({
      cashFromSales, cashFromPayments, totalCashIn,
      jazzConfirmed, jazzPending, epConfirmed, epPending, bankConfirmed, bankPending,
      creditSales, totalSalesValue,
      riderExpTotal, officeExpTotal, advancesTotal, salariesTotal, totalCashOut,
      netCash, riderCash,
      expenses, officeExpenses, advances, salaryPayments, deliveries,
    })
    setLoading(false)
  }

  function navigate(dir) {
    const d = new Date(dateFrom); d.setDate(d.getDate() + dir)
    const nd = d.toISOString().split('T')[0]
    setDateFrom(nd); setDateTo(nd)
    fetchReport(nd, nd)
  }

  function applyQuick(from, to) {
    setDateFrom(from); setDateTo(to)
    fetchReport(from, to)
  }

  function printReport() {
    const el = document.getElementById('cashflow-print')
    if (!el) return
    const win = window.open('', '_blank')
    const period = dateFrom === dateTo
      ? new Date(dateFrom).toLocaleDateString('en-PK', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
      : `${new Date(dateFrom).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })} — ${new Date(dateTo).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}`
    // Build clean print HTML from data directly — no screen DOM
    const d = data
    const period2 = dateFrom === dateTo
      ? new Date(dateFrom).toLocaleDateString('en-PK', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })
      : `${new Date(dateFrom).toLocaleDateString('en-PK',{day:'2-digit',month:'short',year:'numeric'})} — ${new Date(dateTo).toLocaleDateString('en-PK',{day:'2-digit',month:'short',year:'numeric'})}`

    const row = (label, value, bold=false, indent=false) =>
      `<tr style="border-bottom:1px solid #eee">
        <td style="padding:3px ${indent?'8px':'4px'} 3px ${indent?'20px':'4px'};font-size:11px;font-weight:${bold?700:400};color:#333">${label}</td>
        <td style="padding:3px 4px;font-size:${bold?12:11}px;font-weight:${bold?700:600};text-align:right;color:#333">Rs. ${Math.abs(Number(value||0)).toLocaleString()}</td>
      </tr>`

    const secHead = (label) =>
      `<tr><td colspan="2" style="padding:5px 4px 3px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#444;border-top:1px solid #ccc;border-bottom:1px solid #ccc;background:#f5f5f5">${label}</td></tr>`

    win.document.write(`<!DOCTYPE html><html><head><title>${bizName} — Cash Flow</title><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:11px;color:#000;padding:10px}
      table{width:100%;border-collapse:collapse}
      @media print{body{padding:6px}@page{margin:8mm}}
    </style></head><body>
      <div style="text-align:center;padding-bottom:8px;border-bottom:2px solid #000;margin-bottom:8px">
        <div style="font-size:16px;font-weight:700;margin:0 0 2px">${bizName}</div>
        <div style="font-size:12px;font-weight:600;margin:0 0 1px">Cash Flow Statement</div>
        <div style="font-size:10px;color:#555">${period2}</div>
      </div>

      <table>
        ${secHead('Cash Inflows')}
        ${row('Cash from Deliveries / Sales', d.cashFromSales, false, true)}
        ${row('Cash from Balance Collections', d.cashFromPayments, false, true)}
        ${row('Total Cash In', d.totalCashIn, true)}

        ${secHead('Cash Outflows')}
        ${row('Rider Field Expenses', d.riderExpTotal, false, true)}
        ${row('Office Expenses', d.officeExpTotal, false, true)}
        ${row('Salary Advances Paid', d.advancesTotal, false, true)}
        ${row('Salary Payments', d.salariesTotal, false, true)}
        ${row('Total Cash Out', d.totalCashOut, true)}

        <tr><td colspan="2" style="padding:5px 4px;font-size:12px;font-weight:900;border-top:2px solid #000;border-bottom:2px solid #000">
          <div style="display:flex;justify-content:space-between">
            <span>NET CASH POSITION</span>
            <span>Rs. ${Math.abs(d.netCash).toLocaleString()}${d.netCash<0?' (Deficit)':''}</span>
          </div>
        </td></tr>

        ${(d.jazzConfirmed>0||d.jazzPending>0||d.epConfirmed>0||d.epPending>0||d.bankConfirmed>0||d.bankPending>0) ? `
          ${secHead('Digital Payments (not included in cash)')}
          ${d.jazzConfirmed>0 ? row('JazzCash — Confirmed', d.jazzConfirmed, false, true) : ''}
          ${d.jazzPending>0  ? row('JazzCash — Pending', d.jazzPending, false, true) : ''}
          ${d.epConfirmed>0  ? row('EasyPaisa — Confirmed', d.epConfirmed, false, true) : ''}
          ${d.epPending>0    ? row('EasyPaisa — Pending', d.epPending, false, true) : ''}
          ${d.bankConfirmed>0 ? row('Bank — Confirmed', d.bankConfirmed, false, true) : ''}
          ${d.bankPending>0  ? row('Bank — Pending', d.bankPending, false, true) : ''}
          ${row('Total Digital', d.jazzConfirmed+d.jazzPending+d.epConfirmed+d.epPending+d.bankConfirmed+d.bankPending, true)}
        ` : ''}

        ${secHead('Sales Summary')}
        ${row('Cash Sales', d.cashFromSales, false, true)}
        ${row('Digital Sales (confirmed)', d.jazzConfirmed+d.epConfirmed+d.bankConfirmed, false, true)}
        ${d.creditSales>0 ? row('Credit Sales', d.creditSales, false, true) : ''}
        ${row('Total Sales Value', d.totalSalesValue, true)}

        ${Object.keys(d.riderCash).length>0 ? `
          ${secHead('Cash by Rider')}
          ${Object.entries(d.riderCash).map(([name,amt]) => row(name, amt, false, true)).join('')}
        ` : ''}

        ${d.officeExpenses?.length>0 ? `
          ${secHead('Office Expense Detail')}
          ${d.officeExpenses.map(e => row(`${e.coa_account_name||e.category} — ${e.description||''}`, e.amount, false, true)).join('')}
        ` : ''}

        ${(d.salaryPayments?.length>0||d.advances?.length>0) ? `
          ${secHead('Salary & Advances Detail')}
          ${d.salaryPayments?.map(p => row(`Salary — ${p.riders?.full_name||'Rider'} (${p.month_year})`, p.amount_paid, false, true)).join('')||''}
          ${d.advances?.map(a => row(`Advance — ${a.riders?.full_name||'Rider'}`, a.amount, false, true)).join('')||''}
        ` : ''}
      </table>

      <div style="margin-top:10px;padding-top:6px;border-top:1px solid #ccc;display:flex;justify-content:space-between;font-size:9px;color:#888">
        <span>Generated by AquaRun • ${bizName}</span>
        <span>Printed: ${new Date().toLocaleDateString('en-PK',{day:'2-digit',month:'long',year:'numeric'})}</span>
      </div>
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 500)
  }

  const lastMonth1 = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0]
  const lastMonthEnd = new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split('T')[0]

  const SRow = ({ label, value, bold, indent, color, border }) => (
    <div style={{ display:'flex', justifyContent:'space-between', padding: bold ? '9px 14px' : '7px 14px', borderBottom: border ? '2px solid #e0e0e0' : '1px solid #f0f0f0', background: bold ? '#f8f9fa' : 'white' }}>
      <span style={{ fontSize:13, fontWeight: bold?700:400, color:'#333', paddingLeft: indent?16:0 }}>{label}</span>
      <span style={{ fontSize: bold?14:13, fontWeight: bold?800:600, color: color||'#333' }}>Rs. {Math.abs(Number(value||0)).toLocaleString()}</span>
    </div>
  )

  const SectionHead = ({ label, color }) => (
    <div style={{ padding:'8px 14px', background: color||'#f0f4f8', borderBottom:'1px solid #e0e0e0' }}>
      <span style={{ fontSize:11, fontWeight:800, color:'#444', textTransform:'uppercase', letterSpacing:'.08em' }}>{label}</span>
    </div>
  )

  return (
    <div style={{ fontFamily:'system-ui,-apple-system,sans-serif' }}>

      {/* Filter Bar */}
      <div style={{ background:'white', borderRadius:12, padding:'14px 18px', marginBottom:16, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>

        {/* Day navigation — only show when single day selected */}
        {dateFrom === dateTo && (
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <button onClick={() => navigate(-1)} style={{ width:32, height:32, border:'1.5px solid #e0e0e0', borderRadius:6, cursor:'pointer', background:'white', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>‹</button>
            <button onClick={() => navigate(1)} disabled={dateFrom >= today} style={{ width:32, height:32, border:'1.5px solid #e0e0e0', borderRadius:6, cursor:'pointer', background:'white', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', opacity: dateFrom >= today ? 0.4 : 1 }}>›</button>
          </div>
        )}

        <span style={{ fontSize:12, fontWeight:700, color:'#555' }}>📅</span>

        {/* Quick filters */}
        {[
          { label:'Today',       from:today,          to:today },
          { label:'Yesterday',   from:new Date(Date.now()-86400000).toISOString().split('T')[0], to:new Date(Date.now()-86400000).toISOString().split('T')[0] },
          { label:'This Month',  from:firstOfMonth,   to:today },
          { label:'Last Month',  from:lastMonth1,     to:lastMonthEnd },
        ].map(p => (
          <button key={p.label} onClick={() => applyQuick(p.from, p.to)}
            style={{ padding:'6px 12px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, whiteSpace:'nowrap',
              background: dateFrom===p.from && dateTo===p.to ? '#0f4c81' : '#f0f4f8',
              color: dateFrom===p.from && dateTo===p.to ? '#fff' : '#555' }}>
            {p.label}
          </button>
        ))}

        {/* Custom range */}
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ padding:'6px 10px', border:'1.5px solid #e0e0e0', borderRadius:6, fontSize:12, outline:'none' }} />
        <span style={{ fontSize:11, color:'#aaa' }}>to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ padding:'6px 10px', border:'1.5px solid #e0e0e0', borderRadius:6, fontSize:12, outline:'none' }} />

        <button onClick={() => fetchReport(dateFrom, dateTo)}
          style={{ padding:'7px 16px', background:'#0f4c81', color:'white', border:'none', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:700 }}>
          🔍 Search
        </button>

        {data && (
          <button onClick={printReport}
            style={{ padding:'7px 14px', background:'#f0f4f8', color:'#555', border:'1px solid #e0e0e0', borderRadius:6, cursor:'pointer', fontSize:12, fontWeight:600, marginLeft:'auto' }}>
            🖨️ Print / PDF
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding:60, textAlign:'center', background:'white', borderRadius:12 }}>
          <p style={{ fontSize:32, margin:'0 0 12px' }}>💵</p>
          <p style={{ color:'#888', fontSize:14 }}>Calculating cash flow...</p>
        </div>
      ) : data && (
        <>
          {/* Summary Cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:16 }}>
            {[
              { label:'Total Cash In',  value:data.totalCashIn,  color:'#1a7a4a', bg:'#e8f5e9', icon:'📥' },
              { label:'Total Cash Out', value:data.totalCashOut, color:'#c62828', bg:'#ffebee', icon:'📤' },
              { label:'Net Cash',       value:data.netCash,      color:data.netCash>=0?'#1a7a4a':'#c62828', bg:data.netCash>=0?'#e8f5e9':'#ffebee', icon:'💵' },
              { label:'Total Sales',    value:data.totalSalesValue, color:'#0f4c81', bg:'#e3f0ff', icon:'📊' },
            ].map(c => (
              <div key={c.label} style={{ background:'white', borderRadius:12, padding:'16px 18px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', borderLeft:`4px solid ${c.color}` }}>
                <p style={{ fontSize:11, color:'#888', margin:'0 0 6px', fontWeight:600, textTransform:'uppercase', letterSpacing:.5 }}>{c.icon} {c.label}</p>
                <p style={{ fontSize:22, fontWeight:900, color:c.color, margin:0, letterSpacing:'-0.5px' }}>Rs. {Math.abs(data[Object.keys(data).find(k => data[k]===c.value)||'netCash']||c.value||0).toLocaleString()}</p>
              </div>
            ))}
          </div>

          {/* Main Report */}
          <div id="cashflow-print" style={{ background:'white', borderRadius:12, boxShadow:'0 2px 10px rgba(0,0,0,0.07)', overflow:'hidden' }}>

            {/* Report Header */}
            <div style={{ background:'linear-gradient(135deg,#0f4c81,#1a6bad)', padding:'18px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
              <div>
                <p style={{ color:'#fff', fontWeight:800, fontSize:16, margin:'0 0 3px' }}>{bizName || 'Daily Cash Flow Statement'}</p>
                <p style={{ color:'#93c5fd', fontSize:12, margin:0 }}>
                  {dateFrom === dateTo
                    ? new Date(dateFrom).toLocaleDateString('en-PK', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })
                    : `${new Date(dateFrom).toLocaleDateString('en-PK',{day:'2-digit',month:'short',year:'numeric'})} — ${new Date(dateTo).toLocaleDateString('en-PK',{day:'2-digit',month:'short',year:'numeric'})}`}
                </p>
              </div>
              <div style={{ textAlign:'right' }}>
                <p style={{ color:'#93c5fd', fontSize:11, margin:'0 0 2px', textTransform:'uppercase', letterSpacing:1 }}>Net Cash</p>
                <p style={{ color:data.netCash>=0?'#6ee7b7':'#fca5a5', fontWeight:900, fontSize:22, margin:0 }}>
                  Rs. {Math.abs(data.netCash).toLocaleString()}
                  {data.netCash < 0 && <span style={{ fontSize:12 }}> deficit</span>}
                </p>
              </div>
            </div>

            {/* CASH IN */}
            <SectionHead label="📥 Cash Inflows" color="#e8f5e9" />
            <SRow label="Cash from Deliveries / Sales" value={data.cashFromSales} indent />
            <SRow label="Cash from Balance Collections" value={data.cashFromPayments} indent />
            <SRow label="Total Cash In" value={data.totalCashIn} bold color="#1a7a4a" border />

            {/* CASH OUT */}
            <SectionHead label="📤 Cash Outflows" color="#ffebee" />
            <SRow label="Rider Field Expenses" value={data.riderExpTotal} indent />
            <SRow label="Office Expenses" value={data.officeExpTotal} indent />
            <SRow label="Salary Advances Paid" value={data.advancesTotal} indent />
            <SRow label="Salary Payments" value={data.salariesTotal} indent />
            <SRow label="Total Cash Out" value={data.totalCashOut} bold color="#c62828" border />

            {/* NET CASH */}
            <div style={{ display:'flex', justifyContent:'space-between', padding:'14px 14px', background:data.netCash>=0?'#e8f5e9':'#ffebee', borderBottom:'2px solid #e0e0e0' }}>
              <span style={{ fontSize:14, fontWeight:900, color:data.netCash>=0?'#1a7a4a':'#c62828' }}>NET CASH POSITION</span>
              <span style={{ fontSize:16, fontWeight:900, color:data.netCash>=0?'#1a7a4a':'#c62828' }}>Rs. {Math.abs(data.netCash).toLocaleString()}{data.netCash<0?' (Deficit)':''}</span>
            </div>

            {/* DIGITAL PAYMENTS */}
            {(data.jazzConfirmed > 0 || data.jazzPending > 0 || data.epConfirmed > 0 || data.epPending > 0 || data.bankConfirmed > 0 || data.bankPending > 0) && (
              <>
                <SectionHead label="💳 Digital Payments (not included in cash)" color="#f3e8ff" />
                {(data.jazzConfirmed > 0 || data.jazzPending > 0) && <>
                  <SRow label="📱 JazzCash — Confirmed" value={data.jazzConfirmed} indent color="#9c27b0" />
                  {data.jazzPending > 0 && <SRow label="📱 JazzCash — Pending Confirmation" value={data.jazzPending} indent color="#e0a800" />}
                </>}
                {(data.epConfirmed > 0 || data.epPending > 0) && <>
                  <SRow label="💚 EasyPaisa — Confirmed" value={data.epConfirmed} indent color="#2e7d32" />
                  {data.epPending > 0 && <SRow label="💚 EasyPaisa — Pending Confirmation" value={data.epPending} indent color="#e0a800" />}
                </>}
                {(data.bankConfirmed > 0 || data.bankPending > 0) && <>
                  <SRow label="🏦 Bank — Confirmed" value={data.bankConfirmed} indent color="#0f4c81" />
                  {data.bankPending > 0 && <SRow label="🏦 Bank — Pending Confirmation" value={data.bankPending} indent color="#e0a800" />}
                </>}
                <SRow label="Total Digital Payments" value={data.jazzConfirmed+data.jazzPending+data.epConfirmed+data.epPending+data.bankConfirmed+data.bankPending} bold color="#7c3aed" border />
              </>
            )}

            {/* CREDIT SALES */}
            {data.creditSales > 0 && (
              <>
                <SectionHead label="📋 Credit Sales (informational)" color="#fff8e1" />
                <SRow label="Credit Sales" value={data.creditSales} indent color="#b45309" />
              </>
            )}

            {/* TOTAL SALES */}
            <SectionHead label="📊 Sales Summary" color="#e3f0ff" />
            <SRow label="Cash Sales" value={data.cashFromSales} indent color="#1a7a4a" />
            <SRow label="Digital Sales (confirmed)" value={data.jazzConfirmed+data.epConfirmed+data.bankConfirmed} indent color="#7c3aed" />
            <SRow label="Credit Sales" value={data.creditSales} indent color="#b45309" />
            <SRow label="Total Sales Value" value={data.totalSalesValue} bold color="#0f4c81" border />

            {/* RIDER CASH BREAKDOWN */}
            {Object.keys(data.riderCash).length > 0 && (
              <>
                <SectionHead label="🚴 Cash Collected — By Rider" color="#f0f4f8" />
                {Object.entries(data.riderCash).map(([name, amt]) => (
                  <SRow key={name} label={name} value={amt} indent />
                ))}
                <SRow label="Total Cash Collected" value={Object.values(data.riderCash).reduce((s,v)=>s+v,0)} bold border />
              </>
            )}

            {/* EXPENSE DETAIL */}
            {data.officeExpenses?.length > 0 && (
              <>
                <SectionHead label="🏢 Office Expense Detail" color="#f0f4f8" />
                {data.officeExpenses.map(e => (
                  <div key={e.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 14px 6px 28px', borderBottom:'1px solid #f0f0f0' }}>
                    <span style={{ fontSize:12, color:'#555' }}>{e.coa_account_name || e.category} — {e.description||'—'}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:'#c62828' }}>Rs. {Number(e.amount).toLocaleString()}</span>
                  </div>
                ))}
              </>
            )}

            {/* SALARY DETAILS */}
            {(data.salaryPayments?.length > 0 || data.advances?.length > 0) && (
              <>
                <SectionHead label="👤 Salary & Advances Detail" color="#f0f4f8" />
                {data.salaryPayments?.map(p => (
                  <div key={p.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 14px 6px 28px', borderBottom:'1px solid #f0f0f0' }}>
                    <span style={{ fontSize:12, color:'#555' }}>Salary — {p.riders?.full_name||'Rider'} ({p.month_year})</span>
                    <span style={{ fontSize:12, fontWeight:700, color:'#c62828' }}>Rs. {Number(p.amount_paid).toLocaleString()}</span>
                  </div>
                ))}
                {data.advances?.map(a => (
                  <div key={a.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 14px 6px 28px', borderBottom:'1px solid #f0f0f0' }}>
                    <span style={{ fontSize:12, color:'#555' }}>Advance — {a.riders?.full_name||'Rider'}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:'#c62828' }}>Rs. {Number(a.amount).toLocaleString()}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── CUSTOMER LEDGER ───────────────────────────────────────────────
function CustomerLedger({ tenantId }) {
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [ledger, setLedger] = useState([])
  const [loading, setLoading] = useState(false)
  const [businessSettings, setBusinessSettings] = useState({})
  const [showMonthlyInvoice, setShowMonthlyInvoice] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [monthlyInvoiceData, setMonthlyInvoiceData] = useState(null)
  const [generatingInvoice, setGeneratingInvoice] = useState(false)
  const today = new Date().toISOString().split('T')[0]
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const firstOfLastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0]
  const lastOfLastMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split('T')[0]
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => { if (tenantId) fetchSettings() }, [tenantId])

  async function fetchSettings() {
    const { data } = await supabase.from('business_settings').select('*').eq('tenant_id', tenantId)
    const map = {}
    data?.forEach(s => { map[s.setting_key] = s.setting_value })
    setBusinessSettings(map)
  }

  async function searchCustomer(val) {
    setSearch(val)
    if (val.length < 2) { setCustomers([]); return }
    const { data } = await supabase.from('customer_balances').select('*').eq('tenant_id', tenantId)
      .or(`full_name.ilike.%${val}%,mobile.ilike.%${val}%,customer_code.ilike.%${val}%`).limit(5)
    setCustomers(data || [])
  }

  async function loadLedger(customer) {
    setSelectedCustomer(customer)
    setCustomers([])
    setSearch('')
    setLoading(true)
    const { data: deliveries } = await supabase.from('deliveries').select('*')
      .eq('customer_id', customer.id).eq('tenant_id', tenantId).eq('is_voided', false).order('delivered_at', { ascending: true })
    const { data: payments } = await supabase.from('payments').select('*')
      .eq('customer_id', customer.id).eq('tenant_id', tenantId).eq('is_voided', false).order('created_at', { ascending: true })
    const entries = []
    deliveries?.forEach(d => {
      entries.push({
        date: d.delivered_at, type: 'delivery',
        description: 'Delivery — 19L×' + (d.qty_19l || 0) + ' Half×' + (d.qty_half_litre || 0) + ' 1.5L×' + (d.qty_1_5l || 0),
        debit: Number(d.total_with_tax || d.total_amount),
        credit: d.payment_method === 'cash' ? Number(d.amount_received || 0) : (d.payment_method === 'jazzcash' && d.jazzcash_confirmed ? Number(d.total_with_tax || d.total_amount) : 0),
        payment_method: d.payment_method,
        credit_amount: Number(d.credit_amount || 0),
        jazzcash_confirmed: d.jazzcash_confirmed
      })
    })
    payments?.forEach(p => {
      const isCash = p.payment_method === 'cash'
      const isConfirmedJazz = p.payment_method === 'jazzcash' && p.jazzcash_confirmed
      const isPendingJazz = p.payment_method === 'jazzcash' && !p.jazzcash_confirmed
      entries.push({
        date: p.created_at, type: 'payment',
        description: 'Payment — ' + p.payment_method + (isPendingJazz ? ' (Pending)' : ''),
        debit: 0,
        credit: isCash || isConfirmedJazz ? Number(p.amount) : 0,
        pendingAmount: isPendingJazz ? Number(p.amount) : 0,
        payment_method: p.payment_method
      })
    })
    entries.sort((a, b) => new Date(a.date) - new Date(b.date))
    let balance = Number(customer.opening_balance || 0)
    const ledgerWithBalance = entries.map(e => {
      balance = balance + e.debit - e.credit
      return { ...e, runningBalance: balance }
    })
    setLedger(ledgerWithBalance)
    setLoading(false)
  }

  function handlePrint() { window.print() }

  async function generateMonthlyInvoice() {
    setGeneratingInvoice(true)
    const [year, month] = selectedMonth.split('-')
    const monthStart = `${selectedMonth}-01`
    const monthEnd = new Date(year, month, 0).toISOString().split('T')[0]

    // Check if invoice already exists for this customer + month
    const { data: existing } = await supabase.from('monthly_invoices')
      .select('*').eq('tenant_id', tenantId)
      .eq('customer_id', selectedCustomer.id)
      .eq('month_year', selectedMonth).single()

    // Fetch deliveries for this month
    const { data: monthDeliveries } = await supabase.from('deliveries')
      .select('*').eq('customer_id', selectedCustomer.id)
      .eq('tenant_id', tenantId).eq('is_voided', false)
      .gte('delivered_at', monthStart + 'T00:00:00')
      .lte('delivered_at', monthEnd + 'T23:59:59')
      .order('delivered_at', { ascending: true })

    const totalAmount = monthDeliveries?.reduce((s, d) => s + Number(d.total_amount || 0), 0) || 0
    const taxAmount = monthDeliveries?.reduce((s, d) => s + Number(d.tax_amount || 0), 0) || 0
    const grandTotal = monthDeliveries?.reduce((s, d) => s + Number(d.total_with_tax || d.total_amount || 0), 0) || 0
    const totalPaid = monthDeliveries?.reduce((s, d) => {
      if (d.payment_method === 'cash') return s + Number(d.amount_received || 0)
      if (d.payment_method === 'jazzcash' && d.jazzcash_confirmed) return s + Number(d.total_amount || 0)
      return s
    }, 0) || 0

    let invoiceNumber
    if (existing) {
      invoiceNumber = existing.invoice_number
      // Update existing invoice
      await supabase.from('monthly_invoices').update({
        total_amount: totalAmount, tax_amount: taxAmount,
        grand_total: grandTotal, updated_at: new Date().toISOString()
      }).eq('id', existing.id)
    } else {
      // Generate new invoice number — fetch counter from settings
      const { data: counterData } = await supabase.from('business_settings')
        .select('setting_value').eq('tenant_id', tenantId)
        .eq('setting_key', `monthly_invoice_counter_${year}`).single()
      const counter = Number(counterData?.setting_value || 0) + 1
      const tenantCode = businessSettings.tenant_code || tenantId.slice(0, 6).toUpperCase()
      const { data: tenantData } = await supabase.from('tenants').select('tenant_code').eq('id', tenantId).single()
      const code = tenantData?.tenant_code || 'INV'
      invoiceNumber = `${code}-${year}-${String(month).padStart(2,'0')}-${String(counter).padStart(3,'0')}`

      await supabase.from('business_settings').upsert(
        { tenant_id: tenantId, setting_key: `monthly_invoice_counter_${year}`, setting_value: String(counter) },
        { onConflict: 'tenant_id,setting_key' }
      )
      await supabase.from('monthly_invoices').insert([{
        tenant_id: tenantId, invoice_number: invoiceNumber,
        customer_id: selectedCustomer.id, month_year: selectedMonth,
        total_amount: totalAmount, tax_amount: taxAmount,
        grand_total: grandTotal, status: 'draft'
      }])
    }

    setMonthlyInvoiceData({ deliveries: monthDeliveries || [], invoiceNumber, totalPaid, balanceDue: grandTotal - totalPaid })
    setShowMonthlyInvoice(false)
    setGeneratingInvoice(false)
  }

  function buildWhatsAppMessage(customer, ledger, totalDebit, totalCredit, closingBalance, bizName) {
    const printDate = new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })
    let msg = `*${bizName} — Customer Account Statement*\n`
    msg += `Printed: ${printDate}\n\n`
    msg += `*Customer:* ${customer.full_name}\n`
    msg += `*ID:* ${customer.customer_code}\n`
    msg += `*Mobile:* ${customer.mobile || '—'}\n`
    msg += `*Rate 19L:* Rs. ${customer.rate_19l || 100}\n\n`
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`
    msg += `*Opening Balance:* Rs. ${Number(customer.opening_balance || 0).toLocaleString()}\n`
    msg += `*Total Sales (Dr):* Rs. ${totalDebit.toLocaleString()}\n`
    msg += `*Total Payments (Cr):* Rs. ${totalCredit.toLocaleString()}\n`
    msg += `*Closing Balance:* Rs. ${Math.abs(closingBalance).toLocaleString()}${closingBalance < 0 ? ' CR' : ''}\n`
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`
    msg += `*Transaction Details:*\n\n`
    ledger.forEach((e, idx) => {
      const date = new Date(e.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
      msg += `${idx + 1}. ${date}\n`
      msg += `   ${e.description}\n`
      if (e.debit > 0) msg += `   Dr: Rs. ${e.debit.toLocaleString()}\n`
      if (e.credit > 0) msg += `   Cr: Rs. ${e.credit.toLocaleString()}\n`
      msg += `   Bal: Rs. ${Math.abs(e.runningBalance).toLocaleString()}${e.runningBalance < 0 ? ' CR' : ''}\n\n`
    })
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`
    if (closingBalance > 0) {
      msg += `⚠️ *Amount Due: Rs. ${closingBalance.toLocaleString()}*\n`
      msg += `Please settle at your earliest convenience.\n`
    } else {
      msg += `✅ *Account Clear — No outstanding balance. Thank you!*\n`
      if (closingBalance < 0) msg += `Advance Credit: Rs. ${Math.abs(closingBalance).toLocaleString()}\n`
    }
    msg += `\n_Generated by AquaRun • ${bizName}_`
    return msg
  }

  function handleShareWhatsApp() {
    const bizName = businessSettings.business_name || 'AquaRun'
    const whatsappNumber = businessSettings.whatsapp_number?.replace(/^0/, '') || ''
    const msg = buildWhatsAppMessage(selectedCustomer, ledger, totalDebit, totalCredit, closingBalance, bizName)
    const encoded = encodeURIComponent(msg)
    const customerPhone = selectedCustomer.mobile?.replace(/^0/, '').replace(/[-\s]/g, '') || ''
    const url = customerPhone
      ? `https://wa.me/92${customerPhone}?text=${encoded}`
      : whatsappNumber
        ? `https://wa.me/92${whatsappNumber}?text=${encoded}`
        : `https://wa.me/?text=${encoded}`
    window.open(url, '_blank')
  }

  const filteredLedger = ledger.filter(e => {
    if (!dateFrom && !dateTo) return true
    const eDate = new Date(e.date).toISOString().split('T')[0]
    if (dateFrom && eDate < dateFrom) return false
    if (dateTo && eDate > dateTo) return false
    return true
  })
  const totalDebit = filteredLedger.reduce((s, e) => s + (e.debit || 0), 0)
  const totalCredit = filteredLedger.reduce((s, e) => s + (e.credit || 0), 0)
  const openingBal = Number(selectedCustomer?.opening_balance || 0)
  // Opening balance = all entries before dateFrom
  const openingBalForFilter = dateFrom
    ? ledger.filter(e => new Date(e.date).toISOString().split('T')[0] < dateFrom)
             .reduce((s, e) => s + e.debit - e.credit, openingBal)
    : openingBal
  const closingBalance = filteredLedger.length > 0
    ? openingBalForFilter + totalDebit - totalCredit
    : openingBalForFilter
  const printDate = new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #ledger-print-area, #ledger-print-area * { visibility: visible; }
          #ledger-print-area { position: absolute; top: 0; left: 0; width: 100%; padding: 20px; box-sizing: border-box; }
          .no-print { display: none !important; }
          table { width: 100%; page-break-inside: auto; border-collapse: collapse; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
          @page { size: A4; margin: 15mm; }
        }
      `}</style>

      <h3 className="no-print" style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>📒 Customer Ledger</h3>

      {!selectedCustomer ? (
        <div className="no-print" style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '13px', color: '#555', marginBottom: '8px', fontWeight: '600' }}>Search Customer</p>
          <input value={search} onChange={e => searchCustomer(e.target.value)}
            placeholder="Type name, mobile, or customer ID..."
            style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }} />
          {customers.map(c => (
            <div key={c.id} onClick={() => loadLedger(c)}
              style={{ padding: '12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: '600', fontSize: '14px', margin: '0 0 2px' }}>{c.full_name}</p>
                <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>{c.mobile} · {c.customer_code}</p>
              </div>
              <p style={{ fontSize: '13px', color: Number(c.balance) > 0 ? '#f44336' : '#4caf50', fontWeight: '700', margin: 0 }}>
                Rs. {Math.abs(Number(c.balance)).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <div className="no-print" style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <button onClick={() => { setSelectedCustomer(null); setLedger([]); setDateFrom(''); setDateTo('') }}
                style={{ padding: '8px 16px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', flexShrink: 0 }}>
                ← Back
              </button>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={handleShareWhatsApp}
                style={{ padding: '10px 16px', background: '#25d366', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                💬 Share
              </button>
              <button onClick={handlePrint}
                style={{ padding: '10px 16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                🖨️ Print / PDF
              </button>
              <button onClick={() => setShowMonthlyInvoice(true)}
                style={{ padding: '10px 16px', background: '#e65100', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                📄 Monthly Invoice
              </button>
            </div>
            </div>
            {/* Date Filter Bar */}
            <div style={{ background: '#f8fafc', border: '1px solid #e0e0e0', borderRadius: '10px', padding: '10px 14px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#555', whiteSpace: 'nowrap' }}>📅 Period:</span>
              {[
                { label: 'All Time', from: '', to: '' },
                { label: 'This Month', from: firstOfMonth, to: today },
                { label: 'Last Month', from: firstOfLastMonth, to: lastOfLastMonth },
              ].map(p => (
                <button key={p.label} onClick={() => { setDateFrom(p.from); setDateTo(p.to) }}
                  style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                    background: dateFrom === p.from && dateTo === p.to ? '#0f4c81' : '#f0f4f8',
                    color: dateFrom === p.from && dateTo === p.to ? '#fff' : '#555',
                  }}>{p.label}</button>
              ))}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  style={{ padding: '5px 8px', border: '1.5px solid #e0e0e0', borderRadius: 6, fontSize: 12, outline: 'none' }} />
                <span style={{ fontSize: 11, color: '#888' }}>to</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  style={{ padding: '5px 8px', border: '1.5px solid #e0e0e0', borderRadius: 6, fontSize: 12, outline: 'none' }} />
              </div>
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo('') }}
                  style={{ padding: '5px 10px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✕ Clear</button>
              )}
              {(dateFrom || dateTo) && (
                <span style={{ fontSize: 11, color: '#0f4c81', fontWeight: 600, marginLeft: 'auto' }}>
                  {filteredLedger.length} transactions
                </span>
              )}
            </div>
          </div>

          {showMonthlyInvoice && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <div style={{ background: 'white', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '400px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', margin: '0 0 16px' }}>📄 Generate Monthly Invoice</h3>
              <p style={{ fontSize: '13px', color: '#555', margin: '0 0 8px' }}>Customer: <strong>{selectedCustomer.full_name}</strong></p>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>Select Month</label>
              <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' }} />
              <div style={{ background: '#e3f0ff', borderRadius: '8px', padding: '10px', marginBottom: '16px' }}>
                <p style={{ fontSize: '12px', color: '#0f4c81', margin: 0 }}>If an invoice already exists for this month it will be updated with latest deliveries.</p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setShowMonthlyInvoice(false)}
                  style={{ flex: 1, padding: '10px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                  Cancel
                </button>
                <button onClick={generateMonthlyInvoice} disabled={generatingInvoice}
                  style={{ flex: 2, padding: '10px', background: '#e65100', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700' }}>
                  {generatingInvoice ? 'Generating...' : '📄 Generate Invoice'}
                </button>
              </div>
            </div>
          </div>
        )}

        {monthlyInvoiceData && (
          <InvoiceModal
            deliveries={monthlyInvoiceData.deliveries}
            customer={selectedCustomer}
            settings={businessSettings}
            invoiceNumber={monthlyInvoiceData.invoiceNumber}
            monthlyTotalPaid={monthlyInvoiceData.totalPaid}
            monthlyBalanceDue={monthlyInvoiceData.balanceDue}
            onClose={() => setMonthlyInvoiceData(null)}
          />
        )}

        <div id="ledger-print-area">
            <div style={{ borderBottom: '3px solid #0f4c81', paddingBottom: '12px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {businessSettings.business_logo && (
                    <img src={businessSettings.business_logo} alt="logo"
                      style={{ width: '52px', height: '52px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #eee' }} />
                  )}
                  <div>
                    <p style={{ fontSize: '18px', fontWeight: '700', color: '#0f4c81', margin: '0 0 2px' }}>{businessSettings.business_name || 'Spring Water Kamoke'}</p>
                    <p style={{ fontSize: '11px', color: '#888', margin: '0 0 1px' }}>{businessSettings.business_tagline || 'Pure Water Delivery'}</p>
                    {businessSettings.business_address && <p style={{ fontSize: '10px', color: '#aaa', margin: 0 }}>📍 {businessSettings.business_address}</p>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ background: '#0f4c81', color: 'white', padding: '6px 16px', borderRadius: '6px', marginBottom: '6px', display: 'inline-block' }}>
                    <p style={{ fontSize: '13px', fontWeight: '700', margin: 0, letterSpacing: '0.05em' }}>CUSTOMER ACCOUNT STATEMENT</p>
                  </div>
                  <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>📞 {businessSettings.complaint_number || '—'}</p>
                  <p style={{ fontSize: '11px', color: '#aaa', margin: '2px 0 0' }}>Printed: {printDate}</p>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0f4ff', border: '1px solid #c8d8ff', borderRadius: '8px', padding: '10px 16px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', gap: '32px' }}>
                <div>
                  <p style={{ fontSize: '10px', color: '#888', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer Name</p>
                  <p style={{ fontSize: '15px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>{selectedCustomer.full_name}</p>
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: '#888', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer ID</p>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: 0 }}>{selectedCustomer.customer_code}</p>
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: '#888', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mobile</p>
                  <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>{selectedCustomer.mobile || '—'}</p>
                </div>
                <div>
                  <p style={{ fontSize: '10px', color: '#888', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rate / 19L</p>
                  <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>Rs. {selectedCustomer.rate_19l || 100}</p>
                </div>
              </div>
              <div style={{ textAlign: 'right', background: closingBalance > 0 ? '#ffebee' : '#e8f5e9', border: `2px solid ${closingBalance > 0 ? '#f44336' : '#4caf50'}`, borderRadius: '8px', padding: '8px 16px' }}>
                <p style={{ fontSize: '10px', color: '#888', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Outstanding Balance</p>
                <p style={{ fontSize: '20px', fontWeight: '700', margin: 0, color: closingBalance > 0 ? '#f44336' : '#1a7a4a' }}>
                  Rs. {Math.abs(closingBalance).toLocaleString()}{closingBalance < 0 ? ' CR' : ''}
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              {(dateFrom || dateTo) && (
                <div style={{ background: openingBalForFilter > 0 ? '#ffebee' : '#e8f5e9', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
                  <p style={{ fontSize: '10px', color: '#666', margin: '0 0 4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Opening (Brought Fwd)</p>
                  <p style={{ fontSize: '15px', fontWeight: '700', color: openingBalForFilter > 0 ? '#f44336' : '#1a7a4a', margin: 0 }}>Rs. {Math.abs(openingBalForFilter).toLocaleString()}</p>
                </div>
              )}
              {[
                { label: dateFrom || dateTo ? 'Period Sales (Dr)' : 'Total Sales (Dr)', value: totalDebit, color: '#f44336', bg: '#ffebee' },
                { label: dateFrom || dateTo ? 'Period Payments (Cr)' : 'Total Payments (Cr)', value: totalCredit, color: '#1a7a4a', bg: '#e8f5e9' },
                { label: 'Outstanding Balance', value: closingBalance, color: closingBalance > 0 ? '#f44336' : '#1a7a4a', bg: closingBalance > 0 ? '#ffebee' : '#e8f5e9' },
              ].map(card => (
                <div key={card.label} style={{ background: card.bg, borderRadius: '8px', padding: '10px 12px', textAlign: 'center' }}>
                  <p style={{ fontSize: '10px', color: '#666', margin: '0 0 4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{card.label}</p>
                  <p style={{ fontSize: '15px', fontWeight: '700', color: card.color, margin: 0 }}>Rs. {Math.abs(Number(card.value)).toLocaleString()}</p>
                </div>
              ))}
            </div>

            {loading ? (
              <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>
            ) : (
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginLeft: '-4px', marginRight: '-4px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '560px' }}>
                  <thead>
                    <tr style={{ background: '#0f4c81', color: 'white' }}>
                      {['#', 'Date', 'Description', 'Debit (Rs.)', 'Credit (Rs.)', 'Balance (Rs.)'].map((h, i) => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: i >= 3 ? 'right' : 'left', fontSize: '11px', fontWeight: '700', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ background: '#e3f0ff', borderBottom: '1px solid #c8d8ff' }}>
                      <td style={{ padding: '8px 12px', fontSize: '11px', color: '#888' }}>—</td>
                      <td style={{ padding: '8px 12px', fontSize: '11px', color: '#888' }}>—</td>
                      <td style={{ padding: '5px 10px', fontSize: '12px', fontWeight: '700', color: '#0f4c81' }}>
                        {dateFrom ? `★ Balance Brought Forward (before ${new Date(dateFrom).toLocaleDateString('en-PK', {day:'2-digit', month:'short', year:'numeric'})})` : '★ Opening Balance'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#aaa' }}>—</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#aaa' }}>—</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', fontSize: '12px', fontWeight: '700', color: openingBalForFilter > 0 ? '#f44336' : '#1a7a4a' }}>{openingBalForFilter.toLocaleString()}</td>
                    </tr>
                    {filteredLedger.length === 0 ? (
                      <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No transactions found for selected period</td></tr>
                    ) : filteredLedger.map((e, idx) => (
                      <tr key={idx} style={{ background: idx % 2 === 0 ? 'white' : '#fafbff', borderBottom: '1px solid #eef0f5' }}>
                        <td style={{ padding: '5px 10px', fontSize: '10px', color: '#aaa', fontWeight: '600' }}>{idx + 1}</td>
                        <td style={{ padding: '5px 10px', fontSize: '11px', color: '#555', whiteSpace: 'nowrap' }}>
                          {new Date(e.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '5px 10px', fontSize: '11px', color: '#333' }}>
                          <span style={{ fontWeight: '600' }}>{e.description}</span>
                          {e.credit_amount > 0 && <span style={{ fontSize: '9px', color: '#f44336', display: 'block' }}>↳ Credit: Rs. {e.credit_amount.toLocaleString()}</span>}
                          {e.pendingAmount > 0 && <span style={{ fontSize: '9px', color: '#e65100', display: 'block' }}>↳ Pending: Rs. {e.pendingAmount.toLocaleString()}</span>}
                        </td>
                        <td style={{ padding: '5px 10px', fontSize: '11px', fontWeight: '700', color: e.debit > 0 ? '#f44336' : '#ddd', textAlign: 'right' }}>{e.debit > 0 ? e.debit.toLocaleString() : '—'}</td>
                        <td style={{ padding: '5px 10px', fontSize: '11px', fontWeight: '700', color: e.credit > 0 ? '#1a7a4a' : '#ddd', textAlign: 'right' }}>{e.credit > 0 ? e.credit.toLocaleString() : '—'}</td>
                        <td style={{ padding: '5px 10px', fontSize: '12px', fontWeight: '700', textAlign: 'right', color: e.runningBalance > 0 ? '#f44336' : '#1a7a4a' }}>
                          {e.runningBalance.toLocaleString()}
                          {e.runningBalance < 0 && <span style={{ fontSize: '9px', marginLeft: '2px' }}>CR</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#0f4c81', color: 'white' }}>
                      <td colSpan={3} style={{ padding: '10px 12px', fontSize: '13px', fontWeight: '700', letterSpacing: '0.05em' }}>TOTAL</td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: '700', textAlign: 'right' }}>{totalDebit.toLocaleString()}</td>
                      <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: '700', textAlign: 'right' }}>{totalCredit.toLocaleString()}</td>
                      <td style={{ padding: '10px 12px', fontSize: '14px', fontWeight: '700', textAlign: 'right' }}>
                        {Math.abs(closingBalance).toLocaleString()}{closingBalance < 0 && <span style={{ fontSize: '10px', marginLeft: '2px' }}>CR</span>}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {closingBalance > 0 && (
              <div style={{ marginTop: '16px', border: '2px solid #f44336', borderRadius: '8px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff5f5' }}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#c62828', margin: '0 0 2px' }}>⚠️ Amount Due</p>
                  <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Please settle your outstanding balance at your earliest convenience.</p>
                </div>
                <p style={{ fontSize: '22px', fontWeight: '700', color: '#f44336', margin: 0 }}>Rs. {closingBalance.toLocaleString()}</p>
              </div>
            )}
            {closingBalance <= 0 && (
              <div style={{ marginTop: '16px', border: '2px solid #4caf50', borderRadius: '8px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0fff4' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>✅ Account Clear — No outstanding balance. Thank you!</p>
                {closingBalance < 0 && <p style={{ fontSize: '16px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>Advance: Rs. {Math.abs(closingBalance).toLocaleString()}</p>}
              </div>
            )}

            <div style={{ marginTop: '24px', paddingTop: '12px', borderTop: '2px solid #0f4c81', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '10px', color: '#888', margin: '0 0 2px', fontStyle: 'italic' }}>This is a system generated report and does not require any signature or stamp.</p>
                <p style={{ fontSize: '10px', color: '#aaa', margin: 0 }}>Generated by AquaRun • {businessSettings.business_name} • {printDate}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '10px', color: '#0f4c81', fontWeight: '700', margin: 0 }}>Powered by AquaRun</p>
                <p style={{ fontSize: '9px', color: '#aaa', margin: '2px 0 0' }}>Water Delivery Management System</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── BULK WHATSAPP SHARE ───────────────────────────────────────────
// ─── CHURN RISK REPORT ─────────────────────────────────────────────
function ChurnRisk({ tenantId }) {
  const today      = new Date().toISOString().split('T')[0]
  const [loading,  setLoading]  = useState(true)
  const [data,     setData]     = useState(null)
  const [filter,   setFilter]   = useState('all')   // 'all'|'7'|'15'|'30'
  const [riskFilter, setRiskFilter] = useState('all') // 'all'|'low'|'medium'|'high'|'critical'
  const [search,   setSearch]   = useState('')
  const [bottleCost, setBottleCost] = useState(900)

  useEffect(() => { if (tenantId) fetchData() }, [tenantId])

  async function fetchData() {
    setLoading(true)
    try {
      // Fetch bottle cost from settings
      const { data: costSetting } = await supabase.from('business_settings')
        .select('setting_value').eq('tenant_id', tenantId).eq('setting_key', 'bottle_replacement_cost').maybeSingle()
      const cost = Number(costSetting?.setting_value || 900)
      setBottleCost(cost)

      // Fetch all active customers
      const { data: customers } = await supabase.from('customers')
        .select('id, full_name, mobile, customer_code, our_bottles_placed, other_brand_bottles_held, rate_19l, is_active, address')
        .eq('tenant_id', tenantId).eq('is_active', true)

      // Fetch last delivery per customer
      const { data: lastDeliveries } = await supabase.from('deliveries')
        .select('customer_id, delivered_at, qty_19l')
        .eq('tenant_id', tenantId).eq('is_voided', false)
        .order('delivered_at', { ascending: false })

      // Fetch avg delivery frequency per customer (last 90 days)
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString()
      const { data: recentDeliveries } = await supabase.from('deliveries')
        .select('customer_id, delivered_at')
        .eq('tenant_id', tenantId).eq('is_voided', false)
        .gte('delivered_at', ninetyDaysAgo)
        .order('delivered_at', { ascending: true })

      // Fetch latest remark per customer
      const { data: remarks } = await supabase.from('customer_visit_remarks')
        .select('customer_id, remark_type, remark_text, visit_date, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })

      // Build last delivery map
      const lastDeliveryMap = {}
      lastDeliveries?.forEach(d => {
        if (!lastDeliveryMap[d.customer_id]) lastDeliveryMap[d.customer_id] = d
      })

      // Build avg frequency map
      const freqMap = {}
      recentDeliveries?.forEach(d => {
        if (!freqMap[d.customer_id]) freqMap[d.customer_id] = []
        freqMap[d.customer_id].push(new Date(d.delivered_at))
      })

      // Build latest remark map
      const remarkMap = {}
      remarks?.forEach(r => {
        if (!remarkMap[r.customer_id]) remarkMap[r.customer_id] = r
      })

      // Build churn data per customer
      const churnData = []
      const nowDate = new Date()

      for (const c of customers || []) {
        const lastDel = lastDeliveryMap[c.id]
        if (!lastDel) continue // never had delivery — skip

        const lastDelDate = new Date(lastDel.delivered_at)
        const daysSinceLast = Math.floor((nowDate - lastDelDate) / 86400000)
        if (daysSinceLast < 5) continue // ordered recently — not at risk

        // Calculate average frequency
        const delDates = freqMap[c.id] || []
        let avgFrequency = 7 // default weekly
        if (delDates.length >= 2) {
          const gaps = []
          for (let i = 1; i < delDates.length; i++) {
            gaps.push((delDates[i] - delDates[i-1]) / 86400000)
          }
          avgFrequency = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length)
        }
        avgFrequency = Math.max(1, avgFrequency)

        const cyclesMissed = daysSinceLast / avgFrequency

        // Risk level
        let risk = 'low'
        if (cyclesMissed >= 5) risk = 'critical'
        else if (cyclesMissed >= 3) risk = 'high'
        else if (cyclesMissed >= 2) risk = 'medium'

        // Adjust for remarks
        const latestRemark = remarkMap[c.id]
        if (latestRemark?.remark_type === 'wont_purchase' || latestRemark?.remark_type === 'shifted') {
          risk = 'critical'
        } else if (latestRemark?.remark_type === 'vacation' || latestRemark?.remark_type === 'has_water') {
          risk = risk === 'critical' ? 'high' : risk === 'high' ? 'medium' : 'low'
        }

        // Adjust for competitor bottles
        const otherBrands = Number(c.other_brand_bottles_held || 0)
        if (otherBrands > 0 && risk === 'medium') risk = 'high'
        if (otherBrands > 2 && risk === 'high') risk = 'critical'

        const bottleExposure = Number(c.our_bottles_placed || 0) * cost

        churnData.push({
          ...c, daysSinceLast, avgFrequency,
          cyclesMissed: Math.round(cyclesMissed * 10) / 10,
          risk, lastDelDate, latestRemark,
          bottleExposure, otherBrands,
          pattern: avgFrequency === 1 ? 'Daily' : avgFrequency <= 3 ? `Every ${avgFrequency} days` : avgFrequency <= 7 ? 'Weekly' : avgFrequency <= 14 ? 'Fortnightly' : 'Monthly',
        })
      }

      churnData.sort((a, b) => {
        const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 }
        return riskOrder[a.risk] - riskOrder[b.risk] || b.daysSinceLast - a.daysSinceLast
      })

      // Summary stats
      const totalBottleExposure = churnData.reduce((s, c) => s + c.bottleExposure, 0)
      const riskCounts = { critical: 0, high: 0, medium: 0, low: 0 }
      churnData.forEach(c => riskCounts[c.risk]++)

      setData({ churnData, totalBottleExposure, riskCounts, cost })
    } catch (err) {
      console.error('ChurnRisk error:', err)
    }
    setLoading(false)
  }

  const RISK_CONFIG = {
    low:      { color: '#1a7a4a', bg: '#e8f5e9', border: '#86efac', label: '🟢 Low Risk',      urdu: 'کم خطرہ' },
    medium:   { color: '#b45309', bg: '#fff8e1', border: '#fde68a', label: '🟡 Medium Risk',   urdu: 'درمیانہ خطرہ' },
    high:     { color: '#c2410c', bg: '#fff3e0', border: '#fdba74', label: '🟠 High Risk',     urdu: 'زیادہ خطرہ' },
    critical: { color: '#c62828', bg: '#ffebee', border: '#fca5a5', label: '🔴 Critical',      urdu: 'انتہائی خطرناک' },
  }

  const REMARK_LABELS = {
    not_home: '🏠 Not at Home', has_water: '💧 Has Water', wont_purchase: '🚫 Won\'t Buy',
    shifted: '🏚️ Shifted', vacation: '✈️ Vacation', no_response: '📵 No Response',
    office_closed: '🏢 Office Closed', other: '💬 Other',
  }

  const filtered = (data?.churnData || []).filter(c => {
    if (filter !== 'all' && c.daysSinceLast < Number(filter)) return false
    if (riskFilter !== 'all' && c.risk !== riskFilter) return false
    if (search && !c.full_name?.toLowerCase().includes(search.toLowerCase()) && !c.mobile?.includes(search)) return false
    return true
  })

  const totalBottleRisk = filtered.reduce((s, c) => s + c.bottleExposure, 0)

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <p style={{ fontSize: 32, margin: '0 0 12px' }}>📋</p>
      <p style={{ color: '#888', fontSize: 14 }}>Analysing customer churn risk...</p>
    </div>
  )

  return (
    <div style={{ fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', borderRadius: 12, padding: '18px 22px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p style={{ color: '#fff', fontWeight: 800, fontSize: 17, margin: '0 0 3px' }}>📋 Customer Churn Risk</p>
          <p style={{ color: '#93c5fd', fontSize: 12, margin: 0 }}>Customers who stopped ordering · Bottle recovery · Competitor tracking</p>
        </div>
        <button onClick={fetchData} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>🔄 Refresh</button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Critical', labelUr: 'انتہائی خطرناک', value: data?.riskCounts.critical || 0, color: '#c62828', bg: '#ffebee', isCount: true },
          { label: 'High Risk', labelUr: 'زیادہ خطرہ', value: data?.riskCounts.high || 0, color: '#c2410c', bg: '#fff3e0', isCount: true },
          { label: 'Medium Risk', labelUr: 'درمیانہ', value: data?.riskCounts.medium || 0, color: '#b45309', bg: '#fff8e1', isCount: true },
          { label: 'Bottle Exposure', labelUr: 'بوتلوں کی مالیت', value: `Rs. ${(data?.totalBottleExposure || 0).toLocaleString()}`, color: '#0f4c81', bg: '#e3f0ff', isCount: false },
        ].map(c => (
          <div key={c.label} style={{ background: 'white', borderRadius: 10, padding: '12px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${c.color}` }}>
            <p style={{ fontSize: 10, color: '#888', margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: 0.4 }}>{c.label}</p>
            <p dir="rtl" style={{ fontSize: 9, color: '#aaa', margin: '0 0 4px', fontFamily: 'serif' }}>{c.labelUr}</p>
            <p style={{ fontSize: c.isCount ? 22 : 15, fontWeight: 800, color: c.color, margin: 0 }}>{c.isCount ? c.value + ' customers' : c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background: 'white', borderRadius: 10, padding: '12px 16px', marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Days missed:</span>
        {[{ k: 'all', l: 'All' }, { k: '7', l: '7+ days' }, { k: '15', l: '15+ days' }, { k: '30', l: '30+ days' }].map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)}
            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: filter === f.k ? '#0f4c81' : '#f0f4f8', color: filter === f.k ? '#fff' : '#555' }}>{f.l}</button>
        ))}
        <span style={{ fontSize: 12, fontWeight: 700, color: '#555', marginLeft: 8 }}>Risk:</span>
        {[{ k: 'all', l: 'All' }, { k: 'critical', l: '🔴 Critical' }, { k: 'high', l: '🟠 High' }, { k: 'medium', l: '🟡 Medium' }, { k: 'low', l: '🟢 Low' }].map(f => (
          <button key={f.k} onClick={() => setRiskFilter(f.k)}
            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: riskFilter === f.k ? '#0f4c81' : '#f0f4f8', color: riskFilter === f.k ? '#fff' : '#555' }}>{f.l}</button>
        ))}
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="🔍 Search customer name or mobile..."
        style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 14 }} />

      {/* Results count */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <p style={{ fontSize: 13, color: '#555', margin: 0, fontWeight: 600 }}>{filtered.length} customers at risk</p>
        {totalBottleRisk > 0 && <p style={{ fontSize: 13, color: '#c62828', margin: 0, fontWeight: 700 }}>🚨 Bottle exposure: Rs. {totalBottleRisk.toLocaleString()}</p>}
      </div>

      {/* Customer List */}
      {filtered.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 12, padding: 50, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 40, margin: '0 0 12px' }}>✅</p>
          <p style={{ fontWeight: 700, color: '#1a7a4a', fontSize: 15, margin: '0 0 4px' }}>No customers at risk!</p>
          <p style={{ color: '#888', fontSize: 13, margin: 0 }}>All customers are ordering regularly</p>
        </div>
      ) : filtered.map(c => {
        const rc = RISK_CONFIG[c.risk]
        return (
          <div key={c.id} style={{ background: 'white', borderRadius: 12, padding: '16px 18px', marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${rc.color}`, border: `1px solid ${rc.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ flex: 1 }}>
                {/* Name + Risk Badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e', margin: 0 }}>{c.full_name}</p>
                  <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: rc.bg, color: rc.color }}>{rc.label}</span>
                  {c.otherBrands > 0 && <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#f3e5f5', color: '#7b1fa2' }}>⚠️ {c.otherBrands} competitor bottle{c.otherBrands > 1 ? 's' : ''}</span>}
                </div>

                {/* Details row */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: 12, color: '#888', margin: 0 }}>📱 {c.mobile || '—'}</p>
                  <p style={{ fontSize: 12, color: '#888', margin: 0 }}>🔄 {c.pattern}</p>
                  <p style={{ fontSize: 12, color: '#888', margin: 0 }}>📅 Last order: {new Date(c.lastDelDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: rc.color, margin: 0 }}>⏰ {c.daysSinceLast} days ago ({c.cyclesMissed} cycles missed)</p>
                </div>

                {/* Latest remark */}
                {c.latestRemark && (
                  <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: '#f8f9fa', borderRadius: 6 }}>
                    <span style={{ fontSize: 11, color: '#555' }}>Latest remark:</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#0f4c81' }}>{REMARK_LABELS[c.latestRemark.remark_type] || c.latestRemark.remark_type}</span>
                    {c.latestRemark.remark_text && <span style={{ fontSize: 11, color: '#888' }}>— {c.latestRemark.remark_text}</span>}
                    <span style={{ fontSize: 10, color: '#aaa' }}>{new Date(c.latestRemark.visit_date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })}</span>
                  </div>
                )}
              </div>

              {/* Right side — bottles + actions */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {c.our_bottles_placed > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <p style={{ fontSize: 11, color: '#888', margin: '0 0 2px' }}>Our bottles at customer</p>
                    <p style={{ fontSize: 16, fontWeight: 800, color: '#0f4c81', margin: '0 0 1px' }}>{c.our_bottles_placed} bottles</p>
                    <p style={{ fontSize: 11, color: '#c62828', margin: 0, fontWeight: 600 }}>Rs. {c.bottleExposure.toLocaleString()} at risk</p>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  {c.mobile && (
                    <a href={`tel:${c.mobile}`}
                      style={{ padding: '6px 12px', background: '#e3f0ff', color: '#0f4c81', borderRadius: 6, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                      📞 Call
                    </a>
                  )}
                  {c.mobile && (
                    <a href={(() => {
                      const phone = c.mobile.replace(/^0/, '92').replace(/[-\s]/g, '')
                      const msgEn = `Dear ${c.full_name}, we noticed you haven't ordered water recently. Please let us know if you need delivery. Thank you!`
                      const msgUr = `${c.full_name} صاحب، آپ کی طرف سے کچھ دنوں سے پانی کا آرڈر نہیں آیا۔ کیا آپ کو ڈیلیوری چاہیے؟ شکریہ`
                      const msg = encodeURIComponent(`${msgUr}\n\n${msgEn}`)
                      return `https://wa.me/${phone}?text=${msg}`
                    })()} target="_blank" rel="noreferrer"
                      style={{ padding: '6px 12px', background: '#e8f5e9', color: '#1a7a4a', borderRadius: 6, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                      💬 WhatsApp
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── CUSTOMER SALES REPORT ─────────────────────────────────────────
function CustomerSales({ tenantId }) {
  const today     = new Date().toISOString().split('T')[0]
  const [dateFrom,  setDateFrom]  = useState(today)
  const [dateTo,    setDateTo]    = useState(today)
  const [search,    setSearch]    = useState('')
  const [data,      setData]      = useState([])
  const [loading,   setLoading]   = useState(false)
  const [searched,  setSearched]  = useState(false)
  const [sortBy,    setSortBy]    = useState('total') // 'total'|'qty'|'name'

  useEffect(() => { if (tenantId) fetchData(today, today) }, [tenantId])

  async function fetchData(from = dateFrom, to = dateTo) {
    setLoading(true)
    try {
      const { data: deliveries } = await supabase.from('deliveries')
        .select('customer_id, qty_19l, qty_half_litre, qty_1_5l, total_amount, total_with_tax, payment_method, is_voided, customers(full_name, mobile, customer_code, address)')
        .eq('tenant_id', tenantId)
        .eq('is_voided', false)
        .gte('delivered_at', from + 'T00:00:00')
        .lte('delivered_at', to + 'T23:59:59')

      // Group by customer
      const map = {}
      deliveries?.forEach(d => {
        const id   = d.customer_id
        const name = d.customers?.full_name || 'Unknown'
        if (!map[id]) {
          map[id] = {
            id, name,
            mobile:       d.customers?.mobile || '',
            customer_code: d.customers?.customer_code || '',
            address:      d.customers?.address || '',
            qty19l:       0, qtyHalf: 0, qty15l: 0,
            totalQty:     0, totalSales: 0,
            cash: 0, credit: 0, jazzcash: 0, easypaisa: 0, bank: 0,
            deliveries:   0,
          }
        }
        map[id].qty19l    += Number(d.qty_19l || 0)
        map[id].qtyHalf   += Number(d.qty_half_litre || 0)
        map[id].qty15l    += Number(d.qty_1_5l || 0)
        map[id].totalQty  += Number(d.qty_19l || 0) + Number(d.qty_half_litre || 0) + Number(d.qty_1_5l || 0)
        map[id].totalSales += Number(d.total_with_tax || d.total_amount || 0)
        map[id].deliveries += 1
        const pm = d.payment_method || 'cash'
        if (map[id][pm] !== undefined) map[id][pm] += Number(d.total_with_tax || d.total_amount || 0)
      })

      setData(Object.values(map))
      setSearched(true)
    } catch (err) {
      console.error('CustomerSales error:', err)
    }
    setLoading(false)
  }

  function applyQuick(from, to) {
    setDateFrom(from); setDateTo(to)
    fetchData(from, to)
  }

  const today2      = new Date().toISOString().split('T')[0]
  const yesterday   = new Date(Date.now() - 86400000).toISOString().split('T')[0]
  const firstOfMonth = new Date().toISOString().slice(0, 7) + '-01'
  const lastMonth1  = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0]
  const lastMonthEnd = new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split('T')[0]

  const filtered = data
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.mobile.includes(search) || c.customer_code.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'total') return b.totalSales - a.totalSales
      if (sortBy === 'qty')   return b.totalQty - a.totalQty
      if (sortBy === 'name')  return a.name.localeCompare(b.name)
      return 0
    })

  const grandTotal  = filtered.reduce((s, c) => s + c.totalSales, 0)
  const grandQty    = filtered.reduce((s, c) => s + c.totalQty, 0)
  const grand19l    = filtered.reduce((s, c) => s + c.qty19l, 0)

  return (
    <div style={{ fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {/* Filter Bar */}
      <div style={{ background: 'white', borderRadius: 12, padding: '14px 18px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>📅</span>
        {[
          { l: 'Today',      f: today2,      t: today2 },
          { l: 'Yesterday',  f: yesterday,   t: yesterday },
          { l: 'This Month', f: firstOfMonth, t: today2 },
          { l: 'Last Month', f: lastMonth1,  t: lastMonthEnd },
        ].map(p => (
          <button key={p.l} onClick={() => applyQuick(p.f, p.t)}
            style={{ padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              background: dateFrom === p.f && dateTo === p.t ? '#0f4c81' : '#f0f4f8',
              color: dateFrom === p.f && dateTo === p.t ? '#fff' : '#555' }}>
            {p.l}
          </button>
        ))}
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ padding: '6px 10px', border: '1.5px solid #e0e0e0', borderRadius: 6, fontSize: 12, outline: 'none' }} />
        <span style={{ color: '#aaa', fontSize: 12 }}>to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ padding: '6px 10px', border: '1.5px solid #e0e0e0', borderRadius: 6, fontSize: 12, outline: 'none' }} />
        <button onClick={() => fetchData(dateFrom, dateTo)}
          style={{ padding: '7px 16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
          🔍 Search
        </button>
      </div>

      {/* Customer Search */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="🔍 Filter by customer name, mobile or ID..."
        style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 14 }} />

      {/* Summary Cards */}
      {searched && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'Customers',    value: filtered.length + ' customers', color: '#0f4c81', bg: '#e3f0ff' },
            { label: 'Total Sales',  value: 'Rs. ' + grandTotal.toLocaleString(), color: '#1a7a4a', bg: '#e8f5e9' },
            { label: '19L Bottles',  value: grand19l.toLocaleString() + ' btls', color: '#b45309', bg: '#fff8e1' },
            { label: 'Total Units',  value: grandQty.toLocaleString() + ' units', color: '#0f4c81', bg: '#e3f0ff' },
          ].map(c => (
            <div key={c.label} style={{ background: 'white', borderRadius: 10, padding: '10px 14px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', borderLeft: `4px solid ${c.color}` }}>
              <p style={{ fontSize: 10, color: '#888', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: 0.4 }}>{c.label}</p>
              <p style={{ fontSize: 15, fontWeight: 800, color: c.color, margin: 0 }}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Sort */}
      {filtered.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Sort:</span>
          {[{ k: 'total', l: 'Highest Sales' }, { k: 'qty', l: 'Most Units' }, { k: 'name', l: 'Name A-Z' }].map(s => (
            <button key={s.k} onClick={() => setSortBy(s.k)}
              style={{ padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: sortBy === s.k ? '#0f4c81' : '#f0f4f8', color: sortBy === s.k ? '#fff' : '#555' }}>
              {s.l}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ color: '#888', fontSize: 14 }}>Loading customer sales...</p>
        </div>
      )}

      {/* Table */}
      {!loading && searched && filtered.length === 0 && (
        <div style={{ background: 'white', borderRadius: 12, padding: 50, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 40, margin: '0 0 12px' }}>📭</p>
          <p style={{ fontWeight: 700, color: '#888', fontSize: 15 }}>No sales found for this period</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.07)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                {['#', 'Customer', 'Mobile', 'Deliveries', '19L', 'Half L', '1.5L', 'Total Qty', 'Cash', 'Credit', 'Digital', 'Total Sales'].map((h, i) => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: i >= 3 ? 'right' : 'left', fontSize: 11, color: '#666', fontWeight: 700, borderBottom: '2px solid #eee', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, idx) => {
                const digital = c.jazzcash + c.easypaisa + c.bank
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '10px 12px', fontSize: 11, color: '#aaa' }}>{idx + 1}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', margin: '0 0 1px' }}>{c.name}</p>
                      <p style={{ fontSize: 10, color: '#aaa', margin: 0 }}>{c.customer_code}</p>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#555' }}>{c.mobile || '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#555', textAlign: 'right' }}>{c.deliveries}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, fontWeight: 600, color: '#0f4c81', textAlign: 'right' }}>{c.qty19l || '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#555', textAlign: 'right' }}>{c.qtyHalf || '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#555', textAlign: 'right' }}>{c.qty15l || '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: '#333', textAlign: 'right' }}>{c.totalQty}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#1a7a4a', textAlign: 'right' }}>{c.cash > 0 ? 'Rs. ' + c.cash.toLocaleString() : '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#c62828', textAlign: 'right' }}>{c.credit > 0 ? 'Rs. ' + c.credit.toLocaleString() : '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: '#9c27b0', textAlign: 'right' }}>{digital > 0 ? 'Rs. ' + digital.toLocaleString() : '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 14, fontWeight: 800, color: '#1a1a2e', textAlign: 'right' }}>Rs. {c.totalSales.toLocaleString()}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#0f4c81' }}>
                <td colSpan={3} style={{ padding: '11px 12px', fontSize: 13, fontWeight: 700, color: '#fff' }}>TOTAL — {filtered.length} customers</td>
                <td style={{ padding: '11px 12px', color: '#fff', textAlign: 'right', fontWeight: 700 }}>{filtered.reduce((s,c) => s+c.deliveries, 0)}</td>
                <td style={{ padding: '11px 12px', color: '#fff', textAlign: 'right', fontWeight: 700 }}>{grand19l}</td>
                <td style={{ padding: '11px 12px', color: '#fff', textAlign: 'right', fontWeight: 700 }}>{filtered.reduce((s,c) => s+c.qtyHalf, 0)}</td>
                <td style={{ padding: '11px 12px', color: '#fff', textAlign: 'right', fontWeight: 700 }}>{filtered.reduce((s,c) => s+c.qty15l, 0)}</td>
                <td style={{ padding: '11px 12px', color: '#fff', textAlign: 'right', fontWeight: 700 }}>{grandQty}</td>
                <td colSpan={3} style={{ padding: '11px 12px', color: '#fff', textAlign: 'right', fontWeight: 700 }}>—</td>
                <td style={{ padding: '11px 12px', fontSize: 15, fontWeight: 900, color: '#fff', textAlign: 'right' }}>Rs. {grandTotal.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── BOTTLE BALANCE REPORT ──────────────────────────────────────────
function BottleBalance({ tenantId }) {
  const [customers, setCustomers]   = useState([])
  const [loading,   setLoading]     = useState(true)
  const [search,    setSearch]      = useState('')
  const [sortBy,    setSortBy]      = useState('bottles')  // 'bottles' | 'value' | 'name'
  const [bottleCost, setBottleCost] = useState(900)
  const [totalBottles, setTotalBottles] = useState(0)
  const [bizName,   setBizName]     = useState('')

  useEffect(() => { if (tenantId) fetchData() }, [tenantId])

  async function fetchData() {
    setLoading(true)
    try {
      // Fetch bottle replacement cost from settings
      const { data: costSetting } = await supabase.from('business_settings')
        .select('setting_value').eq('tenant_id', tenantId).eq('setting_key', 'bottle_replacement_cost').maybeSingle()
      const cost = Number(costSetting?.setting_value || 900)
      setBottleCost(cost)

      // Fetch business name for print
      const { data: bizSetting } = await supabase.from('business_settings')
        .select('setting_value').eq('tenant_id', tenantId).eq('setting_key', 'business_name').maybeSingle()
      setBizName(bizSetting?.setting_value || '')

      // Fetch all customers with bottle data
      const { data } = await supabase.from('customers')
        .select('id, full_name, mobile, customer_code, address, our_bottles_placed, rate_19l, is_active')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .gt('our_bottles_placed', 0)
        .order('our_bottles_placed', { ascending: false })

      setCustomers(data || [])
      setTotalBottles((data || []).reduce((s, c) => s + Number(c.our_bottles_placed || 0), 0))
    } catch (err) {
      console.error('BottleBalance error:', err)
    }
    setLoading(false)
  }

  function printReport() {
    const win = window.open('', '_blank')
    const totalValue = customers.reduce((s, c) => s + Number(c.our_bottles_placed || 0) * bottleCost, 0)
    const rows = filtered.map((c, i) => `
      <tr style="border-bottom:1px solid #eee; background:${i % 2 === 0 ? 'white' : '#fafafa'}">
        <td style="padding:6px 10px">${i + 1}</td>
        <td style="padding:6px 10px;font-weight:600">${c.full_name}</td>
        <td style="padding:6px 10px">${c.mobile || '—'}</td>
        <td style="padding:6px 10px">${c.customer_code || '—'}</td>
        <td style="padding:6px 10px;text-align:center;font-weight:700;color:#0f4c81">${c.our_bottles_placed}</td>
        <td style="padding:6px 10px;text-align:right;font-weight:700;color:#c62828">Rs. ${(Number(c.our_bottles_placed) * bottleCost).toLocaleString()}</td>
      </tr>
    `).join('')
    win.document.write(`<!DOCTYPE html><html><head><title>${bizName} — Bottle Balance</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;padding:12px}
    table{width:100%;border-collapse:collapse}th{background:#f0f0f0;padding:8px 10px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #ccc}
    @media print{body{padding:8px}}</style></head><body>
    <div style="text-align:center;padding-bottom:10px;border-bottom:2px solid #000;margin-bottom:12px">
      <h1 style="font-size:16px;font-weight:700;margin:0 0 2px">${bizName}</h1>
      <p style="font-size:12px;margin:0 0 1px">Bottle Balance Report</p>
      <p style="font-size:10px;color:#555">Printed: ${new Date().toLocaleDateString('en-PK', { day:'2-digit', month:'long', year:'numeric' })}</p>
    </div>
    <div style="display:flex;gap:20px;margin-bottom:12px;padding:10px;background:#f8f9fa;border-radius:6px">
      <div><p style="font-size:10px;color:#666;margin:0 0 2px">TOTAL CUSTOMERS</p><p style="font-size:16px;font-weight:700;margin:0">${filtered.length}</p></div>
      <div><p style="font-size:10px;color:#666;margin:0 0 2px">TOTAL BOTTLES</p><p style="font-size:16px;font-weight:700;margin:0;color:#0f4c81">${filtered.reduce((s,c) => s + Number(c.our_bottles_placed||0), 0)}</p></div>
      <div><p style="font-size:10px;color:#666;margin:0 0 2px">TOTAL VALUE (@ Rs.${bottleCost}/bottle)</p><p style="font-size:16px;font-weight:700;margin:0;color:#c62828">Rs. ${filtered.reduce((s,c) => s + Number(c.our_bottles_placed||0) * bottleCost, 0).toLocaleString()}</p></div>
    </div>
    <table><thead><tr><th>#</th><th>Customer</th><th>Mobile</th><th>ID</th><th style="text-align:center">Bottles</th><th style="text-align:right">Value</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="background:#0f4c81;color:white"><td colspan="4" style="padding:8px 10px;font-weight:700">TOTAL</td>
    <td style="padding:8px 10px;text-align:center;font-weight:700">${filtered.reduce((s,c) => s + Number(c.our_bottles_placed||0), 0)}</td>
    <td style="padding:8px 10px;text-align:right;font-weight:700">Rs. ${filtered.reduce((s,c) => s + Number(c.our_bottles_placed||0) * bottleCost, 0).toLocaleString()}</td></tr></tfoot>
    </table>
    <div style="margin-top:10px;padding-top:8px;border-top:1px solid #ccc;display:flex;justify-content:space-between;font-size:9px;color:#888">
      <span>Generated by AquaRun • ${bizName}</span>
      <span>Bottle replacement cost: Rs. ${bottleCost}/bottle</span>
    </div>
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 500)
  }

  const filtered = customers
    .filter(c => !search || c.full_name?.toLowerCase().includes(search.toLowerCase()) || c.mobile?.includes(search) || c.customer_code?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'bottles') return Number(b.our_bottles_placed) - Number(a.our_bottles_placed)
      if (sortBy === 'value')   return (Number(b.our_bottles_placed) * bottleCost) - (Number(a.our_bottles_placed) * bottleCost)
      if (sortBy === 'name')    return a.full_name?.localeCompare(b.full_name)
      return 0
    })

  const totalValue      = filtered.reduce((s, c) => s + Number(c.our_bottles_placed || 0) * bottleCost, 0)
  const totalFilteredBtl = filtered.reduce((s, c) => s + Number(c.our_bottles_placed || 0), 0)

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <p style={{ fontSize: 32, margin: '0 0 12px' }}>🫙</p>
      <p style={{ color: '#888', fontSize: 14 }}>Loading bottle balance...</p>
    </div>
  )

  return (
    <div style={{ fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', borderRadius: 12, padding: '18px 22px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p style={{ color: '#fff', fontWeight: 800, fontSize: 17, margin: '0 0 3px' }}>🫙 Bottle Balance Report</p>
          <p style={{ color: '#93c5fd', fontSize: 12, margin: 0 }}>Our bottles currently placed with customers · Rs. {bottleCost}/bottle replacement cost</p>
        </div>
        <button onClick={printReport} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>🖨️ Print / PDF</button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Total Customers', value: filtered.length + ' customers', color: '#0f4c81', bg: '#e3f0ff' },
          { label: 'Total Bottles Out', value: totalFilteredBtl + ' bottles', color: '#1a7a4a', bg: '#e8f5e9' },
          { label: 'Total Value at Risk', value: 'Rs. ' + totalValue.toLocaleString(), color: '#c62828', bg: '#ffebee' },
          { label: 'Avg per Customer', value: filtered.length > 0 ? (totalFilteredBtl / filtered.length).toFixed(1) + ' bottles' : '0', color: '#b45309', bg: '#fff8e1' },
        ].map(c => (
          <div key={c.label} style={{ background: 'white', borderRadius: 10, padding: '12px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${c.color}` }}>
            <p style={{ fontSize: 10, color: '#888', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.4 }}>{c.label}</p>
            <p style={{ fontSize: 17, fontWeight: 800, color: c.color, margin: 0 }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Search + Sort */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search customer name, mobile or ID..."
          style={{ flex: 1, minWidth: 200, padding: '10px 14px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 13, outline: 'none' }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#555', alignSelf: 'center' }}>Sort:</span>
          {[{ k: 'bottles', l: 'Most Bottles' }, { k: 'value', l: 'Highest Value' }, { k: 'name', l: 'Name A-Z' }].map(s => (
            <button key={s.k} onClick={() => setSortBy(s.k)}
              style={{ padding: '8px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: sortBy === s.k ? '#0f4c81' : '#f0f4f8', color: sortBy === s.k ? '#fff' : '#555' }}>
              {s.l}
            </button>
          ))}
        </div>
        <button onClick={fetchData} style={{ padding: '8px 14px', background: '#f0f4f8', color: '#555', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>🔄 Refresh</button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 12, padding: 50, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 40, margin: '0 0 12px' }}>🫙</p>
          <p style={{ fontWeight: 700, color: '#1a7a4a', fontSize: 15, margin: '0 0 4px' }}>No bottles placed with customers</p>
          <p style={{ color: '#888', fontSize: 13, margin: 0 }}>All bottles have been returned</p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                {['#', 'Customer', 'Mobile', 'ID', 'Address', 'Bottles', 'Value at Risk'].map((h, i) => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: i >= 5 ? 'right' : 'left', fontSize: 11, color: '#666', fontWeight: 700, borderBottom: '2px solid #eee', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, idx) => {
                const bottles = Number(c.our_bottles_placed || 0)
                const value   = bottles * bottleCost
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: '#aaa' }}>{idx + 1}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', margin: '0 0 1px' }}>{c.full_name}</p>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: '#555' }}>{c.mobile || '—'}</td>
                    <td style={{ padding: '11px 14px', fontSize: 11, color: '#888' }}>{c.customer_code || '—'}</td>
                    <td style={{ padding: '11px 14px', fontSize: 11, color: '#888', maxWidth: 180 }}>{c.address ? c.address.slice(0, 30) + (c.address.length > 30 ? '...' : '') : '—'}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: '#0f4c81' }}>{bottles}</span>
                      <span style={{ fontSize: 11, color: '#888', marginLeft: 4 }}>btls</span>
                    </td>
                    <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: '#c62828', margin: 0 }}>Rs. {value.toLocaleString()}</p>
                      <p style={{ fontSize: 10, color: '#aaa', margin: '1px 0 0' }}>@ Rs.{bottleCost}/bottle</p>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#0f4c81' }}>
                <td colSpan={5} style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: '#fff' }}>
                  TOTAL — {filtered.length} customers
                </td>
                <td style={{ padding: '12px 14px', fontSize: 15, fontWeight: 900, color: '#fff', textAlign: 'right' }}>
                  {totalFilteredBtl}
                </td>
                <td style={{ padding: '12px 14px', fontSize: 15, fontWeight: 900, color: '#fff', textAlign: 'right' }}>
                  Rs. {totalValue.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function BulkWhatsAppShare({ tenantId }) {
  const [customers, setCustomers] = useState([])
  const [selected, setSelected] = useState({})
  const [loading, setLoading] = useState(true)
  const [businessSettings, setBusinessSettings] = useState({})
  const [filter, setFilter] = useState('balance') // 'balance' | 'all'
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [queue, setQueue] = useState([]) // list of customers to send
  const [queueIndex, setQueueIndex] = useState(0)
  const [sentCount, setSentCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [skippedNames, setSkippedNames] = useState([])
  const [phase, setPhase] = useState('select') // 'select' | 'sending' | 'done'

  useEffect(() => { if (tenantId) { fetchSettings(); fetchCustomers() } }, [tenantId])

  async function fetchSettings() {
    const { data } = await supabase.from('business_settings').select('*').eq('tenant_id', tenantId)
    const map = {}
    data?.forEach(s => { map[s.setting_key] = s.setting_value })
    setBusinessSettings(map)
  }

  async function fetchCustomers() {
    setLoading(true)
    const { data } = await supabase.from('customer_balances').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('full_name')
    setCustomers(data || [])
    setLoading(false)
  }

  const filtered = customers.filter(c => {
    const matchSearch = !search || c.full_name?.toLowerCase().includes(search.toLowerCase()) || c.mobile?.includes(search)
    const matchFilter = filter === 'all' || Number(c.balance) > 0
    return matchSearch && matchFilter
  })

  function toggleSelect(id) {
    setSelected(s => ({ ...s, [id]: !s[id] }))
  }

  function selectAll() {
    const newSel = {}
    filtered.forEach(c => { newSel[c.id] = true })
    setSelected(newSel)
  }

  function deselectAll() { setSelected({}) }

  const selectedList = filtered.filter(c => selected[c.id])
  const withPhone = selectedList.filter(c => c.mobile)
  const withoutPhone = selectedList.filter(c => !c.mobile)

  function buildMessage(customer) {
    const bizName = businessSettings.business_name || 'AquaRun'
    const printDate = new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })
    const balance = Number(customer.balance || 0)
    let msg = `*${bizName} — Account Statement*\n`
    msg += `Date: ${printDate}\n\n`
    msg += `Assalam o Alaikum *${customer.full_name}*,\n\n`
    msg += `Your account summary:\n`
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`
    msg += `*Customer ID:* ${customer.customer_code}\n`
    msg += `*Rate 19L:* Rs. ${customer.rate_19l || 100}\n`
    if (balance > 0) {
      msg += `\n⚠️ *Outstanding Balance: Rs. ${balance.toLocaleString()}*\n`
      msg += `Please settle at your earliest convenience.\n`
    } else if (balance < 0) {
      msg += `\n✅ *Account Balance: Rs. ${Math.abs(balance).toLocaleString()} CR*\n`
      msg += `You have advance credit in your account.\n`
    } else {
      msg += `\n✅ *Account is clear. Thank you!*\n`
    }
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`
    if (businessSettings.jazzcash_number_1) {
      msg += `\n💳 *Pay via:*\n`
      msg += `📱 JazzCash: ${businessSettings.jazzcash_number_1} (${businessSettings.jazzcash_name_1 || ''})\n`
      if (businessSettings.jazzcash_number_2) msg += `💚 EasyPaisa: ${businessSettings.jazzcash_number_2} (${businessSettings.jazzcash_name_2 || ''})\n`
    }
    msg += `\n_Generated by AquaRun • ${bizName}_`
    return msg
  }

  function startSending() {
    const toSend = selectedList.filter(c => c.mobile)
    const skipped = selectedList.filter(c => !c.mobile)
    setQueue(toSend)
    setQueueIndex(0)
    setSentCount(0)
    setSkippedCount(skipped.length)
    setSkippedNames(skipped.map(c => c.full_name))
    setPhase('sending')
    setSending(true)
    if (toSend.length > 0) openWhatsApp(toSend[0])
  }

  function openWhatsApp(customer) {
    const msg = buildMessage(customer)
    const phone = customer.mobile.replace(/^0/, '').replace(/[-\s]/g, '')
    const url = `https://wa.me/92${phone}?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank')
  }

  function markSentAndNext() {
    const nextIndex = queueIndex + 1
    setSentCount(s => s + 1)
    if (nextIndex >= queue.length) {
      setPhase('done')
      setSending(false)
    } else {
      setQueueIndex(nextIndex)
      openWhatsApp(queue[nextIndex])
    }
  }

  function skipAndNext() {
    const nextIndex = queueIndex + 1
    setSkippedCount(s => s + 1)
    setSkippedNames(n => [...n, queue[queueIndex].full_name])
    if (nextIndex >= queue.length) {
      setPhase('done')
      setSending(false)
    } else {
      setQueueIndex(nextIndex)
      openWhatsApp(queue[nextIndex])
    }
  }

  function reset() {
    setPhase('select')
    setSelected({})
    setQueue([])
    setQueueIndex(0)
    setSentCount(0)
    setSkippedCount(0)
    setSkippedNames([])
    setSending(false)
  }

  if (loading) return <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>

  // ── DONE SCREEN ──
  if (phase === 'done') {
    return (
      <div>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>📨 Bulk WhatsApp Share</h3>
        <div style={{ background: 'white', borderRadius: '16px', padding: '40px 24px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '52px', margin: '0 0 16px' }}>🎉</p>
          <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 8px' }}>All Done!</h3>
          <p style={{ fontSize: '14px', color: '#555', margin: '0 0 24px' }}>Statements have been shared successfully.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
            <div style={{ background: '#e8f5e9', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
              <p style={{ fontSize: '32px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 4px' }}>{sentCount}</p>
              <p style={{ fontSize: '13px', color: '#555', margin: 0 }}>✅ Sent</p>
            </div>
            <div style={{ background: '#fff3e0', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
              <p style={{ fontSize: '32px', fontWeight: '700', color: '#e65100', margin: '0 0 4px' }}>{skippedCount}</p>
              <p style={{ fontSize: '13px', color: '#555', margin: 0 }}>⏭️ Skipped</p>
            </div>
          </div>
          {skippedNames.length > 0 && (
            <div style={{ background: '#fff3e0', border: '1px solid #ffe082', borderRadius: '10px', padding: '12px', marginBottom: '20px', textAlign: 'left' }}>
              <p style={{ fontSize: '12px', fontWeight: '700', color: '#e65100', margin: '0 0 6px' }}>Skipped customers:</p>
              {skippedNames.map((n, i) => <p key={i} style={{ fontSize: '12px', color: '#555', margin: '0 0 2px' }}>• {n}</p>)}
            </div>
          )}
          <button onClick={reset}
            style={{ padding: '12px 32px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>
            ← Start Over
          </button>
        </div>
      </div>
    )
  }

  // ── SENDING SCREEN ──
  if (phase === 'sending') {
    const current = queue[queueIndex]
    const progress = queueIndex + 1
    const total = queue.length
    const pct = Math.round((queueIndex / total) * 100)
    return (
      <div>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>📨 Bulk WhatsApp Share</h3>
        <div style={{ background: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          {/* Progress bar */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', color: '#555', fontWeight: '600' }}>Sending {progress} of {total}</span>
              <span style={{ fontSize: '13px', color: '#0f4c81', fontWeight: '700' }}>{pct}%</span>
            </div>
            <div style={{ background: '#f0f0f0', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
              <div style={{ background: '#25d366', height: '100%', width: `${pct}%`, borderRadius: '6px', transition: 'width 0.3s' }} />
            </div>
          </div>

          {/* Current customer */}
          <div style={{ background: '#f0f7ff', borderRadius: '12px', padding: '20px', marginBottom: '20px', textAlign: 'center' }}>
            <p style={{ fontSize: '13px', color: '#888', margin: '0 0 6px' }}>Sending to</p>
            <p style={{ fontSize: '22px', fontWeight: '700', color: '#0f4c81', margin: '0 0 4px' }}>{current.full_name}</p>
            <p style={{ fontSize: '14px', color: '#555', margin: '0 0 4px' }}>📱 {current.mobile}</p>
            <p style={{ fontSize: '14px', fontWeight: '700', color: Number(current.balance) > 0 ? '#f44336' : '#1a7a4a', margin: 0 }}>
              Balance: Rs. {Math.abs(Number(current.balance)).toLocaleString()}{Number(current.balance) < 0 ? ' CR' : ''}
            </p>
          </div>

          <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: '10px', padding: '12px', marginBottom: '20px' }}>
            <p style={{ fontSize: '12px', color: '#795548', margin: 0 }}>
              💬 WhatsApp has opened for this customer. Tap <strong>Send</strong> in WhatsApp, then come back and click <strong>Next</strong> below.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={skipAndNext}
              style={{ flex: 1, padding: '12px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
              ⏭️ Skip
            </button>
            <button onClick={markSentAndNext}
              style={{ flex: 2, padding: '12px', background: '#25d366', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
              ✓ Sent — Next →
            </button>
          </div>

          <button onClick={() => { setPhase('done'); setSending(false) }}
            style={{ width: '100%', marginTop: '10px', padding: '10px', background: 'none', border: '1px solid #ddd', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', color: '#888' }}>
            Stop Sending
          </button>
        </div>
      </div>
    )
  }

  // ── SELECT SCREEN ──
  const selectedCount = selectedList.length
  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '4px' }}>📨 Bulk WhatsApp Share</h3>
      <p style={{ fontSize: '13px', color: '#888', marginBottom: '16px' }}>Select customers to send their account statement via WhatsApp.</p>

      {/* Info box */}
      <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 4px' }}>💡 How it works</p>
        <p style={{ fontSize: '12px', color: '#555', margin: 0, lineHeight: 1.6 }}>
          Select customers → Click Start → WhatsApp opens for each customer one by one → Tap Send → Click Next. Takes ~5 seconds per customer.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <button onClick={() => setFilter('balance')}
          style={{ padding: '8px 14px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: filter === 'balance' ? '#f44336' : '#f0f0f0', color: filter === 'balance' ? 'white' : '#555', fontWeight: filter === 'balance' ? '700' : '400', fontSize: '13px' }}>
          ⚠️ With Balance Due
        </button>
        <button onClick={() => setFilter('all')}
          style={{ padding: '8px 14px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: filter === 'all' ? '#0f4c81' : '#f0f0f0', color: filter === 'all' ? 'white' : '#555', fontWeight: filter === 'all' ? '700' : '400', fontSize: '13px' }}>
          👥 All Customers
        </button>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or mobile..."
        style={{ width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '10px' }} />

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button onClick={selectAll}
          style={{ padding: '7px 14px', background: '#e3f0ff', color: '#0f4c81', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
          ✓ Select All ({filtered.length})
        </button>
        <button onClick={deselectAll}
          style={{ padding: '7px 14px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
          ✕ Deselect All
        </button>
      </div>

      {/* Customer list */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '16px', overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <p style={{ padding: '32px', textAlign: 'center', color: '#888' }}>No customers found</p>
        ) : filtered.map(c => {
          const hasPhone = !!c.mobile
          const isSelected = !!selected[c.id]
          const balance = Number(c.balance || 0)
          return (
            <div key={c.id} onClick={() => toggleSelect(c.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', background: isSelected ? '#f0f7ff' : 'white' }}>
              <div style={{
                width: '22px', height: '22px', borderRadius: '6px', border: '2px solid',
                borderColor: isSelected ? '#0f4c81' : '#ddd',
                background: isSelected ? '#0f4c81' : 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                {isSelected && <span style={{ color: 'white', fontSize: '13px', fontWeight: '700' }}>✓</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px', color: '#333' }}>{c.full_name}</p>
                <p style={{ fontSize: '12px', color: hasPhone ? '#888' : '#f44336', margin: 0 }}>
                  {hasPhone ? `📱 ${c.mobile}` : '⚠️ No mobile number'}
                </p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: '700', margin: '0 0 2px', color: balance > 0 ? '#f44336' : balance < 0 ? '#1a7a4a' : '#888' }}>
                  {balance > 0 ? `Rs. ${balance.toLocaleString()}` : balance < 0 ? `Rs. ${Math.abs(balance).toLocaleString()} CR` : 'Clear'}
                </p>
                <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>{c.mobile}{c.address ? ` · ${c.address}` : ` · ${c.customer_code}`}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary + Start button */}
      {selectedCount > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '12px' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 10px' }}>Selected: {selectedCount} customers</p>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
            <div style={{ flex: 1, background: '#e8f5e9', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
              <p style={{ fontSize: '20px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 2px' }}>{withPhone.length}</p>
              <p style={{ fontSize: '11px', color: '#555', margin: 0 }}>✅ Will be sent</p>
            </div>
            <div style={{ flex: 1, background: '#fff3e0', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
              <p style={{ fontSize: '20px', fontWeight: '700', color: '#e65100', margin: '0 0 2px' }}>{withoutPhone.length}</p>
              <p style={{ fontSize: '11px', color: '#555', margin: 0 }}>⚠️ No number (skip)</p>
            </div>
          </div>
          {withoutPhone.length > 0 && (
            <div style={{ background: '#fff3e0', borderRadius: '8px', padding: '10px', marginBottom: '12px' }}>
              <p style={{ fontSize: '12px', fontWeight: '600', color: '#e65100', margin: '0 0 4px' }}>Will be skipped (no number):</p>
              {withoutPhone.map(c => <p key={c.id} style={{ fontSize: '12px', color: '#555', margin: '0 0 2px' }}>• {c.full_name}</p>)}
            </div>
          )}
          {withPhone.length > 0 ? (
            <button onClick={startSending}
              style={{ width: '100%', padding: '14px', background: '#25d366', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
              💬 Start Sending ({withPhone.length} customers)
            </button>
          ) : (
            <div style={{ background: '#ffebee', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: '#c62828', fontWeight: '600', margin: 0 }}>None of the selected customers have a mobile number.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── RECEIVABLES AGEING ────────────────────────────────────────────
function ReceivablesAgeing({ tenantId }) {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { if (tenantId) fetchAgeing() }, [tenantId])

  async function fetchAgeing() {
    setLoading(true)
    const { data } = await supabase.from('customer_balances').select('*').eq('tenant_id', tenantId).eq('is_active', true).gt('balance', 0).order('balance', { ascending: false })
    const today = new Date()
    const customersWithAge = await Promise.all((data || []).map(async c => {
      const { data: lastDelivery } = await supabase.from('deliveries').select('delivered_at').eq('customer_id', c.id).eq('tenant_id', tenantId).eq('is_voided', false).order('delivered_at', { ascending: false }).limit(1).single()
      const lastDate = lastDelivery ? new Date(lastDelivery.delivered_at) : null
      const daysPending = lastDate ? Math.floor((today - lastDate) / (1000 * 60 * 60 * 24)) : 999
      let ageBucket = '60+ days'
      if (daysPending <= 30) ageBucket = '0-30 days'
      else if (daysPending <= 60) ageBucket = '31-60 days'
      return { ...c, daysPending, ageBucket }
    }))
    setCustomers(customersWithAge)
    setLoading(false)
  }

  const filtered = customers.filter(c => !search || c.full_name?.toLowerCase().includes(search.toLowerCase()) || c.mobile?.includes(search) || c.customer_code?.includes(search))
  const bucket0_30 = filtered.filter(c => c.ageBucket === '0-30 days')
  const bucket31_60 = filtered.filter(c => c.ageBucket === '31-60 days')
  const bucket60plus = filtered.filter(c => c.ageBucket === '60+ days')
  const totalReceivable = filtered.reduce((s, c) => s + Number(c.balance), 0)

  function BucketSection({ title, items, color }) {
    if (items.length === 0) return null
    const total = items.reduce((s, c) => s + Number(c.balance), 0)
    return (
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color, margin: 0 }}>{title} ({items.length} customers)</p>
          <p style={{ fontSize: '13px', fontWeight: '700', color, margin: 0 }}>Rs. {total.toLocaleString()}</p>
        </div>
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          {items.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
              <div>
                <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>{c.full_name}</p>
                <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{c.mobile}{c.address ? ` · ${c.address}` : ` · ${c.customer_code}`}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '14px', fontWeight: '700', color: '#f44336', margin: '0 0 2px' }}>Rs. {Number(c.balance).toLocaleString()}</p>
                <p style={{ fontSize: '11px', color, margin: 0 }}>{c.daysPending === 999 ? 'No deliveries' : c.daysPending + ' days'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>⏳ Receivables Ageing</h3>
      {loading ? <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p> : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            {[
              { label: 'Total Receivable', value: totalReceivable, color: '#0f4c81' },
              { label: '0-30 Days', value: bucket0_30.reduce((s, c) => s + Number(c.balance), 0), color: '#1a7a4a' },
              { label: '31-60 Days', value: bucket31_60.reduce((s, c) => s + Number(c.balance), 0), color: '#e65100' },
              { label: '60+ Days', value: bucket60plus.reduce((s, c) => s + Number(c.balance), 0), color: '#c62828' },
            ].map(card => (
              <div key={card.label} style={{ background: 'white', borderRadius: '10px', padding: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
                <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>{card.label}</p>
                <p style={{ fontSize: '15px', fontWeight: '700', color: card.color, margin: 0 }}>Rs. {card.value.toLocaleString()}</p>
              </div>
            ))}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer..."
            style={{ width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' }} />
          <BucketSection title="🟢 0-30 Days" items={bucket0_30} color="#1a7a4a" />
          <BucketSection title="🟡 31-60 Days" items={bucket31_60} color="#e65100" />
          <BucketSection title="🔴 60+ Days" items={bucket60plus} color="#c62828" />
          {filtered.length === 0 && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '32px', marginBottom: '8px' }}>✅</p>
              <p style={{ fontWeight: '700', color: '#1a7a4a' }}>No outstanding receivables!</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── SALES TAX REPORT ──────────────────────────────────────────────
function SalesTaxReport({ tenantId }) {
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 7) + '-01')
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [filter, setFilter] = useState('taxable') // 'taxable' | 'zero' | 'all'
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (tenantId) fetchTaxReport() }, [dateFrom, dateTo, tenantId])

  async function fetchTaxReport() {
    setLoading(true)
    const { data: deliveries } = await supabase.from('deliveries')
      .select('*, customers(full_name, customer_code, is_tax_applicable)')
      .eq('tenant_id', tenantId).eq('is_voided', false)
      .gte('delivered_at', dateFrom + 'T00:00:00')
      .lte('delivered_at', dateTo + 'T23:59:59')
      .order('delivered_at', { ascending: false })
    setData(deliveries || [])
    setLoading(false)
  }

  const taxable = data.filter(d => d.customers?.is_tax_applicable)
  const zeroRated = data.filter(d => !d.customers?.is_tax_applicable)
  const displayed = filter === 'taxable' ? taxable : filter === 'zero' ? zeroRated : data

  const totalSales = displayed.reduce((s, d) => s + Number(d.total_amount || 0), 0)
  const totalTax = displayed.reduce((s, d) => s + Number(d.tax_amount || 0), 0)
  const totalWithTax = displayed.reduce((s, d) => s + Number(d.total_with_tax || d.total_amount || 0), 0)

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>🧾 Sales Tax Report</h3>

      <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div><label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>From</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none' }} /></div>
        <div><label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>To</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none' }} /></div>
        <button onClick={fetchTaxReport} style={{ padding: '8px 16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>🔄 Refresh</button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {[{ key: 'taxable', label: '🧾 Tax Enabled' }, { key: 'zero', label: '⭕ Zero Rated' }, { key: 'all', label: '📋 All' }].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{ padding: '8px 14px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', background: filter === f.key ? '#0f4c81' : '#f0f0f0', color: filter === f.key ? 'white' : '#555', fontWeight: filter === f.key ? '700' : '400' }}>
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
        {[
          
          { label: 'Total Sales (excl. tax)', value: totalSales, color: '#0f4c81' },
          { label: 'Output Tax Collected', value: totalTax, color: '#f57f17' },
          { label: 'Total with Tax', value: totalWithTax, color: '#1a7a4a' },
        ].map(card => (
          <div key={card.label} style={{ background: 'white', borderRadius: '10px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <p style={{ fontSize: '11px', color: '#888', margin: '0 0 6px' }}>{card.label}</p>
            <p style={{ fontSize: '16px', fontWeight: '700', color: card.color, margin: 0 }}>Rs. {card.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#f57f17', margin: '0 0 4px' }}>🏛️ Tax Payable to FBR</p>
        <p style={{ fontSize: '11px', color: '#795548', margin: 0 }}>Output Tax Rs. {totalTax.toLocaleString()} — Input Tax Rs. 0 = <strong>Net Payable Rs. {totalTax.toLocaleString()}</strong></p>
      </div>

      {loading ? <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p> : (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                {['Date', 'Invoice No', 'Customer', 'Sale Amount', 'Tax Rate', 'Tax Amount', 'Total'].map(h => (
                  <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: '11px', color: '#666', fontWeight: '700', borderBottom: '2px solid #eee', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#888' }}>No transactions found</td></tr>
              ) : displayed.map((d, i) => (
                <tr key={d.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '10px 14px', fontSize: '12px', color: '#555', whiteSpace: 'nowrap' }}>
                    {new Date(d.delivered_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '12px', fontWeight: '600', color: '#0f4c81' }}>{d.invoice_number || '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: '12px', color: '#333' }}>
                    <p style={{ margin: '0 0 2px', fontWeight: '600' }}>{d.customers?.full_name}</p>
                    <p style={{ margin: 0, fontSize: '10px', color: '#aaa' }}>{d.customers?.customer_code}</p>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '12px', fontWeight: '600', color: '#333' }}>Rs. {Number(d.total_amount || 0).toLocaleString()}</td>
                  <td style={{ padding: '10px 14px', fontSize: '12px', color: d.customers?.is_tax_applicable ? '#f57f17' : '#aaa' }}>
                    {d.customers?.is_tax_applicable ? `${d.tax_rate || 0}%` : 'Zero Rated'}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '12px', fontWeight: '700', color: '#f57f17' }}>
                    {Number(d.tax_amount || 0) > 0 ? `Rs. ${Number(d.tax_amount).toLocaleString()}` : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '12px', fontWeight: '700', color: '#1a7a4a' }}>
                    Rs. {Number(d.total_with_tax || d.total_amount || 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8f9fa', borderTop: '2px solid #eee' }}>
                <td colSpan={3} style={{ padding: '12px 14px', fontSize: '13px', fontWeight: '700', color: '#333' }}>Total — {displayed.length} transactions</td>
                <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: '700', color: '#0f4c81' }}>Rs. {totalSales.toLocaleString()}</td>
                <td></td>
                <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: '700', color: '#f57f17' }}>Rs. {totalTax.toLocaleString()}</td>
                <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: '700', color: '#1a7a4a' }}>Rs. {totalWithTax.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── COLLECTION ANALYSIS ───────────────────────────────────────────
function CollectionAnalysis({ tenantId }) {
  const today     = new Date().toISOString().split('T')[0]
  const thisMonth = new Date().toISOString().slice(0, 7)
  const [loading,    setLoading]    = useState(true)
  const [view,       setView]       = useState('aging')   // 'aging' | 'source'
  const [search,     setSearch]     = useState('')
  const [data,       setData]       = useState(null)
  const [refMonth,   setRefMonth]   = useState(thisMonth) // for collection source

  useEffect(() => { if (tenantId) fetchData() }, [tenantId])

  async function fetchData() {
    setLoading(true)
    try {
      // ── Fetch all credit/unpaid deliveries ──
      const { data: deliveries } = await supabase
        .from('deliveries')
        .select('id, customer_id, delivered_at, total_amount, total_with_tax, amount_received, credit_amount, payment_method, jazzcash_confirmed')
        .eq('tenant_id', tenantId)
        .eq('is_voided', false)
        .order('delivered_at', { ascending: false })

      // ── Fetch all payments ──
      const { data: payments } = await supabase
        .from('payments')
        .select('id, customer_id, amount, payment_date, payment_method, jazzcash_confirmed, created_at')
        .eq('tenant_id', tenantId)
        .eq('is_voided', false)
        .order('payment_date', { ascending: false })

      // ── Fetch customer balances ──
      const { data: customers } = await supabase
        .from('customer_balances')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .gt('balance', 0)
        .order('balance', { ascending: false })

      const now = new Date()

      // ── Build aging per customer ──
      const aging = (customers || []).map(c => {
        // Find oldest unpaid delivery for this customer
        const custDeliveries = (deliveries || [])
          .filter(d => d.customer_id === c.id && d.payment_method === 'credit')
          .sort((a, b) => new Date(a.delivered_at) - new Date(b.delivered_at))

        const oldest = custDeliveries[0]
        const daysPending = oldest
          ? Math.floor((now - new Date(oldest.delivered_at)) / 86400000)
          : 999

        const bucket = daysPending <= 30 ? '0-30'
          : daysPending <= 60 ? '31-60'
          : daysPending <= 90 ? '61-90'
          : '90+'

        return { ...c, daysPending, bucket, oldestDate: oldest?.delivered_at }
      })

      // ── Build collection source (which month's sales are being collected now) ──
      // Group payments by payment_month, then find which delivery month they belong to
      const paymentsByMonth = {}
      ;(payments || []).forEach(p => {
        const payMonth = (p.payment_date || p.created_at || '').slice(0, 7)
        if (!payMonth) return
        if (!paymentsByMonth[payMonth]) paymentsByMonth[payMonth] = []
        paymentsByMonth[payMonth].push(p)
      })

      // For each payment month, figure out which delivery months the collections came from
      // We do this by matching payment customer + approximate timing
      const collectionSource = {}
      Object.entries(paymentsByMonth).forEach(([payMonth, pmts]) => {
        const sourceBreakdown = {}
        let totalCollected = 0
        pmts.forEach(p => {
          const amt = Number(p.amount)
          totalCollected += amt
          // Find deliveries for this customer before payment date
          const custDels = (deliveries || []).filter(d =>
            d.customer_id === p.customer_id &&
            d.payment_method === 'credit' &&
            new Date(d.delivered_at) <= new Date(p.payment_date || p.created_at)
          ).sort((a, b) => new Date(b.delivered_at) - new Date(a.delivered_at))

          // Attribute payment to most recent delivery month
          const delMonth = custDels[0]?.delivered_at?.slice(0, 7) || payMonth
          sourceBreakdown[delMonth] = (sourceBreakdown[delMonth] || 0) + amt
        })
        collectionSource[payMonth] = { totalCollected, sourceBreakdown }
      })

      // ── DSO calculation ──
      const last30Days = new Date(now - 30 * 86400000).toISOString().split('T')[0]
      const recentSales = (deliveries || [])
        .filter(d => d.delivered_at >= last30Days)
        .reduce((s, d) => s + Number(d.total_with_tax || d.total_amount), 0)
      const totalAR = (customers || []).reduce((s, c) => s + Number(c.balance), 0)
      const dso = recentSales > 0 ? Math.round((totalAR / recentSales) * 30) : 0

      setData({ aging, collectionSource, dso, totalAR, customers })
    } catch (err) {
      console.error('CollectionAnalysis error:', err)
    }
    setLoading(false)
  }

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <p style={{ fontSize: 32, margin: '0 0 12px' }}>📥</p>
      <p style={{ color: '#888', fontSize: 14 }}>Analysing collections...</p>
    </div>
  )

  if (!data) return null

  const filteredAging = data.aging.filter(c =>
    !search || c.full_name?.toLowerCase().includes(search.toLowerCase()) || c.mobile?.includes(search)
  )

  const buckets = {
    '0-30':  filteredAging.filter(c => c.bucket === '0-30'),
    '31-60': filteredAging.filter(c => c.bucket === '31-60'),
    '61-90': filteredAging.filter(c => c.bucket === '61-90'),
    '90+':   filteredAging.filter(c => c.bucket === '90+'),
  }

  const bucketTotals = Object.fromEntries(
    Object.entries(buckets).map(([k, v]) => [k, v.reduce((s, c) => s + Number(c.balance), 0)])
  )

  const BUCKET_CONFIG = [
    { key: '0-30',  label: '0–30 Days',  color: '#1a7a4a', bg: '#e8f5e9', risk: 'Current' },
    { key: '31-60', label: '31–60 Days', color: '#b45309', bg: '#fff8e1', risk: 'Overdue' },
    { key: '61-90', label: '61–90 Days', color: '#c2410c', bg: '#fff3e0', risk: 'At Risk' },
    { key: '90+',   label: '90+ Days',   color: '#c62828', bg: '#ffebee', risk: 'Critical' },
  ]

  const sourceData = data.collectionSource[refMonth]

  return (
    <div style={{ fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', borderRadius: 12, padding: '18px 22px', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p style={{ color: '#fff', fontWeight: 800, fontSize: 17, margin: '0 0 3px' }}>📥 Collection Analysis</p>
          <p style={{ color: '#93c5fd', fontSize: 12, margin: 0 }}>AR Aging · Collection Source · Days Sales Outstanding</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ color: '#93c5fd', fontSize: 11, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: 1 }}>Total Receivable</p>
          <p style={{ color: '#fff', fontWeight: 900, fontSize: 22, margin: '0 0 2px' }}>Rs. {data.totalAR.toLocaleString()}</p>
          <p style={{ color: data.dso <= 30 ? '#6ee7b7' : data.dso <= 60 ? '#fde68a' : '#fca5a5', fontSize: 12, fontWeight: 700, margin: 0 }}>
            DSO: {data.dso} days {data.dso <= 30 ? '✅' : data.dso <= 60 ? '⚠️' : '🔴'}
          </p>
        </div>
      </div>

      {/* View Toggle */}
      <div style={{ display: 'flex', gap: 6, background: 'white', padding: 5, borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 18 }}>
        {[
          { key: 'aging',  label: '⏳ AR Aging Analysis' },
          { key: 'source', label: '📊 Collection Source' },
        ].map(v => (
          <button key={v.key} onClick={() => setView(v.key)} style={{
            flex: 1, padding: '9px', border: 'none', borderRadius: 7, cursor: 'pointer',
            background: view === v.key ? '#0f4c81' : 'transparent',
            color: view === v.key ? 'white' : '#666',
            fontWeight: view === v.key ? 700 : 500, fontSize: 13,
          }}>{v.label}</button>
        ))}
      </div>

      {/* ══ AR AGING ══ */}
      {view === 'aging' && (
        <div>
          {/* Bucket Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
            {BUCKET_CONFIG.map(b => (
              <div key={b.key} style={{ background: 'white', borderRadius: 10, padding: '12px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${b.color}` }}>
                <p style={{ fontSize: 10, color: '#888', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: 0.5 }}>{b.label}</p>
                <p style={{ fontSize: 11, color: b.color, fontWeight: 700, margin: '0 0 4px' }}>{b.risk}</p>
                <p style={{ fontSize: 16, fontWeight: 800, color: b.color, margin: '0 0 2px' }}>Rs. {bucketTotals[b.key].toLocaleString()}</p>
                <p style={{ fontSize: 10, color: '#aaa', margin: 0 }}>{buckets[b.key].length} customers</p>
              </div>
            ))}
          </div>

          {/* Search */}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search customer name or mobile..."
            style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 16 }} />

          {/* Bucket Sections */}
          {BUCKET_CONFIG.map(b => {
            const items = buckets[b.key]
            if (items.length === 0) return null
            const total = bucketTotals[b.key]
            return (
              <div key={b.key} style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', background: b.bg, borderRadius: '8px 8px 0 0', border: `1px solid ${b.color}20` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: b.color, display: 'inline-block' }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: b.color }}>{b.label} — {b.risk}</span>
                    <span style={{ fontSize: 11, color: '#888' }}>({items.length} customers)</span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 800, color: b.color }}>Rs. {total.toLocaleString()}</span>
                </div>
                <div style={{ background: 'white', borderRadius: '0 0 8px 8px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  {items.map((c, i) => (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', borderBottom: i < items.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', margin: '0 0 2px' }}>{c.full_name}</p>
                        <p style={{ fontSize: 11, color: '#888', margin: 0 }}>{c.mobile} · {c.customer_code}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 15, fontWeight: 800, color: b.color, margin: '0 0 2px' }}>Rs. {Number(c.balance).toLocaleString()}</p>
                        <p style={{ fontSize: 11, color: '#888', margin: 0 }}>
                          {c.daysPending === 999 ? 'No credit deliveries' : `${c.daysPending} days outstanding`}
                        </p>
                        {c.oldestDate && (
                          <p style={{ fontSize: 10, color: '#aaa', margin: '1px 0 0' }}>
                            Since {new Date(c.oldestDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {filteredAging.length === 0 && (
            <div style={{ background: 'white', borderRadius: 12, padding: 50, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: 40, margin: '0 0 12px' }}>✅</p>
              <p style={{ fontWeight: 700, color: '#1a7a4a', fontSize: 15 }}>No outstanding receivables!</p>
              <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>All customer balances are clear</p>
            </div>
          )}
        </div>
      )}

      {/* ══ COLLECTION SOURCE ══ */}
      {view === 'source' && (
        <div>
          {/* Month selector */}
          <div style={{ background: 'white', borderRadius: 10, padding: '12px 16px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#555' }}>📅 Show collections received in:</span>
            <input type="month" value={refMonth} onChange={e => setRefMonth(e.target.value)}
              style={{ padding: '7px 12px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 14, outline: 'none', color: '#333' }} />
            <button onClick={fetchData}
              style={{ padding: '7px 16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              🔍 Search
            </button>
          </div>

          {!sourceData ? (
            <div style={{ background: 'white', borderRadius: 12, padding: 50, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: 40, margin: '0 0 12px' }}>📭</p>
              <p style={{ fontWeight: 700, color: '#888', fontSize: 15 }}>No collections found for this month</p>
            </div>
          ) : (
            <div>
              {/* Total collected card */}
              <div style={{ background: 'linear-gradient(135deg,#1a7a4a,#2e7d32)', borderRadius: 12, padding: '16px 20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ color: '#a7f3d0', fontSize: 12, margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Total Collected in {new Date(refMonth + '-01').toLocaleDateString('en-PK', { month: 'long', year: 'numeric' })}
                  </p>
                  <p style={{ color: '#fff', fontWeight: 900, fontSize: 26, margin: 0 }}>Rs. {sourceData.totalCollected.toLocaleString()}</p>
                </div>
                <div style={{ fontSize: 40, opacity: 0.3 }}>💰</div>
              </div>

              {/* Source breakdown */}
              <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0', background: '#f8fafc' }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#1a1a2e', margin: 0 }}>Which Month's Sales Were Collected?</p>
                  <p style={{ fontSize: 11, color: '#888', margin: '3px 0 0' }}>Collections broken down by the month the sale was originally made</p>
                </div>
                {Object.entries(sourceData.sourceBreakdown)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([month, amount]) => {
                    const pct = Math.round((amount / sourceData.totalCollected) * 100)
                    const isCurrentMonth = month === refMonth
                    const monthsAgo = Math.round((new Date(refMonth + '-01') - new Date(month + '-01')) / (1000 * 60 * 60 * 24 * 30))
                    return (
                      <div key={month} style={{ padding: '14px 18px', borderBottom: '1px solid #f5f5f5' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>
                              {new Date(month + '-01').toLocaleDateString('en-PK', { month: 'long', year: 'numeric' })}
                            </span>
                            <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                              background: isCurrentMonth ? '#e3f0ff' : monthsAgo <= 1 ? '#e8f5e9' : monthsAgo <= 2 ? '#fff8e1' : '#ffebee',
                              color: isCurrentMonth ? '#0f4c81' : monthsAgo <= 1 ? '#1a7a4a' : monthsAgo <= 2 ? '#b45309' : '#c62828',
                            }}>
                              {isCurrentMonth ? 'Current Month' : monthsAgo === 1 ? '1 month old' : `${monthsAgo} months old`}
                            </span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: '#1a7a4a' }}>Rs. {amount.toLocaleString()}</span>
                            <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>{pct}%</span>
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3,
                            background: isCurrentMonth ? '#0f4c81' : monthsAgo <= 1 ? '#1a7a4a' : monthsAgo <= 2 ? '#f59e0b' : '#ef4444',
                            transition: 'width 0.5s ease',
                          }} />
                        </div>
                      </div>
                    )
                  })}

                {/* DSO insight */}
                <div style={{ padding: '14px 18px', background: '#f8fafc', borderTop: '2px solid #e0e0e0' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#555', margin: '0 0 6px' }}>📊 Collection Insight</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    {[
                      { label: 'DSO (Days Sales Outstanding)', value: `${data.dso} days`, color: data.dso <= 30 ? '#1a7a4a' : data.dso <= 60 ? '#b45309' : '#c62828' },
                      { label: 'Total Outstanding (AR)', value: `Rs. ${data.totalAR.toLocaleString()}`, color: '#0f4c81' },
                      { label: 'Current Month Collection', value: `Rs. ${sourceData.totalCollected.toLocaleString()}`, color: '#1a7a4a' },
                    ].map(m => (
                      <div key={m.label} style={{ textAlign: 'center', padding: '10px', background: 'white', borderRadius: 8, border: '1px solid #e0e0e0' }}>
                        <p style={{ fontSize: 10, color: '#888', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.3 }}>{m.label}</p>
                        <p style={{ fontSize: 14, fontWeight: 800, color: m.color, margin: 0 }}>{m.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── EXECUTIVE SUMMARY ─────────────────────────────────────────────
function ExecutiveSummary({ tenantId }) {
  const today      = new Date()
  const thisMonth  = today.toISOString().slice(0, 7)
  const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lastMonth  = lastMonthDate.toISOString().slice(0, 7)

  const [loading,      setLoading]      = useState(true)
  const [period,       setPeriod]       = useState('month')   // 'month' | 'quarter' | 'year'
  const [currentM,     setCurrentM]     = useState(thisMonth)
  const [compareM,     setCompareM]     = useState(lastMonth)
  const [data,         setData]         = useState(null)
  const [bizName,      setBizName]      = useState('')
  const [lang,         setLang]         = useState('both')    // 'en' | 'ur' | 'both'

  useEffect(() => { if (tenantId) fetchAll() }, [tenantId, currentM, compareM])

  // ── Helper: fetch all journal lines for a month range ──
  async function fetchJournalData(from, to) {
    let allEntries = [], page = 0
    while (true) {
      const { data: jeData } = await supabase.from('journal_entries')
        .select('id, entry_date, reference_type, narration')
        .eq('tenant_id', tenantId)
        .gte('entry_date', from).lte('entry_date', to)
        .range(page * 1000, page * 1000 + 999)
      if (!jeData || jeData.length === 0) break
      allEntries = allEntries.concat(jeData)
      if (jeData.length < 1000) break
      page++
    }
    if (allEntries.length === 0) return {}

    const jeIds = allEntries.map(j => j.id)
    const jeMap = {}
    allEntries.forEach(j => { jeMap[j.id] = j })

    let allLines = []
    for (let i = 0; i < jeIds.length; i += 100) {
      const { data: lines } = await supabase.from('journal_entry_lines')
        .select('account_code, account_name, debit, credit, journal_entry_id')
        .eq('tenant_id', tenantId)
        .in('journal_entry_id', jeIds.slice(i, i + 100))
      if (lines) allLines = allLines.concat(lines)
    }

    // Group by account_code — reads ALL accounts dynamically
    const accounts = {}
    allLines.forEach(l => {
      if (!accounts[l.account_code]) {
        accounts[l.account_code] = { code: l.account_code, name: l.account_name, debit: 0, credit: 0 }
      }
      accounts[l.account_code].debit  += Number(l.debit  || 0)
      accounts[l.account_code].credit += Number(l.credit || 0)
    })
    return accounts
  }

  async function fetchAll() {
    setLoading(true)
    try {
      // Business name
      const { data: biz } = await supabase.from('business_settings')
        .select('setting_value').eq('tenant_id', tenantId).eq('setting_key', 'business_name').maybeSingle()
      setBizName(biz?.setting_value || 'Your Business')

      const curFrom  = currentM + '-01'
      const curTo    = new Date(new Date(curFrom).setMonth(new Date(curFrom).getMonth() + 1) - 1).toISOString().split('T')[0]
      const cmpFrom  = compareM + '-01'
      const cmpTo    = new Date(new Date(cmpFrom).setMonth(new Date(cmpFrom).getMonth() + 1) - 1).toISOString().split('T')[0]

      const [curAccounts, cmpAccounts] = await Promise.all([
        fetchJournalData(curFrom, curTo),
        fetchJournalData(cmpFrom, cmpTo),
      ])

      // ── Deliveries for bottle count + payment mix ──
      const [
        { data: curDeliveries },
        { data: cmpDeliveries },
        { data: curPayments },
        { data: pendingDigital },
        { data: overdueCustomers },
        { data: salaryStatus },
        { data: curExpensesData },
        { data: curOfficeExp },
      ] = await Promise.all([
        supabase.from('deliveries').select('qty_19l,qty_half_litre,qty_1_5l,payment_method,total_with_tax,total_amount').eq('tenant_id', tenantId).eq('is_voided', false).gte('delivered_at', curFrom + 'T00:00:00').lte('delivered_at', curTo + 'T23:59:59'),
        supabase.from('deliveries').select('qty_19l,qty_half_litre,qty_1_5l,payment_method,total_with_tax,total_amount').eq('tenant_id', tenantId).eq('is_voided', false).gte('delivered_at', cmpFrom + 'T00:00:00').lte('delivered_at', cmpTo + 'T23:59:59'),
        supabase.from('payments').select('amount,payment_method').eq('tenant_id', tenantId).eq('is_voided', false).gte('payment_date', curFrom).lte('payment_date', curTo),
        supabase.from('deliveries').select('id,payment_method,total_with_tax,total_amount').eq('tenant_id', tenantId).eq('is_voided', false).eq('jazzcash_confirmed', false).in('payment_method', ['jazzcash','easypaisa','bank']),
        supabase.from('customer_balances').select('id,full_name,balance,mobile').eq('tenant_id', tenantId).eq('is_active', true).gt('balance', 0),
        supabase.from('salary_payments').select('rider_id,amount_paid,month_year').eq('tenant_id', tenantId).eq('month_year', currentM),
        supabase.from('expenses').select('expense_type,amount').eq('tenant_id', tenantId).eq('is_voided', false).gte('expense_date', curFrom).lte('expense_date', curTo),
        supabase.from('office_expenses').select('coa_account_name,category,amount').eq('tenant_id', tenantId).eq('is_voided', false).gte('expense_date', curFrom).lte('expense_date', curTo),
      ])

      // ── Revenue (4xxx credit) — reads all 4xxx dynamically ──
      const revenue    = (acc) => Object.values(acc).filter(a => a.code.startsWith('4')).reduce((s, a) => s + (a.credit - a.debit), 0)
      const cogs       = (acc) => Object.values(acc).filter(a => a.code.startsWith('5')).reduce((s, a) => s + Math.max(0, a.debit - a.credit), 0)
      const expenses   = (acc) => Object.values(acc).filter(a => a.code.startsWith('6')).reduce((s, a) => s + Math.max(0, a.debit - a.credit), 0)
      const expByCode  = (acc, code) => Math.max(0, (acc[code]?.debit || 0) - (acc[code]?.credit || 0))

      const curRevenue  = revenue(curAccounts)
      const cmpRevenue  = revenue(cmpAccounts)
      const curCOGS     = cogs(curAccounts)
      const cmpCOGS     = cogs(cmpAccounts)
      const curExpenses = expenses(curAccounts)
      const cmpExpenses = expenses(cmpAccounts)
      const curProfit   = curRevenue - curCOGS - curExpenses
      const cmpProfit   = cmpRevenue - cmpCOGS - cmpExpenses

      // ── Delivery stats ──
      const cur19l    = curDeliveries?.reduce((s, d) => s + Number(d.qty_19l || 0), 0) || 0
      const cmp19l    = cmpDeliveries?.reduce((s, d) => s + Number(d.qty_19l || 0), 0) || 0
      const curHalf   = curDeliveries?.reduce((s, d) => s + Number(d.qty_half_litre || 0), 0) || 0
      const cmpHalf   = cmpDeliveries?.reduce((s, d) => s + Number(d.qty_half_litre || 0), 0) || 0
      const curTotal  = cur19l + curHalf
      const cmpTotal  = cmp19l + cmpHalf

      // ── Payment mix ──
      const curCash   = curDeliveries?.filter(d => d.payment_method === 'cash').reduce((s, d) => s + Number(d.total_with_tax || d.total_amount), 0) || 0
      const curCredit = curDeliveries?.filter(d => d.payment_method === 'credit').reduce((s, d) => s + Number(d.total_with_tax || d.total_amount), 0) || 0
      const cmpCredit = cmpDeliveries?.filter(d => d.payment_method === 'credit').reduce((s, d) => s + Number(d.total_with_tax || d.total_amount), 0) || 0
      const creditPct = curRevenue > 0 ? Math.round((curCredit / curRevenue) * 100) : 0
      const cmpCreditPct = cmpRevenue > 0 ? Math.round((cmpCredit / cmpRevenue) * 100) : 0

      // ── Expense breakdown — ALL 6xxx dynamically ──
      const expenseDetails = Object.values(curAccounts)
        .filter(a => a.code.startsWith('6') && (a.debit - a.credit) > 0)
        .map(a => ({
          code: a.code, name: a.name,
          cur: Math.max(0, a.debit - a.credit),
          cmp: Math.max(0, (cmpAccounts[a.code]?.debit || 0) - (cmpAccounts[a.code]?.credit || 0)),
        }))
        .sort((a, b) => b.cur - a.cur)

      // Variable expenses (move with sales): fuel, refreshments, repairs, supplies
      const VARIABLE_CODES = ['6017', '6018', '6019', '6008', '6003', '6009']
      const curVarExp  = expenseDetails.filter(e => VARIABLE_CODES.includes(e.code)).reduce((s, e) => s + e.cur, 0)
      const cmpVarExp  = expenseDetails.filter(e => VARIABLE_CODES.includes(e.code)).reduce((s, e) => s + e.cmp, 0)
      const curFixExp  = expenseDetails.filter(e => !VARIABLE_CODES.includes(e.code)).reduce((s, e) => s + e.cur, 0)

      // ── AR & collections ──
      const totalAR    = overdueCustomers?.reduce((s, c) => s + Number(c.balance), 0) || 0
      const over60     = overdueCustomers?.filter(c => {
        // simple check: balance > 0 and no recent payment
        return Number(c.balance) > 0
      }) || []

      // ── Pending digital payments ──
      const pendingAmt = pendingDigital?.reduce((s, d) => s + Number(d.total_with_tax || d.total_amount), 0) || 0

      // ── Profit margin ──
      const curMargin  = curRevenue > 0 ? (curProfit / curRevenue) * 100 : 0
      const cmpMargin  = cmpRevenue > 0 ? (cmpProfit / cmpRevenue) * 100 : 0
      const expRatio   = curRevenue > 0 ? ((curExpenses + curCOGS) / curRevenue) * 100 : 0
      const cmpExpRatio = cmpRevenue > 0 ? ((cmpExpenses + cmpCOGS) / cmpRevenue) * 100 : 0

      // ── Revenue change ──
      const revChange  = cmpRevenue > 0 ? ((curRevenue - cmpRevenue) / cmpRevenue) * 100 : 0
      const profChange = cmpProfit  > 0 ? ((curProfit  - cmpProfit)  / cmpProfit)  * 100 : 0
      const expChange  = cmpExpenses > 0 ? ((curExpenses - cmpExpenses) / cmpExpenses) * 100 : 0
      const delChange  = cmpTotal > 0 ? ((curTotal - cmpTotal) / cmpTotal) * 100 : 0

      // ── Sales vs Variable Expense correlation ──
      const salesVsExpAlarm = revChange < -5 && curVarExp > cmpVarExp  // sales down but variable expenses up
      const salesVsExpGood  = revChange > 0  && curVarExp <= cmpVarExp * 1.1 // sales up, expenses controlled

      // ── Health Score (0-100) ──
      let score = 60 // base
      if (curMargin >= 35)  score += 15; else if (curMargin >= 20) score += 7; else score -= 10
      if (revChange >= 5)   score += 10; else if (revChange >= 0)  score += 5; else score -= 10
      if (creditPct <= 30)  score += 10; else if (creditPct <= 50) score += 3; else score -= 10
      if (expRatio <= 65)   score += 10; else if (expRatio <= 75)  score += 3; else score -= 10
      if (pendingAmt === 0) score += 5
      if (salesVsExpAlarm)  score -= 10
      score = Math.max(0, Math.min(100, score))

      const healthColor = score >= 80 ? '#1a7a4a' : score >= 60 ? '#b45309' : score >= 40 ? '#c2410c' : '#c62828'
      const healthBg    = score >= 80 ? '#e8f5e9' : score >= 60 ? '#fff8e1' : score >= 40 ? '#fff3e0' : '#ffebee'
      const healthLabel = score >= 80 ? { en: 'Excellent', ur: 'بہترین' } : score >= 60 ? { en: 'Good', ur: 'اچھا' } : score >= 40 ? { en: 'Needs Attention', ur: 'توجہ درکار' } : { en: 'Critical', ur: 'تشویشناک' }
      const healthEmoji = score >= 80 ? '🟢' : score >= 60 ? '🟡' : score >= 40 ? '🟠' : '🔴'

      setData({
        curRevenue, cmpRevenue, revChange,
        curCOGS, cmpCOGS,
        curExpenses, cmpExpenses, expChange,
        curProfit, cmpProfit, profChange,
        curMargin, cmpMargin,
        expRatio, cmpExpRatio,
        cur19l, cmp19l, curHalf, cmpHalf, curTotal, cmpTotal, delChange,
        curCash, curCredit, creditPct, cmpCreditPct,
        expenseDetails, curVarExp, cmpVarExp, curFixExp,
        salesVsExpAlarm, salesVsExpGood,
        totalAR, over60, pendingAmt, pendingDigital,
        score, healthColor, healthBg, healthLabel, healthEmoji,
        curAccounts, cmpAccounts,
      })
    } catch (err) {
      console.error('ExecutiveSummary error:', err)
    }
    setLoading(false)
  }

  const fmt = n => Math.abs(Number(n || 0)).toLocaleString('en-PK', { maximumFractionDigits: 0 })
  const pct = n => (n >= 0 ? '+' : '') + Number(n).toFixed(1) + '%'
  const curLabel = new Date(currentM + '-01').toLocaleDateString('en-PK', { month: 'long', year: 'numeric' })
  const cmpLabel = new Date(compareM + '-01').toLocaleDateString('en-PK', { month: 'long', year: 'numeric' })

  // ── Bilingual text helper ──
  function T({ en, ur }) {
    if (lang === 'en') return <>{en}</>
    if (lang === 'ur') return <span dir="rtl" style={{ fontFamily: 'serif' }}>{ur}</span>
    return (
      <div>
        <div dir="rtl" style={{ fontFamily: 'serif', fontSize: '0.95em', color: '#1a1a2e', lineHeight: 1.8, marginBottom: 6 }}>{ur}</div>
        <div style={{ color: '#444', lineHeight: 1.7 }}>{en}</div>
      </div>
    )
  }

  // ── Insight Card component ──
  function InsightCard({ severity, titleEn, titleUr, textEn, textUr, actionEn, actionUr, value, sub }) {
    const cfg = {
      good:    { color: '#1a7a4a', bg: '#e8f5e9', border: '#86efac', icon: '✅' },
      warn:    { color: '#b45309', bg: '#fff8e1', border: '#fde68a', icon: '⚠️' },
      bad:     { color: '#c62828', bg: '#ffebee', border: '#fca5a5', icon: '🔴' },
      info:    { color: '#0f4c81', bg: '#e3f0ff', border: '#93c5fd', icon: 'ℹ️' },
    }[severity] || { color: '#555', bg: '#f8f9fa', border: '#e0e0e0', icon: '📊' }

    return (
      <div style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}`, borderRadius: 12, padding: '16px 18px', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>{cfg.icon}</span>
            <div>
              {lang !== 'ur' && <p style={{ fontSize: 14, fontWeight: 800, color: cfg.color, margin: 0 }}>{titleEn}</p>}
              {lang !== 'en' && <p dir="rtl" style={{ fontSize: 14, fontWeight: 800, color: cfg.color, margin: 0, fontFamily: 'serif' }}>{titleUr}</p>}
            </div>
          </div>
          {value && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 18, fontWeight: 900, color: cfg.color, margin: 0 }}>{value}</p>
              {sub && <p style={{ fontSize: 11, color: cfg.color, margin: '2px 0 0', opacity: 0.8 }}>{sub}</p>}
            </div>
          )}
        </div>
        <div style={{ fontSize: 13, color: '#333' }}>
          <T en={textEn} ur={textUr} />
        </div>
        {(actionEn || actionUr) && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(0,0,0,0.05)', borderRadius: 8 }}>
            <T
              en={<><strong>💡 Recommended Action:</strong> {actionEn}</>}
              ur={<><strong>💡 تجویز کردہ اقدام:</strong> {actionUr}</>}
            />
          </div>
        )}
      </div>
    )
  }

  if (loading) return (
    <div style={{ padding: 80, textAlign: 'center' }}>
      <p style={{ fontSize: 40, margin: '0 0 16px' }}>📋</p>
      <p style={{ color: '#888', fontSize: 15 }}>Analysing your business...</p>
      <p style={{ color: '#aaa', fontSize: 12, marginTop: 4 }}>برائے کرم انتظار کریں</p>
    </div>
  )

  if (!data) return null

  const d = data

  return (
    <div style={{ fontFamily: 'system-ui,-apple-system,sans-serif', maxWidth: 900, margin: '0 auto' }}>

      {/* Controls */}
      <div style={{ background: 'white', borderRadius: 12, padding: '14px 18px', marginBottom: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#555' }}>📅 Compare:</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="month" value={currentM} onChange={e => setCurrentM(e.target.value)}
            style={{ padding: '7px 10px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 13, outline: 'none' }} />
          <span style={{ color: '#888', fontSize: 13 }}>vs</span>
          <input type="month" value={compareM} onChange={e => setCompareM(e.target.value)}
            style={{ padding: '7px 10px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 13, outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {[{ k: 'both', l: 'اردو / English' }, { k: 'ur', l: 'اردو' }, { k: 'en', l: 'English' }].map(l => (
            <button key={l.k} onClick={() => setLang(l.k)}
              style={{ padding: '6px 12px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: lang === l.k ? '#0f4c81' : '#f0f4f8',
                color: lang === l.k ? '#fff' : '#555' }}>
              {l.l}
            </button>
          ))}
        </div>
      </div>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', borderRadius: 14, padding: '22px 26px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <p style={{ color: '#93c5fd', fontSize: 12, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 1 }}>Executive Summary</p>
            <p style={{ color: '#fff', fontWeight: 900, fontSize: 20, margin: '0 0 4px' }}>{bizName}</p>
            <p style={{ color: '#93c5fd', fontSize: 13, margin: 0 }}>{curLabel} — compared with {cmpLabel}</p>
            <p dir="rtl" style={{ color: '#93c5fd', fontSize: 12, margin: '3px 0 0', fontFamily: 'serif' }}>{curLabel} — {cmpLabel} سے موازنہ</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ background: d.healthBg, border: `2px solid ${d.healthColor}`, borderRadius: 12, padding: '12px 20px', display: 'inline-block' }}>
              <p style={{ color: d.healthColor, fontSize: 11, margin: '0 0 3px', fontWeight: 700, textTransform: 'uppercase' }}>Business Health</p>
              <p style={{ color: d.healthColor, fontSize: 28, fontWeight: 900, margin: '0 0 3px' }}>{d.score}/100 {d.healthEmoji}</p>
              <p style={{ color: d.healthColor, fontSize: 13, margin: 0, fontWeight: 700 }}>{d.healthLabel.en}</p>
              <p dir="rtl" style={{ color: d.healthColor, fontSize: 13, margin: '2px 0 0', fontWeight: 700, fontFamily: 'serif' }}>{d.healthLabel.ur}</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Summary Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { labelEn: 'Revenue', labelUr: 'آمدنی', value: `Rs. ${fmt(d.curRevenue)}`, change: d.revChange, good: d.revChange >= 0 },
          { labelEn: 'Net Profit', labelUr: 'خالص منافع', value: `Rs. ${fmt(d.curProfit)}`, change: d.profChange, good: d.profChange >= 0 },
          { labelEn: 'Profit Margin', labelUr: 'منافع کا تناسب', value: d.curMargin.toFixed(1) + '%', change: d.curMargin - d.cmpMargin, good: d.curMargin >= 25 },
          { labelEn: 'Deliveries', labelUr: 'ڈیلیوریاں', value: d.curTotal.toLocaleString(), change: d.delChange, good: d.delChange >= 0 },
          { labelEn: 'Credit Sales %', labelUr: 'ادھار فروخت', value: d.creditPct + '%', change: d.creditPct - d.cmpCreditPct, good: d.creditPct <= 30 },
          { labelEn: 'Total Expenses', labelUr: 'کل اخراجات', value: `Rs. ${fmt(d.curExpenses)}`, change: d.expChange, good: d.expChange <= 0 },
        ].map(k => (
          <div key={k.labelEn} style={{ background: 'white', borderRadius: 10, padding: '12px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${k.good ? '#1a7a4a' : '#c62828'}` }}>
            <p style={{ fontSize: 10, color: '#888', margin: '0 0 1px', textTransform: 'uppercase', letterSpacing: 0.4 }}>{k.labelEn}</p>
            {lang !== 'en' && <p dir="rtl" style={{ fontSize: 10, color: '#888', margin: '0 0 4px', fontFamily: 'serif' }}>{k.labelUr}</p>}
            <p style={{ fontSize: 17, fontWeight: 800, color: '#1a1a2e', margin: '0 0 3px' }}>{k.value}</p>
            <p style={{ fontSize: 11, fontWeight: 700, color: k.good ? '#1a7a4a' : '#c62828', margin: 0 }}>
              {k.change >= 0 ? '↑' : '↓'} {Math.abs(k.change).toFixed(1)}{typeof k.change === 'number' && Math.abs(k.change) < 100 ? '%' : ''} vs {cmpLabel}
            </p>
          </div>
        ))}
      </div>

      {/* ── REVENUE SECTION ── */}
      <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 16px', marginBottom: 10, borderLeft: '4px solid #0f4c81' }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: '#0f4c81', margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>📈 Revenue & Sales Analysis — آمدنی اور فروخت کا تجزیہ</p>
      </div>

      <InsightCard
        severity={d.revChange >= 5 ? 'good' : d.revChange >= 0 ? 'info' : d.revChange >= -10 ? 'warn' : 'bad'}
        titleEn="Revenue Performance"
        titleUr="آمدنی کی کارکردگی"
        value={`Rs. ${fmt(d.curRevenue)}`}
        sub={`${d.revChange >= 0 ? '↑' : '↓'} ${Math.abs(d.revChange).toFixed(1)}% vs last month`}
        textEn={
          d.revChange >= 5
            ? `Your total revenue for ${curLabel} is Rs. ${fmt(d.curRevenue)}, which is Rs. ${fmt(Math.abs(d.curRevenue - d.cmpRevenue))} (${Math.abs(d.revChange).toFixed(1)}%) higher than ${cmpLabel}'s Rs. ${fmt(d.cmpRevenue)}. This is excellent growth. The increase is driven by ${d.cur19l > d.cmp19l ? `19L bottle deliveries which grew from ${d.cmp19l} to ${d.cur19l} units` : `half litre sales`}. If this trend continues you are on track for Rs. ${fmt(d.curRevenue * 1.12)} next month.`
            : d.revChange >= 0
            ? `Your revenue for ${curLabel} is Rs. ${fmt(d.curRevenue)}, slightly higher than ${cmpLabel}'s Rs. ${fmt(d.cmpRevenue)} by ${Math.abs(d.revChange).toFixed(1)}%. Revenue is stable. Focus on growing new customers and increasing order frequency to accelerate growth.`
            : d.revChange >= -10
            ? `Your revenue for ${curLabel} is Rs. ${fmt(d.curRevenue)}, which is Rs. ${fmt(Math.abs(d.curRevenue - d.cmpRevenue))} (${Math.abs(d.revChange).toFixed(1)}%) lower than ${cmpLabel}'s Rs. ${fmt(d.cmpRevenue)}. This is a moderate decline that needs attention. Total deliveries changed from ${d.cmpTotal} to ${d.curTotal} units. Identify which customers reduced or stopped orders and follow up with them immediately.`
            : `ALERT: Your revenue for ${curLabel} is Rs. ${fmt(d.curRevenue)}, which is Rs. ${fmt(Math.abs(d.curRevenue - d.cmpRevenue))} (${Math.abs(d.revChange).toFixed(1)}%) lower than ${cmpLabel}'s Rs. ${fmt(d.cmpRevenue)}. This is a significant drop that requires immediate action. Deliveries fell from ${d.cmpTotal} to ${d.curTotal} units. This level of decline if not reversed will seriously impact profitability.`
        }
        textUr={
          d.revChange >= 5
            ? `${curLabel} میں آپ کی کل آمدنی Rs. ${fmt(d.curRevenue)} ہے جو کہ ${cmpLabel} کی Rs. ${fmt(d.cmpRevenue)} سے Rs. ${fmt(Math.abs(d.curRevenue - d.cmpRevenue))} یعنی ${Math.abs(d.revChange).toFixed(1)}% زیادہ ہے۔ یہ بہترین ترقی ہے۔ اس رفتار سے اگلے مہینے Rs. ${fmt(d.curRevenue * 1.12)} تک پہنچ سکتے ہیں۔`
            : d.revChange >= 0
            ? `${curLabel} میں آمدنی Rs. ${fmt(d.curRevenue)} ہے جو ${cmpLabel} سے تھوڑی زیادہ ہے۔ آمدنی مستحکم ہے۔ نئے گاہک بڑھانے پر توجہ دیں۔`
            : d.revChange >= -10
            ? `${curLabel} میں آمدنی Rs. ${fmt(d.curRevenue)} ہے جو ${cmpLabel} کی Rs. ${fmt(d.cmpRevenue)} سے Rs. ${fmt(Math.abs(d.curRevenue - d.cmpRevenue))} یعنی ${Math.abs(d.revChange).toFixed(1)}% کم ہے۔ یہ معمولی کمی ہے لیکن توجہ درکار ہے۔ جن گاہکوں نے آرڈر کم کیے ان سے فوری رابطہ کریں۔`
            : `خبردار: ${curLabel} میں آمدنی ${Math.abs(d.revChange).toFixed(1)}% کم ہوئی ہے۔ ڈیلیوریاں ${d.cmpTotal} سے کم ہو کر ${d.curTotal} رہ گئی ہیں۔ فوری اقدام ضروری ہے۔`
        }
        actionEn={d.revChange < 0 ? `Contact customers who had no deliveries this month. Check if any customers switched to a competitor. Offer promotions to increase order frequency.` : `Maintain current service quality and on-time delivery to sustain growth.`}
        actionUr={d.revChange < 0 ? `جن گاہکوں کی اس مہینے ڈیلیوری نہیں ہوئی ان سے رابطہ کریں۔ آرڈر کی تعداد بڑھانے کے لیے خصوصی پیشکش کریں۔` : `موجودہ سروس کا معیار برقرار رکھیں اور وقت پر ڈیلیوری جاری رکھیں۔`}
      />

      <InsightCard
        severity={d.cur19l >= d.cmp19l ? 'good' : 'warn'}
        titleEn="Delivery Volume Analysis"
        titleUr="ڈیلیوری حجم کا تجزیہ"
        value={`${d.curTotal.toLocaleString()} units`}
        sub={`${d.delChange >= 0 ? '↑' : '↓'} ${Math.abs(d.delChange).toFixed(1)}%`}
        textEn={`In ${curLabel} you delivered ${d.cur19l.toLocaleString()} units of 19L bottles and ${d.curHalf.toLocaleString()} units of half litre, totalling ${d.curTotal.toLocaleString()} units. Compared to ${cmpLabel} (${d.cmp19l.toLocaleString()} × 19L and ${d.cmpHalf.toLocaleString()} × half litre = ${d.cmpTotal.toLocaleString()} total), ${d.curTotal >= d.cmpTotal ? `deliveries increased by ${d.curTotal - d.cmpTotal} units which is positive.` : `deliveries decreased by ${d.cmpTotal - d.curTotal} units. Each 19L bottle delivers approximately Rs. ${d.cur19l > 0 ? Math.round((d.curRevenue * 0.75) / d.cur19l) : 0} revenue, so this drop represents approximately Rs. ${fmt((d.cmpTotal - d.curTotal) * (d.cur19l > 0 ? Math.round((d.curRevenue * 0.75) / d.cur19l) : 100))} in lost revenue.`}`}
        textUr={`${curLabel} میں آپ نے ${d.cur19l.toLocaleString()} 19 لیٹر بوتلیں اور ${d.curHalf.toLocaleString()} آدھا لیٹر ڈیلیور کیں یعنی کل ${d.curTotal.toLocaleString()} یونٹ۔ ${cmpLabel} میں یہ ${d.cmpTotal.toLocaleString()} یونٹ تھیں۔ ${d.curTotal >= d.cmpTotal ? `ڈیلیوریاں ${d.curTotal - d.cmpTotal} یونٹ بڑھی ہیں جو ایک مثبت علامت ہے۔` : `ڈیلیوریاں ${d.cmpTotal - d.curTotal} یونٹ کم ہوئی ہیں۔`}`}
      />

      {/* ── PROFITABILITY ── */}
      <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 16px', marginBottom: 10, marginTop: 20, borderLeft: '4px solid #1a7a4a' }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: '#1a7a4a', margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>💰 Profitability Analysis — منافع کا تجزیہ</p>
      </div>

      <InsightCard
        severity={d.curMargin >= 35 ? 'good' : d.curMargin >= 20 ? 'info' : 'bad'}
        titleEn="Profit Margin"
        titleUr="منافع کا تناسب"
        value={d.curMargin.toFixed(1) + '%'}
        sub={`Target: 30%+ | Last month: ${d.cmpMargin.toFixed(1)}%`}
        textEn={`Your net profit for ${curLabel} is Rs. ${fmt(d.curProfit)}, which represents a ${d.curMargin.toFixed(1)}% profit margin. ${d.curMargin >= 35 ? `This is excellent — above the 30% target for water delivery businesses. For every Rs. 100 of revenue, you are keeping Rs. ${d.curMargin.toFixed(0)} as profit.` : d.curMargin >= 20 ? `This is acceptable but below the 30% target. For every Rs. 100 of revenue, you are keeping Rs. ${d.curMargin.toFixed(0)} as profit. To improve this, focus on reducing variable expenses or increasing prices slightly.` : `This is below acceptable levels. Your total expenses of Rs. ${fmt(d.curExpenses + d.curCOGS)} are consuming ${d.expRatio.toFixed(1)}% of your revenue, leaving only ${d.curMargin.toFixed(1)}% as profit. Immediate expense review is required.`} ${d.curMargin > d.cmpMargin ? `Margin improved from ${d.cmpMargin.toFixed(1)}% last month — well done.` : `Margin declined from ${d.cmpMargin.toFixed(1)}% last month — investigate the cause.`}`}
        textUr={`${curLabel} میں آپ کا خالص منافع Rs. ${fmt(d.curProfit)} ہے جو آمدنی کا ${d.curMargin.toFixed(1)}% ہے۔ ${d.curMargin >= 35 ? `یہ بہترین ہے — ہر Rs. 100 کی آمدنی میں Rs. ${d.curMargin.toFixed(0)} منافع ہے۔` : d.curMargin >= 20 ? `یہ قابل قبول ہے لیکن 30% ہدف سے کم ہے۔ اخراجات کم کریں یا قیمتیں بڑھائیں۔` : `یہ خطرناک سطح ہے۔ اخراجات Rs. ${fmt(d.curExpenses + d.curCOGS)} ہیں جو آمدنی کا ${d.expRatio.toFixed(1)}% ہیں۔ فوری اخراجات کا جائزہ لیں۔`}`}
        actionEn={d.curMargin < 30 ? `Review all expense categories. Focus on reducing rider expenses (fuel, repairs) by optimizing routes. Consider a Rs. 5-10 price increase on 19L bottles if competitors allow.` : undefined}
        actionUr={d.curMargin < 30 ? `تمام اخراجات کا جائزہ لیں۔ روٹ کی منصوبہ بندی بہتر کریں تاکہ ایندھن کا خرچ کم ہو۔` : undefined}
      />

      {/* ── SALES vs EXPENSE CORRELATION ── */}
      <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 16px', marginBottom: 10, marginTop: 20, borderLeft: '4px solid #c62828' }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: '#c62828', margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>📊 Sales vs Expenses Correlation — فروخت اور اخراجات کا تناسب</p>
      </div>

      {d.salesVsExpAlarm && (
        <InsightCard
          severity="bad"
          titleEn="⚠️ Sales Down But Variable Expenses Still High"
          titleUr="فروخت کم لیکن متغیر اخراجات بلند"
          value={`Rs. ${fmt(d.curVarExp)}`}
          sub={`Was Rs. ${fmt(d.cmpVarExp)} last month`}
          textEn={`This is a serious concern. Your sales decreased by ${Math.abs(d.revChange).toFixed(1)}% from Rs. ${fmt(d.cmpRevenue)} to Rs. ${fmt(d.curRevenue)}, which means fewer deliveries were made. However, your variable expenses (fuel, repairs, supplies, refreshments) actually INCREASED from Rs. ${fmt(d.cmpVarExp)} to Rs. ${fmt(d.curVarExp)} — a ${((d.curVarExp - d.cmpVarExp) / d.cmpVarExp * 100).toFixed(1)}% increase. This is the opposite of what should happen. When deliveries decrease, fuel and related costs should decrease proportionally. This mismatch is eating directly into your profits and means your expense-to-revenue ratio worsened from ${d.cmpExpRatio.toFixed(1)}% to ${d.expRatio.toFixed(1)}%.`}
          textUr={`یہ ایک سنگین مسئلہ ہے۔ آپ کی فروخت ${Math.abs(d.revChange).toFixed(1)}% کم ہوئی یعنی ڈیلیوریاں کم ہوئیں۔ لیکن متغیر اخراجات (ایندھن، مرمت، سپلائی، ناشتہ) Rs. ${fmt(d.cmpVarExp)} سے بڑھ کر Rs. ${fmt(d.curVarExp)} ہو گئے — یعنی ${((d.curVarExp - d.cmpVarExp) / d.cmpVarExp * 100).toFixed(1)}% اضافہ۔ جب ڈیلیوریاں کم ہوں تو ان اخراجات کو بھی کم ہونا چاہیے تھا۔ یہ عدم توازن آپ کا منافع کھا رہا ہے اور اخراجات کا تناسب ${d.cmpExpRatio.toFixed(1)}% سے بڑھ کر ${d.expRatio.toFixed(1)}% ہو گیا ہے۔`}
          actionEn={`Immediately review each rider's daily fuel consumption. Compare fuel expense per delivery this month vs last month. Check if any unusual repairs or purchases were made. Ask each rider to account for their expenses this month.`}
          actionUr={`فوری طور پر ہر رائیڈر کا روزانہ ایندھن خرچ دیکھیں۔ اس مہینے فی ڈیلیوری خرچ کا گزشتہ مہینے سے موازنہ کریں۔ غیر معمولی مرمت یا خریداری کی جانچ کریں۔`}
        />
      )}

      {d.salesVsExpGood && (
        <InsightCard
          severity="good"
          titleEn="Sales Up, Expenses Controlled"
          titleUr="فروخت زیادہ، اخراجات کنٹرول میں"
          textEn={`Excellent expense management. Your revenue increased ${d.revChange.toFixed(1)}% while variable expenses were kept under control at Rs. ${fmt(d.curVarExp)} vs Rs. ${fmt(d.cmpVarExp)} last month. This shows operational efficiency — your expense-to-revenue ratio improved from ${d.cmpExpRatio.toFixed(1)}% to ${d.expRatio.toFixed(1)}%.`}
          textUr={`بہترین اخراجات کا انتظام۔ آمدنی ${d.revChange.toFixed(1)}% بڑھی اور متغیر اخراجات کنٹرول میں رہے۔ اخراجات کا تناسب ${d.cmpExpRatio.toFixed(1)}% سے بہتر ہو کر ${d.expRatio.toFixed(1)}% ہوا۔`}
        />
      )}

      {/* Individual expense breakdown */}
      {d.expenseDetails.length > 0 && (
        <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.07)', overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ padding: '12px 16px', background: '#f8fafc', borderBottom: '1px solid #f0f0f0' }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#333', margin: 0 }}>Expense Breakdown — {curLabel}</p>
            <p dir="rtl" style={{ fontSize: 12, color: '#888', margin: '2px 0 0', fontFamily: 'serif' }}>اخراجات کی تفصیل</p>
          </div>
          {d.expenseDetails.map(e => {
            const chg = e.cmp > 0 ? ((e.cur - e.cmp) / e.cmp * 100) : 0
            const isVariable = ['6017','6018','6019','6008','6003','6009'].includes(e.code)
            const alarm = isVariable && d.revChange < -3 && chg > 5
            return (
              <div key={e.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #f5f5f5', background: alarm ? '#fff8f8' : 'white' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#333', margin: '0 0 2px' }}>
                    {alarm ? '⚠️ ' : ''}{e.name}
                    <span style={{ marginLeft: 8, fontSize: 10, padding: '1px 7px', borderRadius: 10, background: isVariable ? '#e3f0ff' : '#f0f4f8', color: isVariable ? '#0f4c81' : '#888', fontWeight: 600 }}>
                      {isVariable ? 'Variable' : 'Fixed'}
                    </span>
                  </p>
                  <p style={{ fontSize: 11, color: '#888', margin: 0 }}>
                    Last month: Rs. {fmt(e.cmp)} → This month: Rs. {fmt(e.cur)}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 15, fontWeight: 800, color: chg > 10 ? '#c62828' : chg < -5 ? '#1a7a4a' : '#333', margin: '0 0 2px' }}>Rs. {fmt(e.cur)}</p>
                  {e.cmp > 0 && (
                    <p style={{ fontSize: 11, fontWeight: 700, color: chg > 0 ? '#c62828' : '#1a7a4a', margin: 0 }}>
                      {chg >= 0 ? '↑' : '↓'} {Math.abs(chg).toFixed(1)}%
                    </p>
                  )}
                </div>
              </div>
            )
          })}
          <div style={{ padding: '10px 16px', background: '#f8fafc', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#333' }}>Total Expenses / کل اخراجات</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#c62828' }}>Rs. {fmt(d.curExpenses)}</span>
          </div>
        </div>
      )}

      {/* ── CREDIT & COLLECTIONS ── */}
      <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 16px', marginBottom: 10, marginTop: 20, borderLeft: '4px solid #b45309' }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: '#b45309', margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>💳 Credit Sales & Collections — ادھار فروخت اور وصولی</p>
      </div>

      <InsightCard
        severity={d.creditPct <= 25 ? 'good' : d.creditPct <= 40 ? 'warn' : 'bad'}
        titleEn="Credit Sales Analysis"
        titleUr="ادھار فروخت کا تجزیہ"
        value={d.creditPct + '%'}
        sub={`Credit / Total Sales`}
        textEn={`In ${curLabel}, Rs. ${fmt(d.curCredit)} (${d.creditPct}%) of your sales were on credit, meaning customers did not pay at the time of delivery. ${d.creditPct <= 25 ? `This is an excellent ratio — most of your sales are cash which means strong daily cash flow. The ideal target is below 30%.` : d.creditPct <= 40 ? `This is an acceptable ratio but moving towards the higher end. Last month was ${d.cmpCreditPct}%. Monitor this closely. High credit sales mean your cash is tied up in customer balances and you may face cash shortages despite good revenue.` : `This is too high. Nearly half your sales are on credit which means a large portion of your revenue is not in your hands. You currently have Rs. ${fmt(d.totalAR)} outstanding from customers. High credit sales combined with slow collection can lead to cash flow problems even when revenue looks healthy on paper.`}`}
        textUr={`${curLabel} میں Rs. ${fmt(d.curCredit)} یعنی ${d.creditPct}% فروخت ادھار تھی۔ ${d.creditPct <= 25 ? `یہ بہترین تناسب ہے۔ زیادہ تر فروخت نقد ہے جس سے روزانہ نقد بہاؤ مضبوط ہے۔` : d.creditPct <= 40 ? `یہ قابل قبول ہے لیکن بڑھ رہا ہے۔ گزشتہ مہینے ${d.cmpCreditPct}% تھا۔ زیادہ ادھار سے نقدی میں مشکل آ سکتی ہے۔` : `یہ بہت زیادہ ہے۔ آپ کی تقریباً نصف فروخت ادھار ہے اور Rs. ${fmt(d.totalAR)} گاہکوں کے ذمے واجب ہے۔ اس سے نقدی کا بحران آ سکتا ہے۔`}`}
        actionEn={d.creditPct > 30 ? `Reduce credit limits for customers who consistently delay payments. Require partial advance payment from new credit customers. Target: bring credit sales below 30% next month.` : undefined}
        actionUr={d.creditPct > 30 ? `جو گاہک ہمیشہ دیر سے ادا کرتے ہیں ان کی ادھار حد کم کریں۔ نئے گاہکوں سے پیشگی ادائیگی لیں۔ ہدف: اگلے مہینے ادھار 30% سے کم لائیں۔` : undefined}
      />

      {d.totalAR > 0 && (
        <InsightCard
          severity={d.totalAR > d.curRevenue * 0.5 ? 'bad' : d.totalAR > d.curRevenue * 0.25 ? 'warn' : 'info'}
          titleEn="Outstanding Receivables"
          titleUr="واجب الوصول رقم"
          value={`Rs. ${fmt(d.totalAR)}`}
          sub={`${d.over60.length} customers with balance`}
          textEn={`You currently have Rs. ${fmt(d.totalAR)} outstanding from ${d.over60.length} customers. This represents ${(d.totalAR / d.curRevenue * 100).toFixed(1)}% of your monthly revenue sitting uncollected. ${d.totalAR > d.curRevenue * 0.5 ? `This is critically high — more than half a month's revenue is locked in customer balances. This is a major cash flow risk. Some of these customers may become bad debts if not followed up urgently.` : `Regular follow-up is needed to ensure timely collection.`} Review the Collections tab for detailed aging analysis of which customers owe the most and for how long.`}
          textUr={`فی الحال ${d.over60.length} گاہکوں سے Rs. ${fmt(d.totalAR)} واجب ہے جو آپ کی ماہانہ آمدنی کا ${(d.totalAR / d.curRevenue * 100).toFixed(1)}% ہے۔ ${d.totalAR > d.curRevenue * 0.5 ? `یہ انتہائی زیادہ ہے — آدھے مہینے کی آمدنی گاہکوں کے پاس پھنسی ہوئی ہے۔ فوری وصولی کریں۔` : `باقاعدہ فالو اپ ضروری ہے۔`}`}
          actionEn={`Use the Collections tab to identify customers overdue 60+ days and call them immediately. Consider stopping deliveries to customers with balances older than 90 days until they pay.`}
          actionUr={`کلیکشن رپورٹ میں 60 دن سے زیادہ کے بقایا گاہکوں کو دیکھیں اور فوری کال کریں۔ 90 دن سے زیادہ بقایا والے گاہکوں کی ڈیلیوری روکنے پر غور کریں۔`}
        />
      )}

      {d.pendingAmt > 0 && (
        <InsightCard
          severity="warn"
          titleEn="Unconfirmed Digital Payments"
          titleUr="غیر تصدیق شدہ ڈیجیٹل ادائیگیاں"
          value={`Rs. ${fmt(d.pendingAmt)}`}
          sub={`${d.pendingDigital?.length} transactions pending`}
          textEn={`There are ${d.pendingDigital?.length} digital payments (JazzCash/EasyPaisa/Bank) totalling Rs. ${fmt(d.pendingAmt)} that have not been confirmed yet. These are recorded as sales but the money has not been verified in your accounts. Until confirmed, these amounts are sitting in clearing accounts and do not reflect in your actual cash or JazzCash balance. Go to Digital Payments tab immediately to confirm these.`}
          textUr={`${d.pendingDigital?.length} ڈیجیٹل ادائیگیاں کل Rs. ${fmt(d.pendingAmt)} کی تصدیق ابھی نہیں ہوئی۔ یہ رقم کلیئرنگ اکاؤنٹ میں ہے اور آپ کی اصل بیلنس میں شامل نہیں۔ ڈیجیٹل پیمنٹس ٹیب میں جا کر فوری تصدیق کریں۔`}
          actionEn={`Go to Digital Payments tab and confirm all pending transactions today.`}
          actionUr={`ڈیجیٹل پیمنٹس ٹیب میں جائیں اور آج تمام زیر التوا ادائیگیاں تصدیق کریں۔`}
        />
      )}

      {/* ── SUMMARY & RECOMMENDATIONS ── */}
      <div style={{ background: 'linear-gradient(135deg,#1a1a2e,#0f3460)', borderRadius: 14, padding: '22px 24px', marginTop: 20 }}>
        <p style={{ color: '#fff', fontWeight: 800, fontSize: 16, margin: '0 0 6px' }}>
          📋 Executive Summary — {curLabel}
        </p>
        <p dir="rtl" style={{ color: '#93c5fd', fontSize: 13, margin: '0 0 18px', fontFamily: 'serif' }}>
          {bizName} — {curLabel} — خلاصہ
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          {/* Positives */}
          <div style={{ background: 'rgba(26,122,74,0.2)', borderRadius: 10, padding: '14px 16px' }}>
            <p style={{ color: '#6ee7b7', fontWeight: 700, fontSize: 13, margin: '0 0 10px' }}>✅ What's Good / کیا اچھا ہے</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                d.revChange >= 0   && { en: `Revenue up ${d.revChange.toFixed(1)}% vs last month`, ur: `آمدنی ${d.revChange.toFixed(1)}% بڑھی` },
                d.curMargin >= 30  && { en: `Profit margin healthy at ${d.curMargin.toFixed(1)}%`, ur: `منافع کا تناسب ${d.curMargin.toFixed(1)}% صحت مند` },
                d.creditPct <= 30  && { en: `Credit sales under control at ${d.creditPct}%`, ur: `ادھار فروخت ${d.creditPct}% قابو میں` },
                d.expChange <= 0   && { en: `Total expenses reduced vs last month`, ur: `اخراجات گزشتہ مہینے سے کم` },
                d.salesVsExpGood   && { en: `Variable expenses controlled despite sales growth`, ur: `فروخت بڑھنے کے باوجود اخراجات قابو میں` },
                d.pendingAmt === 0 && { en: `All digital payments confirmed — no pending`, ur: `تمام ڈیجیٹل ادائیگیاں تصدیق شدہ` },
                d.cur19l > d.cmp19l && { en: `19L bottle deliveries increased by ${d.cur19l - d.cmp19l} units`, ur: `19 لیٹر ڈیلیوریاں ${d.cur19l - d.cmp19l} یونٹ بڑھیں` },
              ].filter(Boolean).map((item, i) => (
                <div key={i} style={{ fontSize: 12, color: '#d1fae5' }}>
                  {lang !== 'ur' && <p style={{ margin: '0 0 1px' }}>• {item.en}</p>}
                  {lang !== 'en' && <p dir="rtl" style={{ margin: 0, fontFamily: 'serif' }}>• {item.ur}</p>}
                </div>
              ))}
              {[d.revChange >= 0, d.curMargin >= 30, d.creditPct <= 30, d.expChange <= 0].filter(Boolean).length === 0 && (
                <p style={{ color: '#6ee7b7', fontSize: 12, margin: 0, opacity: 0.7 }}>No positives this month — focus on improvement</p>
              )}
            </div>
          </div>

          {/* Negatives */}
          <div style={{ background: 'rgba(198,40,40,0.2)', borderRadius: 10, padding: '14px 16px' }}>
            <p style={{ color: '#fca5a5', fontWeight: 700, fontSize: 13, margin: '0 0 10px' }}>🔴 Needs Attention / کیا بہتر کرنا ہے</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                d.revChange < 0        && { en: `Revenue dropped ${Math.abs(d.revChange).toFixed(1)}% — investigate cause`, ur: `آمدنی ${Math.abs(d.revChange).toFixed(1)}% کم — وجہ جانیں` },
                d.curMargin < 25       && { en: `Profit margin ${d.curMargin.toFixed(1)}% is critically low`, ur: `منافع ${d.curMargin.toFixed(1)}% خطرناک حد سے کم` },
                d.creditPct > 40       && { en: `Credit sales ${d.creditPct}% too high — cash flow risk`, ur: `ادھار فروخت ${d.creditPct}% بہت زیادہ — نقدی خطرے میں` },
                d.salesVsExpAlarm      && { en: `Sales down but variable expenses UP — urgent review needed`, ur: `فروخت کم لیکن متغیر اخراجات بڑھے — فوری جائزہ لیں` },
                d.pendingAmt > 0       && { en: `Rs. ${fmt(d.pendingAmt)} digital payments unconfirmed`, ur: `Rs. ${fmt(d.pendingAmt)} ڈیجیٹل ادائیگیاں تصدیق نہیں` },
                d.totalAR > d.curRevenue * 0.3 && { en: `Rs. ${fmt(d.totalAR)} outstanding from customers`, ur: `گاہکوں سے Rs. ${fmt(d.totalAR)} واجب الوصول` },
                d.expChange > 10       && { en: `Expenses increased ${d.expChange.toFixed(1)}% — review all categories`, ur: `اخراجات ${d.expChange.toFixed(1)}% بڑھے — تمام کا جائزہ لیں` },
              ].filter(Boolean).map((item, i) => (
                <div key={i} style={{ fontSize: 12, color: '#fecaca' }}>
                  {lang !== 'ur' && <p style={{ margin: '0 0 1px' }}>• {item.en}</p>}
                  {lang !== 'en' && <p dir="rtl" style={{ margin: 0, fontFamily: 'serif' }}>• {item.ur}</p>}
                </div>
              ))}
              {[d.revChange < 0, d.curMargin < 25, d.creditPct > 40, d.salesVsExpAlarm, d.pendingAmt > 0].filter(Boolean).length === 0 && (
                <p style={{ color: '#fca5a5', fontSize: 12, margin: 0, opacity: 0.7 }}>No critical issues this month — great work!</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, margin: 0 }}>
            Generated by AquaRun • {bizName} • {new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, margin: 0 }}>
            Health Score: {d.score}/100 {d.healthEmoji} {d.healthLabel.en} / {d.healthLabel.ur}
          </p>
        </div>
      </div>

    </div>
  )
}


// ─── SALES SUMMARY ─────────────────────────────────────────────────
function SalesSummary({ tenantId }) {
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 7) + '-01')
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (tenantId) fetchSales() }, [tenantId])

  async function fetchSales() {
    setLoading(true)
    const { data: deliveries } = await supabase.from('deliveries').select('*, riders(full_name)').eq('tenant_id', tenantId).gte('delivered_at', dateFrom + 'T00:00:00').lte('delivered_at', dateTo + 'T23:59:59').eq('is_voided', false)
    let total19l = 0, totalHalf = 0, total15l = 0, totalCash = 0, totalJazz = 0, totalCredit = 0, totalSales = 0
    const riderSales = {}
    deliveries?.forEach(d => {
      total19l += Number(d.qty_19l || 0); totalHalf += Number(d.qty_half_litre || 0); total15l += Number(d.qty_1_5l || 0); totalSales += Number(d.total_amount)
      if (d.payment_method === 'cash') totalCash += Number(d.amount_received)
      if (d.payment_method === 'jazzcash') totalJazz += Number(d.total_amount)
      if (d.payment_method === 'credit') totalCredit += Number(d.total_amount)
      const name = d.riders?.full_name || 'Admin / Office Sales'
      if (!riderSales[name]) riderSales[name] = { sales: 0, bottles19l: 0, bottlesHalf: 0, bottles15l: 0 }
      riderSales[name].sales += Number(d.total_amount); riderSales[name].bottles19l += Number(d.qty_19l || 0); riderSales[name].bottlesHalf += Number(d.qty_half_litre || 0); riderSales[name].bottles15l += Number(d.qty_1_5l || 0)
    })
    setData({ total19l, totalHalf, total15l, totalCash, totalJazz, totalCredit, totalSales, riderSales, count: deliveries?.length || 0 })
    setLoading(false)
  }

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>📊 Sales Summary</h3>
      <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div><label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>From</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none' }} /></div>
        <div><label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>To</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none' }} /></div>
        <button onClick={fetchSales} style={{ padding: '8px 16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>🔍 Search</button>
      </div>
      {loading ? <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p> : data && (
        <div>
          <div style={{ background: 'linear-gradient(135deg, #0f4c81, #1a7a4a)', color: 'white', borderRadius: '12px', padding: '20px', marginBottom: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: '13px', opacity: 0.8, margin: '0 0 8px' }}>Total Sales Value</p>
            <p style={{ fontSize: '40px', fontWeight: '700', margin: '0 0 4px' }}>Rs. {data.totalSales.toLocaleString()}</p>
            <p style={{ fontSize: '12px', opacity: 0.7, margin: 0 }}>{data.count} deliveries in this period</p>
          </div>
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>🍶 Bottles Sold</p>
            {[{ label: '19 Litre', value: data.total19l, unit: 'bottles' }, { label: 'Half Litre', value: data.totalHalf, unit: 'bottles' }, { label: '1.5 Litre', value: data.total15l, unit: 'bottles' }, { label: 'Total', value: data.total19l + data.totalHalf + data.total15l, unit: 'bottles', bold: true }].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ fontSize: '13px', color: '#555', fontWeight: r.bold ? '700' : '400' }}>{r.label}</span>
                <span style={{ fontSize: '13px', fontWeight: '700', color: r.bold ? '#0f4c81' : '#333' }}>{r.value.toLocaleString()} {r.unit}</span>
              </div>
            ))}
          </div>
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>💳 Payment Breakdown</p>
            {[{ label: '💵 Cash', value: data.totalCash, color: '#1a7a4a' }, { label: '📱 JazzCash', value: data.totalJazz, color: '#9c27b0' }, { label: '📋 Credit', value: data.totalCredit, color: '#f44336' }, { label: 'Total', value: data.totalSales, color: '#0f4c81', bold: true }].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ fontSize: '13px', color: '#555', fontWeight: r.bold ? '700' : '400' }}>{r.label}</span>
                <span style={{ fontSize: '13px', fontWeight: '700', color: r.color }}>Rs. {r.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
          {Object.keys(data.riderSales).length > 0 && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>🚴 Per Rider Breakdown</p>
              {Object.entries(data.riderSales).map(([name, r]) => (
                <div key={name} style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#333' }}>🚴 {name}</span>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f4c81' }}>Rs. {r.sales.toLocaleString()}</span>
                  </div>
                  <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>19L: {r.bottles19l} · Half: {r.bottlesHalf} · 1.5L: {r.bottles15l}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── PROFIT & LOSS ─────────────────────────────────────────────────
function ProfitLoss({ tenantId }) {
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 7) + '-01')
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [drillDown, setDrillDown] = useState(null)
  const [drillLoading, setDrillLoading] = useState(false)

  useEffect(() => { if (tenantId) fetchPL() }, [tenantId])
  useEffect(() => {
    const style = document.getElementById('pl-print-style')
    if (!style) {
      const s = document.createElement('style')
      s.id = 'pl-print-style'
      s.textContent = `@media print { nav, aside, .no-print, button { display: none !important; } body { margin: 0; } }`
      document.head.appendChild(s)
    }
  }, [])

  async function fetchPL() {
    setLoading(true)
    try {
      // ── Single query: all journal lines for the period ──
      // This is the ONLY source of truth — every transaction posts here
      // Step 1: Get journal entry IDs for the period
      // Fetch all journal entries with pagination (Supabase default limit is 1000)
      let journalEntries = []
      let from = 0
      const pageSize = 1000
      while (true) {
        const { data: page } = await supabase
          .from('journal_entries')
          .select('id, entry_date, narration, reference_type')
          .eq('tenant_id', tenantId)
          .gte('entry_date', dateFrom)
          .lte('entry_date', dateTo)
          .range(from, from + pageSize - 1)
        if (!page || page.length === 0) break
        journalEntries = journalEntries.concat(page)
        if (page.length < pageSize) break
        from += pageSize
      }

      if (!journalEntries || journalEntries.length === 0) {
        setData({ revenueAccounts: {}, totalRevenue: 0, cogsAccounts: {}, totalCogs: 0, grossProfit: 0, expenseAccounts: {}, totalExpenses: 0, netProfit: 0, accounts: {} })
        setLoading(false)
        return
      }

      const jeIds = journalEntries.map(je => je.id)
      const jeMap = {}
      journalEntries.forEach(je => { jeMap[je.id] = je })

      // Step 2: Get all lines in batches of 100
      let lines = []
      const chunkSize = 100
      for (let i = 0; i < jeIds.length; i += chunkSize) {
        const chunk = jeIds.slice(i, i + chunkSize)
        const { data: batch } = await supabase
          .from('journal_entry_lines')
          .select('account_code, account_name, debit, credit, journal_entry_id')
          .eq('tenant_id', tenantId)
          .in('journal_entry_id', chunk)
        if (batch) lines = lines.concat(batch)
      }

      if (!lines) { setLoading(false); return }

      // ── Group by account code ──
      const accounts = {}
      lines.forEach(l => {
        const code = l.account_code
        const je = jeMap[l.journal_entry_id] || {}
        if (!accounts[code]) {
          accounts[code] = { code, name: l.account_name, debit: 0, credit: 0, lines: [] }
        }
        accounts[code].debit += Number(l.debit || 0)
        accounts[code].credit += Number(l.credit || 0)
        accounts[code].lines.push({
          date: je.entry_date,
          narration: je.narration,
          reference_type: je.reference_type,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0),
        })
      })

      // ── REVENUE (4xxx) — credit side ──
      const revenueAccounts = {}
      Object.values(accounts).filter(a => a.code.startsWith('4')).forEach(a => {
        revenueAccounts[a.name] = a.credit - a.debit // net credit = revenue
      })
      const totalRevenue = Object.values(revenueAccounts).reduce((s, v) => s + v, 0)

      // ── COGS (5xxx) — debit side ──
      const cogsAccounts = {}
      Object.values(accounts).filter(a => a.code.startsWith('5')).forEach(a => {
        const net = a.debit - a.credit
        if (net > 0) cogsAccounts[a.name] = net
      })
      const totalCogs = Object.values(cogsAccounts).reduce((s, v) => s + v, 0)
      const grossProfit = totalRevenue - totalCogs

      // ── EXPENSES (6xxx) — debit side ──
      const expenseAccounts = {}
      Object.values(accounts).filter(a => a.code.startsWith('6')).forEach(a => {
        const net = a.debit - a.credit
        if (net > 0) expenseAccounts[a.name] = { amount: net, code: a.code, lines: a.lines }
      })
      const totalExpenses = Object.values(expenseAccounts).reduce((s, v) => s + v.amount, 0)
      const netProfit = grossProfit - totalExpenses

      // ── Also get raw material purchases not yet journalized ──
      // (stock purchases that hit inventory account 1200/1201/1202 not 5xxx)
      // These show as inventory not expense unless consumed in production
      // So we skip them here — only 5xxx hits P&L ✅

      setData({
        revenueAccounts, totalRevenue,
        cogsAccounts, totalCogs,
        grossProfit,
        expenseAccounts, totalExpenses,
        netProfit,
        accounts // full account map for drill down
      })
    } catch (err) {
      console.error('P&L fetch error:', err)
    }
    setLoading(false)
  }

  async function printPL() {
    const el = document.getElementById('pl-print-section')
    if (!el) return

    // Fetch business name
    const { data: settings } = await supabase.from('business_settings')
      .select('setting_value').eq('tenant_id', tenantId).eq('setting_key', 'business_name').single()
    const businessName = settings?.setting_value || 'Business'

    // Remove drill-down icons from print content
    const printContent = el.innerHTML
      .replace(/🔍/g, '')
      .replace(/📊/g, '')
      .replace(/📈/g, '')
      .replace(/📦/g, '')
      .replace(/💸/g, '')
      .replace(/💰/g, '')

    const win = window.open('', '_blank')
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${businessName} — Profit & Loss Statement</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 11px; color: #000; padding: 12px; line-height: 1.3; }
          .header { background: #0f4c81; color: white; padding: 16px 20px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
          .header h1 { font-size: 16px; margin: 0; }
          .header p { font-size: 11px; margin: 3px 0 0; opacity: 0.8; }
          .net { text-align: right; }
          .net p { font-size: 11px; margin: 0; opacity: 0.8; }
          .net h2 { font-size: 22px; font-weight: 900; margin: 0; }
          .section-header { padding: 7px 12px; background: #f0f4f8; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #555; margin-top: 8px; }
          .row { display: flex; justify-content: space-between; padding: 4px 10px; border-bottom: 1px solid #eee; }
          .row.indent { padding: 3px 10px 3px 22px; font-size: 11px; }
          .row.bold { font-weight: 700; background: #f8f8f8; }
          .row.subtotal { font-weight: 900; font-size: 12px; padding: 6px 10px; border-top: 2px solid #000; border-bottom: 2px solid #000; }
          .section-header { padding: 4px 10px; background: #f0f0f0; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; border-left: 3px solid #000; margin-top: 6px; }
          .business-header { text-align: center; padding-bottom: 8px; border-bottom: 2px solid #000; margin-bottom: 10px; }
          .business-header h1 { font-size: 16px; font-weight: 900; margin: 0 0 2px; }
          .business-header p { font-size: 10px; color: #555; margin: 1px 0; }
          .net-box { text-align: right; border: 2px solid #000; padding: 6px 12px; border-radius: 4px; }
          .net-box p { font-size: 9px; color: #555; margin: 0 0 2px; }
          .net-box h3 { font-size: 14px; font-weight: 900; margin: 0; }
          .footer { margin-top: 12px; padding-top: 8px; border-top: 1px solid #ccc; display: flex; justify-content: space-between; font-size: 9px; color: #888; }
          .label { color: #333; }
          .value { font-weight: 600; }
          .green { color: #1a7a4a; }
          .red { color: #c62828; }
          .orange { color: #e65100; }
          .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 16px; }
          .card { background: #f8f9fa; border-radius: 6px; padding: 10px; text-align: center; }
          .card p { font-size: 10px; color: #666; margin: 0 0 4px; text-transform: uppercase; }
          .card h3 { font-size: 15px; font-weight: 800; margin: 0; }
          @media print {
            body { padding: 6px; font-size: 11px; }
            .pl-header { padding: 6px 0; margin-bottom: 6px; }
            .section-header { padding: 3px 8px; margin-top: 4px; font-size: 9px; }
            .row { padding: 3px 8px; }
            .row.indent { padding: 3px 8px 3px 18px; font-size: 10px; }
            .row.subtotal { padding: 5px 8px; }
            .footer { margin-top: 10px; padding-top: 6px; }
          }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print-icon { display: none !important; }
          span[style*="cursor: pointer"] { display: none !important; }
        </style>
      </head>
      <body>
        <div style="text-align:center; margin-bottom:16px; padding-bottom:12px; border-bottom:2px solid #0f4c81;">
          <h1 style="font-size:18px; color:#0f4c81; margin:0 0 4px; font-weight:900;">${businessName}</h1>
          <p style="font-size:12px; color:#888; margin:0;">Profit & Loss Statement</p>
        </div>
        ${el.innerHTML.replace(/🔍/g, '').replace(/📊/g, '').replace(/📈/g, '').replace(/📦/g, '').replace(/💸/g, '').replace(/💰/g, '')}
      </body>
      </html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 500)
  }

  async function openDrillDown(accountName, accountCode) {
    setDrillLoading(true)
    setDrillDown({ label: accountName, entries: [] })

    try {
      let jeForDrill = []
      let drillFrom = 0
      while (true) {
        const { data: page } = await supabase
          .from('journal_entries')
          .select('id, entry_date, narration, reference_type')
          .eq('tenant_id', tenantId)
          .gte('entry_date', dateFrom)
          .lte('entry_date', dateTo)
          .range(drillFrom, drillFrom + 999)
        if (!page || page.length === 0) break
        jeForDrill = jeForDrill.concat(page)
        if (page.length < 1000) break
        drillFrom += 1000
      }

      const jeDrillMap = {}
      ;(jeForDrill || []).forEach(je => { jeDrillMap[je.id] = je })
      const jeDrillIds = (jeForDrill || []).map(je => je.id)

      let lines = []
      if (jeDrillIds.length > 0) {
        const chunkSize = 100
        for (let i = 0; i < jeDrillIds.length; i += chunkSize) {
          const chunk = jeDrillIds.slice(i, i + chunkSize)
          const { data: batch } = await supabase
            .from('journal_entry_lines')
            .select('debit, credit, journal_entry_id')
            .eq('tenant_id', tenantId)
            .eq('account_code', accountCode)
            .in('journal_entry_id', chunk)
          if (batch) lines = lines.concat(batch)
        }
      }

      const entries = (lines || []).map(l => {
        const je = jeDrillMap[l.journal_entry_id] || {}
        return {
          date: je.entry_date,
          description: je.narration || '—',
          type: je.reference_type || '—',
          amount: Number(l.debit || 0) - Number(l.credit || 0)
        }
      }).filter(e => e.amount !== 0)
        .sort((a, b) => new Date(b.date) - new Date(a.date))

      setDrillDown({ label: accountName, entries })
    } catch (err) {
      console.error('Drill down error:', err)
    }
    setDrillLoading(false)
  }

  const today = new Date().toISOString().split('T')[0]
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  const firstOfLastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0]
  const lastOfLastMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split('T')[0]
  const firstOfYear = new Date().getFullYear() + '-01-01'

  const Row = ({ label, value, bold, indent, color, clickable, onClick }) => (
    <div onClick={clickable ? onClick : undefined}
      style={{
        display: 'flex', justifyContent: 'space-between', padding: bold ? '9px 16px' : '7px 16px',
        background: bold ? '#f8f9fa' : 'white',
        borderBottom: '1px solid #f0f0f0',
        cursor: clickable ? 'pointer' : 'default',
      }}
      onMouseEnter={e => { if (clickable) e.currentTarget.style.background = '#f0f7ff' }}
      onMouseLeave={e => { if (clickable) e.currentTarget.style.background = bold ? '#f8f9fa' : 'white' }}>
      <span style={{ fontSize: 13, fontWeight: bold ? 700 : 400, color: '#333', paddingLeft: indent ? 20 : 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        {label}
        {clickable && <span style={{ fontSize: 10, color: '#93c5fd' }}>🔍</span>}
      </span>
      <span style={{ fontSize: bold ? 14 : 13, fontWeight: bold ? 700 : 500, color: color || '#333' }}>
        Rs. {Math.abs(value || 0).toLocaleString('en-PK', { minimumFractionDigits: 0 })}
      </span>
    </div>
  )

  const SectionHeader = ({ label, color }) => (
    <div style={{ padding: '8px 16px', background: color || '#f0f4f8', borderBottom: '1px solid #e0e0e0' }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: '#555', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
    </div>
  )

  const SubtotalRow = ({ label, value, positive }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', background: positive ? '#e8f5e9' : '#ffebee', borderBottom: '2px solid #e0e0e0' }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: positive ? '#1a7a4a' : '#c62828' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: positive ? '#1a7a4a' : '#c62828' }}>Rs. {Math.abs(value || 0).toLocaleString()}</span>
    </div>
  )

  return (
    <div>
      {/* Date filter */}
      <div style={{ background: 'white', borderRadius: 10, padding: '12px 16px', marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#555', flexShrink: 0 }}>📅 Period:</span>
        {[
          { label: 'This Month', from: firstOfMonth, to: today },
          { label: 'Last Month', from: firstOfLastMonth, to: lastOfLastMonth },
          { label: 'This Year', from: firstOfYear, to: today },
        ].map(p => (
          <button key={p.label} onClick={() => { setDateFrom(p.from); setDateTo(p.to) }}
            style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0,
              background: dateFrom === p.from && dateTo === p.to ? '#0f4c81' : '#f0f4f8',
              color: dateFrom === p.from && dateTo === p.to ? '#fff' : '#555' }}>
            {p.label}
          </button>
        ))}
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ padding: '6px 10px', border: '1.5px solid #e0e0e0', borderRadius: 6, fontSize: 13, outline: 'none' }} />
        <span style={{ fontSize: 12, color: '#888' }}>to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ padding: '6px 10px', border: '1.5px solid #e0e0e0', borderRadius: 6, fontSize: 13, outline: 'none' }} />
        <button onClick={fetchPL} style={{ padding: '8px 20px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>🔍 Search</button>
        <button onClick={printPL} style={{ padding: '8px 16px', background: '#f0f4f8', color: '#555', border: '1px solid #e0e0e0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>🖨️ Print / PDF</button>
        <span style={{ fontSize: 11, color: '#888', marginLeft: 'auto', fontStyle: 'italic' }}>Click any line item to see details</span>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#888', background: 'white', borderRadius: 12 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          <p style={{ fontSize: 14 }}>Calculating Profit & Loss...</p>
        </div>
      ) : !data ? null : (
        <div id="pl-print-section" style={{ background: 'white', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ background: 'linear-gradient(135deg, #0f4c81, #1a6bad)', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <p style={{ color: '#fff', fontWeight: 800, fontSize: 16, margin: 0 }}>📊 Profit & Loss Statement</p>
              <p style={{ color: '#93c5fd', fontSize: 12, margin: '3px 0 0' }}>
                {new Date(dateFrom).toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })} — {new Date(dateTo).toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, margin: '3px 0 0', fontStyle: 'italic' }}>All figures read from Chart of Accounts journal entries</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: '#93c5fd', fontSize: 11, margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: 1 }}>Net {data.netProfit >= 0 ? 'Profit' : 'Loss'}</p>
              <p style={{ color: data.netProfit >= 0 ? '#6ee7b7' : '#fca5a5', fontWeight: 900, fontSize: 26, margin: 0, letterSpacing: -0.5 }}>
                Rs. {Math.abs(data.netProfit).toLocaleString()}
              </p>
            </div>
          </div>

          {/* REVENUE */}
          <SectionHeader label="📈 Revenue" color="#e8f5e9" />
          {Object.entries(data.revenueAccounts)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([name, val]) => {
              const acc = Object.values(data.accounts).find(a => a.name === name)
              return <Row key={name} label={name} value={val} indent color="#1a7a4a"
                clickable onClick={() => openDrillDown(name, acc?.code)} />
            })}
          <Row label="Total Revenue" value={data.totalRevenue} bold color="#1a7a4a" />

          {/* COST OF GOODS */}
          {data.totalCogs > 0 && <>
            <SectionHeader label="📦 Cost of Goods Sold" color="#fff3e0" />
            {Object.entries(data.cogsAccounts)
              .filter(([, v]) => v > 0)
              .map(([name, val]) => {
                const acc = Object.values(data.accounts).find(a => a.name === name)
                return <Row key={name} label={name} value={val} indent color="#e65100"
                  clickable onClick={() => openDrillDown(name, acc?.code)} />
              })}
            <Row label="Total Cost of Goods" value={data.totalCogs} bold color="#e65100" />
          </>}

          {/* GROSS PROFIT */}
          <SubtotalRow label="GROSS PROFIT" value={data.grossProfit} positive={data.grossProfit >= 0} />

          {/* OPERATING EXPENSES */}
          <SectionHeader label="💸 Operating Expenses" color="#ffebee" />
          {Object.entries(data.expenseAccounts)
            .filter(([, v]) => v.amount > 0)
            .sort((a, b) => b[1].amount - a[1].amount)
            .map(([name, v]) => (
              <Row key={name} label={name} value={v.amount} indent color="#c62828"
                clickable onClick={() => openDrillDown(name, v.code)} />
            ))}
          <Row label="Total Operating Expenses" value={data.totalExpenses} bold color="#c62828" />

          {/* NET PROFIT */}
          <SubtotalRow label={`NET ${data.netProfit >= 0 ? 'PROFIT' : 'LOSS'}`} value={data.netProfit} positive={data.netProfit >= 0} />

          {/* Summary cards */}
          <div style={{ padding: '16px', background: '#f8fafc', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {[
              { label: 'Total Revenue', value: data.totalRevenue, color: '#1a7a4a', bg: '#e8f5e9' },
              { label: 'Total Expenses', value: data.totalExpenses + data.totalCogs, color: '#c62828', bg: '#ffebee' },
              { label: data.netProfit >= 0 ? 'Net Profit' : 'Net Loss', value: data.netProfit, color: data.netProfit >= 0 ? '#1a7a4a' : '#c62828', bg: data.netProfit >= 0 ? '#e8f5e9' : '#ffebee' },
              { label: 'Profit Margin', value: data.totalRevenue > 0 ? ((data.netProfit / data.totalRevenue) * 100).toFixed(1) + '%' : '0%', color: data.netProfit >= 0 ? '#0f4c81' : '#c62828', bg: '#e3f0ff', isPercent: true },
            ].map(c => (
              <div key={c.label} style={{ background: c.bg, borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                <p style={{ fontSize: 10, color: '#666', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{c.label}</p>
                <p style={{ fontSize: 16, fontWeight: 800, color: c.color, margin: 0 }}>
                  {c.isPercent ? c.value : `Rs. ${Math.abs(c.value).toLocaleString()}`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drill Down Modal */}
      {drillDown && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 660, maxHeight: '82vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '16px 20px', background: '#0f4c81', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: 0 }}>🔍 {drillDown.label}</p>
                <p style={{ color: '#93c5fd', fontSize: 11, margin: '2px 0 0' }}>
                  {new Date(dateFrom).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })} — {new Date(dateTo).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {drillDown.entries.length > 0 && ` · ${drillDown.entries.length} transactions`}
                </p>
              </div>
              <button onClick={() => setDrillDown(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '7px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>✕ Close</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {drillLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading transactions...</div>
              ) : drillDown.entries.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
                  <p style={{ fontSize: 28, marginBottom: 8 }}>📭</p>
                  <p>No transactions found for this account in the selected period</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      {['Date', 'Description', 'Type', 'Amount'].map((h, i) => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: i === 3 ? 'right' : 'left', fontSize: 11, color: '#666', fontWeight: 700, borderBottom: '2px solid #eee', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {drillDown.entries.map((e, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                        <td style={{ padding: '9px 14px', fontSize: 12, color: '#555', whiteSpace: 'nowrap' }}>
                          {new Date(e.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '9px 14px', fontSize: 12, color: '#333', maxWidth: 280 }}>{e.description}</td>
                        <td style={{ padding: '9px 14px', fontSize: 11 }}>
                          <span style={{ background: '#f0f4f8', color: '#555', padding: '2px 7px', borderRadius: 4, fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {e.type?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 700, color: '#c62828', textAlign: 'right' }}>
                          Rs. {Math.abs(e.amount).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#0f4c81' }}>
                      <td colSpan={3} style={{ padding: '11px 14px', fontSize: 13, fontWeight: 700, color: '#fff' }}>Total — {drillDown.label}</td>
                      <td style={{ padding: '11px 14px', fontSize: 14, fontWeight: 800, color: '#fff', textAlign: 'right' }}>
                        Rs. {Math.abs(drillDown.entries.reduce((s, e) => s + e.amount, 0)).toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
