import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Reports({ tenantId }) {
  const [activeTab, setActiveTab] = useState('daily')
  const tabs = [
    { key: 'daily', label: '💵 Daily Cash' },
    { key: 'ledger', label: '📒 Customer Ledger' },
    { key: 'ageing', label: '⏳ Receivables' },
    { key: 'sales', label: '📊 Sales Summary' },
    { key: 'pl', label: '📈 P&L' },
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
      {activeTab === 'bulk' && <BulkWhatsAppShare tenantId={tenantId} />}
    </div>
  )
}

// ─── DAILY CASH REPORT ─────────────────────────────────────────────
function DailyCashReport({ tenantId }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (tenantId) fetchReport() }, [date, tenantId])

  async function fetchReport() {
    setLoading(true)
    const from = date + 'T00:00:00'
    const to = date + 'T23:59:59'
    const { data: deliveries } = await supabase.from('deliveries')
      .select('*, riders(full_name)')
      .eq('tenant_id', tenantId)
      .gte('delivered_at', from).lte('delivered_at', to).eq('is_voided', false)
    const { data: payments } = await supabase.from('payments')
      .select('*, riders(full_name)')
      .eq('tenant_id', tenantId)
      .eq('payment_date', date).eq('is_voided', false)
    const { data: expenses } = await supabase.from('expenses')
      .select('*, riders(full_name)')
      .eq('tenant_id', tenantId)
      .eq('expense_date', date).eq('is_voided', false)
    const { data: officeExpenses } = await supabase.from('office_expenses')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('expense_date', date).eq('is_voided', false)
    const { data: advances } = await supabase.from('salary_advances')
      .select('*, riders(full_name)')
      .eq('tenant_id', tenantId)
      .eq('status', 'approved').eq('is_voided', false).gte('approved_at', from).lte('approved_at', to)
    const { data: salaryPayments } = await supabase.from('salary_payments')
      .select('*, riders(full_name)')
      .eq('tenant_id', tenantId)
      .gte('created_at', from).lte('created_at', to)

    let cashFromSales = 0, jazzFromSales = 0, jazzFromSalesPending = 0, creditSales = 0, totalSalesValue = 0
    const riderCash = {}
    deliveries?.forEach(d => {
      totalSalesValue += Number(d.total_amount)
      if (d.payment_method === 'cash') { cashFromSales += Number(d.amount_received); const name = d.riders?.full_name || 'Unknown'; riderCash[name] = (riderCash[name] || 0) + Number(d.amount_received) }
      if (d.payment_method === 'jazzcash') { if (d.jazzcash_confirmed) jazzFromSales += Number(d.total_amount); else jazzFromSalesPending += Number(d.total_amount) }
      if (d.payment_method === 'credit') creditSales += Number(d.total_amount)
    })

    let cashFromPayments = 0, jazzFromPayments = 0, jazzFromPaymentsPending = 0
    payments?.forEach(p => {
      if (p.payment_method === 'cash') { cashFromPayments += Number(p.amount); const name = p.riders?.full_name || 'Unknown'; riderCash[name] = (riderCash[name] || 0) + Number(p.amount) }
      if (p.payment_method === 'jazzcash') { if (p.jazzcash_confirmed) jazzFromPayments += Number(p.amount); else jazzFromPaymentsPending += Number(p.amount) }
    })

    const totalExpenses = expenses?.reduce((s, e) => s + Number(e.amount), 0) || 0
    const totalOfficeExp = officeExpenses?.reduce((s, e) => s + Number(e.amount), 0) || 0
    const totalAdvances = advances?.reduce((s, a) => s + Number(a.amount), 0) || 0
    const totalSalaryPayments = salaryPayments?.reduce((s, p) => s + Number(p.amount_paid), 0) || 0
    const totalCashIn = cashFromSales + cashFromPayments
    const totalCashOut = totalExpenses + totalOfficeExp + totalAdvances + totalSalaryPayments
    const closingCash = totalCashIn - totalCashOut

    setData({ cashFromSales, cashFromPayments, totalCashIn, jazzFromSales, jazzFromSalesPending, jazzFromPayments, jazzFromPaymentsPending, creditSales, totalSalesValue, totalExpenses, totalOfficeExp, totalAdvances, totalSalaryPayments, totalCashOut, closingCash, riderCash, deliveries, expenses, officeExpenses, advances, salaryPayments })
    setLoading(false)
  }

  function Row({ label, value, color, bold, indent }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
        <span style={{ fontSize: '13px', color: color || '#555', fontWeight: bold ? '700' : '400', paddingLeft: indent ? '16px' : '0' }}>{label}</span>
        <span style={{ fontSize: '13px', fontWeight: bold ? '700' : '600', color: color || '#333' }}>Rs. {Number(value || 0).toLocaleString()}</span>
      </div>
    )
  }

  return (
    <div>
      <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <label style={{ fontSize: '13px', color: '#555', fontWeight: '600' }}>Date:</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none' }} />
        <button onClick={fetchReport} style={{ padding: '8px 16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>🔄 Refresh</button>
      </div>
      {loading ? <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p> : data && (
        <div>
          <div style={{ background: '#f0f4ff', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f4c81' }}>Opening Cash</span>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f4c81' }}>Rs. 0</span>
          </div>
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#1a7a4a', marginBottom: '10px' }}>📥 CASH IN</p>
            <Row label="Cash from Deliveries / Sales" value={data.cashFromSales} indent />
            <Row label="Cash from Balance Collections" value={data.cashFromPayments} indent />
            <Row label="Total Cash In" value={data.totalCashIn} color="#1a7a4a" bold />
          </div>
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#f44336', marginBottom: '10px' }}>📤 CASH OUT</p>
            <Row label="Rider Expenses" value={data.totalExpenses} indent />
            <Row label="Office Expenses" value={data.totalOfficeExp} indent />
            <Row label="Salary Advances Paid" value={data.totalAdvances} indent />
            <Row label="Salary Payments Made" value={data.totalSalaryPayments} indent />
            <Row label="Total Cash Out" value={data.totalCashOut} color="#f44336" bold />
          </div>
          <div style={{ background: data.closingCash >= 0 ? 'linear-gradient(135deg, #0f4c81, #1a7a4a)' : 'linear-gradient(135deg, #c62828, #e65100)', color: 'white', borderRadius: '12px', padding: '20px', marginBottom: '12px', textAlign: 'center' }}>
            <p style={{ fontSize: '13px', opacity: 0.8, margin: '0 0 8px' }}>Closing Cash (End of Day)</p>
            <p style={{ fontSize: '40px', fontWeight: '700', margin: '0 0 4px' }}>Rs. {data.closingCash.toLocaleString()}</p>
            <p style={{ fontSize: '12px', opacity: 0.7, margin: 0 }}>Opening Rs. 0 + Cash In Rs. {data.totalCashIn.toLocaleString()} − Cash Out Rs. {data.totalCashOut.toLocaleString()}</p>
          </div>
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#9c27b0', marginBottom: '10px' }}>📱 JazzCash (Not included in cash)</p>
            <Row label="JazzCash Sales — Confirmed" value={data.jazzFromSales} indent />
            <Row label="JazzCash Sales — Pending" value={data.jazzFromSalesPending} indent />
            <Row label="JazzCash Payments — Confirmed" value={data.jazzFromPayments} indent />
            <Row label="JazzCash Payments — Pending" value={data.jazzFromPaymentsPending} indent />
            <Row label="Total JazzCash" value={data.jazzFromSales + data.jazzFromSalesPending + data.jazzFromPayments + data.jazzFromPaymentsPending} color="#9c27b0" bold />
          </div>
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#e65100', marginBottom: '10px' }}>📋 Credit Sales (informational only)</p>
            <Row label="Credit Sales Today" value={data.creditSales} indent />
            <Row label="Total Sales Value (Cash + Jazz + Credit)" value={data.totalSalesValue} bold />
          </div>
          {Object.keys(data.riderCash).length > 0 && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>🚴 Cash per Rider</p>
              {Object.entries(data.riderCash).map(([name, amount]) => <Row key={name} label={name} value={amount} indent />)}
            </div>
          )}
          {data.officeExpenses?.length > 0 && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>Office Expenses Detail</p>
              {data.officeExpenses.map(e => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <span style={{ fontSize: '12px', color: '#555', textTransform: 'capitalize' }}>{e.category} — {e.description || '—'}</span>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#f44336' }}>Rs. {Number(e.amount).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
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
    const { data } = await supabase.from('customers').select('*').eq('tenant_id', tenantId)
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
        debit: Number(d.total_amount),
        credit: d.payment_method === 'cash' ? Number(d.amount_received || 0) : (d.payment_method === 'jazzcash' && d.jazzcash_confirmed ? Number(d.total_amount) : 0),
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

  const totalDebit = ledger.reduce((s, e) => s + (e.debit || 0), 0)
  const totalCredit = ledger.reduce((s, e) => s + (e.credit || 0), 0)
  const openingBal = Number(selectedCustomer?.opening_balance || 0)
  const closingBalance = ledger.length > 0 ? ledger[ledger.length - 1].runningBalance : openingBal
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
          <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px' }}>
            <button onClick={() => { setSelectedCustomer(null); setLedger([]) }}
              style={{ padding: '8px 16px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', flexShrink: 0 }}>
              ← Back
            </button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleShareWhatsApp}
                style={{ padding: '10px 16px', background: '#25d366', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                💬 Share
              </button>
              <button onClick={handlePrint}
                style={{ padding: '10px 16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                🖨️ Print / PDF
              </button>
            </div>
          </div>

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
              {[
                { label: 'Opening Balance', value: openingBal, color: '#0f4c81', bg: '#e3f0ff' },
                { label: 'Total Sales (Dr)', value: totalDebit, color: '#f44336', bg: '#ffebee' },
                { label: 'Total Payments (Cr)', value: totalCredit, color: '#1a7a4a', bg: '#e8f5e9' },
                { label: 'Closing Balance', value: closingBalance, color: closingBalance > 0 ? '#f44336' : '#1a7a4a', bg: closingBalance > 0 ? '#ffebee' : '#e8f5e9' },
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
                      <td style={{ padding: '8px 12px', fontSize: '12px', fontWeight: '700', color: '#0f4c81' }}>★ Opening Balance</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#aaa' }}>—</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#aaa' }}>—</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '13px', fontWeight: '700', color: openingBal > 0 ? '#f44336' : '#1a7a4a' }}>{openingBal.toLocaleString()}</td>
                    </tr>
                    {ledger.length === 0 ? (
                      <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No transactions found</td></tr>
                    ) : ledger.map((e, idx) => (
                      <tr key={idx} style={{ background: idx % 2 === 0 ? 'white' : '#fafbff', borderBottom: '1px solid #eef0f5' }}>
                        <td style={{ padding: '8px 12px', fontSize: '11px', color: '#aaa', fontWeight: '600' }}>{idx + 1}</td>
                        <td style={{ padding: '8px 12px', fontSize: '11px', color: '#555', whiteSpace: 'nowrap' }}>
                          {new Date(e.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: '12px', color: '#333' }}>
                          <span style={{ fontWeight: '600' }}>{e.description}</span>
                          {e.credit_amount > 0 && <span style={{ fontSize: '10px', color: '#f44336', display: 'block', marginTop: '2px' }}>↳ Credit portion: Rs. {e.credit_amount.toLocaleString()}</span>}
                          {e.pendingAmount > 0 && <span style={{ fontSize: '10px', color: '#e65100', display: 'block', marginTop: '2px' }}>↳ Pending confirmation: Rs. {e.pendingAmount.toLocaleString()}</span>}
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: '12px', fontWeight: '700', color: e.debit > 0 ? '#f44336' : '#ddd', textAlign: 'right' }}>{e.debit > 0 ? e.debit.toLocaleString() : '—'}</td>
                        <td style={{ padding: '8px 12px', fontSize: '12px', fontWeight: '700', color: e.credit > 0 ? '#1a7a4a' : '#ddd', textAlign: 'right' }}>{e.credit > 0 ? e.credit.toLocaleString() : '—'}</td>
                        <td style={{ padding: '8px 12px', fontSize: '13px', fontWeight: '700', textAlign: 'right', color: e.runningBalance > 0 ? '#f44336' : '#1a7a4a' }}>
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
    const { data } = await supabase.from('customers').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('full_name')
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
                <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>{c.customer_code}</p>
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
    const { data } = await supabase.from('customers').select('*').eq('tenant_id', tenantId).eq('is_active', true).gt('balance', 0).order('balance', { ascending: false })
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
                <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{c.mobile} · {c.customer_code}</p>
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

// ─── SALES SUMMARY ─────────────────────────────────────────────────
function SalesSummary({ tenantId }) {
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 7) + '-01')
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (tenantId) fetchSales() }, [dateFrom, dateTo, tenantId])

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
        <button onClick={fetchSales} style={{ padding: '8px 16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>🔄 Refresh</button>
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

  useEffect(() => { if (tenantId) fetchPL() }, [dateFrom, dateTo, tenantId])

  async function fetchPL() {
    setLoading(true)

    // ── REVENUE — from deliveries ──
    const { data: deliveries } = await supabase.from('deliveries')
      .select('total_amount').eq('tenant_id', tenantId)
      .eq('is_voided', false)
      .gte('delivered_at', dateFrom + 'T00:00:00')
      .lte('delivered_at', dateTo + 'T23:59:59')
    const totalRevenue = deliveries?.reduce((s, d) => s + Number(d.total_amount), 0) || 0

    // ── COGS — from journal entries account 5003 ──
    const { data: cogsLines } = await supabase.from('journal_entry_lines')
      .select('debit, je:journal_entry_id!inner(entry_date)')
      .eq('tenant_id', tenantId)
      .eq('account_code', '5003')
      .gte('je.entry_date', dateFrom)
      .lte('je.entry_date', dateTo)
    const totalCOGS = cogsLines?.reduce((s, l) => s + Number(l.debit || 0), 0) || 0

    // ── RAW MATERIAL PURCHASES ──
    const { data: purchases } = await supabase.from('stock_purchases')
      .select('total_cost').eq('tenant_id', tenantId)
      .gte('purchase_date', dateFrom).lte('purchase_date', dateTo)
    const totalPurchaseCost = purchases?.reduce((s, p) => s + Number(p.total_cost), 0) || 0

    // ── PRODUCTION OVERHEAD ──
    const { data: productions } = await supabase.from('production_entries')
      .select('total_overhead').eq('tenant_id', tenantId)
      .gte('production_date', dateFrom).lte('production_date', dateTo)
    const totalProductionOverhead = productions?.reduce((s, p) => s + Number(p.total_overhead), 0) || 0

    const totalCogs = totalCOGS + totalPurchaseCost + totalProductionOverhead
    const grossProfit = totalRevenue - totalCogs

// ── RIDER FIELD EXPENSES by type ──
    const { data: riderExpenses } = await supabase.from('expenses')
      .select('expense_type, amount').eq('tenant_id', tenantId)
      .eq('is_voided', false)
      .gte('expense_date', dateFrom).lte('expense_date', dateTo)

    const riderByCategory = {}
    riderExpenses?.forEach(e => {
      const key = e.expense_type || 'other'
      riderByCategory[key] = (riderByCategory[key] || 0) + Number(e.amount)
    })

    // ── OFFICE EXPENSES by category (excluding salary) ──
    const { data: officeExpenses } = await supabase.from('office_expenses')
      .select('category, amount').eq('tenant_id', tenantId)
      .eq('is_voided', false).neq('category', 'salary')
      .gte('expense_date', dateFrom).lte('expense_date', dateTo)

    const officeByCategory = {}
    officeExpenses?.forEach(e => {
      const key = e.category || 'other'
      officeByCategory[key] = (officeByCategory[key] || 0) + Number(e.amount)
    })

    // ── SALARY PAYMENTS ──
    const { data: officeSalaries } = await supabase.from('office_expenses')
      .select('amount').eq('tenant_id', tenantId)
      .eq('is_voided', false).eq('category', 'salary')
      .gte('expense_date', dateFrom).lte('expense_date', dateTo)
    const totalOfficeSalaries = officeSalaries?.reduce((s, e) => s + Number(e.amount), 0) || 0

    const { data: salaryPayments } = await supabase.from('salary_payments')
      .select('amount_paid').eq('tenant_id', tenantId)
      .gte('payment_date', dateFrom).lte('payment_date', dateTo)
    const totalSalaryPayments = salaryPayments?.reduce((s, p) => s + Number(p.amount_paid), 0) || 0
    const totalSalaries = totalOfficeSalaries + totalSalaryPayments

    const totalRiderExpenses = Object.values(riderByCategory).reduce((s, v) => s + v, 0)
    const totalOfficeExpenses = Object.values(officeByCategory).reduce((s, v) => s + v, 0)
    const totalOperatingExpenses = totalRiderExpenses + totalOfficeExpenses + totalSalaries
    const netProfit = grossProfit - totalOperatingExpenses

    setData({
      totalRevenue, totalCOGS, totalPurchaseCost, totalProductionOverhead,
      totalCogs, grossProfit, riderByCategory, officeByCategory,
      totalRiderExpenses, totalOfficeExpenses, totalSalaries,
      totalOperatingExpenses, netProfit
    })
    setLoading(false)
  }

  function PLRow({ label, value, color, bold, indent, separator }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: separator ? '2px solid #eee' : '1px solid #f0f0f0', marginTop: separator ? '4px' : '0' }}>
        <span style={{ fontSize: '13px', color: color || '#555', fontWeight: bold ? '700' : '400', paddingLeft: indent ? '16px' : '0' }}>{label}</span>
        <span style={{ fontSize: bold ? '15px' : '13px', fontWeight: '700', color: color || (value < 0 ? '#f44336' : '#333') }}>{value < 0 ? '− ' : ''}Rs. {Math.abs(value).toLocaleString()}</span>
      </div>
    )
  }

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>📈 Profit & Loss Statement</h3>
      <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div><label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>From</label><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none' }} /></div>
        <div><label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>To</label><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none' }} /></div>
        <button onClick={fetchPL} style={{ padding: '8px 16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>🔄 Refresh</button>
      </div>
      {loading ? <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p> : data && (
        <div>
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
            <p style={{ fontSize: '14px', fontWeight: '700', color: '#0f4c81', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #e3f0ff' }}>REVENUE</p>
            <PLRow label="Sales Revenue" value={data.totalRevenue} color="#1a7a4a" indent />
            <PLRow label="Total Revenue" value={data.totalRevenue} color="#1a7a4a" bold separator />
            <p style={{ fontSize: '14px', fontWeight: '700', color: '#f44336', margin: '16px 0 12px', paddingBottom: '8px', borderBottom: '2px solid #ffebee' }}>COST OF GOODS</p>
            {data.totalCOGS > 0 && <PLRow label="Cost of Goods Sold" value={data.totalCOGS} color="#f44336" indent />}
            {data.totalPurchaseCost > 0 && <PLRow label="Raw Material Purchases" value={data.totalPurchaseCost} color="#f44336" indent />}
            {data.totalProductionOverhead > 0 && <PLRow label="Production Overhead" value={data.totalProductionOverhead} color="#f44336" indent />}
            <PLRow label="Total Cost of Goods" value={data.totalCogs} color="#f44336" bold separator />
            <PLRow label="GROSS PROFIT" value={data.grossProfit} color={data.grossProfit >= 0 ? '#1a7a4a' : '#f44336'} bold separator />
            <p style={{ fontSize: '14px', fontWeight: '700', color: '#e65100', margin: '16px 0 12px', paddingBottom: '8px', borderBottom: '2px solid #fff3e0' }}>OPERATING EXPENSES</p>
            {/* Rider Field Expenses by type */}
            {Object.entries(data.riderByCategory || {}).map(([cat, amt]) => (
              <PLRow key={'r-'+cat} label={`🚴 ${cat.charAt(0).toUpperCase() + cat.slice(1)}`} value={amt} color="#e65100" indent />
            ))}

            {/* Office Expenses by category */}
            {Object.entries(data.officeByCategory || {}).map(([cat, amt]) => (
              <PLRow key={'o-'+cat} label={`🏢 ${cat.charAt(0).toUpperCase() + cat.slice(1)}`} value={amt} color="#e65100" indent />
            ))}

            {/* Salaries */}
            {data.totalSalaries > 0 && <PLRow label="💼 Salaries Paid" value={data.totalSalaries} color="#e65100" indent />}

            <PLRow label="Total Operating Expenses" value={data.totalOperatingExpenses} color="#e65100" bold separator />
          </div>
          <div style={{ background: data.netProfit >= 0 ? 'linear-gradient(135deg, #0f4c81, #1a7a4a)' : 'linear-gradient(135deg, #c62828, #e65100)', color: 'white', borderRadius: '12px', padding: '24px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', opacity: 0.8, margin: '0 0 8px' }}>NET PROFIT / (LOSS)</p>
            <p style={{ fontSize: '44px', fontWeight: '700', margin: '0 0 6px' }}>{data.netProfit < 0 ? '−' : ''} Rs. {Math.abs(data.netProfit).toLocaleString()}</p>
            <p style={{ fontSize: '12px', opacity: 0.7, margin: 0 }}>Revenue Rs. {data.totalRevenue.toLocaleString()} − COGS Rs. {(data.totalCogs || 0).toLocaleString()} − Expenses Rs. {data.totalOperatingExpenses.toLocaleString()}</p>
          </div>
        </div>
      )}
    </div>
  )
}
