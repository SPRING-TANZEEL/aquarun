import SetupWizard from '../components/SetupWizard'
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import CustomerManagement from './CustomerManagement'
import AdminQuickSale from './AdminQuickSale'
import Orders from './Orders'
import RiderManagement from './RiderManagement'
import JazzCashReconciliation from './JazzCashReconciliation'
import CashTransferManagement from './CashTransferManagement'
import SalaryManagement from './SalaryManagement'
import CEOCashPosition from './CEOCashPosition'
import BusinessSettings from './BusinessSettings'
import Inventory from './Inventory'
import Reports from './Reports'
import Transactions from './Transactions'
import Accounts from './Accounts'

const menuItems = [
  { key: 'dashboard', icon: '📊', label: 'Dashboard' },
  { key: 'customers', icon: '👥', label: 'Customers' },
  { key: 'quicksale', icon: '⚡', label: 'Quick Sale & Payment' },
  { key: 'orders', icon: '📦', label: 'Orders' },
  { key: 'riders', icon: '🚴', label: 'Riders' },
  { key: 'cashtransfer', icon: '💸', label: 'Cash Transfers' },
  { key: 'jazzcash', icon: '📱', label: 'JazzCash' },
  { key: 'salary', icon: '💼', label: 'Salary & Expenses' },
  { key: 'cashposition', icon: '🏦', label: 'CEO Cash Position' },
  { key: 'inventory', icon: '🏭', label: 'Inventory' },
  { key: 'reports', icon: '📈', label: 'Reports' },
  { key: 'accounts', label: 'Accounts', icon: '📊' },
  { key: 'transactions', icon: '🗂️', label: 'Transactions' },
  { key: 'settings', icon: '⚙️', label: 'Settings' },
]

function getPeriodDates(period) {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  if (period === 'today') {
    return {
      from: todayStr, to: todayStr,
      prevFrom: new Date(today - 86400000).toISOString().split('T')[0],
      prevTo: new Date(today - 86400000).toISOString().split('T')[0],
      label: 'Today', prevLabel: 'Yesterday'
    }
  }
  if (period === 'week') {
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - today.getDay())
    const prevWeekStart = new Date(weekStart)
    prevWeekStart.setDate(weekStart.getDate() - 7)
    const prevWeekEnd = new Date(weekStart)
    prevWeekEnd.setDate(weekStart.getDate() - 1)
    return {
      from: weekStart.toISOString().split('T')[0], to: todayStr,
      prevFrom: prevWeekStart.toISOString().split('T')[0],
      prevTo: prevWeekEnd.toISOString().split('T')[0],
      label: 'This Week', prevLabel: 'Last Week'
    }
  }
  if (period === 'month') {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
    return {
      from: monthStart.toISOString().split('T')[0], to: todayStr,
      prevFrom: prevMonthStart.toISOString().split('T')[0],
      prevTo: prevMonthEnd.toISOString().split('T')[0],
      label: 'This Month', prevLabel: 'Last Month'
    }
  }
  return { from: todayStr, to: todayStr, prevFrom: todayStr, prevTo: todayStr, label: 'Today', prevLabel: 'Yesterday' }
}

