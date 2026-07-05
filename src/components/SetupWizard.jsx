import { useState } from 'react'
import { supabase } from '../supabase'

const STEPS = [
  { key: 'business', title: 'Business Info', icon: '🏢', subtitle: 'Tell us about your business' },
  { key: 'jazzcash', title: 'JazzCash Details', icon: '📱', subtitle: 'Your JazzCash account info' },
  { key: 'balances', title: 'Opening Balances', icon: '💰', subtitle: 'Cash you have when starting' },
  { key: 'rider', title: 'Add First Rider', icon: '🚴', subtitle: 'Your delivery rider details' },
  { key: 'customer', title: 'Add First Customer', icon: '👤', subtitle: 'Your first customer details' },
]

export default function SetupWizard({ tenantId, onComplete }) {
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)

  // Step 1 — Business
  const [businessName, setBusinessName] = useState('')
  const [businessAddress, setBusinessAddress] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [businessWhatsapp, setBusinessWhatsapp] = useState('')
  const [businessTagline, setBusinessTagline] = useState('')
  const [businessLogo, setBusinessLogo] = useState('')

  // Step 2 — JazzCash
  const [jazzNumber1, setJazzNumber1] = useState('')
  const [jazzName1, setJazzName1] = useState('')
  const [jazzNumber2, setJazzNumber2] = useState('')
  const [jazzName2, setJazzName2] = useState('')

  // Step 3 — Opening Balances
  const [openingCash, setOpeningCash] = useState('')
  const [openingJazz, setOpeningJazz] = useState('')
  const [openingBank, setOpeningBank] = useState('')

  // Step 4 — Rider
  const [riderName, setRiderName] = useState('')
  const [riderMobile, setRiderMobile] = useState('')
  const [riderIsMain, setRiderIsMain] = useState(true)
  const [skipRider, setSkipRider] = useState(false)

  // Step 5 — Customer
  const [customerName, setCustomerName] = useState('')
  const [customerMobile, setCustomerMobile] = useState('')
  const [customerRate, setCustomerRate] = useState('100')
  const [customerBalance, setCustomerBalance] = useState('')
  const [skipCustomer, setSkipCustomer] = useState(false)

  async function uploadLogo(file) {
    setLogoUploading(true)
    const ext = file.name.split('.').pop()
    const fileName = `logo_${tenantId}_${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('aquarun').upload(fileName, file, { upsert: true })
    if (error) { alert('Logo upload failed: ' + error.message); setLogoUploading(false); return }
    const { data: urlData } = supabase.storage.from('aquarun').getPublicUrl(fileName)
    setBusinessLogo(urlData.publicUrl)
    setLogoUploading(false)
  }

  async function saveStep() {
    setSaving(true)

    if (step === 0) {
      if (!businessName.trim()) { alert('Please enter business name'); setSaving(false); return }
      await supabase.from('business_settings').upsert([
        { tenant_id: tenantId, setting_key: 'business_name', setting_value: businessName },
        { tenant_id: tenantId, setting_key: 'business_address', setting_value: businessAddress },
        { tenant_id: tenantId, setting_key: 'business_phone', setting_value: businessPhone },
        { tenant_id: tenantId, setting_key: 'whatsapp_number', setting_value: businessWhatsapp || businessPhone },
        { tenant_id: tenantId, setting_key: 'business_tagline', setting_value: businessTagline },
        { tenant_id: tenantId, setting_key: 'business_logo', setting_value: businessLogo },
        { tenant_id: tenantId, setting_key: 'delivery_number', setting_value: businessPhone },
        { tenant_id: tenantId, setting_key: 'complaint_number', setting_value: businessPhone },
      ], { onConflict: 'tenant_id,setting_key' })
    }

    if (step === 1) {
      await supabase.from('business_settings').upsert([
        { tenant_id: tenantId, setting_key: 'jazzcash_number_1', setting_value: jazzNumber1 },
        { tenant_id: tenantId, setting_key: 'jazzcash_name_1', setting_value: jazzName1 },
        { tenant_id: tenantId, setting_key: 'jazzcash_number_2', setting_value: jazzNumber2 },
        { tenant_id: tenantId, setting_key: 'jazzcash_name_2', setting_value: jazzName2 },
      ], { onConflict: 'tenant_id,setting_key' })
    }

    if (step === 2) {
      const cash = Number(openingCash) || 0
      const jazz = Number(openingJazz) || 0
      const bank = Number(openingBank) || 0

      await supabase.from('chart_of_accounts').update({ opening_balance: cash }).eq('account_code', '1001').eq('tenant_id', tenantId)
      await supabase.from('chart_of_accounts').update({ opening_balance: jazz }).eq('account_code', '1002').eq('tenant_id', tenantId)
      await supabase.from('chart_of_accounts').update({ opening_balance: bank }).eq('account_code', '1003').eq('tenant_id', tenantId)

      const { data: customers } = await supabase.from('customers').select('opening_balance').eq('tenant_id', tenantId).eq('is_active', true)
      const totalReceivable = customers?.reduce((s, c) => s + Math.max(0, Number(c.opening_balance || 0)), 0) || 0

      await supabase.from('chart_of_accounts').update({ opening_balance: totalReceivable }).eq('account_code', '1100').eq('tenant_id', tenantId)
      await supabase.from('chart_of_accounts').update({ opening_balance: cash + jazz + bank + totalReceivable }).eq('account_code', '3001').eq('tenant_id', tenantId)

      await supabase.from('business_settings').upsert([
        { tenant_id: tenantId, setting_key: 'opening_cash_balance', setting_value: String(cash) },
        { tenant_id: tenantId, setting_key: 'opening_jazzcash_balance', setting_value: String(jazz) },
        { tenant_id: tenantId, setting_key: 'opening_bank_balance', setting_value: String(bank) },
      ], { onConflict: 'tenant_id,setting_key' })

      if (cash + jazz + bank + totalReceivable > 0) {
        const { data: je } = await supabase.from('journal_entries').insert([{
          tenant_id: tenantId,
          entry_date: new Date().toISOString().split('T')[0],
          reference_type: 'opening_balance',
          narration: 'Opening balances — business start',
          total_amount: cash + jazz + bank + totalReceivable,
          created_by: 'system'
        }]).select().single()

        if (je) {
          const lines = []
          if (cash > 0) lines.push({ tenant_id: tenantId, journal_entry_id: je.id, account_code: '1001', account_name: 'Cash in Hand', debit: cash, credit: 0 })
          if (jazz > 0) lines.push({ tenant_id: tenantId, journal_entry_id: je.id, account_code: '1002', account_name: 'JazzCash Account', debit: jazz, credit: 0 })
          if (bank > 0) lines.push({ tenant_id: tenantId, journal_entry_id: je.id, account_code: '1003', account_name: 'Bank Account', debit: bank, credit: 0 })
          if (totalReceivable > 0) lines.push({ tenant_id: tenantId, journal_entry_id: je.id, account_code: '1100', account_name: 'Accounts Receivable', debit: totalReceivable, credit: 0 })
          lines.push({ tenant_id: tenantId, journal_entry_id: je.id, account_code: '3001', account_name: 'Owner Capital', debit: 0, credit: cash + jazz + bank + totalReceivable })
          if (lines.length > 0) await supabase.from('journal_entry_lines').insert(lines)
        }
      }
    }

    if (step === 3 && !skipRider) {
      if (!riderName.trim()) { alert('Please enter rider name or skip'); setSaving(false); return }
      await supabase.from('riders').insert([{
        tenant_id: tenantId,
        full_name: riderName,
        mobile: riderMobile,
        is_main_rider: riderIsMain,
        is_active: true,
        salary: 0
      }])
    }

    if (step === 4 && !skipCustomer) {
      if (!customerName.trim()) { alert('Please enter customer name or skip'); setSaving(false); return }
      const code = 'C' + String(Math.floor(Math.random() * 9000) + 1000)
      await supabase.from('customers').insert([{
        tenant_id: tenantId,
        full_name: customerName,
        mobile: customerMobile,
        customer_code: code,
        rate_19l: Number(customerRate) || 100,
        opening_balance: Number(customerBalance) || 0,
        balance: Number(customerBalance) || 0,
        is_active: true
      }])
    }

    if (step === STEPS.length - 1) {
      await supabase.from('business_settings').upsert([
        { tenant_id: tenantId, setting_key: 'setup_completed', setting_value: 'true' }
      ], { onConflict: 'tenant_id,setting_key' })
      setSaving(false)
      onComplete()
      return
    }

    setSaving(false)
    setStep(s => s + 1)
  }

  const inp = {
    width: '100%', padding: '12px', border: '2px solid #e8eaed',
    borderRadius: '10px', fontSize: '15px', outline: 'none',
    boxSizing: 'border-box', marginBottom: '12px',
    fontFamily: "'Segoe UI', sans-serif"
  }

  const label = {
    fontSize: '13px', fontWeight: '600', color: '#555',
    display: 'block', marginBottom: '6px'
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px', fontFamily: "'Segoe UI', sans-serif"
    }}>
      <div style={{
        background: 'white', borderRadius: '20px', width: '100%',
        maxWidth: '520px', maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
      }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #0f4c81, #1a7a4a)', padding: '24px', borderRadius: '20px 20px 0 0', color: 'white' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{ width: '48px', height: '48px', background: 'rgba(255,255,255,0.15)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>
              💧
            </div>
            <div>
              <p style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Welcome to AquaRun!</p>
              <p style={{ fontSize: '13px', opacity: 0.7, margin: 0 }}>Let's set up your business in 5 minutes</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {STEPS.map((s, i) => (
              <div key={s.key} style={{
                flex: 1, height: '4px', borderRadius: '2px',
                background: i <= step ? 'white' : 'rgba(255,255,255,0.3)',
                transition: 'background 0.3s'
              }} />
            ))}
          </div>
          <p style={{ fontSize: '12px', opacity: 0.7, margin: '8px 0 0' }}>
            Step {step + 1} of {STEPS.length} — {STEPS[step].title}
          </p>
        </div>

        {/* Step Content */}
        <div style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <span style={{ fontSize: '32px' }}>{STEPS[step].icon}</span>
            <div>
              <p style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a2e', margin: 0 }}>{STEPS[step].title}</p>
              <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>{STEPS[step].subtitle}</p>
            </div>
          </div>

          {/* Step 1 — Business Info */}
          {step === 0 && (
            <div>
              <label style={label}>Business Name *</label>
              <input value={businessName} onChange={e => setBusinessName(e.target.value)}
                placeholder="e.g. Spring Water Kamoke" style={inp} />

              <label style={label}>Tagline</label>
              <input value={businessTagline} onChange={e => setBusinessTagline(e.target.value)}
                placeholder="e.g. Pure Water Delivery" style={inp} />

              <label style={label}>Business Address</label>
              <input value={businessAddress} onChange={e => setBusinessAddress(e.target.value)}
                placeholder="Full address" style={inp} />

              <label style={label}>Phone / Delivery Number</label>
              <input value={businessPhone} onChange={e => setBusinessPhone(e.target.value)}
                placeholder="e.g. 0300-1234567" style={inp} />

              <label style={label}>WhatsApp Number (if different)</label>
              <input value={businessWhatsapp} onChange={e => setBusinessWhatsapp(e.target.value)}
                placeholder="Leave blank if same as phone" style={inp} />

              <label style={label}>Business Logo</label>
              {businessLogo ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <img src={businessLogo} alt="logo" style={{ width: '60px', height: '60px', borderRadius: '10px', objectFit: 'contain', border: '2px solid #e8eaed' }} />
                  <button onClick={() => setBusinessLogo('')}
                    style={{ padding: '6px 12px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>
                    Remove
                  </button>
                </div>
              ) : (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', padding: '16px', border: '2px dashed #c8d8ff', borderRadius: '10px', textAlign: 'center', cursor: 'pointer', background: '#f0f7ff' }}>
                    <input type="file" accept="image/*" onChange={e => e.target.files[0] && uploadLogo(e.target.files[0])} style={{ display: 'none' }} />
                    {logoUploading ? (
                      <p style={{ color: '#0f4c81', margin: 0, fontSize: '13px' }}>Uploading...</p>
                    ) : (
                      <div>
                        <p style={{ fontSize: '24px', margin: '0 0 4px' }}>📷</p>
                        <p style={{ color: '#0f4c81', margin: 0, fontSize: '13px', fontWeight: '600' }}>Tap to upload logo</p>
                        <p style={{ color: '#aaa', margin: '2px 0 0', fontSize: '11px' }}>PNG, JPG — optional</p>
                      </div>
                    )}
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Step 2 — JazzCash */}
          {step === 1 && (
            <div>
              <div style={{ background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px' }}>
                <p style={{ fontSize: '12px', color: '#6b21a8', margin: 0 }}>📱 This is the JazzCash account where customers send payments directly</p>
              </div>

              <label style={label}>JazzCash Number 1 *</label>
              <input value={jazzNumber1} onChange={e => setJazzNumber1(e.target.value)}
                placeholder="e.g. 0300-1234567" style={inp} />

              <label style={label}>Account Holder Name 1 *</label>
              <input value={jazzName1} onChange={e => setJazzName1(e.target.value)}
                placeholder="e.g. Muhammad Ali" style={inp} />

              <div style={{ background: '#f8f9fa', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
                <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', margin: '0 0 10px' }}>Second JazzCash Account (optional)</p>
                <label style={{ ...label, marginBottom: '4px' }}>JazzCash Number 2</label>
                <input value={jazzNumber2} onChange={e => setJazzNumber2(e.target.value)}
                  placeholder="Optional" style={{ ...inp, marginBottom: '8px' }} />
                <label style={{ ...label, marginBottom: '4px' }}>Account Holder Name 2</label>
                <input value={jazzName2} onChange={e => setJazzName2(e.target.value)}
                  placeholder="Optional" style={{ ...inp, marginBottom: 0 }} />
              </div>

              <button onClick={() => setStep(s => s + 1)}
                style={{ width: '100%', padding: '12px', background: 'none', border: '1px solid #ddd', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', color: '#888', marginBottom: '8px' }}>
                Skip — I don't use JazzCash
              </button>
            </div>
          )}

          {/* Step 3 — Opening Balances */}
          {step === 2 && (
            <div>
              <div style={{ background: '#f0f7ff', border: '1px solid #c8d8ff', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81', margin: '0 0 4px' }}>💡 What are opening balances?</p>
                <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>How much cash/money did you have in each account when you started using AquaRun? Enter zero if you are starting fresh.</p>
              </div>

              <label style={label}>💵 Cash in Hand (Rs.)</label>
              <input type="number" value={openingCash} onChange={e => setOpeningCash(e.target.value)}
                placeholder="0" style={inp} />

              <label style={label}>📱 JazzCash Balance (Rs.)</label>
              <input type="number" value={openingJazz} onChange={e => setOpeningJazz(e.target.value)}
                placeholder="0" style={inp} />

              <label style={label}>🏦 Bank Balance (Rs.)</label>
              <input type="number" value={openingBank} onChange={e => setOpeningBank(e.target.value)}
                placeholder="0" style={inp} />

              <div style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: '10px', padding: '12px 14px' }}>
                <p style={{ fontSize: '12px', color: '#1a7a4a', margin: 0 }}>
                  ✅ Customer receivables and Owner Capital will be auto-calculated from your customer list
                </p>
              </div>
            </div>
          )}

          {/* Step 4 — First Rider */}
          {step === 3 && (
            <div>
              {!skipRider ? (
                <div>
                  <label style={label}>Rider Full Name *</label>
                  <input value={riderName} onChange={e => setRiderName(e.target.value)}
                    placeholder="e.g. Shah G" style={inp} />

                  <label style={label}>Mobile Number</label>
                  <input value={riderMobile} onChange={e => setRiderMobile(e.target.value)}
                    placeholder="e.g. 0300-1234567" style={inp} />

                  <label style={label}>Rider Type</label>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                    <button onClick={() => setRiderIsMain(true)}
                      style={{ flex: 1, padding: '14px', border: '2px solid', borderColor: riderIsMain ? '#f59e0b' : '#eee', borderRadius: '10px', cursor: 'pointer', background: riderIsMain ? '#fff8e1' : '#f8f9fa' }}>
                      <p style={{ fontSize: '20px', margin: '0 0 4px' }}>⭐</p>
                      <p style={{ fontSize: '13px', fontWeight: '700', color: '#795548', margin: '0 0 2px' }}>Main Rider</p>
                      <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Collects cash from other riders</p>
                    </button>
                    <button onClick={() => setRiderIsMain(false)}
                      style={{ flex: 1, padding: '14px', border: '2px solid', borderColor: !riderIsMain ? '#0f4c81' : '#eee', borderRadius: '10px', cursor: 'pointer', background: !riderIsMain ? '#e3f0ff' : '#f8f9fa' }}>
                      <p style={{ fontSize: '20px', margin: '0 0 4px' }}>🚴</p>
                      <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81', margin: '0 0 2px' }}>Field Rider</p>
                      <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Delivers to customers</p>
                    </button>
                  </div>

                  <button onClick={() => setSkipRider(true)}
                    style={{ width: '100%', padding: '12px', background: 'none', border: '1px solid #ddd', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', color: '#888' }}>
                    Skip — Add riders later
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <p style={{ fontSize: '40px', margin: '0 0 12px' }}>⏭️</p>
                  <p style={{ fontSize: '15px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>Skipping rider setup</p>
                  <p style={{ fontSize: '13px', color: '#888', margin: '0 0 16px' }}>You can add riders later from the Riders menu</p>
                  <button onClick={() => setSkipRider(false)}
                    style={{ padding: '8px 20px', background: '#f0f7ff', color: '#0f4c81', border: '1px solid #c8d8ff', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                    ← Add rider instead
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 5 — First Customer */}
          {step === 4 && (
            <div>
              {!skipCustomer ? (
                <div>
                  <label style={label}>Customer Full Name *</label>
                  <input value={customerName} onChange={e => setCustomerName(e.target.value)}
                    placeholder="e.g. Ahmed Khan" style={inp} />

                  <label style={label}>Mobile Number</label>
                  <input value={customerMobile} onChange={e => setCustomerMobile(e.target.value)}
                    placeholder="e.g. 0300-1234567" style={inp} />

                  <label style={label}>Rate per 19L Bottle (Rs.)</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                    {[80, 90, 100, 110, 120, 150].map(r => (
                      <button key={r} onClick={() => setCustomerRate(String(r))}
                        style={{ padding: '10px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: customerRate === String(r) ? '#0f4c81' : '#f0f0f0', color: customerRate === String(r) ? 'white' : '#333', fontWeight: '700', fontSize: '14px' }}>
                        Rs. {r}
                      </button>
                    ))}
                  </div>

                  <label style={label}>Opening Balance — Existing Dues (Rs.)</label>
                  <input type="number" value={customerBalance} onChange={e => setCustomerBalance(e.target.value)}
                    placeholder="0 if new customer" style={inp} />

                  <button onClick={() => setSkipCustomer(true)}
                    style={{ width: '100%', padding: '12px', background: 'none', border: '1px solid #ddd', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', color: '#888' }}>
                    Skip — Add customers later
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <p style={{ fontSize: '40px', margin: '0 0 12px' }}>⏭️</p>
                  <p style={{ fontSize: '15px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>Skipping customer setup</p>
                  <p style={{ fontSize: '13px', color: '#888', margin: '0 0 16px' }}>You can add customers later from the Customers menu</p>
                  <button onClick={() => setSkipCustomer(false)}
                    style={{ padding: '8px 20px', background: '#f0f7ff', color: '#0f4c81', border: '1px solid #c8d8ff', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                    ← Add customer instead
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Navigation Buttons */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)}
                style={{ flex: 1, padding: '14px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                ← Back
              </button>
            )}
            <button onClick={saveStep} disabled={saving}
              style={{ flex: 2, padding: '14px', background: step === STEPS.length - 1 ? '#1a7a4a' : '#0f4c81', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
              {saving ? 'Saving...' : step === STEPS.length - 1 ? '🎉 Complete Setup!' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}