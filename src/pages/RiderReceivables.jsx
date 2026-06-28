import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { getCustomersOffline } from '../offlineDB'

export default function RiderReceivables({ rider, onSelectCustomer, isOnline, dbReady }) {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [totalReceivable, setTotalReceivable] = useState(0)
  const [totalAdvance, setTotalAdvance] = useState(0)
  const [activeTab, setActiveTab] = useState('outstanding')

  useEffect(() => { if (dbReady || isOnline) fetchReceivables() }, [isOnline, dbReady])

  async function fetchReceivables() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    let customersData = []

    if (isOnline) {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('is_active', true)
        .neq('balance', 0)
        .order('full_name')
      customersData = data || []
    } else {
      const offline = await getCustomersOffline()
      customersData = offline.filter(c => c.is_active && Number(c.balance) !== 0)
    }

    // Get today's assigned orders for this rider
    let ordersCustomerIds = new Set()
    if (isOnline) {
      const { data: ordersData } = await supabase
        .from('orders')
        .select('customer_id')
        .eq('rider_id', rider.id)
        .eq('status', 'assigned')
        .lte('delivery_date', today)
      ordersCustomerIds = new Set(ordersData?.map(o => o.customer_id) || [])
    }

    const sorted = customersData.sort((a, b) => {
      const aHasOrder = ordersCustomerIds.has(a.id) ? 1 : 0
      const bHasOrder = ordersCustomerIds.has(b.id) ? 1 : 0
      if (bHasOrder !== aHasOrder) return bHasOrder - aHasOrder
      return Number(b.balance) - Number(a.balance)
    }).map(c => ({ ...c, hasActiveOrder: ordersCustomerIds.has(c.id) }))

    const totalRec = sorted.filter(c => Number(c.balance) > 0).reduce((s, c) => s + Number(c.balance), 0)
    const totalAdv = sorted.filter(c => Number(c.balance) < 0).reduce((s, c) => s + Math.abs(Number(c.balance)), 0)

    setCustomers(sorted)
    setTotalReceivable(totalRec)
    setTotalAdvance(totalAdv)
    setLoading(false)
  }

  const outstanding = customers.filter(c => Number(c.balance) > 0)
  const advances = customers.filter(c => Number(c.balance) < 0)

  const filtered = (activeTab === 'outstanding' ? outstanding : advances).filter(c =>
    !search ||
    c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.mobile?.includes(search) ||
    c.customer_code?.includes(search)
  )

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '4px' }}>💰 Customer Balances</h2>
      <p style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>Outstanding balances and advance credits</p>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        <div onClick={() => setActiveTab('outstanding')}
          style={{ background: activeTab === 'outstanding' ? 'linear-gradient(135deg, #c62828, #e65100)' : 'white', color: activeTab === 'outstanding' ? 'white' : '#333', borderRadius: '12px', padding: '14px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: activeTab === 'outstanding' ? 'none' : '2px solid #ffebee' }}>
          <p style={{ fontSize: '11px', opacity: 0.8, margin: '0 0 4px' }}>Outstanding (Owe You)</p>
          <p style={{ fontSize: '22px', fontWeight: '700', margin: '0 0 2px' }}>Rs. {totalReceivable.toLocaleString()}</p>
          <p style={{ fontSize: '11px', opacity: 0.7, margin: 0 }}>{outstanding.length} customers</p>
        </div>
        <div onClick={() => setActiveTab('advance')}
          style={{ background: activeTab === 'advance' ? 'linear-gradient(135deg, #0f4c81, #1a7a4a)' : 'white', color: activeTab === 'advance' ? 'white' : '#333', borderRadius: '12px', padding: '14px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: activeTab === 'advance' ? 'none' : '2px solid #e8f5e9' }}>
          <p style={{ fontSize: '11px', opacity: 0.8, margin: '0 0 4px' }}>Advance Credits (You Owe)</p>
          <p style={{ fontSize: '22px', fontWeight: '700', margin: '0 0 2px' }}>Rs. {totalAdvance.toLocaleString()}</p>
          <p style={{ fontSize: '11px', opacity: 0.7, margin: 0 }}>{advances.length} customers</p>
        </div>
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search customer..."
        style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '12px' }} />

      {loading ? (
        <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '32px', marginBottom: '8px' }}>{activeTab === 'outstanding' ? '✅' : '💚'}</p>
          <p style={{ fontWeight: '700', color: '#1a7a4a', marginBottom: '4px' }}>
            {activeTab === 'outstanding' ? 'No outstanding balances!' : 'No advance credits!'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(c => {
            const balance = Number(c.balance)
            const isAdvance = balance < 0
            return (
              <div key={c.id}
                onClick={() => onSelectCustomer && onSelectCustomer(c)}
                style={{
                  background: 'white', borderRadius: '12px', padding: '14px 16px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: 'pointer',
                  border: c.hasActiveOrder ? '2px solid #0f4c81' : '1px solid #eee',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <p style={{ fontWeight: '700', fontSize: '15px', margin: 0, color: '#333' }}>{c.full_name}</p>
                    {c.hasActiveOrder && (
                      <span style={{ fontSize: '10px', background: '#0f4c81', color: 'white', padding: '2px 8px', borderRadius: '10px', fontWeight: '700' }}>📦 Order Today</span>
                    )}
                    {isAdvance && (
                      <span style={{ fontSize: '10px', background: '#e8f5e9', color: '#1a7a4a', padding: '2px 8px', borderRadius: '10px', fontWeight: '700' }}>💚 Advance</span>
                    )}
                  </div>
                  <p style={{ fontSize: '12px', color: '#888', margin: '0 0 2px' }}>{c.mobile} · {c.customer_code}</p>
                  <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>Rate: Rs. {c.rate_19l}</p>
                </div>
                <div style={{ textAlign: 'right', marginLeft: '12px' }}>
                  <p style={{ fontSize: '18px', fontWeight: '700', color: isAdvance ? '#1a7a4a' : '#f44336', margin: '0 0 2px' }}>
                    Rs. {Math.abs(balance).toLocaleString()}
                  </p>
                  <p style={{ fontSize: '11px', color: isAdvance ? '#1a7a4a' : '#aaa', margin: 0, fontWeight: '600' }}>
                    {isAdvance ? 'advance credit' : 'outstanding'}
                  </p>
                  <span style={{ fontSize: '18px', color: '#ccc' }}>›</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <button onClick={fetchReceivables}
        style={{ width: '100%', padding: '12px', background: '#f0f4ff', color: '#0f4c81', border: '1px solid #c8d8ff', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', marginTop: '12px' }}>
        🔄 Refresh
      </button>
    </div>
  )
}