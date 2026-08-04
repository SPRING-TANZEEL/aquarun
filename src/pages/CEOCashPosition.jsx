import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import * as AccountingEngine from '../accountingEngine'

const ACCOUNTS = [
  { key: 'cash',      label: 'Cash in Hand', icon: '💵', color: '#1a7a4a', bg: '#e8f5e9', code: '1001' },
  { key: 'jazzcash',  label: 'JazzCash',     icon: '📱', color: '#9c27b0', bg: '#f3e5f5', code: '1002' },
  { key: 'easypaisa', label: 'EasyPaisa',    icon: '💚', color: '#2e7d32', bg: '#e8f5e9', code: '1004' },
  { key: 'bank',      label: 'Bank',         icon: '🏦', color: '#0f4c81', bg: '#e3f0ff', code: '1003' },
]

const fmt = (n) => Math.abs(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0 })

export default function CEOCashPosition({ tenantId }) {
  const [loading, setLoading]                 = useState(true)
  const [activeTab, setActiveTab]             = useState('overview')
  const [data, setData]                       = useState(null)
  const [openingBalances, setOpeningBalances] = useState({ cash: 0, jazzcash: 0, easypaisa: 0, bank: 0 })
  const [editingOpening, setEditingOpening]   = useState(false)
  const [tempOpening, setTempOpening]         = useState({ cash: '', jazzcash: '', easypaisa: '', bank: '' })
  const [savingOpening, setSavingOpening]     = useState(false)
  const [accountTransfers, setAccountTransfers] = useState([])
  const [ownerTransactions, setOwnerTransactions] = useState([])
  const [transferFrom, setTransferFrom]       = useState('cash')
  const [transferTo, setTransferTo]           = useState('jazzcash')
  const [transferAmount, setTransferAmount]   = useState('')
  const [transferNotes, setTransferNotes]     = useState('')
  const [transferDate, setTransferDate]       = useState(new Date().toISOString().split('T')[0])
  const [savingTransfer, setSavingTransfer]   = useState(false)
  const [transferSuccess, setTransferSuccess] = useState(false)
  const [ownerType, setOwnerType]             = useState('injection')
  const [ownerAccount, setOwnerAccount]       = useState('cash')
  const [ownerAmount, setOwnerAmount]         = useState('')
  const [ownerDate, setOwnerDate]             = useState(new Date().toISOString().split('T')[0])
  const [ownerNotes, setOwnerNotes]           = useState('')
  const [savingOwner, setSavingOwner]         = useState(false)
  const [ownerSuccess, setOwnerSuccess]       = useState(false)
  const [dateFrom, setDateFrom]               = useState(new Date().toISOString().slice(0, 7) + '-01')
  const [dateTo, setDateTo]                   = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { if (tenantId) fetchAll() }, [dateFrom, dateTo, tenantId])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchOpeningBalances(), fetchTransactions(), fetchAccountTransfers(), fetchOwnerTransactions()])
    setLoading(false)
  }

  async function fetchOpeningBalances() {
    const { data } = await supabase.from('chart_of_accounts')
      .select('account_code, opening_balance').eq('tenant_id', tenantId)
      .in('account_code', ['1001', '1002', '1003', '1004'])
    const map = {}
    data?.forEach(a => { map[a.account_code] = Number(a.opening_balance || 0) })
    const balances = { cash: map['1001'] || 0, jazzcash: map['1002'] || 0, bank: map['1003'] || 0, easypaisa: map['1004'] || 0 }
    setOpeningBalances(balances)
    setTempOpening({ cash: String(balances.cash), jazzcash: String(balances.jazzcash), easypaisa: String(balances.easypaisa), bank: String(balances.bank) })
  }

  async function saveOpeningBalances() {
    setSavingOpening(true)
    for (const [code, key] of [['1001', 'cash'], ['1002', 'jazzcash'], ['1003', 'bank'], ['1004', 'easypaisa']]) {
      await supabase.from('chart_of_accounts').update({ opening_balance: Number(tempOpening[key]) || 0 }).eq('account_code', code).eq('tenant_id', tenantId)
    }
    const { data: customers } = await supabase.from('customers').select('opening_balance').eq('tenant_id', tenantId).eq('is_active', true)
    const totalReceivable = customers?.reduce((s, c) => s + Math.max(0, Number(c.opening_balance || 0)), 0) || 0
    await supabase.from('chart_of_accounts').update({ opening_balance: totalReceivable }).eq('account_code', '1100').eq('tenant_id', tenantId)
    const totalAssets = (Number(tempOpening.cash) || 0) + (Number(tempOpening.jazzcash) || 0) + (Number(tempOpening.bank) || 0) + (Number(tempOpening.easypaisa) || 0) + totalReceivable
    await supabase.from('chart_of_accounts').update({ opening_balance: totalAssets }).eq('account_code', '3001').eq('tenant_id', tenantId)
    await supabase.from('business_settings').upsert([
      { tenant_id: tenantId, setting_key: 'opening_cash_balance', setting_value: String(Number(tempOpening.cash) || 0) },
      { tenant_id: tenantId, setting_key: 'opening_jazzcash_balance', setting_value: String(Number(tempOpening.jazzcash) || 0) },
      { tenant_id: tenantId, setting_key: 'opening_bank_balance', setting_value: String(Number(tempOpening.bank) || 0) },
      { tenant_id: tenantId, setting_key: 'opening_easypaisa_balance', setting_value: String(Number(tempOpening.easypaisa) || 0) },
    ], { onConflict: 'tenant_id,setting_key' })
    setEditingOpening(false)
    setSavingOpening(false)
    fetchAll()
  }

  async function fetchAccountTransfers() {
    const { data } = await supabase.from('ceo_account_transfers').select('*').eq('tenant_id', tenantId).order('transfer_date', { ascending: false })
    setAccountTransfers(data || [])
  }

  async function fetchOwnerTransactions() {
    const { data } = await supabase.from('owner_transactions').select('*').eq('tenant_id', tenantId).order('transaction_date', { ascending: false })
    setOwnerTransactions(data || [])
  }

  async function fetchTransactions() {
    const from = dateFrom + 'T00:00:00'
    const to = dateTo + 'T23:59:59'

    const [
      { data: cashTransfers }, { data: jazzSales }, { data: jazzPayments },
      { data: epSales }, { data: epPayments }, { data: officeExpenses },
      { data: stockPurchases }, { data: salaryPayments }, { data: advances },
      { data: ceoTransfers }, { data: ownerTx },
      { data: adminCashSales }, { data: adminCashPayments },
      { data: jazzPendingSales }, { data: jazzPendingPay },
      { data: epPendingSales }, { data: epPendingPay }
    ] = await Promise.all([
      supabase.from('cash_transfers').select('*, from_rider:from_rider_id(full_name)').eq('tenant_id', tenantId).eq('to_office', true).eq('status', 'confirmed').gte('transfer_date', dateFrom).lte('transfer_date', dateTo),
      supabase.from('deliveries').select('*, customers(full_name)').eq('tenant_id', tenantId).eq('payment_method', 'jazzcash').eq('jazzcash_confirmed', true).eq('is_voided', false).gte('delivered_at', from).lte('delivered_at', to),
      supabase.from('payments').select('*, customers(full_name)').eq('tenant_id', tenantId).eq('payment_method', 'jazzcash').eq('jazzcash_confirmed', true).eq('is_voided', false).gte('created_at', from).lte('created_at', to),
      supabase.from('deliveries').select('*, customers(full_name)').eq('tenant_id', tenantId).eq('payment_method', 'easypaisa').eq('jazzcash_confirmed', true).eq('is_voided', false).gte('delivered_at', from).lte('delivered_at', to),
      supabase.from('payments').select('*, customers(full_name)').eq('tenant_id', tenantId).eq('payment_method', 'easypaisa').eq('jazzcash_confirmed', true).eq('is_voided', false).gte('created_at', from).lte('created_at', to),
      supabase.from('office_expenses').select('*').eq('tenant_id', tenantId).eq('is_voided', false).gte('expense_date', dateFrom).lte('expense_date', dateTo),
      supabase.from('stock_purchases').select('*, products(name)').eq('tenant_id', tenantId).gte('purchase_date', dateFrom).lte('purchase_date', dateTo),
      supabase.from('salary_payments').select('*, rider:rider_id(full_name)').eq('tenant_id', tenantId).gte('payment_date', dateFrom).lte('payment_date', dateTo),
      supabase.from('salary_advances').select('*, rider:rider_id(full_name)').eq('tenant_id', tenantId).eq('requested_from', 'ceo').eq('status', 'approved').eq('is_voided', false).gte('approved_at', from).lte('approved_at', to),
      supabase.from('ceo_account_transfers').select('*').eq('tenant_id', tenantId).gte('transfer_date', dateFrom).lte('transfer_date', dateTo),
      supabase.from('owner_transactions').select('*').eq('tenant_id', tenantId).gte('transaction_date', dateFrom).lte('transaction_date', dateTo),
      supabase.from('deliveries').select('amount_received').eq('tenant_id', tenantId).eq('payment_method', 'cash').is('rider_id', null).eq('is_voided', false).gte('delivered_at', from).lte('delivered_at', to),
      supabase.from('payments').select('amount').eq('tenant_id', tenantId).eq('payment_method', 'cash').is('rider_id', null).eq('is_voided', false).gte('created_at', from).lte('created_at', to),
      supabase.from('deliveries').select('total_amount').eq('tenant_id', tenantId).eq('payment_method', 'jazzcash').eq('jazzcash_confirmed', false).eq('is_voided', false),
      supabase.from('payments').select('amount').eq('tenant_id', tenantId).eq('payment_method', 'jazzcash').eq('jazzcash_confirmed', false).eq('is_voided', false),
      supabase.from('deliveries').select('total_amount').eq('tenant_id', tenantId).eq('payment_method', 'easypaisa').eq('jazzcash_confirmed', false).eq('is_voided', false),
      supabase.from('payments').select('amount').eq('tenant_id', tenantId).eq('payment_method', 'easypaisa').eq('jazzcash_confirmed', false).eq('is_voided', false),
    ])

    const byMethod = (arr, method, field = 'amount') => arr?.filter(i => (i.payment_method || 'cash') === method).reduce((s, i) => s + Number(i[field] || 0), 0) || 0
    const sum = (arr, field = 'amount') => arr?.reduce((s, i) => s + Number(i[field] || 0), 0) || 0

    const adminCashSalesTotal = sum(adminCashSales, 'amount_received')
    const adminCashPaymentsTotal = sum(adminCashPayments)
    const allCashRiders = cashTransfers?.filter(t => !t.transfer_type || t.transfer_type === 'cash').reduce((s, t) => s + Number(t.amount), 0) || 0
    const cashTransfersOut = ceoTransfers?.filter(t => t.from_account === 'cash').reduce((s, t) => s + Number(t.amount), 0) || 0
    const cashTransfersIn = ceoTransfers?.filter(t => t.to_account === 'cash').reduce((s, t) => s + Number(t.amount), 0) || 0
    const cashOwnerIn = ownerTx?.filter(t => t.transaction_type === 'injection' && t.account === 'cash').reduce((s, t) => s + Number(t.amount), 0) || 0
    const cashOwnerOut = ownerTx?.filter(t => t.transaction_type === 'drawing' && t.account === 'cash').reduce((s, t) => s + Number(t.amount), 0) || 0
    const jazzFromRiders = cashTransfers?.filter(t => t.transfer_type === 'jazzcash').reduce((s, t) => s + Number(t.amount), 0) || 0
    const jazzFromCustomers = sum(jazzSales, 'total_amount') + sum(jazzPayments)
    const jazzTransfersOut = ceoTransfers?.filter(t => t.from_account === 'jazzcash').reduce((s, t) => s + Number(t.amount), 0) || 0
    const jazzTransfersIn = ceoTransfers?.filter(t => t.to_account === 'jazzcash').reduce((s, t) => s + Number(t.amount), 0) || 0
    const jazzOwnerIn = ownerTx?.filter(t => t.transaction_type === 'injection' && t.account === 'jazzcash').reduce((s, t) => s + Number(t.amount), 0) || 0
    const jazzOwnerOut = ownerTx?.filter(t => t.transaction_type === 'drawing' && t.account === 'jazzcash').reduce((s, t) => s + Number(t.amount), 0) || 0
    const epFromRiders = cashTransfers?.filter(t => t.transfer_type === 'easypaisa').reduce((s, t) => s + Number(t.amount), 0) || 0
    const epFromCustomers = sum(epSales, 'total_amount') + sum(epPayments)
    const epTransfersOut = ceoTransfers?.filter(t => t.from_account === 'easypaisa').reduce((s, t) => s + Number(t.amount), 0) || 0
    const epTransfersIn = ceoTransfers?.filter(t => t.to_account === 'easypaisa').reduce((s, t) => s + Number(t.amount), 0) || 0
    const epOwnerIn = ownerTx?.filter(t => t.transaction_type === 'injection' && t.account === 'easypaisa').reduce((s, t) => s + Number(t.amount), 0) || 0
    const epOwnerOut = ownerTx?.filter(t => t.transaction_type === 'drawing' && t.account === 'easypaisa').reduce((s, t) => s + Number(t.amount), 0) || 0
    const bankTransfersIn = ceoTransfers?.filter(t => t.to_account === 'bank').reduce((s, t) => s + Number(t.amount), 0) || 0
    const bankTransfersOut = ceoTransfers?.filter(t => t.from_account === 'bank').reduce((s, t) => s + Number(t.amount), 0) || 0
    const bankOwnerIn = ownerTx?.filter(t => t.transaction_type === 'injection' && t.account === 'bank').reduce((s, t) => s + Number(t.amount), 0) || 0
    const bankOwnerOut = ownerTx?.filter(t => t.transaction_type === 'drawing' && t.account === 'bank').reduce((s, t) => s + Number(t.amount), 0) || 0
    const jazzPending = sum(jazzPendingSales, 'total_amount') + sum(jazzPendingPay)
    const epPending = sum(epPendingSales, 'total_amount') + sum(epPendingPay)
    const totalInjections = ownerTx?.filter(t => t.transaction_type === 'injection').reduce((s, t) => s + Number(t.amount), 0) || 0
    const totalDrawings = ownerTx?.filter(t => t.transaction_type === 'drawing').reduce((s, t) => s + Number(t.amount), 0) || 0

    setData({
      allCashRiders, adminCashSalesTotal, adminCashPaymentsTotal,
      cashTransfersOut, cashTransfersIn, cashOwnerIn, cashOwnerOut,
      cashExpenses: byMethod(officeExpenses, 'cash'), cashPurchases: byMethod(stockPurchases, 'cash', 'total_cost'),
      cashSalaries: byMethod(salaryPayments, 'cash', 'amount_paid'), cashAdvances: byMethod(advances, 'cash'),
      jazzFromRiders, jazzFromCustomers, jazzTransfersOut, jazzTransfersIn, jazzOwnerIn, jazzOwnerOut,
      jazzExpenses: byMethod(officeExpenses, 'jazzcash'), jazzPurchases: byMethod(stockPurchases, 'jazzcash', 'total_cost'),
      jazzSalaries: byMethod(salaryPayments, 'jazzcash', 'amount_paid'), jazzAdvancesOut: byMethod(advances, 'jazzcash'),
      epFromRiders, epFromCustomers, epTransfersOut, epTransfersIn, epOwnerIn, epOwnerOut,
      epExpenses: byMethod(officeExpenses, 'easypaisa'), epPurchases: byMethod(stockPurchases, 'easypaisa', 'total_cost'),
      epSalaries: byMethod(salaryPayments, 'easypaisa', 'amount_paid'), epAdvancesOut: byMethod(advances, 'easypaisa'),
      bankTransfersIn, bankTransfersOut, bankOwnerIn, bankOwnerOut,
      bankExpenses: byMethod(officeExpenses, 'bank'), bankPurchases: byMethod(stockPurchases, 'bank', 'total_cost'),
      bankSalaries: byMethod(salaryPayments, 'bank', 'amount_paid'), bankAdvances: byMethod(advances, 'bank'),
      jazzPending, epPending, totalInjections, totalDrawings,
    })
  }

  async function postAccountTransfer() {
    if (!transferAmount || Number(transferAmount) <= 0) return alert('Please enter a valid amount')
    if (transferFrom === transferTo) return alert('From and To accounts cannot be the same')
    setSavingTransfer(true)
    const { data: savedTransfer, error } = await supabase.from('ceo_account_transfers').insert([{
      tenant_id: tenantId, from_account: transferFrom, to_account: transferTo,
      amount: Number(transferAmount), transfer_date: transferDate, notes: transferNotes
    }]).select().single()
    if (error) { alert('Error: ' + error.message); setSavingTransfer(false); return }
    try { await AccountingEngine.postAccountTransferJournal(savedTransfer, tenantId) } catch (err) { console.error(err) }
    setTransferAmount(''); setTransferNotes('')
    setTransferSuccess(true); setTimeout(() => setTransferSuccess(false), 3000)
    setSavingTransfer(false); fetchAll()
  }

  async function postOwnerTransaction() {
    if (!ownerAmount || Number(ownerAmount) <= 0) return alert('Please enter a valid amount')
    setSavingOwner(true)
    const { data: savedTx, error } = await supabase.from('owner_transactions').insert([{
      tenant_id: tenantId, transaction_type: ownerType, account: ownerAccount,
      amount: Number(ownerAmount), transaction_date: ownerDate, notes: ownerNotes
    }]).select().single()
    if (error) { alert('Error: ' + error.message); setSavingOwner(false); return }
    try { await AccountingEngine.postOwnerTransactionJournal(savedTx, tenantId) } catch (err) { console.error(err) }
    setOwnerAmount(''); setOwnerNotes('')
    setOwnerSuccess(true); setTimeout(() => setOwnerSuccess(false), 3000)
    setSavingOwner(false); fetchAll()
  }

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center' }}>
      <p style={{ fontSize: 32, margin: '0 0 12px' }}>🏦</p>
      <p style={{ color: '#888', fontSize: 14 }}>Loading cash position...</p>
    </div>
  )

  const netCash = openingBalances.cash + (data?.allCashRiders||0) + (data?.adminCashSalesTotal||0) + (data?.adminCashPaymentsTotal||0) + (data?.cashTransfersIn||0) + (data?.cashOwnerIn||0) - (data?.cashExpenses||0) - (data?.cashPurchases||0) - (data?.cashSalaries||0) - (data?.cashAdvances||0) - (data?.cashTransfersOut||0) - (data?.cashOwnerOut||0)
  const netJazz = openingBalances.jazzcash + (data?.jazzFromRiders||0) + (data?.jazzFromCustomers||0) + (data?.jazzTransfersIn||0) + (data?.jazzOwnerIn||0) - (data?.jazzExpenses||0) - (data?.jazzPurchases||0) - (data?.jazzSalaries||0) - (data?.jazzAdvancesOut||0) - (data?.jazzTransfersOut||0) - (data?.jazzOwnerOut||0)
  const netEP = openingBalances.easypaisa + (data?.epFromRiders||0) + (data?.epFromCustomers||0) + (data?.epTransfersIn||0) + (data?.epOwnerIn||0) - (data?.epExpenses||0) - (data?.epPurchases||0) - (data?.epSalaries||0) - (data?.epAdvancesOut||0) - (data?.epTransfersOut||0) - (data?.epOwnerOut||0)
  const netBank = openingBalances.bank + (data?.bankTransfersIn||0) + (data?.bankOwnerIn||0) - (data?.bankExpenses||0) - (data?.bankPurchases||0) - (data?.bankSalaries||0) - (data?.bankAdvances||0) - (data?.bankTransfersOut||0) - (data?.bankOwnerOut||0)
  const totalPosition = netCash + netJazz + netEP + netBank

  const accountBalances = { cash: netCash, jazzcash: netJazz, easypaisa: netEP, bank: netBank }

  const inp = { width: '100%', padding: '11px 14px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: 'white', color: '#333' }
  const sel = { ...inp, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath fill='%23888' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32 }

  const today = new Date().toISOString().split('T')[0]
  const firstOfMonth = new Date().toISOString().slice(0, 7) + '-01'
  const firstOfLastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split('T')[0]
  const lastOfLastMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split('T')[0]

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: 1000, margin: '0 auto' }}>

      {/* Page Header */}
      <div style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)', borderRadius: 14, padding: '22px 28px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <p style={{ color: '#fff', fontWeight: 900, fontSize: 19, margin: '0 0 4px', letterSpacing: '-0.3px' }}>🏦 CEO Cash Position</p>
          <p style={{ color: '#93c5fd', fontSize: 12, margin: 0 }}>Complete wallet overview — Cash, JazzCash, EasyPaisa & Bank</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ color: '#93c5fd', fontSize: 11, margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: 1 }}>Total Position</p>
          <p style={{ color: '#fff', fontWeight: 900, fontSize: 26, margin: 0, letterSpacing: '-0.5px' }}>Rs. {fmt(totalPosition)}</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 4, background: 'white', padding: 5, borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', marginBottom: 20 }}>
        {[
          { key: 'overview', icon: '📊', label: 'Overview' },
          { key: 'transfer', icon: '🔄', label: 'Transfer' },
          { key: 'owner',    icon: '👤', label: 'Owner' },
          { key: 'history',  icon: '📋', label: 'History' },
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            flex: 1, padding: '8px 4px', border: 'none', borderRadius: 8, cursor: 'pointer',
            background: activeTab === t.key ? '#0f4c81' : 'transparent',
            color: activeTab === t.key ? 'white' : '#666',
            fontWeight: activeTab === t.key ? 700 : 500,
            fontSize: 11, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          }}>
            <span style={{ fontSize: 16 }}>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW TAB ══ */}
      {activeTab === 'overview' && (
        <div>
          {/* Date Filter */}
          <div style={{ background: 'white', borderRadius: 10, padding: '10px 14px', marginBottom: 16, boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
            {/* Row 1 — Quick buttons */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {[
                { label: 'Today',      from: today,           to: today },
                { label: 'This Month', from: firstOfMonth,    to: today },
                { label: 'Last Month', from: firstOfLastMonth, to: lastOfLastMonth },
                { label: 'All Time',   from: '2024-01-01',    to: today },
              ].map(p => (
                <button key={p.label} onClick={() => { setDateFrom(p.from); setDateTo(p.to) }}
                  style={{ flex: 1, padding: '6px 4px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                    background: dateFrom === p.from && dateTo === p.to ? '#0f4c81' : '#f0f4f8',
                    color: dateFrom === p.from && dateTo === p.to ? '#fff' : '#555' }}>
                  {p.label}
                </button>
              ))}
            </div>
            {/* Row 2 — Date range */}
            <div style={{ height: 1, background: '#f0f0f0', marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#888', fontWeight: 600, whiteSpace: 'nowrap' }}>📅</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={{ flex: 1, padding: '5px 8px', border: '1.5px solid #e0e0e0', borderRadius: 6, fontSize: 11, outline: 'none' }} />
              <span style={{ color: '#aaa', fontSize: 11 }}>—</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                style={{ flex: 1, padding: '5px 8px', border: '1.5px solid #e0e0e0', borderRadius: 6, fontSize: 11, outline: 'none' }} />
            </div>
          </div>

          {/* Account Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {ACCOUNTS.map(acc => {
              const bal = accountBalances[acc.key]
              const pending = acc.key === 'jazzcash' ? data?.jazzPending : acc.key === 'easypaisa' ? data?.epPending : 0
              return (
                <div key={acc.key} style={{ background: 'white', borderRadius: 12, padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', borderTop: `3px solid ${acc.color}` }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: acc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>{acc.icon}</div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>{acc.label}</span>
                  </div>
                  {/* Balance */}
                  <p style={{ fontSize: 18, fontWeight: 900, color: bal >= 0 ? acc.color : '#c62828', margin: '0 0 3px', letterSpacing: '-0.3px' }}>
                    Rs. {fmt(bal)}
                  </p>
                  <p style={{ fontSize: 10, color: '#aaa', margin: 0 }}>
                    Opening: Rs. {fmt(openingBalances[acc.key])}
                  </p>
                  {pending > 0 && (
                    <div style={{ marginTop: 8, padding: '4px 8px', background: '#fff8e1', borderRadius: 5, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: '#b45309', fontWeight: 600 }}>⏳ Pending</span>
                      <span style={{ fontSize: 10, color: '#b45309', fontWeight: 700 }}>Rs. {fmt(pending)}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Opening Balances Edit */}
          <div style={{ background: 'white', borderRadius: 12, padding: '16px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #e3f0ff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editingOpening ? 16 : 0 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#0f4c81', margin: '0 0 2px' }}>📋 Opening Balances</p>
                <p style={{ fontSize: 11, color: '#888', margin: 0 }}>Set balances from when you started using AquaRun</p>
              </div>
              <button onClick={() => setEditingOpening(!editingOpening)} style={{ padding: '6px 14px', background: editingOpening ? '#ffebee' : '#e3f0ff', color: editingOpening ? '#c62828' : '#0f4c81', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                {editingOpening ? '✕ Cancel' : '✏️ Edit'}
              </button>
            </div>
            {editingOpening && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
                  {ACCOUNTS.map(acc => (
                    <div key={acc.key}>
                      <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 5, fontWeight: 600 }}>{acc.icon} {acc.label}</label>
                      <input type="number" value={tempOpening[acc.key]} onChange={e => setTempOpening(p => ({ ...p, [acc.key]: e.target.value }))}
                        placeholder="0" style={{ ...inp, fontSize: 16, fontWeight: 700, textAlign: 'center' }} />
                    </div>
                  ))}
                </div>
                <button onClick={saveOpeningBalances} disabled={savingOpening}
                  style={{ width: '100%', padding: '12px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
                  {savingOpening ? '⏳ Saving...' : '✓ Save Opening Balances'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ TRANSFER TAB ══ */}
      {activeTab === 'transfer' && (
        <div style={{ background: 'white', borderRadius: 14, padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
          <div style={{ maxWidth: 520, margin: '0 auto' }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: '#1a1a2e', margin: '0 0 6px' }}>🔄 Transfer Between Accounts</p>
            <p style={{ fontSize: 13, color: '#888', margin: '0 0 28px' }}>Move money from one account to another</p>

            {transferSuccess && (
              <div style={{ background: '#e8f5e9', border: '1px solid #86efac', borderRadius: 10, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>✅</span>
                <div>
                  <p style={{ fontWeight: 700, color: '#1a7a4a', margin: '0 0 2px', fontSize: 14 }}>Transfer Successful</p>
                  <p style={{ color: '#2e7d32', fontSize: 12, margin: 0 }}>Journal entry posted and balances updated</p>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'end', marginBottom: 20 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>From Account</label>
                <select value={transferFrom} onChange={e => setTransferFrom(e.target.value)} style={sel}>
                  {ACCOUNTS.map(a => <option key={a.key} value={a.key}>{a.icon} {a.label} — Rs. {fmt(accountBalances[a.key])}</option>)}
                </select>
              </div>
              <div style={{ paddingBottom: 3, fontSize: 22, color: '#0f4c81', fontWeight: 900 }}>→</div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>To Account</label>
                <select value={transferTo} onChange={e => setTransferTo(e.target.value)} style={sel}>
                  {ACCOUNTS.filter(a => a.key !== transferFrom).map(a => <option key={a.key} value={a.key}>{a.icon} {a.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>Amount (Rs.)</label>
                <input type="number" value={transferAmount} onChange={e => setTransferAmount(e.target.value)}
                  placeholder="0" style={{ ...inp, fontSize: 18, fontWeight: 700 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>Date</label>
                <input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} style={inp} />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>Notes (optional)</label>
              <input value={transferNotes} onChange={e => setTransferNotes(e.target.value)} placeholder="e.g. Weekly settlement" style={inp} />
            </div>

            <button onClick={postAccountTransfer} disabled={savingTransfer || !transferAmount}
              style={{ width: '100%', padding: '14px', background: savingTransfer ? '#e0e0e0' : '#0f4c81', color: 'white', border: 'none', borderRadius: 10, cursor: savingTransfer ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 700 }}>
              {savingTransfer ? '⏳ Processing...' : `🔄 Transfer Rs. ${transferAmount ? Number(transferAmount).toLocaleString() : '0'}`}
            </button>
          </div>
        </div>
      )}

      {/* ══ OWNER TAB ══ */}
      {activeTab === 'owner' && (
        <div style={{ background: 'white', borderRadius: 14, padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
          <div style={{ maxWidth: 520, margin: '0 auto' }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: '#1a1a2e', margin: '0 0 6px' }}>👤 Owner Transactions</p>
            <p style={{ fontSize: 13, color: '#888', margin: '0 0 24px' }}>Record capital injections or owner drawings</p>

            {ownerSuccess && (
              <div style={{ background: '#e8f5e9', border: '1px solid #86efac', borderRadius: 10, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>✅</span>
                <p style={{ fontWeight: 700, color: '#1a7a4a', margin: 0, fontSize: 14 }}>Transaction recorded successfully</p>
              </div>
            )}

            {/* Transaction Type */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 8 }}>Transaction Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { key: 'injection', label: 'Capital Injection', icon: '💰', desc: 'Money put into business', color: '#1a7a4a', bg: '#e8f5e9' },
                  { key: 'drawing', label: 'Owner Drawing', icon: '💸', desc: 'Money taken out of business', color: '#c62828', bg: '#ffebee' },
                ].map(t => (
                  <button key={t.key} onClick={() => setOwnerType(t.key)} style={{
                    padding: '16px', border: `2px solid ${ownerType === t.key ? t.color : '#e0e0e0'}`,
                    borderRadius: 10, cursor: 'pointer', background: ownerType === t.key ? t.bg : 'white',
                    textAlign: 'left', transition: 'all 0.15s',
                  }}>
                    <p style={{ fontSize: 22, margin: '0 0 6px' }}>{t.icon}</p>
                    <p style={{ fontSize: 13, fontWeight: 700, color: ownerType === t.key ? t.color : '#333', margin: '0 0 3px' }}>{t.label}</p>
                    <p style={{ fontSize: 11, color: '#888', margin: 0 }}>{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>Account</label>
                <select value={ownerAccount} onChange={e => setOwnerAccount(e.target.value)} style={sel}>
                  {ACCOUNTS.map(a => <option key={a.key} value={a.key}>{a.icon} {a.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>Date</label>
                <input type="date" value={ownerDate} onChange={e => setOwnerDate(e.target.value)} style={inp} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>Amount (Rs.)</label>
              <input type="number" value={ownerAmount} onChange={e => setOwnerAmount(e.target.value)}
                placeholder="0" style={{ ...inp, fontSize: 20, fontWeight: 700 }} />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 6 }}>Notes (optional)</label>
              <input value={ownerNotes} onChange={e => setOwnerNotes(e.target.value)} placeholder="e.g. Monthly personal expenses" style={inp} />
            </div>

            <button onClick={postOwnerTransaction} disabled={savingOwner || !ownerAmount}
              style={{ width: '100%', padding: '14px', background: savingOwner ? '#e0e0e0' : ownerType === 'injection' ? '#1a7a4a' : '#c62828', color: 'white', border: 'none', borderRadius: 10, cursor: savingOwner ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 700 }}>
              {savingOwner ? '⏳ Processing...' : ownerType === 'injection' ? `💰 Record Capital Injection — Rs. ${ownerAmount ? Number(ownerAmount).toLocaleString() : '0'}` : `💸 Record Drawing — Rs. ${ownerAmount ? Number(ownerAmount).toLocaleString() : '0'}`}
            </button>

            {/* Owner Equity Summary */}
            <div style={{ marginTop: 24, padding: '16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e0e0e0' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#555', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Owner Equity — All Time</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: '#1a7a4a' }}>💰 Total Injections</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1a7a4a' }}>Rs. {fmt(data?.totalInjections)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: '#c62828' }}>💸 Total Drawings</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#c62828' }}>Rs. {fmt(data?.totalDrawings)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid #e0e0e0' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>Net Owner Equity</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: (data?.totalInjections||0) - (data?.totalDrawings||0) >= 0 ? '#1a7a4a' : '#c62828' }}>
                  Rs. {fmt((data?.totalInjections||0) - (data?.totalDrawings||0))}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ HISTORY TAB ══ */}
      {activeTab === 'history' && (
        <div style={{ background: 'white', borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#1a1a2e', margin: 0 }}>📋 Transaction History</p>
            <span style={{ fontSize: 12, color: '#888' }}>{accountTransfers.length + ownerTransactions.length} total records</span>
          </div>

          {accountTransfers.length === 0 && ownerTransactions.length === 0 ? (
            <div style={{ padding: 50, textAlign: 'center' }}>
              <p style={{ fontSize: 40, margin: '0 0 12px' }}>📋</p>
              <p style={{ color: '#888', fontSize: 14 }}>No transactions recorded yet</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8f9fa' }}>
                  {['Date', 'Type', 'Details', 'Amount'].map((h, i) => (
                    <th key={h} style={{ padding: '11px 16px', textAlign: i === 3 ? 'right' : 'left', fontSize: 11, color: '#666', fontWeight: 700, borderBottom: '2px solid #eee' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ...accountTransfers.map(t => ({
                    date: t.transfer_date, type: 'transfer',
                    details: `${ACCOUNTS.find(a => a.key === t.from_account)?.icon || ''} ${t.from_account} → ${ACCOUNTS.find(a => a.key === t.to_account)?.icon || ''} ${t.to_account}${t.notes ? ` — ${t.notes}` : ''}`,
                    amount: Number(t.amount), color: '#0f4c81', badge: '🔄 Transfer'
                  })),
                  ...ownerTransactions.map(t => ({
                    date: t.transaction_date, type: t.transaction_type,
                    details: `${ACCOUNTS.find(a => a.key === t.account)?.icon || ''} ${t.account}${t.notes ? ` — ${t.notes}` : ''}`,
                    amount: Number(t.amount), color: t.transaction_type === 'injection' ? '#1a7a4a' : '#c62828',
                    badge: t.transaction_type === 'injection' ? '💰 Injection' : '💸 Drawing'
                  }))
                ].sort((a, b) => new Date(b.date) - new Date(a.date)).map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f0f0f0', background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#555', whiteSpace: 'nowrap' }}>
                      {new Date(item.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: item.type === 'transfer' ? '#e3f0ff' : item.type === 'injection' ? '#e8f5e9' : '#ffebee', color: item.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                        {item.badge}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#333' }}>{item.details}</td>
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 800, color: item.color, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      Rs. {fmt(item.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
