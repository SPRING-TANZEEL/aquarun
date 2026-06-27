import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function RiderReceivables({ rider, onSelectCustomer }) {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [totalReceivable, setTotalReceivable] = useState(0)

  useEffect(() => { fetchReceivables() }, [])

  async function fetchReceivables() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]

    // Get all active customers with balance
    const { data: customersData } = await supabase
      .from('customers')
      .select('*')
      .eq('is_active', true)
      .gt('balance', 0)
      .order('balance', { ascending: false })

    // Get today's assigned orders for this rider
    const { data: ordersData } = await supabase
      .from('orders')
      .select('customer_id')
      .eq('rider_id', rider.id)
      .eq('status', 'assigned')
      .lte('delivery_date', today)

    const ordersCustomerIds = new Set(ordersData?.map(o => o.customer_id) || [])

    // Sort: customers with active orders first, then by balance
    const sorted = (customersData || []).sort((a, b) => {
      const aHasOrder = ordersCustomerIds.has(a.id) ? 1 : 0
      const bHasOrder = ordersCustomerIds.has(b.id) ? 1 : 0
      if (bHasOrder !== aHasOrder) return bHasOrder - aHasOrder
      return Number(b.balance) - Number(a.balance)
    }).map(c => ({ ...c, hasActiveOrder: ordersCustomerIds.has(c.id) }))

    const total = sorted.reduce((s, c) => s + Number(c.balance), 0)
    setCustomers(sorted)
    setTotalReceivable(total)
    setLoading(false)
  }

  const filtered = customers.filter(c =>
    c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.mobile?.includes(search) ||
    c.customer_code?.includes(search)
  )

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '4px' }}>💰 Customer Receivables</h2>
      <p style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
        Customers with outstanding balance — orders on top
      </p>

      {/* Total Receivable */}
      <div style={{
        background: 'linear-gradient(135deg, #c62828, #e65100)',
        color: 'white', borderRadius: '12px', padding: '16px',
        marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div>
          <p style={{ fontSize: '12px', opacity: 0.8, margin: '0 0 4px' }}>Total Outstanding</p>
          <p style={{ fontSize: '28px', fontWeight: '700', margin: 0 }}>Rs. {totalReceivable.toLocaleString()}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: '12px', opacity: 0.8, margin: '0 0 4px' }}>Customers</p>
          <p style={{ fontSize: '28px', fontWeight: '700', margin: 0 }}>{customers.length}</p>
        </div>
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search customer..."
        style={{
          width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '8px',
          fontSize: '14px', outline: 'none', boxSizing: 'border-box', marginBottom: '12px'
        }} />

      {loading ? (
        <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '32px', marginBottom: '8px' }}>✅</p>
          <p style={{ fontWeight: '700', color: '#1a7a4a', marginBottom: '4px' }}>All Clear!</p>
          <p style={{ color: '#888', fontSize: '13px' }}>No outstanding balances.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(c => (
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
                  <p style={{ fontWeight: '700', fontSize: '15px', margin: 0, color: '#333' }}>
                    {c.full_name}
                  </p>
                  {c.hasActiveOrder && (
                    <span style={{
                      fontSize: '10px', background: '#0f4c81', color: 'white',
                      padding: '2px 8px', borderRadius: '10px', fontWeight: '700'
                    }}>📦 Order Today</span>
                  )}
                </div>
                <p style={{ fontSize: '12px', color: '#888', margin: '0 0 2px' }}>
                  {c.mobile} · {c.customer_code}
                </p>
                <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>
                  Rate: Rs. {c.rate_19l} · Area: {c.pin_location || c.address}
                </p>
              </div>
              <div style={{ textAlign: 'right', marginLeft: '12px' }}>
                <p style={{ fontSize: '18px', fontWeight: '700', color: '#f44336', margin: '0 0 2px' }}>
                  Rs. {Number(c.balance).toLocaleString()}
                </p>
                <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>outstanding</p>
                <span style={{ fontSize: '18px', color: '#ccc' }}>›</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={fetchReceivables}
        style={{
          width: '100%', padding: '12px', background: '#f0f4ff', color: '#0f4c81',
          border: '1px solid #c8d8ff', borderRadius: '10px', cursor: 'pointer',
          fontSize: '14px', fontWeight: '600', marginTop: '12px'
        }}>
        🔄 Refresh
      </button>
    </div>
  )
}