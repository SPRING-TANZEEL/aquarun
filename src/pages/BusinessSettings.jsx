import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'

const SETTINGS_CONFIG = [
  {
    section: 'Business Information',
    icon: '🏢',
    fields: [
      { key: 'business_name', label: 'Business Name', placeholder: 'e.g. Spring Water Kamoke' },
      { key: 'business_tagline', label: 'Tagline', placeholder: 'e.g. Pure Water Delivery' },
      { key: 'business_address', label: 'Business Address', placeholder: 'Full address' },
    ]
  },
  {
    section: 'Contact Numbers',
    icon: '📞',
    fields: [
      { key: 'complaint_number', label: 'Complaint / Support Number', placeholder: '03xx-xxxxxxx' },
      { key: 'delivery_number', label: 'Delivery Contact Number', placeholder: '03xx-xxxxxxx' },
      { key: 'whatsapp_number', label: 'WhatsApp Number (for screenshots)', placeholder: '03xx-xxxxxxx' },
    ]
  },
  {
    section: 'JazzCash Account 1',
    icon: '📱',
    fields: [
      { key: 'jazzcash_number_1', label: 'JazzCash Number 1', placeholder: '03xx-xxxxxxx' },
      { key: 'jazzcash_name_1', label: 'Account Name 1', placeholder: 'Account holder name' },
    ]
  },
  {
    section: 'JazzCash Account 2',
    icon: '📱',
    fields: [
      { key: 'jazzcash_number_2', label: 'JazzCash Number 2', placeholder: '03xx-xxxxxxx' },
      { key: 'jazzcash_name_2', label: 'Account holder name' },
    ]
  },
]

