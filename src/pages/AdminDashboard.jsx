import SetupWizard from '../components/SetupWizard'
import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import CustomerManagement from './CustomerManagement'
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
    const day = today.getDay()
    const weekStart = new Date(today - day * 86400000)
    const prevWeekStart = new Date(weekStart - 7 * 86400000)
    const prevWeekEnd = new Date(weekStart - 86400000)
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
  if (period === 'lastmonth') {
    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
    const prev2MonthStart = new Date(today.getFullYear(), today.getMonth() - 2, 1)
    const prev2MonthEnd = new Date(today.getFullYear(), today.getMonth() - 1, 0)
    return {
      from: prevMonthStart.toISOString().split('T')[0],
      to: prevMonthEnd.toISOString().split('T')[0],
      prevFrom: prev2MonthStart.toISOString().split('T')[0],
      prevTo: prev2MonthEnd.toISOString().split('T')[0],
      label: 'Last Month', prevLabel: '2 Months Ago'
    }
  }
}

export default function AdminDashboard({ user, tenantId, onLogout }) {
  const [activePage, setActivePage] = useState('dashboard')
  const [period, setPeriod] = useState('today')
  const [stats, setStats] = useState(null)
  const [prevStats, setPrevStats] = useState(null)
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState({
    pendingOrders: 0, pendingCashTransfers: 0,
    pendingJazz: 0, pendingSalaryRequests: 0,
    totalReceivable: 0, totalCustomers: 0
  })
  const [businessName, setBusinessName] = useState('AquaRun')
  const [showSetupWizard, setShowSetupWizard] = useState(false)
  const [businessLogo, setBusinessLogo] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  const adminUser = user

  useEffect(() => {
    if (tenantId) fetchBusiness()
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [tenantId])

  useEffect(() => { if (tenantId) fetchDashboard() }, [period, tenantId])

  async function fetchBusiness() {
    const { data } = await supabase.from('business_settings')
      .select('*')
      .eq('tenant_id', tenantId)
    const map = {}
    data?.forEach(s => { map[s.setting_key] = s.setting_value })
    if (map.business_name) setBusinessName(map.business_name)
    if (map.business_logo) setBusinessLogo(map.business_logo)
    if (map.setup_completed !== 'true') setShowSetupWizard(true)
  }

  async function fetchPeriodStats(from, to, tenantId) {
    const { data: deliveries } = await supabase.from('deliveries')
      .select('total_amount, amount_received, payment_method, qty_19l, qty_half_litre, qty_1_5l')
      .eq('tenant_id', tenantId)
      .gte('delivered_at', from + 'T00:00:00')
      .lte('delivered_at', to + 'T23:59:59')
      .eq('is_voided', false)

    const { data: payments } = await supabase.from('payments')
      .select('amount, payment_method, jazzcash_confirmed')
      .eq('tenant_id', tenantId)
      .gte('payment_date', from).lte('payment_date', to)
      .eq('is_voided', false)

    let totalSales = 0, cashCollected = 0, jazzSales = 0, creditSales = 0
    let bottles19l = 0, bottlesHalf = 0, bottles15l = 0, deliveryCount = 0

    deliveries?.forEach(d => {
      totalSales += Number(d.total_amount)
      deliveryCount++
      bottles19l += Number(d.qty_19l || 0)
      bottlesHalf += Number(d.qty_half_litre || 0)
      bottles15l += Number(d.qty_1_5l || 0)
      if (d.payment_method === 'cash') cashCollected += Number(d.amount_received)
      if (d.payment_method === 'jazzcash') jazzSales += Number(d.total_amount)
      if (d.payment_method === 'credit') creditSales += Number(d.total_amount)
    })

    payments?.forEach(p => {
      if (p.payment_method === 'cash') cashCollected += Number(p.amount)
    })

    return { totalSales, cashCollected, jazzSales, creditSales, bottles19l, bottlesHalf, bottles15l, deliveryCount }
  }

  async function fetchDashboard() {
    setLoading(true)
    const dates = getPeriodDates(period)
    const [current, previous] = await Promise.all([
      fetchPeriodStats(dates.from, dates.to, tenantId),
      fetchPeriodStats(dates.prevFrom, dates.prevTo, tenantId)
    ])
    setStats(current)
    setPrevStats(previous)

    const { count: pendingOrders } = await supabase.from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')

    const { count: pendingCashTransfers } = await supabase.from('cash_transfers')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('to_office', true)
      .eq('status', 'pending')

    const { count: pendingSalaryRequests } = await supabase.from('salary_advances')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('requested_from', 'ceo')
      .eq('status', 'pending')

    const { data: jazzPending } = await supabase.from('deliveries')
      .select('total_amount')
      .eq('tenant_id', tenantId)
      .eq('payment_method', 'jazzcash')
      .eq('jazzcash_confirmed', false)
      .eq('is_voided', false)

    const { data: jazzPayPending } = await supabase.from('payments')
      .select('amount')
      .eq('tenant_id', tenantId)
      .eq('payment_method', 'jazzcash')
      .eq('jazzcash_confirmed', false)
      .eq('is_voided', false)

    const pendingJazz = (jazzPending?.reduce((s, d) => s + Number(d.total_amount), 0) || 0) +
      (jazzPayPending?.reduce((s, p) => s + Number(p.amount), 0) || 0)

    const { data: customers } = await supabase.from('customers')
      .select('balance')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)

    const totalReceivable = customers?.reduce((s, c) => s + Number(c.balance), 0) || 0
    const totalCustomers = customers?.length || 0

    setAlerts({ pendingOrders, pendingCashTransfers, pendingJazz, pendingSalaryRequests, totalReceivable, totalCustomers })

    const chart = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const dayLabel = d.toLocaleDateString('en-PK', { weekday: 'short', day: '2-digit' })
      const { data: dayDeliveries } = await supabase.from('deliveries')
        .select('total_amount')
        .eq('tenant_id', tenantId)
        .gte('delivered_at', dateStr + 'T00:00:00')
        .lte('delivered_at', dateStr + 'T23:59:59')
        .eq('is_voided', false)
      const dayTotal = dayDeliveries?.reduce((s, d) => s + Number(d.total_amount), 0) || 0
      chart.push({ label: dayLabel, value: dayTotal, date: dateStr })
    }
    setChartData(chart)
    setLoading(false)
  }

  function navigateTo(page) {
    setActivePage(page)
    if (isMobile) setSidebarOpen(false)
  }

  function pct(current, previous) {
    if (!previous || previous === 0) return current > 0 ? 100 : 0
    return Math.round(((current - previous) / previous) * 100)
  }

  const dates = getPeriodDates(period)

  function TrendBadge({ current, previous, inverse }) {
    const change = pct(current, previous)
    const isUp = change >= 0
    const isGood = inverse ? !isUp : isUp
    if (previous === 0 && current === 0) return null
    return (
      <span style={{
        fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '20px',
        background: isGood ? '#e8f5e9' : '#ffebee',
        color: isGood ? '#1a7a4a' : '#c62828'
      }}>
        {isUp ? '↑' : '↓'} {Math.abs(change)}% vs {getPeriodDates(period)?.prevLabel}
      </span>
    )
  }

  function MetricCard({ title, value, prefix, icon, current, previous, inverse, color, onClick, subtitle }) {
    return (
      <div onClick={onClick}
        style={{
          background: 'white', borderRadius: '14px', padding: '16px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
          borderTop: `4px solid ${color}`,
          cursor: onClick ? 'pointer' : 'default',
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <p style={{ fontSize: '11px', color: '#888', fontWeight: '600', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</p>
          <span style={{ fontSize: '20px' }}>{icon}</span>
        </div>
        <p style={{ fontSize: isMobile ? '20px' : '26px', fontWeight: '700', color: '#1a1a2e', margin: '0 0 4px' }}>
          {prefix && <span style={{ fontSize: '13px', color: '#888', fontWeight: '400' }}>{prefix} </span>}
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        {subtitle && <p style={{ fontSize: '10px', color: '#aaa', margin: '0 0 6px' }}>{subtitle}</p>}
        {previous !== undefined && (
          <TrendBadge current={current ?? value} previous={previous} inverse={inverse} />
        )}
      </div>
    )
  }

  function BarChart({ data }) {
    const maxVal = Math.max(...data.map(d => d.value), 1)
    const chartH = 120
    const barW = isMobile ? 28 : 36
    const gap = isMobile ? 8 : 14
    const totalW = data.length * (barW + gap) - gap
    const today = new Date().toISOString().split('T')[0]

    return (
      <svg width="100%" viewBox={`0 0 ${totalW + 40} ${chartH + 50}`} style={{ overflow: 'visible' }}>
        {[0, 0.5, 1].map((p, i) => (
          <g key={i}>
            <line x1="30" y1={chartH - p * chartH} x2={totalW + 40} y2={chartH - p * chartH} stroke="#f0f0f0" strokeWidth="1" />
            <text x="28" y={chartH - p * chartH + 4} textAnchor="end" fontSize="9" fill="#bbb">
              {p === 0 ? '0' : Math.round(maxVal * p / 1000) + 'k'}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = 30 + i * (barW + gap)
          const barH = maxVal > 0 ? (d.value / maxVal) * chartH : 0
          const isToday = d.date === today
          return (
            <g key={i}>
              <rect x={x} y={0} width={barW} height={chartH} rx="4" fill="#f8f9fa" />
              <rect x={x} y={chartH - barH} width={barW} height={barH} rx="4" fill={isToday ? '#0f4c81' : '#93c5fd'} />
              {d.value > 0 && (
                <text x={x + barW / 2} y={chartH - barH - 4} textAnchor="middle" fontSize="8" fill={isToday ? '#0f4c81' : '#888'} fontWeight={isToday ? '700' : '400'}>
                  {d.value >= 1000 ? (d.value / 1000).toFixed(1) + 'k' : d.value}
                </text>
              )}
              <text x={x + barW / 2} y={chartH + 14} textAnchor="middle" fontSize="8" fill={isToday ? '#0f4c81' : '#888'} fontWeight={isToday ? '700' : '400'}>
                {d.label.split(' ')[0]}
              </text>
              <text x={x + barW / 2} y={chartH + 26} textAnchor="middle" fontSize="8" fill={isToday ? '#0f4c81' : '#aaa'}>
                {d.label.split(' ')[1]}
              </text>
            </g>
          )
        })}
      </svg>
    )
  }

  function DonutChart({ cash, jazz, credit }) {
    const total = cash + jazz + credit || 1
    const cx = 70, cy = 70, r = 55, stroke = 20
    const circ = 2 * Math.PI * r
    const cashPct = cash / total
    const jazzPct = jazz / total
    const creditPct = credit / total
    const cashDash = cashPct * circ
    const jazzDash = jazzPct * circ
    const creditDash = creditPct * circ
    const cashOffset = 0
    const jazzOffset = -cashDash
    const creditOffset = -(cashDash + jazzDash)

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0f0f0" strokeWidth={stroke} />
          {cash > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a7a4a" strokeWidth={stroke} strokeDasharray={`${cashDash} ${circ}`} strokeDashoffset={cashOffset} transform={`rotate(-90 ${cx} ${cy})`} />}
          {jazz > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="#9c27b0" strokeWidth={stroke} strokeDasharray={`${jazzDash} ${circ}`} strokeDashoffset={jazzOffset} transform={`rotate(-90 ${cx} ${cy})`} />}
          {credit > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ef4444" strokeWidth={stroke} strokeDasharray={`${creditDash} ${circ}`} strokeDashoffset={creditOffset} transform={`rotate(-90 ${cx} ${cy})`} />}
          <text x={cx} y={cy - 6} textAnchor="middle" fontSize="11" fill="#888">Total</text>
          <text x={cx} y={cy + 10} textAnchor="middle" fontSize="13" fontWeight="700" fill="#1a1a2e">
            {total >= 1000 ? (total / 1000).toFixed(1) + 'k' : total.toLocaleString()}
          </text>
        </svg>
        <div style={{ fontSize: '12px' }}>
          {[
            { label: '💵 Cash', value: cash, color: '#1a7a4a' },
            { label: '📱 Jazz', value: jazz, color: '#9c27b0' },
            { label: '📋 Credit', value: credit, color: '#ef4444' },
          ].map(item => (
            <div key={item.label} style={{ marginBottom: '8px' }}>
              <p style={{ margin: '0 0 2px', color: '#888', fontSize: '11px' }}>{item.label}</p>
              <p style={{ margin: 0, fontWeight: '700', color: item.color, fontSize: '13px' }}>
                Rs. {item.value.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'Inter', sans-serif", background: '#f5f7fa' }}>

      {/* Mobile Overlay */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99 }} />
      )}

      {/* Sidebar */}
      <div style={{
        width: '220px', background: '#0f4c81', color: 'white',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        boxShadow: '4px 0 20px rgba(0,0,0,0.15)',
        position: isMobile ? 'fixed' : 'relative',
        top: 0, left: 0, bottom: 0, zIndex: 100,
        transform: isMobile ? (sidebarOpen ? 'translateX(0)' : 'translateX(-100%)') : 'none',
        transition: 'transform 0.3s ease'
      }}>
        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {businessLogo ? (
              <img src={businessLogo} alt="logo" style={{ width: '40px', height: '40px', borderRadius: '10px', objectFit: 'contain', background: 'white', padding: '3px' }} />
            ) : (
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>💧</div>
            )}
            <div>
              <div style={{ fontWeight: '700', fontSize: '14px', lineHeight: 1.2 }}>{businessName}</div>
              <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '2px' }}>Admin Portal</div>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '10px 0', overflowY: 'auto' }}>
          {menuItems.map(item => (
            <button key={item.key} onClick={() => navigateTo(item.key)}
              style={{
                width: '100%', padding: '11px 20px', border: 'none', textAlign: 'left',
                background: activePage === item.key ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: 'white', cursor: 'pointer', fontSize: '13px',
                borderLeft: activePage === item.key ? '3px solid #60a5fa' : '3px solid transparent',
                display: 'flex', alignItems: 'center', gap: '10px',
              }}>
              <span style={{ fontSize: '15px' }}>{item.icon}</span>
              <span style={{ flex: 1, fontWeight: activePage === item.key ? '600' : '400' }}>{item.label}</span>
              {item.key === 'jazzcash' && alerts.pendingJazz > 0 && (
                <span style={{ background: '#ef4444', color: 'white', fontSize: '9px', padding: '2px 5px', borderRadius: '10px', fontWeight: '700' }}>!</span>
              )}
              {item.key === 'cashtransfer' && alerts.pendingCashTransfers > 0 && (
                <span style={{ background: '#ef4444', color: 'white', fontSize: '9px', padding: '2px 5px', borderRadius: '10px', fontWeight: '700' }}>{alerts.pendingCashTransfers}</span>
              )}
              {item.key === 'salary' && alerts.pendingSalaryRequests > 0 && (
                <span style={{ background: '#ef4444', color: 'white', fontSize: '9px', padding: '2px 5px', borderRadius: '10px', fontWeight: '700' }}>{alerts.pendingSalaryRequests}</span>
              )}
              {item.key === 'orders' && alerts.pendingOrders > 0 && (
                <span style={{ background: '#f59e0b', color: 'white', fontSize: '9px', padding: '2px 5px', borderRadius: '10px', fontWeight: '700' }}>{alerts.pendingOrders}</span>
              )}
            </button>
          ))}
        </nav>

        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>👨‍💼</div>
            <div>
              <p style={{ fontSize: '12px', fontWeight: '600', margin: 0 }}>{user.full_name}</p>
              <p style={{ fontSize: '10px', opacity: 0.6, margin: 0 }}>Administrator</p>
            </div>
          </div>
          <button onClick={onLogout}
            style={{ width: '100%', padding: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>
            Logout / لاگ آؤٹ
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>

        {/* Top Bar */}
        <div style={{ background: 'white', padding: '12px 16px', borderBottom: '1px solid #e8eaed', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', position: 'sticky', top: 0, zIndex: 50 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isMobile && (
              <button onClick={() => setSidebarOpen(!sidebarOpen)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', padding: '4px', color: '#0f4c81' }}>
                ☰
              </button>
            )}
            <div>
              <h1 style={{ fontSize: isMobile ? '15px' : '18px', fontWeight: '700', color: '#1a1a2e', margin: 0 }}>
                {menuItems.find(m => m.key === activePage)?.icon} {menuItems.find(m => m.key === activePage)?.label}
              </h1>
              {activePage === 'dashboard' && !isMobile && (
                <p style={{ fontSize: '12px', color: '#888', margin: '2px 0 0' }}>
                  {new Date().toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {alerts.pendingCashTransfers > 0 && (
              <button onClick={() => navigateTo('cashtransfer')}
                style={{ padding: '4px 10px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '20px', cursor: 'pointer', fontSize: '11px', color: '#ea580c', fontWeight: '600' }}>
                💸 {alerts.pendingCashTransfers}
              </button>
            )}
            {alerts.pendingJazz > 0 && (
              <button onClick={() => navigateTo('jazzcash')}
                style={{ padding: '4px 10px', background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: '20px', cursor: 'pointer', fontSize: '11px', color: '#9333ea', fontWeight: '600' }}>
                📱 {isMobile ? '!' : 'Rs. ' + alerts.pendingJazz.toLocaleString()}
              </button>
            )}
            {alerts.pendingSalaryRequests > 0 && (
              <button onClick={() => navigateTo('salary')}
                style={{ padding: '4px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '20px', cursor: 'pointer', fontSize: '11px', color: '#16a34a', fontWeight: '600' }}>
                💼 {alerts.pendingSalaryRequests}
              </button>
            )}
          </div>
        </div>

        <div style={{ padding: isMobile ? '12px' : '24px 28px' }}>

          {showSetupWizard && (
            <SetupWizard tenantId={tenantId} onComplete={() => { setShowSetupWizard(false); fetchBusiness() }} />
          )}

          {/* EXECUTIVE DASHBOARD */}
          {activePage === 'dashboard' && (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <h2 style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#1a1a2e', margin: '0 0 4px' }}>Executive Summary</h2>
                <p style={{ fontSize: '12px', color: '#888', margin: '0 0 12px' }}>Comparing {dates?.label} vs {dates?.prevLabel}</p>
                <div style={{ display: 'flex', gap: '6px', background: 'white', padding: '5px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flexWrap: 'wrap' }}>
                  {[
                    { key: 'today', label: 'Today' },
                    { key: 'week', label: isMobile ? 'Week' : 'This Week' },
                    { key: 'month', label: isMobile ? 'Month' : 'This Month' },
                    { key: 'lastmonth', label: isMobile ? 'Last' : 'Last Month' },
                  ].map(p => (
                    <button key={p.key} onClick={() => setPeriod(p.key)}
                      style={{
                        flex: 1, padding: '7px 8px', border: 'none', borderRadius: '7px', cursor: 'pointer',
                        background: period === p.key ? '#0f4c81' : 'transparent',
                        color: period === p.key ? 'white' : '#555',
                        fontWeight: period === p.key ? '700' : '400',
                        fontSize: isMobile ? '11px' : '13px',
                      }}>{p.label}</button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#888' }}>
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
                  <p>Loading dashboard...</p>
                </div>
              ) : (
                <div>
                  {/* Revenue Banner */}
                  <div style={{
                    background: 'linear-gradient(135deg, #0f4c81 0%, #1a7a4a 100%)',
                    borderRadius: '14px', padding: isMobile ? '16px' : '22px 28px', color: 'white',
                    marginBottom: '14px', boxShadow: '0 4px 20px rgba(15, 76, 129, 0.3)'
                  }}>
                    <p style={{ fontSize: '11px', opacity: 0.7, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Total Revenue — {dates?.label}
                    </p>
                    <p style={{ fontSize: isMobile ? '32px' : '42px', fontWeight: '700', margin: '0 0 6px', letterSpacing: '-1px' }}>
                      Rs. {(stats?.totalSales || 0).toLocaleString()}
                    </p>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      <span style={{ fontSize: '12px', opacity: 0.7 }}>📦 {stats?.deliveryCount || 0} deliveries</span>
                      <span style={{ fontSize: '12px', opacity: 0.7 }}>🍶 {(stats?.bottles19l || 0) + (stats?.bottlesHalf || 0) + (stats?.bottles15l || 0)} bottles</span>
                    </div>
                    <TrendBadge current={stats?.totalSales} previous={prevStats?.totalSales} />
                    <p style={{ fontSize: '11px', opacity: 0.6, margin: '4px 0 0' }}>
                      {dates?.prevLabel}: Rs. {(prevStats?.totalSales || 0).toLocaleString()}
                    </p>
                  </div>

                  {/* Metric Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '10px', marginBottom: '12px' }}>
                    <MetricCard title="Cash Collected" value={stats?.cashCollected} prefix="Rs." icon="💵"
                      current={stats?.cashCollected} previous={prevStats?.cashCollected} color="#1a7a4a" />
                    <MetricCard title="JazzCash" value={stats?.jazzSales} prefix="Rs." icon="📱"
                      current={stats?.jazzSales} previous={prevStats?.jazzSales} color="#9c27b0" />
                    <MetricCard title="Credit Sales" value={stats?.creditSales} prefix="Rs." icon="📋"
                      current={stats?.creditSales} previous={prevStats?.creditSales} color="#ef4444" inverse />
                    <MetricCard title="Receivable" value={alerts?.totalReceivable} prefix="Rs." icon="💰"
                      current={alerts?.totalReceivable} previous={alerts?.totalReceivable} color="#f59e0b"
                      onClick={() => navigateTo('reports')} />
                  </div>

                  {/* Operations Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
                    <MetricCard title="Pending Orders" value={alerts?.pendingOrders} icon="⏳"
                      color="#f59e0b" onClick={() => navigateTo('orders')} />
                    <MetricCard title="19L Sold" value={stats?.bottles19l} icon="🍶"
                      current={stats?.bottles19l} previous={prevStats?.bottles19l} color="#0f4c81"
                      subtitle={`Half: ${stats?.bottlesHalf || 0} · 1.5L: ${stats?.bottles15l || 0}`} />
                    <MetricCard title="Customers" value={alerts?.totalCustomers} icon="👥"
                      color="#1a7a4a" onClick={() => navigateTo('customers')} />
                    <MetricCard title="Cash Transfers" value={alerts?.pendingCashTransfers} icon="💸"
                      color="#ea580c" onClick={() => navigateTo('cashtransfer')} />
                  </div>

                  {/* Charts */}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: '12px', marginBottom: '14px' }}>
                    <div style={{ background: 'white', borderRadius: '14px', padding: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
                      <h3 style={{ fontSize: '13px', fontWeight: '700', color: '#1a1a2e', margin: '0 0 4px' }}>Daily Sales — Last 7 Days</h3>
                      <p style={{ fontSize: '11px', color: '#888', margin: '0 0 12px' }}>Dark bar = today</p>
                      <BarChart data={chartData} />
                    </div>
                    <div style={{ background: 'white', borderRadius: '14px', padding: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
                      <h3 style={{ fontSize: '13px', fontWeight: '700', color: '#1a1a2e', margin: '0 0 4px' }}>Payment Methods</h3>
                      <p style={{ fontSize: '11px', color: '#888', margin: '0 0 12px' }}>{dates?.label}</p>
                      <DonutChart
                        cash={stats?.cashCollected || 0}
                        jazz={stats?.jazzSales || 0}
                        credit={stats?.creditSales || 0}
                      />
                    </div>
                  </div>

                  {/* Action Alerts */}
                  {(alerts.pendingOrders > 0 || alerts.pendingCashTransfers > 0 || alerts.pendingJazz > 0 || alerts.pendingSalaryRequests > 0) && (
                    <div style={{ background: 'white', borderRadius: '14px', padding: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
                      <h3 style={{ fontSize: '13px', fontWeight: '700', color: '#1a1a2e', margin: '0 0 12px' }}>⚠️ Action Required</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '10px' }}>
                        {alerts.pendingOrders > 0 && (
                          <div onClick={() => navigateTo('orders')}
                            style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '12px', cursor: 'pointer' }}>
                            <p style={{ fontSize: '20px', margin: '0 0 4px' }}>📦</p>
                            <p style={{ fontSize: '15px', fontWeight: '700', color: '#ea580c', margin: '0 0 2px' }}>{alerts.pendingOrders}</p>
                            <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Pending Orders</p>
                          </div>
                        )}
                        {alerts.pendingCashTransfers > 0 && (
                          <div onClick={() => navigateTo('cashtransfer')}
                            style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '12px', cursor: 'pointer' }}>
                            <p style={{ fontSize: '20px', margin: '0 0 4px' }}>💸</p>
                            <p style={{ fontSize: '15px', fontWeight: '700', color: '#ea580c', margin: '0 0 2px' }}>{alerts.pendingCashTransfers}</p>
                            <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Cash Transfers</p>
                          </div>
                        )}
                        {alerts.pendingJazz > 0 && (
                          <div onClick={() => navigateTo('jazzcash')}
                            style={{ background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: '10px', padding: '12px', cursor: 'pointer' }}>
                            <p style={{ fontSize: '20px', margin: '0 0 4px' }}>📱</p>
                            <p style={{ fontSize: '13px', fontWeight: '700', color: '#9333ea', margin: '0 0 2px' }}>Rs. {alerts.pendingJazz.toLocaleString()}</p>
                            <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>JazzCash Pending</p>
                          </div>
                        )}
                        {alerts.pendingSalaryRequests > 0 && (
                          <div onClick={() => navigateTo('salary')}
                            style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px', cursor: 'pointer' }}>
                            <p style={{ fontSize: '20px', margin: '0 0 4px' }}>💼</p>
                            <p style={{ fontSize: '15px', fontWeight: '700', color: '#16a34a', margin: '0 0 2px' }}>{alerts.pendingSalaryRequests}</p>
                            <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Salary Requests</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activePage === 'customers' && <CustomerManagement tenantId={tenantId} />}
          {activePage === 'orders' && <Orders tenantId={tenantId} />}
          {activePage === 'riders' && <RiderManagement tenantId={tenantId} />}
          {activePage === 'cashtransfer' && <CashTransferManagement tenantId={tenantId} onUpdate={fetchDashboard} />}
          {activePage === 'jazzcash' && <JazzCashReconciliation tenantId={tenantId} onUpdate={fetchDashboard} />}
          {activePage === 'salary' && <SalaryManagement tenantId={tenantId} adminUser={adminUser} onUpdate={fetchDashboard} />}
          {activePage === 'cashposition' && <CEOCashPosition tenantId={tenantId} />}
          {activePage === 'inventory' && <Inventory tenantId={tenantId} />}
          {activePage === 'reports' && <Reports tenantId={tenantId} />}
          {activePage === 'transactions' && <Transactions tenantId={tenantId} />}
          {activePage === 'accounts' && <Accounts tenantId={tenantId} />}
          {activePage === 'settings' && <BusinessSettings tenantId={tenantId} />}
        </div>
      </div>
    </div>
  )
}