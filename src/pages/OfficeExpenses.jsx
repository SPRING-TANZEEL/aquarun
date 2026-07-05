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

const PAYMENT_METHODS = [
  { key: 'cash', label: 'Cash', icon: '💵' },
  { key: 'jazzcash', label: 'JazzCash', icon: '📱' },
  { key: 'bank', label: 'Bank', icon: '🏦' },
]

export default function OfficeExpenses({ rider, isCEO, tenantId }) {
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0])
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [summary, setSummary] = useState({})

  useEffect(() => { if (tenantId) fetchExpenses() }, [dateFrom, dateTo, tenantId])

  async function fetchExpenses() {
    setLoading(true)
    const paidBy = isCEO ? 'ceo' : 'main_rider'
    const { data } = await supabase.from('office_expenses')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('paid_by', paidBy)
      .gte('expense_date', dateFrom).lte('expense_date', dateTo)
      .eq('is_voided', false)
      .order('created_at', { ascending: false })
    setExpenses(data || [])
    const s = {}
    data?.forEach(e => { s[e.category] = (s[e.category] || 0) + Number(e.amount) })
    setSummary(s)
    setLoading(false)
  }

  async function saveExpense() {
    if (!category) return alert('Please select a category')
    if (!amount || Number(amount) <= 0) return alert('Please enter amount')
    setSaving(true)
    const paidBy = isCEO ? 'ceo' : 'main_rider'

    const { data: saved, error } = await supabase.from('office_expenses').insert([{
      tenant_id: tenantId,
      paid_by: paidBy,
      paid_by_rider_id: rider.id,
      category,
      amount: Number(amount),
      description,
      payment_method: paymentMethod,
      expense_date: new Date().toISOString().split('T')[0]
    }]).select().single()

    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    // Auto-post journal entry
    try {
      const { postOfficeExpenseJournal } = await import('../accountingEngine')
      await postOfficeExpenseJournal(saved, tenantId)
    } catch (err) { console.error('Journal post error:', err) }

    setSuccess(true)
    setCategory(null)
    setAmount('')
    setDescription('')
    setPaymentMethod('cash')
    fetchExpenses()
    setSaving(false)
    setTimeout(() => setSuccess(false), 3000)
  }

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const cashTotal = expenses.filter(e => (e.payment_method || 'cash') === 'cash').reduce((s, e) => s + Number(e.amount), 0)
  const jazzTotal = expenses.filter(e => e.payment_method === 'jazzcash').reduce((s, e) => s + Number(e.amount), 0)
  const bankTotal = expenses.filter(e => e.payment_method === 'bank').reduce((s, e) => s + Number(e.amount), 0)

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
        <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '8px', textTransform: 'uppercase' }}>Category</p>
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

        {/* Payment Method */}
        <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '8px', textTransform: 'uppercase' }}>Paid From</p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          {PAYMENT_METHODS.map(m => (
            <button key={m.key} onClick={() => setPaymentMethod(m.key)}
              style={{
                flex: 1, padding: '12px 8px', border: '2px solid',
                borderColor: paymentMethod === m.key ? (m.key === 'cash' ? '#0f4c81' : m.key === 'jazzcash' ? '#9c27b0' : '#1a7a4a') : '#eee',
                borderRadius: '10px', cursor: 'pointer',
                background: paymentMethod === m.key ? (m.key === 'cash' ? '#e3f0ff' : m.key === 'jazzcash' ? '#fdf4ff' : '#e8f5e9') : '#f8f9fa',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px'
              }}>
              <span style={{ fontSize: '20px' }}>{m.icon}</span>
              <span style={{ fontSize: '12px', fontWeight: '700', color: paymentMethod === m.key ? (m.key === 'cash' ? '#0f4c81' : m.key === 'jazzcash' ? '#9c27b0' : '#1a7a4a') : '#555' }}>
                {m.label}
              </span>
            </button>
          ))}
        </div>

        {/* Amount */}
        <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '6px', textTransform: 'uppercase' }}>Amount (Rs.)</p>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
          placeholder="0"
          style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '24px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center', marginBottom: '12px' }} />

        {/* Description */}
        <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '6px', textTransform: 'uppercase' }}>Description</p>
        <input value={description} onChange={e => setDescription(e.target.value)}
          placeholder="e.g. Monthly rent for shop..."
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' }} />

        {/* Info box */}
        <div style={{ background: paymentMethod === 'cash' ? '#f0f7ff' : paymentMethod === 'jazzcash' ? '#fdf4ff' : '#f0f9f4', border: '1px solid', borderColor: paymentMethod === 'cash' ? '#c8d8ff' : paymentMethod === 'jazzcash' ? '#e9d5ff' : '#bbf7d0', borderRadius: '8px', padding: '8px 12px', marginBottom: '14px' }}>
          <p style={{ fontSize: '11px', color: paymentMethod === 'cash' ? '#0f4c81' : paymentMethod === 'jazzcash' ? '#6b21a8' : '#166534', margin: 0 }}>
            {paymentMethod === 'cash' && '💵 This expense will be deducted from CEO Cash in Hand balance'}
            {paymentMethod === 'jazzcash' && '📱 This expense will be deducted from CEO JazzCash balance'}
            {paymentMethod === 'bank' && '🏦 This expense will be deducted from CEO Bank balance'}
          </p>
        </div>

        <button onClick={saveExpense} disabled={saving}
          style={{ width: '100%', padding: '14px', background: '#e65100', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
          {saving ? 'Saving...' : '✓ Save Expense'}
        </button>
      </div>

      {/* Date Filter */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
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

      {/* Payment Method Summary */}
      {expenses.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          {[
            { label: '💵 Cash', value: cashTotal, color: '#0f4c81' },
            { label: '📱 JazzCash', value: jazzTotal, color: '#9c27b0' },
            { label: '🏦 Bank', value: bankTotal, color: '#1a7a4a' },
          ].map(card => (
            <div key={card.label} style={{ background: 'white', borderRadius: '10px', padding: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
              <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>{card.label}</p>
              <p style={{ fontSize: '14px', fontWeight: '700', color: card.color, margin: 0 }}>Rs. {card.value.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* Category Summary */}
      {Object.keys(summary).length > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '12px' }}>Expense Summary by Category</p>
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
            const pm = PAYMENT_METHODS.find(m => m.key === (e.payment_method || 'cash'))
            return (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>
                    {cat?.icon} {cat?.label}
                  </p>
                  {e.description && <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>{e.description}</p>}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>
                      {new Date(e.expense_date).toLocaleDateString('en-PK')}
                    </p>
                    <span style={{ fontSize: '10px', background: '#f0f0f0', color: '#555', padding: '1px 6px', borderRadius: '6px' }}>
                      {pm?.icon} {pm?.label}
                    </span>
                  </div>
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