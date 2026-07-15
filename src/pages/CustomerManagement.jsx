import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import * as XLSX from 'xlsx'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_LABELS = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' }

export default function CustomerManagement({ tenantId }) {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('list') // 'list' | 'import'
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
    is_active: true,
    schedule_active: false,
    delivery_days: [],
    default_qty_19l: 1,
    default_qty_half: 0,
    default_qty_1_5l: 0,
    is_tax_applicable: false,
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState({})

  // Import state
  const [importRows, setImportRows] = useState([])
  const [importErrors, setImportErrors] = useState([])
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => { if (tenantId) fetchCustomers() }, [tenantId])

  async function fetchCustomers() {
    setLoading(true)
    const { data } = await supabase.from('customers')
      .select('*').eq('tenant_id', tenantId).order('full_name')
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
      is_active: true, schedule_active: false,
      delivery_days: [], default_qty_19l: 1,
      default_qty_half: 0, default_qty_1_5l: 0,
      is_tax_applicable: false,
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
      is_active: c.is_active,
      schedule_active: c.schedule_active || false,
      delivery_days: c.delivery_days || [],
      default_qty_19l: Number(c.default_qty_19l) || 1,
      default_qty_half: Number(c.default_qty_half) || 0,
      default_qty_1_5l: Number(c.default_qty_1_5l) || 0,
      is_tax_applicable: c.is_tax_applicable || false,
      notes: c.notes || '',
    })
    setShowForm(true)
  }

  function toggleDay(day) {
    const days = form.delivery_days || []
    if (days.includes(day)) {
      setForm(f => ({ ...f, delivery_days: days.filter(d => d !== day) }))
    } else {
      setForm(f => ({ ...f, delivery_days: [...days, day] }))
    }
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
      schedule_active: form.schedule_active || false,
      delivery_days: form.delivery_days || [],
      default_qty_19l: Number(form.default_qty_19l) || 1,
      default_qty_half: Number(form.default_qty_half) || 0,
      default_qty_1_5l: Number(form.default_qty_1_5l) || 0,
      is_tax_applicable: form.is_tax_applicable || false,
    }

    if (editCustomer) {
      const { data: deliveryData } = await supabase.from('deliveries')
        .select('credit_amount, total_amount, payment_method, jazzcash_confirmed')
        .eq('customer_id', editCustomer.id).eq('tenant_id', tenantId).eq('is_voided', false)

      const { data: paymentData } = await supabase.from('payments')
        .select('amount, payment_method, jazzcash_confirmed')
        .eq('customer_id', editCustomer.id).eq('tenant_id', tenantId).eq('is_voided', false)

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
        ...cleanForm, balance, updated_at: new Date().toISOString()
      }).eq('id', editCustomer.id).eq('tenant_id', tenantId)

      if (error) { alert('Error: ' + error.message); setSaving(false); return }
      alert('Customer updated!')
    } else {
      const customerCode = 'AQ-' + Math.floor(10000 + Math.random() * 90000)
      const { data: savedCustomer, error } = await supabase.from('customers').insert([{
        ...cleanForm, tenant_id: tenantId, customer_code: customerCode,
        balance: Number(form.opening_balance) || 0,
        our_bottles_placed: Number(form.our_bottles_placed) || 0,
      }]).select().single()

      if (error) { alert('Error: ' + error.message); setSaving(false); return }

      if (Number(form.opening_balance) !== 0) {
        try {
          const { postCustomerOpeningBalanceJournal } = await import('../accountingEngine')
          await postCustomerOpeningBalanceJournal(savedCustomer, tenantId)
        } catch (err) { console.error('Opening balance journal error:', err) }
      }

      alert(`Customer added!\n\nCustomer ID: ${customerCode}\nPassword: ${form.customer_password}\n\nShare these with the customer for app login.`)
    }

    setShowForm(false)
    setEditCustomer(null)
    fetchCustomers()
    setSaving(false)
  }

  async function toggleActive(c) {
    await supabase.from('customers').update({ is_active: !c.is_active }).eq('id', c.id).eq('tenant_id', tenantId)
    fetchCustomers()
  }

  async function resetPassword(c) {
    const newPass = generatePassword()
    await supabase.from('customers').update({ customer_password: newPass, password_plain: newPass }).eq('id', c.id).eq('tenant_id', tenantId)
    alert(`New password for ${c.full_name}:\n\nPassword: ${newPass}\n\nShare this with the customer.`)
    fetchCustomers()
  }

  function getBalanceDisplay(customer) {
    const balance = Number(customer.balance || 0)
    if (balance > 0) return { label: `Rs. ${balance.toLocaleString()} owed`, color: '#f44336', bg: '#ffebee' }
    if (balance < 0) return { label: `Rs. ${Math.abs(balance).toLocaleString()} advance`, color: '#1a7a4a', bg: '#e8f5e9' }
    return { label: 'Clear', color: '#1a7a4a', bg: '#e8f5e9' }
  }

  // ── IMPORT FUNCTIONS ──────────────────────────────────────────────

  function downloadTemplate() {
    const headers = [
      'full_name', 'mobile', 'address',
      'rate_19l', 'rate_half_litre', 'rate_1_5l',
      'opening_balance', 'our_bottles_placed', 'own_bottles'
    ]
    const sample = [
      ['Ahmed Khan', '03001234567', 'House 12, Street 5, Kamoke',
        100, 0, 0, 500, 2, 0],
      ['Sara Bibi', '03211234567', 'Near Masjid, Main Bazar',
        120, 200, 0, 0, 1, 1],
      ['Govt Hospital', '03331234567', 'Civil Hospital Road',
        100, 0, 0, 2400, 5, 0],
    ]
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sample])
    ws['!cols'] = headers.map((h, i) => ({ wch: i < 3 ? 25 : 15 }))
    // Add header styling notes
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Customers')
    XLSX.writeFile(wb, 'AquaRun_Customer_Import_Template.xlsx')
  }

  function handleFileUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        validateAndPreview(rows)
      } catch (err) {
        alert('Error reading file: ' + err.message)
      }
    }
    reader.readAsBinaryString(file)
  }

  function validateAndPreview(rows) {
    const errors = []
    const validated = rows.map((row, idx) => {
      const rowNum = idx + 2 // +2 for header row and 1-based
      const name = String(row.full_name || '').trim()
      const mobile = String(row.mobile || '').trim()
      if (!name) errors.push(`Row ${rowNum}: full_name is required`)
      if (!mobile) errors.push(`Row ${rowNum}: mobile is required`)
      return {
        full_name: name,
        mobile: mobile,
        address: String(row.address || '').trim(),
        rate_19l: Number(row.rate_19l) || 100,
        rate_half_litre: Number(row.rate_half_litre) || 0,
        rate_1_5l: Number(row.rate_1_5l) || 0,
        opening_balance: Number(row.opening_balance) || 0,
        our_bottles_placed: Number(row.our_bottles_placed) || 0,
        own_bottles: Number(row.own_bottles) || 0,
        _valid: !!name && !!mobile,
        _rowNum: rowNum,
      }
    })
    setImportErrors(errors)
    setImportRows(validated)
    setImportDone(null)
  }

  async function runImport() {
    const validRows = importRows.filter(r => r._valid)
    if (validRows.length === 0) return alert('No valid rows to import')
    setImporting(true)
    let success = 0, failed = 0
    const today = new Date().toISOString().split('T')[0]

    for (const row of validRows) {
      try {
        const customerCode = 'AQ-' + Math.floor(10000 + Math.random() * 90000)
        const password = row.mobile.slice(-4) || generatePassword()

        const { data: saved, error } = await supabase.from('customers').insert([{
          tenant_id: tenantId,
          customer_code: customerCode,
          full_name: row.full_name,
          mobile: row.mobile,
          address: row.address,
          rate_19l: row.rate_19l,
          rate_half_litre: row.rate_half_litre,
          rate_1_5l: row.rate_1_5l,
          opening_balance: row.opening_balance,
          our_bottles_placed: row.our_bottles_placed,
          own_bottles: row.own_bottles,
          balance: row.opening_balance,
          customer_password: password,
          password_plain: password,
          is_active: true,
          schedule_active: false,
          delivery_days: [],
          default_qty_19l: 1,
          default_qty_half: 0,
          default_qty_1_5l: 0,
          is_tax_applicable: false,
        }]).select().single()

        if (error) { failed++; continue }

        // Post opening balance journal
        if (row.opening_balance !== 0) {
          try {
            const { postCustomerOpeningBalanceJournal } = await import('../accountingEngine')
            await postCustomerOpeningBalanceJournal(saved, tenantId)
          } catch (err) { console.error('Journal error for', row.full_name) }
        }

        success++
      } catch (err) {
        failed++
      }
    }

    setImportDone({ success, failed })
    setImporting(false)
    fetchCustomers()
    if (fileRef.current) fileRef.current.value = ''
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
      filter === 'clear' ? balance === 0 :
      filter === 'scheduled' ? c.schedule_active : true
    return matchSearch && matchFilter
  })

  const inp = { width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }
  const totalReceivable = customers.filter(c => Number(c.balance) > 0).reduce((s, c) => s + Number(c.balance), 0)
  const totalAdvance = customers.filter(c => Number(c.balance) < 0).reduce((s, c) => s + Math.abs(Number(c.balance)), 0)
  const scheduledCount = customers.filter(c => c.schedule_active).length

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', color: '#333' }}>Customer Management</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => { setActiveTab('import'); setShowForm(false) }}
            style={{ padding: '10px 16px', background: activeTab === 'import' ? '#1a7a4a' : '#f0f0f0', color: activeTab === 'import' ? 'white' : '#555', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
            📥 Import
          </button>
          <button onClick={() => { setActiveTab('list'); openAddForm() }}
            style={{ padding: '10px 20px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
            + Add Customer
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
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
        <div style={{ background: 'white', borderRadius: '10px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #f59e0b' }}>
          <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px', textTransform: 'uppercase' }}>Scheduled</p>
          <p style={{ fontSize: '22px', fontWeight: '700', color: '#f59e0b', margin: 0 }}>{scheduledCount}</p>
        </div>
      </div>

      {/* ── IMPORT TAB ── */}
      {activeTab === 'import' && (
        <div>
          {/* Instructions */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#0f4c81', margin: '0 0 12px' }}>📥 Bulk Import Customers</h3>

            <div style={{ background: '#f0f7ff', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81', margin: '0 0 8px' }}>📋 Excel Template Columns:</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {[
                  { col: 'full_name', note: 'Required — customer full name' },
                  { col: 'mobile', note: 'Required — 03xx-xxxxxxx' },
                  { col: 'address', note: 'Optional — delivery address' },
                  { col: 'rate_19l', note: 'Optional — default 100' },
                  { col: 'rate_half_litre', note: 'Optional — default 0' },
                  { col: 'rate_1_5l', note: 'Optional — default 0' },
                  { col: 'opening_balance', note: 'Optional — positive = owes you' },
                  { col: 'our_bottles_placed', note: 'Optional — our bottles at customer' },
                  { col: 'own_bottles', note: "Optional — customer's own bottles" },
                ].map(c => (
                  <div key={c.col} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: '#0f4c81', background: '#e3f0ff', padding: '2px 8px', borderRadius: '4px', flexShrink: 0 }}>{c.col}</span>
                    <span style={{ fontSize: '11px', color: '#666' }}>{c.note}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: '#e8f5e9', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px' }}>
              <p style={{ fontSize: '12px', color: '#1a7a4a', margin: 0, fontWeight: '600' }}>
                ✅ Auto-generated: Customer ID (AQ-XXXXX), Password (last 4 digits of mobile), Balance from opening_balance, Journal entry for opening balance
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={downloadTemplate}
                style={{ padding: '10px 20px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                ⬇️ Download Template
              </button>
              <span style={{ fontSize: '13px', color: '#888' }}>then fill it and upload below</span>
            </div>
          </div>

          {/* File Upload */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: '0 0 12px' }}>📂 Upload Excel File</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload}
              style={{ width: '100%', padding: '12px', border: '2px dashed #ddd', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', boxSizing: 'border-box' }} />
          </div>

          {/* Preview */}
          {importRows.length > 0 && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <p style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: 0 }}>
                  👀 Preview — {importRows.filter(r => r._valid).length} valid / {importRows.length} total rows
                </p>
                {importErrors.length > 0 && (
                  <span style={{ fontSize: '12px', color: '#f44336', fontWeight: '600' }}>
                    ⚠️ {importErrors.length} errors
                  </span>
                )}
              </div>

              {importErrors.length > 0 && (
                <div style={{ background: '#ffebee', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
                  {importErrors.map((e, i) => (
                    <p key={i} style={{ fontSize: '12px', color: '#c62828', margin: '2px 0', fontWeight: '600' }}>⚠️ {e}</p>
                  ))}
                </div>
              )}

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#f8f9fa' }}>
                      {['#', 'Status', 'Name', 'Mobile', 'Address', 'Rate 19L', 'Opening Bal', 'Our Bottles', 'Own Bottles'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#666', fontWeight: '600', borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f5f5f5', background: row._valid ? 'white' : '#fff5f5' }}>
                        <td style={{ padding: '8px 10px', color: '#888' }}>{row._rowNum}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: '600', background: row._valid ? '#e8f5e9' : '#ffebee', color: row._valid ? '#1a7a4a' : '#c62828' }}>
                            {row._valid ? '✓ OK' : '✗ Error'}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: '600' }}>{row.full_name || '—'}</td>
                        <td style={{ padding: '8px 10px' }}>{row.mobile || '—'}</td>
                        <td style={{ padding: '8px 10px', color: '#888', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.address || '—'}</td>
                        <td style={{ padding: '8px 10px' }}>Rs. {row.rate_19l}</td>
                        <td style={{ padding: '8px 10px', color: row.opening_balance > 0 ? '#f44336' : row.opening_balance < 0 ? '#1a7a4a' : '#888', fontWeight: row.opening_balance !== 0 ? '700' : '400' }}>
                          {row.opening_balance !== 0 ? `Rs. ${row.opening_balance.toLocaleString()}` : '—'}
                        </td>
                        <td style={{ padding: '8px 10px' }}>{row.our_bottles_placed || '—'}</td>
                        <td style={{ padding: '8px 10px' }}>{row.own_bottles || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {importDone ? (
                <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '14px 16px', marginTop: '14px' }}>
                  <p style={{ fontWeight: '700', color: '#1b5e20', margin: '0 0 4px' }}>✅ Import Complete!</p>
                  <p style={{ fontSize: '13px', color: '#2e7d32', margin: 0 }}>
                    {importDone.success} customers imported successfully
                    {importDone.failed > 0 ? ` · ${importDone.failed} failed` : ''}
                  </p>
                  <button onClick={() => { setImportRows([]); setImportErrors([]); setImportDone(null); setActiveTab('list') }}
                    style={{ marginTop: '8px', padding: '6px 14px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                    View Customer List
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                  <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
                    Password = last 4 digits of mobile number for each customer
                  </p>
                  <button onClick={runImport} disabled={importing || importRows.filter(r => r._valid).length === 0}
                    style={{ padding: '12px 24px', background: importing ? '#aaa' : '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: importing ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '700' }}>
                    {importing ? '⏳ Importing...' : `✓ Import ${importRows.filter(r => r._valid).length} Customers`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── LIST TAB ── */}
      {activeTab === 'list' && (
        <div>
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
                { key: 'scheduled', label: '📅 Scheduled' },
                { key: 'inactive', label: '❌ Inactive' },
              ].map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  style={{ padding: '8px 14px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: filter === f.key ? '#0f4c81' : '#f0f0f0', color: filter === f.key ? 'white' : '#555', fontWeight: filter === f.key ? '700' : '400', fontSize: '12px' }}>
                  {f.label}
                </button>
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

              <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Basic Information</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Full Name *</label>
                  <input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Customer name" style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Mobile *</label>
                  <input value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} placeholder="03xx-xxxxxxx" style={inp} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Address</label>
                  <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Customer address" style={inp} />
                </div>
              </div>

              <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>App Login Credentials</p>
              <div style={{ background: '#f0f7ff', borderRadius: '10px', padding: '14px', marginBottom: '14px', border: '1px solid #c8d8ff' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>Customer ID (Auto)</label>
                    <div style={{ padding: '10px 12px', background: '#e3f0ff', borderRadius: '8px', fontSize: '14px', fontWeight: '700', color: '#0f4c81' }}>
                      {editCustomer ? editCustomer.customer_code : 'AQ-XXXXX (auto)'}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '600' }}>App Password *</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input value={form.customer_password} onChange={e => setForm({ ...form, customer_password: e.target.value })}
                        placeholder="Password" style={{ ...inp, flex: 1, fontWeight: '700' }} />
                      <button type="button" onClick={() => setForm({ ...form, customer_password: generatePassword() })}
                        style={{ padding: '10px 10px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
                        🔄
                      </button>
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: '11px', color: '#0f4c81', margin: 0 }}>
                  💡 Customer uses their <strong>Customer ID</strong> and <strong>Password</strong> to login.
                </p>
              </div>

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
                  <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px' }}>Our Bottles Placed (Opening)</label>
                  <input type="number" value={form.our_bottles_placed}
                    onChange={e => setForm({ ...form, our_bottles_placed: e.target.value === '' ? '' : Number(e.target.value) })}
                    onBlur={e => setForm({ ...form, our_bottles_placed: cleanNumeric(e.target.value) })}
                    style={inp} />
                </div>
              </div>

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

              <div style={{ background: '#fff8e1', border: '1.5px solid #ffe082', borderRadius: '10px', padding: '14px 16px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: '700', color: '#f57f17', margin: '0 0 2px' }}>🧾 Sales Tax Applicable</p>
                    <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Tax rate from Settings will apply to this customer</p>
                  </div>
                  <div onClick={() => setForm(f => ({ ...f, is_tax_applicable: !f.is_tax_applicable }))}
                    style={{ width: '44px', height: '24px', borderRadius: '12px', background: form.is_tax_applicable ? '#f57f17' : '#ddd', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'white', position: 'absolute', top: '2px', left: form.is_tax_applicable ? '22px' : '2px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                  </div>
                </div>
              </div>

              <div style={{ background: '#f0fff4', border: '1.5px solid #86efac', borderRadius: '10px', padding: '16px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 2px' }}>📅 Recurring Delivery Schedule</p>
                    <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Orders will auto-generate on selected days each week</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: form.schedule_active ? '#1a7a4a' : '#aaa', fontWeight: '600' }}>
                      {form.schedule_active ? 'Active' : 'Inactive'}
                    </span>
                    <div onClick={() => setForm(f => ({ ...f, schedule_active: !f.schedule_active }))}
                      style={{ width: '44px', height: '24px', borderRadius: '12px', background: form.schedule_active ? '#1a7a4a' : '#ddd', cursor: 'pointer', position: 'relative' }}>
                      <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'white', position: 'absolute', top: '2px', left: form.schedule_active ? '22px' : '2px', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                    </div>
                  </div>
                </div>
                {form.schedule_active && (
                  <>
                    <p style={{ fontSize: '11px', fontWeight: '700', color: '#555', marginBottom: '8px' }}>Delivery Days</p>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
                      {DAYS.map(day => (
                        <button key={day} type="button" onClick={() => toggleDay(day)}
                          style={{ padding: '8px 12px', border: '2px solid', borderColor: (form.delivery_days || []).includes(day) ? '#1a7a4a' : '#ddd', borderRadius: '8px', cursor: 'pointer', background: (form.delivery_days || []).includes(day) ? '#1a7a4a' : 'white', color: (form.delivery_days || []).includes(day) ? 'white' : '#555', fontWeight: '700', fontSize: '13px' }}>
                          {DAY_LABELS[day]}
                        </button>
                      ))}
                    </div>
                    <p style={{ fontSize: '11px', fontWeight: '700', color: '#555', marginBottom: '8px' }}>Default Quantities per Delivery</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                      {[
                        { key: 'default_qty_19l', label: '19L Bottles' },
                        { key: 'default_qty_half', label: 'Half Litre' },
                        { key: 'default_qty_1_5l', label: '1.5 Litre' },
                      ].map(f => (
                        <div key={f.key}>
                          <label style={{ fontSize: '11px', color: '#555', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                          <input type="number" value={form[f.key]}
                            onChange={e => setForm(ff => ({ ...ff, [f.key]: Number(e.target.value) || 0 }))}
                            style={{ ...inp, textAlign: 'center' }} />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
              
              <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes (optional)</p>
              <div style={{ marginBottom: '14px' }}>
                <textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="Any notes about this customer..."
                  rows={3}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
              </div>

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
                    {['Customer', 'Mobile', 'Rate 19L', 'Bottles', 'Balance', 'Schedule', 'Login Details', 'Status', 'Action'].map(h => (
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
                          {c.is_tax_applicable && <span style={{ fontSize: '10px', background: '#fff8e1', color: '#f57f17', padding: '1px 6px', borderRadius: '4px', fontWeight: '600' }}>🧾 Tax</span>}
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
                          {c.schedule_active && (c.delivery_days || []).length > 0 ? (
                            <div>
                              <p style={{ fontSize: '11px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 2px' }}>📅 Active</p>
                              <p style={{ fontSize: '10px', color: '#888', margin: 0 }}>
                                {(c.delivery_days || []).map(d => DAY_LABELS[d]).join(', ')}
                              </p>
                              <p style={{ fontSize: '10px', color: '#555', margin: '2px 0 0' }}>
                                {c.default_qty_19l || 1} × 19L
                              </p>
                            </div>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#ccc' }}>No schedule</span>
                          )}
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
      )}
    </div>
  )
}
