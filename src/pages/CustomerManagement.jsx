import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function CustomerManagement() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editCustomer, setEditCustomer] = useState(null)
  const [form, setForm] = useState({
    full_name: '', mobile: '', address: '', pin_location: '',
    rate_19l: 100, rate_half_litre: 0, rate_1_5l: 0,
    own_bottles: 0, our_bottles_placed: 0,
    google_maps_link: '', latitude: '', longitude: '',
    opening_balance: 0
  })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [generatedPassword, setGeneratedPassword] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')

  useEffect(() => { fetchCustomers() }, [])

  async function fetchCustomers() {
    setLoading(true)
    const { data } = await supabase.from('customers').select('*').order('created_at', { ascending: false })
    setCustomers(data || [])
    setLoading(false)
  }

  function extractCoordinates(link) {
    if (!link) return { lat: '', lng: '' }
    const patterns = [
      /@(-?\d+\.\d+),(-?\d+\.\d+)/,
      /ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
      /q=(-?\d+\.\d+),(-?\d+\.\d+)/,
      /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    ]
    for (let p of patterns) {
      const match = link.match(p)
      if (match) return { lat: match[1], lng: match[2] }
    }
    return { lat: '', lng: '' }
  }

  function handleMapsLink(link) {
    const { lat, lng } = extractCoordinates(link)
    setForm(f => ({ ...f, google_maps_link: link, latitude: lat, longitude: lng }))
  }

  function openAddForm() {
    setEditCustomer(null)
    setGeneratedPassword(null)
    setNewPassword('')
    setShowPassword(false)
    setForm({
      full_name: '', mobile: '', address: '', pin_location: '',
      rate_19l: 100, rate_half_litre: 0, rate_1_5l: 0,
      own_bottles: 0, our_bottles_placed: 0,
      google_maps_link: '', latitude: '', longitude: '',
      opening_balance: 0
    })
    setShowForm(true)
  }

  function openEditForm(customer) {
    setEditCustomer(customer)
    setGeneratedPassword(null)
    setNewPassword('')
    setShowPassword(false)
    setForm({
      full_name: customer.full_name,
      mobile: customer.mobile,
      address: customer.address,
      pin_location: customer.pin_location || '',
      rate_19l: customer.rate_19l,
      rate_half_litre: customer.rate_half_litre,
      rate_1_5l: customer.rate_1_5l,
      own_bottles: customer.own_bottles || 0,
      our_bottles_placed: customer.our_bottles_placed || 0,
      google_maps_link: customer.google_maps_link || '',
      latitude: customer.latitude || '',
      longitude: customer.longitude || '',
      opening_balance: customer.opening_balance || 0
    })
    setShowForm(true)
  }

  async function saveCustomer() {
    if (!form.full_name || !form.mobile || !form.address) {
      alert('Please fill Name, Mobile and Address')
      return
    }
    setSaving(true)

    if (editCustomer) {
      const updateData = {
        full_name: form.full_name,
        mobile: form.mobile,
        address: form.address,
        pin_location: form.pin_location,
        rate_19l: form.rate_19l,
        rate_half_litre: form.rate_half_litre,
        rate_1_5l: form.rate_1_5l,
        own_bottles: form.own_bottles,
        our_bottles_placed: form.our_bottles_placed,
        google_maps_link: form.google_maps_link,
        latitude: form.latitude || null,
        longitude: form.longitude || null,
        opening_balance: form.opening_balance,
        // balance = opening_balance (credit sales will be added by deliveries)
        balance: Number(form.opening_balance)
      }

      // If admin set a new password
      if (newPassword.trim()) {
        updateData.password_plain = newPassword.trim().toUpperCase()
      }

      const { error } = await supabase
        .from('customers')
        .update(updateData)
        .eq('id', editCustomer.id)

      if (error) {
        alert('Error: ' + error.message)
      } else {
        alert('Customer updated successfully!')
        setShowForm(false)
        setEditCustomer(null)
        fetchCustomers()
      }
    } else {
      const code = 'AQ-' + Date.now().toString().slice(-5)
      const password = Math.random().toString(36).slice(-6).toUpperCase()
      setGeneratedPassword({ code, password })

      const { error } = await supabase.from('customers').insert([{
        ...form,
        customer_code: code,
        password_plain: password,
        balance: Number(form.opening_balance),
        latitude: form.latitude || null,
        longitude: form.longitude || null
      }])

      if (error) {
        alert('Error: ' + error.message)
      } else {
        setForm({
          full_name: '', mobile: '', address: '', pin_location: '',
          rate_19l: 100, rate_half_litre: 0, rate_1_5l: 0,
          own_bottles: 0, our_bottles_placed: 0,
          google_maps_link: '', latitude: '', longitude: '',
          opening_balance: 0
        })
        fetchCustomers()
      }
    }
    setSaving(false)
  }

  async function toggleActive(customer) {
    await supabase.from('customers').update({ is_active: !customer.is_active }).eq('id', customer.id)
    fetchCustomers()
  }

  const filtered = customers.filter(c =>
    c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.mobile?.includes(search) ||
    c.customer_code?.includes(search)
  )

  const inp = {
    width: '100%', padding: '10px 12px', border: '1px solid #ddd',
    borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
  }

  const sectionLabel = {
    fontSize: '11px', fontWeight: '700', color: '#888',
    marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em'
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <input placeholder="🔍 Search by name, mobile, ID..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...inp, width: '280px' }} />
        <button onClick={openAddForm}
          style={{
            padding: '10px 20px', background: '#0f4c81', color: 'white',
            border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600'
          }}>+ Add Customer</button>
      </div>

      {/* Generated Password Banner */}
      {generatedPassword && (
        <div style={{
          background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px',
          padding: '16px 20px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <p style={{ fontWeight: '700', color: '#1b5e20', marginBottom: '4px' }}>✅ Customer Created Successfully!</p>
            <p style={{ fontSize: '14px', color: '#2e7d32' }}>
              <strong>Customer ID:</strong> {generatedPassword.code} &nbsp;&nbsp;
              <strong>Password:</strong> {generatedPassword.password}
            </p>
            <p style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>⚠️ Save these now — share with customer for login.</p>
          </div>
          <button onClick={() => setGeneratedPassword(null)}
            style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888' }}>✕</button>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div style={{
          background: 'white', borderRadius: '12px', padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: '20px',
          border: '2px solid #e3f0ff'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, color: '#0f4c81' }}>
              {editCustomer ? '✏️ Edit — ' + editCustomer.customer_code : '➕ New Customer'}
            </h3>
            <button onClick={() => { setShowForm(false); setEditCustomer(null) }}
              style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888' }}>✕</button>
          </div>

          {/* Basic Info */}
          <p style={sectionLabel}>Basic Information</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
            {[
              { key: 'full_name', label: 'Full Name *', placeholder: 'Customer ka naam' },
              { key: 'mobile', label: 'Mobile Number *', placeholder: '03xx-xxxxxxx' },
              { key: 'address', label: 'Delivery Address *', placeholder: 'Ghar ka pata' },
              { key: 'pin_location', label: 'Area / Mohalla', placeholder: 'Mohalla ya area naam' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                <input value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.placeholder} style={inp} />
              </div>
            ))}
          </div>

          {/* Opening Balance */}
          <p style={sectionLabel}>💰 Account Balance</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>
                Opening Balance (Rs.)
              </label>
              <input type="number" value={form.opening_balance}
                onChange={e => setForm({ ...form, opening_balance: Number(e.target.value) })}
                placeholder="0" style={inp} />
              <p style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                Manual records se transfer hone wala purana balance. 0 rakhen agar koi balance nahi.
              </p>
            </div>
            <div style={{
              background: '#fff8e1', border: '1px solid #ffe082', borderRadius: '8px',
              padding: '12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center'
            }}>
              <p style={{ fontSize: '11px', color: '#888', margin: '0 0 6px' }}>Balance Formula</p>
              <p style={{ fontSize: '12px', color: '#555', margin: '0 0 4px' }}>Opening Balance: <strong>Rs. {Number(form.opening_balance).toLocaleString()}</strong></p>
              <p style={{ fontSize: '12px', color: '#555', margin: '0 0 4px' }}>+ Credit Sales: <strong>auto add honge</strong></p>
              <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>− Payments: <strong>auto minus honge</strong></p>
              <div style={{ borderTop: '1px solid #ffe082', marginTop: '8px', paddingTop: '8px' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#e65100', margin: 0 }}>
                  Total Receivable = Rs. {Number(form.opening_balance).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Password Section — Edit only */}
          {editCustomer && (
            <>
              <p style={sectionLabel}>🔐 Login Password</p>
              <div style={{
                background: '#f8f9fa', border: '1px solid #eee', borderRadius: '8px',
                padding: '14px 16px', marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div>
                    <p style={{ fontSize: '12px', color: '#888', margin: '0 0 4px' }}>Current Password</p>
                    <p style={{ fontSize: '16px', fontWeight: '700', color: '#0f4c81', margin: 0, letterSpacing: '2px' }}>
                      {showPassword ? (editCustomer.password_plain || 'Not set') : '••••••'}
                    </p>
                  </div>
                  <button onClick={() => setShowPassword(!showPassword)}
                    style={{
                      padding: '6px 14px', background: '#e3f0ff', color: '#0f4c81',
                      border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600'
                    }}>
                    {showPassword ? '🙈 Hide' : '👁️ Show'}
                  </button>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>
                    Reset Password (leave blank to keep current)
                  </label>
                  <input value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Naya password likhein..."
                    style={inp} />
                </div>
              </div>
            </>
          )}

          {/* Google Maps */}
          <p style={sectionLabel}>📍 Google Maps Location</p>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>
              Paste Google Maps link of customer's home
            </label>
            <input value={form.google_maps_link}
              onChange={e => handleMapsLink(e.target.value)}
              placeholder="https://maps.google.com/... ya https://goo.gl/maps/..."
              style={inp} />
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <div style={{ flex: 1, background: '#f8f8f8', borderRadius: '6px', padding: '8px 12px', border: '1px solid #eee' }}>
                <span style={{ fontSize: '11px', color: '#888' }}>Latitude: </span>
                <span style={{ fontSize: '13px', fontWeight: '600', color: form.latitude ? '#1a7a4a' : '#aaa' }}>
                  {form.latitude || 'Auto detect'}
                </span>
              </div>
              <div style={{ flex: 1, background: '#f8f8f8', borderRadius: '6px', padding: '8px 12px', border: '1px solid #eee' }}>
                <span style={{ fontSize: '11px', color: '#888' }}>Longitude: </span>
                <span style={{ fontSize: '13px', fontWeight: '600', color: form.longitude ? '#1a7a4a' : '#aaa' }}>
                  {form.longitude || 'Auto detect'}
                </span>
              </div>
              {form.google_maps_link && (
                <a href={form.google_maps_link} target="_blank" rel="noreferrer"
                  style={{
                    padding: '8px 14px', background: '#e8f5e9', color: '#1a7a4a',
                    borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                    textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid #c8e6c9'
                  }}>📍 Verify</a>
              )}
            </div>
            <p style={{ fontSize: '11px', color: '#aaa', marginTop: '6px' }}>
              Google Maps kholen → customer ka ghar dhunden → Share button dabain → link copy karen → yahan paste karen
            </p>
          </div>

          {/* Rates */}
          <p style={sectionLabel}>Rates (Rs. per bottle)</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '20px' }}>
            {[
              { key: 'rate_19l', label: '19 Litre Bottle' },
              { key: 'rate_half_litre', label: 'Half Litre Bottle' },
              { key: 'rate_1_5l', label: '1.5 Litre Bottle' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                <input type="number" value={form[f.key]}
                  onChange={e => setForm({ ...form, [f.key]: Number(e.target.value) })}
                  style={inp} />
              </div>
            ))}
          </div>

          {/* Bottle Tracking */}
          <p style={sectionLabel}>🍶 Bottle Tracking</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '24px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Customer's Own Bottles</label>
              <input type="number" value={form.own_bottles}
                onChange={e => setForm({ ...form, own_bottles: Number(e.target.value) })}
                style={inp} />
              <p style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Customer ne khud khareedein</p>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Our Bottles Placed</label>
              <input type="number" value={form.our_bottles_placed}
                onChange={e => setForm({ ...form, our_bottles_placed: Number(e.target.value) })}
                style={inp} />
              <p style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>Hamare bottles uske ghar mein</p>
            </div>
            <div style={{
              padding: '10px 12px', background: '#f0f7ff', borderRadius: '8px',
              border: '1px solid #c8e0ff', display: 'flex', flexDirection: 'column', justifyContent: 'center'
            }}>
              <p style={{ fontSize: '12px', color: '#555', margin: '0 0 4px' }}>Total Bottles at Customer</p>
              <p style={{ fontSize: '32px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>
                {Number(form.own_bottles) + Number(form.our_bottles_placed)}
              </p>
              <p style={{ fontSize: '11px', color: '#888', margin: '4px 0 0' }}>
                ≈ {Number(form.own_bottles) + Number(form.our_bottles_placed)} din ka paani
              </p>
            </div>
          </div>

          <button onClick={saveCustomer} disabled={saving}
            style={{
              padding: '12px 32px', background: '#1a7a4a', color: 'white',
              border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontWeight: '600'
            }}>
            {saving ? 'Saving...' : editCustomer ? '✓ Update Customer' : '✓ Save Customer'}
          </button>
        </div>
      )}

      {/* Summary Bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        {[
          { label: 'Active Customers', value: customers.filter(c => c.is_active).length, color: '#0f4c81' },
          { label: 'Our Bottles Out', value: customers.reduce((s, c) => s + (c.our_bottles_placed || 0), 0), color: '#e65100' },
          { label: 'Total Bottles at Customers', value: customers.reduce((s, c) => s + (c.own_bottles || 0) + (c.our_bottles_placed || 0), 0), color: '#1a7a4a' },
          { label: 'Total Receivable', value: 'Rs. ' + customers.reduce((s, c) => s + Number(c.balance || 0), 0).toLocaleString(), color: '#c62828' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'white', borderRadius: '8px', padding: '12px 16px',
            border: '1px solid #eee', flex: 1, textAlign: 'center'
          }}>
            <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>{s.label}</p>
            <p style={{ fontSize: '20px', fontWeight: '700', color: s.color, margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
          <thead>
            <tr style={{ background: '#f8f9fa' }}>
              {['ID', 'Name', 'Mobile', 'Address', 'Rate 19L', 'Own 🍶', 'Ours 🍶', 'Total 🍶', 'Location', 'Opening Bal', 'Current Bal', 'Status', 'Action'].map(h => (
                <th key={h} style={{
                  padding: '12px 12px', textAlign: 'left', fontSize: '11px',
                  color: '#666', fontWeight: '600', borderBottom: '1px solid #eee', whiteSpace: 'nowrap'
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={13} style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={13} style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
                {search ? 'No customers found' : 'No customers yet — click Add Customer above'}
              </td></tr>
            ) : filtered.map(c => {
              const totalBottles = (c.own_bottles || 0) + (c.our_bottles_placed || 0)
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={{ padding: '10px 12px', fontSize: '12px', fontFamily: 'monospace', color: '#0f4c81', fontWeight: '600', whiteSpace: 'nowrap' }}>{c.customer_code}</td>
                  <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap' }}>{c.full_name}</td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', color: '#555', whiteSpace: 'nowrap' }}>{c.mobile}</td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', color: '#555', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.address}</td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}>Rs. {c.rate_19l}</td>
                  <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'center', color: '#555' }}>{c.own_bottles || 0}</td>
                  <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'center', color: '#e65100', fontWeight: '600' }}>{c.our_bottles_placed || 0}</td>
                  <td style={{ padding: '10px 12px', fontSize: '14px', textAlign: 'center', fontWeight: '700', color: '#0f4c81' }}>{totalBottles}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {c.latitude ? (
                      <a href={c.google_maps_link || `https://maps.google.com/?q=${c.latitude},${c.longitude}`}
                        target="_blank" rel="noreferrer"
                        style={{ fontSize: '18px', textDecoration: 'none' }} title="View on Google Maps">📍</a>
                    ) : (
                      <span style={{ fontSize: '12px', color: '#ccc' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', color: '#888', whiteSpace: 'nowrap' }}>
                    Rs. {Number(c.opening_balance || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '700', whiteSpace: 'nowrap', color: c.balance > 0 ? '#f44336' : '#4caf50' }}>
                    Rs. {Number(c.balance || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span onClick={() => toggleActive(c)}
                      style={{
                        padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
                        background: c.is_active ? '#e8f5e9' : '#ffebee',
                        color: c.is_active ? '#2e7d32' : '#c62828', cursor: 'pointer', whiteSpace: 'nowrap'
                      }}>{c.is_active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <button onClick={() => openEditForm(c)}
                      style={{
                        padding: '5px 12px', background: '#e3f0ff', color: '#0f4c81',
                        border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap'
                      }}>✏️ Edit</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}