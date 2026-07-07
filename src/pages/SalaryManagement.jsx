import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import OfficeExpenses from './OfficeExpenses'

const PAYMENT_METHODS = [
  { key: 'cash', label: 'Cash', icon: '💵' },
  { key: 'jazzcash', label: 'JazzCash', icon: '📱' },
  { key: 'bank', label: 'Bank', icon: '🏦' },
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
  const [payingRider, setPayingRider] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (tenantId) fetchData() }, [selectedMonth, tenantId])

  async function fetchData() {
    setLoading(true)
    const { data: ridersData } = await supabase.from('riders')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('created_at')
    setRiders(ridersData || [])

    const { data: advancesData } = await supabase.from('salary_advances')
      .select('*, rider:rider_id(full_name, monthly_salary, salary_type)')
      .eq('tenant_id', tenantId)
      .eq('month_year', selectedMonth).order('created_at', { ascending: false })
    setAdvances(advancesData || [])

    const { data: pendingData } = await supabase.from('salary_advances')
      .select('*, rider:rider_id(full_name, monthly_salary, salary_type)')
      .eq('tenant_id', tenantId)
      .eq('requested_from', 'ceo').eq('status', 'pending').order('created_at', { ascending: false })
    setPendingRequests(pendingData || [])

    const monthStart = selectedMonth + '-01'
    const nextMonth = new Date(new Date(monthStart).setMonth(new Date(monthStart).getMonth() + 1)).toISOString().split('T')[0]

    const summaries = []
    for (const r of ridersData || []) {
      const riderAdvances = advancesData?.filter(a => a.rider_id === r.id && a.status === 'approved') || []
      const totalAdvances = riderAdvances.reduce((s, a) => s + Number(a.amount), 0)

      let baseSalary = 0
      let commissionBreakdown = null

      if (r.salary_type === 'commission') {
        const { data: deliveries } = await supabase.from('deliveries')
          .select('qty_19l, qty_half_litre, qty_1_5l')
          .eq('rider_id', r.id)
          .eq('tenant_id', tenantId)
          .eq('is_voided', false)
          .gte('delivered_at', monthStart + 'T00:00:00')
          .lt('delivered_at', nextMonth + 'T00:00:00')

        let total19l = 0, totalHalf = 0, total15l = 0
        deliveries?.forEach(d => {
          total19l += Number(d.qty_19l || 0)
          totalHalf += Number(d.qty_half_litre || 0)
          total15l += Number(d.qty_1_5l || 0)
        })

        const commission19l = total19l * Number(r.commission_19l || 0)
        const commissionHalf = totalHalf * Number(r.commission_half_litre || 0)
        const commission15l = total15l * Number(r.commission_1_5l || 0)
        baseSalary = commission19l + commissionHalf + commission15l
        commissionBreakdown = { total19l, totalHalf, total15l, commission19l, commissionHalf, commission15l, rate19l: r.commission_19l, rateHalf: r.commission_half_litre, rate15l: r.commission_1_5l }
      } else {
        baseSalary = Number(r.monthly_salary || 0)
      }

      const remaining = baseSalary - totalAdvances
      summaries.push({ ...r, baseSalary, totalAdvances, remaining, advances: riderAdvances, commissionBreakdown })
    }
    setRiderSummaries(summaries)
    setLoading(false)
  }

  async function approveRequest(request) {
    setProcessing(request.id)
    const { data: approved, error } = await supabase.from('salary_advances')
      .update({ status: 'approved', approved_by: 'Admin/CEO', approved_at: new Date().toISOString() })
      .eq('id', request.id)
      .eq('tenant_id', tenantId)
      .select().single()
    if (error) { alert('Error: ' + error.message); setProcessing(null); return }

    // Auto-post journal entry
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
      .eq('id', request.id)
      .eq('tenant_id', tenantId)
    fetchData()
    setProcessing(null)
  }

  async function paySalary(rider) {
    if (!payAmount || Number(payAmount) <= 0) return alert('Please enter amount')
    setSaving(true)
    const summary = riderSummaries.find(r => r.id === rider.id)
    const { data: savedPayment, error } = await supabase.from('salary_payments').insert([{
      tenant_id: tenantId,
      rider_id: rider.id,
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

    // Auto-post journal entry
    try {
      const { postSalaryPaymentJournal } = await import('../accountingEngine')
      await postSalaryPaymentJournal(savedPayment, tenantId)
    } catch (err) { console.error('Journal post error:', err) }
    alert(`Salary paid to ${rider.full_name}!\nAmount: Rs. ${Number(payAmount).toLocaleString()}\nPaid via: ${payMethod}`)
    setPayingRider(null)
    setPayAmount('')
    setPayNote('')
    setPayMethod('cash')
    setPayDate(new Date().toISOString().split('T')[0])
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

      {/* Tabs */}
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
                  <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', background: r.salary_type === 'commission' ? '#e8f5e9' : '#f3e5f5', color: r.salary_type === 'commission' ? '#1a7a4a' : '#7b1fa2' }}>
                    {r.salary_type === 'commission' ? '📦 Commission Based' : '💰 Fixed Salary'}
                  </span>
                </div>
                <button onClick={() => { setPayingRider(r); setPayAmount(String(r.remaining > 0 ? r.remaining : 0)); setPayMethod('cash') }}
                  style={{ padding: '8px 14px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                  💵 Pay
                </button>
              </div>

              {/* Commission Breakdown */}
              {r.salary_type === 'commission' && r.commissionBreakdown && (
                <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                  <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', margin: '0 0 8px' }}>Commission Breakdown</p>
                  {r.commissionBreakdown.rate19l > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span style={{ fontSize: '12px', color: '#888' }}>19L × {r.commissionBreakdown.total19l} bottles × Rs. {r.commissionBreakdown.rate19l}</span>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#1a7a4a' }}>Rs. {r.commissionBreakdown.commission19l.toLocaleString()}</span>
                    </div>
                  )}
                  {r.commissionBreakdown.rateHalf > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span style={{ fontSize: '12px', color: '#888' }}>Half × {r.commissionBreakdown.totalHalf} bottles × Rs. {r.commissionBreakdown.rateHalf}</span>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#1a7a4a' }}>Rs. {r.commissionBreakdown.commissionHalf.toLocaleString()}</span>
                    </div>
                  )}
                  {r.commissionBreakdown.rate15l > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span style={{ fontSize: '12px', color: '#888' }}>1.5L × {r.commissionBreakdown.total15l} bottles × Rs. {r.commissionBreakdown.rate15l}</span>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#1a7a4a' }}>Rs. {r.commissionBreakdown.commission15l.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div style={{ textAlign: 'center', padding: '10px', background: '#f0f7ff', borderRadius: '8px' }}>
                  <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>{r.salary_type === 'commission' ? 'Commission Earned' : 'Monthly Salary'}</p>
                  <p style={{ fontSize: '18px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {r.baseSalary.toLocaleString()}</p>
                </div>
                <div style={{ textAlign: 'center', padding: '10px', background: '#fff3e0', borderRadius: '8px' }}>
                  <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>Advances Taken</p>
                  <p style={{ fontSize: '18px', fontWeight: '700', color: '#e65100', margin: 0 }}>Rs. {r.totalAdvances.toLocaleString()}</p>
                </div>
                <div style={{ textAlign: 'center', padding: '10px', background: r.remaining >= 0 ? '#e8f5e9' : '#ffebee', borderRadius: '8px' }}>
                  <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>Remaining Payable</p>
                  <p style={{ fontSize: '18px', fontWeight: '700', color: r.remaining >= 0 ? '#1a7a4a' : '#c62828', margin: 0 }}>Rs. {r.remaining.toLocaleString()}</p>
                </div>
              </div>

              {r.remaining < 0 && (
                <div style={{ background: '#fff3e0', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px' }}>
                  <p style={{ fontSize: '12px', color: '#e65100', margin: 0 }}>⚠️ Advances exceed {r.salary_type === 'commission' ? 'commission' : 'salary'} by Rs. {Math.abs(r.remaining).toLocaleString()} — will carry forward.</p>
                </div>
              )}

              {/* Advances Detail */}
              {r.advances.length > 0 && (
                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '12px' }}>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: '#555', marginBottom: '8px' }}>Advances This Month</p>
                  {r.advances.map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <span style={{ fontSize: '12px', color: '#888' }}>
                        {new Date(a.created_at).toLocaleDateString('en-PK')} — from {a.requested_from === 'ceo' ? 'CEO' : 'Main Rider'}
                        {a.payment_method && a.payment_method !== 'cash' ? ` via ${a.payment_method}` : ''}
                        {a.notes ? ` — ${a.notes}` : ''}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#e65100' }}>Rs. {Number(a.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Pay Form */}
              {payingRider?.id === r.id && (
                <div style={{ marginTop: '14px', padding: '14px', background: '#f0f7ff', borderRadius: '10px', border: '1px solid #c8e0ff' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81', marginBottom: '12px' }}>
                    Pay {r.salary_type === 'commission' ? 'Commission' : 'Salary'} to {r.full_name}
                  </p>

                  {/* Payment Method */}
                  <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>Pay From</p>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    {PAYMENT_METHODS.map(m => (
                      <button key={m.key} onClick={() => setPayMethod(m.key)}
                        style={{ flex: 1, padding: '10px 6px', border: '2px solid', borderColor: payMethod === m.key ? (m.key === 'cash' ? '#0f4c81' : m.key === 'jazzcash' ? '#9c27b0' : '#1a7a4a') : '#eee', borderRadius: '8px', cursor: 'pointer', background: payMethod === m.key ? (m.key === 'cash' ? '#e3f0ff' : m.key === 'jazzcash' ? '#fdf4ff' : '#e8f5e9') : 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                        <span style={{ fontSize: '18px' }}>{m.icon}</span>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: payMethod === m.key ? (m.key === 'cash' ? '#0f4c81' : m.key === 'jazzcash' ? '#9c27b0' : '#1a7a4a') : '#555' }}>{m.label}</span>
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Amount (Rs.)</label>
                      <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '16px', fontWeight: '700', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Payment Date</label>
                      <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                        max={new Date().toISOString().split('T')[0]}
                        style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', color: '#333' }} />
                    </div>
                  </div>
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Note (optional)</label>
                    <input value={payNote} onChange={e => setPayNote(e.target.value)}
                      placeholder="e.g. Month end payment"
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', color: '#333' }} />
                  </div>
                  {payDate !== new Date().toISOString().split('T')[0] && (
                    <div style={{ background: '#fff3e0', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px' }}>
                      <p style={{ fontSize: '11px', color: '#e65100', fontWeight: '600', margin: 0 }}>⚠️ Back-dated entry — {new Date(payDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                    </div>
                  )}

                  <div style={{ background: '#fff3e0', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px' }}>
                    <p style={{ fontSize: '11px', color: '#e65100', margin: 0 }}>
                      {payMethod === 'cash' && '💵 This will be deducted from CEO Cash in Hand'}
                      {payMethod === 'jazzcash' && '📱 This will be deducted from CEO JazzCash balance'}
                      {payMethod === 'bank' && '🏦 This will be deducted from CEO Bank balance'}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setPayingRider(null)}
                      style={{ flex: 1, padding: '10px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                      Cancel
                    </button>
                    <button onClick={() => paySalary(r)} disabled={saving}
                      style={{ flex: 2, padding: '10px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700' }}>
                      {saving ? 'Processing...' : '✓ Confirm Payment'}
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
                    {r.rider?.salary_type === 'commission' ? '📦 Commission Based' : `Fixed: Rs. ${Number(r.rider?.monthly_salary || 0).toLocaleString()}/month`}
                  </p>
                  <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
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