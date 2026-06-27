import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function RiderManagement() {
  const [riders, setRiders] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editRider, setEditRider] = useState(null)
  const [form, setForm] = useState({
    full_name: '', pin_code: '',
    is_main_rider: false,
    salary_type: 'fixed',
    monthly_salary: 0,
    commission_19l: 0,
    commission_half_litre: 0,
    commission_1_5l: 0
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchRiders() }, [])

  async function fetchRiders() {
    setLoading(true)
    const { data } = await supabase.from('riders').select('*').order('created_at')
    setRiders(data || [])
    setLoading(false)
  }

  function openAddForm() {
    setEditRider(null)
    setForm({
      full_name: '', pin_code: '',
      is_main_rider: false,
      salary_type: 'fixed',
      monthly_salary: 0,
      commission_19l: 0,
      commission_half_litre: 0,
      commission_1_5l: 0
    })
    setShowForm(true)
  }

  function openEditForm(r) {
    setEditRider(r)
    setForm({
      full_name: r.full_name,
      pin_code: r.pin_code,
      is_main_rider: r.is_main_rider || false,
      salary_type: r.salary_type || 'fixed',
      monthly_salary: r.monthly_salary || 0,
      commission_19l: r.commission_19l || 0,
      commission_half_litre: r.commission_half_litre || 0,
      commission_1_5l: r.commission_1_5l || 0
    })
    setShowForm(true)
  }

  async function saveRider() {
    if (!form.full_name || !form.pin_code) return alert('Name and PIN are required')
    if (form.pin_code.length < 4) return alert('PIN must be at least 4 digits')
    setSaving(true)

    if (form.is_main_rider) {
      await supabase.from('riders').update({ is_main_rider: false })
        .neq('id', editRider?.id || '00000000-0000-0000-0000-000000000000')
    }

    if (editRider) {
      const { error } = await supabase.from('riders').update(form).eq('id', editRider.id)
      if (error) { alert('Error: ' + error.message); setSaving(false); return }
      alert('Rider updated!')
    } else {
      const { error } = await supabase.from('riders').insert([{ ...form, is_active: true }])
      if (error) { alert('Error: ' + error.message); setSaving(false); return }
      alert('Rider added!')
    }

    setShowForm(false)
    setEditRider(null)
    fetchRiders()
    setSaving(false)
  }

  async function toggleActive(r) {
    await supabase.from('riders').update({ is_active: !r.is_active }).eq('id', r.id)
    fetchRiders()
  }

  const inp = {
    width: '100%', padding: '10px 12px', border: '1px solid #ddd',
    borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', color: '#333' }}>Riders</h2>
        <button onClick={openAddForm}
          style={{ padding: '10px 20px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
          + Add Rider
        </button>
      </div>

      <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
        <p style={{ fontSize: '13px', color: '#795548', margin: '0 0 4px', fontWeight: '600' }}>⭐ Main Rider</p>
        <p style={{ fontSize: '12px', color: '#795548', margin: 0, lineHeight: 1.6 }}>
          Only one rider can be Main Rider. Other riders return cash to Main Rider. If no Main Rider is set, all riders return cash directly to Admin.
        </p>
      </div>

      {showForm && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', marginBottom: '20px', border: '2px solid #e3f0ff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, color: '#0f4c81' }}>{editRider ? '✏️ Edit Rider' : '➕ New Rider'}</h3>
            <button onClick={() => { setShowForm(false); setEditRider(null) }}
              style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888' }}>✕</button>
          </div>

          {/* Basic Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Full Name *</label>
              <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })}
                placeholder="Rider name" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>PIN Code * (4+ digits)</label>
              <input type="number" value={form.pin_code} onChange={e => setForm({ ...form, pin_code: e.target.value })}
                placeholder="e.g. 1234" style={inp} />
            </div>
          </div>

          {/* Salary Type Toggle */}
          <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Salary Type
          </p>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            {[
              { key: 'fixed', label: '💰 Fixed Monthly', desc: 'Same amount every month' },
              { key: 'commission', label: '📦 Commission Based', desc: 'Earn per bottle delivered' },
            ].map(t => (
              <button key={t.key} onClick={() => setForm({ ...form, salary_type: t.key })}
                style={{
                  flex: 1, padding: '14px', border: '2px solid',
                  borderColor: form.salary_type === t.key ? '#0f4c81' : '#eee',
                  borderRadius: '10px', cursor: 'pointer',
                  background: form.salary_type === t.key ? '#e3f0ff' : '#f8f9fa',
                  textAlign: 'center'
                }}>
                <p style={{ fontSize: '14px', fontWeight: '700', color: form.salary_type === t.key ? '#0f4c81' : '#555', margin: '0 0 4px' }}>{t.label}</p>
                <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{t.desc}</p>
              </button>
            ))}
          </div>

          {/* Fixed Salary Fields */}
          {form.salary_type === 'fixed' && (
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Monthly Salary (Rs.)</label>
              <input type="number" value={form.monthly_salary}
                onChange={e => setForm({ ...form, monthly_salary: Number(e.target.value) })}
                placeholder="e.g. 15000" style={inp} />
            </div>
          )}

          {/* Commission Fields */}
          {form.salary_type === 'commission' && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Commission Rates (Rs. per bottle)
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
                {[
                  { key: 'commission_19l', label: '19 Litre Bottle', placeholder: 'e.g. 10' },
                  { key: 'commission_half_litre', label: 'Half Litre Bottle', placeholder: 'e.g. 2' },
                  { key: 'commission_1_5l', label: '1.5 Litre Bottle', placeholder: 'e.g. 3' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                    <input type="number" value={form[f.key]}
                      onChange={e => setForm({ ...form, [f.key]: Number(e.target.value) })}
                      placeholder={f.placeholder} style={inp} />
                  </div>
                ))}
              </div>
              {/* Commission Preview */}
              <div style={{ marginTop: '12px', background: '#f0f7ff', borderRadius: '8px', padding: '12px' }}>
                <p style={{ fontSize: '12px', fontWeight: '700', color: '#0f4c81', margin: '0 0 6px' }}>Example — if rider delivers 100 bottles per month:</p>
                <p style={{ fontSize: '12px', color: '#555', margin: '0 0 2px' }}>
                  19L × 100 × Rs. {form.commission_19l} = Rs. {(100 * form.commission_19l).toLocaleString()}
                </p>
                {form.commission_half_litre > 0 && (
                  <p style={{ fontSize: '12px', color: '#555', margin: '0 0 2px' }}>
                    Half × 50 × Rs. {form.commission_half_litre} = Rs. {(50 * form.commission_half_litre).toLocaleString()}
                  </p>
                )}
                {form.commission_1_5l > 0 && (
                  <p style={{ fontSize: '12px', color: '#555', margin: '0 0 2px' }}>
                    1.5L × 50 × Rs. {form.commission_1_5l} = Rs. {(50 * form.commission_1_5l).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Main Rider Toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', background: form.is_main_rider ? '#fff8e1' : '#f8f9fa',
            border: '2px solid ' + (form.is_main_rider ? '#ffe082' : '#eee'),
            borderRadius: '10px', marginBottom: '20px', cursor: 'pointer'
          }} onClick={() => setForm({ ...form, is_main_rider: !form.is_main_rider })}>
            <div>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: '0 0 2px' }}>⭐ Main Rider</p>
              <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Other riders return cash to this rider</p>
            </div>
            <div style={{
              width: '48px', height: '26px', borderRadius: '13px',
              background: form.is_main_rider ? '#f59e0b' : '#ddd',
              position: 'relative', transition: 'background 0.2s'
            }}>
              <div style={{
                width: '20px', height: '20px', borderRadius: '50%', background: 'white',
                position: 'absolute', top: '3px',
                left: form.is_main_rider ? '25px' : '3px',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
              }} />
            </div>
          </div>

          <button onClick={saveRider} disabled={saving}
            style={{ padding: '12px 28px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontWeight: '600' }}>
            {saving ? 'Saving...' : editRider ? '✓ Update Rider' : '✓ Save Rider'}
          </button>
        </div>
      )}

      {/* Riders Table */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8f9fa' }}>
              {['Name', 'Role', 'Salary Type', 'Rate / Salary', 'PIN', 'Status', 'Action'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', color: '#666', fontWeight: '600', borderBottom: '1px solid #eee' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</td></tr>
            ) : riders.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#888' }}>No riders yet</td></tr>
            ) : riders.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0', background: r.is_main_rider ? '#fffdf0' : 'white' }}>
                <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '600' }}>
                  {r.is_main_rider && <span style={{ marginRight: '6px' }}>⭐</span>}
                  {r.full_name}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
                    background: r.is_main_rider ? '#fff8e1' : '#f0f4ff',
                    color: r.is_main_rider ? '#795548' : '#0f4c81'
                  }}>{r.is_main_rider ? 'Main Rider' : 'Rider'}</span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
                    background: r.salary_type === 'commission' ? '#e8f5e9' : '#f3e5f5',
                    color: r.salary_type === 'commission' ? '#1a7a4a' : '#7b1fa2'
                  }}>
                    {r.salary_type === 'commission' ? '📦 Commission' : '💰 Fixed'}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#555' }}>
                  {r.salary_type === 'commission' ? (
                    <div>
                      <p style={{ margin: '0 0 2px', fontSize: '12px' }}>19L: Rs. {r.commission_19l || 0}/bottle</p>
                      {r.commission_half_litre > 0 && <p style={{ margin: '0 0 2px', fontSize: '12px' }}>Half: Rs. {r.commission_half_litre}/bottle</p>}
                      {r.commission_1_5l > 0 && <p style={{ margin: 0, fontSize: '12px' }}>1.5L: Rs. {r.commission_1_5l}/bottle</p>}
                    </div>
                  ) : (
                    <span style={{ fontWeight: '600', color: '#1a7a4a' }}>Rs. {Number(r.monthly_salary || 0).toLocaleString()}/month</span>
                  )}
                </td>
                <td style={{ padding: '12px 16px', fontSize: '14px', fontFamily: 'monospace', letterSpacing: '4px', color: '#555' }}>
                  {'•'.repeat(r.pin_code?.length || 4)}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span onClick={() => toggleActive(r)}
                    style={{
                      padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
                      background: r.is_active ? '#e8f5e9' : '#ffebee',
                      color: r.is_active ? '#2e7d32' : '#c62828', cursor: 'pointer'
                    }}>{r.is_active ? 'Active' : 'Inactive'}</span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <button onClick={() => openEditForm(r)}
                    style={{ padding: '5px 12px', background: '#e3f0ff', color: '#0f4c81', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
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
}