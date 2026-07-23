import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import OfficeExpenses from './OfficeExpenses'

const PAYMENT_METHODS = [
  { key: 'cash',     label: 'Cash',     icon: '💵' },
  { key: 'jazzcash', label: 'JazzCash', icon: '📱' },
  { key: 'bank',     label: 'Bank',     icon: '🏦' },
]

export default function SalaryManagement({ adminUser, tenantId }) {
  const [riders, setRiders] = useState([])
  const [riderSummaries, setRiderSummaries] = useState([])
  const [advances, setAdvances] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))

  // Pay form state
  const [payingRider, setPayingRider] = useState(null)
  const [payType, setPayType] = useState(null) // 'salary' | 'advance'
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)

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

      const monthStart = selectedMonth + '-01'
      const nextMonth = new Date(new Date(monthStart).setMonth(new Date(monthStart).getMonth() + 1)).toISOString().split('T')[0]

      const { data: allSalaryPaid } = await supabase.from('salary_payments')
        .select('rider_id, amount_paid').eq('tenant_id', tenantId)
        .gte('payment_date', monthStart).lt('payment_date', nextMonth)

      const summaries = []
      for (const r of ridersData || []) {
        const riderAdvances = advancesData?.filter(a => a.rider_id === r.id && a.status === 'approved') || []
        const totalAdvances = riderAdvances.reduce((s, a) => s + Number(a.amount), 0)
        const totalPaid = allSalaryPaid?.filter(p => p.rider_id === r.id).reduce((s, p) => s + Number(p.amount_paid), 0) || 0

        let fixedPart = 0, commissionPart = 0, commissionBreakdown = null
        const isCommission = r.salary_type === 'commission' || r.salary_type === 'fixed_commission'
        const isFixed = r.salary_type === 'fixed' || r.salary_type === 'fixed_commission'
        if (isFixed) fixedPart = Number(r.monthly_salary || 0)

        if (isCommission) {
          const { data: deliveries } = await supabase.from('deliveries')
            .select('qty_19l, qty_half_litre, qty_1_5l').eq('rider_id', r.id)
            .eq('tenant_id', tenantId).eq('is_voided', false)
            .gte('delivered_at', monthStart + 'T00:00:00').lt('delivered_at', nextMonth + 'T00:00:00')

          let total19l = 0, totalHalf = 0, total15l = 0
          deliveries?.forEach(d => {
            total19l += Number(d.qty_19l || 0)
            totalHalf += Number(d.qty_half_litre || 0)
            total15l += Number(d.qty_1_5l || 0)
          })
          const commission19l = total19l * Number(r.commission_19l || 0)
          const commissionHalf = totalHalf * Number(r.commission_half_litre || 0)
          const commission15l = total15l * Number(r.commission_1_5l || 0)
          commissionPart = commission19l + commissionHalf + commission15l
          commissionBreakdown = { total19l, totalHalf, total15l, commission19l, commissionHalf, commission15l, rate19l: r.commission_19l, rateHalf: r.commission_half_litre, rate15l: r.commission_1_5l }
        }

        const baseSalary = fixedPart + commissionPart
        const remaining = baseSalary - totalAdvances - totalPaid
        summaries.push({ ...r, baseSalary, fixedPart, commissionPart, totalAdvances, totalPaid, remaining, advances: riderAdvances, commissionBreakdown })
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
    if (type === 'salary') {
      setPayAmount(String(Math.max(0, summary?.remaining || 0)))
    } else {
      setPayAmount('')
    }
  }

  function closePayForm() {
    setPayingRider(null)
    setPayType(null)
    setPayAmount('')
    setPayNote('')
    setPayMethod('cash')
    setPayDate(new Date().toISOString().split('T')[0])
  }

  async function approveRequest(request) {
    setProcessing(request.id)
    const { data: approved, error } = await supabase.from('salary_advances')
      .update({ status: 'approved', approved_by: 'Admin/CEO', approved_at: new Date().toISOString() })
      .eq('id', request.id).eq('tenant_id', tenantId).select().single()
    if (error) { alert('Error: ' + error.message); setProcessing(null); return }
    try {
      const { postSalaryAdvanceJournal } = await import('../accountingEngine')
      await postSalaryAdvanceJournal(approved, tenantId)
    } catch (err) { console.error('Journal post error:', err) }
    fetchData()
    setProcessing(null)
  }

  async function rejectRequest(request) {
    setProcessing(request.id)
    await supabase.from('salary_advances')
      .update({ status: 'rejected', approved_by: 'Admin/CEO' })
      .eq('id', request.id).eq('tenant_id', tenantId)
    fetchData()
    setProcessing(null)
  }

  async function processPayment() {
    if (!payAmount || Number(payAmount) <= 0) return alert('Please enter amount')
    setSaving(true)
    const summary = riderSummaries.find(r => r.id === payingRider.id)

    if (payType === 'advance') {
      // Direct advance — same as approving an advance request
      const { data: advance, error } = await supabase.from('salary_advances').insert([{
        tenant_id: tenantId,
        rider_id: payingRider.id,
        requested_from: 'ceo',
        amount: Number(payAmount),
        status: 'approved',
        month_year: selectedMonth,
        approved_by: 'Admin/CEO',
        approved_at: new Date().toISOString(),
        notes: payNote || 'Direct advance by admin',
        payment_method: payMethod
      }]).select().single()
      if (error) { alert('Error: ' + error.message); setSaving(false); return }
      try {
        const { postSalaryAdvanceJournal } = await import('../accountingEngine')
        await postSalaryAdvanceJournal(advance, tenantId)
      } catch (err) { console.error('Journal post error:', err) }
      alert(`✅ Advance paid to ${payingRider.full_name}\nAmount: Rs. ${Number(payAmount).toLocaleString()}\nVia: ${payMethod}`)

    } else {
      // Regular salary payment
      const { data: savedPayment, error } = await supabase.from('salary_payments').insert([{
        tenant_id: tenantId,
        rider_id: payingRider.id,
        paid_by: 'ceo',
        month_year: selectedMonth,
        monthly_salary: summary?.baseSalary || 0,
        total_advances: summary?.totalAdvances || 0,
        amount_paid: Number(payAmount),
        payment_method: payMethod,
        notes: payNote,
        payment_date: payDate
      }]).select().single()
      if (error) { alert('Error: ' + error.message); setSaving(false); return }
      try {
        const { postSalaryPaymentJournal } = await import('../accountingEngine')
        await postSalaryPaymentJournal(savedPayment, tenantId)
      } catch (err) { console.error('Journal post error:', err) }
      alert(`✅ Salary paid to ${payingRider.full_name}\nAmount: Rs. ${Number(payAmount).toLocaleString()}\nVia: ${payMethod}`)
    }

    closePayForm()
    setSaving(false)
    fetchData()
  }

  const tabs = [
    { key: 'overview', label: '📊 Overview' },
    { key: 'pending', label: `📋 Pending${pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}` },
    { key: 'expenses', label: '🏢 Office Expenses' },
  ]

  if (loading) return <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>💼 Salary & Expenses</h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Manage rider salaries, advances and office expenses.</p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: activeTab === t.key ? '#0f4c81' : '#f0f0f0', color: activeTab === t.key ? 'white' : '#555', fontWeight: activeTab === t.key ? '700' : '400', fontSize: '13px' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {activeTab === 'overview' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <label style={{ fontSize: '13px', color: '#555', fontWeight: '600' }}>Month:</label>
            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none' }} />
          </div>

          {riderSummaries.map(r => (
            <div key={r.id} style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: r.is_main_rider ? '2px solid #ffe082' : '1px solid #eee' }}>

              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <p style={{ fontSize: '16px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>
                    {r.is_main_rider ? '⭐ ' : '🚴 '}{r.full_name}
                  </p>
                  <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
                    background: r.salary_type === 'commission' ? '#e8f5e9' : r.salary_type === 'fixed_commission' ? '#e3f0ff' : '#f3e5f5',
                    color: r.salary_type === 'commission' ? '#1a7a4a' : r.salary_type === 'fixed_commission' ? '#0f4c81' : '#7b1fa2'
                  }}>
                    {r.salary_type === 'commission' ? '📦 Commission Based' : r.salary_type === 'fixed_commission' ? '💰+📦 Fixed + Commission' : '💰 Fixed Salary'}
                  </span>
                </div>
                {/* Pay buttons */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => openPayForm(r, 'advance')}
                    style={{ padding: '7px 12px', background: '#fff3e0', color: '#e65100', border: '1px solid #ffcc80', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                    💰 Advance
                  </button>
                  <button onClick={() => openPayForm(r, 'salary')}
                    style={{ padding: '7px 12px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                    💵 Pay Salary
                  </button>
                </div>
              </div>

              {/* Commission Breakdown */}
              {(r.salary_type === 'fixed_commission' || r.salary_type === 'commission') && r.commissionBreakdown && (
                <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                  <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', margin: '0 0 8px' }}>
                    {r.salary_type === 'fixed_commission' ? 'Salary Breakdown' : 'Commission Breakdown'}
                  </p>
                  {r.salary_type === 'fixed_commission' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #eee', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', color: '#555', fontWeight: '600' }}>Fixed Monthly Salary</span>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#0f4c81' }}>Rs. {r.fixedPart.toLocaleString()}</span>
                    </div>
                  )}
                  {r.commissionBreakdown.rate19l > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span style={{ fontSize: '12px', color: '#888' }}>19L × {r.commissionBreakdown.total19l} × Rs. {r.commissionBreakdown.rate19l}</span>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#1a7a4a' }}>Rs. {r.commissionBreakdown.commission19l.toLocaleString()}</span>
                    </div>
                  )}
                  {r.commissionBreakdown.rateHalf > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span style={{ fontSize: '12px', color: '#888' }}>Half × {r.commissionBreakdown.totalHalf} × Rs. {r.commissionBreakdown.rateHalf}</span>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#1a7a4a' }}>Rs. {r.commissionBreakdown.commissionHalf.toLocaleString()}</span>
                    </div>
                  )}
                  {r.commissionBreakdown.rate15l > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span style={{ fontSize: '12px', color: '#888' }}>1.5L × {r.commissionBreakdown.total15l} × Rs. {r.commissionBreakdown.rate15l}</span>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#1a7a4a' }}>Rs. {r.commissionBreakdown.commission15l.toLocaleString()}</span>
                    </div>
                  )}
                  {r.salary_type === 'fixed_commission' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid #ddd', marginTop: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#333' }}>Fixed Rs. {r.fixedPart.toLocaleString()} + Commission Rs. {r.commissionPart.toLocaleString()}</span>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81' }}>= Rs. {r.baseSalary.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
                {[
                  { label: r.salary_type === 'fixed' ? 'Monthly Salary' : 'Total Earned', value: r.baseSalary, color: '#0f4c81', bg: '#f0f7ff' },
                  { label: 'Advances Given', value: r.totalAdvances, color: '#e65100', bg: '#fff3e0' },
                  { label: 'Salary Paid', value: r.totalPaid, color: '#1a7a4a', bg: '#e8f5e9' },
                  { label: 'Remaining', value: r.remaining, color: r.remaining >= 0 ? '#1a7a4a' : '#c62828', bg: r.remaining >= 0 ? '#e8f5e9' : '#ffebee' },
                ].map(card => (
                  <div key={card.label} style={{ textAlign: 'center', padding: '10px', background: card.bg, borderRadius: '8px' }}>
                    <p style={{ fontSize: '10px', color: '#888', margin: '0 0 4px' }}>{card.label}</p>
                    <p style={{ fontSize: '15px', fontWeight: '700', color: card.color, margin: 0 }}>Rs. {card.value.toLocaleString()}</p>
                  </div>
                ))}
              </div>

              {r.remaining < 0 && (
                <div style={{ background: '#fff3e0', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px' }}>
                  <p style={{ fontSize: '12px', color: '#e65100', margin: 0 }}>⚠️ Advances exceed earnings by Rs. {Math.abs(r.remaining).toLocaleString()} — will carry forward.</p>
                </div>
              )}

              {/* Advances Detail */}
              {r.advances.length > 0 && (
                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '12px' }}>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>Advances This Month</p>
                  {r.advances.map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span style={{ fontSize: '12px', color: '#888' }}>
                        {new Date(a.created_at).toLocaleDateString('en-PK')} — {a.requested_from === 'ceo' ? 'CEO' : 'Main Rider'}
                        {a.notes ? ` — ${a.notes}` : ''}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#e65100' }}>Rs. {Number(a.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Pay Form */}
              {payingRider?.id === r.id && payType && (
                <div style={{ marginTop: '14px', padding: '16px', background: payType === 'advance' ? '#fff8f0' : '#f0f7ff', borderRadius: '10px', border: `1px solid ${payType === 'advance' ? '#ffcc80' : '#c8e0ff'}` }}>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: payType === 'advance' ? '#e65100' : '#0f4c81', marginBottom: '4px' }}>
                    {payType === 'advance' ? '💰 Give Advance to ' : '💵 Pay Salary to '}{r.full_name}
                  </p>
                  <p style={{ fontSize: '12px', color: '#888', marginBottom: '14px' }}>
                    {payType === 'advance'
                      ? 'Advance will be recorded as asset and deducted from salary at month end'
                      : `Total earned: Rs. ${r.baseSalary.toLocaleString()} − Advances: Rs. ${r.totalAdvances.toLocaleString()} = Remaining: Rs. ${r.remaining.toLocaleString()}`}
                  </p>

                  {/* Payment Method */}
                  <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>Pay From</p>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    {PAYMENT_METHODS.map(m => (
                      <button key={m.key} onClick={() => setPayMethod(m.key)}
                        style={{ flex: 1, padding: '10px 6px', border: '2px solid', borderColor: payMethod === m.key ? '#0f4c81' : '#eee', borderRadius: '8px', cursor: 'pointer', background: payMethod === m.key ? '#e3f0ff' : 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                        <span style={{ fontSize: '18px' }}>{m.icon}</span>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: payMethod === m.key ? '#0f4c81' : '#555' }}>{m.label}</span>
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Amount (Rs.)</label>
                      <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '18px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }} />
                    </div>
                    {payType === 'salary' && (
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Payment Date</label>
                        <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                          max={new Date().toISOString().split('T')[0]}
                          style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', color: '#333' }} />
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Note (optional)</label>
                    <input value={payNote} onChange={e => setPayNote(e.target.value)}
                      placeholder={payType === 'advance' ? 'Reason for advance...' : 'e.g. Month end payment'}
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', color: '#333' }} />
                  </div>

                  {/* Journal preview */}
                  <div style={{ background: 'white', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px', border: '1px solid #eee', fontSize: '11px', color: '#555' }}>
                    {payType === 'advance' ? (
                      <>
                        <p style={{ fontWeight: '700', margin: '0 0 4px' }}>Journal Entry:</p>
                        <p style={{ margin: '0 0 2px' }}>DR 1104 Salary Advances to Riders — Rs. {Number(payAmount || 0).toLocaleString()}</p>
                        <p style={{ margin: 0 }}>CR {payMethod === 'cash' ? '1001 Cash' : payMethod === 'jazzcash' ? '1002 JazzCash' : '1003 Bank'} — Rs. {Number(payAmount || 0).toLocaleString()}</p>
                      </>
                    ) : (
                      <>
                        <p style={{ fontWeight: '700', margin: '0 0 4px' }}>Journal Entries:</p>
                        <p style={{ margin: '0 0 2px' }}>1. DR 6001 Rider Salaries Rs. {r.baseSalary.toLocaleString()} → CR 1104 Advances Rs. {r.totalAdvances.toLocaleString()} + CR 2100 Payable Rs. {Math.max(0, r.remaining).toLocaleString()}</p>
                        <p style={{ margin: 0 }}>2. DR 2100 Salary Payable Rs. {Number(payAmount || 0).toLocaleString()} → CR {payMethod === 'cash' ? '1001 Cash' : payMethod === 'jazzcash' ? '1002 JazzCash' : '1003 Bank'}</p>
                      </>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={closePayForm}
                      style={{ flex: 1, padding: '10px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                      Cancel
                    </button>
                    <button onClick={processPayment} disabled={saving}
                      style={{ flex: 2, padding: '10px', background: payType === 'advance' ? '#e65100' : '#1a7a4a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700' }}>
                      {saving ? 'Processing...' : payType === 'advance' ? '✓ Give Advance' : '✓ Confirm Salary Payment'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Total Summary */}
          <div style={{ background: '#0f4c81', color: 'white', borderRadius: '12px', padding: '16px' }}>
            <p style={{ fontSize: '13px', opacity: 0.8, margin: '0 0 10px' }}>
              Total Summary — {new Date(selectedMonth + '-01').toLocaleDateString('en-PK', { month: 'long', year: 'numeric' })}
            </p>
            {[
              { label: 'Total Salary + Commission', value: riderSummaries.reduce((s, r) => s + r.baseSalary, 0) },
              { label: 'Total Advances Given', value: riderSummaries.reduce((s, r) => s + r.totalAdvances, 0) },
              { label: 'Total Salary Paid', value: riderSummaries.reduce((s, r) => s + r.totalPaid, 0) },
              { label: 'Total Remaining Payable', value: riderSummaries.reduce((s, r) => s + Math.max(0, r.remaining), 0) },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <span style={{ fontSize: '13px', opacity: 0.8 }}>{row.label}</span>
                <span style={{ fontSize: '14px', fontWeight: '700' }}>Rs. {row.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PENDING REQUESTS */}
      {activeTab === 'pending' && (
        <div>
          <p style={{ fontSize: '13px', color: '#888', marginBottom: '16px' }}>Advance requests sent directly to CEO/Admin.</p>
          {pendingRequests.length === 0 ? (
            <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '32px', marginBottom: '8px' }}>✅</p>
              <p style={{ color: '#1a7a4a', fontWeight: '700' }}>No pending requests</p>
            </div>
          ) : pendingRequests.map(r => (
            <div key={r.id} style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #fff3e0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>🚴 {r.rider?.full_name}</p>
                  <p style={{ fontSize: '12px', color: '#888', margin: '0 0 2px' }}>
                    {new Date(r.created_at).toLocaleString('en-PK', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {r.notes && <p style={{ fontSize: '12px', color: '#555', margin: '4px 0 0', fontStyle: 'italic' }}>"{r.notes}"</p>}
                </div>
                <p style={{ fontSize: '24px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {Number(r.amount).toLocaleString()}</p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => rejectRequest(r)} disabled={processing === r.id}
                  style={{ flex: 1, padding: '10px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                  ✕ Reject
                </button>
                <button onClick={() => approveRequest(r)} disabled={processing === r.id}
                  style={{ flex: 2, padding: '10px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700' }}>
                  {processing === r.id ? 'Processing...' : '✓ Approve'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* OFFICE EXPENSES */}
      {activeTab === 'expenses' && (
        <OfficeExpenses rider={adminUser} isCEO={true} tenantId={tenantId} />
      )}
    </div>
  )
}
