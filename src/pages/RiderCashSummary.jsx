import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function RiderCashSummary({ rider }) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedSection, setExpandedSection] = useState(null)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [lastTransferDate, setLastTransferDate] = useState(null)
  const [mode, setMode] = useState('today')

  useEffect(() => { fetchSummary() }, [selectedDate, mode])

  async function fetchSummary() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    // Find last confirmed transfer to office
    const { data: lastTransfer } = await supabase
      .from('cash_transfers')
      .select('confirmed_at, transfer_date, amount')
      .eq('from_rider_id', rider.id)
      .eq('to_office', true)
      .eq('status', 'confirmed')
      .order('confirmed_at', { ascending: false })
      .limit(1)
      .single()

    const lastTransferTimestamp = lastTransfer?.confirmed_at || null
    setLastTransferDate(lastTransferTimestamp)

    let fromTimestamp, toTimestamp

    if (mode === 'today') {
      fromTimestamp = selectedDate + 'T00:00:00'
      toTimestamp = selectedDate + 'T23:59:59'
    } else {
      // Since last transfer — use exact timestamp
      fromTimestamp = lastTransferTimestamp || '2024-01-01T00:00:00'
      toTimestamp = today + 'T23:59:59'
    }

    const { data: deliveries } = await supabase.from('deliveries')
      .select('*, customers(full_name, customer_code)')
      .eq('rider_id', rider.id)
      .gt('delivered_at', fromTimestamp)
      .lte('delivered_at', toTimestamp)
      .eq('is_voided', false)

    const { data: cashPayments } = await supabase.from('payments')
      .select('*, customers(full_name, customer_code)')
      .eq('rider_id', rider.id)
      .eq('payment_method', 'cash')
      .gt('created_at', fromTimestamp)
      .lte('created_at', toTimestamp)
      .eq('is_voided', false)

    const { data: expenses } = await supabase.from('expenses')
      .select('*')
      .eq('rider_id', rider.id)
      .gt('created_at', fromTimestamp)
      .lte('created_at', toTimestamp)
      .eq('is_voided', false)

    const { data: sentTransfers } = await supabase.from('cash_transfers')
      .select('*')
      .eq('from_rider_id', rider.id)
      .eq('status', 'confirmed')
      .gt('confirmed_at', fromTimestamp)
      .lte('confirmed_at', toTimestamp)

    const { data: receivedTransfers } = await supabase.from('cash_transfers')
      .select('*')
      .eq('to_rider_id', rider.id)
      .eq('status', 'confirmed')
      .gt('confirmed_at', fromTimestamp)
      .lte('confirmed_at', toTimestamp)

    const { data: advancesGiven } = await supabase.from('salary_advances')
      .select('*, riders(full_name)')
      .eq('requested_from', rider.is_main_rider ? 'main_rider' : 'ceo')
      .eq('status', 'approved')
      .gt('approved_at', fromTimestamp)
      .lte('approved_at', toTimestamp)

    let cashFromSales = 0, jazzFromSales = 0, jazzFromSalesPending = 0, creditSales = 0
    const cashDeliveries = [], jazzDeliveries = [], creditDeliveries = []

    deliveries?.forEach(d => {
      if (d.payment_method === 'cash') {
        cashFromSales += Number(d.amount_received)
        cashDeliveries.push(d)
      }
      if (d.payment_method === 'jazzcash') {
        if (d.jazzcash_confirmed) jazzFromSales += Number(d.total_amount)
        else jazzFromSalesPending += Number(d.total_amount)
        jazzDeliveries.push(d)
      }
      if (d.payment_method === 'credit') {
        creditSales += Number(d.total_amount)
        creditDeliveries.push(d)
      }
    })

    const cashFromPayments = cashPayments?.reduce((s, p) => s + Number(p.amount), 0) || 0
    const totalReceived = receivedTransfers?.reduce((s, t) => s + Number(t.amount), 0) || 0
    const totalExpenses = expenses?.reduce((s, e) => s + Number(e.amount), 0) || 0
    const totalSent = sentTransfers?.reduce((s, t) => s + Number(t.amount), 0) || 0
    const totalAdvancesGiven = advancesGiven?.reduce((s, a) => s + Number(a.amount), 0) || 0

    const totalCashIn = cashFromSales + cashFromPayments + totalReceived
    const totalCashOut = totalExpenses + totalSent + totalAdvancesGiven
    const cashToReturn = totalCashIn - totalCashOut

    setSummary({
      cashFromSales, cashFromPayments, totalReceived,
      jazzFromSales, jazzFromSalesPending, creditSales,
      totalCashIn, totalExpenses, totalSent, totalAdvancesGiven,
      totalCashOut, cashToReturn,
      cashDeliveries, jazzDeliveries, creditDeliveries,
      cashPayments: cashPayments || [],
      expenses: expenses || [],
      sentTransfers: sentTransfers || [],
      receivedTransfers: receivedTransfers || [],
      allDeliveries: deliveries || []
    })
    setLoading(false)
  }

  function toggleSection(key) {
    setExpandedSection(expandedSection === key ? null : key)
  }

  function SectionHeader({ sectionKey, title, amount, color, count }) {
    const isOpen = expandedSection === sectionKey
    return (
      <div onClick={() => toggleSection(sectionKey)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>{isOpen ? '▼' : '▶'}</span>
          <span style={{ fontSize: '13px', color: '#555', fontWeight: '600' }}>{title}</span>
          {count > 0 && <span style={{ fontSize: '10px', background: '#f0f0f0', color: '#888', padding: '2px 6px', borderRadius: '10px' }}>{count}</span>}
        </div>
        <span style={{ fontSize: '14px', fontWeight: '700', color }}>{amount >= 0 ? '' : '− '}Rs. {Math.abs(amount).toLocaleString()}</span>
      </div>
    )
  }

  function DeliveryRow({ d }) {
    const isCash = d.payment_method === 'cash'
    const creditPortion = Number(d.credit_amount || 0)
    const cashPortion = Number(d.amount_received || 0)
    return (
      <div style={{ padding: '10px 12px', background: '#f8f9fa', borderRadius: '8px', marginBottom: '6px', borderLeft: '3px solid ' + (isCash ? '#1a7a4a' : d.payment_method === 'jazzcash' ? '#9c27b0' : '#f44336') }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <p style={{ fontSize: '13px', fontWeight: '600', margin: 0, color: '#333' }}>
            {d.customers?.full_name || 'Walk-in'}
          </p>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {Number(d.total_amount).toLocaleString()}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
          {d.qty_19l > 0 && <span style={{ fontSize: '11px', background: '#e3f0ff', color: '#0f4c81', padding: '2px 6px', borderRadius: '6px' }}>19L×{d.qty_19l} @ Rs.{d.rate_applied}</span>}
          {d.qty_half_litre > 0 && <span style={{ fontSize: '11px', background: '#e3f0ff', color: '#0f4c81', padding: '2px 6px', borderRadius: '6px' }}>Half×{d.qty_half_litre}</span>}
          {d.qty_1_5l > 0 && <span style={{ fontSize: '11px', background: '#e3f0ff', color: '#0f4c81', padding: '2px 6px', borderRadius: '6px' }}>1.5L×{d.qty_1_5l}</span>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {isCash && cashPortion > 0 && <span style={{ fontSize: '11px', color: '#1a7a4a', fontWeight: '600' }}>💵 Rs. {cashPortion.toLocaleString()}</span>}
            {creditPortion > 0 && <span style={{ fontSize: '11px', color: '#f44336', fontWeight: '600' }}>📋 Rs. {creditPortion.toLocaleString()}</span>}
            {d.payment_method === 'jazzcash' && <span style={{ fontSize: '11px', color: '#9c27b0', fontWeight: '600' }}>📱 {d.jazzcash_confirmed ? '✅' : '⏳'}</span>}
          </div>
          <span style={{ fontSize: '10px', color: '#aaa' }}>
            {new Date(d.delivered_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    )
  }

  if (loading) return <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>

  const dateLabel = mode === 'today'
    ? new Date(selectedDate).toLocaleDateString('en-PK', { weekday: 'long', day: '2-digit', month: 'long' })
    : lastTransferDate
      ? `Since ${new Date(lastTransferDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
      : 'All time — no transfer yet'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: 0 }}>💰 Cash Summary</h2>
      </div>

      {/* Mode Selector */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button onClick={() => setMode('today')}
          style={{ flex: 1, padding: '10px', border: '2px solid', borderColor: mode === 'today' ? '#0f4c81' : '#eee', borderRadius: '10px', cursor: 'pointer', background: mode === 'today' ? '#0f4c81' : 'white', color: mode === 'today' ? 'white' : '#555', fontWeight: mode === 'today' ? '700' : '400', fontSize: '13px' }}>
          📅 Today
        </button>
        <button onClick={() => setMode('since_transfer')}
          style={{ flex: 1, padding: '10px', border: '2px solid', borderColor: mode === 'since_transfer' ? '#0f4c81' : '#eee', borderRadius: '10px', cursor: 'pointer', background: mode === 'since_transfer' ? '#0f4c81' : 'white', color: mode === 'since_transfer' ? 'white' : '#555', fontWeight: mode === 'since_transfer' ? '700' : '400', fontSize: '13px' }}>
          📊 Since Last Transfer
        </button>
      </div>

      {/* Date picker for today mode */}
      {mode === 'today' && (
        <div style={{ marginBottom: '12px' }}>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
        </div>
      )}

      {/* Date range info */}
      <div style={{ background: '#f0f7ff', borderRadius: '10px', padding: '10px 14px', marginBottom: '12px' }}>
        <p style={{ fontSize: '12px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>📅 {dateLabel}</p>
        {mode === 'since_transfer' && !lastTransferDate && (
          <p style={{ fontSize: '11px', color: '#e65100', margin: '4px 0 0' }}>⚠️ No transfer recorded yet — showing all cash since start</p>
        )}
        {mode === 'since_transfer' && lastTransferDate && (
          <p style={{ fontSize: '11px', color: '#888', margin: '4px 0 0' }}>Showing all cash collected after your last transfer to office</p>
        )}
      </div>

      {/* Cash Banner */}
      <div style={{
        background: summary.cashToReturn <= 0 ? '#1a7a4a' : 'linear-gradient(135deg, #0f4c81, #1a7a4a)',
        color: 'white', borderRadius: '14px', padding: '20px',
        marginBottom: '16px', textAlign: 'center',
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)'
      }}>
        <p style={{ fontSize: '13px', opacity: 0.8, margin: '0 0 6px' }}>
          {summary.cashToReturn <= 0 ? '✅ All Cash Transferred' : '💵 Cash in Hand'}
        </p>
        <p style={{ fontSize: '42px', fontWeight: '700', margin: '0 0 6px' }}>
          Rs. {Math.max(0, summary.cashToReturn).toLocaleString()}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', opacity: 0.7 }}>
          <span style={{ fontSize: '12px' }}>In: Rs. {summary.totalCashIn.toLocaleString()}</span>
          <span style={{ fontSize: '12px' }}>Out: Rs. {summary.totalCashOut.toLocaleString()}</span>
        </div>
      </div>

      {/* CASH IN */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#1a7a4a', marginBottom: '4px' }}>📥 CASH IN</p>
        <p style={{ fontSize: '11px', color: '#888', margin: '0 0 12px' }}>Tap any row to see details</p>

        <SectionHeader sectionKey="cashDeliveries" title="Cash from Deliveries" amount={summary.cashFromSales} color="#1a7a4a" count={summary.cashDeliveries.length} />
        {expandedSection === 'cashDeliveries' && (
          <div style={{ paddingTop: '10px', paddingBottom: '4px' }}>
            {summary.cashDeliveries.length === 0
              ? <p style={{ fontSize: '12px', color: '#888', textAlign: 'center', padding: '10px 0' }}>No cash deliveries</p>
              : summary.cashDeliveries.map(d => <DeliveryRow key={d.id} d={d} />)}
          </div>
        )}

        <SectionHeader sectionKey="cashPayments" title="Cash from Balance Collections" amount={summary.cashFromPayments} color="#1a7a4a" count={summary.cashPayments.length} />
        {expandedSection === 'cashPayments' && (
          <div style={{ paddingTop: '10px', paddingBottom: '4px' }}>
            {summary.cashPayments.length === 0
              ? <p style={{ fontSize: '12px', color: '#888', textAlign: 'center', padding: '10px 0' }}>No cash collections</p>
              : summary.cashPayments.map(p => (
                <div key={p.id} style={{ padding: '10px 12px', background: '#f8f9fa', borderRadius: '8px', marginBottom: '6px', borderLeft: '3px solid #1a7a4a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>{p.customers?.full_name}</p>
                    <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{new Date(p.created_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>Rs. {Number(p.amount).toLocaleString()}</p>
                </div>
              ))}
          </div>
        )}

        {summary.totalReceived > 0 && (
          <>
            <SectionHeader sectionKey="receivedTransfers" title="Received from Other Riders" amount={summary.totalReceived} color="#1a7a4a" count={summary.receivedTransfers.length} />
            {expandedSection === 'receivedTransfers' && (
              <div style={{ paddingTop: '10px', paddingBottom: '4px' }}>
                {summary.receivedTransfers.map(t => (
                  <div key={t.id} style={{ padding: '10px 12px', background: '#f8f9fa', borderRadius: '8px', marginBottom: '6px', borderLeft: '3px solid #1a7a4a', display: 'flex', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: '13px', color: '#555', margin: 0 }}>Transfer received</p>
                    <p style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>Rs. {Number(t.amount).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', marginTop: '4px', borderTop: '2px solid #e8f5e9' }}>
          <span style={{ fontSize: '14px', fontWeight: '700', color: '#333' }}>Total Cash In</span>
          <span style={{ fontSize: '18px', fontWeight: '700', color: '#1a7a4a' }}>Rs. {summary.totalCashIn.toLocaleString()}</span>
        </div>
      </div>

      {/* CASH OUT */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#f44336', marginBottom: '12px' }}>📤 CASH OUT</p>

        <SectionHeader sectionKey="expenses" title="Field Expenses" amount={summary.totalExpenses} color="#e65100" count={summary.expenses.length} />
        {expandedSection === 'expenses' && (
          <div style={{ paddingTop: '10px', paddingBottom: '4px' }}>
            {summary.expenses.length === 0
              ? <p style={{ fontSize: '12px', color: '#888', textAlign: 'center', padding: '10px 0' }}>No expenses</p>
              : summary.expenses.map(e => (
                <div key={e.id} style={{ padding: '10px 12px', background: '#f8f9fa', borderRadius: '8px', marginBottom: '6px', borderLeft: '3px solid #e65100', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px', textTransform: 'capitalize' }}>{e.expense_type}</p>
                    {e.description && <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{e.description}</p>}
                  </div>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: '#e65100', margin: 0 }}>Rs. {Number(e.amount).toLocaleString()}</p>
                </div>
              ))}
          </div>
        )}

        <SectionHeader sectionKey="sentTransfers" title="Cash Transferred Out" amount={summary.totalSent} color="#e65100" count={summary.sentTransfers.length} />
        {expandedSection === 'sentTransfers' && (
          <div style={{ paddingTop: '10px', paddingBottom: '4px' }}>
            {summary.sentTransfers.length === 0
              ? <p style={{ fontSize: '12px', color: '#888', textAlign: 'center', padding: '10px 0' }}>No transfers made</p>
              : summary.sentTransfers.map(t => (
                <div key={t.id} style={{ padding: '10px 12px', background: '#f8f9fa', borderRadius: '8px', marginBottom: '6px', borderLeft: '3px solid #e65100', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontSize: '13px', fontWeight: '600', margin: 0 }}>{t.to_office ? '🏢 To Office' : '⭐ To Main Rider'}</p>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: '#e65100', margin: 0 }}>Rs. {Number(t.amount).toLocaleString()}</p>
                </div>
              ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', marginTop: '4px', borderTop: '2px solid #ffebee' }}>
          <span style={{ fontSize: '14px', fontWeight: '700', color: '#333' }}>Total Cash Out</span>
          <span style={{ fontSize: '18px', fontWeight: '700', color: '#f44336' }}>Rs. {summary.totalCashOut.toLocaleString()}</span>
        </div>
      </div>

      {/* NON-CASH */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#9c27b0', marginBottom: '12px' }}>📱 NON-CASH (Informational)</p>

        <SectionHeader sectionKey="jazz" title="JazzCash Sales" amount={summary.jazzFromSales + summary.jazzFromSalesPending} color="#9c27b0" count={summary.jazzDeliveries.length} />
        {expandedSection === 'jazz' && (
          <div style={{ paddingTop: '10px', paddingBottom: '4px' }}>
            {summary.jazzDeliveries.length === 0
              ? <p style={{ fontSize: '12px', color: '#888', textAlign: 'center', padding: '10px 0' }}>No JazzCash entries</p>
              : summary.jazzDeliveries.map(d => <DeliveryRow key={d.id} d={d} />)}
          </div>
        )}

        <SectionHeader sectionKey="credit" title="Credit Sales (ادھار)" amount={summary.creditSales} color="#f44336" count={summary.creditDeliveries.length} />
        {expandedSection === 'credit' && (
          <div style={{ paddingTop: '10px', paddingBottom: '4px' }}>
            {summary.creditDeliveries.length === 0
              ? <p style={{ fontSize: '12px', color: '#888', textAlign: 'center', padding: '10px 0' }}>No credit sales</p>
              : summary.creditDeliveries.map(d => <DeliveryRow key={d.id} d={d} />)}
          </div>
        )}
      </div>

      {/* RECONCILIATION */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #e3f0ff' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81', marginBottom: '12px' }}>🔍 RECONCILIATION</p>
        {[
          { label: 'Cash from Deliveries', value: summary.cashFromSales, color: '#1a7a4a' },
          { label: 'Cash from Collections', value: summary.cashFromPayments, color: '#1a7a4a' },
          { label: 'Received from Riders', value: summary.totalReceived, color: '#1a7a4a' },
          { label: '− Field Expenses', value: -summary.totalExpenses, color: '#f44336' },
          { label: '− Cash Transferred Out', value: -summary.totalSent, color: '#f44336' },
        ].filter(r => r.value !== 0).map(r => (
          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: '13px', color: '#555' }}>{r.label}</span>
            <span style={{ fontSize: '13px', fontWeight: '700', color: r.color }}>
              {r.value < 0 ? '− ' : '+ '}Rs. {Math.abs(r.value).toLocaleString()}
            </span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', marginTop: '4px', borderTop: '2px solid #0f4c81' }}>
          <span style={{ fontSize: '15px', fontWeight: '700', color: '#0f4c81' }}>Cash in Hand</span>
          <span style={{ fontSize: '22px', fontWeight: '700', color: summary.cashToReturn >= 0 ? '#0f4c81' : '#f44336' }}>
            Rs. {summary.cashToReturn.toLocaleString()}
          </span>
        </div>
        <p style={{ fontSize: '11px', color: '#888', margin: '8px 0 0', textAlign: 'center' }}>
          Count your physical cash and match with above
        </p>
      </div>

      <button onClick={fetchSummary}
        style={{ width: '100%', padding: '12px', background: '#f0f4ff', color: '#0f4c81', border: '1px solid #c8d8ff', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
        🔄 Refresh
      </button>
    </div>
  )
}