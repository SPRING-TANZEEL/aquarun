import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function CashTransferManagement({ tenantId, onUpdate }) {
  const [pendingTransfers, setPendingTransfers] = useState([])
  const [confirmedTransfers, setConfirmedTransfers] = useState([])
  const [riderBalances, setRiderBalances] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(null)
  const [filter, setFilter] = useState('pending')
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { if (tenantId) fetchData() }, [filter, dateFrom, dateTo, tenantId])

  async function fetchData() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    const fromTimestamp = today + 'T00:00:00'
    const toTimestamp = today + 'T23:59:59'

    // Fetch all active riders
    const { data: riders } = await supabase.from('riders')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)

    // For each rider calculate TODAY's cash balance only
    const balances = []
    for (const r of riders || []) {
      const { data: deliveries } = await supabase.from('deliveries')
        .select('*')
        .eq('rider_id', r.id)
        .eq('tenant_id', tenantId)
        .eq('is_voided', false)
        .gte('delivered_at', fromTimestamp).lte('delivered_at', toTimestamp)

      const { data: cashPayments } = await supabase.from('payments')
        .select('*')
        .eq('rider_id', r.id)
        .eq('tenant_id', tenantId)
        .eq('payment_method', 'cash').eq('is_voided', false)
        .gte('created_at', fromTimestamp).lte('created_at', toTimestamp)

      const { data: expenses } = await supabase.from('expenses')
        .select('*')
        .eq('rider_id', r.id)
        .eq('tenant_id', tenantId)
        .eq('is_voided', false)
        .gte('created_at', fromTimestamp).lte('created_at', toTimestamp)

      let cashFromSales = 0
      deliveries?.forEach(d => {
        if (d.payment_method === 'cash') cashFromSales += Number(d.amount_received)
      })
      const cashFromPayments = cashPayments?.reduce((s, p) => s + Number(p.amount), 0) || 0
      const totalExpenses = expenses?.reduce((s, e) => s + Number(e.amount), 0) || 0
      const balance = cashFromSales + cashFromPayments - totalExpenses

      balances.push({ ...r, cashBalance: balance })
    }
    setRiderBalances(balances)

    // Pending transfers — NO date filter, show ALL pending
    const { data: pendingData, error: pendingError } = await supabase
      .from('cash_transfers')
      .select('*, from_rider:from_rider_id(full_name, is_main_rider)')
      .eq('tenant_id', tenantId)
      .eq('to_office', true)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (pendingError) console.error('Pending error:', pendingError)

    // Confirmed transfers — apply date filter
    const { data: confirmedData, error: confirmedError } = await supabase
      .from('cash_transfers')
      .select('*, from_rider:from_rider_id(full_name, is_main_rider)')
      .eq('tenant_id', tenantId)
      .eq('to_office', true)
      .eq('status', 'confirmed')
      .gte('transfer_date', dateFrom)
      .lte('transfer_date', dateTo)
      .order('created_at', { ascending: false })

    if (confirmedError) console.error('Confirmed error:', confirmedError)

    if (filter === 'pending') {
      setPendingTransfers(pendingData || [])
      setConfirmedTransfers([])
    } else if (filter === 'confirmed') {
      setPendingTransfers([])
      setConfirmedTransfers(confirmedData || [])
    } else {
      setPendingTransfers(pendingData || [])
      setConfirmedTransfers(confirmedData || [])
    }

    setLoading(false)
  }

  async function confirmTransfer(transfer) {
    setConfirming(transfer.id)

    const { data: confirmed, error } = await supabase.from('cash_transfers').update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      confirmed_by: 'Admin'
    })
      .eq('id', transfer.id)
      .eq('tenant_id', tenantId)
      .select().single()

    if (error) { alert('Error: ' + error.message); setConfirming(null); return }

    try {
      const { postCashTransferJournal } = await import('../accountingEngine')
      await postCashTransferJournal(confirmed, tenantId)
    } catch (err) { console.error('Journal post error:', err) }

    fetchData()
    if (onUpdate) onUpdate()
    setConfirming(null)
  }

  async function rejectTransfer(transfer) {
    setConfirming(transfer.id)
    await supabase.from('cash_transfers')
      .update({ status: 'rejected' })
      .eq('id', transfer.id)
      .eq('tenant_id', tenantId)
    fetchData()
    setConfirming(null)
  }

  const totalPendingAmount = pendingTransfers.reduce((s, t) => s + Number(t.amount), 0)
  const totalConfirmedAmount = confirmedTransfers.reduce((s, t) => s + Number(t.amount), 0)
  const totalOutstanding = riderBalances.reduce((s, r) => s + Math.max(0, r.cashBalance), 0)

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>💸 Cash Transfer Management</h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Track rider cash balances and confirm transfers to office.</p>
      </div>

      {/* Today's Rider Balances */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', margin: 0 }}>Today's Cash in Hand</p>
          <span style={{ fontSize: '11px', color: '#888', background: '#f0f0f0', padding: '3px 8px', borderRadius: '6px' }}>Today Only</span>
        </div>
        {riderBalances.length === 0 ? (
          <p style={{ color: '#888', fontSize: '13px' }}>No riders found.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
            {riderBalances.map(r => (
              <div key={r.id} style={{
                padding: '14px', borderRadius: '10px',
                background: r.cashBalance > 0 ? '#fff8e1' : '#f0fff4',
                border: '1px solid ' + (r.cashBalance > 0 ? '#ffe082' : '#c8e6c9')
              }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>
                  {r.is_main_rider ? '⭐ ' : '🚴 '}{r.full_name}
                </p>
                <p style={{ fontSize: '20px', fontWeight: '700', margin: '0 0 4px', color: r.cashBalance > 0 ? '#e65100' : '#1a7a4a' }}>
                  Rs. {r.cashBalance.toLocaleString()}
                </p>
                <p style={{ fontSize: '10px', color: '#aaa', margin: 0 }}>
                  {new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: '12px', padding: '10px 14px', background: '#0f4c81', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', color: 'white', fontWeight: '600' }}>Total Cash Owed to Office Today</span>
          <span style={{ fontSize: '15px', fontWeight: '700', color: 'white' }}>Rs. {totalOutstanding.toLocaleString()}</span>
        </div>
      </div>

      {/* Date Filter */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>From Date</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>To Date</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { key: 'pending', label: '⏳ Pending' },
              { key: 'confirmed', label: '✅ Confirmed' },
              { key: 'all', label: '📋 All' },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                style={{ padding: '8px 14px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: filter === f.key ? '#0f4c81' : '#f0f0f0', color: filter === f.key ? 'white' : '#555', fontWeight: filter === f.key ? '700' : '400', fontSize: '13px' }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #e65100' }}>
          <p style={{ fontSize: '12px', color: '#888', margin: '0 0 4px' }}>Pending to Office</p>
          <p style={{ fontSize: '24px', fontWeight: '700', color: '#e65100', margin: 0 }}>Rs. {totalPendingAmount.toLocaleString()}</p>
        </div>
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #1a7a4a' }}>
          <p style={{ fontSize: '12px', color: '#888', margin: '0 0 4px' }}>Confirmed Received</p>
          <p style={{ fontSize: '24px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>Rs. {totalConfirmedAmount.toLocaleString()}</p>
        </div>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>
      ) : (
        <div>
          {/* Pending Transfers */}
          {(filter === 'pending' || filter === 'all') && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: 0 }}>⏳ Pending — Cash to Office</h3>
                {pendingTransfers.length > 0 && (
                  <span style={{ background: '#e65100', color: 'white', fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: '700' }}>
                    {pendingTransfers.length}
                  </span>
                )}
              </div>
              <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                {pendingTransfers.length === 0 ? (
                  <p style={{ padding: '24px', textAlign: 'center', color: '#888', fontSize: '13px' }}>✅ No pending transfers to office.</p>
                ) : pendingTransfers.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #f0f0f0', background: '#fffbf5' }}>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>
                        {t.from_rider?.is_main_rider ? '⭐ ' : '🚴 '}{t.from_rider?.full_name}
                      </p>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
                          {new Date(t.created_at).toLocaleString('en-PK', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                        </p>
                        <span style={{ fontSize: '11px', background: t.transfer_type === 'jazzcash' ? '#f3e5f5' : '#e3f0ff', color: t.transfer_type === 'jazzcash' ? '#9c27b0' : '#0f4c81', padding: '2px 8px', borderRadius: '6px', fontWeight: '600' }}>
                          {t.transfer_type === 'jazzcash' ? '📱 JazzCash' : '💵 Cash'}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <p style={{ fontSize: '20px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>
                        Rs. {Number(t.amount).toLocaleString()}
                      </p>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => rejectTransfer(t)} disabled={confirming === t.id}
                          style={{ padding: '7px 14px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                          ✕ Reject
                        </button>
                        <button onClick={() => confirmTransfer(t)} disabled={confirming === t.id}
                          style={{ padding: '7px 14px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                          {confirming === t.id ? '...' : '✓ Confirm'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Confirmed Transfers */}
          {(filter === 'confirmed' || filter === 'all') && confirmedTransfers.length > 0 && (
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#333', marginBottom: '10px' }}>✅ Confirmed Receipts</h3>
              <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                {confirmedTransfers.map(t => (
                  <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #f0f0f0', background: '#fafffe' }}>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>
                        {t.from_rider?.is_main_rider ? '⭐ ' : '🚴 '}{t.from_rider?.full_name}
                      </p>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
                          {new Date(t.confirmed_at).toLocaleString('en-PK', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                        </p>
                        <span style={{ fontSize: '11px', background: t.transfer_type === 'jazzcash' ? '#f3e5f5' : '#e3f0ff', color: t.transfer_type === 'jazzcash' ? '#9c27b0' : '#0f4c81', padding: '2px 8px', borderRadius: '6px', fontWeight: '600' }}>
                          {t.transfer_type === 'jazzcash' ? '📱 JazzCash' : '💵 Cash'}
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '20px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>
                        Rs. {Number(t.amount).toLocaleString()}
                      </p>
                      <span style={{ fontSize: '11px', color: '#9c27b0', fontWeight: '600' }}>✅ Received</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <button onClick={fetchData}
        style={{ width: '100%', padding: '12px', background: '#f0f4ff', color: '#0f4c81', border: '1px solid #c8d8ff', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', marginTop: '16px' }}>
        🔄 Refresh
      </button>
    </div>
  )
}