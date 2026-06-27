import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const CATEGORIES = [
  { key: 'rent', label: 'Rent', icon: '🏠' },
  { key: 'electricity', label: 'Electricity', icon: '⚡' },
  { key: 'supplies', label: 'Supplies', icon: '📦' },
  { key: 'fuel', label: 'Fuel / Vehicle', icon: '⛽' },
  { key: 'salary', label: 'Salary Payment', icon: '💼' },
  { key: 'maintenance', label: 'Maintenance', icon: '🔧' },
  { key: 'other', label: 'Other', icon: '📝' },
]

export default function OfficeExpenses({ rider, isCEO }) {
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState(null)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0])
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [summary, setSummary] = useState({})

  useEffect(() => { fetchExpenses() }, [dateFrom, dateTo])

  async function fetchExpenses() {
    setLoading(true)
    const paidBy = isCEO ? 'ceo' : 'main_rider'

    const { data } = await supabase.from('office_expenses')
      .select('*')
      .eq('paid_by', paidBy)
      .gte('expense_date', dateFrom)
      .lte('expense_date', dateTo)
      .order('created_at', { ascending: false })

    setExpenses(data || [])

    // Build category summary
    const s = {}
    data?.forEach(e => {
      s[e.category] = (s[e.category] || 0) + Number(e.amount)
    })
    setSummary(s)

    setLoading(false)
  }

  async function saveExpense() {
    if (!category) return alert('Please select a category')
    if (!amount || Number(amount) <= 0) return alert('Please enter amount')

    setSaving(true)
    const paidBy = isCEO ? 'ceo' : 'main_rider'

    const { error } = await supabase.from('office_expenses').insert([{
      paid_by: paidBy,
      paid_by_rider_id: rider.id,
      category,
      amount: Number(amount),
      description,
      expense_date: new Date().toISOString().split('T')[0]
    }])

    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    setSuccess(true)
    setCategory(null)
    setAmount('')
    setDescription('')
    fetchExpenses()
    setSaving(false)
    setTimeout(() => setSuccess(false), 3000)
  }

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0)

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '4px' }}>
        🏢 {isCEO ? 'Office' : 'Field'} Expenses
      </h2>
      <p style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
        {isCEO ? 'Log office expenses — rent, electricity, supplies, salary payments' : 'Log field expenses paid directly by you'}
      </p>

      {success && (
        <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
          <p style={{ fontWeight: '700', color: '#1b5e20', margin: 0 }}>✅ Expense saved!</p>
        </div>
      )}

      {/* Add Expense Form */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>Add Expense</p>

        {/* Category */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
          {CATEGORIES.map(c => (
            <button key={c.key} onClick={() => setCategory(c.key)}
              style={{
                padding: '12px', border: '2px solid',
                borderColor: category === c.key ? '#e65100' : '#eee',
                borderRadius: '10px', cursor: 'pointer',
                background: category === c.key ? '#fff3e0' : '#f8f9fa',
                display: 'flex', alignItems: 'center', gap: '8px',
                fontWeight: '600', fontSize: '13px',
                color: category === c.key ? '#e65100' : '#555'
              }}>
              <span style={{ fontSize: '18px' }}>{c.icon}</span>
              {c.label}
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
            boxSizing: 'border-box', textAlign: 'center', marginBottom: '12px'
          }} />

        {/* Description */}
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>Description</p>
        <input value={description} onChange={e => setDescription(e.target.value)}
          placeholder="e.g. Monthly rent for shop..."
          style={{
            width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px',
            fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px'
          }} />

        <button onClick={saveExpense} disabled={saving}
          style={{
            width: '100%', padding: '14px', background: '#e65100', color: 'white',
            border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700'
          }}>
          {saving ? 'Saving...' : '✓ Save Expense'}
        </button>
      </div>

      {/* Date Filter */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
          </div>
        </div>
      </div>

      {/* Category Summary */}
      {Object.keys(summary).length > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>Expense Summary</p>
          {CATEGORIES.filter(c => summary[c.key]).map(c => (
            <div key={c.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span style={{ fontSize: '13px', color: '#555' }}>{c.icon} {c.label}</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#e65100' }}>Rs. {summary[c.key].toLocaleString()}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0' }}>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#333' }}>Total</span>
            <span style={{ fontSize: '16px', fontWeight: '700', color: '#e65100' }}>Rs. {totalExpenses.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Expenses List */}
      {loading ? (
        <p style={{ textAlign: 'center', color: '#888', padding: '20px' }}>Loading...</p>
      ) : expenses.length === 0 ? (
        <div style={{ background: 'white', borderRadius: '12px', padding: '30px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ color: '#888', fontSize: '13px' }}>No expenses found for this period.</p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>Expense Details</p>
          {expenses.map(e => {
            const cat = CATEGORIES.find(c => c.key === e.category)
            return (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>
                    {cat?.icon} {cat?.label}
                  </p>
                  {e.description && <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>{e.description}</p>}
                  <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>
                    {new Date(e.expense_date).toLocaleDateString('en-PK')}
                  </p>
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