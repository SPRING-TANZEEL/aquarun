import { useState } from 'react'
import RiderDeliveries from './RiderDeliveries'
import RiderSellToCustomer from './RiderSellToCustomer'
import RiderReceivables from './RiderReceivables'
import RiderExpense from './RiderExpense'
import RiderCashSummary from './RiderCashSummary'
import RiderCashTransfer from './RiderCashTransfer'
import RiderSalary from './RiderSalary'
import RiderAdvanceApproval from './RiderAdvanceApproval'
import OfficeExpenses from './OfficeExpenses'

export default function RiderDashboard({ user, onLogout }) {
  const [activePage, setActivePage] = useState('deliveries')
  const [preSelectedCustomer, setPreSelectedCustomer] = useState(null)

  const mainMenu = [
    { key: 'deliveries', icon: '📦', urdu: 'ڈیلیوری' },
    { key: 'sell', icon: '👤', urdu: 'کسٹمر' },
    { key: 'receivables', icon: '💰', urdu: 'باقی' },
    { key: 'cash', icon: '💵', urdu: 'کیش' },
    { key: 'more', icon: '☰', urdu: 'مزید' },
  ]

  const moreItems = [
    { key: 'expense', icon: '💸', label: 'Log Expense', desc: 'Fuel, repair, refreshment' },
    { key: 'transfer', icon: '🔄', label: 'Cash Transfer', desc: 'Return cash to Main Rider or Office' },
    { key: 'salary', icon: '💼', label: 'My Salary', desc: 'View advances and remaining salary' },
    ...(user.is_main_rider ? [
      { key: 'advances', icon: '📋', label: 'Advance Requests', desc: 'Approve or reject advance requests' },
      { key: 'fieldexpenses', icon: '🏢', label: 'Field Expenses', desc: 'Log expenses paid from your cash' },
    ] : []),
  ]

  function handleSelectCustomer(customer) {
    setPreSelectedCustomer(customer)
    setActivePage('sell')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f6fa', fontFamily: 'sans-serif' }}>

      {/* Header */}
      <div style={{
        background: '#1a7a4a', color: 'white',
        padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '24px' }}>💧</span>
          <div>
            <div style={{ fontWeight: '700', fontSize: '16px' }}>
              AquaRun {user.is_main_rider ? '⭐' : ''}
            </div>
            <div style={{ fontSize: '12px', opacity: 0.8 }}>
              🚴 {user.full_name} {user.is_main_rider ? '— Main Rider' : ''}
            </div>
          </div>
        </div>
        <button onClick={onLogout}
          style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
          لاگ آؤٹ
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '16px', paddingBottom: '90px' }}>
        {activePage === 'deliveries' && <RiderDeliveries rider={user} />}
        {activePage === 'sell' && (
          <RiderSellToCustomer
            rider={user}
            preSelectedCustomer={preSelectedCustomer}
            onClearPreSelected={() => setPreSelectedCustomer(null)}
          />
        )}
        {activePage === 'receivables' && (
          <RiderReceivables rider={user} onSelectCustomer={handleSelectCustomer} />
        )}
        {activePage === 'cash' && <RiderCashSummary rider={user} />}
        {activePage === 'expense' && <RiderExpense rider={user} />}
        {activePage === 'transfer' && <RiderCashTransfer rider={user} />}
        {activePage === 'salary' && <RiderSalary rider={user} />}
        {activePage === 'advances' && <RiderAdvanceApproval rider={user} />}
        {activePage === 'fieldexpenses' && <OfficeExpenses rider={user} isCEO={false} />}

        {activePage === 'more' && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>☰ More Options</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {moreItems.map(item => (
                <button key={item.key} onClick={() => setActivePage(item.key)}
                  style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                  <span style={{ fontSize: '28px' }}>{item.icon}</span>
                  <div>
                    <p style={{ fontSize: '15px', fontWeight: '700', color: '#333', margin: '0 0 2px' }}>{item.label}</p>
                    <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>{item.desc}</p>
                  </div>
                  <span style={{ marginLeft: 'auto', color: '#ccc', fontSize: '18px' }}>›</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #eee', display: 'flex', zIndex: 100 }}>
        {mainMenu.map(m => (
          <button key={m.key} onClick={() => {
            if (m.key !== 'sell') setPreSelectedCustomer(null)
            setActivePage(m.key)
          }}
            style={{
              flex: 1, padding: '8px 2px', border: 'none',
              background: activePage === m.key || (m.key === 'more' && ['expense', 'transfer', 'salary', 'advances', 'fieldexpenses'].includes(activePage)) ? '#e8f5e9' : 'white',
              color: activePage === m.key || (m.key === 'more' && ['expense', 'transfer', 'salary', 'advances', 'fieldexpenses'].includes(activePage)) ? '#1a7a4a' : '#888',
              cursor: 'pointer', fontSize: '10px',
              fontWeight: activePage === m.key ? '700' : '400',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
              borderTop: activePage === m.key || (m.key === 'more' && ['expense', 'transfer', 'salary', 'advances', 'fieldexpenses'].includes(activePage)) ? '3px solid #1a7a4a' : '3px solid transparent'
            }}>
            <span style={{ fontSize: '18px' }}>{m.icon}</span>
            <span>{m.urdu}</span>
          </button>
        ))}
      </div>
    </div>
  )
}