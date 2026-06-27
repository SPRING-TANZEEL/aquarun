import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const EXPENSE_TYPES = [
  { key: 'fuel', label: 'Fuel', urdu: 'پٹرول', icon: '⛽' },
  { key: 'repair', label: 'Repair', urdu: 'مرمت', icon: '🔧' },
  { key: 'refreshment', label: 'Refreshment', urdu: 'کھانا', icon: '🍵' },
  { key: 'other', label: 'Other', urdu: 'دیگر', icon: '📝' },
]

export default function RiderExpense({ rider }) {
  const [type, setType] = useState(null)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [todayExpenses, setTodayExpenses] = useState([])
  const [success, setSuccess] = useState(false)

  useEffect(() => { fetchTodayExpenses() }, [])

  async function fetchTodayExpenses() {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase.from('expenses')
      .select('*').eq('rider_id', rider.id).eq('expense_date', today)
      .order('created_at', { ascending: false })
    setTodayExpenses(data || [])
  }

  async function saveExpense() {
    if (!type) return alert('Please select expense type')
    if (!amount || Number(amount) <= 0) return alert('Please enter amount')

    setSaving(true)
    const { error } = await supabase.from('expenses').insert([{
      rider_id: rider.id,
      expense_type: type,
      amount: Number(amount),
      description,
      expense_date: new Date().toISOString().split('T')[0]
    }])

    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    setSuccess(true)
    setType(null)
    setAmount('')
    setDescription('')
    fetchTodayExpenses()
    setSaving(false)
    setTimeout(() => setSuccess(false), 3000)
  }

  const totalToday = todayExpenses.reduce((s, e) => s + Number(e.amount), 0)

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>💸 Log Expense</h2>

      {success && (
        <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
          <p style={{ fontWeight: '700', color: '#1b5e20', margin: 0 }}>✅ Expense saved!</p>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>

        {/* Expense Type */}
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>Expense Type</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
          {EXPENSE_TYPES.map(et => (
            <button key={et.key} onClick={() => setType(et.key)}
              style={{
                padding: '14px', border: '2px solid',
                borderColor: type === et.key ? '#e65100' : '#eee',
                borderRadius: '10px', cursor: 'pointer',
                background: type === et.key ? '#fff3e0' : '#f8f9fa',
                fontWeight: '600', fontSize: '14px',
                color: type === et.key ? '#e65100' : '#555',
                display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center'
              }}>
              {et.icon} {et.urdu}
            </button>
          ))}
        </div>

        {/* Amount */}
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>Amount (Rs.)</p>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
          placeholder="0"
          style={{
            width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '8px',
            fontSize: '24px', fontWeight: '700', outline: 'none',
            boxSizing: 'border-box', textAlign: 'center', marginBottom: '16px'
          }} />

        {/* Description */}
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>Description (optional)</p>
        <input value={description} onChange={e => setDescription(e.target.value)}
          placeholder="e.g. Filled petrol at PSO..."
          style={{
            width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px',
            fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px'
          }} />

        <button onClick={saveExpense} disabled={saving}
          style={{
            width: '100%', padding: '14px', background: '#e65100', color: 'white',
            border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700'
          }}>
          {saving ? 'Saving...' : '✓ محفوظ کریں'}
        </button>
      </div>

      {/* Today's Expenses */}
      {todayExpenses.length > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', margin: 0 }}>Today's Expenses</p>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#e65100', margin: 0 }}>Total: Rs. {totalToday.toLocaleString()}</p>
          </div>
          {todayExpenses.map(e => {
            const et = EXPENSE_TYPES.find(t => t.key === e.expense_type)
            return (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>
                    {et?.icon} {et?.label}
                  </p>
                  {e.description && <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{e.description}</p>}
                </div>
                <p style={{ fontSize: '14px', fontWeight: '700', color: '#e65100', margin: 0 }}>
                  Rs. {Number(e.amount).toLocaleString()}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}