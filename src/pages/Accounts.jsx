import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function Accounts({ tenantId }) {
  const [activeTab, setActiveTab] = useState('coa')
  const tabs = [
    { key: 'coa', label: '📋 Chart of Accounts' },
    { key: 'trial', label: '⚖️ Trial Balance' },
    { key: 'pl', label: '📈 Income Statement' },
    { key: 'bs', label: '🏦 Balance Sheet' },
    { key: 'journal', label: '📒 Journal Entries' },
  ]
  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>📊 Accounts</h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Chart of accounts, trial balance and financial statements.</p>
      </div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{ padding: '8px 14px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: activeTab === t.key ? '#0f4c81' : '#f0f0f0', color: activeTab === t.key ? 'white' : '#555', fontWeight: activeTab === t.key ? '700' : '400', fontSize: '13px' }}>
            {t.label}
          </button>
        ))}
      </div>
      {activeTab === 'coa' && <ChartOfAccounts tenantId={tenantId} />}
      {activeTab === 'trial' && <TrialBalance tenantId={tenantId} />}
      {activeTab === 'pl' && <IncomeStatement tenantId={tenantId} />}
      {activeTab === 'bs' && <BalanceSheet tenantId={tenantId} />}
      {activeTab === 'journal' && <JournalEntries tenantId={tenantId} />}
    </div>
  )
}

