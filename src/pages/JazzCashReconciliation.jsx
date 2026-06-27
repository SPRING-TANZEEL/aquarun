import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function JazzCashReconciliation({ onUpdate }) {
  const [deliveries, setDeliveries] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [confirming, setConfirming] = useState(null)
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0])
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { fetchEntries() }, [filter, dateFrom, dateTo])

  async function fetchEntries() {
    setLoading(true)

    // Fetch JazzCash deliveries (sales)
    let dQuery = supabase
      .from('deliveries')
      .select('*, customers(full_name, mobile, customer_code), riders(full_name)')
      .eq('payment_method', 'jazzcash')
      .gte('delivered_at', dateFrom + 'T00:00:00')
      .lte('delivered_at', dateTo + 'T23:59:59')
      .order('delivered_at', { ascending: false })

    if (filter === 'pending') dQuery = dQuery.eq('jazzcash_confirmed', false)
    if (filter === 'confirmed') dQuery = dQuery.eq('jazzcash_confirmed', true)

    const { data: dData } = await dQuery
    setDeliveries(dData || [])

    // Fetch JazzCash payments (balance collections)
    let pQuery = supabase
      .from('payments')
      .select('*, customers(full_name, mobile, customer_code), riders(full_name)')
      .eq('payment_method', 'jazzcash')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59')
      .order('created_at', { ascending: false })

    if (filter === 'pending') pQuery = pQuery.eq('jazzcash_confirmed', false)
    if (filter === 'confirmed') pQuery = pQuery.eq('jazzcash_confirmed', true)

    const { data: pData } = await pQuery
    setPayments(pData || [])

    setLoading(false)
  }

  async function confirmDelivery(entry) {
    setConfirming('d-' + entry.id)
    const { error } = await supabase
      .from('deliveries')
      .update({
        jazzcash_confirmed: true,
        jazzcash_confirmed_at: new Date().toISOString(),
        jazzcash_confirmed_by: 'Admin',
        amount_received: entry.total_amount
      })
      .eq('id', entry.id)

    if (error) { alert('Error: ' + error.message) }
    else { fetchEntries(); if (onUpdate) onUpdate() }
    setConfirming(null)
  }

  async function unconfirmDelivery(entry) {
    setConfirming('d-' + entry.id)
    const { error } = await supabase
      .from('deliveries')
      .update({
        jazzcash_confirmed: false,
        jazzcash_confirmed_at: null,
        jazzcash_confirmed_by: null,
        amount_received: 0
      })
      .eq('id', entry.id)

    if (error) { alert('Error: ' + error.message) }
    else { fetchEntries(); if (onUpdate) onUpdate() }
    setConfirming(null)
  }

  async function confirmPayment(entry) {
    setConfirming('p-' + entry.id)

    // Confirm the payment
    const { error } = await supabase
      .from('payments')
      .update({ jazzcash_confirmed: true })
      .eq('id', entry.id)

    if (error) { alert('Error: ' + error.message); setConfirming(null); return }

    // Now reduce customer balance
    const { data: customer } = await supabase
      .from('customers')
      .select('balance')
      .eq('id', entry.customer_id)
      .single()

    if (customer) {
      const newBalance = Number(customer.balance) - Number(entry.amount)
      await supabase.from('customers')
        .update({ balance: newBalance })
        .eq('id', entry.customer_id)
    }

    fetchEntries()
    if (onUpdate) onUpdate()
    setConfirming(null)
  }

  async function unconfirmPayment(entry) {
    setConfirming('p-' + entry.id)

    const { error } = await supabase
      .from('payments')
      .update({ jazzcash_confirmed: false })
      .eq('id', entry.id)

    if (error) { alert('Error: ' + error.message); setConfirming(null); return }

    // Restore customer balance
    const { data: customer } = await supabase
      .from('customers')
      .select('balance')
      .eq('id', entry.customer_id)
      .single()

    if (customer) {
      const newBalance = Number(customer.balance) + Number(entry.amount)
      await supabase.from('customers')
        .update({ balance: newBalance })
        .eq('id', entry.customer_id)
    }

    fetchEntries()
    if (onUpdate) onUpdate()
    setConfirming(null)
  }

  const totalDeliveryPending = deliveries.filter(e => !e.jazzcash_confirmed).reduce((s, e) => s + Number(e.total_amount), 0)
  const totalPaymentPending = payments.filter(e => !e.jazzcash_confirmed).reduce((s, e) => s + Number(e.amount), 0)
  const totalConfirmed = [
    ...deliveries.filter(e => e.jazzcash_confirmed).map(e => Number(e.total_amount)),
    ...payments.filter(e => e.jazzcash_confirmed).map(e => Number(e.amount))
  ].reduce((s, v) => s + v, 0)

  const sectionHead = (title, count) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '20px 0 10px' }}>
      <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: 0 }}>{title}</h3>
      {count > 0 && (
        <span style={{ background: '#e65100', color: 'white', fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: '700' }}>
          {count}
        </span>
      )}
    </div>
  )

  const actionBtn = (isConfirmed, onConfirm, onUnconfirm, id) => (
    isConfirmed ? (
      <button onClick={onUnconfirm} disabled={confirming === id}
        style={{
          padding: '7px 14px', background: '#f5f5f5', color: '#888',
          border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer',
          fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap'
        }}>
        {confirming === id ? '...' : '↩ Undo'}
      </button>
    ) : (
      <button onClick={onConfirm} disabled={confirming === id}
        style={{
          padding: '7px 14px', background: '#9c27b0', color: 'white',
          border: 'none', borderRadius: '6px', cursor: 'pointer',
          fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap'
        }}>
        {confirming === id ? '...' : '✓ Confirm'}
      </button>
    )
  )

  const statusBadge = (confirmed, confirmedAt) => (
    confirmed ? (
      <div>
        <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', background: '#f3e5f5', color: '#7b1fa2' }}>✅ Confirmed</span>
        {confirmedAt && <p style={{ fontSize: '10px', color: '#aaa', margin: '3px 0 0' }}>{new Date(confirmedAt).toLocaleString('en-PK', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}</p>}
      </div>
    ) : (
      <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', background: '#fff3e0', color: '#e65100' }}>⏳ Pending</span>
    )
  )

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>📱 JazzCash Reconciliation</h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Check your JazzCash account and confirm each payment received.</p>
      </div>

      {/* Filters */}
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
                style={{
                  padding: '8px 14px', border: 'none', borderRadius: '8px', cursor: 'pointer',
                  background: filter === f.key ? '#0f4c81' : '#f0f0f0',
                  color: filter === f.key ? 'white' : '#555',
                  fontWeight: filter === f.key ? '700' : '400', fontSize: '13px'
                }}>{f.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #e65100' }}>
          <p style={{ fontSize: '12px', color: '#888', margin: '0 0 4px' }}>Sales Pending</p>
          <p style={{ fontSize: '22px', fontWeight: '700', color: '#e65100', margin: 0 }}>Rs. {totalDeliveryPending.toLocaleString()}</p>
        </div>
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #f44336' }}>
          <p style={{ fontSize: '12px', color: '#888', margin: '0 0 4px' }}>Payments Pending</p>
          <p style={{ fontSize: '22px', fontWeight: '700', color: '#f44336', margin: 0 }}>Rs. {totalPaymentPending.toLocaleString()}</p>
        </div>
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #9c27b0' }}>
          <p style={{ fontSize: '12px', color: '#888', margin: '0 0 4px' }}>Total Confirmed</p>
          <p style={{ fontSize: '22px', fontWeight: '700', color: '#9c27b0', margin: 0 }}>Rs. {totalConfirmed.toLocaleString()}</p>
        </div>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>
      ) : (
        <div>
          {/* JazzCash Sales */}
          {sectionHead('🍶 JazzCash Sales (Deliveries)', deliveries.filter(e => !e.jazzcash_confirmed).length)}
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: '20px' }}>
            {deliveries.length === 0 ? (
              <p style={{ padding: '24px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No JazzCash sales for this period.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    {['Date', 'Customer', 'Rider', 'Bottles', 'Amount', 'Status', 'Action'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: '11px', color: '#666', fontWeight: '600', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map(e => (
                    <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0', background: e.jazzcash_confirmed ? '#fafffe' : '#fffbf5' }}>
                      <td style={{ padding: '12px 14px', fontSize: '12px', color: '#555', whiteSpace: 'nowrap' }}>
                        {new Date(e.delivered_at).toLocaleDateString('en-PK')}<br />
                        <span style={{ color: '#aaa', fontSize: '11px' }}>{new Date(e.delivered_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {e.customers ? (
                          <div>
                            <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>{e.customers.full_name}</p>
                            <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{e.customers.mobile}</p>
                          </div>
                        ) : <span style={{ fontSize: '12px', color: '#888' }}>Walk-in</span>}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '13px', color: '#555' }}>{e.riders?.full_name || '—'}</td>
                      <td style={{ padding: '12px 14px', fontSize: '12px', color: '#555' }}>
                        {e.qty_19l > 0 ? `19L×${e.qty_19l} ` : ''}
                        {e.qty_half_litre > 0 ? `Half×${e.qty_half_litre} ` : ''}
                        {e.qty_1_5l > 0 ? `1.5L×${e.qty_1_5l}` : ''}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '14px', fontWeight: '700', color: '#0f4c81', whiteSpace: 'nowrap' }}>Rs. {Number(e.total_amount).toLocaleString()}</td>
                      <td style={{ padding: '12px 14px' }}>{statusBadge(e.jazzcash_confirmed, e.jazzcash_confirmed_at)}</td>
                      <td style={{ padding: '12px 14px' }}>{actionBtn(e.jazzcash_confirmed, () => confirmDelivery(e), () => unconfirmDelivery(e), 'd-' + e.id)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* JazzCash Payments */}
          {sectionHead('💵 JazzCash Payments (Balance Collections)', payments.filter(e => !e.jazzcash_confirmed).length)}
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            {payments.length === 0 ? (
              <p style={{ padding: '24px', textAlign: 'center', color: '#888', fontSize: '13px' }}>No JazzCash payments for this period.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    {['Date', 'Customer', 'Rider', 'Amount', 'Notes', 'Status', 'Action'].map(h => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: '11px', color: '#666', fontWeight: '600', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map(e => (
                    <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0', background: e.jazzcash_confirmed ? '#fafffe' : '#fffbf5' }}>
                      <td style={{ padding: '12px 14px', fontSize: '12px', color: '#555', whiteSpace: 'nowrap' }}>
                        {new Date(e.created_at).toLocaleDateString('en-PK')}<br />
                        <span style={{ color: '#aaa', fontSize: '11px' }}>{new Date(e.created_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {e.customers ? (
                          <div>
                            <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>{e.customers.full_name}</p>
                            <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{e.customers.mobile}</p>
                          </div>
                        ) : <span style={{ fontSize: '12px', color: '#888' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '13px', color: '#555' }}>{e.riders?.full_name || '—'}</td>
                      <td style={{ padding: '12px 14px', fontSize: '14px', fontWeight: '700', color: '#1a7a4a', whiteSpace: 'nowrap' }}>Rs. {Number(e.amount).toLocaleString()}</td>
                      <td style={{ padding: '12px 14px', fontSize: '12px', color: '#888', maxWidth: '160px' }}>{e.notes || '—'}</td>
                      <td style={{ padding: '12px 14px' }}>{statusBadge(e.jazzcash_confirmed, null)}</td>
                      <td style={{ padding: '12px 14px' }}>{actionBtn(e.jazzcash_confirmed, () => confirmPayment(e), () => unconfirmPayment(e), 'p-' + e.id)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}