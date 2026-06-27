import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function RiderAdvanceApproval({ rider }) {
  const [pendingRequests, setPendingRequests] = useState([])
  const [approvedToday, setApprovedToday] = useState([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)
  const [cashBalance, setCashBalance] = useState(0)

  const currentMonthYear = new Date().toISOString().slice(0, 7)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    const isCEO = !rider.is_main_rider

    // Fetch pending requests directed to this person
    const requestedFrom = isCEO ? 'ceo' : 'main_rider'
    const { data: pending } = await supabase
      .from('salary_advances')
      .select('*, rider:rider_id(full_name, monthly_salary)')
      .eq('requested_from', requestedFrom)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setPendingRequests(pending || [])

    // Fetch approved today
    const { data: approved } = await supabase
      .from('salary_advances')
      .select('*, rider:rider_id(full_name)')
      .eq('requested_from', requestedFrom)
      .eq('status', 'approved')
      .gte('created_at', today + 'T00:00:00')
      .order('created_at', { ascending: false })
    setApprovedToday(approved || [])

    // Get cash balance for this rider/CEO
    const { data: deliveries } = await supabase.from('deliveries')
      .select('*').eq('rider_id', rider.id)
      .gte('delivered_at', today + 'T00:00:00')

    const { data: cashPayments } = await supabase.from('payments')
      .select('*').eq('rider_id', rider.id)
      .eq('payment_method', 'cash').eq('payment_date', today)

    const { data: expenses } = await supabase.from('expenses')
      .select('*').eq('rider_id', rider.id).eq('expense_date', today)

    const { data: receivedTransfers } = await supabase.from('cash_transfers')
      .select('*').eq('to_rider_id', rider.id)
      .eq('status', 'confirmed').eq('transfer_date', today)

    const { data: sentTransfers } = await supabase.from('cash_transfers')
      .select('*').eq('from_rider_id', rider.id)
      .eq('status', 'confirmed').eq('transfer_date', today)

    const { data: advancesGiven } = await supabase.from('salary_advances')
      .select('*').eq('requested_from', requestedFrom)
      .eq('status', 'approved')
      .gte('created_at', today + 'T00:00:00')

    let cashFromSales = 0
    deliveries?.forEach(d => {
      if (d.payment_method === 'cash') cashFromSales += Number(d.amount_received)
    })
    const cashFromPayments = cashPayments?.reduce((s, p) => s + Number(p.amount), 0) || 0
    const totalExpenses = expenses?.reduce((s, e) => s + Number(e.amount), 0) || 0
    const totalReceived = receivedTransfers?.reduce((s, t) => s + Number(t.amount), 0) || 0
    const totalSent = sentTransfers?.reduce((s, t) => s + Number(t.amount), 0) || 0
    const totalAdvancesGiven = advancesGiven?.reduce((s, a) => s + Number(a.amount), 0) || 0

    const balance = cashFromSales + cashFromPayments + totalReceived - totalExpenses - totalSent - totalAdvancesGiven
    setCashBalance(balance)

    setLoading(false)
  }

  async function approveRequest(request) {
    if (cashBalance < Number(request.amount)) {
      return alert(`Insufficient cash balance.\nYour balance: Rs. ${cashBalance.toLocaleString()}\nRequested: Rs. ${Number(request.amount).toLocaleString()}`)
    }
    setProcessing(request.id)

    const { error } = await supabase.from('salary_advances')
      .update({
        status: 'approved',
        approved_by: rider.full_name,
        approved_at: new Date().toISOString()
      })
      .eq('id', request.id)

    if (error) { alert('Error: ' + error.message); setProcessing(null); return }

    fetchData()
    setProcessing(null)
  }

  async function rejectRequest(request) {
    setProcessing(request.id)
    const { error } = await supabase.from('salary_advances')
      .update({ status: 'rejected', approved_by: rider.full_name })
      .eq('id', request.id)

    if (error) { alert('Error: ' + error.message) }
    fetchData()
    setProcessing(null)
  }

  if (loading) return <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>

  const isCEO = !rider.is_main_rider

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '4px' }}>
        📋 Advance Requests
      </h2>
      <p style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
        {isCEO ? 'Requests sent to CEO/Admin' : 'Requests sent to you as Main Rider'}
      </p>

      {/* Your Cash Balance */}
      <div style={{
        background: '#0f4c81', color: 'white', borderRadius: '12px',
        padding: '16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div>
          <p style={{ fontSize: '12px', opacity: 0.8, margin: '0 0 4px' }}>Your Available Cash</p>
          <p style={{ fontSize: '28px', fontWeight: '700', margin: 0 }}>Rs. {cashBalance.toLocaleString()}</p>
        </div>
        <p style={{ fontSize: '32px', margin: 0 }}>💵</p>
      </div>

      {/* Pending Requests */}
      {pendingRequests.length === 0 ? (
        <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '12px' }}>
          <p style={{ fontSize: '32px', marginBottom: '8px' }}>✅</p>
          <p style={{ color: '#1a7a4a', fontWeight: '700', marginBottom: '4px' }}>No Pending Requests</p>
          <p style={{ color: '#888', fontSize: '13px' }}>All advance requests have been handled.</p>
        </div>
      ) : (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: 0 }}>⏳ Pending Requests</h3>
            <span style={{ background: '#e65100', color: 'white', fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: '700' }}>
              {pendingRequests.length}
            </span>
          </div>
          {pendingRequests.map(r => (
            <div key={r.id} style={{
              background: 'white', borderRadius: '12px', padding: '16px',
              marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              border: '2px solid #fff3e0'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>
                    🚴 {r.rider?.full_name}
                  </p>
                  <p style={{ fontSize: '12px', color: '#888', margin: '0 0 2px' }}>
                    Monthly Salary: Rs. {Number(r.rider?.monthly_salary || 0).toLocaleString()}
                  </p>
                  <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
                    {new Date(r.created_at).toLocaleString('en-PK', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {r.notes && <p style={{ fontSize: '12px', color: '#555', margin: '4px 0 0', fontStyle: 'italic' }}>"{r.notes}"</p>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '24px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>
                    Rs. {Number(r.amount).toLocaleString()}
                  </p>
                  <p style={{ fontSize: '11px', color: '#888', margin: '4px 0 0' }}>Advance requested</p>
                </div>
              </div>

              {/* Warning if insufficient balance */}
              {cashBalance < Number(r.amount) && (
                <div style={{ background: '#ffebee', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px' }}>
                  <p style={{ fontSize: '12px', color: '#c62828', margin: 0 }}>
                    ⚠️ Insufficient cash — you have Rs. {cashBalance.toLocaleString()} but rider requested Rs. {Number(r.amount).toLocaleString()}
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => rejectRequest(r)} disabled={processing === r.id}
                  style={{
                    flex: 1, padding: '10px', background: '#ffebee', color: '#c62828',
                    border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600'
                  }}>
                  ✕ Reject
                </button>
                <button onClick={() => approveRequest(r)} disabled={processing === r.id || cashBalance < Number(r.amount)}
                  style={{
                    flex: 2, padding: '10px',
                    background: cashBalance >= Number(r.amount) ? '#1a7a4a' : '#ccc',
                    color: 'white', border: 'none', borderRadius: '8px',
                    cursor: cashBalance >= Number(r.amount) ? 'pointer' : 'not-allowed',
                    fontSize: '13px', fontWeight: '600'
                  }}>
                  {processing === r.id ? 'Processing...' : '✓ Approve — Give Rs. ' + Number(r.amount).toLocaleString()}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approved Today */}
      {approvedToday.length > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>✅ Approved Today</p>
          {approvedToday.map(a => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div>
                <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>🚴 {a.rider?.full_name}</p>
                <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>
                  {new Date(a.approved_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#e65100', margin: 0 }}>
                Rs. {Number(a.amount).toLocaleString()}
              </p>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0' }}>
            <span style={{ fontSize: '13px', fontWeight: '700' }}>Total Given Today</span>
            <span style={{ fontSize: '15px', fontWeight: '700', color: '#e65100' }}>
              Rs. {approvedToday.reduce((s, a) => s + Number(a.amount), 0).toLocaleString()}
            </span>
          </div>
        </div>
      )}

      <button onClick={fetchData}
        style={{
          width: '100%', padding: '12px', background: '#f0f4ff', color: '#0f4c81',
          border: '1px solid #c8d8ff', borderRadius: '10px', cursor: 'pointer',
          fontSize: '14px', fontWeight: '600', marginTop: '12px'
        }}>
        🔄 Refresh
      </button>
    </div>
  )
}