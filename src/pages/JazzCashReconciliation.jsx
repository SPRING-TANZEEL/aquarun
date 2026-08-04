import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import * as AccountingEngine from '../accountingEngine'

const METHOD_CONFIG = {
  jazzcash:  { label: 'JazzCash',  icon: '📱', color: '#9c27b0', bg: '#f3e5f5', clearingCode: '1102', clearingName: 'JazzCash Clearing - Pending',  actualCode: '1002', actualName: 'JazzCash Account' },
  easypaisa: { label: 'EasyPaisa', icon: '💚', color: '#4caf50', bg: '#e8f5e9', clearingCode: '1103', clearingName: 'EasyPaisa Clearing - Pending', actualCode: '1004', actualName: 'EasyPaisa Account' },
  bank:      { label: 'Bank',      icon: '🏦', color: '#0f4c81', bg: '#e3f0ff', clearingCode: '1105', clearingName: 'Bank Transfer Clearing - Pending', actualCode: '1003', actualName: 'Bank Account' },
}

export default function JazzCashReconciliation({ tenantId, onUpdate }) {
  const [methodFilter, setMethodFilter] = useState('all')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(null)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { if (tenantId) fetchPending() }, [tenantId])

  async function fetchPending() {
    setLoading(true)
    const methods = ['jazzcash', 'easypaisa', 'bank']
    const all = []

    // Pending deliveries
    const { data: deliveries } = await supabase.from('deliveries')
      .select('*, customers(full_name, mobile, customer_code), riders(full_name)')
      .eq('tenant_id', tenantId)
      .in('payment_method', methods)
      .eq('jazzcash_confirmed', false)
      .eq('is_voided', false)
      .order('delivered_at', { ascending: false })

    deliveries?.forEach(d => all.push({
      id: d.id, type: 'delivery', table: 'deliveries',
      method: d.payment_method,
      customer: d.customers?.full_name || 'Walk-in',
      mobile: d.customers?.mobile || '',
      rider: d.riders?.full_name || '—',
      amount: Number(d.total_with_tax || d.total_amount) - Number(d.credit_amount || 0),
      invoiceAmount: Number(d.total_with_tax || d.total_amount),
      date: d.delivered_at,
      detail: [d.qty_19l > 0 && `19L×${d.qty_19l}`, d.qty_half_litre > 0 && `½L×${d.qty_half_litre}`, d.qty_1_5l > 0 && `1.5L×${d.qty_1_5l}`].filter(Boolean).join(' '),
      raw: d
    }))

    // Pending payments
    const { data: payments } = await supabase.from('payments')
      .select('*, customers(full_name, mobile, customer_code), riders(full_name)')
      .eq('tenant_id', tenantId)
      .in('payment_method', methods)
      .eq('jazzcash_confirmed', false)
      .eq('is_voided', false)
      .order('created_at', { ascending: false })

    payments?.forEach(p => all.push({
      id: p.id, type: 'payment', table: 'payments',
      method: p.payment_method,
      customer: p.customers?.full_name || '—',
      mobile: p.customers?.mobile || '',
      rider: p.riders?.full_name || '—',
      amount: Number(p.amount),
      date: p.created_at || p.payment_date,
      detail: p.notes || 'Payment received',
      raw: p
    }))

    // Sort by date descending
    all.sort((a, b) => new Date(b.date) - new Date(a.date))
    setEntries(all)
    setLoading(false)
  }

  async function confirmEntry(entry) {
    setConfirming(entry.id)
    try {
      const cfg = METHOD_CONFIG[entry.method]
      if (!cfg) { alert('Unknown payment method'); setConfirming(null); return }

      if (entry.type === 'delivery') {
        // Update delivery
        const { data: confirmed, error } = await supabase.from('deliveries').update({
          jazzcash_confirmed: true,
          jazzcash_confirmed_at: new Date().toISOString(),
          jazzcash_confirmed_by: 'Admin',
        }).eq('id', entry.id).eq('tenant_id', tenantId).select().single()
        if (error) { alert('Error: ' + error.message); setConfirming(null); return }

        // Post confirmation journal: DR actual account, CR clearing
        const je = await supabase.from('journal_entries').insert([{
          tenant_id: tenantId,
          entry_date: new Date().toISOString().split('T')[0],
          reference_type: 'payment_confirmation',
          reference_id: entry.id,
          narration: `${cfg.label} confirmed — ${entry.customer} — ${entry.detail} — Rs.${entry.amount.toLocaleString()}`,
          total_amount: entry.amount,
          created_by: 'admin'
        }]).select().single()

        if (je.data) {
          await supabase.from('journal_entry_lines').insert([
            { tenant_id: tenantId, journal_entry_id: je.data.id, account_code: cfg.actualCode, account_name: cfg.actualName, debit: entry.amount, credit: 0 },
            { tenant_id: tenantId, journal_entry_id: je.data.id, account_code: cfg.clearingCode, account_name: cfg.clearingName, debit: 0, credit: entry.amount },
          ])
        }

        // Update customer balance for delivery
        if (confirmed?.customer_id) {
          const { data: cust } = await supabase.from('customers').select('balance').eq('id', confirmed.customer_id).eq('tenant_id', tenantId).single()
          if (cust) {
            await supabase.from('customers').update({ balance: Number(cust.balance) - entry.amount }).eq('id', confirmed.customer_id).eq('tenant_id', tenantId)
          }
        }

      } else {
        // Payment confirmation
        const { error } = await supabase.from('payments').update({
          jazzcash_confirmed: true,
        }).eq('id', entry.id).eq('tenant_id', tenantId)
        if (error) { alert('Error: ' + error.message); setConfirming(null); return }

        // Post journal
        const je = await supabase.from('journal_entries').insert([{
          tenant_id: tenantId,
          entry_date: new Date().toISOString().split('T')[0],
          reference_type: 'payment_confirmation',
          reference_id: entry.id,
          narration: `${cfg.label} confirmed — ${entry.customer} — payment — Rs.${entry.amount.toLocaleString()}`,
          total_amount: entry.amount,
          created_by: 'admin'
        }]).select().single()

        if (je.data) {
          await supabase.from('journal_entry_lines').insert([
            { tenant_id: tenantId, journal_entry_id: je.data.id, account_code: cfg.actualCode, account_name: cfg.actualName, debit: entry.amount, credit: 0 },
            { tenant_id: tenantId, journal_entry_id: je.data.id, account_code: cfg.clearingCode, account_name: cfg.clearingName, debit: 0, credit: entry.amount },
          ])
        }
      }

      setEntries(prev => prev.filter(e => e.id !== entry.id))
      if (onUpdate) onUpdate()
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setConfirming(null)
  }

  // Filter entries
  const filtered = entries.filter(e => {
    if (methodFilter !== 'all' && e.method !== methodFilter) return false
    if (search && !e.customer.toLowerCase().includes(search.toLowerCase()) && !e.mobile.includes(search)) return false
    const eDate = new Date(e.date).toISOString().split('T')[0]
    if (dateFrom && eDate < dateFrom) return false
    if (dateTo && eDate > dateTo) return false
    return true
  })

  const totalPending = filtered.reduce((s, e) => s + e.amount, 0)
  const countByMethod = {
    jazzcash: entries.filter(e => e.method === 'jazzcash').length,
    easypaisa: entries.filter(e => e.method === 'easypaisa').length,
    bank: entries.filter(e => e.method === 'bank').length,
  }

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1a1a2e, #0f3460)', borderRadius: 12, padding: '20px 24px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p style={{ color: '#fff', fontWeight: 800, fontSize: 17, margin: 0 }}>💳 Digital Payment Confirmation</p>
          <p style={{ color: '#93c5fd', fontSize: 12, margin: '4px 0 0' }}>Confirm pending JazzCash, EasyPaisa & Bank payments</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ color: '#fde68a', fontSize: 11, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: 1 }}>Total Pending</p>
          <p style={{ color: '#fff', fontWeight: 900, fontSize: 22, margin: 0 }}>Rs. {totalPending.toLocaleString()}</p>
          <p style={{ color: '#93c5fd', fontSize: 11, margin: '2px 0 0' }}>{filtered.length} transactions</p>
        </div>
      </div>

      {/* Method filter tabs */}
      <div style={{ background: 'white', borderRadius: 10, padding: '10px 12px', marginBottom: 14, boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Method tabs — compact */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { key: 'all',       label: 'All',  icon: '💳', count: entries.length,            color: '#1a1a2e' },
              { key: 'jazzcash',  label: 'JZC',  icon: '📱', count: countByMethod.jazzcash,  color: '#9c27b0' },
              { key: 'easypaisa', label: 'EP',   icon: '💚', count: countByMethod.easypaisa, color: '#4caf50' },
              { key: 'bank',      label: 'Bank', icon: '🏦', count: countByMethod.bank,       color: '#0f4c81' },
            ].map(m => (
              <button key={m.key} onClick={() => setMethodFilter(m.key)} style={{
                padding: '6px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                background: methodFilter === m.key ? m.color : '#f0f4f8',
                color: methodFilter === m.key ? '#fff' : '#555',
                display: 'flex', alignItems: 'center', gap: 3,
              }}>
                {m.icon} {m.label}
                <span style={{ background: methodFilter === m.key ? 'rgba(255,255,255,0.25)' : '#e0e0e0', color: methodFilter === m.key ? '#fff' : '#666', borderRadius: 8, padding: '0 5px', fontSize: 10 }}>{m.count}</span>
              </button>
            ))}
          </div>
          {/* Date range — same line */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '5px 6px', border: '1.5px solid #e0e0e0', borderRadius: 7, fontSize: 11, outline: 'none', width: 110 }} />
            <span style={{ color: '#aaa', fontSize: 11 }}>—</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: '5px 6px', border: '1.5px solid #e0e0e0', borderRadius: 7, fontSize: 11, outline: 'none', width: 110 }} />
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 14 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search by customer name or mobile..."
          style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {/* Entries */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', background: 'white', borderRadius: 12 }}>
          <p style={{ fontSize: 32, margin: '0 0 12px' }}>💳</p>
          <p style={{ color: '#888' }}>Loading pending payments...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', background: 'white', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 48, margin: '0 0 12px' }}>✅</p>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#1a7a4a', margin: '0 0 6px' }}>All Caught Up!</p>
          <p style={{ color: '#888', fontSize: 13 }}>No pending {methodFilter === 'all' ? 'digital' : METHOD_CONFIG[methodFilter]?.label} payments to confirm</p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                {['Date', 'Customer', 'Method', 'Type', 'Details', 'Rider', 'Amount', 'Action'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: h === 'Amount' ? 'right' : 'left', fontSize: 11, color: '#666', fontWeight: 700, borderBottom: '2px solid #eee', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, idx) => {
                const cfg = METHOD_CONFIG[e.method] || METHOD_CONFIG.jazzcash
                const isConfirming = confirming === e.id
                return (
                  <tr key={e.id} style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: '#555', whiteSpace: 'nowrap' }}>
                      {new Date(e.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                      <p style={{ fontSize: 10, color: '#aaa', margin: '2px 0 0' }}>
                        {new Date(e.date).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px', color: '#1a1a2e' }}>{e.customer}</p>
                      {e.mobile && <p style={{ fontSize: 11, color: '#888', margin: 0 }}>{e.mobile}</p>}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ background: cfg.bg, color: cfg.color, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ background: e.type === 'delivery' ? '#e3f0ff' : '#e8f5e9', color: e.type === 'delivery' ? '#0f4c81' : '#1a7a4a', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                        {e.type === 'delivery' ? '📦 Sale' : '💵 Payment'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: '#555', maxWidth: 180 }}>{e.detail}</td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: '#888' }}>{e.rider}</td>
                    <td style={{ padding: '12px 14px', fontSize: 14, fontWeight: 800, color: '#1a7a4a', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      Rs. {e.amount.toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <button onClick={() => confirmEntry(e)} disabled={!!confirming}
                        style={{ padding: '8px 16px', background: isConfirming ? '#e0e0e0' : cfg.color, color: 'white', border: 'none', borderRadius: 8, cursor: isConfirming ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {isConfirming ? '⏳...' : '✅ Confirm'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8f9fa', borderTop: '2px solid #e0e0e0' }}>
                <td colSpan={6} style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: '#333' }}>
                  Total Pending — {filtered.length} transactions
                </td>
                <td style={{ padding: '12px 14px', fontSize: 15, fontWeight: 900, color: '#1a7a4a', textAlign: 'right' }}>
                  Rs. {totalPending.toLocaleString()}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Refresh button */}
      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <button onClick={fetchPending} style={{ padding: '9px 24px', background: '#f0f4f8', color: '#555', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          🔄 Refresh
        </button>
      </div>
    </div>
  )
}
