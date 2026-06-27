import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const TRANSACTION_TYPES = [
  { key: 'all', label: 'All Transactions' },
  { key: 'deliveries', label: '📦 Deliveries' },
  { key: 'payments', label: '💵 Payments' },
  { key: 'expenses', label: '💸 Expenses' },
  { key: 'office_expenses', label: '🏢 Office Expenses' },
  { key: 'cash_transfers', label: '🔄 Cash Transfers' },
  { key: 'salary_advances', label: '💼 Salary Advances' },
]

export default function Transactions() {
  const [activeType, setActiveType] = useState('all')
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showVoided, setShowVoided] = useState(false)
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 7) + '-01')
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [search, setSearch] = useState('')
  const [selectedTx, setSelectedTx] = useState(null)
  const [showVoidForm, setShowVoidForm] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [processing, setProcessing] = useState(false)

  useEffect(() => { fetchTransactions() }, [activeType, dateFrom, dateTo, showVoided])

  async function fetchTransactions() {
    setLoading(true)
    const all = []

    if (activeType === 'all' || activeType === 'deliveries') {
      const { data } = await supabase.from('deliveries')
        .select('*, customers(full_name, customer_code), riders(full_name)')
        .gte('delivered_at', dateFrom + 'T00:00:00')
        .lte('delivered_at', dateTo + 'T23:59:59')
        .eq('is_voided', showVoided)
        .order('delivered_at', { ascending: false })
      data?.forEach(d => all.push({
        id: d.id, type: 'delivery', table: 'deliveries',
        date: d.delivered_at,
        description: `Delivery — ${d.qty_19l || 0}×19L ${d.qty_half_litre || 0}×Half ${d.qty_1_5l || 0}×1.5L`,
        party: d.customers?.full_name || 'Walk-in',
        party_code: d.customers?.customer_code || '—',
        rider: d.riders?.full_name || '—',
        amount: Number(d.total_amount),
        payment_method: d.payment_method,
        is_voided: d.is_voided,
        void_reason: d.void_reason,
        voided_at: d.voided_at,
        raw: d
      }))
    }

    if (activeType === 'all' || activeType === 'payments') {
      const { data } = await supabase.from('payments')
        .select('*, customers(full_name, customer_code), riders(full_name)')
        .gte('payment_date', dateFrom)
        .lte('payment_date', dateTo)
        .eq('is_voided', showVoided)
        .order('created_at', { ascending: false })
      data?.forEach(p => all.push({
        id: p.id, type: 'payment', table: 'payments',
        date: p.created_at,
        description: `Payment — ${p.payment_method}${!p.jazzcash_confirmed && p.payment_method === 'jazzcash' ? ' (Pending)' : ''}`,
        party: p.customers?.full_name || '—',
        party_code: p.customers?.customer_code || '—',
        rider: p.riders?.full_name || '—',
        amount: Number(p.amount),
        payment_method: p.payment_method,
        is_voided: p.is_voided,
        void_reason: p.void_reason,
        voided_at: p.voided_at,
        raw: p
      }))
    }

    if (activeType === 'all' || activeType === 'expenses') {
      const { data } = await supabase.from('expenses')
        .select('*, riders(full_name)')
        .gte('expense_date', dateFrom)
        .lte('expense_date', dateTo)
        .eq('is_voided', showVoided)
        .order('created_at', { ascending: false })
      data?.forEach(e => all.push({
        id: e.id, type: 'expense', table: 'expenses',
        date: e.created_at,
        description: `Expense — ${e.expense_type}${e.description ? ': ' + e.description : ''}`,
        party: '—',
        party_code: '—',
        rider: e.riders?.full_name || '—',
        amount: Number(e.amount),
        payment_method: 'cash',
        is_voided: e.is_voided,
        void_reason: e.void_reason,
        voided_at: e.voided_at,
        raw: e
      }))
    }

    if (activeType === 'all' || activeType === 'office_expenses') {
      const { data } = await supabase.from('office_expenses')
        .select('*')
        .gte('expense_date', dateFrom)
        .lte('expense_date', dateTo)
        .eq('is_voided', showVoided)
        .order('created_at', { ascending: false })
      data?.forEach(e => all.push({
        id: e.id, type: 'office_expense', table: 'office_expenses',
        date: e.created_at,
        description: `Office Expense — ${e.category}${e.description ? ': ' + e.description : ''}`,
        party: '—',
        party_code: '—',
        rider: '—',
        amount: Number(e.amount),
        payment_method: 'cash',
        is_voided: e.is_voided,
        void_reason: e.void_reason,
        voided_at: e.voided_at,
        raw: e
      }))
    }

    if (activeType === 'all' || activeType === 'cash_transfers') {
      const { data } = await supabase.from('cash_transfers')
        .select('*, from_rider:from_rider_id(full_name)')
        .gte('transfer_date', dateFrom)
        .lte('transfer_date', dateTo)
        .eq('is_voided', showVoided)
        .order('created_at', { ascending: false })
      data?.forEach(t => all.push({
        id: t.id, type: 'cash_transfer', table: 'cash_transfers',
        date: t.created_at,
        description: `Cash Transfer — ${t.to_office ? 'To Office' : 'To Main Rider'} — ${t.status}`,
        party: '—',
        party_code: '—',
        rider: t.from_rider?.full_name || '—',
        amount: Number(t.amount),
        payment_method: 'cash',
        is_voided: t.is_voided,
        void_reason: t.void_reason,
        voided_at: t.voided_at,
        raw: t
      }))
    }

    if (activeType === 'all' || activeType === 'salary_advances') {
      const { data } = await supabase.from('salary_advances')
        .select('*, riders(full_name)')
        .gte('created_at', dateFrom + 'T00:00:00')
        .lte('created_at', dateTo + 'T23:59:59')
        .eq('is_voided', showVoided)
        .order('created_at', { ascending: false })
      data?.forEach(a => all.push({
        id: a.id, type: 'salary_advance', table: 'salary_advances',
        date: a.created_at,
        description: `Salary Advance — ${a.status} — from ${a.requested_from}`,
        party: '—',
        party_code: '—',
        rider: a.riders?.full_name || '—',
        amount: Number(a.amount),
        payment_method: 'cash',
        is_voided: a.is_voided,
        void_reason: a.void_reason,
        voided_at: a.voided_at,
        raw: a
      }))
    }

    all.sort((a, b) => new Date(b.date) - new Date(a.date))
    setTransactions(all)
    setLoading(false)
  }

  async function voidTransaction() {
    if (!voidReason.trim()) return alert('Please enter a reason for voiding')
    setProcessing(true)

    const tx = selectedTx
    const now = new Date().toISOString()

    await supabase.from(tx.table).update({
      is_voided: true,
      voided_at: now,
      voided_by: 'Admin',
      void_reason: voidReason
    }).eq('id', tx.id)

    // Reverse effects
    if (tx.type === 'delivery' && tx.raw.customer_id) {
      // Reverse customer balance
      const creditPortion = Number(tx.raw.credit_amount || 0)
      if (creditPortion > 0) {
        const { data: customer } = await supabase.from('customers').select('balance').eq('id', tx.raw.customer_id).single()
        if (customer) {
          await supabase.from('customers').update({ balance: Number(customer.balance) - creditPortion }).eq('id', tx.raw.customer_id)
        }
      }
      // Reverse order status if linked
      if (tx.raw.order_id) {
        await supabase.from('orders').update({ status: 'assigned', completed_at: null }).eq('id', tx.raw.order_id)
      }
    }

    if (tx.type === 'payment' && tx.raw.customer_id && tx.raw.jazzcash_confirmed) {
      const { data: customer } = await supabase.from('customers').select('balance').eq('id', tx.raw.customer_id).single()
      if (customer) {
        await supabase.from('customers').update({ balance: Number(customer.balance) + Number(tx.raw.amount) }).eq('id', tx.raw.customer_id)
      }
    }

    setShowVoidForm(false)
    setSelectedTx(null)
    setVoidReason('')
    setProcessing(false)
    fetchTransactions()
    alert('Transaction voided successfully. Customer balance has been adjusted.')
  }

  async function restoreTransaction() {
    if (!window.confirm('Restore this transaction? Customer balance will be re-applied.')) return
    setProcessing(true)

    const tx = selectedTx

    await supabase.from(tx.table).update({
      is_voided: false,
      voided_at: null,
      voided_by: null,
      void_reason: null
    }).eq('id', tx.id)

    // Re-apply effects
    if (tx.type === 'delivery' && tx.raw.customer_id) {
      const creditPortion = Number(tx.raw.credit_amount || 0)
      if (creditPortion > 0) {
        const { data: customer } = await supabase.from('customers').select('balance').eq('id', tx.raw.customer_id).single()
        if (customer) {
          await supabase.from('customers').update({ balance: Number(customer.balance) + creditPortion }).eq('id', tx.raw.customer_id)
        }
      }
    }

    if (tx.type === 'payment' && tx.raw.customer_id && tx.raw.jazzcash_confirmed) {
      const { data: customer } = await supabase.from('customers').select('balance').eq('id', tx.raw.customer_id).single()
      if (customer) {
        await supabase.from('customers').update({ balance: Number(customer.balance) - Number(tx.raw.amount) }).eq('id', tx.raw.customer_id)
      }
    }

    setSelectedTx(null)
    setProcessing(false)
    fetchTransactions()
    alert('Transaction restored successfully.')
  }

  const filtered = transactions.filter(t =>
    !search ||
    t.party?.toLowerCase().includes(search.toLowerCase()) ||
    t.description?.toLowerCase().includes(search.toLowerCase()) ||
    t.rider?.toLowerCase().includes(search.toLowerCase()) ||
    t.party_code?.toLowerCase().includes(search.toLowerCase())
  )

  const totalAmount = filtered.reduce((s, t) => s + t.amount, 0)

  const typeColors = {
    delivery: { bg: '#e3f0ff', color: '#0f4c81', label: '📦 Delivery' },
    payment: { bg: '#e8f5e9', color: '#1a7a4a', label: '💵 Payment' },
    expense: { bg: '#fff3e0', color: '#e65100', label: '💸 Expense' },
    office_expense: { bg: '#fff3e0', color: '#e65100', label: '🏢 Office Expense' },
    cash_transfer: { bg: '#f3e5f5', color: '#7b1fa2', label: '🔄 Transfer' },
    salary_advance: { bg: '#fce4ec', color: '#c62828', label: '💼 Advance' },
  }

  const paymentColors = {
    cash: '#1a7a4a',
    jazzcash: '#9c27b0',
    credit: '#f44336'
  }

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>🗂️ Transaction Ledger</h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>View, void and restore all business transactions.</p>
      </div>

      {/* Filters */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Search</label>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search customer, rider, description..."
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', background: showVoided ? '#ffebee' : '#f0f4ff', borderRadius: '8px', cursor: 'pointer', border: '1px solid ' + (showVoided ? '#ffcdd2' : '#c8d8ff') }}
            onClick={() => setShowVoided(!showVoided)}>
            <span style={{ fontSize: '13px', color: showVoided ? '#c62828' : '#0f4c81', fontWeight: '600' }}>
              {showVoided ? '🗑️ Showing Voided' : '✅ Showing Active'}
            </span>
          </div>
          <button onClick={fetchTransactions}
            style={{ padding: '8px 16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Type Filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {TRANSACTION_TYPES.map(t => (
          <button key={t.key} onClick={() => setActiveType(t.key)}
            style={{
              padding: '7px 14px', border: 'none', borderRadius: '8px', cursor: 'pointer',
              background: activeType === t.key ? '#0f4c81' : '#f0f0f0',
              color: activeType === t.key ? 'white' : '#555',
              fontWeight: activeType === t.key ? '700' : '400', fontSize: '12px'
            }}>{t.label}</button>
        ))}
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <div style={{ background: 'white', borderRadius: '10px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
          <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>Total Transactions</p>
          <p style={{ fontSize: '22px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>{filtered.length}</p>
        </div>
        <div style={{ background: 'white', borderRadius: '10px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
          <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>Total Amount</p>
          <p style={{ fontSize: '22px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>Rs. {totalAmount.toLocaleString()}</p>
        </div>
        <div style={{ background: 'white', borderRadius: '10px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
          <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>{showVoided ? 'Voided' : 'Active'} Entries</p>
          <p style={{ fontSize: '22px', fontWeight: '700', color: showVoided ? '#f44336' : '#1a7a4a', margin: 0 }}>{filtered.length}</p>
        </div>
      </div>

      {/* Void Form */}
      {showVoidForm && selectedTx && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #ffcdd2' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#c62828', margin: '0 0 12px' }}>🗑️ Void Transaction</h3>
          <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '12px', marginBottom: '14px' }}>
            <p style={{ fontSize: '13px', fontWeight: '600', color: '#333', margin: '0 0 4px' }}>{selectedTx.description}</p>
            <p style={{ fontSize: '12px', color: '#555', margin: '0 0 2px' }}>Party: {selectedTx.party} · Rider: {selectedTx.rider}</p>
            <p style={{ fontSize: '14px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {selectedTx.amount.toLocaleString()}</p>
          </div>
          <div style={{ background: '#fff3e0', borderRadius: '8px', padding: '10px', marginBottom: '14px' }}>
            <p style={{ fontSize: '12px', color: '#e65100', margin: 0 }}>
              ⚠️ Voiding this transaction will automatically reverse any balance changes on the customer account.
            </p>
          </div>
          <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>Reason for Voiding *</label>
          <input value={voidReason} onChange={e => setVoidReason(e.target.value)}
            placeholder="e.g. Wrong amount entered, duplicate entry, customer cancelled..."
            style={{ width: '100%', padding: '10px 12px', border: '2px solid #ffcdd2', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '14px' }} />
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => { setShowVoidForm(false); setSelectedTx(null); setVoidReason('') }}
              style={{ flex: 1, padding: '10px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
              Cancel
            </button>
            <button onClick={voidTransaction} disabled={processing}
              style={{ flex: 2, padding: '10px', background: '#c62828', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '700' }}>
              {processing ? 'Processing...' : '🗑️ Confirm Void'}
            </button>
          </div>
        </div>
      )}

      {/* Transactions Table */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'auto' }}>
        {loading ? (
          <p style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</p>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <p style={{ fontSize: '32px', marginBottom: '8px' }}>📋</p>
            <p style={{ color: '#888' }}>No transactions found for this period.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                {['Date', 'Type', 'Description', 'Party', 'Rider', 'Amount', 'Method', 'Status', 'Action'].map(h => (
                  <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: '11px', color: '#666', fontWeight: '600', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx, idx) => {
                const typeInfo = typeColors[tx.type] || { bg: '#f0f0f0', color: '#555', label: tx.type }
                return (
                  <tr key={tx.id + tx.type} style={{ borderBottom: '1px solid #f0f0f0', background: tx.is_voided ? '#fff8f8' : idx % 2 === 0 ? 'white' : '#fafafa', opacity: tx.is_voided ? 0.7 : 1 }}>
                    <td style={{ padding: '10px 14px', fontSize: '12px', color: '#555', whiteSpace: 'nowrap' }}>
                      {new Date(tx.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                      <p style={{ fontSize: '10px', color: '#aaa', margin: '2px 0 0' }}>
                        {new Date(tx.date).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: '700', background: typeInfo.bg, color: typeInfo.color, whiteSpace: 'nowrap' }}>
                        {typeInfo.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '12px', color: '#333', maxWidth: '200px' }}>
                      {tx.description}
                      {tx.is_voided && tx.void_reason && (
                        <p style={{ fontSize: '10px', color: '#f44336', margin: '2px 0 0' }}>Void: {tx.void_reason}</p>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '12px', color: '#555' }}>
                      <p style={{ margin: '0 0 2px', fontWeight: '600' }}>{tx.party}</p>
                      {tx.party_code !== '—' && <p style={{ margin: 0, fontSize: '10px', color: '#aaa' }}>{tx.party_code}</p>}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '12px', color: '#555' }}>{tx.rider}</td>
                    <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: '700', color: '#0f4c81', whiteSpace: 'nowrap' }}>
                      Rs. {tx.amount.toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: paymentColors[tx.payment_method] || '#555' }}>
                        {tx.payment_method === 'cash' ? '💵 Cash' : tx.payment_method === 'jazzcash' ? '📱 JazzCash' : tx.payment_method === 'credit' ? '📋 Credit' : tx.payment_method}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {tx.is_voided ? (
                        <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: '700', background: '#ffebee', color: '#c62828' }}>🗑️ Voided</span>
                      ) : (
                        <span style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: '700', background: '#e8f5e9', color: '#2e7d32' }}>✅ Active</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {tx.is_voided ? (
                        <button onClick={() => { setSelectedTx(tx); restoreTransaction() }}
                          style={{ padding: '5px 10px', background: '#e8f5e9', color: '#1a7a4a', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>
                          ↩️ Restore
                        </button>
                      ) : (
                        <button onClick={() => { setSelectedTx(tx); setShowVoidForm(true) }}
                          style={{ padding: '5px 10px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>
                          🗑️ Void
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8f9fa', borderTop: '2px solid #eee' }}>
                <td colSpan={5} style={{ padding: '12px 14px', fontSize: '13px', fontWeight: '700', color: '#333' }}>
                  Total — {filtered.length} transactions
                </td>
                <td style={{ padding: '12px 14px', fontSize: '14px', fontWeight: '700', color: '#0f4c81' }}>
                  Rs. {totalAmount.toLocaleString()}
                </td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}