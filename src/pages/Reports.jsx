import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Reports() {
  const [activeTab, setActiveTab] = useState('daily')

  const tabs = [
    { key: 'daily', label: '💵 Daily Cash' },
    { key: 'ledger', label: '📒 Customer Ledger' },
    { key: 'ageing', label: '⏳ Receivables' },
    { key: 'sales', label: '📊 Sales Summary' },
    { key: 'pl', label: '📈 P&L' },
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
            style={{
              padding: '8px 14px', border: 'none', borderRadius: '8px', cursor: 'pointer',
              background: activeTab === t.key ? '#0f4c81' : '#f0f0f0',
              color: activeTab === t.key ? 'white' : '#555',
              fontWeight: activeTab === t.key ? '700' : '400', fontSize: '13px'
            }}>{t.label}</button>
        ))}
      </div>
      {activeTab === 'daily' && <DailyCashReport />}
      {activeTab === 'ledger' && <CustomerLedger />}
      {activeTab === 'ageing' && <ReceivablesAgeing />}
      {activeTab === 'sales' && <SalesSummary />}
      {activeTab === 'pl' && <ProfitLoss />}
    </div>
  )
}

// ─── DAILY CASH REPORT ─────────────────────────────────────────────
function DailyCashReport() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchReport() }, [date])

  async function fetchReport() {
    setLoading(true)
    const from = date + 'T00:00:00'
    const to = date + 'T23:59:59'

    const { data: deliveries } = await supabase.from('deliveries')
      .select('*, riders(full_name)')
      .gte('delivered_at', from).lte('delivered_at', to)
      .eq('is_voided', false)

    const { data: payments } = await supabase.from('payments')
      .select('*, riders(full_name)')
      .eq('payment_date', date)
      .eq('is_voided', false)

    const { data: expenses } = await supabase.from('expenses')
      .select('*, riders(full_name)')
      .eq('expense_date', date)
      .eq('is_voided', false)

    const { data: officeExpenses } = await supabase.from('office_expenses')
      .select('*').eq('expense_date', date)
      .eq('is_voided', false)

    const { data: advances } = await supabase.from('salary_advances')
      .select('*, riders(full_name)')
      .eq('status', 'approved')
      .eq('is_voided', false)
      .gte('approved_at', from).lte('approved_at', to)

    const { data: salaryPayments } = await supabase.from('salary_payments')
      .select('*, riders(full_name)')
      .gte('created_at', from).lte('created_at', to)

    let cashFromSales = 0, jazzFromSales = 0, jazzFromSalesPending = 0
    let creditSales = 0, totalSalesValue = 0
    const riderCash = {}

    deliveries?.forEach(d => {
      totalSalesValue += Number(d.total_amount)
      if (d.payment_method === 'cash') {
        cashFromSales += Number(d.amount_received)
        const name = d.riders?.full_name || 'Unknown'
        riderCash[name] = (riderCash[name] || 0) + Number(d.amount_received)
      }
      if (d.payment_method === 'jazzcash') {
        if (d.jazzcash_confirmed) jazzFromSales += Number(d.total_amount)
        else jazzFromSalesPending += Number(d.total_amount)
      }
      if (d.payment_method === 'credit') creditSales += Number(d.total_amount)
    })

    let cashFromPayments = 0, jazzFromPayments = 0, jazzFromPaymentsPending = 0
    payments?.forEach(p => {
      if (p.payment_method === 'cash') {
        cashFromPayments += Number(p.amount)
        const name = p.riders?.full_name || 'Unknown'
        riderCash[name] = (riderCash[name] || 0) + Number(p.amount)
      }
      if (p.payment_method === 'jazzcash') {
        if (p.jazzcash_confirmed) jazzFromPayments += Number(p.amount)
        else jazzFromPaymentsPending += Number(p.amount)
      }
    })

    const totalExpenses = expenses?.reduce((s, e) => s + Number(e.amount), 0) || 0
    const totalOfficeExp = officeExpenses?.reduce((s, e) => s + Number(e.amount), 0) || 0
    const totalAdvances = advances?.reduce((s, a) => s + Number(a.amount), 0) || 0
    const totalSalaryPayments = salaryPayments?.reduce((s, p) => s + Number(p.amount_paid), 0) || 0
    const totalCashIn = cashFromSales + cashFromPayments
    const totalCashOut = totalExpenses + totalOfficeExp + totalAdvances + totalSalaryPayments
    const closingCash = totalCashIn - totalCashOut

    setData({
      cashFromSales, cashFromPayments, totalCashIn,
      jazzFromSales, jazzFromSalesPending, jazzFromPayments, jazzFromPaymentsPending,
      creditSales, totalSalesValue,
      totalExpenses, totalOfficeExp, totalAdvances, totalSalaryPayments,
      totalCashOut, closingCash,
      riderCash, deliveries, expenses, officeExpenses, advances, salaryPayments
    })
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
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none' }} />
        <button onClick={fetchReport}
          style={{ padding: '8px 16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
          🔄 Refresh
        </button>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>
      ) : data && (
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
            <Row label="Rider Expenses (Fuel, Repair, etc.)" value={data.totalExpenses} indent />
            <Row label="Office Expenses" value={data.totalOfficeExp} indent />
            <Row label="Salary Advances Paid" value={data.totalAdvances} indent />
            <Row label="Salary Payments Made" value={data.totalSalaryPayments} indent />
            <Row label="Total Cash Out" value={data.totalCashOut} color="#f44336" bold />
          </div>
          <div style={{
            background: data.closingCash >= 0 ? 'linear-gradient(135deg, #0f4c81, #1a7a4a)' : 'linear-gradient(135deg, #c62828, #e65100)',
            color: 'white', borderRadius: '12px', padding: '20px', marginBottom: '12px', textAlign: 'center'
          }}>
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
              {Object.entries(data.riderCash).map(([name, amount]) => (
                <Row key={name} label={name} value={amount} indent />
              ))}
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
function CustomerLedger() {
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [ledger, setLedger] = useState([])
  const [loading, setLoading] = useState(false)
  const [businessSettings, setBusinessSettings] = useState({})

  useEffect(() => { fetchSettings() }, [])

  async function fetchSettings() {
    const { data } = await supabase.from('business_settings').select('*')
    const map = {}
    data?.forEach(s => { map[s.setting_key] = s.setting_value })
    setBusinessSettings(map)
  }

  async function searchCustomer(val) {
    setSearch(val)
    if (val.length < 2) { setCustomers([]); return }
    const { data } = await supabase.from('customers').select('*')
      .or(`full_name.ilike.%${val}%,mobile.ilike.%${val}%,customer_code.ilike.%${val}%`)
      .limit(5)
    setCustomers(data || [])
  }

  async function loadLedger(customer) {
    setSelectedCustomer(customer)
    setCustomers([])
    setSearch('')
    setLoading(true)

    // Only fetch non-voided entries
    const { data: deliveries } = await supabase.from('deliveries')
      .select('*')
      .eq('customer_id', customer.id)
      .eq('is_voided', false)
      .order('delivered_at', { ascending: true })

    const { data: payments } = await supabase.from('payments')
      .select('*')
      .eq('customer_id', customer.id)
      .eq('is_voided', false)
      .order('created_at', { ascending: true })

    const entries = []

    deliveries?.forEach(d => {
      entries.push({
        date: d.delivered_at,
        type: 'delivery',
        description: `Delivery — 19L×${d.qty_19l || 0} Half×${d.qty_half_litre || 0} 1.5L×${d.qty_1_5l || 0}`,
        debit: Number(d.total_amount),
        credit: d.payment_method === 'cash' ? Number(d.amount_received || 0) :
                d.payment_method === 'jazzcash' && d.jazzcash_confirmed ? Number(d.total_amount) : 0,
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
        date: p.created_at,
        type: 'payment',
        description: `Payment — ${p.payment_method}${isPendingJazz ? ' (Pending)' : ''}`,
        debit: 0,
        credit: isCash || isConfirmedJazz ? Number(p.amount) : 0,
        pendingAmount: isPendingJazz ? Number(p.amount) : 0,
        payment_method: p.payment_method
      })
    })

    entries.sort((a, b) => new Date(a.date) - new Date(b.date))

    // Start with opening balance
    let balance = Number(customer.opening_balance || 0)

    const ledgerWithBalance = entries.map(e => {
      if (e.type === 'delivery') {
        if (e.payment_method === 'cash') {
          // Debit full amount, credit cash received, difference goes to balance
          balance = balance + e.debit - e.credit
        } else if (e.payment_method === 'jazzcash') {
          if (e.jazzcash_confirmed) {
            // Confirmed jazz — no effect on balance (already paid)
            balance = balance + e.debit - e.credit
          } else {
            // Pending jazz — adds to balance
            balance = balance + e.debit
          }
        } else {
          // Credit sale — full amount adds to balance
          balance = balance + e.debit
        }
      } else if (e.type === 'payment') {
        // Payment reduces balance
        balance = balance - e.credit
      }
      return { ...e, runningBalance: balance }
    })

    setLedger(ledgerWithBalance)
    setLoading(false)
  }

  function handlePrint() { window.print() }

  const totalDebit = ledger.reduce((s, e) => s + (e.debit || 0), 0)
  const totalCredit = ledger.reduce((s, e) => s + (e.credit || 0), 0)
  const openingBal = Number(selectedCustomer?.opening_balance || 0)
  const printDate = new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #ledger-print-area, #ledger-print-area * { visibility: visible; }
          #ledger-print-area {
            position: absolute; top: 0; left: 0; width: 100%;
            padding: 20px; box-sizing: border-box;
          }
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
          <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <button onClick={() => { setSelectedCustomer(null); setLedger([]) }}
              style={{ padding: '8px 16px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
              ← Back
            </button>
            <button onClick={handlePrint}
              style={{ padding: '10px 24px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>
              🖨️ Print / Save PDF
            </button>
          </div>

          <div id="ledger-print-area">
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '2px solid #0f4c81' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '8px' }}>
                {businessSettings.business_logo && (
                  <img src={businessSettings.business_logo} alt="logo"
                    style={{ width: '60px', height: '60px', objectFit: 'contain', borderRadius: '8px' }} />
                )}
                <div>
                  <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f4c81', margin: '0 0 4px' }}>
                    {businessSettings.business_name || 'Spring Water Kamoke'}
                  </h1>
                  <p style={{ fontSize: '13px', color: '#555', margin: '0 0 2px' }}>{businessSettings.business_tagline || 'Pure Water Delivery'}</p>
                  {businessSettings.business_address && <p style={{ fontSize: '12px', color: '#888', margin: '0 0 2px' }}>📍 {businessSettings.business_address}</p>}
                  {businessSettings.complaint_number && <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>📞 {businessSettings.complaint_number}</p>}
                </div>
              </div>
              <div style={{ marginTop: '10px', padding: '6px 16px', background: '#f0f4ff', borderRadius: '6px', display: 'inline-block' }}>
                <p style={{ fontSize: '14px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>CUSTOMER ACCOUNT LEDGER</p>
              </div>
            </div>

            {/* Customer Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px', background: '#f8f9fa', borderRadius: '10px', padding: '14px 16px' }}>
              <div>
                <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>Customer Name</p>
                <p style={{ fontSize: '15px', fontWeight: '700', color: '#333', margin: '0 0 8px' }}>{selectedCustomer.full_name}</p>
                <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>Customer ID</p>
                <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: '0 0 8px' }}>{selectedCustomer.customer_code}</p>
                <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>Mobile</p>
                <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: 0 }}>{selectedCustomer.mobile}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>Print Date</p>
                <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: '0 0 8px' }}>{printDate}</p>
                <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>Rate — 19L</p>
                <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: '0 0 8px' }}>Rs. {selectedCustomer.rate_19l || 100} per bottle</p>
                <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>Current Balance</p>
                <p style={{ fontSize: '20px', fontWeight: '700', margin: 0, color: Number(selectedCustomer.balance) > 0 ? '#f44336' : '#1a7a4a' }}>
                  Rs. {Math.abs(Number(selectedCustomer.balance)).toLocaleString()}
                  {Number(selectedCustomer.balance) < 0 ? ' (Advance)' : ''}
                </p>
              </div>
            </div>

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              {[
                { label: 'Opening Balance', value: openingBal, color: openingBal > 0 ? '#f44336' : '#1a7a4a' },
                { label: 'Total Sales / Debit', value: totalDebit, color: '#f44336' },
                { label: 'Total Payments / Credit', value: totalCredit, color: '#1a7a4a' },
                { label: 'Net Outstanding', value: Number(selectedCustomer.balance), color: Number(selectedCustomer.balance) > 0 ? '#f44336' : '#1a7a4a' },
              ].map(card => (
                <div key={card.label} style={{ background: 'white', borderRadius: '8px', padding: '12px', textAlign: 'center', border: '1px solid #eee' }}>
                  <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>{card.label}</p>
                  <p style={{ fontSize: '15px', fontWeight: '700', color: card.color, margin: 0 }}>Rs. {Math.abs(Number(card.value)).toLocaleString()}</p>
                </div>
              ))}
            </div>

            {/* Ledger Table */}
            {loading ? (
              <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>
            ) : ledger.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>No transactions found.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#0f4c81', color: 'white' }}>
                    {['#', 'Date', 'Description', 'Debit (Rs.)', 'Credit (Rs.)', 'Balance (Rs.)'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', fontWeight: '600' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Opening Balance Row */}
                  <tr style={{ background: '#e3f0ff' }}>
                    <td style={{ padding: '8px 12px', fontSize: '11px', color: '#555' }}>—</td>
                    <td style={{ padding: '8px 12px', fontSize: '11px', color: '#555' }}>—</td>
                    <td style={{ padding: '8px 12px', fontSize: '12px', fontWeight: '700', color: '#0f4c81' }}>Opening Balance</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>—</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>—</td>
                    <td style={{ padding: '8px 12px', fontSize: '12px', fontWeight: '700', textAlign: 'right', color: openingBal > 0 ? '#f44336' : '#1a7a4a' }}>
                      {openingBal.toLocaleString()}
                    </td>
                  </tr>
                  {ledger.map((e, idx) => (
                    <tr key={idx} style={{ background: idx % 2 === 0 ? 'white' : '#fafafa', borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '8px 12px', fontSize: '11px', color: '#888' }}>{idx + 1}</td>
                      <td style={{ padding: '8px 12px', fontSize: '11px', color: '#555', whiteSpace: 'nowrap' }}>
                        {new Date(e.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: '12px', color: '#333' }}>
                        {e.description}
                        {e.credit_amount > 0 && (
                          <span style={{ fontSize: '10px', color: '#f44336', display: 'block' }}>
                            Credit portion: Rs. {e.credit_amount.toLocaleString()}
                          </span>
                        )}
                        {e.pendingAmount > 0 && (
                          <span style={{ fontSize: '10px', color: '#e65100', display: 'block' }}>
                            Pending confirmation: Rs. {e.pendingAmount.toLocaleString()}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: '12px', fontWeight: '600', color: e.debit > 0 ? '#f44336' : '#aaa', textAlign: 'right' }}>
                        {e.debit > 0 ? e.debit.toLocaleString() : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: '12px', fontWeight: '600', color: e.credit > 0 ? '#1a7a4a' : '#aaa', textAlign: 'right' }}>
                        {e.credit > 0 ? e.credit.toLocaleString() : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: '12px', fontWeight: '700', textAlign: 'right', color: e.runningBalance > 0 ? '#f44336' : '#1a7a4a' }}>
                        {e.runningBalance.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#0f4c81', color: 'white' }}>
                    <td colSpan={3} style={{ padding: '10px 12px', fontSize: '13px', fontWeight: '700' }}>TOTAL</td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: '700', textAlign: 'right' }}>{totalDebit.toLocaleString()}</td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: '700', textAlign: 'right' }}>{totalCredit.toLocaleString()}</td>
                    <td style={{ padding: '10px 12px', fontSize: '14px', fontWeight: '700', textAlign: 'right', color: ledger.length > 0 ? (ledger[ledger.length-1].runningBalance > 0 ? '#ffcdd2' : '#c8e6c9') : 'white' }}>
  {ledger.length > 0 ? Math.abs(ledger[ledger.length-1].runningBalance).toLocaleString() : Math.abs(Number(selectedCustomer.balance)).toLocaleString()}
</td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* Footer */}
            <div style={{ marginTop: '30px', paddingTop: '16px', borderTop: '1px solid #ddd', textAlign: 'center' }}>
              <p style={{ fontSize: '12px', color: '#555', margin: '0 0 6px', fontStyle: 'italic' }}>
                This is a computer generated report and does not require any signature or stamp.
              </p>
              <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>
                Generated by AquaRun — {businessSettings.business_name || 'Spring Water Kamoke'} — {printDate}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── RECEIVABLES AGEING ────────────────────────────────────────────
function ReceivablesAgeing() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchAgeing() }, [])

  async function fetchAgeing() {
    setLoading(true)
    const { data } = await supabase.from('customers')
      .select('*').eq('is_active', true).gt('balance', 0)
      .order('balance', { ascending: false })

    const today = new Date()
    const customersWithAge = await Promise.all((data || []).map(async c => {
      const { data: lastDelivery } = await supabase.from('deliveries')
        .select('delivered_at').eq('customer_id', c.id).eq('is_voided', false)
        .order('delivered_at', { ascending: false }).limit(1).single()

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

  const filtered = customers.filter(c =>
    !search || c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.mobile?.includes(search) || c.customer_code?.includes(search)
  )

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
                <p style={{ fontSize: '11px', color, margin: 0 }}>{c.daysPending === 999 ? 'No deliveries' : `${c.daysPending} days`}</p>
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
      {loading ? (
        <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>
      ) : (
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
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search customer..."
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
function SalesSummary() {
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 7) + '-01')
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchSales() }, [dateFrom, dateTo])

  async function fetchSales() {
    setLoading(true)
    const { data: deliveries } = await supabase.from('deliveries')
      .select('*, riders(full_name)')
      .gte('delivered_at', dateFrom + 'T00:00:00')
      .lte('delivered_at', dateTo + 'T23:59:59')
      .eq('is_voided', false)

    let total19l = 0, totalHalf = 0, total15l = 0
    let totalCash = 0, totalJazz = 0, totalCredit = 0, totalSales = 0
    const riderSales = {}

    deliveries?.forEach(d => {
      total19l += Number(d.qty_19l || 0)
      totalHalf += Number(d.qty_half_litre || 0)
      total15l += Number(d.qty_1_5l || 0)
      totalSales += Number(d.total_amount)
      if (d.payment_method === 'cash') totalCash += Number(d.amount_received)
      if (d.payment_method === 'jazzcash') totalJazz += Number(d.total_amount)
      if (d.payment_method === 'credit') totalCredit += Number(d.total_amount)
      const name = d.riders?.full_name || 'Walk-in'
      if (!riderSales[name]) riderSales[name] = { sales: 0, bottles19l: 0, bottlesHalf: 0, bottles15l: 0 }
      riderSales[name].sales += Number(d.total_amount)
      riderSales[name].bottles19l += Number(d.qty_19l || 0)
      riderSales[name].bottlesHalf += Number(d.qty_half_litre || 0)
      riderSales[name].bottles15l += Number(d.qty_1_5l || 0)
    })

    setData({ total19l, totalHalf, total15l, totalCash, totalJazz, totalCredit, totalSales, riderSales, count: deliveries?.length || 0 })
    setLoading(false)
  }

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>📊 Sales Summary</h3>
      <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
        <button onClick={fetchSales}
          style={{ padding: '8px 16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
          🔄 Refresh
        </button>
      </div>
      {loading ? (
        <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>
      ) : data && (
        <div>
          <div style={{ background: 'linear-gradient(135deg, #0f4c81, #1a7a4a)', color: 'white', borderRadius: '12px', padding: '20px', marginBottom: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: '13px', opacity: 0.8, margin: '0 0 8px' }}>Total Sales Value</p>
            <p style={{ fontSize: '40px', fontWeight: '700', margin: '0 0 4px' }}>Rs. {data.totalSales.toLocaleString()}</p>
            <p style={{ fontSize: '12px', opacity: 0.7, margin: 0 }}>{data.count} deliveries in this period</p>
          </div>
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>🍶 Bottles Sold</p>
            {[
              { label: '19 Litre Bottles', value: data.total19l, unit: 'bottles' },
              { label: 'Half Litre Bottles', value: data.totalHalf, unit: 'bottles' },
              { label: '1.5 Litre Bottles', value: data.total15l, unit: 'bottles' },
              { label: 'Total Bottles', value: data.total19l + data.totalHalf + data.total15l, unit: 'bottles', bold: true },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ fontSize: '13px', color: '#555', fontWeight: r.bold ? '700' : '400' }}>{r.label}</span>
                <span style={{ fontSize: '13px', fontWeight: '700', color: r.bold ? '#0f4c81' : '#333' }}>{r.value.toLocaleString()} {r.unit}</span>
              </div>
            ))}
          </div>
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>💳 Payment Breakdown</p>
            {[
              { label: '💵 Cash', value: data.totalCash, color: '#1a7a4a' },
              { label: '📱 JazzCash', value: data.totalJazz, color: '#9c27b0' },
              { label: '📋 Credit', value: data.totalCredit, color: '#f44336' },
              { label: 'Total', value: data.totalSales, color: '#0f4c81', bold: true },
            ].map(r => (
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
function ProfitLoss() {
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 7) + '-01')
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchPL() }, [dateFrom, dateTo])

  async function fetchPL() {
    setLoading(true)
    const { data: deliveries } = await supabase.from('deliveries')
      .select('total_amount, qty_19l, qty_half_litre, qty_1_5l, payment_method, amount_received')
      .gte('delivered_at', dateFrom + 'T00:00:00')
      .lte('delivered_at', dateTo + 'T23:59:59')
      .eq('is_voided', false)

    const totalRevenue = deliveries?.reduce((s, d) => s + Number(d.total_amount), 0) || 0

    const { data: productions } = await supabase.from('production_entries')
      .select('total_overhead')
      .gte('production_date', dateFrom).lte('production_date', dateTo)
    const totalProductionOverhead = productions?.reduce((s, p) => s + Number(p.total_overhead), 0) || 0

    const { data: purchases } = await supabase.from('stock_purchases')
      .select('total_cost')
      .gte('purchase_date', dateFrom).lte('purchase_date', dateTo)
    const totalPurchaseCost = purchases?.reduce((s, p) => s + Number(p.total_cost), 0) || 0

    const grossProfit = totalRevenue - totalProductionOverhead - totalPurchaseCost

    const { data: riderExpenses } = await supabase.from('expenses')
      .select('amount').eq('is_voided', false)
      .gte('expense_date', dateFrom).lte('expense_date', dateTo)
    const totalRiderExpenses = riderExpenses?.reduce((s, e) => s + Number(e.amount), 0) || 0

    const { data: officeExpenses } = await supabase.from('office_expenses')
      .select('amount').eq('is_voided', false)
      .gte('expense_date', dateFrom).lte('expense_date', dateTo)
    const totalOfficeExpenses = officeExpenses?.reduce((s, e) => s + Number(e.amount), 0) || 0

    const { data: salaryPayments } = await supabase.from('salary_payments')
      .select('amount_paid')
      .gte('created_at', dateFrom + 'T00:00:00').lte('created_at', dateTo + 'T23:59:59')
    const totalSalaries = salaryPayments?.reduce((s, p) => s + Number(p.amount_paid), 0) || 0

    const totalOperatingExpenses = totalRiderExpenses + totalOfficeExpenses + totalSalaries
    const netProfit = grossProfit - totalOperatingExpenses

    setData({
      totalRevenue, totalProductionOverhead, totalPurchaseCost, grossProfit,
      totalRiderExpenses, totalOfficeExpenses, totalSalaries,
      totalOperatingExpenses, netProfit, deliveriesCount: deliveries?.length || 0
    })
    setLoading(false)
  }

  function PLRow({ label, value, color, bold, indent, separator }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: separator ? '2px solid #eee' : '1px solid #f0f0f0', marginTop: separator ? '4px' : '0' }}>
        <span style={{ fontSize: '13px', color: color || '#555', fontWeight: bold ? '700' : '400', paddingLeft: indent ? '16px' : '0' }}>{label}</span>
        <span style={{ fontSize: bold ? '15px' : '13px', fontWeight: '700', color: color || (value < 0 ? '#f44336' : '#333') }}>
          {value < 0 ? '− ' : ''}Rs. {Math.abs(value).toLocaleString()}
        </span>
      </div>
    )
  }

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>📈 Profit & Loss Statement</h3>
      <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
        <button onClick={fetchPL}
          style={{ padding: '8px 16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
          🔄 Refresh
        </button>
      </div>
      {loading ? (
        <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>
      ) : data && (
        <div>
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
            <p style={{ fontSize: '14px', fontWeight: '700', color: '#0f4c81', marginBottom: '12px', paddingBottom: '8px', borderBottom: '2px solid #e3f0ff' }}>REVENUE</p>
            <PLRow label="Sales Revenue" value={data.totalRevenue} color="#1a7a4a" indent />
            <PLRow label="Total Revenue" value={data.totalRevenue} color="#1a7a4a" bold separator />
            <p style={{ fontSize: '14px', fontWeight: '700', color: '#f44336', margin: '16px 0 12px', paddingBottom: '8px', borderBottom: '2px solid #ffebee' }}>COST OF GOODS</p>
            <PLRow label="Raw Material Purchases" value={data.totalPurchaseCost} color="#f44336" indent />
            <PLRow label="Production Overhead" value={data.totalProductionOverhead} color="#f44336" indent />
            <PLRow label="Total Cost of Goods" value={data.totalPurchaseCost + data.totalProductionOverhead} color="#f44336" bold separator />
            <PLRow label="GROSS PROFIT" value={data.grossProfit} color={data.grossProfit >= 0 ? '#1a7a4a' : '#f44336'} bold separator />
            <p style={{ fontSize: '14px', fontWeight: '700', color: '#e65100', margin: '16px 0 12px', paddingBottom: '8px', borderBottom: '2px solid #fff3e0' }}>OPERATING EXPENSES</p>
            <PLRow label="Rider Field Expenses" value={data.totalRiderExpenses} color="#e65100" indent />
            <PLRow label="Office Expenses" value={data.totalOfficeExpenses} color="#e65100" indent />
            <PLRow label="Rider Salaries Paid" value={data.totalSalaries} color="#e65100" indent />
            <PLRow label="Total Operating Expenses" value={data.totalOperatingExpenses} color="#e65100" bold separator />
          </div>
          <div style={{
            background: data.netProfit >= 0 ? 'linear-gradient(135deg, #0f4c81, #1a7a4a)' : 'linear-gradient(135deg, #c62828, #e65100)',
            color: 'white', borderRadius: '12px', padding: '24px', textAlign: 'center'
          }}>
            <p style={{ fontSize: '14px', opacity: 0.8, margin: '0 0 8px' }}>NET PROFIT / (LOSS)</p>
            <p style={{ fontSize: '44px', fontWeight: '700', margin: '0 0 6px' }}>
              {data.netProfit < 0 ? '−' : ''} Rs. {Math.abs(data.netProfit).toLocaleString()}
            </p>
            <p style={{ fontSize: '12px', opacity: 0.7, margin: 0 }}>
              Revenue Rs. {data.totalRevenue.toLocaleString()} − COGS Rs. {(data.totalPurchaseCost + data.totalProductionOverhead).toLocaleString()} − Expenses Rs. {data.totalOperatingExpenses.toLocaleString()}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}