import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import * as AccountingEngine from '../accountingEngine'
import OfficeExpenses from './OfficeExpenses'

const PAYMENT_METHODS = [
  { key: 'cash',      label: 'Cash',      icon: '💵' },
  { key: 'jazzcash',  label: 'JazzCash',  icon: '📱' },
  { key: 'easypaisa', label: 'EasyPaisa', icon: '💚' },
  { key: 'bank',      label: 'Bank',      icon: '🏦' },
]

const fmt = n => Number(n || 0).toLocaleString()

function StatusBadge({ remaining, totalPaid }) {
  const isPaid    = remaining <= 0 && totalPaid > 0
  const isPartial = totalPaid > 0 && remaining > 0
  const isUnpaid  = totalPaid === 0
  return (
    <span style={{
      padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: isPaid ? '#e8f5e9' : isPartial ? '#fff8e1' : '#ffebee',
      color:      isPaid ? '#1a7a4a' : isPartial ? '#b45309' : '#c62828',
    }}>
      {isPaid ? '✅ Fully Paid' : isPartial ? '⚠️ Partial' : '❌ Unpaid'}
    </span>
  )
}

export default function SalaryManagement({ adminUser, tenantId }) {
  const [riders,          setRiders]          = useState([])
  const [riderSummaries,  setRiderSummaries]  = useState([])
  const [advances,        setAdvances]        = useState([])
  const [salaryPayments,  setSalaryPayments]  = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [loading,         setLoading]         = useState(true)
  const [processing,      setProcessing]      = useState(null)
  const [activeTab,       setActiveTab]       = useState('overview')
  const [selectedMonth,   setSelectedMonth]   = useState(new Date().toISOString().slice(0, 7))

  // Pay form state
  const [payingRider, setPayingRider] = useState(null)
  const [payType,     setPayType]     = useState(null)
  const [payAmount,   setPayAmount]   = useState('')
  const [payNote,     setPayNote]     = useState('')
  const [payMethod,   setPayMethod]   = useState('cash')
  const [payDate,     setPayDate]     = useState(new Date().toISOString().split('T')[0])
  const [saving,      setSaving]      = useState(false)

  useEffect(() => { if (tenantId) fetchData() }, [selectedMonth, tenantId])

  async function fetchData() {
    setLoading(true)
    try {
      const { data: ridersData } = await supabase.from('riders')
        .select('*').eq('tenant_id', tenantId).eq('is_active', true).order('created_at')
      setRiders(ridersData || [])

      const { data: advancesData } = await supabase.from('salary_advances')
        .select('*, rider:rider_id(full_name, monthly_salary, salary_type)')
        .eq('tenant_id', tenantId).eq('month_year', selectedMonth)
        .order('created_at', { ascending: false })
      setAdvances(advancesData || [])

      const { data: pendingData } = await supabase.from('salary_advances')
        .select('*, rider:rider_id(full_name, monthly_salary, salary_type)')
        .eq('tenant_id', tenantId).eq('requested_from', 'ceo').eq('status', 'pending')
        .order('created_at', { ascending: false })
      setPendingRequests(pendingData || [])

      // ── Key fix: filter by month_year not payment_date ──
      const { data: allSalaryPaid } = await supabase.from('salary_payments')
        .select('rider_id, amount_paid, payment_date, payment_method, month_year')
        .eq('tenant_id', tenantId).eq('month_year', selectedMonth)
      setSalaryPayments(allSalaryPaid || [])

      const monthStart = selectedMonth + '-01'
      const nextMonth  = new Date(new Date(monthStart).setMonth(new Date(monthStart).getMonth() + 1)).toISOString().split('T')[0]

      const summaries = []
      for (const r of ridersData || []) {
        const riderAdvances  = advancesData?.filter(a => a.rider_id === r.id && a.status === 'approved') || []
        const totalAdvances  = riderAdvances.reduce((s, a) => s + Number(a.amount), 0)
        const totalPaid      = allSalaryPaid?.filter(p => p.rider_id === r.id).reduce((s, p) => s + Number(p.amount_paid), 0) || 0
        const riderPayHistory = allSalaryPaid?.filter(p => p.rider_id === r.id) || []

        let fixedPart = 0, commissionPart = 0, commissionBreakdown = null
        const isCommission = r.salary_type === 'commission' || r.salary_type === 'fixed_commission'
        const isFixed      = r.salary_type === 'fixed' || r.salary_type === 'fixed_commission'
        if (isFixed) fixedPart = Number(r.monthly_salary || 0)

        if (isCommission) {
          const { data: deliveries } = await supabase.from('deliveries')
            .select('qty_19l, qty_half_litre, qty_1_5l').eq('rider_id', r.id)
            .eq('tenant_id', tenantId).eq('is_voided', false)
            .gte('delivered_at', monthStart + 'T00:00:00').lt('delivered_at', nextMonth + 'T00:00:00')

          let total19l = 0, totalHalf = 0, total15l = 0
          deliveries?.forEach(d => {
            total19l  += Number(d.qty_19l          || 0)
            totalHalf += Number(d.qty_half_litre   || 0)
            total15l  += Number(d.qty_1_5l         || 0)
          })
          const commission19l  = total19l  * Number(r.commission_19l        || 0)
          const commissionHalf = totalHalf * Number(r.commission_half_litre || 0)
          const commission15l  = total15l  * Number(r.commission_1_5l       || 0)
          commissionPart       = commission19l + commissionHalf + commission15l
          commissionBreakdown  = { total19l, totalHalf, total15l, commission19l, commissionHalf, commission15l, rate19l: r.commission_19l, rateHalf: r.commission_half_litre, rate15l: r.commission_1_5l }
        }

        const baseSalary = fixedPart + commissionPart
        const remaining  = baseSalary - totalAdvances - totalPaid
        summaries.push({ ...r, baseSalary, fixedPart, commissionPart, totalAdvances, totalPaid, remaining, advances: riderAdvances, commissionBreakdown, payHistory: riderPayHistory })
      }
      setRiderSummaries(summaries)
    } catch (err) {
      console.error('SalaryManagement fetchData error:', err)
      alert('Error loading salary data: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  function openPayForm(rider, type) {
    setPayingRider(rider)
    setPayType(type)
    setPayMethod('cash')
    setPayNote('')
    setPayDate(new Date().toISOString().split('T')[0])
    const summary = riderSummaries.find(r => r.id === rider.id)
    setPayAmount(type === 'salary' ? String(Math.max(0, summary?.remaining || 0)) : '')
  }

  function closePayForm() {
    setPayingRider(null); setPayType(null); setPayAmount(''); setPayNote('')
    setPayMethod('cash'); setPayDate(new Date().toISOString().split('T')[0])
  }

  async function approveRequest(request) {
    setProcessing(request.id)
    const { data: approved, error } = await supabase.from('salary_advances')
      .update({ status: 'approved', approved_by: 'Admin/CEO', approved_at: new Date().toISOString() })
      .eq('id', request.id).eq('tenant_id', tenantId).select().single()
    if (error) { alert('Error: ' + error.message); setProcessing(null); return }
    try { await AccountingEngine.postSalaryAdvanceJournal(approved, tenantId) } catch (err) { console.error(err) }
    fetchData(); setProcessing(null)
  }

  async function rejectRequest(request) {
    setProcessing(request.id)
    await supabase.from('salary_advances').update({ status: 'rejected', approved_by: 'Admin/CEO' }).eq('id', request.id).eq('tenant_id', tenantId)
    fetchData(); setProcessing(null)
  }

  async function processPayment() {
    if (!payAmount || Number(payAmount) <= 0) return alert('Please enter amount')
    setSaving(true)
    const summary = riderSummaries.find(r => r.id === payingRider.id)

    if (payType === 'advance') {
      const { data: advance, error } = await supabase.from('salary_advances').insert([{
        tenant_id: tenantId, rider_id: payingRider.id, requested_from: 'ceo',
        amount: Number(payAmount), status: 'approved', month_year: selectedMonth,
        approved_by: 'Admin/CEO', approved_at: new Date().toISOString(),
        notes: payNote || 'Direct advance by admin', payment_method: payMethod
      }]).select().single()
      if (error) { alert('Error: ' + error.message); setSaving(false); return }
      try { await AccountingEngine.postSalaryAdvanceJournal(advance, tenantId) } catch (err) { console.error(err) }
      alert(`✅ Advance paid to ${payingRider.full_name}\nAmount: Rs. ${Number(payAmount).toLocaleString()}\nVia: ${payMethod}`)
    } else {
      const { data: savedPayment, error } = await supabase.from('salary_payments').insert([{
        tenant_id: tenantId, rider_id: payingRider.id, paid_by: 'ceo',
        month_year: selectedMonth, monthly_salary: summary?.baseSalary || 0,
        total_advances: summary?.totalAdvances || 0, amount_paid: Number(payAmount),
        payment_method: payMethod, notes: payNote, payment_date: payDate
      }]).select().single()
      if (error) { alert('Error: ' + error.message); setSaving(false); return }
      try { await AccountingEngine.postSalaryPaymentJournal(savedPayment, tenantId) } catch (err) { console.error(err) }
      alert(`✅ Salary paid to ${payingRider.full_name}\nAmount: Rs. ${Number(payAmount).toLocaleString()}\nVia: ${payMethod}`)
    }
    closePayForm(); setSaving(false); fetchData()
  }

  const monthLabel = new Date(selectedMonth + '-01').toLocaleDateString('en-PK', { month: 'long', year: 'numeric' })
  const tabs = [
    { key: 'overview',  label: '📊 Overview' },
    { key: 'pending',   label: `📋 Pending${pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}` },
    { key: 'expenses',  label: '🏢 Office Expenses' },
  ]

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <p style={{ fontSize: 32, margin: '0 0 12px' }}>💼</p>
      <p style={{ color: '#888', fontSize: 14 }}>Loading salary data...</p>
    </div>
  )

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Page Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1a1a2e', margin: '0 0 4px' }}>💼 Salary & Expenses</h2>
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>Manage rider salaries, advances and office expenses.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, background: 'white', padding: 5, borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            flex: 1, padding: '9px 8px', border: 'none', borderRadius: 7, cursor: 'pointer',
            background: activeTab === t.key ? '#0f4c81' : 'transparent',
            color: activeTab === t.key ? 'white' : '#666',
            fontWeight: activeTab === t.key ? 700 : 500, fontSize: 13,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ══ OVERVIEW ══ */}
      {activeTab === 'overview' && (
        <div>
          {/* Month selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <label style={{ fontSize: 13, color: '#555', fontWeight: 700 }}>📅 Month:</label>
            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              style={{ padding: '8px 14px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 14, outline: 'none', color: '#333' }} />
            <span style={{ fontSize: 13, color: '#888' }}>{monthLabel}</span>
          </div>

          {riderSummaries.map(r => (
            <div key={r.id} style={{
              background: 'white', borderRadius: 12, padding: '18px 20px', marginBottom: 14,
              boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
              border: r.is_main_rider ? '2px solid #ffe082' : '1px solid #eee',
            }}>
              {/* Rider header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <p style={{ fontSize: 16, fontWeight: 800, color: '#1a1a2e', margin: 0 }}>
                      {r.is_main_rider ? '⭐ ' : '🚴 '}{r.full_name}
                    </p>
                    <StatusBadge remaining={r.remaining} totalPaid={r.totalPaid} />
                  </div>
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    background: r.salary_type === 'commission' ? '#e8f5e9' : r.salary_type === 'fixed_commission' ? '#e3f0ff' : '#f3e5f5',
                    color: r.salary_type === 'commission' ? '#1a7a4a' : r.salary_type === 'fixed_commission' ? '#0f4c81' : '#7b1fa2',
                  }}>
                    {r.salary_type === 'commission' ? '📦 Commission' : r.salary_type === 'fixed_commission' ? '💰+📦 Fixed + Commission' : '💰 Fixed Salary'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => openPayForm(r, 'advance')}
                    style={{ padding: '8px 14px', background: '#fff3e0', color: '#e65100', border: '1.5px solid #ffcc80', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                    💰 Advance
                  </button>
                  <button onClick={() => openPayForm(r, 'salary')}
                    disabled={r.remaining <= 0}
                    style={{
                      padding: '8px 14px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      background: r.remaining <= 0 ? '#e0e0e0' : '#1a7a4a',
                      color: r.remaining <= 0 ? '#aaa' : 'white',
                      cursor: r.remaining <= 0 ? 'not-allowed' : 'pointer',
                    }}>
                    {r.remaining <= 0 ? '✅ Paid' : '💵 Pay Salary'}
                  </button>
                </div>
              </div>

              {/* Commission Breakdown */}
              {(r.salary_type === 'fixed_commission' || r.salary_type === 'commission') && r.commissionBreakdown && (
                <div style={{ background: '#f8f9fa', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#555', margin: '0 0 8px' }}>
                    {r.salary_type === 'fixed_commission' ? 'Salary Breakdown' : 'Commission Breakdown'}
                  </p>
                  {r.salary_type === 'fixed_commission' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #eee', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>Fixed Monthly Salary</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0f4c81' }}>Rs. {fmt(r.fixedPart)}</span>
                    </div>
                  )}
                  {r.commissionBreakdown.rate19l > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span style={{ fontSize: 12, color: '#888' }}>19L × {r.commissionBreakdown.total19l} × Rs. {r.commissionBreakdown.rate19l}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#1a7a4a' }}>Rs. {fmt(r.commissionBreakdown.commission19l)}</span>
                    </div>
                  )}
                  {r.commissionBreakdown.rateHalf > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span style={{ fontSize: 12, color: '#888' }}>Half × {r.commissionBreakdown.totalHalf} × Rs. {r.commissionBreakdown.rateHalf}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#1a7a4a' }}>Rs. {fmt(r.commissionBreakdown.commissionHalf)}</span>
                    </div>
                  )}
                  {r.commissionBreakdown.rate15l > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span style={{ fontSize: 12, color: '#888' }}>1.5L × {r.commissionBreakdown.total15l} × Rs. {r.commissionBreakdown.rate15l}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#1a7a4a' }}>Rs. {fmt(r.commissionBreakdown.commission15l)}</span>
                    </div>
                  )}
                  {r.salary_type === 'fixed_commission' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid #ddd', marginTop: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#333' }}>Total Earned</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#0f4c81' }}>Rs. {fmt(r.baseSalary)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
                {[
                  { label: r.salary_type === 'fixed' ? 'Monthly Salary' : 'Total Earned', value: r.baseSalary, color: '#0f4c81', bg: '#f0f7ff' },
                  { label: 'Advances Given',  value: r.totalAdvances, color: '#e65100', bg: '#fff3e0' },
                  { label: 'Salary Paid',     value: r.totalPaid,     color: '#1a7a4a', bg: '#e8f5e9' },
                  { label: 'Remaining',       value: r.remaining,     color: r.remaining >= 0 ? '#1a7a4a' : '#c62828', bg: r.remaining >= 0 ? '#e8f5e9' : '#ffebee' },
                ].map(card => (
                  <div key={card.label} style={{ textAlign: 'center', padding: '10px 8px', background: card.bg, borderRadius: 8 }}>
                    <p style={{ fontSize: 10, color: '#888', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.3 }}>{card.label}</p>
                    <p style={{ fontSize: 15, fontWeight: 800, color: card.color, margin: 0 }}>Rs. {fmt(card.value)}</p>
                  </div>
                ))}
              </div>

              {r.remaining < 0 && (
                <div style={{ background: '#fff3e0', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
                  <p style={{ fontSize: 12, color: '#e65100', margin: 0 }}>⚠️ Advances exceed earnings by Rs. {fmt(Math.abs(r.remaining))} — will carry forward to next month.</p>
                </div>
              )}

              {/* Payment History */}
              {r.payHistory?.length > 0 && (
                <div style={{ background: '#f0fff4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#1a7a4a', margin: '0 0 6px' }}>💵 Salary Payment History — {monthLabel}</p>
                  {r.payHistory.map((p, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: i < r.payHistory.length - 1 ? '1px solid #d1fae5' : 'none' }}>
                      <span style={{ fontSize: 12, color: '#555' }}>
                        {new Date(p.payment_date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {' — '}{p.payment_method || 'cash'}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#1a7a4a' }}>Rs. {fmt(p.amount_paid)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Advances Detail */}
              {r.advances.length > 0 && (
                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, marginBottom: 4 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 8 }}>Advances This Month</p>
                  {r.advances.map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span style={{ fontSize: 12, color: '#888' }}>
                        {new Date(a.created_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })}
                        {' — '}{a.requested_from === 'ceo' ? 'CEO' : 'Main Rider'}
                        {a.notes ? ` — ${a.notes}` : ''}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#e65100' }}>Rs. {fmt(a.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Pay Form */}
              {payingRider?.id === r.id && payType && (
                <div style={{ marginTop: 16, padding: 18, background: payType === 'advance' ? '#fff8f0' : '#f0f7ff', borderRadius: 10, border: `1.5px solid ${payType === 'advance' ? '#ffcc80' : '#c8e0ff'}` }}>
                  <p style={{ fontSize: 15, fontWeight: 800, color: payType === 'advance' ? '#e65100' : '#0f4c81', marginBottom: 4 }}>
                    {payType === 'advance' ? '💰 Give Advance to ' : '💵 Pay Salary to '}{r.full_name}
                  </p>
                  <p style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
                    {payType === 'advance'
                      ? 'Advance will be deducted from salary at month end'
                      : `Earned: Rs. ${fmt(r.baseSalary)} − Advances: Rs. ${fmt(r.totalAdvances)} = Remaining: Rs. ${fmt(r.remaining)}`}
                  </p>

                  {/* Payment Method */}
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 8 }}>Pay From</p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                    {PAYMENT_METHODS.map(m => (
                      <button key={m.key} onClick={() => setPayMethod(m.key)}
                        style={{ flex: 1, minWidth: 72, padding: '10px 6px', border: '2px solid', borderColor: payMethod === m.key ? '#0f4c81' : '#eee', borderRadius: 8, cursor: 'pointer', background: payMethod === m.key ? '#e3f0ff' : 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <span style={{ fontSize: 18 }}>{m.icon}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: payMethod === m.key ? '#0f4c81' : '#555' }}>{m.label}</span>
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 5, fontWeight: 700 }}>Amount (Rs.)</label>
                      <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                        style={{ width: '100%', padding: '10px', border: '1.5px solid #ddd', borderRadius: 8, fontSize: 20, fontWeight: 700, outline: 'none', boxSizing: 'border-box', textAlign: 'center' }} />
                    </div>
                    {payType === 'salary' && (
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 5, fontWeight: 700 }}>Payment Date</label>
                        <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                          max={new Date().toISOString().split('T')[0]}
                          style={{ width: '100%', padding: '10px', border: '1.5px solid #ddd', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', color: '#333' }} />
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 5, fontWeight: 700 }}>Note (optional)</label>
                    <input value={payNote} onChange={e => setPayNote(e.target.value)}
                      placeholder={payType === 'advance' ? 'Reason for advance...' : 'e.g. Month end payment'}
                      style={{ width: '100%', padding: '10px', border: '1.5px solid #ddd', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', color: '#333' }} />
                  </div>

                  {/* Journal Preview */}
                  <div style={{ background: 'white', borderRadius: 8, padding: '10px 12px', marginBottom: 14, border: '1px solid #e0e0e0', fontSize: 11, color: '#555', fontFamily: 'monospace' }}>
                    <p style={{ fontWeight: 700, margin: '0 0 5px', fontFamily: 'system-ui', fontSize: 11, color: '#0f4c81' }}>📖 Journal Entry Preview</p>
                    {payType === 'advance' ? (
                      <>
                        <p style={{ margin: '0 0 2px' }}>DR 1104 Salary Advances to Riders — Rs. {fmt(payAmount)}</p>
                        <p style={{ margin: 0 }}>CR {payMethod === 'cash' ? '1001 Cash in Hand' : payMethod === 'jazzcash' ? '1002 JazzCash Account' : payMethod === 'easypaisa' ? '1004 EasyPaisa Account' : '1003 Bank Account'} — Rs. {fmt(payAmount)}</p>
                      </>
                    ) : (
                      <>
                        <p style={{ margin: '0 0 2px' }}>1. DR 6001 Rider Salaries Rs. {fmt(r.baseSalary)} → CR 1104 Advances Rs. {fmt(r.totalAdvances)} + CR 2100 Payable Rs. {fmt(Math.max(0, r.remaining))}</p>
                        <p style={{ margin: 0 }}>2. DR 2100 Salary Payable Rs. {fmt(payAmount)} → CR {payMethod === 'cash' ? '1001 Cash' : payMethod === 'jazzcash' ? '1002 JazzCash' : payMethod === 'easypaisa' ? '1004 EasyPaisa' : '1003 Bank'}</p>
                      </>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={closePayForm}
                      style={{ flex: 1, padding: 12, background: '#f5f5f5', color: '#555', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                      Cancel
                    </button>
                    <button onClick={processPayment} disabled={saving}
                      style={{ flex: 2, padding: 12, background: saving ? '#e0e0e0' : payType === 'advance' ? '#e65100' : '#1a7a4a', color: saving ? '#aaa' : 'white', border: 'none', borderRadius: 8, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
                      {saving ? '⏳ Processing...' : payType === 'advance' ? '✓ Give Advance' : '✓ Confirm Salary Payment'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Total Summary */}
          <div style={{ background: 'linear-gradient(135deg, #1a1a2e, #0f3460)', borderRadius: 12, padding: '18px 20px' }}>
            <p style={{ color: '#93c5fd', fontSize: 12, margin: '0 0 14px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Total Summary — {monthLabel}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
              {[
                { label: 'Total Salary + Commission', value: riderSummaries.reduce((s, r) => s + r.baseSalary, 0),    color: '#60a5fa' },
                { label: 'Total Advances Given',      value: riderSummaries.reduce((s, r) => s + r.totalAdvances, 0), color: '#fde68a' },
                { label: 'Total Salary Paid',         value: riderSummaries.reduce((s, r) => s + r.totalPaid, 0),     color: '#6ee7b7' },
                { label: 'Total Remaining Payable',   value: riderSummaries.reduce((s, r) => s + Math.max(0, r.remaining), 0), color: '#fca5a5' },
              ].map(row => (
                <div key={row.label} style={{ textAlign: 'center', padding: '12px 10px', background: 'rgba(255,255,255,0.07)', borderRadius: 8 }}>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: 0.5 }}>{row.label}</p>
                  <p style={{ fontSize: 18, fontWeight: 800, color: row.color, margin: 0 }}>Rs. {fmt(row.value)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ PENDING REQUESTS ══ */}
      {activeTab === 'pending' && (
        <div>
          <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>Advance requests sent directly to CEO/Admin for approval.</p>
          {pendingRequests.length === 0 ? (
            <div style={{ background: 'white', borderRadius: 12, padding: 50, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: 40, margin: '0 0 12px' }}>✅</p>
              <p style={{ color: '#1a7a4a', fontWeight: 700, fontSize: 15 }}>No pending requests</p>
              <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>All advance requests have been processed</p>
            </div>
          ) : pendingRequests.map(r => (
            <div key={r.id} style={{ background: 'white', borderRadius: 12, padding: '18px 20px', marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #fff3e0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 800, color: '#1a1a2e', margin: '0 0 4px' }}>🚴 {r.rider?.full_name}</p>
                  <p style={{ fontSize: 12, color: '#888', margin: '0 0 2px' }}>
                    {new Date(r.created_at).toLocaleString('en-PK', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p style={{ fontSize: 12, color: '#555', margin: '0 0 2px' }}>Month: {r.month_year}</p>
                  {r.notes && <p style={{ fontSize: 12, color: '#555', margin: '4px 0 0', fontStyle: 'italic' }}>"{r.notes}"</p>}
                </div>
                <p style={{ fontSize: 26, fontWeight: 900, color: '#0f4c81', margin: 0 }}>Rs. {fmt(r.amount)}</p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => rejectRequest(r)} disabled={processing === r.id}
                  style={{ flex: 1, padding: '11px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  ✕ Reject
                </button>
                <button onClick={() => approveRequest(r)} disabled={processing === r.id}
                  style={{ flex: 2, padding: '11px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  {processing === r.id ? '⏳ Processing...' : '✓ Approve Advance'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══ OFFICE EXPENSES ══ */}
      {activeTab === 'expenses' && (
        <OfficeExpenses rider={adminUser} isCEO={true} tenantId={tenantId} />
      )}
    </div>
  )
}
