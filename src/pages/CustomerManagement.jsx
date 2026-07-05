import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function CustomerManagement({ tenantId }) {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editCustomer, setEditCustomer] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [form, setForm] = useState({
    full_name: '', mobile: '', address: '',
    rate_19l: 100, rate_half_litre: 0, rate_1_5l: 0,
    own_bottles: 0, our_bottles_placed: 0,
    opening_balance: 0, customer_password: '',
    google_maps_link: '', latitude: '', longitude: '',
    is_active: true
  })
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState({})

  useEffect(() => { if (tenantId) fetchCustomers() }, [tenantId])

  async function fetchCustomers() {
    setLoading(true)
    const { data } = await supabase.from('customers')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('full_name')
    setCustomers(data || [])
    setLoading(false)
  }

  function generatePassword() {
    return Math.random().toString(36).slice(-6).toUpperCase()
  }

  function cleanNumeric(val) {
    const n = Number(val)
    return isNaN(n) ? 0 : n
  }

  function openAddForm() {
    setEditCustomer(null)
    setForm({
      full_name: '', mobile: '', address: '',
      rate_19l: 100, rate_half_litre: 0, rate_1_5l: 0,
      own_bottles: 0, our_bottles_placed: 0,
      opening_balance: 0,
      customer_password: generatePassword(),
      google_maps_link: '', latitude: '', longitude: '',
      is_active: true
    })
    setShowForm(true)
  }

  function openEditForm(c) {
    setEditCustomer(c)
    setForm({
      full_name: c.full_name || '',
      mobile: c.mobile || '',
      address: c.address || '',
      rate_19l: Number(c.rate_19l) || 100,
      rate_half_litre: Number(c.rate_half_litre) || 0,
      rate_1_5l: Number(c.rate_1_5l) || 0,
      own_bottles: Number(c.own_bottles) || 0,
      our_bottles_placed: Number(c.our_bottles_placed) || 0,
      opening_balance: Number(c.opening_balance) || 0,
      customer_password: c.customer_password || c.password_plain || '',
      google_maps_link: c.google_maps_link || '',
      latitude: c.latitude || '',
      longitude: c.longitude || '',
      is_active: c.is_active
    })
    setShowForm(true)
  }

  function extractCoordinates(link) {
    const patterns = [
      /@(-?\d+\.\d+),(-?\d+\.\d+)/,
      /q=(-?\d+\.\d+),(-?\d+\.\d+)/,
      /ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
    ]
    for (const pattern of patterns) {
      const match = link.match(pattern)
      if (match) return { latitude: match[1], longitude: match[2] }
    }
    return null
  }

  function handleMapsLink(link) {
    setForm(f => {
      const coords = extractCoordinates(link)
      return {
        ...f, google_maps_link: link,
        latitude: coords?.latitude || f.latitude,
        longitude: coords?.longitude || f.longitude
      }
    })
  }

  async function saveCustomer() {
    if (!form.full_name || !form.mobile) return alert('Name and mobile are required')
    if (!form.customer_password) return alert('Password is required')
    setSaving(true)

    // Force clean ALL fields — no empty strings allowed
    const cleanForm = {
      full_name: String(form.full_name || '').trim(),
      mobile: String(form.mobile || '').trim(),
      address: String(form.address || '').trim(),
      rate_19l: Number(form.rate_19l) || 0,
      rate_half_litre: Number(form.rate_half_litre) || 0,
      rate_1_5l: Number(form.rate_1_5l) || 0,
      own_bottles: Number(form.own_bottles) || 0,
      our_bottles_placed: Number(form.our_bottles_placed) || 0,
      opening_balance: Number(form.opening_balance) || 0,
      customer_password: String(form.customer_password || '').trim(),
      password_plain: String(form.customer_password || '').trim(),
      google_maps_link: String(form.google_maps_link || '').trim(),
      latitude: String(form.latitude || '').trim(),
      longitude: String(form.longitude || '').trim(),
      is_active: form.is_active === false ? false : true,
    }

    console.log('Saving customer with data:', cleanForm)

    if (editCustomer) {
      // Recalculate balance = opening_balance + (all credit deliveries) - (all payments)
      const { data: deliveryData } = await supabase.from('deliveries')
        .select('credit_amount, total_amount, payment_method, jazzcash_confirmed')
        .eq('customer_id', editCustomer.id)
        .eq('tenant_id', tenantId)
        .eq('is_voided', false)

      const { data: paymentData } = await supabase.from('payments')
        .select('amount, payment_method, jazzcash_confirmed')
        .eq('customer_id', editCustomer.id)
        .eq('tenant_id', tenantId)
        .eq('is_voided', false)

      let balance = cleanForm.opening_balance

      deliveryData?.forEach(d => {
        if (d.payment_method === 'credit') balance += Number(d.total_amount)
        else if (d.payment_method === 'cash') balance += Number(d.credit_amount || 0)
        else if (d.payment_method === 'jazzcash' && !d.jazzcash_confirmed) balance += Number(d.total_amount)
      })

      paymentData?.forEach(p => {
        if (p.payment_method === 'cash') balance -= Number(p.amount)
        else if (p.payment_method === 'jazzcash' && p.jazzcash_confirmed) balance -= Number(p.amount)
      })

      const { error } = await supabase.from('customers').update({
        ...cleanForm,
        balance: balance,
        updated_at: new Date().toISOString()
      })
        .eq('id', editCustomer.id)
        .eq('tenant_id', tenantId)
      if (error) { 
        console.error('Update error:', error)
        alert('Error: ' + error.message)
        setSaving(false)
        return
      }
      alert('Customer updated!')
    } else {
      const customerCode = 'AQ-' + Math.floor(10000 + Math.random() * 90000)
      const { error } = await supabase.from('customers').insert([{
        ...cleanForm,
        tenant_id: tenantId,
        customer_code: customerCode,
        balance: Number(form.opening_balance) || 0,
      }])
      if (error) { 
        console.error('Insert error:', error)
        alert('Error: ' + error.message)
        setSaving(false)
        return
      }
      alert(`Customer added!\n\nCustomer ID: ${customerCode}\nPassword: ${form.customer_password}\n\nShare these with the customer for app login.`)
    }

    setShowForm(false)
    setEditCustomer(null)
    fetchCustomers()
    setSaving(false)
  }

  async function toggleActive(c) {
    await supabase.from('customers')
      .update({ is_active: !c.is_active })
      .eq('id', c.id)
      .eq('tenant_id', tenantId)
    fetchCustomers()
  }

  async function resetPassword(c) {
    const newPass = generatePassword()
    await supabase.from('customers').update({
      customer_password: newPass, password_plain: newPass
    })
      .eq('id', c.id)
      .eq('tenant_id', tenantId)
    alert(`New password for ${c.full_name}:\n\nPassword: ${newPass}\n\nShare this with the customer.`)
    fetchCustomers()
  }

  function getBalanceDisplay(customer) {
    const balance = Number(customer.balance || 0)
    if (balance > 0) return { label: `Rs. ${balance.toLocaleString()} owed`, color: '#f44336', bg: '#ffebee' }
    if (balance < 0) return { label: `Rs. ${Math.abs(balance).toLocaleString()} advance`, color: '#1a7a4a', bg: '#e8f5e9' }
    return { label: 'Clear', color: '#1a7a4a', bg: '#e8f5e9' }
  }

  const filtered = customers.filter(c => {
    const matchSearch = !search ||
      c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.mobile?.includes(search) ||
      c.customer_code?.includes(search)
    const balance = Number(c.balance || 0)
    const matchFilter =
      filter === 'all' ? true :
      filter === 'active' ? c.is_active :
      filter === 'inactive' ? !c.is_active :
      filter === 'outstanding' ? balance > 0 :
      filter === 'advance' ? balance < 0 :
      filter === 'clear' ? balance === 0 : true
    return matchSearch && matchFilter
  })

  const inp = {
    width: '100%', padding: '10px 12px', border: '1px solid #ddd',
    borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
  }

  const totalReceivable = customers.filter(c => Number(c.balance) > 0).reduce((s, c) => s + Number(c.balance), 0)
  const totalAdvance = customers.filter(c => Number(c.balance) < 0).reduce((s, c) => s + Math.abs(Number(c.balance)), 0)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', color: '#333' }}>Customer Management</h2>
        <button onClick={openAddForm}
          style={{ padding: '10px 20px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
          + Add Customer
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
        <div style={{ background: 'white', borderRadius: '10px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #0f4c81' }}>
          <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px', textTransform: 'uppercase' }}>Total Customers</p>
          <p style={{ fontSize: '22px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>{customers.filter(c => c.is_active).length}</p>
        </div>
        <div style={{ background: 'white', borderRadius: '10px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #f44336' }}>
          <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px', textTransform: 'uppercase' }}>Total Receivable</p>
          <p style={{ fontSize: '22px', fontWeight: '700', color: '#f44336', margin: 0 }}>Rs. {totalReceivable.toLocaleString()}</p>
        </div>
        <div style={{ background: 'white', borderRadius: '10px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #1a7a4a' }}>
          <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px', textTransform: 'uppercase' }}>Advance Credits</p>
          <p style={{ fontSize: '22px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>Rs. {totalAdvance.toLocaleString()}</p>
        </div>
      </div>

      {/* Search & Filter */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, mobile, ID..."
          style={{ flex: 1, minWidth: '200px', padding: '10px 14px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none' }} />
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'All' },
            { key: 'active', label: '✅ Active' },
            { key: 'outstanding', label: '🔴 Owe' },
            { key: 'advance', label: '🟢 Advance' },
            { key: 'clear', label: '⚪ Clear' },
            { key: 'inactive', label: '❌ Inactive' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{
                padding: '8px 14px', border: 'none', borderRadius: '8px', cursor: 'pointer',
                background: filter === f.key ? '#0f4c81' : '#f0f0f0',
                color: filter === f.key ? 'white' : '#555',
                fontWeight: filter === f.key ? '700' : '400', fontSize: '12px'
              }}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: '20px', border: '2px solid #e3f0ff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, color: '#0f4c81' }}>{editCustomer ? '✏️ Edit Customer' : '➕ New Customer'}</h3>
            <button onClick={() => { setShowForm(false); setEditCustomer(null) }}
              style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888' }}>✕</button>
          </div>

          {/* Basic Info */}
          <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Basic Information</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Full Name *</label>
              <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })}
                placeholder="Customer name" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Mobile *</label>
              <input value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })}
                placeholder="03xx-xxxxxxx" style={inp} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Address</label>
              <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                placeholder="Customer address" style={inp} />
            </div>
          </div>

          {/* App Login */}
          <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>App Login Credentials</p>
          <div style={{ background: '#f0f7ff', borderRadius: '10px', padding: '14px', marginBottom: '14px', border: '1px solid #c8d8ff' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Customer ID (Auto Generated)</label>
                <div style={{ padding: '10px 12px', background: '#e3f0ff', borderRadius: '8px', fontSize: '14px', fontWeight: '700', color: '#0f4c81' }}>
                  {editCustomer ? editCustomer.customer_code : 'AQ-XXXXX (auto)'}
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>App Password *</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input value={form.customer_password}
                    onChange={e => setForm({ ...form, customer_password: e.target.value })}
                    placeholder="Password"
                    style={{ ...inp, flex: 1, fontWeight: '700', letterSpacing: '2px' }} />
                  <button type="button" onClick={() => setForm({ ...form, customer_password: generatePassword() })}
                    style={{ padding: '10px 10px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                    🔄
                  </button>
                </div>
              </div>
            </div>
            <p style={{ fontSize: '11px', color: '#0f4c81', margin: 0 }}>
              💡 Customer uses their <strong>Customer ID</strong> and <strong>Password</strong> to login to the customer app. Share these after saving.
            </p>
          </div>

          {/* Rates */}
          <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bottle Rates (Rs.)</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            {[
              { key: 'rate_19l', label: '19 Litre' },
              { key: 'rate_half_litre', label: 'Half Litre' },
              { key: 'rate_1_5l', label: '1.5 Litre' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                <input type="number" value={form[f.key]}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value === '' ? '' : Number(e.target.value) })}
                  onBlur={e => setForm({ ...form, [f.key]: cleanNumeric(e.target.value) })}
                  style={inp} />
              </div>
            ))}
          </div>

          {/* Bottles */}
          <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bottles at Home</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Customer Own Bottles</label>
              <input type="number" value={form.own_bottles}
                onChange={e => setForm({ ...form, own_bottles: e.target.value === '' ? '' : Number(e.target.value) })}
                onBlur={e => setForm({ ...form, own_bottles: cleanNumeric(e.target.value) })}
                style={inp} />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Our Bottles Placed</label>
              <input type="number" value={form.our_bottles_placed}
                onChange={e => setForm({ ...form, our_bottles_placed: e.target.value === '' ? '' : Number(e.target.value) })}
                onBlur={e => setForm({ ...form, our_bottles_placed: cleanNumeric(e.target.value) })}
                style={inp} />
            </div>
          </div>

          {/* Opening Balance */}
          <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Opening Balance</p>
          <div style={{ marginBottom: '14px' }}>
            <input type="number" value={form.opening_balance}
              onChange={e => setForm({ ...form, opening_balance: e.target.value === '' ? '' : Number(e.target.value) })}
              onBlur={e => setForm({ ...form, opening_balance: cleanNumeric(e.target.value) })}
              placeholder="0" style={inp} />
            <div style={{ marginTop: '6px', background: '#f0f7ff', borderRadius: '6px', padding: '8px 12px' }}>
              <p style={{ fontSize: '11px', color: '#0f4c81', margin: 0 }}>
                💡 Positive = customer owes you · Negative = customer paid in advance
              </p>
            </div>
          </div>

          {/* Google Maps */}
          <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Location (optional)</p>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Google Maps Link</label>
            <input value={form.google_maps_link} onChange={e => handleMapsLink(e.target.value)}
              placeholder="Paste Google Maps link..." style={inp} />
            {form.latitude && form.longitude && (
              <p style={{ fontSize: '11px', color: '#1a7a4a', margin: '4px 0 0' }}>
                ✅ Coordinates: {form.latitude}, {form.longitude}
              </p>
            )}
          </div>

          <button onClick={saveCustomer} disabled={saving}
            style={{ width: '100%', padding: '14px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontWeight: '600' }}>
            {saving ? 'Saving...' : editCustomer ? '✓ Update Customer' : '✓ Save Customer'}
          </button>
        </div>
      )}

      {/* Customer List */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'auto' }}>
        {loading ? (
          <p style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</p>
        ) : filtered.length === 0 ? (
          <p style={{ padding: '40px', textAlign: 'center', color: '#888' }}>No customers found.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                {['Customer', 'Mobile', 'Rate 19L', 'Bottles', 'Balance', 'Login Details', 'Status', 'Action'].map(h => (
                  <th key={h} style={{ padding: '12px 14px', textAlign: 'left', fontSize: '11px', color: '#666', fontWeight: '600', borderBottom: '1px solid #eee' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const balDisplay = getBalanceDisplay(c)
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>{c.full_name}</p>
                      <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{c.customer_code}</p>
                      {c.address && <p style={{ fontSize: '11px', color: '#aaa', margin: '2px 0 0' }}>{c.address}</p>}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '13px', color: '#555' }}>{c.mobile}</td>
                    <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: '600', color: '#0f4c81' }}>Rs. {c.rate_19l}</td>
                    <td style={{ padding: '12px 14px', fontSize: '12px', color: '#555' }}>
                      <p style={{ margin: '0 0 2px' }}>Own: {c.own_bottles || 0}</p>
                      <p style={{ margin: '0 0 2px' }}>Ours: {c.our_bottles_placed || 0}</p>
                      <p style={{ margin: 0, fontWeight: '600' }}>Total: {(c.own_bottles || 0) + (c.our_bottles_placed || 0)}</p>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '700', background: balDisplay.bg, color: balDisplay.color, whiteSpace: 'nowrap' }}>
                        {balDisplay.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>ID: <strong style={{ color: '#0f4c81' }}>{c.customer_code}</strong></p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Pass: </p>
                        <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#555', fontWeight: '700' }}>
                          {showPassword[c.id] ? (c.customer_password || c.password_plain || '—') : '••••••'}
                        </span>
                        <button onClick={() => setShowPassword(p => ({ ...p, [c.id]: !p[c.id] }))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#888', padding: '0 2px' }}>
                          {showPassword[c.id] ? '🙈' : '👁️'}
                        </button>
                      </div>
                      <button onClick={() => resetPassword(c)}
                        style={{ fontSize: '10px', color: '#f44336', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: '2px' }}>
                        🔄 Reset Password
                      </button>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span onClick={() => toggleActive(c)}
                        style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', background: c.is_active ? '#e8f5e9' : '#ffebee', color: c.is_active ? '#2e7d32' : '#c62828', cursor: 'pointer' }}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <button onClick={() => openEditForm(c)}
                        style={{ padding: '5px 12px', background: '#e3f0ff', color: '#0f4c81', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                        ✏️ Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}