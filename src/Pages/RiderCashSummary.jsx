import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function RiderCashSummary({ rider }) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchSummary() }, [])

  async function fetchSummary() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

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

    // Cash already transferred out by this rider today (confirmed)
    const { data: sentTransfers } = await supabase.from('cash_transfers')
      .select('*').eq('from_rider_id', rider.id)
      .eq('status', 'confirmed').eq('transfer_date', today)

    // Salary advances given out today (if main rider)
    const { data: advancesGiven } = await supabase.from('salary_advances')
      .select('*')
      .eq('requested_from', rider.is_main_rider ? 'main_rider' : 'ceo')
      .eq('status', 'approved')
      .gte('approved_at', today + 'T00:00:00')

    let cashFromSales = 0, jazzSalePending = 0, jazzSaleConfirmed = 0
    let creditSales = 0, totalDeliveries = 0, partialCreditFromSales = 0

    deliveries?.forEach(d => {
      totalDeliveries++
      if (d.payment_method === 'cash') cashFromSales += Number(d.amount_received)
      if (d.payment_method === 'jazzcash') {
        if (d.jazzcash_confirmed) jazzSaleConfirmed += Number(d.total_amount)
        else jazzSalePending += Number(d.total_amount)
      }
      if (d.payment_method === 'credit') creditSales += Number(d.total_amount)
      // Partial payments — cash received less than total
      if (d.payment_method === 'cash' && Number(d.credit_amount) > 0) {
        partialCreditFromSales += Number(d.credit_amount)
      }
    })

    const cashFromPayments = cashPayments?.reduce((s, p) => s + Number(p.amount), 0) || 0
    const jazzPaymentPending = 0
    const jazzPaymentConfirmed = 0
    const totalExpenses = expenses?.reduce((s, e) => s + Number(e.amount), 0) || 0
    const totalReceived = receivedTransfers?.reduce((s, t) => s + Number(t.amount), 0) || 0
    const totalSent = sentTransfers?.reduce((s, t) => s + Number(t.amount), 0) || 0
    const totalAdvancesGiven = advancesGiven?.reduce((s, a) => s + Number(a.amount), 0) || 0

    const totalCashInHand = cashFromSales + cashFromPayments + totalReceived
    const cashToReturn = totalCashInHand - totalExpenses - totalSent - totalAdvancesGiven

    setSummary({
      cashFromSales, cashFromPayments, totalCashInHand,
      jazzSalePending, jazzSaleConfirmed,
      jazzPaymentPending, jazzPaymentConfirmed,
      creditSales, partialCreditFromSales,
      totalExpenses, totalSent, totalAdvancesGiven,
      cashToReturn, totalDeliveries,
      expenses: expenses || [],
      deliveries: deliveries || [],
      cashPayments: cashPayments || [],
      sentTransfers: sentTransfers || []
    })
    setLoading(false)
  }

  if (loading) return <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>💰 Today's Cash Summary</h2>

      {/* Cash Received */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>Cash Received</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
          <span style={{ fontSize: '13px', color: '#555' }}>💵 Cash from Sales</span>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#1a7a4a' }}>Rs. {summary.cashFromSales.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
          <span style={{ fontSize: '13px', color: '#555' }}>💵 Cash from Balance Collection</span>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#1a7a4a' }}>Rs. {summary.cashFromPayments.toLocaleString()}</span>
        </div>
        {summary.totalReceived > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: '13px', color: '#555' }}>💵 Received from Other Riders</span>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#1a7a4a' }}>Rs. {(summary.totalCashInHand - summary.cashFromSales - summary.cashFromPayments).toLocaleString()}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
          <span style={{ fontSize: '14px', fontWeight: '700', color: '#333' }}>Total Cash in Hand</span>
          <span style={{ fontSize: '16px', fontWeight: '700', color: '#0f4c81' }}>Rs. {summary.totalCashInHand.toLocaleString()}</span>
        </div>
      </div>

      {/* Deductions */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>Deductions</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
          <span style={{ fontSize: '13px', color: '#555' }}>💸 Expenses</span>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#e65100' }}>− Rs. {summary.totalExpenses.toLocaleString()}</span>
        </div>
        {summary.totalSent > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: '13px', color: '#555' }}>🔄 Cash Already Transferred</span>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#e65100' }}>− Rs. {summary.totalSent.toLocaleString()}</span>
          </div>
        )}
        {summary.totalAdvancesGiven > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: '13px', color: '#555' }}>💼 Salary Advances Given</span>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#e65100' }}>− Rs. {summary.totalAdvancesGiven.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* JazzCash */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>JazzCash (Goes to Office Directly)</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
          <span style={{ fontSize: '13px', color: '#555' }}>⏳ Pending Confirmation</span>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#e65100' }}>Rs. {summary.jazzSalePending.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
          <span style={{ fontSize: '13px', color: '#555' }}>✅ Confirmed</span>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#9c27b0' }}>Rs. {summary.jazzSaleConfirmed.toLocaleString()}</span>
        </div>
      </div>

      {/* Other Stats */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
          <span style={{ fontSize: '13px', color: '#555' }}>📦 Total Deliveries</span>
          <span style={{ fontSize: '13px', fontWeight: '700' }}>{summary.totalDeliveries}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
          <span style={{ fontSize: '13px', color: '#555' }}>📋 Credit Sales</span>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#f44336' }}>Rs. {summary.creditSales.toLocaleString()}</span>
        </div>
        {summary.partialCreditFromSales > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: '13px', color: '#555' }}>📋 Partial Credit (from sales)</span>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#f44336' }}>Rs. {summary.partialCreditFromSales.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Cash to Return */}
      <div style={{
        background: summary.cashToReturn <= 0 ? '#1a7a4a' : '#0f4c81',
        color: 'white', borderRadius: '12px',
        padding: '20px', marginBottom: '12px', textAlign: 'center'
      }}>
        <p style={{ fontSize: '13px', opacity: 0.8, margin: '0 0 6px' }}>
          {summary.cashToReturn <= 0 ? '✅ All Cash Transferred' : 'Cash to Return to Office'}
        </p>
        <p style={{ fontSize: '40px', fontWeight: '700', margin: '0 0 6px' }}>
          Rs. {Math.max(0, summary.cashToReturn).toLocaleString()}
        </p>
        <p style={{ fontSize: '12px', opacity: 0.7, margin: 0 }}>
          {summary.totalCashInHand.toLocaleString()} − {summary.totalExpenses.toLocaleString()} expenses
          {summary.totalSent > 0 ? ` − ${summary.totalSent.toLocaleString()} transferred` : ''}
        </p>
      </div>

      {/* Sent Transfers Today */}
      {summary.sentTransfers.length > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>✅ Cash Transferred Today</p>
          {summary.sentTransfers.map(t => (
            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <p style={{ fontSize: '13px', color: '#555', margin: 0 }}>
                {t.to_office ? '🏢 To Office' : '⭐ To Main Rider'}
              </p>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>Rs. {Number(t.amount).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* Expenses Detail */}
      {summary.expenses.length > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>Today's Expenses</p>
          {summary.expenses.map(e => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <p style={{ fontSize: '13px', margin: 0, textTransform: 'capitalize' }}>
                {e.expense_type} {e.description ? '— ' + e.description : ''}
              </p>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#e65100', margin: 0 }}>Rs. {Number(e.amount).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      <button onClick={fetchSummary}
        style={{
          width: '100%', padding: '12px', background: '#f0f4ff', color: '#0f4c81',
          border: '1px solid #c8d8ff', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600'
        }}>
        🔄 Refresh
      </button>
    </div>
  )
}