export default function AdminDashboard({ tenant, user, adminUser, onLogout }) {
  const [activePage, setActivePage] = useState('dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [setupCompleted, setSetupCompleted] = useState(true)
  const [setupLoading, setSetupLoading] = useState(true)
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0)
  const [pendingAdvancesCount, setPendingAdvancesCount] = useState(0)

  const tenantId = tenant?.id
  // Support both adminUser and user props safely
  const effectiveUser = adminUser || user || { full_name: tenant?.business_name || 'Admin', role: 'admin' }

  useEffect(() => {
    if (tenantId) {
      checkSetupStatus()
      fetchPendingCounts()
    }
  }, [tenantId])

  async function checkSetupStatus() {
    setSetupLoading(true)
    const { data } = await supabase.from('business_settings')
      .select('setting_value').eq('tenant_id', tenantId).eq('setting_key', 'setup_completed').single()
    setSetupCompleted(data?.setting_value === 'true')
    setSetupLoading(false)
  }

  async function fetchPendingCounts() {
    const { count: orderCount } = await supabase.from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'pending')
    setPendingOrdersCount(orderCount || 0)

    const { count: advanceCount } = await supabase.from('salary_advances')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'pending').eq('requested_from', 'ceo')
    setPendingAdvancesCount(advanceCount || 0)
  }

  if (setupLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '32px', marginBottom: '8px' }}>💧</p>
        <p style={{ color: '#0f4c81', fontWeight: '600' }}>Loading...</p>
      </div>
    </div>
  )

  if (!setupCompleted) return (
    <SetupWizard tenantId={tenantId} tenant={tenant} onComplete={() => setSetupCompleted(true)} />
  )

  function renderPage() {
    switch (activePage) {
      case 'customers':    return <CustomerManagement tenantId={tenantId} />
      case 'quicksale':    return <AdminQuickSale tenantId={tenantId} adminUser={effectiveUser} />
      case 'orders':       return <Orders tenantId={tenantId} onOrderUpdate={fetchPendingCounts} />
      case 'riders':       return <RiderManagement tenantId={tenantId} />
      case 'cashtransfer': return <CashTransferManagement tenantId={tenantId} adminUser={effectiveUser} />
      case 'jazzcash':     return <JazzCashReconciliation tenantId={tenantId} />
      case 'salary':       return <SalaryManagement tenantId={tenantId} adminUser={effectiveUser} />
      case 'cashposition': return <CEOCashPosition tenantId={tenantId} />
      case 'inventory':    return <Inventory tenantId={tenantId} />
      case 'reports':      return <Reports tenantId={tenantId} />
      case 'accounts':     return <Accounts tenantId={tenantId} />
      case 'transactions': return <Transactions tenantId={tenantId} />
      case 'settings':     return <BusinessSettings tenantId={tenantId} tenant={tenant} onSetupComplete={() => setSetupCompleted(true)} />
      default:             return <DashboardHome tenantId={tenantId} tenant={tenant} setActivePage={setActivePage} effectiveUser={effectiveUser} pendingOrdersCount={pendingOrdersCount} pendingAdvancesCount={pendingAdvancesCount} onLogout={onLogout} fetchPendingCounts={fetchPendingCounts} />
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f0f2f5', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div onClick={() => setMobileMenuOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 998 }} />
      )}

      {/* Sidebar */}
      <div style={{
        position: 'fixed', top: 0, left: mobileMenuOpen ? 0 : '-260px', bottom: 0,
        width: '260px', background: 'linear-gradient(180deg, #0d1b2a 0%, #1a3a5c 100%)',
        zIndex: 999, transition: 'left 0.3s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto'
      }}>
        {/* Sidebar Header */}
        <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #0f4c81, #1a7a4a)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>💧</div>
            <div>
              <p style={{ fontSize: '16px', fontWeight: '800', color: 'white', margin: 0 }}>AquaRun</p>
              <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>v2.0 Management</p>
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '10px', padding: '10px 12px' }}>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', margin: '0 0 2px' }}>Signed in as</p>
            <p style={{ fontSize: '14px', fontWeight: '700', color: 'white', margin: '0 0 2px' }}>{effectiveUser?.full_name || 'Admin'}</p>
            <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>{tenant?.business_name} · {tenant?.tenant_code}</p>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px' }}>
          {menuItems.map(item => {
            const isActive = activePage === item.key
            const badge = item.key === 'orders' ? pendingOrdersCount : item.key === 'salary' ? pendingAdvancesCount : 0
            return (
              <button key={item.key}
                onClick={() => { setActivePage(item.key); setMobileMenuOpen(false) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px', border: 'none', borderRadius: '8px',
                  marginBottom: '2px', cursor: 'pointer', textAlign: 'left',
                  background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: isActive ? 'white' : 'rgba(255,255,255,0.55)',
                  fontWeight: isActive ? '700' : '400', fontSize: '13px',
                  borderLeft: isActive ? '3px solid #4db6ff' : '3px solid transparent',
                  transition: 'all 0.15s'
                }}>
                <span style={{ fontSize: '15px', width: '20px', textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {badge > 0 && (
                  <span style={{ background: '#f44336', color: 'white', borderRadius: '10px', padding: '1px 7px', fontSize: '10px', fontWeight: '800' }}>
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={onLogout}
            style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🚪 Logout
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Top Bar */}
        <div style={{ background: 'white', padding: '0 16px', height: '56px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', position: 'sticky', top: 0, zIndex: 100 }}>
          <button onClick={() => setMobileMenuOpen(true)}
            style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: '6px', color: '#333', borderRadius: '6px' }}>
            ☰
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '15px', fontWeight: '700', color: '#1a1a2e', margin: 0 }}>
              {menuItems.find(m => m.key === activePage)?.label || 'Dashboard'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {pendingOrdersCount > 0 && activePage !== 'orders' && (
              <button onClick={() => setActivePage('orders')}
                style={{ padding: '5px 10px', background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '20px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', color: '#e65100' }}>
                📦 {pendingOrdersCount}
              </button>
            )}
            {pendingAdvancesCount > 0 && activePage !== 'salary' && (
              <button onClick={() => setActivePage('salary')}
                style={{ padding: '5px 10px', background: '#ffebee', border: '1px solid #ffcdd2', borderRadius: '20px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', color: '#c62828' }}>
                💰 {pendingAdvancesCount}
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: '16px', maxWidth: '1200px', width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          {renderPage()}
        </div>
      </div>
    </div>
  )
}

// ─── DASHBOARD HOME ──────────────────────────────────────────────────
function DashboardHome({ tenantId, tenant, setActivePage, effectiveUser, pendingOrdersCount, pendingAdvancesCount, onLogout, fetchPendingCounts }) {
  const [period, setPeriod] = useState('today')
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recentDeliveries, setRecentDeliveries] = useState([])

  useEffect(() => { if (tenantId) fetchStats() }, [tenantId, period])

  async function fetchStats() {
    setLoading(true)
    const { from, to, prevFrom, prevTo, label, prevLabel } = getPeriodDates(period)

    const [curDel, prevDel, curPay, curExp, customers, riders, balances] = await Promise.all([
      supabase.from('deliveries').select('total_with_tax, total_amount, payment_method').eq('tenant_id', tenantId).eq('is_voided', false).gte('delivered_at', from + 'T00:00:00').lte('delivered_at', to + 'T23:59:59'),
      supabase.from('deliveries').select('total_with_tax, total_amount').eq('tenant_id', tenantId).eq('is_voided', false).gte('delivered_at', prevFrom + 'T00:00:00').lte('delivered_at', prevTo + 'T23:59:59'),
      supabase.from('payments').select('amount').eq('tenant_id', tenantId).eq('is_voided', false).gte('payment_date', from).lte('payment_date', to),
      supabase.from('office_expenses').select('amount').eq('tenant_id', tenantId).eq('is_voided', false).gte('expense_date', from).lte('expense_date', to),
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('is_active', true),
      supabase.from('riders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('is_active', true),
      supabase.from('customers').select('balance').eq('tenant_id', tenantId).eq('is_active', true),
    ])

    const revenue = curDel.data?.reduce((s, d) => s + Number(d.total_with_tax || d.total_amount || 0), 0) || 0
    const prevRevenue = prevDel.data?.reduce((s, d) => s + Number(d.total_with_tax || d.total_amount || 0), 0) || 0
    const cashRevenue = curDel.data?.filter(d => d.payment_method === 'cash').reduce((s, d) => s + Number(d.total_with_tax || d.total_amount || 0), 0) || 0
    const jazzRevenue = curDel.data?.filter(d => d.payment_method === 'jazzcash').reduce((s, d) => s + Number(d.total_with_tax || d.total_amount || 0), 0) || 0
    const creditRevenue = curDel.data?.filter(d => d.payment_method === 'credit').reduce((s, d) => s + Number(d.total_with_tax || d.total_amount || 0), 0) || 0
    const collections = curPay.data?.reduce((s, p) => s + Number(p.amount || 0), 0) || 0
    const expenses = curExp.data?.reduce((s, e) => s + Number(e.amount || 0), 0) || 0
    const totalOutstanding = balances.data?.reduce((s, c) => s + Number(c.balance || 0), 0) || 0
    const revenueGrowth = prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : 0

    setStats({ revenue, prevRevenue, revenueGrowth, deliveries: curDel.data?.length || 0, cashRevenue, jazzRevenue, creditRevenue, collections, expenses, totalOutstanding, customers: customers.count || 0, riders: riders.count || 0, label, prevLabel })

    const { data: recent } = await supabase.from('deliveries').select('*, customers(full_name, customer_code)').eq('tenant_id', tenantId).eq('is_voided', false).order('delivered_at', { ascending: false }).limit(5)
    setRecentDeliveries(recent || [])
    setLoading(false)
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#1a1a2e', margin: '0 0 4px' }}>
          {greeting}, {effectiveUser?.full_name?.split(' ')[0] || 'Admin'}! 👋
        </h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>
          {new Date().toLocaleDateString('en-PK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {tenant?.business_name}
        </p>
      </div>

      {/* Period Selector */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        {['today', 'week', 'month'].map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            style={{ padding: '6px 14px', border: 'none', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', background: period === p ? '#0f4c81' : '#f0f0f0', color: period === p ? 'white' : '#555', textTransform: 'capitalize' }}>
            {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : 'This Month'}
          </button>
        ))}
      </div>

      {/* Alerts */}
      {(pendingOrdersCount > 0 || pendingAdvancesCount > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: pendingOrdersCount > 0 && pendingAdvancesCount > 0 ? '1fr 1fr' : '1fr', gap: '10px', marginBottom: '16px' }}>
          {pendingOrdersCount > 0 && (
            <div onClick={() => setActivePage('orders')} style={{ background: '#fff3e0', border: '2px solid #ffcc80', borderRadius: '12px', padding: '12px 14px', cursor: 'pointer' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#e65100', margin: '0 0 2px' }}>📦 {pendingOrdersCount} Pending Orders</p>
              <p style={{ fontSize: '11px', color: '#f57c00', margin: 0 }}>Tap to assign riders</p>
            </div>
          )}
          {pendingAdvancesCount > 0 && (
            <div onClick={() => setActivePage('salary')} style={{ background: '#ffebee', border: '2px solid #ffcdd2', borderRadius: '12px', padding: '12px 14px', cursor: 'pointer' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#c62828', margin: '0 0 2px' }}>💰 {pendingAdvancesCount} Advance Requests</p>
              <p style={{ fontSize: '11px', color: '#e53935', margin: 0 }}>Tap to approve or reject</p>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ fontSize: '32px', marginBottom: '8px' }}>⏳</p>
          <p style={{ color: '#888', fontSize: '14px' }}>Loading dashboard...</p>
        </div>
      ) : stats && (
        <>
          {/* Revenue Card */}
          <div style={{ background: 'linear-gradient(135deg, #0f4c81, #1565c0)', borderRadius: '16px', padding: '20px', marginBottom: '16px', color: 'white' }}>
            <p style={{ fontSize: '12px', opacity: 0.7, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stats.label} Revenue</p>
            <p style={{ fontSize: '36px', fontWeight: '800', margin: '0 0 8px' }}>Rs. {stats.revenue.toLocaleString()}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '12px', background: stats.revenueGrowth >= 0 ? 'rgba(76,175,80,0.3)' : 'rgba(244,67,54,0.3)', padding: '2px 8px', borderRadius: '20px', fontWeight: '700' }}>
                {stats.revenueGrowth >= 0 ? '↑' : '↓'} {Math.abs(stats.revenueGrowth)}% vs {stats.prevLabel}
              </span>
              <span style={{ fontSize: '12px', opacity: 0.6 }}>{stats.deliveries} deliveries</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
              {[
                { label: '💵 Cash', value: stats.cashRevenue },
                { label: '📱 JazzCash', value: stats.jazzRevenue },
                { label: '📋 Credit', value: stats.creditRevenue },
              ].map(m => (
                <div key={m.label} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px 10px' }}>
                  <p style={{ fontSize: '10px', opacity: 0.7, margin: '0 0 3px' }}>{m.label}</p>
                  <p style={{ fontSize: '13px', fontWeight: '700', margin: 0 }}>Rs. {m.value.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
            {[
              { label: 'Collections', value: `Rs. ${stats.collections.toLocaleString()}`, icon: '💰', color: '#1a7a4a', bg: '#e8f5e9', page: 'transactions' },
              { label: 'Outstanding', value: `Rs. ${stats.totalOutstanding.toLocaleString()}`, icon: '⏳', color: '#e65100', bg: '#fff3e0', page: 'reports' },
              { label: 'Customers', value: stats.customers, icon: '👥', color: '#0f4c81', bg: '#e3f0ff', page: 'customers' },
              { label: 'Active Riders', value: stats.riders, icon: '🚴', color: '#9c27b0', bg: '#f3e5f5', page: 'riders' },
            ].map(card => (
              <div key={card.label} onClick={() => setActivePage(card.page)}
                style={{ background: 'white', borderRadius: '12px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: 'pointer', borderTop: `3px solid ${card.color}` }}>
                <p style={{ fontSize: '22px', margin: '0 0 6px' }}>{card.icon}</p>
                <p style={{ fontSize: '20px', fontWeight: '700', color: card.color, margin: '0 0 2px' }}>{card.value}</p>
                <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{card.label}</p>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', margin: '0 0 12px' }}>Quick Actions</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {[
                { label: '⚡ Quick Sale', page: 'quicksale', color: '#0f4c81' },
                { label: '📦 Orders', page: 'orders', color: '#e65100' },
                { label: '💰 Cash', page: 'cashposition', color: '#1a7a4a' },
                { label: '📈 Reports', page: 'reports', color: '#9c27b0' },
                { label: '🗂️ Ledger', page: 'transactions', color: '#0f4c81' },
                { label: '⚙️ Settings', page: 'settings', color: '#555' },
              ].map(a => (
                <button key={a.page} onClick={() => setActivePage(a.page)}
                  style={{ padding: '10px 6px', background: '#f8f9fa', border: `1.5px solid ${a.color}25`, borderRadius: '10px', cursor: 'pointer', fontSize: '12px', fontWeight: '700', color: a.color, textAlign: 'center' }}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recent Deliveries */}
          {recentDeliveries.length > 0 && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', margin: 0 }}>Recent Deliveries</p>
                <button onClick={() => setActivePage('transactions')} style={{ background: 'none', border: 'none', fontSize: '12px', color: '#0f4c81', cursor: 'pointer', fontWeight: '600' }}>View All →</button>
              </div>
              {recentDeliveries.map((d, i) => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < recentDeliveries.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 2px', color: '#333' }}>{d.customers?.full_name || 'Walk-in Customer'}</p>
                    <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>
                      {new Date(d.delivered_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                      {d.invoice_number && <span style={{ marginLeft: '6px', color: '#0f4c81' }}>· {d.invoice_number}</span>}
                      <span style={{ marginLeft: '6px', padding: '1px 6px', borderRadius: '10px', fontSize: '10px', background: d.payment_method === 'cash' ? '#e8f5e9' : d.payment_method === 'jazzcash' ? '#f3e5f5' : '#fff3e0', color: d.payment_method === 'cash' ? '#1a7a4a' : d.payment_method === 'jazzcash' ? '#9c27b0' : '#e65100' }}>
                        {d.payment_method}
                      </span>
                    </p>
                  </div>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>
                    Rs. {Number(d.total_with_tax || d.total_amount || 0).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