// ─── CHART OF ACCOUNTS ─────────────────────────────────────────────
function ChartOfAccounts({ tenantId }) {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editAccount, setEditAccount] = useState(null)
  const [form, setForm] = useState({ account_code: '', account_name: '', account_type: 'expense', account_subtype: '', description: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (tenantId) fetchAccounts() }, [tenantId])

  async function fetchAccounts() {
    setLoading(true)
    const { data } = await supabase.from('chart_of_accounts')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('account_code')
    setAccounts(data || [])
    setLoading(false)
  }

  function openAdd() {
    setEditAccount(null)
    setForm({ account_code: '', account_name: '', account_type: 'expense', account_subtype: 'admin', description: '' })
    setShowForm(true)
  }

  function openEdit(acc) {
    setEditAccount(acc)
    setForm({ account_code: acc.account_code, account_name: acc.account_name, account_type: acc.account_type, account_subtype: acc.account_subtype || '', description: acc.description || '' })
    setShowForm(true)
  }

  async function saveAccount() {
    if (!form.account_code || !form.account_name) return alert('Code and name are required')
    setSaving(true)
    if (editAccount) {
      const { error } = await supabase.from('chart_of_accounts').update({
        account_name: form.account_name,
        account_type: form.account_type,
        account_subtype: form.account_subtype,
        description: form.description
      })
        .eq('id', editAccount.id)
        .eq('tenant_id', tenantId)
      if (error) { alert('Error: ' + error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('chart_of_accounts').insert([{
        tenant_id: tenantId,
        account_code: form.account_code,
        account_name: form.account_name,
        account_type: form.account_type,
        account_subtype: form.account_subtype,
        description: form.description,
        is_system: false,
        is_active: true,
        opening_balance: 0
      }])
      if (error) { alert('Error: ' + error.message); setSaving(false); return }
    }
    setShowForm(false)
    setEditAccount(null)
    fetchAccounts()
    setSaving(false)
  }

  async function toggleActive(acc) {
    if (acc.is_system) return alert('System accounts cannot be deactivated')
    await supabase.from('chart_of_accounts')
      .update({ is_active: !acc.is_active })
      .eq('id', acc.id)
      .eq('tenant_id', tenantId)
    fetchAccounts()
  }

  const types = ['asset', 'liability', 'equity', 'revenue', 'expense']
  const typeColors = { asset: '#0f4c81', liability: '#c62828', equity: '#6a1b9a', revenue: '#1a7a4a', expense: '#e65100' }
  const typeLabels = { asset: '💰 Assets', liability: '📋 Liabilities', equity: '👤 Equity', revenue: '📈 Revenue', expense: '📤 Expenses' }
  const inp = { width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>{accounts.filter(a => a.is_active).length} active accounts</p>
        <button onClick={openAdd}
          style={{ padding: '10px 18px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
          + Add Account
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #e3f0ff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, color: '#0f4c81', fontSize: '15px' }}>{editAccount ? '✏️ Edit Account' : '➕ New Account'}</h3>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#888' }}>✕</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Account Code *</label>
              <input value={form.account_code} onChange={e => setForm({ ...form, account_code: e.target.value })}
                placeholder="e.g. 6010" style={inp} disabled={!!editAccount} />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Account Name *</label>
              <input value={form.account_name} onChange={e => setForm({ ...form, account_name: e.target.value })}
                placeholder="e.g. Water Testing Fee" style={inp} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Account Type *</label>
              <select value={form.account_type} onChange={e => setForm({ ...form, account_type: e.target.value })} style={inp}>
                <option value="asset">Asset</option>
                <option value="liability">Liability</option>
                <option value="equity">Equity</option>
                <option value="revenue">Revenue</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Sub Type</label>
              <input value={form.account_subtype} onChange={e => setForm({ ...form, account_subtype: e.target.value })}
                placeholder="e.g. admin, salary, sales" style={inp} />
            </div>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Description (optional)</label>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="What is this account for?" style={inp} />
          </div>
          <button onClick={saveAccount} disabled={saving}
            style={{ padding: '10px 24px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
            {saving ? 'Saving...' : editAccount ? '✓ Update' : '✓ Add Account'}
          </button>
        </div>
      )}

      {loading ? <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p> : (
        <div>
          {types.map(type => {
            const typeAccounts = accounts.filter(a => a.account_type === type)
            if (typeAccounts.length === 0) return null
            return (
              <div key={type} style={{ marginBottom: '20px' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: typeColors[type], marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {typeLabels[type]}
                </p>
                <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f8f9fa' }}>
                        {['Code', 'Account Name', 'Type', 'Description', 'Status', 'Action'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', color: '#666', fontWeight: '600', borderBottom: '1px solid #eee' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {typeAccounts.map(acc => (
                        <tr key={acc.id} style={{ borderBottom: '1px solid #f0f0f0', opacity: acc.is_active ? 1 : 0.5 }}>
                          <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: '700', color: typeColors[acc.account_type] }}>{acc.account_code}</td>
                          <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: '600', color: '#333' }}>
                            {acc.account_name}
                            {acc.is_system && <span style={{ fontSize: '10px', background: '#f0f0f0', color: '#888', padding: '1px 6px', borderRadius: '6px', marginLeft: '6px' }}>system</span>}
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: '12px', color: '#888', textTransform: 'capitalize' }}>{acc.account_subtype || acc.account_type}</td>
                          <td style={{ padding: '10px 14px', fontSize: '12px', color: '#aaa' }}>{acc.description || '—'}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span onClick={() => toggleActive(acc)} style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', background: acc.is_active ? '#e8f5e9' : '#ffebee', color: acc.is_active ? '#2e7d32' : '#c62828', cursor: acc.is_system ? 'default' : 'pointer' }}>
                              {acc.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <button onClick={() => openEdit(acc)}
                              style={{ padding: '5px 10px', background: '#e3f0ff', color: '#0f4c81', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                              ✏️ Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── TRIAL BALANCE ─────────────────────────────────────────────────
function TrialBalance({ tenantId }) {
  const [dateFrom, setDateFrom] = useState('2024-01-01')
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (tenantId) fetchTrialBalance() }, [dateFrom, dateTo, tenantId])

  async function fetchTrialBalance() {
    setLoading(true)
    const { data: accounts } = await supabase.from('chart_of_accounts')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true).order('account_code')
    // Get journal entry IDs for this tenant and date range first
    const { data: journalEntries } = await supabase.from('journal_entries')
      .select('id')
      .eq('tenant_id', tenantId)
      .gte('entry_date', dateFrom)
      .lte('entry_date', dateTo)

    const entryIds = journalEntries?.map(e => e.id) || []

    if (entryIds.length === 0) {
      setData({ revenue: {}, cogs: {}, expenses: {}, totalRevenue: 0, totalCogs: 0, grossProfit: 0, totalExpenses: 0, netProfit: 0 })
      setLoading(false)
      return
    }

    const { data: lines } = await supabase.from('journal_entry_lines')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('journal_entry_id', entryIds)

    const balances = {}
    lines?.forEach(l => {
      if (!balances[l.account_code]) balances[l.account_code] = { debit: 0, credit: 0 }
      balances[l.account_code].debit += Number(l.debit || 0)
      balances[l.account_code].credit += Number(l.credit || 0)
    })

    const result = (accounts || []).map(acc => ({
      ...acc,
      totalDebit: balances[acc.account_code]?.debit || 0,
      totalCredit: balances[acc.account_code]?.credit || 0,
      netBalance: (balances[acc.account_code]?.debit || 0) - (balances[acc.account_code]?.credit || 0)
    })).filter(a => a.totalDebit > 0 || a.totalCredit > 0)

    setData(result)
    setLoading(false)
  }

  const totalDebit = data.reduce((s, a) => s + a.totalDebit, 0)
  const totalCredit = data.reduce((s, a) => s + a.totalCredit, 0)
  const typeColors = { asset: '#0f4c81', liability: '#c62828', equity: '#6a1b9a', revenue: '#1a7a4a', expense: '#e65100' }

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>⚖️ Trial Balance</h3>

      <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
        <button onClick={fetchTrialBalance}
          style={{ padding: '8px 16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
          🔄 Refresh
        </button>
      </div>

      {totalDebit !== totalCredit && totalDebit > 0 && (
        <div style={{ background: '#ffebee', border: '1px solid #ffcdd2', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#c62828', margin: '0 0 2px' }}>⚠️ Trial Balance does not balance</p>
          <p style={{ fontSize: '12px', color: '#e57373', margin: 0 }}>Difference: Rs. {Math.abs(totalDebit - totalCredit).toLocaleString()} — check for missing journal entries</p>
        </div>
      )}

      {totalDebit === totalCredit && totalDebit > 0 && (
        <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>✅ Trial Balance is balanced — Debits = Credits = Rs. {totalDebit.toLocaleString()}</p>
        </div>
      )}

      {loading ? <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p> : data.length === 0 ? (
        <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '32px', marginBottom: '8px' }}>📒</p>
          <p style={{ color: '#888' }}>No journal entries found for this period.</p>
          <p style={{ fontSize: '12px', color: '#aaa' }}>Journal entries are created automatically when you record transactions going forward.</p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
            <thead>
              <tr style={{ background: '#0f4c81', color: 'white' }}>
                {['Code', 'Account Name', 'Type', 'Debit (Rs.)', 'Credit (Rs.)'].map(h => (
                  <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: '12px', fontWeight: '600' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((acc, idx) => (
                <tr key={acc.id} style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '10px 14px', fontSize: '12px', fontWeight: '700', color: typeColors[acc.account_type] }}>{acc.account_code}</td>
                  <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: '600', color: '#333' }}>{acc.account_name}</td>
                  <td style={{ padding: '10px 14px', fontSize: '11px', color: '#888', textTransform: 'capitalize' }}>{acc.account_type}</td>
                  <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: '700', color: acc.totalDebit > 0 ? '#0f4c81' : '#aaa', textAlign: 'right' }}>
                    {acc.totalDebit > 0 ? acc.totalDebit.toLocaleString() : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: '700', color: acc.totalCredit > 0 ? '#1a7a4a' : '#aaa', textAlign: 'right' }}>
                    {acc.totalCredit > 0 ? acc.totalCredit.toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#0f4c81', color: 'white' }}>
                <td colSpan={3} style={{ padding: '12px 14px', fontSize: '13px', fontWeight: '700' }}>TOTAL</td>
                <td style={{ padding: '12px 14px', fontSize: '14px', fontWeight: '700', textAlign: 'right' }}>{totalDebit.toLocaleString()}</td>
                <td style={{ padding: '12px 14px', fontSize: '14px', fontWeight: '700', textAlign: 'right' }}>{totalCredit.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── INCOME STATEMENT ──────────────────────────────────────────────
function IncomeStatement({ tenantId }) {
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 7) + '-01')
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (tenantId) fetchData() }, [dateFrom, dateTo, tenantId])

  async function fetchData() {
    setLoading(true)

    // Fetch COA separately to get account types
    const { data: coaData } = await supabase.from('chart_of_accounts')
      .select('account_code, account_name, account_type, account_subtype')
      .eq('tenant_id', tenantId)
    const coaMap = {}
    coaData?.forEach(a => { coaMap[a.account_code] = a })

    const { data: journalEntries } = await supabase.from('journal_entries')
      .select('id')
      .eq('tenant_id', tenantId)
      .gte('entry_date', dateFrom)
      .lte('entry_date', dateTo)

    const entryIds = journalEntries?.map(e => e.id) || []

    const { data: lines } = entryIds.length > 0
      ? await supabase.from('journal_entry_lines').select('*').eq('tenant_id', tenantId).in('journal_entry_id', entryIds)
      : { data: [] }

    const revenue = {}
    const cogs = {}
    const expenses = {}

    lines?.forEach(l => {
      const acc = coaMap[l.account_code]
      const type = acc?.account_type
      const subtype = acc?.account_subtype
      const name = acc?.account_name || l.account_name
      const code = l.account_code
      const net = Number(l.credit || 0) - Number(l.debit || 0)

      if (type === 'revenue') {
        if (!revenue[code]) revenue[code] = { name, amount: 0 }
        revenue[code].amount += net
      } else if (type === 'expense' && subtype === 'cogs') {
        if (!cogs[code]) cogs[code] = { name, amount: 0 }
        cogs[code].amount += Number(l.debit || 0) - Number(l.credit || 0)
      } else if (type === 'expense') {
        if (!expenses[code]) expenses[code] = { name, amount: 0 }
        expenses[code].amount += Number(l.debit || 0) - Number(l.credit || 0)
      }
    })

    const totalRevenue = Object.values(revenue).reduce((s, v) => s + v.amount, 0)
    const totalCogs = Object.values(cogs).reduce((s, v) => s + v.amount, 0)
    const grossProfit = totalRevenue - totalCogs
    const totalExpenses = Object.values(expenses).reduce((s, v) => s + v.amount, 0)
    const netProfit = grossProfit - totalExpenses

    setData({ revenue, cogs, expenses, totalRevenue, totalCogs, grossProfit, totalExpenses, netProfit })
    setLoading(false)
  }

  function Section({ title, items, color, total, sign = '+' }) {
    return (
      <div style={{ marginBottom: '16px' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color, marginBottom: '8px', paddingBottom: '6px', borderBottom: `2px solid ${color}20` }}>{title}</p>
        {Object.entries(items).map(([code, item]) => (
          <div key={code} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 16px', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: '13px', color: '#555' }}>{item.name}</span>
            <span style={{ fontSize: '13px', fontWeight: '600', color }}>{sign} Rs. {item.amount.toLocaleString()}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${color}40`, marginTop: '4px' }}>
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#333' }}>Total</span>
          <span style={{ fontSize: '14px', fontWeight: '700', color }}>{sign} Rs. {total.toLocaleString()}</span>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>📈 Income Statement</h3>

      <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { label: 'Today', from: new Date().toISOString().split('T')[0], to: new Date().toISOString().split('T')[0] },
            { label: 'Month', from: new Date().toISOString().slice(0, 7) + '-01', to: new Date().toISOString().split('T')[0] },
            { label: 'All', from: '2024-01-01', to: new Date().toISOString().split('T')[0] },
          ].map(p => (
            <button key={p.label} onClick={() => { setDateFrom(p.from); setDateTo(p.to) }}
              style={{ padding: '8px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: '#f0f0f0', color: '#555', fontSize: '12px' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p> : !data ? null : (
        <div>
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
            <Section title="REVENUE" items={data.revenue} color="#1a7a4a" total={data.totalRevenue} />
            {Object.keys(data.cogs).length > 0 && (
              <>
                <Section title="COST OF GOODS SOLD" items={data.cogs} color="#f44336" total={data.totalCogs} sign="−" />
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '2px solid #eee', marginBottom: '16px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#333' }}>GROSS PROFIT</span>
                  <span style={{ fontSize: '16px', fontWeight: '700', color: data.grossProfit >= 0 ? '#1a7a4a' : '#f44336' }}>
                    Rs. {data.grossProfit.toLocaleString()}
                  </span>
                </div>
              </>
            )}
            {Object.keys(data.expenses).length > 0 && (
              <Section title="OPERATING EXPENSES" items={data.expenses} color="#e65100" total={data.totalExpenses} sign="−" />
            )}
          </div>

          <div style={{
            background: data.netProfit >= 0 ? 'linear-gradient(135deg, #0f4c81, #1a7a4a)' : 'linear-gradient(135deg, #c62828, #e65100)',
            color: 'white', borderRadius: '14px', padding: '24px', textAlign: 'center'
          }}>
            <p style={{ fontSize: '13px', opacity: 0.8, margin: '0 0 8px', textTransform: 'uppercase' }}>Net Profit / (Loss)</p>
            <p style={{ fontSize: '44px', fontWeight: '700', margin: '0 0 4px' }}>
              {data.netProfit < 0 ? '−' : ''} Rs. {Math.abs(data.netProfit).toLocaleString()}
            </p>
            <p style={{ fontSize: '12px', opacity: 0.7, margin: 0 }}>
              Revenue Rs. {data.totalRevenue.toLocaleString()} − COGS Rs. {data.totalCogs.toLocaleString()} − Expenses Rs. {data.totalExpenses.toLocaleString()}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── BALANCE SHEET ─────────────────────────────────────────────────
function BalanceSheet({ tenantId }) {
  const [asOf, setAsOf] = useState(new Date().toISOString().split('T')[0])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (tenantId) fetchData() }, [asOf, tenantId])

  async function fetchData() {
    setLoading(true)

    // Fetch COA separately to get account types
    const { data: coaData } = await supabase.from('chart_of_accounts')
      .select('account_code, account_name, account_type, account_subtype')
      .eq('tenant_id', tenantId)
    const coaMap = {}
    coaData?.forEach(a => { coaMap[a.account_code] = a })

    const { data: journalEntries } = await supabase.from('journal_entries')
      .select('id')
      .eq('tenant_id', tenantId)
      .lte('entry_date', asOf)

    const entryIds = journalEntries?.map(e => e.id) || []

    const { data: lines } = entryIds.length > 0
      ? await supabase.from('journal_entry_lines').select('*').eq('tenant_id', tenantId).in('journal_entry_id', entryIds)
      : { data: [] }

    const balances = {}
    lines?.forEach(l => {
      const code = l.account_code
      const type = coaMap[l.account_code]?.account_type
      const name = coaMap[l.account_code]?.account_name || l.account_name
      if (!balances[code]) balances[code] = { name, type, debit: 0, credit: 0 }
      balances[code].debit += Number(l.debit || 0)
      balances[code].credit += Number(l.credit || 0)
    })

    const assets = {}
    const liabilities = {}
    const equity = {}
    let retainedEarnings = 0

    lines?.forEach(l => {
      const type = l.account?.account_type
      if (type === 'revenue') retainedEarnings += Number(l.credit || 0) - Number(l.debit || 0)
      if (type === 'expense') retainedEarnings -= Number(l.debit || 0) - Number(l.credit || 0)
    })

    Object.entries(balances).forEach(([code, acc]) => {
      const net = acc.debit - acc.credit
      if (acc.type === 'asset' && net !== 0) assets[code] = { name: acc.name, amount: net }
      if (acc.type === 'liability' && net !== 0) liabilities[code] = { name: acc.name, amount: acc.credit - acc.debit }
      if (acc.type === 'equity' && net !== 0) equity[code] = { name: acc.name, amount: acc.credit - acc.debit }
    })

    const totalAssets = Object.values(assets).reduce((s, v) => s + v.amount, 0)
    const totalLiabilities = Object.values(liabilities).reduce((s, v) => s + v.amount, 0)
    const totalEquity = Object.values(equity).reduce((s, v) => s + v.amount, 0) + retainedEarnings
    const totalLiabilitiesEquity = totalLiabilities + totalEquity

    setData({ assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, totalLiabilitiesEquity, retainedEarnings })
    setLoading(false)
  }

  function Section({ title, items, color, extra }) {
    return (
      <div style={{ marginBottom: '12px' }}>
        <p style={{ fontSize: '12px', fontWeight: '700', color, margin: '0 0 6px', textTransform: 'uppercase' }}>{title}</p>
        {Object.entries(items).map(([code, item]) => (
          <div key={code} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 12px', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: '13px', color: '#555' }}>{item.name}</span>
            <span style={{ fontSize: '13px', fontWeight: '600', color }}>Rs. {item.amount.toLocaleString()}</span>
          </div>
        ))}
        {extra && extra.map(e => (
          <div key={e.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 6px 12px', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: '13px', color: '#555' }}>{e.label}</span>
            <span style={{ fontSize: '13px', fontWeight: '600', color }}>Rs. {e.amount.toLocaleString()}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>🏦 Balance Sheet</h3>

      <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>As of Date</label>
          <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
        </div>
        <button onClick={fetchData}
          style={{ padding: '8px 16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
          🔄 Refresh
        </button>
      </div>

      {loading ? <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p> : !data ? null : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '14px', fontWeight: '700', color: '#0f4c81', margin: '0 0 12px', paddingBottom: '8px', borderBottom: '2px solid #e3f0ff' }}>ASSETS</p>
            <Section title="Current Assets" items={data.assets} color="#0f4c81" />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '2px solid #0f4c81', marginTop: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#333' }}>Total Assets</span>
              <span style={{ fontSize: '16px', fontWeight: '700', color: '#0f4c81' }}>Rs. {data.totalAssets.toLocaleString()}</span>
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '14px', fontWeight: '700', color: '#c62828', margin: '0 0 12px', paddingBottom: '8px', borderBottom: '2px solid #ffebee' }}>LIABILITIES & EQUITY</p>
            {Object.keys(data.liabilities).length > 0 && (
              <Section title="Liabilities" items={data.liabilities} color="#c62828" />
            )}
            <Section title="Equity" items={data.equity} color="#6a1b9a"
              extra={data.retainedEarnings !== 0 ? [{ label: 'Retained Earnings (Net Profit)', amount: data.retainedEarnings }] : []} />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '2px solid #333', marginTop: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: '700', color: '#333' }}>Total L + E</span>
              <span style={{ fontSize: '16px', fontWeight: '700', color: data.totalAssets === data.totalLiabilitiesEquity ? '#1a7a4a' : '#f44336' }}>
                Rs. {data.totalLiabilitiesEquity.toLocaleString()}
              </span>
            </div>
            {data.totalAssets === data.totalLiabilitiesEquity ? (
              <p style={{ fontSize: '11px', color: '#1a7a4a', margin: '6px 0 0', textAlign: 'center' }}>✅ Balance Sheet is balanced</p>
            ) : (
              <p style={{ fontSize: '11px', color: '#f44336', margin: '6px 0 0', textAlign: 'center' }}>⚠️ Difference: Rs. {Math.abs(data.totalAssets - data.totalLiabilitiesEquity).toLocaleString()}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── JOURNAL ENTRIES ───────────────────────────────────────────────
function JournalEntries({ tenantId }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().split('T')[0])
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])
  const [expandedEntry, setExpandedEntry] = useState(null)

  useEffect(() => { if (tenantId) fetchEntries() }, [dateFrom, dateTo, tenantId])

  async function fetchEntries() {
    setLoading(true)
    const { data } = await supabase.from('journal_entries')
      .select('*, lines:journal_entry_lines(*)')
      .eq('tenant_id', tenantId)
      .gte('entry_date', dateFrom).lte('entry_date', dateTo)
      .order('created_at', { ascending: false })
    setEntries(data || [])
    setLoading(false)
  }

  const refTypeLabels = {
    delivery: '📦 Delivery', payment: '💵 Payment', office_expense: '🏢 Office Expense',
    rider_expense: '⛽ Rider Expense', salary_payment: '💼 Salary', salary_advance: '💰 Advance',
    stock_purchase: '📥 Purchase', owner_transaction: '👤 Owner', account_transfer: '🔄 Transfer',
    cash_transfer: '💸 Cash Transfer', delivery_jazzcash_confirmed: '📱 JazzCash Confirmed',
    payment_jazzcash_confirmed: '📱 JazzCash Confirmed'
  }

  return (
    <div>
      <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>📒 Journal Entries</h3>

      <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
        <button onClick={fetchEntries}
          style={{ padding: '8px 16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
          🔄 Refresh
        </button>
      </div>

      {loading ? <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p> : entries.length === 0 ? (
        <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '32px', marginBottom: '8px' }}>📒</p>
          <p style={{ color: '#888' }}>No journal entries for this period.</p>
          <p style={{ fontSize: '12px', color: '#aaa' }}>Journal entries are created automatically when you record transactions.</p>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: '13px', color: '#888', marginBottom: '12px' }}>{entries.length} entries found</p>
          {entries.map(entry => (
            <div key={entry.id} style={{ background: 'white', borderRadius: '12px', marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
              <div onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '11px', background: '#f0f0f0', color: '#555', padding: '2px 8px', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                    {refTypeLabels[entry.reference_type] || entry.reference_type}
                  </span>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: '600', color: '#333', margin: '0 0 2px' }}>{entry.narration}</p>
                    <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>
                      {new Date(entry.entry_date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: '#0f4c81', margin: '0 0 2px' }}>Rs. {Number(entry.total_amount).toLocaleString()}</p>
                  <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>{expandedEntry === entry.id ? '▲' : '▼'}</p>
                </div>
              </div>
              {expandedEntry === entry.id && (
                <div style={{ borderTop: '1px solid #f0f0f0', padding: '12px 16px', background: '#fafafa' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Account', 'Debit (Rs.)', 'Credit (Rs.)'].map(h => (
                          <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: '11px', color: '#888', fontWeight: '600', borderBottom: '1px solid #eee' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {entry.lines?.map(line => (
                        <tr key={line.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '8px 10px', fontSize: '12px', color: '#333' }}>
                            <span style={{ fontSize: '11px', color: '#888', marginRight: '6px' }}>{line.account_code}</span>
                            {line.account_name}
                          </td>
                          <td style={{ padding: '8px 10px', fontSize: '12px', fontWeight: '700', color: line.debit > 0 ? '#0f4c81' : '#aaa', textAlign: 'right' }}>
                            {line.debit > 0 ? line.debit.toLocaleString() : '—'}
                          </td>
                          <td style={{ padding: '8px 10px', fontSize: '12px', fontWeight: '700', color: line.credit > 0 ? '#1a7a4a' : '#aaa', textAlign: 'right' }}>
                            {line.credit > 0 ? line.credit.toLocaleString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}