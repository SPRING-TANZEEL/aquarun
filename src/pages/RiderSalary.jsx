import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function RiderSalary({ rider, tenantId }) {
  const [loading, setLoading] = useState(true)
  const [advances, setAdvances] = useState([])
  const [pendingRequests, setPendingRequests] = useState([])
  const [mainRider, setMainRider] = useState(null)
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [requestAmount, setRequestAmount] = useState('')
  const [requestTo, setRequestTo] = useState(null)
  const [requestNote, setRequestNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [commissionData, setCommissionData] = useState({
    total19l: 0, totalHalf: 0, total15l: 0,
    commission19l: 0, commissionHalf: 0, commission15l: 0,
    totalCommission: 0
  })

  const currentMonthYear = new Date().toISOString().slice(0, 7)
  const monthLabel = new Date().toLocaleDateString('en-PK', { month: 'long', year: 'numeric' })
  const isCommission = rider.salary_type === 'commission'

  useEffect(() => { if (tenantId) fetchData() }, [tenantId])

  async function fetchData() {
    setLoading(true)

    const { data: mainRiderData } = await supabase
      .from('riders').select('*')
      .eq('tenant_id', tenantId)
      .eq('is_main_rider', true).eq('is_active', true).single()
    setMainRider(mainRiderData || null)

    const { data: approvedAdvances } = await supabase
      .from('salary_advances').select('*')
      .eq('tenant_id', tenantId)
      .eq('rider_id', rider.id)
      .eq('month_year', currentMonthYear)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
    setAdvances(approvedAdvances || [])

    const { data: pending } = await supabase
      .from('salary_advances').select('*')
      .eq('tenant_id', tenantId)
      .eq('rider_id', rider.id)
      .eq('month_year', currentMonthYear)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setPendingRequests(pending || [])

    if (isCommission) {
      const monthStart = currentMonthYear + '-01'
      const nextMonth = new Date(new Date(monthStart).setMonth(new Date(monthStart).getMonth() + 1)).toISOString().split('T')[0]

      const { data: deliveries } = await supabase
        .from('deliveries').select('qty_19l, qty_half_litre, qty_1_5l')
        .eq('tenant_id', tenantId)
        .eq('rider_id', rider.id)
        .gte('delivered_at', monthStart + 'T00:00:00')
        .lt('delivered_at', nextMonth + 'T00:00:00')

      let total19l = 0, totalHalf = 0, total15l = 0
      deliveries?.forEach(d => {
        total19l += Number(d.qty_19l || 0)
        totalHalf += Number(d.qty_half_litre || 0)
        total15l += Number(d.qty_1_5l || 0)
      })

      const commission19l = total19l * Number(rider.commission_19l || 0)
      const commissionHalf = totalHalf * Number(rider.commission_half_litre || 0)
      const commission15l = total15l * Number(rider.commission_1_5l || 0)
      const totalCommission = commission19l + commissionHalf + commission15l

      setCommissionData({ total19l, totalHalf, total15l, commission19l, commissionHalf, commission15l, totalCommission })
    }

    setLoading(false)
  }

  async function submitRequest() {
    if (!requestTo) return alert('Please select who to request from')
    if (!requestAmount || Number(requestAmount) <= 0) return alert('Please enter amount')

    setSaving(true)
    const isMainRider = requestTo === 'main_rider'

    const { error } = await supabase.from('salary_advances').insert([{
      tenant_id: tenantId,
      rider_id: rider.id,
      requested_from: requestTo,
      requested_from_rider_id: isMainRider ? mainRider?.id : null,
      amount: Number(requestAmount),
      status: 'pending',
      month_year: currentMonthYear,
      notes: requestNote
    }])

    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    setSuccess({ amount: Number(requestAmount), to: isMainRider ? mainRider?.full_name : 'CEO/Admin' })
    setRequestAmount('')
    setRequestTo(null)
    setRequestNote('')
    setShowRequestForm(false)
    fetchData()
    setSaving(false)
  }

  const totalAdvances = advances.reduce((s, a) => s + Number(a.amount), 0)
  const baseSalary = isCommission ? commissionData.totalCommission : Number(rider.monthly_salary || 0)
  const remainingSalary = baseSalary - totalAdvances

  if (loading) return <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '4px' }}>💼 My Salary</h2>
      <p style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>{monthLabel}</p>

      {success && (
        <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
          <p style={{ fontWeight: '700', color: '#1b5e20', marginBottom: '4px' }}>✅ Advance Request Submitted!</p>
          <p style={{ fontSize: '13px', color: '#2e7d32', margin: 0 }}>
            Rs. {success.amount.toLocaleString()} requested from {success.to} — waiting for approval.
          </p>
          <button onClick={() => setSuccess(null)}
            style={{ marginTop: '8px', padding: '4px 12px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '12px' }}>
            OK
          </button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
        <span style={{ padding: '6px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: '700', background: isCommission ? '#e8f5e9' : '#f3e5f5', color: isCommission ? '#1a7a4a' : '#7b1fa2' }}>
          {isCommission ? '📦 Commission Based Salary' : '💰 Fixed Monthly Salary'}
        </span>
      </div>

      {isCommission && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>📦 Deliveries This Month</p>

          {rider.commission_19l > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div>
                <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>19 Litre Bottles</p>
                <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{commissionData.total19l} bottles × Rs. {rider.commission_19l}</p>
              </div>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>Rs. {commissionData.commission19l.toLocaleString()}</p>
            </div>
          )}

          {rider.commission_half_litre > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div>
                <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>Half Litre Bottles</p>
                <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{commissionData.totalHalf} bottles × Rs. {rider.commission_half_litre}</p>
              </div>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>Rs. {commissionData.commissionHalf.toLocaleString()}</p>
            </div>
          )}

          {rider.commission_1_5l > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div>
                <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>1.5 Litre Bottles</p>
                <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{commissionData.total15l} bottles × Rs. {rider.commission_1_5l}</p>
              </div>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>Rs. {commissionData.commission15l.toLocaleString()}</p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0' }}>
            <p style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: 0 }}>Total Commission Earned</p>
            <p style={{ fontSize: '18px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {commissionData.totalCommission.toLocaleString()}</p>
          </div>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>Salary Summary — {monthLabel}</p>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
          <span style={{ fontSize: '14px', color: '#555' }}>{isCommission ? 'Commission Earned' : 'Monthly Salary'}</span>
          <span style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a' }}>Rs. {baseSalary.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
          <span style={{ fontSize: '14px', color: '#555' }}>Advances Taken</span>
          <span style={{ fontSize: '14px', fontWeight: '700', color: '#e65100' }}>− Rs. {totalAdvances.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0' }}>
          <span style={{ fontSize: '15px', fontWeight: '700', color: '#333' }}>Remaining Payable</span>
          <span style={{ fontSize: '20px', fontWeight: '700', color: remainingSalary >= 0 ? '#0f4c81' : '#f44336' }}>
            Rs. {remainingSalary.toLocaleString()}
          </span>
        </div>

        {remainingSalary < 0 && (
          <div style={{ background: '#fff3e0', borderRadius: '8px', padding: '10px', marginTop: '4px' }}>
            <p style={{ fontSize: '12px', color: '#e65100', margin: 0 }}>
              ⚠️ Advances taken exceed {isCommission ? 'commission earned' : 'monthly salary'} by Rs. {Math.abs(remainingSalary).toLocaleString()}. This will carry forward to next month.
            </p>
          </div>
        )}
      </div>

      {isCommission && (
        <div style={{ background: '#f0f7ff', border: '1px solid #c8e0ff', borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
          <p style={{ fontSize: '12px', fontWeight: '700', color: '#0f4c81', margin: '0 0 6px' }}>Your Commission Rates</p>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {rider.commission_19l > 0 && <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>19L: <strong>Rs. {rider.commission_19l}/bottle</strong></p>}
            {rider.commission_half_litre > 0 && <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>Half: <strong>Rs. {rider.commission_half_litre}/bottle</strong></p>}
            {rider.commission_1_5l > 0 && <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>1.5L: <strong>Rs. {rider.commission_1_5l}/bottle</strong></p>}
          </div>
        </div>
      )}

      {!showRequestForm && (
        <button onClick={() => setShowRequestForm(true)}
          style={{ width: '100%', padding: '14px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700', marginBottom: '12px' }}>
          + Request Salary Advance
        </button>
      )}

      {showRequestForm && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #e3f0ff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Request Advance</p>
            <button onClick={() => setShowRequestForm(false)}
              style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#888' }}>✕</button>
          </div>

          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>Request From</p>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
            {mainRider && mainRider.id !== rider.id && (
              <button onClick={() => setRequestTo('main_rider')}
                style={{ flex: 1, padding: '14px', border: '2px solid', borderColor: requestTo === 'main_rider' ? '#f59e0b' : '#eee', borderRadius: '10px', cursor: 'pointer', background: requestTo === 'main_rider' ? '#fff8e1' : '#f8f9fa', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '24px' }}>⭐</span>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#795548' }}>{mainRider.full_name}</span>
                <span style={{ fontSize: '11px', color: '#888' }}>Main Rider</span>
              </button>
            )}
            <button onClick={() => setRequestTo('ceo')}
              style={{ flex: 1, padding: '14px', border: '2px solid', borderColor: requestTo === 'ceo' ? '#0f4c81' : '#eee', borderRadius: '10px', cursor: 'pointer', background: requestTo === 'ceo' ? '#e3f0ff' : '#f8f9fa', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '24px' }}>👨‍💼</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81' }}>CEO / Admin</span>
              <span style={{ fontSize: '11px', color: '#888' }}>Office</span>
            </button>
          </div>

          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>Amount (Rs.)</p>
          <input type="number" value={requestAmount}
            onChange={e => setRequestAmount(e.target.value)}
            placeholder="0"
            style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '24px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center', marginBottom: '12px' }} />

          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>Note (optional)</p>
          <input value={requestNote} onChange={e => setRequestNote(e.target.value)}
            placeholder="Reason for advance..."
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' }} />

          <button onClick={submitRequest} disabled={saving}
            style={{ width: '100%', padding: '14px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
            {saving ? 'Submitting...' : '✓ Submit Request'}
          </button>
        </div>
      )}

      {pendingRequests.length > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #ffe082' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#795548', marginBottom: '12px' }}>⏳ Pending Requests</p>
          {pendingRequests.map(a => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div>
                <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>Rs. {Number(a.amount).toLocaleString()}</p>
                <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>
                  From: {a.requested_from === 'ceo' ? 'CEO/Admin' : 'Main Rider'} · {new Date(a.created_at).toLocaleDateString('en-PK')}
                </p>
              </div>
              <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', background: '#fff8e1', color: '#795548' }}>⏳ Pending</span>
            </div>
          ))}
        </div>
      )}

      {advances.length > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>Advances Received This Month</p>
          {advances.map(a => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div>
                <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>Rs. {Number(a.amount).toLocaleString()}</p>
                <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>
                  From: {a.requested_from === 'ceo' ? 'CEO/Admin' : 'Main Rider'} · {new Date(a.created_at).toLocaleDateString('en-PK')}
                </p>
                {a.notes && <p style={{ fontSize: '11px', color: '#aaa', margin: '2px 0 0' }}>{a.notes}</p>}
              </div>
              <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', background: '#e8f5e9', color: '#2e7d32' }}>✅ Approved</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#333' }}>Total Advances</span>
            <span style={{ fontSize: '15px', fontWeight: '700', color: '#e65100' }}>Rs. {totalAdvances.toLocaleString()}</span>
          </div>
        </div>
      )}

      <button onClick={fetchData}
        style={{ width: '100%', padding: '12px', background: '#f0f4ff', color: '#0f4c81', border: '1px solid #c8d8ff', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', marginTop: '12px' }}>
        🔄 Refresh
      </button>
    </div>
  )
}