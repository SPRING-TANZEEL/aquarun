import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { savePendingExpense } from '../offlineDB'

const EXPENSE_TYPES = [
  { key: 'fuel', label: 'Fuel', icon: '⛽' },
  { key: 'repair', label: 'Repair', icon: '🔧' },
  { key: 'refreshment', label: 'Refreshment', icon: '🥤' },
  { key: 'other', label: 'Other', icon: '📝' },
]

export default function RiderExpense({ rider, tenantId, isOnline }) {
  const [expenseType, setExpenseType] = useState(null)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [todayExpenses, setTodayExpenses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isOnline && tenantId) fetchTodayExpenses()
    else setLoading(false)
  }, [isOnline, tenantId])

  async function fetchTodayExpenses() {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase.from('expenses')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('rider_id', rider.id).eq('expense_date', today)
      .order('created_at', { ascending: false })
    setTodayExpenses(data || [])
    setLoading(false)
  }

  async function saveExpense() {
    if (!expenseType) return alert('Please select expense type')
    if (!amount || Number(amount) <= 0) return alert('Please enter amount')

    setSaving(true)
    const today = new Date().toISOString().split('T')[0]

    const expenseData = {
      tenant_id: tenantId,
      rider_id: rider.id,
      expense_type: expenseType,
      amount: Number(amount),
      description,
      expense_date: today,
      is_voided: false
    }

    if (isOnline) {
      const { error } = await supabase.from('expenses').insert([expenseData])
      if (error) { alert('Error: ' + error.message); setSaving(false); return }
      fetchTodayExpenses()
    } else {
      await savePendingExpense(expenseData)
    }

    setSuccess({ type: expenseType, amount: Number(amount), savedOffline: !isOnline })
    setExpenseType(null)
    setAmount('')
    setDescription('')
    setSaving(false)
  }

  const totalToday = todayExpenses.reduce((s, e) => s + Number(e.amount), 0)

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>💸 Log Expense</h2>

      {!isOnline && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
          <p style={{ fontSize: '12px', color: '#ea580c', fontWeight: '600', margin: 0 }}>📵 Offline — expense will sync when internet is available</p>
        </div>
      )}

      {success && (
        <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
          <p style={{ fontWeight: '700', color: '#1b5e20', marginBottom: '4px' }}>✅ Expense Logged!</p>
          <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>{success.type} — Rs. {success.amount.toLocaleString()}</p>
          {success.savedOffline && <p style={{ fontSize: '12px', color: '#ea580c', margin: '4px 0 0', fontWeight: '600' }}>📵 Saved offline — will sync later</p>}
          <button onClick={() => setSuccess(null)}
            style={{ marginTop: '8px', padding: '4px 12px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '12px' }}>
            OK
          </button>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>Expense Type</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
          {EXPENSE_TYPES.map(t => (
            <button key={t.key} onClick={() => setExpenseType(t.key)}
              style={{ padding: '16px', border: '2px solid', borderColor: expenseType === t.key ? '#1a7a4a' : '#eee', borderRadius: '10px', cursor: 'pointer', background: expenseType === t.key ? '#e8f5e9' : '#f8f9fa', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '28px' }}>{t.icon}</span>
              <span style={{ fontSize: '13px', fontWeight: '600', color: expenseType === t.key ? '#1a7a4a' : '#555' }}>{t.label}</span>
            </button>
          ))}
        </div>

        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>Amount (Rs.)</p>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
          placeholder="0"
          style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '24px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center', marginBottom: '12px' }} />

        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>Description (optional)</p>
        <input value={description} onChange={e => setDescription(e.target.value)}
          placeholder="e.g. Filling station near market..."
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' }} />

        <button onClick={saveExpense} disabled={saving}
          style={{ width: '100%', padding: '14px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
          {saving ? 'Saving...' : '✓ Save Expense'}
        </button>
      </div>

      {isOnline && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', margin: 0 }}>Today's Expenses</p>
            <p style={{ fontSize: '14px', fontWeight: '700', color: '#e65100', margin: 0 }}>Rs. {totalToday.toLocaleString()}</p>
          </div>
          {loading ? (
            <p style={{ textAlign: 'center', color: '#888', fontSize: '13px' }}>Loading...</p>
          ) : todayExpenses.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#aaa', fontSize: '13px', padding: '16px 0' }}>No expenses logged today</p>
          ) : todayExpenses.map(e => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>{EXPENSE_TYPES.find(t => t.key === e.expense_type)?.icon || '📝'}</span>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px', textTransform: 'capitalize' }}>{e.expense_type}</p>
                  {e.description && <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{e.description}</p>}
                </div>
              </div>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#e65100', margin: 0 }}>Rs. {Number(e.amount).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}