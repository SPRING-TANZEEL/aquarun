import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function RiderCashTransfer({ rider }) {
  const [mainRider, setMainRider] = useState(null)
  const [pendingTransfers, setPendingTransfers] = useState([])
  const [cashBalance, setCashBalance] = useState(0)
  const [amount, setAmount] = useState('')
  const [transferTo, setTransferTo] = useState(null)
  const [transferType, setTransferType] = useState('cash') // 'cash' or 'jazzcash'
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(null)
  const [success, setSuccess] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)

    const { data: mainRiderData } = await supabase
      .from('riders').select('*').eq('is_main_rider', true).eq('is_active', true).single()
    setMainRider(mainRiderData || null)

    const today = new Date().toISOString().split('T')[0]

    const { data: deliveries } = await supabase.from('deliveries')
      .select('*').eq('rider_id', rider.id).eq('is_voided', false)
      .gte('delivered_at', today + 'T00:00:00')

    const { data: cashPayments } = await supabase.from('payments')
      .select('*').eq('rider_id', rider.id)
      .eq('payment_method', 'cash').eq('payment_date', today).eq('is_voided', false)

    const { data: expenses } = await supabase.from('expenses')
      .select('*').eq('rider_id', rider.id).eq('expense_date', today).eq('is_voided', false)

    const { data: receivedTransfers } = await supabase.from('cash_transfers')
      .select('*').eq('to_rider_id', rider.id)
      .eq('status', 'confirmed').eq('transfer_date', today)

    const { data: sentTransfers } = await supabase.from('cash_transfers')
      .select('*').eq('from_rider_id', rider.id)
      .eq('status', 'confirmed').eq('transfer_date', today)

    let cashFromSales = 0
    deliveries?.forEach(d => {
      if (d.payment_method === 'cash') cashFromSales += Number(d.amount_received)
    })
    const cashFromPayments = cashPayments?.reduce((s, p) => s + Number(p.amount), 0) || 0
    const totalExpenses = expenses?.reduce((s, e) => s + Number(e.amount), 0) || 0
    const totalReceived = receivedTransfers?.reduce((s, t) => s + Number(t.amount), 0) || 0
    const totalSent = sentTransfers?.reduce((s, t) => s + Number(t.amount), 0) || 0

    setCashBalance(cashFromSales + cashFromPayments + totalReceived - totalExpenses - totalSent)

    const { data: pending } = await supabase.from('cash_transfers')
      .select('*, from_rider:from_rider_id(full_name)')
      .eq('to_rider_id', rider.id).eq('status', 'pending')
    setPendingTransfers(pending || [])

    setLoading(false)
  }

  async function submitTransfer() {
    if (!transferTo) return alert('Please select where to return cash')
    if (!amount || Number(amount) <= 0) return alert('Please enter amount')
    if (transferType === 'cash' && Number(amount) > cashBalance) return alert('Amount cannot be more than your cash balance: Rs. ' + cashBalance.toLocaleString())

    setSaving(true)

    const isOffice = transferTo === 'office'
    const toRiderId = isOffice ? null : mainRider?.id

    const { error } = await supabase.from('cash_transfers').insert([{
      from_rider_id: rider.id,
      to_rider_id: toRiderId,
      to_office: isOffice,
      amount: Number(amount),
      transfer_date: new Date().toISOString().split('T')[0],
      transfer_type: transferType, // 'cash' or 'jazzcash'
      status: 'pending'
    }])

    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    setSuccess({ amount: Number(amount), to: isOffice ? 'Office' : mainRider?.full_name, type: transferType })
    setAmount('')
    setTransferTo(null)
    setTransferType('cash')
    fetchData()
    setSaving(false)
  }

  async function confirmTransfer(transfer) {
    setConfirming(transfer.id)
    const { error } = await supabase.from('cash_transfers').update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      confirmed_by: rider.full_name
    }).eq('id', transfer.id)
    if (error) { alert('Error: ' + error.message); setConfirming(null); return }
    fetchData()
    setConfirming(null)
  }

  async function rejectTransfer(transfer) {
    setConfirming(transfer.id)
    await supabase.from('cash_transfers').update({ status: 'rejected' }).eq('id', transfer.id)
    fetchData()
    setConfirming(null)
  }

  const isMainRider = rider.is_main_rider

  if (loading) return <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '4px' }}>💸 Cash Transfer</h2>
      <p style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
        {isMainRider ? 'You are the Main Rider — confirm incoming cash and return to office' : 'Return your cash to Main Rider or Office'}
      </p>

      {/* Success */}
      {success && (
        <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
          <p style={{ fontWeight: '700', color: '#1b5e20', marginBottom: '4px' }}>✅ Transfer Submitted!</p>
          <p style={{ fontSize: '13px', color: '#2e7d32', margin: 0 }}>
            Rs. {success.amount.toLocaleString()} sent to {success.to} via {success.type === 'jazzcash' ? '📱 JazzCash' : '💵 Cash'} — waiting for confirmation.
          </p>
          <button onClick={() => setSuccess(null)}
            style={{ marginTop: '8px', padding: '4px 12px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '12px' }}>
            OK
          </button>
        </div>
      )}

      {/* Current Balance */}
      <div style={{ background: '#0f4c81', color: 'white', borderRadius: '12px', padding: '18px', marginBottom: '12px', textAlign: 'center' }}>
        <p style={{ fontSize: '13px', opacity: 0.8, margin: '0 0 4px' }}>Your Current Cash Balance</p>
        <p style={{ fontSize: '36px', fontWeight: '700', margin: 0 }}>Rs. {cashBalance.toLocaleString()}</p>
        {isMainRider && <p style={{ fontSize: '11px', opacity: 0.7, margin: '6px 0 0' }}>Includes cash received from other riders</p>}
      </div>

      {/* Pending Confirmations */}
      {pendingTransfers.length > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #ffe082' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#795548', marginBottom: '12px' }}>
            ⏳ Pending Cash Receipts — {pendingTransfers.length} transfer{pendingTransfers.length > 1 ? 's' : ''}
          </p>
          {pendingTransfers.map(t => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#fffdf0', borderRadius: '8px', border: '1px solid #ffe082', marginBottom: '8px' }}>
              <div>
                <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>🚴 {t.from_rider?.full_name}</p>
                <p style={{ fontSize: '12px', color: '#888', margin: '0 0 2px' }}>
                  {t.transfer_type === 'jazzcash' ? '📱 JazzCash Transfer' : '💵 Cash Transfer'}
                </p>
                <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
                  {new Date(t.created_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '18px', fontWeight: '700', color: '#0f4c81', margin: '0 0 6px' }}>Rs. {Number(t.amount).toLocaleString()}</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => rejectTransfer(t)} disabled={confirming === t.id}
                    style={{ padding: '6px 12px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                    ✕ Reject
                  </button>
                  <button onClick={() => confirmTransfer(t)} disabled={confirming === t.id}
                    style={{ padding: '6px 12px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                    {confirming === t.id ? '...' : '✓ Confirm'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Return Cash Form */}
      {(cashBalance > 0 || transferType === 'jazzcash') && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>

          {/* Transfer Type */}
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '8px' }}>How are you sending?</p>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <button onClick={() => setTransferType('cash')}
              style={{ flex: 1, padding: '14px', border: '2px solid', borderColor: transferType === 'cash' ? '#0f4c81' : '#eee', borderRadius: '10px', cursor: 'pointer', background: transferType === 'cash' ? '#e3f0ff' : '#f8f9fa', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '24px' }}>💵</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81' }}>Physical Cash</span>
              <span style={{ fontSize: '11px', color: '#888' }}>Handing cash directly</span>
            </button>
            <button onClick={() => setTransferType('jazzcash')}
              style={{ flex: 1, padding: '14px', border: '2px solid', borderColor: transferType === 'jazzcash' ? '#9c27b0' : '#eee', borderRadius: '10px', cursor: 'pointer', background: transferType === 'jazzcash' ? '#fdf4ff' : '#f8f9fa', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '24px' }}>📱</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#9c27b0' }}>JazzCash</span>
              <span style={{ fontSize: '11px', color: '#888' }}>Sent via JazzCash</span>
            </button>
          </div>

          {/* Transfer To */}
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '8px' }}>Return Cash To</p>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            {!isMainRider && mainRider && (
              <button onClick={() => setTransferTo('main_rider')}
                style={{ flex: 1, padding: '16px', border: '2px solid', borderColor: transferTo === 'main_rider' ? '#f59e0b' : '#eee', borderRadius: '10px', cursor: 'pointer', background: transferTo === 'main_rider' ? '#fff8e1' : '#f8f9fa', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '28px' }}>⭐</span>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#795548' }}>{mainRider.full_name}</span>
                <span style={{ fontSize: '11px', color: '#888' }}>Main Rider</span>
              </button>
            )}
            <button onClick={() => setTransferTo('office')}
              style={{ flex: 1, padding: '16px', border: '2px solid', borderColor: transferTo === 'office' ? '#0f4c81' : '#eee', borderRadius: '10px', cursor: 'pointer', background: transferTo === 'office' ? '#e3f0ff' : '#f8f9fa', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '28px' }}>🏢</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81' }}>Office / Admin</span>
              <span style={{ fontSize: '11px', color: '#888' }}>CEO</span>
            </button>
          </div>

          {/* Info box */}
          {transferType === 'jazzcash' && (
            <div style={{ background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px' }}>
              <p style={{ fontSize: '12px', color: '#6b21a8', margin: 0 }}>
                📱 You are sending via JazzCash — this will add to CEO JazzCash account balance. Make sure you have already sent the JazzCash payment before submitting.
              </p>
            </div>
          )}
          {transferType === 'cash' && (
            <div style={{ background: '#f0f7ff', border: '1px solid #c8d8ff', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px' }}>
              <p style={{ fontSize: '12px', color: '#0f4c81', margin: 0 }}>
                💵 You are handing physical cash — this will add to CEO Cash in Hand balance.
              </p>
            </div>
          )}

          {/* Amount */}
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>Amount (Rs.)</p>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0"
            style={{ width: '100%', padding: '14px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '24px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center', marginBottom: '8px' }} />

          {transferType === 'cash' && (
            <button onClick={() => setAmount(String(cashBalance))}
              style={{ padding: '6px 14px', background: '#f0f4ff', border: '1px solid #d0d9ff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#0f4c81', fontWeight: '600', marginBottom: '16px' }}>
              Full Balance: Rs. {cashBalance.toLocaleString()}
            </button>
          )}

          <button onClick={submitTransfer} disabled={saving}
            style={{ width: '100%', padding: '14px', background: transferType === 'jazzcash' ? '#9c27b0' : '#1a7a4a', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700', marginTop: '8px' }}>
            {saving ? 'Submitting...' : transferType === 'jazzcash' ? '📱 Submit JazzCash Transfer' : '✓ Submit Cash Transfer'}
          </button>
        </div>
      )}

      {cashBalance <= 0 && pendingTransfers.length === 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '32px', marginBottom: '8px' }}>✅</p>
          <p style={{ color: '#1a7a4a', fontWeight: '700', marginBottom: '4px' }}>All Clear!</p>
          <p style={{ color: '#888', fontSize: '13px' }}>No cash balance to return today.</p>
        </div>
      )}

      <button onClick={fetchData}
        style={{ width: '100%', padding: '12px', background: '#f0f4ff', color: '#0f4c81', border: '1px solid #c8d8ff', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', marginTop: '8px' }}>
        🔄 Refresh
      </button>
    </div>
  )
}