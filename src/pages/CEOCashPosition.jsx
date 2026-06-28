import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

const ACCOUNTS = [
  { key: 'cash', label: 'Cash in Hand', icon: '💵', color: '#0f4c81' },
  { key: 'jazzcash', label: 'JazzCash', icon: '📱', color: '#9c27b0' },
  { key: 'bank', label: 'Bank', icon: '🏦', color: '#1a7a4a' },
]

export default function CEOCashPosition() {
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('position')
  const [data, setData] = useState(null)
  const [openingBalances, setOpeningBalances] = useState({ cash: 0, jazzcash: 0, bank: 0 })
  const [editingOpening, setEditingOpening] = useState(false)
  const [tempOpening, setTempOpening] = useState({ cash: '', jazzcash: '', bank: '' })
  const [savingOpening, setSavingOpening] = useState(false)

  // Transfer form
  const [transferFrom, setTransferFrom] = useState('cash')
  const [transferTo, setTransferTo] = useState('jazzcash')
  const [transferAmount, setTransferAmount] = useState('')
  const [transferNotes, setTransferNotes] = useState('')
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0])
  const [savingTransfer, setSavingTransfer] = useState(false)
  const [transferSuccess, setTransferSuccess] = useState(false)
  const [accountTransfers, setAccountTransfers] = useState([])

  // Date filter
  const [dateFrom, setDateFrom] = useState('2024-01-01')
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { fetchAll() }, [dateFrom, dateTo])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchOpeningBalances(), fetchTransactions(), fetchAccountTransfers()])
    setLoading(false)
  }

  async function fetchOpeningBalances() {
    const { data } = await supabase.from('business_settings').select('*')
      .in('setting_key', ['opening_cash_balance', 'opening_jazzcash_balance', 'opening_bank_balance'])
    const map = {}
    data?.forEach(s => { map[s.setting_key] = Number(s.setting_value || 0) })
    const balances = {
      cash: map['opening_cash_balance'] || 0,
      jazzcash: map['opening_jazzcash_balance'] || 0,
      bank: map['opening_bank_balance'] || 0
    }
    setOpeningBalances(balances)
    setTempOpening({ cash: String(balances.cash), jazzcash: String(balances.jazzcash), bank: String(balances.bank) })
  }

  async function saveOpeningBalances() {
    setSavingOpening(true)
    await supabase.from('business_settings').upsert([
      { setting_key: 'opening_cash_balance', setting_value: String(Number(tempOpening.cash) || 0) },
      { setting_key: 'opening_jazzcash_balance', setting_value: String(Number(tempOpening.jazzcash) || 0) },
      { setting_key: 'opening_bank_balance', setting_value: String(Number(tempOpening.bank) || 0) },
    ], { onConflict: 'setting_key' })
    setEditingOpening(false)
    setSavingOpening(false)
    fetchAll()
  }

  async function fetchAccountTransfers() {
    const { data } = await supabase.from('ceo_account_transfers')
      .select('*').order('transfer_date', { ascending: false })
    setAccountTransfers(data || [])
  }

  async function fetchTransactions() {
    // Cash inflows — rider transfers marked as cash
    const { data: cashTransfers } = await supabase.from('cash_transfers')
      .select('*, from_rider:from_rider_id(full_name)')
      .eq('to_office', true).eq('status', 'confirmed')
      .in('transfer_type', ['cash', null])
      .gte('transfer_date', dateFrom).lte('transfer_date', dateTo)

    // JazzCash inflows — rider transfers marked as jazzcash
    const { data: jazzTransfers } = await supabase.from('cash_transfers')
      .select('*, from_rider:from_rider_id(full_name)')
      .eq('to_office', true).eq('status', 'confirmed')
      .eq('transfer_type', 'jazzcash')
      .gte('transfer_date', dateFrom).lte('transfer_date', dateTo)

    // JazzCash confirmed from customers
    const { data: jazzSales } = await supabase.from('deliveries')
      .select('*, customers(full_name)')
      .eq('payment_method', 'jazzcash').eq('jazzcash_confirmed', true).eq('is_voided', false)
      .gte('delivered_at', dateFrom + 'T00:00:00').lte('delivered_at', dateTo + 'T23:59:59')

    const { data: jazzPayments } = await supabase.from('payments')
      .select('*, customers(full_name)')
      .eq('payment_method', 'jazzcash').eq('jazzcash_confirmed', true).eq('is_voided', false)
      .gte('created_at', dateFrom + 'T00:00:00').lte('created_at', dateTo + 'T23:59:59')

    // Outflows — office expenses by payment method
    const { data: officeExpenses } = await supabase.from('office_expenses')
      .select('*').eq('is_voided', false)
      .gte('expense_date', dateFrom).lte('expense_date', dateTo)

    // Outflows — inventory purchases by payment method
    const { data: stockPurchases } = await supabase.from('stock_purchases')
      .select('*, products(name)')
      .gte('purchase_date', dateFrom).lte('purchase_date', dateTo)

    // Outflows — salary payments by payment method
    const { data: salaryPayments } = await supabase.from('salary_payments')
      .select('*, rider:rider_id(full_name)')
      .gte('created_at', dateFrom + 'T00:00:00').lte('created_at', dateTo + 'T23:59:59')

    // Outflows — salary advances by payment method
    const { data: advances } = await supabase.from('salary_advances')
      .select('*, rider:rider_id(full_name)')
      .eq('requested_from', 'ceo').eq('status', 'approved').eq('is_voided', false)
      .gte('approved_at', dateFrom + 'T00:00:00').lte('approved_at', dateTo + 'T23:59:59')

    // CEO account transfers
    const { data: ceoTransfers } = await supabase.from('ceo_account_transfers')
      .select('*').gte('transfer_date', dateFrom).lte('transfer_date', dateTo)

    // JazzCash pending
    const { data: jazzPendingSales } = await supabase.from('deliveries')
      .select('total_amount').eq('payment_method', 'jazzcash').eq('jazzcash_confirmed', false).eq('is_voided', false)
    const { data: jazzPendingPay } = await supabase.from('payments')
      .select('amount').eq('payment_method', 'jazzcash').eq('jazzcash_confirmed', false).eq('is_voided', false)

    const jazzPending = (jazzPendingSales?.reduce((s, d) => s + Number(d.total_amount), 0) || 0) +
      (jazzPendingPay?.reduce((s, p) => s + Number(p.amount), 0) || 0)

    // Calculate per account
    function byMethod(arr, method, field = 'amount') {
      return arr?.filter(i => (i.payment_method || 'cash') === method)
        .reduce((s, i) => s + Number(i[field] || 0), 0) || 0
    }

    // Cash account
    const cashIn = (cashTransfers?.reduce((s, t) => s + Number(t.amount), 0) || 0)
    const cashTransfersOut = ceoTransfers?.filter(t => t.from_account === 'cash').reduce((s, t) => s + Number(t.amount), 0) || 0
    const cashTransfersIn = ceoTransfers?.filter(t => t.to_account === 'cash').reduce((s, t) => s + Number(t.amount), 0) || 0
    const cashExpenses = byMethod(officeExpenses, 'cash')
    const cashPurchases = byMethod(stockPurchases, 'cash', 'total_cost')
    const cashSalaries = byMethod(salaryPayments, 'cash', 'amount_paid')
    const cashAdvances = byMethod(advances, 'cash')
    const cashOut = cashExpenses + cashPurchases + cashSalaries + cashAdvances + cashTransfersOut

    // JazzCash account
    const jazzFromRiders = jazzTransfers?.reduce((s, t) => s + Number(t.amount), 0) || 0
    const jazzFromCustomers = (jazzSales?.reduce((s, d) => s + Number(d.total_amount), 0) || 0) +
      (jazzPayments?.reduce((s, p) => s + Number(p.amount), 0) || 0)
    const jazzIn = jazzFromRiders + jazzFromCustomers
    const jazzTransfersOut = ceoTransfers?.filter(t => t.from_account === 'jazzcash').reduce((s, t) => s + Number(t.amount), 0) || 0
    const jazzTransfersIn = ceoTransfers?.filter(t => t.to_account === 'jazzcash').reduce((s, t) => s + Number(t.amount), 0) || 0
    const jazzExpenses = byMethod(officeExpenses, 'jazzcash')
    const jazzPurchases = byMethod(stockPurchases, 'jazzcash', 'total_cost')
    const jazzSalaries = byMethod(salaryPayments, 'jazzcash', 'amount_paid')
    const jazzAdvancesOut = byMethod(advances, 'jazzcash')
    const jazzOut = jazzExpenses + jazzPurchases + jazzSalaries + jazzAdvancesOut + jazzTransfersOut

    // Bank account
    const bankTransfersIn = ceoTransfers?.filter(t => t.to_account === 'bank').reduce((s, t) => s + Number(t.amount), 0) || 0
    const bankTransfersOut = ceoTransfers?.filter(t => t.from_account === 'bank').reduce((s, t) => s + Number(t.amount), 0) || 0
    const bankExpenses = byMethod(officeExpenses, 'bank')
    const bankPurchases = byMethod(stockPurchases, 'bank', 'total_cost')
    const bankSalaries = byMethod(salaryPayments, 'bank', 'amount_paid')
    const bankAdvances = byMethod(advances, 'bank')
    const bankOut = bankExpenses + bankPurchases + bankSalaries + bankAdvances + bankTransfersOut

    setData({
      // Cash
      cashIn, cashOut, cashExpenses, cashPurchases, cashSalaries, cashAdvances,
      cashTransfersOut, cashTransfersIn,
      // Jazz
      jazzIn, jazzOut, jazzFromRiders, jazzFromCustomers,
      jazzExpenses, jazzPurchases, jazzSalaries, jazzAdvancesOut,
      jazzTransfersOut, jazzTransfersIn, jazzPending,
      // Bank
      bankTransfersIn, bankTransfersOut, bankExpenses, bankPurchases, bankSalaries, bankAdvances, bankOut,
      // Details
      cashTransfersList: cashTransfers || [],
      jazzTransfersList: jazzTransfers || [],
      jazzSalesList: jazzSales || [],
      jazzPaymentsList: jazzPayments || [],
      officeExpenses: officeExpenses || [],
      stockPurchases: stockPurchases || [],
      salaryPayments: salaryPayments || [],
      advances: advances || [],
      ceoTransfers: ceoTransfers || [],
    })
  }

  async function postAccountTransfer() {
    if (!transferAmount || Number(transferAmount) <= 0) return alert('Please enter amount')
    if (transferFrom === transferTo) return alert('From and To accounts cannot be the same')

    setSavingTransfer(true)
    const { error } = await supabase.from('ceo_account_transfers').insert([{
      from_account: transferFrom,
      to_account: transferTo,
      amount: Number(transferAmount),
      transfer_date: transferDate,
      notes: transferNotes
    }])

    if (error) { alert('Error: ' + error.message); setSavingTransfer(false); return }

    setTransferAmount('')
    setTransferNotes('')
    setTransferSuccess(true)
    setTimeout(() => setTransferSuccess(false), 3000)
    setSavingTransfer(false)
    fetchAll()
  }

  if (loading) return <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>

  const netCash = openingBalances.cash + (data?.cashIn || 0) + (data?.cashTransfersIn || 0) - (data?.cashOut || 0)
  const netJazz = openingBalances.jazzcash + (data?.jazzIn || 0) + (data?.jazzTransfersIn || 0) - (data?.jazzOut || 0)
  const netBank = openingBalances.bank + (data?.bankTransfersIn || 0) - (data?.bankOut || 0)
  const totalPosition = netCash + netJazz + netBank

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>🏦 CEO Cash Position</h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Complete wallet — Cash, JazzCash and Bank</p>
      </div>

      {/* Tab Selector */}
      <div style={{ display: 'flex', gap: '6px', background: 'white', padding: '5px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
        {[
          { key: 'position', label: '📊 Position' },
          { key: 'transfer', label: '🔄 Move Money' },
          { key: 'history', label: '📋 History' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            style={{
              flex: 1, padding: '8px', border: 'none', borderRadius: '7px', cursor: 'pointer',
              background: activeTab === t.key ? '#0f4c81' : 'transparent',
              color: activeTab === t.key ? 'white' : '#555',
              fontWeight: activeTab === t.key ? '700' : '400', fontSize: '13px'
            }}>{t.label}</button>
        ))}
      </div>

      {/* ── POSITION TAB ── */}
      {activeTab === 'position' && (
        <div>
          {/* Opening Balances */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e3f0ff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>📋 Opening Balances</p>
              <button onClick={() => setEditingOpening(!editingOpening)}
                style={{ padding: '4px 12px', background: editingOpening ? '#ffebee' : '#e3f0ff', color: editingOpening ? '#c62828' : '#0f4c81', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                {editingOpening ? '✕ Cancel' : '✏️ Edit'}
              </button>
            </div>

            {editingOpening ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  {ACCOUNTS.map(acc => (
                    <div key={acc.key}>
                      <label style={{ fontSize: '11px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>
                        {acc.icon} {acc.label}
                      </label>
                      <input type="number" value={tempOpening[acc.key]}
                        onChange={e => setTempOpening(p => ({ ...p, [acc.key]: e.target.value }))}
                        placeholder="0"
                        style={{ width: '100%', padding: '8px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '14px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }} />
                    </div>
                  ))}
                </div>
                <div style={{ background: '#f0f7ff', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px' }}>
                  <p style={{ fontSize: '11px', color: '#0f4c81', margin: 0 }}>
                    💡 Enter balances you had before starting to use AquaRun. One time entry only.
                  </p>
                </div>
                <button onClick={saveOpeningBalances} disabled={savingOpening}
                  style={{ width: '100%', padding: '10px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                  {savingOpening ? 'Saving...' : '✓ Save Opening Balances'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                {ACCOUNTS.map(acc => (
                  <div key={acc.key} style={{ background: '#f8f9fa', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                    <p style={{ fontSize: '18px', margin: '0 0 4px' }}>{acc.icon}</p>
                    <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>{acc.label}</p>
                    <p style={{ fontSize: '16px', fontWeight: '700', color: acc.color, margin: 0 }}>
                      Rs. {openingBalances[acc.key].toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Date Filter */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
          </div>

          {/* Account Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            {[
              { label: '💵 Cash', value: netCash, color: '#0f4c81', bg: 'linear-gradient(135deg, #0f4c81, #1565c0)' },
              { label: '📱 JazzCash', value: netJazz, color: '#9c27b0', bg: 'linear-gradient(135deg, #6a1b9a, #9c27b0)' },
              { label: '🏦 Bank', value: netBank, color: '#1a7a4a', bg: 'linear-gradient(135deg, #1a7a4a, #2e7d32)' },
            ].map(card => (
              <div key={card.label} style={{ background: card.bg, color: 'white', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                <p style={{ fontSize: '12px', opacity: 0.7, margin: '0 0 6px' }}>{card.label}</p>
                <p style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>Rs. {card.value.toLocaleString()}</p>
              </div>
            ))}
          </div>

          {/* Total Banner */}
          <div style={{
            background: totalPosition >= 0 ? 'linear-gradient(135deg, #0f4c81, #1a7a4a)' : 'linear-gradient(135deg, #c62828, #e65100)',
            color: 'white', borderRadius: '14px', padding: '20px', marginBottom: '16px', textAlign: 'center'
          }}>
            <p style={{ fontSize: '12px', opacity: 0.7, margin: '0 0 6px', textTransform: 'uppercase' }}>Total Position</p>
            <p style={{ fontSize: '40px', fontWeight: '700', margin: '0 0 4px' }}>Rs. {totalPosition.toLocaleString()}</p>
            <p style={{ fontSize: '11px', opacity: 0.6, margin: 0 }}>
              Cash {netCash.toLocaleString()} + Jazz {netJazz.toLocaleString()} + Bank {netBank.toLocaleString()}
            </p>
          </div>

          {/* JazzCash Pending */}
          {data?.jazzPending > 0 && (
            <div style={{ background: '#fff3e0', border: '1px solid #ffe082', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#e65100', margin: '0 0 2px' }}>⏳ JazzCash Pending Confirmation</p>
              <p style={{ fontSize: '12px', color: '#795548', margin: 0 }}>
                Rs. {data.jazzPending.toLocaleString()} awaiting confirmation — will add to JazzCash once confirmed
              </p>
            </div>
          )}

          {/* Per Account Breakdown */}
          {[
            {
              key: 'cash', label: '💵 Cash Account', color: '#0f4c81',
              rows: [
                { label: 'Opening Balance', value: openingBalances.cash, plus: true },
                { label: 'Cash from Riders', value: data?.cashIn || 0, plus: true },
                { label: 'Received from Accounts', value: data?.cashTransfersIn || 0, plus: true },
                { label: 'Transferred to Accounts', value: data?.cashTransfersOut || 0, plus: false },
                { label: 'Office Expenses (Cash)', value: data?.cashExpenses || 0, plus: false },
                { label: 'Inventory Purchases (Cash)', value: data?.cashPurchases || 0, plus: false },
                { label: 'Salaries (Cash)', value: data?.cashSalaries || 0, plus: false },
                { label: 'Advances (Cash)', value: data?.cashAdvances || 0, plus: false },
              ],
              net: netCash
            },
            {
              key: 'jazz', label: '📱 JazzCash Account', color: '#9c27b0',
              rows: [
                { label: 'Opening Balance', value: openingBalances.jazzcash, plus: true },
                { label: 'From Riders (JazzCash)', value: data?.jazzFromRiders || 0, plus: true },
                { label: 'From Customers (Confirmed)', value: data?.jazzFromCustomers || 0, plus: true },
                { label: 'Received from Accounts', value: data?.jazzTransfersIn || 0, plus: true },
                { label: 'Transferred to Accounts', value: data?.jazzTransfersOut || 0, plus: false },
                { label: 'Office Expenses (Jazz)', value: data?.jazzExpenses || 0, plus: false },
                { label: 'Inventory Purchases (Jazz)', value: data?.jazzPurchases || 0, plus: false },
                { label: 'Salaries (Jazz)', value: data?.jazzSalaries || 0, plus: false },
                { label: 'Advances (Jazz)', value: data?.jazzAdvancesOut || 0, plus: false },
              ],
              net: netJazz
            },
            {
              key: 'bank', label: '🏦 Bank Account', color: '#1a7a4a',
              rows: [
                { label: 'Opening Balance', value: openingBalances.bank, plus: true },
                { label: 'Received from Accounts', value: data?.bankTransfersIn || 0, plus: true },
                { label: 'Transferred to Accounts', value: data?.bankTransfersOut || 0, plus: false },
                { label: 'Office Expenses (Bank)', value: data?.bankExpenses || 0, plus: false },
                { label: 'Inventory Purchases (Bank)', value: data?.bankPurchases || 0, plus: false },
                { label: 'Salaries (Bank)', value: data?.bankSalaries || 0, plus: false },
                { label: 'Advances (Bank)', value: data?.bankAdvances || 0, plus: false },
              ],
              net: netBank
            }
          ].map(account => (
            <div key={account.key} style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${account.color}` }}>
              <p style={{ fontSize: '14px', fontWeight: '700', color: account.color, marginBottom: '10px' }}>{account.label}</p>
              {account.rows.filter(r => r.value !== 0).map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <span style={{ fontSize: '12px', color: '#555' }}>{r.plus ? '+' : '−'} {r.label}</span>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: r.plus ? '#1a7a4a' : '#f44336' }}>
                    Rs. {r.value.toLocaleString()}
                  </span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', marginTop: '4px', borderTop: `2px solid ${account.color}` }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#333' }}>Balance</span>
                <span style={{ fontSize: '18px', fontWeight: '700', color: account.net >= 0 ? account.color : '#f44336' }}>
                  Rs. {account.net.toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── MOVE MONEY TAB ── */}
      {activeTab === 'transfer' && (
        <div>
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>🔄 Move Money Between Accounts</h3>

            {transferSuccess && (
              <div style={{ background: '#e8f5e9', border: '1px solid #4caf50', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>✅ Transfer recorded successfully!</p>
              </div>
            )}

            {/* Current Balances */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
              {[
                { label: '💵 Cash', value: netCash, color: '#0f4c81' },
                { label: '📱 JazzCash', value: netJazz, color: '#9c27b0' },
                { label: '🏦 Bank', value: netBank, color: '#1a7a4a' },
              ].map(b => (
                <div key={b.label} style={{ background: '#f8f9fa', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                  <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>{b.label}</p>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: b.color, margin: 0 }}>Rs. {b.value.toLocaleString()}</p>
                </div>
              ))}
            </div>

            {/* From */}
            <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '8px' }}>FROM Account</p>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {ACCOUNTS.map(acc => (
                <button key={acc.key} onClick={() => {
                  setTransferFrom(acc.key)
                  if (transferTo === acc.key) setTransferTo(ACCOUNTS.find(a => a.key !== acc.key)?.key)
                }}
                  style={{ flex: 1, padding: '12px 6px', border: '2px solid', borderColor: transferFrom === acc.key ? acc.color : '#eee', borderRadius: '10px', cursor: 'pointer', background: transferFrom === acc.key ? acc.color : 'white', color: transferFrom === acc.key ? 'white' : '#555', fontWeight: '700', fontSize: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '20px' }}>{acc.icon}</span>
                  <span>{acc.label.split(' ')[0]}</span>
                </button>
              ))}
            </div>

            {/* To */}
            <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '8px' }}>TO Account</p>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {ACCOUNTS.filter(a => a.key !== transferFrom).map(acc => (
                <button key={acc.key} onClick={() => setTransferTo(acc.key)}
                  style={{ flex: 1, padding: '12px 6px', border: '2px solid', borderColor: transferTo === acc.key ? acc.color : '#eee', borderRadius: '10px', cursor: 'pointer', background: transferTo === acc.key ? acc.color : 'white', color: transferTo === acc.key ? 'white' : '#555', fontWeight: '700', fontSize: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '20px' }}>{acc.icon}</span>
                  <span>{acc.label.split(' ')[0]}</span>
                </button>
              ))}
            </div>

            {/* Transfer summary */}
            <div style={{ background: '#f0f7ff', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>{ACCOUNTS.find(a => a.key === transferFrom)?.icon}</span>
              <span style={{ fontSize: '13px', color: '#555' }}>{ACCOUNTS.find(a => a.key === transferFrom)?.label}</span>
              <span style={{ fontSize: '18px' }}>→</span>
              <span style={{ fontSize: '18px' }}>{ACCOUNTS.find(a => a.key === transferTo)?.icon}</span>
              <span style={{ fontSize: '13px', color: '#555' }}>{ACCOUNTS.find(a => a.key === transferTo)?.label}</span>
            </div>

            {/* Amount */}
            <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>Amount (Rs.)</p>
            <input type="number" value={transferAmount} onChange={e => setTransferAmount(e.target.value)}
              placeholder="0"
              style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '24px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center', marginBottom: '12px' }} />

            {/* Date */}
            <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>Date</p>
            <input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)}
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '12px' }} />

            {/* Notes */}
            <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>Notes (optional)</p>
            <input value={transferNotes} onChange={e => setTransferNotes(e.target.value)}
              placeholder="e.g. Deposited cash to JazzCash account"
              style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '16px' }} />

            <button onClick={postAccountTransfer} disabled={savingTransfer}
              style={{ width: '100%', padding: '14px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
              {savingTransfer ? 'Recording...' : '✓ Record Transfer'}
            </button>
          </div>
        </div>
      )}

      {/* ── HISTORY TAB ── */}
      {activeTab === 'history' && (
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#333', marginBottom: '12px' }}>📋 Account Transfer History</h3>
          {accountTransfers.length === 0 ? (
            <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '32px', marginBottom: '8px' }}>🔄</p>
              <p style={{ color: '#888' }}>No transfers recorded yet</p>
            </div>
          ) : accountTransfers.map(t => {
            const fromAcc = ACCOUNTS.find(a => a.key === t.from_account)
            const toAcc = ACCOUNTS.find(a => a.key === t.to_account)
            return (
              <div key={t.id} style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '20px' }}>{fromAcc?.icon}</span>
                    <span style={{ fontSize: '14px', color: '#555' }}>→</span>
                    <span style={{ fontSize: '20px' }}>{toAcc?.icon}</span>
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: '600', color: '#333', margin: 0 }}>
                        {fromAcc?.label} → {toAcc?.label}
                      </p>
                      {t.notes && <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{t.notes}</p>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '16px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {Number(t.amount).toLocaleString()}</p>
                    <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>
                      {new Date(t.transfer_date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button onClick={fetchAll}
        style={{ width: '100%', padding: '12px', background: '#f0f4ff', color: '#0f4c81', border: '1px solid #c8d8ff', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', marginTop: '16px' }}>
        🔄 Refresh
      </button>
    </div>
  )
}