export default function BusinessSettings() {
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoPreview, setLogoPreview] = useState(null)
  const fileRef = useRef()

  useEffect(() => { fetchSettings() }, [])

  async function fetchSettings() {
    setLoading(true)
    const { data } = await supabase.from('business_settings').select('*')
    const map = {}
    data?.forEach(s => { map[s.setting_key] = s.setting_value })
    setSettings(map)
    if (map.business_logo) setLogoPreview(map.business_logo)
    setLoading(false)
  }

  async function handleLogoUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return alert('Please select an image file')
    if (file.size > 2 * 1024 * 1024) return alert('Image must be less than 2MB')

    setUploadingLogo(true)

    const ext = file.name.split('.').pop()
    const fileName = `logo_${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('aquarun')
      .upload(fileName, file, { upsert: true })

    if (uploadError) { alert('Upload error: ' + uploadError.message); setUploadingLogo(false); return }

    const { data: urlData } = supabase.storage.from('aquarun').getPublicUrl(fileName)
    const publicUrl = urlData.publicUrl

    await supabase.from('business_settings')
      .upsert({ setting_key: 'business_logo', setting_value: publicUrl, updated_at: new Date().toISOString() },
        { onConflict: 'setting_key' })

    setSettings(s => ({ ...s, business_logo: publicUrl }))
    setLogoPreview(publicUrl)
    setUploadingLogo(false)
    alert('Logo uploaded successfully!')
  }

  async function removeLogo() {
    await supabase.from('business_settings')
      .upsert({ setting_key: 'business_logo', setting_value: '', updated_at: new Date().toISOString() },
        { onConflict: 'setting_key' })
    setSettings(s => ({ ...s, business_logo: '' }))
    setLogoPreview(null)
  }

  async function saveSettings() {
    setSaving(true)
    for (const [key, value] of Object.entries(settings)) {
      if (key === 'business_logo') continue
      await supabase.from('business_settings')
        .upsert({ setting_key: key, setting_value: value, updated_at: new Date().toISOString() },
          { onConflict: 'setting_key' })
    }
    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) return <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>⚙️ Business Settings</h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>
          Update your business details, contact numbers and JazzCash accounts. Changes reflect immediately in customer portal.
        </p>
      </div>

      {saved && (
        <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
          <p style={{ fontWeight: '700', color: '#1b5e20', margin: 0 }}>✅ Settings saved! Customers will see updated information immediately.</p>
        </div>
      )}

      {/* Logo Upload */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: '14px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>🖼️ Business Logo</p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* Logo Preview */}
          <div style={{
            width: '100px', height: '100px', borderRadius: '12px',
            border: '2px dashed #ddd', display: 'flex', alignItems: 'center',
            justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
            background: '#f8f9fa'
          }}>
            {logoPreview ? (
              <img src={logoPreview} alt="Business Logo"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontSize: '36px' }}>💧</span>
            )}
          </div>

          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '13px', color: '#555', margin: '0 0 10px' }}>
              Upload your business logo. It will appear on the customer portal and login screen.
              Max size: 2MB. Recommended: square image (PNG or JPG).
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => fileRef.current.click()} disabled={uploadingLogo}
                style={{
                  padding: '8px 16px', background: '#0f4c81', color: 'white',
                  border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600'
                }}>
                {uploadingLogo ? 'Uploading...' : '📁 Choose Image'}
              </button>
              {logoPreview && (
                <button onClick={removeLogo}
                  style={{
                    padding: '8px 16px', background: '#ffebee', color: '#c62828',
                    border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600'
                  }}>
                  🗑️ Remove
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*"
              onChange={handleLogoUpload} style={{ display: 'none' }} />
          </div>
        </div>
      </div>

      {/* All Other Settings */}
      {SETTINGS_CONFIG.map(section => (
        <div key={section.section} style={{
          background: 'white', borderRadius: '12px', padding: '20px',
          marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
        }}>
          <p style={{ fontSize: '14px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>
            {section.icon} {section.section}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {section.fields.map(field => (
              <div key={field.key}>
                <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>
                  {field.label}
                </label>
                <input
                  value={settings[field.key] || ''}
                  onChange={e => setSettings(s => ({ ...s, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  style={{
                    width: '100%', padding: '10px 14px', border: '1px solid #ddd',
                    borderRadius: '8px', fontSize: '14px', outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  onFocus={e => e.target.style.borderColor = '#0f4c81'}
                  onBlur={e => e.target.style.borderColor = '#ddd'}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Preview */}
      <div style={{ background: '#f0f7ff', border: '1px solid #c8e0ff', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81', marginBottom: '12px' }}>👁️ Preview — What customers will see</p>
        <div style={{ background: 'white', borderRadius: '10px', padding: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
            {logoPreview ? (
              <img src={logoPreview} alt="logo" style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'contain' }} />
            ) : (
              <span style={{ fontSize: '28px' }}>💧</span>
            )}
            <div>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: '0 0 2px' }}>{settings.business_name || '—'}</p>
              <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>{settings.business_tagline || '—'}</p>
            </div>
          </div>

          <div style={{ background: '#e8f5e9', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 8px' }}>📱 JazzCash Payment Details</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <div style={{ background: 'white', borderRadius: '6px', padding: '8px' }}>
                <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>Account 1</p>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 2px' }}>{settings.jazzcash_number_1 || '—'}</p>
                <p style={{ fontSize: '11px', color: '#555', margin: 0 }}>{settings.jazzcash_name_1 || '—'}</p>
              </div>
              <div style={{ background: 'white', borderRadius: '6px', padding: '8px' }}>
                <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px' }}>Account 2</p>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 2px' }}>{settings.jazzcash_number_2 || '—'}</p>
                <p style={{ fontSize: '11px', color: '#555', margin: 0 }}>{settings.jazzcash_name_2 || '—'}</p>
              </div>
            </div>
            <p style={{ fontSize: '11px', color: '#555', margin: 0 }}>
              After sending, share screenshot on WhatsApp: <strong>{settings.whatsapp_number || '—'}</strong>
            </p>
          </div>

          <p style={{ fontSize: '12px', color: '#555', margin: '0 0 4px' }}>📍 {settings.business_address || '—'}</p>
          <p style={{ fontSize: '12px', color: '#555', margin: '0 0 4px' }}>📞 Complaints: {settings.complaint_number || '—'}</p>
          <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>🚴 Delivery: {settings.delivery_number || '—'}</p>
        </div>
      </div>

      <button onClick={saveSettings} disabled={saving}
        style={{
          width: '100%', padding: '14px', background: '#0f4c81', color: 'white',
          border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700'
        }}>
        {saving ? 'Saving...' : '✓ Save All Settings'}
      </button>
    </div>
  )
}