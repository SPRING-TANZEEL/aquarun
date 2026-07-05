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
      { key: 'whatsapp_number', label: 'WhatsApp Number', placeholder: '03xx-xxxxxxx' },
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
      { key: 'jazzcash_name_2', label: 'Account Name 2', placeholder: 'Account holder name' },
    ]
  },
]

const MENU_ITEMS = [
  { key: 'business', icon: '🏢', label: 'Business Profile' },
  { key: 'backup', icon: '💾', label: 'Backup & Restore' },
  { key: 'export', icon: '📤', label: 'Data Export' },
  { key: 'import', icon: '📥', label: 'Import Customers' },
  { key: 'about', icon: 'ℹ️', label: 'About' },
]

export default function BusinessSettings() {
  const [activeMenu, setActiveMenu] = useState('business')
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoPreview, setLogoPreview] = useState(null)
  const fileRef = useRef()
  const importRef = useRef()
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    fetchSettings()
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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
    const { error: uploadError } = await supabase.storage.from('aquarun').upload(fileName, file, { upsert: true })
    if (uploadError) { alert('Upload error: ' + uploadError.message); setUploadingLogo(false); return }
    const { data: urlData } = supabase.storage.from('aquarun').getPublicUrl(fileName)
    const publicUrl = urlData.publicUrl
    await supabase.from('business_settings').upsert({ setting_key: 'business_logo', setting_value: publicUrl }, { onConflict: 'setting_key' })
    setSettings(s => ({ ...s, business_logo: publicUrl }))
    setLogoPreview(publicUrl)
    setUploadingLogo(false)
    alert('Logo uploaded successfully!')
  }

  async function removeLogo() {
    await supabase.from('business_settings').upsert({ setting_key: 'business_logo', setting_value: '' }, { onConflict: 'setting_key' })
    setSettings(s => ({ ...s, business_logo: '' }))
    setLogoPreview(null)
  }

  async function saveSettings() {
    setSaving(true)
    for (const [key, value] of Object.entries(settings)) {
      if (key === 'business_logo') continue
      await supabase.from('business_settings').upsert({ setting_key: key, setting_value: value }, { onConflict: 'setting_key' })
    }
    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 3000)
  }

  const inp = {
    width: '100%', padding: '10px 14px', border: '1.5px solid #e8eaed',
    borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
    background: 'white', transition: 'border-color 0.2s'
  }

  const card = {
    background: 'white', borderRadius: '12px', padding: '20px',
    marginBottom: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    border: '1px solid #f0f0f0'
  }

  if (loading) return <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>⚙️ Settings</h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Configure your AquaRun system</p>
      </div>

      <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>

        {/* ── SIDEBAR MENU ── */}
        <div style={{
          width: isMobile ? '100%' : '200px', flexShrink: 0,
          background: 'white', borderRadius: '12px', padding: '8px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0',
          display: isMobile ? 'flex' : 'block', flexWrap: 'wrap', gap: '4px'
        }}>
          {MENU_ITEMS.map(item => (
            <button key={item.key} onClick={() => setActiveMenu(item.key)}
              style={{
                width: isMobile ? 'auto' : '100%',
                padding: '10px 14px', border: 'none', borderRadius: '8px',
                cursor: 'pointer', textAlign: 'left', fontSize: '13px',
                display: 'flex', alignItems: 'center', gap: '10px',
                background: activeMenu === item.key ? '#f0f4ff' : 'transparent',
                color: activeMenu === item.key ? '#0f4c81' : '#555',
                fontWeight: activeMenu === item.key ? '700' : '400',
                borderLeft: !isMobile && activeMenu === item.key ? '3px solid #0f4c81' : '3px solid transparent',
              }}>
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* ── CONTENT ── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* ── BUSINESS PROFILE ── */}
          {activeMenu === 'business' && (
            <div>
              {saved && (
                <div style={{ background: '#e8f5e9', border: '1px solid #4caf50', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
                  <p style={{ fontWeight: '700', color: '#1b5e20', margin: 0 }}>✅ Settings saved successfully!</p>
                </div>
              )}

              {/* Logo */}
              <div style={card}>
                <p style={{ fontSize: '14px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>🖼️ Business Logo</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <div style={{ width: '80px', height: '80px', borderRadius: '12px', border: '2px dashed #ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, background: '#f8f9fa' }}>
                    {logoPreview ? <img src={logoPreview} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: '28px' }}>💧</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '12px', color: '#888', margin: '0 0 10px' }}>Square image recommended. Max 2MB. PNG or JPG.</p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => fileRef.current.click()} disabled={uploadingLogo}
                        style={{ padding: '8px 14px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                        {uploadingLogo ? 'Uploading...' : '📁 Choose Image'}
                      </button>
                      {logoPreview && (
                        <button onClick={removeLogo}
                          style={{ padding: '8px 14px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                          🗑️ Remove
                        </button>
                      )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                  </div>
                </div>
              </div>

              {/* All Settings Sections */}
              {SETTINGS_CONFIG.map(section => (
                <div key={section.section} style={card}>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>
                    {section.icon} {section.section}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {section.fields.map(field => (
                      <div key={field.key}>
                        <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>{field.label}</label>
                        <input value={settings[field.key] || ''} onChange={e => setSettings(s => ({ ...s, [field.key]: e.target.value }))}
                          placeholder={field.placeholder} style={inp}
                          onFocus={e => e.target.style.borderColor = '#0f4c81'}
                          onBlur={e => e.target.style.borderColor = '#e8eaed'} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <button onClick={saveSettings} disabled={saving}
                style={{ width: '100%', padding: '14px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
                {saving ? 'Saving...' : '✓ Save All Settings'}
              </button>
            </div>
          )}

          {/* ── BACKUP & RESTORE ── */}
          {activeMenu === 'backup' && <BackupRestore settings={settings} />}

          {/* ── DATA EXPORT ── */}
          {activeMenu === 'export' && <DataExport />}

          {/* ── IMPORT CUSTOMERS ── */}
          {activeMenu === 'import' && <ImportCustomers />}

          {/* ── ABOUT ── */}
          {activeMenu === 'about' && (
            <div style={card}>
              <div style={{ padding: '8px 0' }}>
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <div style={{ fontSize: '56px', marginBottom: '10px' }}>💧</div>
                  <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#0f4c81', margin: '0 0 4px' }}>AquaRun</h2>
                  <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Water Delivery Management System</p>
                </div>

                <p style={{ fontSize: '11px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Software Information</p>
                {[
                  ['Software', 'AquaRun v1.0'],
                  ['Platform', 'Web App + PWA'],
                  ['Database', 'Supabase (PostgreSQL)'],
                  ['Frontend', 'React + Vite'],
                  ['Hosting', 'Vercel'],
                  ['Currency', 'PKR'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <span style={{ fontSize: '13px', color: '#888' }}>{k}</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#333' }}>{v}</span>
                  </div>
                ))}

                <p style={{ fontSize: '11px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '20px 0 8px' }}>Developer & Support</p>
                {[
                  ['Built by', 'Muhammad Tanzeel Ur Rehman'],
                  ['Qualification', 'CMA — Chartered Management Accountant'],
                  ['Organization', 'LESCO — Lahore Electric Supply Company'],
                  ['Support Email', 'mian.tanzeel62@gmail.com'],
                  ['Contact', '0323-7919338'],
                  ['WhatsApp', '0309-7621882'],
                  ['Business', 'Spring Water Kamoke'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <span style={{ fontSize: '13px', color: '#888' }}>{k}</span>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#333', textAlign: 'right', maxWidth: '60%' }}>{v}</span>
                  </div>
                ))}

                <div style={{ marginTop: '20px', background: '#f0f7ff', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                  <p style={{ fontSize: '12px', color: '#0f4c81', fontWeight: '600', margin: '0 0 4px' }}>Need help or support?</p>
                  <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Contact Muhammad Tanzeel on WhatsApp: <strong>0309-7621882</strong></p>
                </div>

                <p style={{ fontSize: '11px', color: '#aaa', textAlign: 'center', margin: '16px 0 0' }}>© 2026 AquaRun — Built by Muhammad Tanzeel Ur Rehman</p>
              </div>
            </div>
          )}

// ── BACKUP & RESTORE ─────────────────────────────────────────────────
function BackupRestore({ settings }) {
  const [backing, setBacking] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [backupHistory, setBackupHistory] = useState([])
  const restoreRef = useRef()

  useEffect(() => {
    const history = JSON.parse(localStorage.getItem('aquarun_backup_history') || '[]')
    setBackupHistory(history)
  }, [])

  async function downloadBackup() {
    setBacking(true)
    try {
      const tables = [
        'customers', 'riders', 'orders', 'deliveries', 'payments',
        'expenses', 'office_expenses', 'cash_transfers', 'salary_advances',
        'salary_payments', 'stock_purchases', 'products', 'production_entries',
        'owner_transactions', 'ceo_account_transfers', 'chart_of_accounts',
        'journal_entries', 'journal_entry_lines', 'business_settings'
      ]

      const backup = {
        version: '1.0.0',
        app: 'AquaRun',
        business: settings.business_name || 'AquaRun',
        created_at: new Date().toISOString(),
        tables: {}
      }

      let totalRecords = 0
      for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*')
        if (!error) {
          backup.tables[table] = data || []
          totalRecords += (data || []).length
        }
      }

      backup.total_records = totalRecords

      // Download as JSON file
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `AquaRun_Backup_${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)

      // Save to history
      const history = JSON.parse(localStorage.getItem('aquarun_backup_history') || '[]')
      history.unshift({
        date: new Date().toISOString(),
        records: totalRecords,
        type: 'Manual'
      })
      const trimmed = history.slice(0, 10)
      localStorage.setItem('aquarun_backup_history', JSON.stringify(trimmed))
      setBackupHistory(trimmed)

    } catch (err) {
      alert('Backup failed: ' + err.message)
    }
    setBacking(false)
  }

  async function restoreBackup(e) {
    const file = e.target.files[0]
    if (!file) return

    const confirmed = window.confirm(
      '⚠️ WARNING: Restoring will REPLACE all existing data with backup data.\n\n' +
      'This cannot be undone. Are you sure you want to continue?'
    )
    if (!confirmed) return

    setRestoring(true)
    try {
      const text = await file.text()
      const backup = JSON.parse(text)

      if (!backup.tables || !backup.version) {
        alert('Invalid backup file. Please select a valid AquaRun backup.')
        setRestoring(false)
        return
      }

      // Restore tables in correct order (respect foreign keys)
      const restoreOrder = [
        'business_settings', 'chart_of_accounts', 'riders', 'products',
        'customers', 'orders', 'deliveries', 'payments', 'expenses',
        'office_expenses', 'cash_transfers', 'salary_advances', 'salary_payments',
        'stock_purchases', 'production_entries', 'owner_transactions',
        'ceo_account_transfers', 'journal_entries', 'journal_entry_lines'
      ]

      for (const table of restoreOrder) {
        if (!backup.tables[table] || backup.tables[table].length === 0) continue
        // Delete existing
        await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
        // Insert backup data in chunks
        const chunks = []
        for (let i = 0; i < backup.tables[table].length; i += 100) {
          chunks.push(backup.tables[table].slice(i, i + 100))
        }
        for (const chunk of chunks) {
          await supabase.from(table).insert(chunk)
        }
      }

      alert(`✅ Restore complete! ${backup.total_records} records restored from backup dated ${new Date(backup.created_at).toLocaleDateString('en-PK')}.`)
      window.location.reload()

    } catch (err) {
      alert('Restore failed: ' + err.message)
    }
    setRestoring(false)
  }

  const lastBackup = backupHistory[0]

  return (
    <div>
      {/* Last Backup Status */}
      <div style={{
        background: lastBackup ? '#e8f5e9' : '#fff3e0',
        border: `1px solid ${lastBackup ? '#c8e6c9' : '#ffe082'}`,
        borderRadius: '12px', padding: '16px', marginBottom: '16px',
        display: 'flex', alignItems: 'center', gap: '12px'
      }}>
        <span style={{ fontSize: '28px' }}>{lastBackup ? '✅' : '⚠️'}</span>
        <div>
          <p style={{ fontSize: '14px', fontWeight: '700', color: lastBackup ? '#1a7a4a' : '#e65100', margin: '0 0 2px' }}>
            {lastBackup
              ? `Last backup ${Math.floor((Date.now() - new Date(lastBackup.date)) / 86400000)} days ago`
              : 'No backup taken yet'}
          </p>
          <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>
            {lastBackup
              ? `Your data is protected · ${lastBackup.records} records`
              : 'Take your first backup now to protect your data'}
          </p>
        </div>
      </div>

      {/* Full Backup */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ width: '48px', height: '48px', background: '#e3f0ff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>
            💾
          </div>
          <div>
            <p style={{ fontSize: '15px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>Full Database Backup</p>
            <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
              Exports all tables including customers, deliveries, payments, accounting entries, riders and settings.
              Downloads as a JSON file to your device.
            </p>
          </div>
        </div>
        <button onClick={downloadBackup} disabled={backing}
          style={{ width: '100%', padding: '14px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          {backing ? '⏳ Creating Backup...' : '⬇️ Download Full Backup Now'}
        </button>
      </div>

      {/* Restore */}
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #ffebee' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div style={{ width: '48px', height: '48px', background: '#ffebee', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>
            🔄
          </div>
          <div>
            <p style={{ fontSize: '15px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>Restore from Backup</p>
            <p style={{ fontSize: '12px', color: '#888', margin: '0 0 4px' }}>
              Upload a previously downloaded backup file to restore all your data.
            </p>
            <p style={{ fontSize: '11px', color: '#f44336', fontWeight: '600', margin: 0 }}>
              ⚠️ Warning: This will replace ALL current data with the backup data.
            </p>
          </div>
        </div>
        <button onClick={() => restoreRef.current.click()} disabled={restoring}
          style={{ width: '100%', padding: '14px', background: '#ffebee', color: '#c62828', border: '2px solid #ffcdd2', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>
          {restoring ? '⏳ Restoring...' : '📂 Upload Backup File to Restore'}
        </button>
        <input ref={restoreRef} type="file" accept=".json" onChange={restoreBackup} style={{ display: 'none' }} />
      </div>

      {/* Best Practices */}
      <div style={{ background: '#f0f7ff', border: '1px solid #c8d8ff', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81', margin: '0 0 10px' }}>💡 Best Practices for Free Plan</p>
        {[
          'Take a backup every Sunday before closing',
          'Always backup before adding a large batch of new customers',
          'Save backup files in Google Drive or WhatsApp to yourself',
          'Keep at least 4 weeks of backup files',
          'Backup before making major changes to settings',
        ].map(tip => (
          <p key={tip} style={{ fontSize: '12px', color: '#555', margin: '0 0 6px', display: 'flex', gap: '8px' }}>
            <span style={{ color: '#0f4c81', fontWeight: '700' }}>•</span> {tip}
          </p>
        ))}
      </div>

      {/* Backup History */}
      {backupHistory.length > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Backup History</p>
          {backupHistory.map((b, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>✅</span>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: '#333', margin: '0 0 2px' }}>Manual Backup</p>
                  <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>
                    {new Date(b.date).toLocaleString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · {b.records} records
                  </p>
                </div>
              </div>
              <span style={{ fontSize: '11px', background: '#f0f0f0', color: '#888', padding: '3px 10px', borderRadius: '20px' }}>Manual</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── DATA EXPORT ──────────────────────────────────────────────────────
function DataExport() {
  const [exporting, setExporting] = useState(null)

  const EXPORT_TABLES = [
    { key: 'customers', label: 'Customers', desc: 'All customer records with balances' },
    { key: 'deliveries', label: 'Deliveries', desc: 'All delivery records' },
    { key: 'payments', label: 'Payments', desc: 'All payment records' },
    { key: 'expenses', label: 'Rider Expenses', desc: 'All rider expense records' },
    { key: 'office_expenses', label: 'Office Expenses', desc: 'All office expense records' },
    { key: 'cash_transfers', label: 'Cash Transfers', desc: 'All transfer records' },
    { key: 'salary_advances', label: 'Salary Advances', desc: 'All advance records' },
    { key: 'salary_payments', label: 'Salary Payments', desc: 'All salary payment records' },
    { key: 'journal_entries', label: 'Journal Entries', desc: 'All accounting entries' },
    { key: 'journal_entry_lines', label: 'Journal Lines', desc: 'Detailed accounting lines' },
    { key: 'riders', label: 'Riders', desc: 'All rider records' },
  ]

  async function exportCSV(table, label) {
    setExporting(table)
    try {
      const { data, error } = await supabase.from(table).select('*')
      if (error) throw error
      if (!data || data.length === 0) { alert('No data found in ' + label); setExporting(null); return }

      // Convert to CSV
      const headers = Object.keys(data[0])
      const csvRows = [
        headers.join(','),
        ...data.map(row =>
          headers.map(h => {
            const val = row[h]
            if (val === null || val === undefined) return ''
            const str = String(val)
            return str.includes(',') || str.includes('"') || str.includes('\n')
              ? `"${str.replace(/"/g, '""')}"`
              : str
          }).join(',')
        )
      ]
      const csv = csvRows.join('\n')

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `AquaRun_${label}_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Export failed: ' + err.message)
    }
    setExporting(null)
  }

  async function exportAll() {
    setExporting('all')
    for (const t of EXPORT_TABLES) {
      await exportCSV(t.key, t.label)
      await new Promise(r => setTimeout(r, 300))
    }
    setExporting(null)
  }

  return (
    <div>
      <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}>
        <p style={{ fontSize: '15px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>Data Export</p>
        <p style={{ fontSize: '12px', color: '#888', margin: '0 0 16px' }}>Export your data as CSV files — opens in Excel or Google Sheets</p>

        <button onClick={exportAll} disabled={exporting === 'all'}
          style={{ width: '100%', padding: '12px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '700', marginBottom: '16px' }}>
          {exporting === 'all' ? '⏳ Exporting All...' : '⬇️ Export All Tables'}
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {EXPORT_TABLES.map(t => (
            <div key={t.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
              <div>
                <p style={{ fontSize: '13px', fontWeight: '600', color: '#333', margin: '0 0 2px' }}>{t.label}</p>
                <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{t.desc}</p>
              </div>
              <button onClick={() => exportCSV(t.key, t.label)} disabled={exporting === t.key}
                style={{ padding: '7px 16px', background: '#f0f7ff', color: '#0f4c81', border: '1px solid #c8d8ff', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {exporting === t.key ? '⏳' : '⬇️'} Export
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── IMPORT CUSTOMERS ─────────────────────────────────────────────────
function ImportCustomers() {
  const [step, setStep] = useState(1)
  const [importing, setImporting] = useState(false)
  const [preview, setPreview] = useState([])
  const [errors, setErrors] = useState([])
  const [imported, setImported] = useState(0)
  const fileRef = useRef()

  function downloadTemplate() {
    const headers = ['full_name', 'mobile', 'customer_code', 'rate_19l', 'rate_half_litre', 'rate_1_5l', 'opening_balance', 'address', 'google_maps_link']
    const sample = [
      ['Ahmed Khan', '0300-1234567', 'C001', '100', '0', '0', '0', 'House 12 Street 4 Kamoke', ''],
      ['Sara Bibi', '0311-9876543', 'C002', '120', '50', '0', '500', 'House 5 Main Road Kamoke', ''],
    ]
    const csv = [headers.join(','), ...sample.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'AquaRun_Customer_Import_Template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0]
    if (!file) return

    const text = await file.text()
    const lines = text.trim().split('\n')
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
    const rows = []
    const errs = []

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''))
      const row = {}
      headers.forEach((h, idx) => { row[h] = values[idx] || '' })

      // Validate
      if (!row.full_name) { errs.push(`Row ${i}: full_name is required`); continue }
      if (!row.mobile) { errs.push(`Row ${i}: mobile is required`); continue }

      rows.push({
        full_name: row.full_name,
        mobile: row.mobile,
        customer_code: row.customer_code || `C${String(i).padStart(3, '0')}`,
        rate_19l: Number(row.rate_19l) || 100,
        rate_half_litre: Number(row.rate_half_litre) || 0,
        rate_1_5l: Number(row.rate_1_5l) || 0,
        opening_balance: Number(row.opening_balance) || 0,
        balance: Number(row.opening_balance) || 0,
        address: row.address || '',
        google_maps_link: row.google_maps_link || '',
        is_active: true,
      })
    }

    setErrors(errs)
    setPreview(rows)
    setStep(2)
  }

  async function importCustomers() {
    setImporting(true)
    let count = 0
    const chunks = []
    for (let i = 0; i < preview.length; i += 50) chunks.push(preview.slice(i, i + 50))

    for (const chunk of chunks) {
      const { error } = await supabase.from('customers').insert(chunk)
      if (!error) count += chunk.length
    }

    // Update COA receivables
    try {
      const { data: allCustomers } = await supabase.from('customers').select('opening_balance').eq('is_active', true)
      const totalReceivable = allCustomers?.reduce((s, c) => s + Math.max(0, Number(c.opening_balance || 0)), 0) || 0
      await supabase.from('chart_of_accounts').update({ opening_balance: totalReceivable }).eq('account_code', '1100')
    } catch (err) { console.error('COA update error:', err) }

    setImported(count)
    setStep(3)
    setImporting(false)
  }

  return (
    <div>
      {/* Steps */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}>
        {[
          { n: 1, label: 'Download Template' },
          { n: 2, label: 'Upload & Preview' },
          { n: 3, label: 'Done' },
        ].map((s, i) => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: step >= s.n ? '#0f4c81' : '#f0f0f0',
                color: step >= s.n ? 'white' : '#888', fontSize: '12px', fontWeight: '700', flexShrink: 0
              }}>{s.n}</div>
              <span style={{ fontSize: '11px', color: step >= s.n ? '#0f4c81' : '#888', fontWeight: step === s.n ? '700' : '400' }}>{s.label}</span>
            </div>
            {i < 2 && <div style={{ flex: 1, height: '1px', background: step > s.n ? '#0f4c81' : '#e0e0e0', margin: '0 8px' }} />}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}>
          <p style={{ fontSize: '15px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>Step 1 — Download the Excel Template</p>
          <p style={{ fontSize: '12px', color: '#888', margin: '0 0 16px' }}>
            Download the CSV template, fill in your customer data in Excel or Google Sheets, then upload it.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
            {[
              { icon: '👤', label: 'Customer Name', color: '#e3f0ff' },
              { icon: '📱', label: 'Mobile Number', color: '#e8f5e9' },
              { icon: '💰', label: 'Opening Balance', color: '#fff3e0' },
            ].map(c => (
              <div key={c.label} style={{ background: c.color, borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', marginBottom: '6px' }}>{c.icon}</div>
                <p style={{ fontSize: '11px', fontWeight: '600', color: '#333', margin: 0 }}>{c.label}</p>
              </div>
            ))}
          </div>

          <div style={{ background: '#fff3e0', border: '1px solid #ffe082', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: '#e65100', margin: '0 0 8px' }}>Important tips before filling:</p>
            {[
              'customer_code must be unique (C001, C002, etc.)',
              'mobile must be filled for every customer',
              'opening_balance is amount customer already owes you',
              'rate_19l is price per 19L bottle in Rs.',
              'Delete the sample rows before uploading',
            ].map(tip => (
              <p key={tip} style={{ fontSize: '11px', color: '#795548', margin: '0 0 4px' }}>• {tip}</p>
            ))}
          </div>

          <button onClick={downloadTemplate}
            style={{ width: '100%', padding: '14px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '700', marginBottom: '10px' }}>
            ⬇️ Download Customer Import Template
          </button>
          <button onClick={() => fileRef.current.click()}
            style={{ width: '100%', padding: '14px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>
            📂 Upload Filled CSV File
          </button>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
        </div>
      )}

      {/* Step 2 — Preview */}
      {step === 2 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}>
          <p style={{ fontSize: '15px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>Step 2 — Preview Data</p>
          <p style={{ fontSize: '12px', color: '#888', margin: '0 0 16px' }}>{preview.length} customers ready to import</p>

          {errors.length > 0 && (
            <div style={{ background: '#ffebee', border: '1px solid #ffcdd2', borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>
              <p style={{ fontSize: '12px', fontWeight: '700', color: '#c62828', margin: '0 0 6px' }}>⚠️ {errors.length} rows skipped due to errors:</p>
              {errors.slice(0, 5).map((e, i) => <p key={i} style={{ fontSize: '11px', color: '#f44336', margin: '0 0 2px' }}>• {e}</p>)}
              {errors.length > 5 && <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>...and {errors.length - 5} more</p>}
            </div>
          )}

          {/* Preview table */}
          <div style={{ overflowX: 'auto', marginBottom: '16px', border: '1px solid #eee', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#0f4c81', color: 'white' }}>
                  {['#', 'Name', 'Mobile', 'Code', 'Rate 19L', 'Opening Bal'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: '600' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 10).map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '8px 10px', color: '#888' }}>{i + 1}</td>
                    <td style={{ padding: '8px 10px', fontWeight: '600' }}>{r.full_name}</td>
                    <td style={{ padding: '8px 10px', color: '#555' }}>{r.mobile}</td>
                    <td style={{ padding: '8px 10px', color: '#0f4c81', fontWeight: '600' }}>{r.customer_code}</td>
                    <td style={{ padding: '8px 10px' }}>Rs. {r.rate_19l}</td>
                    <td style={{ padding: '8px 10px', color: r.opening_balance > 0 ? '#f44336' : '#888' }}>
                      Rs. {r.opening_balance.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 10 && <p style={{ padding: '8px 12px', fontSize: '11px', color: '#888', borderTop: '1px solid #f0f0f0' }}>...and {preview.length - 10} more customers</p>}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => { setStep(1); setPreview([]); setErrors([]) }}
              style={{ flex: 1, padding: '12px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px' }}>
              ← Back
            </button>
            <button onClick={importCustomers} disabled={importing || preview.length === 0}
              style={{ flex: 2, padding: '12px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>
              {importing ? '⏳ Importing...' : `✓ Import ${preview.length} Customers`}
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Done */}
      {step === 3 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '40px 20px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: '56px', marginBottom: '16px' }}>🎉</div>
          <p style={{ fontSize: '20px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 8px' }}>Import Complete!</p>
          <p style={{ fontSize: '14px', color: '#555', margin: '0 0 24px' }}>
            {imported} customers imported successfully. Their opening balances have been added to your accounts receivable.
          </p>
          <button onClick={() => { setStep(1); setPreview([]); setErrors([]); setImported(0) }}
            style={{ padding: '12px 32px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>
            Import More Customers
          </button>
        </div>
      )}
    </div>
  )
}