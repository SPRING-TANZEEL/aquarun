import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { savePendingDelivery, updateCustomerBalanceOffline } from '../offlineDB'
import RiderQuickSale from './RiderQuickSale'

const RATES = [90, 100, 110, 120, 150, 160, 170, 180]

export default function RiderSellToCustomer({ rider, tenantId, preSelectedCustomer, onClearPreSelected, isOnline, dbReady, lang = 'en' }) {
  const [subTab, setSubTab] = useState('customer')
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [qty19l, setQty19l] = useState(1)
  const [selectedRate, setSelectedRate] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState(null)
  const [cashReceived, setCashReceived] = useState('')
  const [bottlesReturned, setBottlesReturned] = useState(0)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [step, setStep] = useState(1)

  // Products from DB
  const [bottleProducts, setBottleProducts] = useState([]) // half_litre, 1_5l
  const [extraProducts, setExtraProducts] = useState([])   // trading items
  const [quantities, setQuantities] = useState({})

  // Payment receipt state
  const [paySearch, setPaySearch] = useState('')
  const [payResults, setPayResults] = useState([])
  const [payCustomer, setPayCustomer] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payNotes, setPayNotes] = useState('')
  const [paySuccess, setPaySuccess] = useState(null)
  const [paySaving, setPaySaving] = useState(false)

  function t(en, ur) { return lang === 'ur' ? ur : en }

  useEffect(() => {
    if (tenantId) {
      fetchProducts()
      fetchAndCacheCustomers()
    }
  }, [tenantId])

  useEffect(() => {
    // Load cached customers when going offline
    if (!isOnline) {
      try {
        const cached = localStorage.getItem('cached_customers_' + tenantId)
        if (cached) setCustomers(JSON.parse(cached))
      } catch (err) {
        console.error('Cache parse error:', err)
      }
    } else {
      fetchAndCacheCustomers()
    }
  }, [isOnline, tenantId])

  useEffect(() => {
    if (preSelectedCustomer) {
      setSelectedCustomer(preSelectedCustomer)
      setSelectedRate(preSelectedCustomer.rate_19l || 100)
      setStep(2)
      setSubTab('customer')
    }
  }, [preSelectedCustomer])

  async function fetchAndCacheCustomers() {
    if (!isOnline) return
    const { data } = await supabase.from('customers')
      .select('*').eq('tenant_id', tenantId).eq('is_active', true).order('full_name')
    if (data) {
      localStorage.setItem('cached_customers_' + tenantId, JSON.stringify(data))
      setCustomers(data)
    }
  }

  async function fetchProducts() {
    const { data } = await supabase.from('products')
      .select('*').eq('tenant_id', tenantId).eq('is_active', true).eq('is_saleable', true).order('name')
    const bottle = (data || []).filter(p => p.bottle_type === 'half_litre' || p.bottle_type === '1_5l')
    const extra = (data || []).filter(p => !p.bottle_type)
    setBottleProducts(bottle)
    setExtraProducts(extra)
    const q = {}
    data?.forEach(p => { q[p.id] = 0 })
    setQuantities(q)
  }

  async function searchCustomer(val) {
    setSearch(val)
    if (val.length < 2) { setSearchResults([]); return }

    if (!isOnline) {
      const filtered = (customers || []).filter(c =>
        c.full_name?.toLowerCase().includes(val.toLowerCase()) ||
        c.mobile?.includes(val) ||
        c.customer_code?.toLowerCase().includes(val.toLowerCase())
      ).slice(0, 5)
      setSearchResults(filtered)
      return
    }

    const { data } = await supabase.from('customers')
      .select('*').eq('tenant_id', tenantId).eq('is_active', true)
      .or(`full_name.ilike.%${val}%,mobile.ilike.%${val}%,customer_code.ilike.%${val}%`).limit(5)
    setSearchResults(data || [])
  }

  async function searchPayCustomer(val) {
    setPaySearch(val)
    if (val.length < 2) { setPayResults([]); return }
    if (!isOnline) { setPayResults([]); return }
    const { data } = await supabase.from('customers')
      .select('*').eq('tenant_id', tenantId).eq('is_active', true)
      .or(`full_name.ilike.%${val}%,mobile.ilike.%${val}%,customer_code.ilike.%${val}%`).limit(5)
    setPayResults(data || [])
  }

  function selectCustomer(c) {
    setSelectedCustomer(c)
    setSelectedRate(c.rate_19l || 100)
    setSearch('')
    setSearchResults([])
    setBottlesReturned(0)
    setStep(2)
  }

  function getBottleRate(p) {
    if (!selectedCustomer) return Number(p.sale_price || 0)
    if (p.bottle_type === 'half_litre') return Number(selectedCustomer.rate_half_litre || p.sale_price || 0)
    if (p.bottle_type === '1_5l') return Number(selectedCustomer.rate_1_5l || p.sale_price || 0)
    return Number(p.sale_price || 0)
  }

  function getBottleQtys() {
    let qtyHalf = 0, qty15l = 0
    bottleProducts.forEach(p => {
      if (p.bottle_type === 'half_litre') qtyHalf += (quantities[p.id] || 0)
      if (p.bottle_type === '1_5l') qty15l += (quantities[p.id] || 0)
    })
    return { qtyHalf, qty15l }
  }

  function totalAmount() {
    const bottleTotal = bottleProducts.reduce((s, p) => s + (quantities[p.id] || 0) * getBottleRate(p), 0)
    const extraTotal = extraProducts.reduce((s, p) => s + (quantities[p.id] || 0) * Number(p.sale_price || 0), 0)
    return (qty19l * (selectedRate || 0)) + bottleTotal + extraTotal
  }

  // ── RECEIVE PAYMENT ──────────────────────────────────────────────
  async function receivePayment() {
    if (!payCustomer) return alert('Please select a customer')
    if (!payAmount || Number(payAmount) <= 0) return alert('Please enter payment amount')
    setPaySaving(true)

    const amount = Number(payAmount)
    const isJazz = payMethod === 'jazzcash'

    if (!isOnline) {
      setPaySuccess({ name: payCustomer.full_name, amount, method: payMethod, newBalance: Number(payCustomer.balance || 0) - amount, jazzPending: payMethod === 'jazzcash', savedOffline: true })
      setPayCustomer(null); setPaySearch(''); setPayAmount(''); setPayNotes('')
      setPaySaving(false)
      return
    }

    const { data: savedPayment, error } = await supabase.from('payments').insert([{
      tenant_id: tenantId,
      customer_id: payCustomer.id,
      rider_id: rider.id,
      amount,
      payment_method: payMethod,
      payment_date: new Date().toISOString().split('T')[0],
      jazzcash_confirmed: !isJazz, // cash confirmed immediately, jazz pending
      notes: payNotes || `Payment received by rider ${rider.full_name}`,
      is_voided: false
    }]).select().single()

    if (error) { alert('Error: ' + error.message); setPaySaving(false); return }

    if (!isJazz) {
      // Cash — reduce customer balance immediately
      const newBalance = Number(payCustomer.balance || 0) - amount
      await supabase.from('customers').update({ balance: newBalance }).eq('id', payCustomer.id).eq('tenant_id', tenantId)
    }

    // Post journal — isRiderEntry=true → DR 1101 Receivable from Riders (cash) or DR 1102 Clearing (jazz)
    try {
      const { postPaymentJournal } = await import('../accountingEngine')
      await postPaymentJournal(savedPayment, tenantId, true)
    } catch (err) { console.error('Journal error:', err) }

    setPaySuccess({
      name: payCustomer.full_name, amount, method: payMethod,
      newBalance: !isJazz ? Number(payCustomer.balance || 0) - amount : payCustomer.balance,
      jazzPending: isJazz
    })
    setPayCustomer(null); setPaySearch(''); setPayAmount(''); setPayNotes('')
    setPaySaving(false)
  }

  // ── COMPLETE SALE ─────────────────────────────────────────────────
  async function completeSale() {
    if (!paymentMethod) return alert('Please select payment method')
    const { qtyHalf, qty15l } = getBottleQtys()
    const hasAny = qty19l > 0 || qtyHalf > 0 || qty15l > 0 || [...bottleProducts, ...extraProducts].some(p => (quantities[p.id] || 0) > 0)
    if (!hasAny) return alert('Please add at least one item')
    if (qty19l > 0 && !selectedRate) return alert('Please select rate for 19L')

    const total = totalAmount()
    if (paymentMethod === 'cash') {
      const received = Number(cashReceived)
      if (!cashReceived || received < 0) return alert('Please enter cash received')
      if (received > total) return alert('Cash received cannot exceed total Rs. ' + total.toLocaleString())
    }

    setSaving(true)
    const isCash = paymentMethod === 'cash'
    const isJazz = paymentMethod === 'jazzcash'
    const isCredit = paymentMethod === 'credit'
    const received = isCash ? Number(cashReceived) : 0
    const creditPortion = isCredit ? total : isCash ? (total - received) : 0
    const now = new Date().toISOString()

    let deliveryLat = null, deliveryLng = null
    try {
      const position = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
      )
      deliveryLat = position.coords.latitude
      deliveryLng = position.coords.longitude
    } catch (err) { console.log('GPS not available:', err.message) }

    const deliveryData = {
      tenant_id: tenantId,
      customer_id: selectedCustomer.id,
      rider_id: rider.id,
      qty_19l: qty19l,
      qty_half_litre: qtyHalf,
      qty_1_5l: qty15l,
      rate_applied: selectedRate || 0,
      total_amount: total,
      payment_method: paymentMethod,
      amount_received: isJazz ? 0 : received,
      credit_amount: creditPortion,
      jazzcash_confirmed: false,
      delivered_at: now,
      is_voided: false,
      delivery_lat: deliveryLat,
      delivery_lng: deliveryLng,
      bottles_returned: bottlesReturned
    }

    if (isOnline) {
      const { data: savedDelivery, error } = await supabase.from('deliveries').insert([deliveryData]).select().single()
      if (error) { alert('Error: ' + error.message); setSaving(false); return }

      if (creditPortion > 0) {
        await supabase.from('customers').update({ balance: Number(selectedCustomer.balance) + creditPortion }).eq('id', selectedCustomer.id)
      }

      // Update bottles placed
      const currentBottles = Number(selectedCustomer.our_bottles_placed || 0)
      await supabase.from('customers')
        .update({ our_bottles_placed: Math.max(0, currentBottles + qty19l - bottlesReturned) })
        .eq('id', selectedCustomer.id).eq('tenant_id', tenantId)

      // Deduct stock + COGS for all sold products
      const allSold = [...bottleProducts, ...extraProducts].filter(p => (quantities[p.id] || 0) > 0)
      for (const p of allSold) {
        const qtySold = quantities[p.id]
        await supabase.from('products')
          .update({ current_stock: Math.max(0, Number(p.current_stock || 0) - qtySold) })
          .eq('id', p.id).eq('tenant_id', tenantId)
        if (p.product_type === 'finished_good') {
          const avgCost = Number(p.average_cost || p.purchase_price || 0)
          const cogsCost = qtySold * avgCost
          if (cogsCost > 0) {
            try {
              const { data: je } = await supabase.from('journal_entries').insert([{
                tenant_id: tenantId, entry_date: now.split('T')[0],
                reference_type: 'cogs', reference_id: savedDelivery.id,
                narration: `COGS — ${p.name} × ${qtySold}`, total_amount: cogsCost, created_by: 'system'
              }]).select().single()
              if (je) {
                await supabase.from('journal_entry_lines').insert([
                  { tenant_id: tenantId, journal_entry_id: je.id, account_code: '5003', account_name: 'Cost of Goods Sold', debit: cogsCost, credit: 0 },
                  { tenant_id: tenantId, journal_entry_id: je.id, account_code: '1201', account_name: 'Inventory - Finished Goods', debit: 0, credit: cogsCost }
                ])
              }
            } catch (err) { console.error('COGS error:', err) }
          }
        }
      }

      // Save line items to delivery_items
      const sellItems = []
      if (qty19l > 0) sellItems.push({
        tenant_id: tenantId, delivery_id: savedDelivery.id,
        product_id: null, product_name: '19 Litre Water Bottle',
        bottle_type: '19l', qty: qty19l,
        rate: selectedRate || 0, amount: qty19l * (selectedRate || 0)
      })
      bottleProducts.forEach(p => {
        if ((quantities[p.id] || 0) > 0) {
          const rate = getBottleRate(p)
          sellItems.push({
            tenant_id: tenantId, delivery_id: savedDelivery.id,
            product_id: p.id, product_name: p.name,
            bottle_type: p.bottle_type, qty: quantities[p.id],
            rate, amount: quantities[p.id] * rate
          })
        }
      })
      extraProducts.forEach(p => {
        if ((quantities[p.id] || 0) > 0) {
          const rate = Number(p.sale_price || 0)
          sellItems.push({
            tenant_id: tenantId, delivery_id: savedDelivery.id,
            product_id: p.id, product_name: p.name,
            bottle_type: null, qty: quantities[p.id],
            rate, amount: quantities[p.id] * rate
          })
        }
      })
      if (sellItems.length > 0) await supabase.from('delivery_items').insert(sellItems)

      // Post delivery journal — isRiderEntry=true → DR 1101 Receivable from Riders
      try {
        const { postDeliveryJournal } = await import('../accountingEngine')
        await postDeliveryJournal(savedDelivery, selectedCustomer.id, tenantId, true)
      } catch (err) { console.error('Journal post error:', err) }

      // Generate invoice number
      try {
        const year = new Date().getFullYear()
        const counterKey = `invoice_counter_${year}`
        const { data: counterRows } = await supabase.from('business_settings')
        .select('setting_value').eq('tenant_id', tenantId).eq('setting_key', counterKey)
      const counter = Number(counterRows?.[0]?.setting_value || 0) + 1
        const { data: tenantData } = await supabase.from('tenants').select('tenant_code').eq('id', tenantId).single()
        const code = tenantData?.tenant_code || 'INV'
        const invoiceNumber = `${code}-${year}-${String(counter).padStart(4, '0')}`
        await supabase.from('business_settings').upsert(
          { tenant_id: tenantId, setting_key: counterKey, setting_value: String(counter) },
          { onConflict: 'tenant_id,setting_key' }
        )
        await supabase.from('deliveries').update({ invoice_number: invoiceNumber }).eq('id', savedDelivery.id)
      } catch (err) { console.error('Invoice number error:', err) }

      // Save GPS to customer on first delivery
      if (deliveryLat && deliveryLng) {
        const { data: cust } = await supabase.from('customers')
          .select('latitude, longitude').eq('id', selectedCustomer.id).eq('tenant_id', tenantId).single()
        if (cust && !cust.latitude) {
          await supabase.from('customers').update({ latitude: String(deliveryLat), longitude: String(deliveryLng) })
            .eq('id', selectedCustomer.id).eq('tenant_id', tenantId)
        }
      }
    } else {
      await savePendingDelivery(deliveryData)
      if (creditPortion > 0) {
        await updateCustomerBalanceOffline(selectedCustomer.id, Number(selectedCustomer.balance || 0) + creditPortion)
      }
    }

    setSuccess({ customer: selectedCustomer.full_name, total, received, creditPortion, paymentMethod, bottlesReturned, savedOffline: !isOnline })
    setSelectedCustomer(null)
    setQty19l(1); setSelectedRate(null); setPaymentMethod(null); setCashReceived('')
    setBottlesReturned(0); setStep(1)
    // Reset product quantities
    const q = {}; [...bottleProducts, ...extraProducts].forEach(p => { q[p.id] = 0 }); setQuantities(q)
    await fetchProducts()
    if (onClearPreSelected) onClearPreSelected()
    setSaving(false)
  }

  function numBtn(val, setVal, min = 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button onClick={() => setVal(Math.max(min, val - 1))}
          style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #ddd', background: '#f5f5f5', fontSize: '18px', cursor: 'pointer' }}>−</button>
        <span style={{ fontSize: '22px', fontWeight: '700', minWidth: '30px', textAlign: 'center' }}>{val}</span>
        <button onClick={() => setVal(val + 1)}
          style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #0f4c81', background: '#0f4c81', color: 'white', fontSize: '18px', cursor: 'pointer' }}>+</button>
      </div>
    )
  }

  const total = totalAmount()
  const cashReceivedNum = Number(cashReceived) || 0

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '12px' }}>🏪 {t('Sell & Receive', 'فروخت اور وصولی')}</h2>

      {/* ── 3 SUB TABS ── */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        <button onClick={() => { setSubTab('customer'); setSuccess(null) }}
          style={{ flex: 1, padding: '10px 6px', border: '2px solid', borderColor: subTab === 'customer' ? '#0f4c81' : '#eee', borderRadius: '10px', cursor: 'pointer', background: subTab === 'customer' ? '#0f4c81' : 'white', color: subTab === 'customer' ? 'white' : '#555', fontWeight: '700', fontSize: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
          <span style={{ fontSize: '20px' }}>👤</span>
          <span>{t('Sell to', 'فروخت')}</span>
          <span>{t('Customer', 'کسٹمر')}</span>
        </button>
        <button onClick={() => { setSubTab('quicksale'); setSuccess(null) }}
          style={{ flex: 1, padding: '10px 6px', border: '2px solid', borderColor: subTab === 'quicksale' ? '#1a7a4a' : '#eee', borderRadius: '10px', cursor: 'pointer', background: subTab === 'quicksale' ? '#1a7a4a' : 'white', color: subTab === 'quicksale' ? 'white' : '#555', fontWeight: '700', fontSize: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
          <span style={{ fontSize: '20px' }}>⚡</span>
          <span>{t('Quick', 'فوری')}</span>
          <span>{t('Sale', 'فروخت')}</span>
        </button>
        <button onClick={() => { setSubTab('payment'); setPaySuccess(null) }}
          style={{ flex: 1, padding: '10px 6px', border: '2px solid', borderColor: subTab === 'payment' ? '#f59e0b' : '#eee', borderRadius: '10px', cursor: 'pointer', background: subTab === 'payment' ? '#f59e0b' : 'white', color: subTab === 'payment' ? 'white' : '#555', fontWeight: '700', fontSize: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
          <span style={{ fontSize: '20px' }}>💰</span>
          <span>{t('Receive', 'وصول')}</span>
          <span>{t('Payment', 'ادائیگی')}</span>
        </button>
      </div>

      {/* ── QUICK SALE TAB ── */}
      {subTab === 'quicksale' && <RiderQuickSale rider={rider} tenantId={tenantId} lang={lang} />}

      {/* ── RECEIVE PAYMENT TAB ── */}
      {subTab === 'payment' && (
        <div>
          {!isOnline && (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
              <p style={{ fontSize: '12px', color: '#ea580c', fontWeight: '600', margin: 0 }}>📵 {t('Offline — payment will be saved but balance updates when internet restored', 'آف لائن — انٹرنیٹ آنے پر بیلنس اپڈیٹ ہوگا')}</p>
            </div>
          )}

          {paySuccess && (
            <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
              <p style={{ fontWeight: '700', color: '#1b5e20', margin: '0 0 4px' }}>✅ {t('Payment Received!', 'ادائیگی موصول!')}</p>
              <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>👤 {paySuccess.name}</p>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 2px' }}>
                Rs. {paySuccess.amount.toLocaleString()} — {paySuccess.method === 'jazzcash' ? '📱 JazzCash' : '💵 Cash'}
              </p>
              {paySuccess.jazzPending && <p style={{ fontSize: '11px', color: '#e65100', margin: '4px 0 0', fontWeight: '600' }}>⚠️ {t('JazzCash — admin will confirm', 'جیز کیش — ایڈمن تصدیق کرے گا')}</p>}
              {!paySuccess.jazzPending && (
                <p style={{ fontSize: '12px', color: '#555', margin: '4px 0 0' }}>
                  {t('New balance', 'نیا بیلنس')}: <strong style={{ color: paySuccess.newBalance > 0 ? '#f44336' : '#1a7a4a' }}>
                    Rs. {Math.abs(paySuccess.newBalance).toLocaleString()} {paySuccess.newBalance > 0 ? t('still owed', 'باقی') : '✅ ' + t('clear', 'صاف')}
                  </strong>
                </p>
              )}
              <button onClick={() => setPaySuccess(null)}
                style={{ marginTop: '8px', padding: '4px 12px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '12px' }}>
                + {t('New Payment', 'نئی ادائیگی')}
              </button>
            </div>
          )}

          {/* Customer Search */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>{t('Search Customer', 'کسٹمر تلاش کریں')}</p>
            {payCustomer ? (
              <div style={{ padding: '12px 14px', background: '#e3f0ff', borderRadius: '8px', border: '1px solid #c8d8ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontWeight: '700', fontSize: '15px', margin: '0 0 2px', color: '#0f4c81' }}>{payCustomer.full_name}</p>
                  <p style={{ fontSize: '12px', color: '#555', margin: '0 0 4px' }}>{payCustomer.mobile}</p>
                  <p style={{ fontSize: '14px', fontWeight: '700', margin: 0, color: Number(payCustomer.balance) > 0 ? '#f44336' : '#1a7a4a' }}>
                    {t('Outstanding', 'باقی')}: Rs. {Math.abs(Number(payCustomer.balance || 0)).toLocaleString()}
                    {Number(payCustomer.balance) <= 0 && ' ✅'}
                  </p>
                </div>
                <button onClick={() => { setPayCustomer(null); setPaySearch(''); setPayAmount('') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '20px' }}>✕</button>
              </div>
            ) : (
              <div>
                <input value={paySearch} onChange={e => searchPayCustomer(e.target.value)}
                  placeholder={t('Name, mobile or customer ID...', 'نام، موبائل یا ID...')}
                  style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '15px', outline: 'none', boxSizing: 'border-box', color: '#333' }} />
                {payResults.map(c => (
                  <div key={c.id} onClick={() => { setPayCustomer(c); setPayResults([]); setPaySearch(''); if (c.balance > 0) setPayAmount(String(c.balance)) }}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}>
                    <div>
                      <p style={{ fontWeight: '600', fontSize: '14px', margin: '0 0 2px' }}>{c.full_name}</p>
                      <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>{c.mobile}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '14px', fontWeight: '700', color: Number(c.balance) > 0 ? '#f44336' : '#1a7a4a', margin: 0 }}>Rs. {Math.abs(Number(c.balance)).toLocaleString()}</p>
                      <p style={{ fontSize: '11px', color: '#aaa', margin: 0 }}>{Number(c.balance) > 0 ? t('owes', 'باقی') : t('advance', 'ایڈوانس')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment Method */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>{t('Payment Method', 'ادائیگی کا طریقہ')}</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              {[
                { key: 'cash', label: t('نقد Cash', 'نقد'), sublabel: t('Cash — goes to rider', 'نقد — رائیڈر کے پاس'), color: '#1a7a4a' },
                { key: 'jazzcash', label: t('جیز کیش', 'جیز کیش'), sublabel: t('JazzCash — goes to admin', 'جیز کیش — ایڈمن کو'), color: '#9c27b0' },
              ].map(pm => (
                <button key={pm.key} onClick={() => setPayMethod(pm.key)}
                  style={{ flex: 1, padding: '14px 8px', border: '2px solid', borderColor: payMethod === pm.key ? pm.color : '#eee', borderRadius: '10px', cursor: 'pointer', background: payMethod === pm.key ? pm.color : 'white', color: payMethod === pm.key ? 'white' : '#555', fontWeight: '700', fontSize: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <span>{pm.label}</span>
                  <span style={{ fontSize: '10px', opacity: 0.8, textAlign: 'center' }}>{pm.sublabel}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>{t('Amount Received (Rs.)', 'موصول شدہ رقم (Rs.)')}</p>
            <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0"
              style={{ width: '100%', padding: '14px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '28px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center', color: '#333', caretColor: '#0f4c81' }} />
            {payCustomer && Number(payCustomer.balance) > 0 && (
              <button onClick={() => setPayAmount(String(payCustomer.balance))}
                style={{ marginTop: '8px', width: '100%', padding: '8px', background: '#f0f7ff', border: '1px solid #c8d8ff', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#0f4c81', fontWeight: '600' }}>
                {t('Full Balance', 'پورا بیلنس')}: Rs. {Number(payCustomer.balance).toLocaleString()}
              </button>
            )}
          </div>

          {/* Notes */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '8px' }}>{t('Notes (optional)', 'نوٹس (اختیاری)')}</p>
            <input value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder={t('e.g. Monthly payment...', 'مثلاً ماہانہ ادائیگی...')}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', color: '#333' }} />
          </div>

          {/* Submit */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            {payCustomer && payAmount && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', padding: '12px', background: '#f0f7ff', borderRadius: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: '700', color: '#333' }}>{t('Amount', 'رقم')}</span>
                <span style={{ fontSize: '28px', fontWeight: '800', color: '#0f4c81' }}>Rs. {Number(payAmount).toLocaleString()}</span>
              </div>
            )}
            <button onClick={receivePayment} disabled={paySaving}
              style={{ width: '100%', padding: '16px', background: payMethod === 'cash' ? '#1a7a4a' : '#9c27b0', color: 'white', border: 'none', borderRadius: '10px', cursor: paySaving ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: '700' }}>
              {paySaving ? t('Saving...', 'محفوظ ہو رہا ہے...') : `✓ ${payMethod === 'cash' ? '💵 ' + t('Receive Cash', 'نقد وصول') : '📱 Record JazzCash'} — Rs. ${Number(payAmount || 0).toLocaleString()}`}
            </button>
          </div>
        </div>
      )}

      {/* ── SELL TO CUSTOMER TAB ── */}
      {subTab === 'customer' && (
        <div>
          {!isOnline && (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
              <p style={{ fontSize: '12px', color: '#ea580c', fontWeight: '600', margin: 0 }}>📵 {t('Offline — sale will sync when internet is available', 'آف لائن — انٹرنیٹ آنے پر مطابق ہوگا')}</p>
            </div>
          )}

          {success && (
            <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
              <p style={{ fontWeight: '700', color: '#1b5e20', marginBottom: '4px' }}>✅ {t('Sale Complete!', 'فروخت مکمل!')}</p>
              <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>{success.customer} — Rs. {success.total.toLocaleString()}</p>
              {success.received > 0 && <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>{t('Cash', 'نقد')}: Rs. {success.received.toLocaleString()}</p>}
              {success.creditPortion > 0 && <p style={{ fontSize: '13px', color: '#f44336', margin: '0 0 2px' }}>{t('Credit', 'ادھار')}: Rs. {success.creditPortion.toLocaleString()}</p>}
              {success.bottlesReturned > 0 && <p style={{ fontSize: '13px', color: '#e65100', margin: '0 0 2px' }}>🫙 {success.bottlesReturned} {t('empty bottles returned', 'خالی بوتلیں واپس')}</p>}
              {success.savedOffline && <p style={{ fontSize: '12px', color: '#ea580c', margin: '4px 0 0', fontWeight: '600' }}>📵 {t('Saved offline — will sync later', 'آف لائن محفوظ — بعد میں مطابق ہوگا')}</p>}
              <button onClick={() => setSuccess(null)}
                style={{ marginTop: '8px', padding: '4px 12px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '12px' }}>
                {t('New Sale', 'نئی فروخت')}
              </button>
            </div>
          )}

          {/* Step 1 — Search */}
          {step === 1 && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>{t('Search Customer', 'کسٹمر تلاش کریں')}</p>
              <input value={search} onChange={e => searchCustomer(e.target.value)}
                placeholder={t('Name, mobile or customer ID...', 'نام، موبائل یا ID...')}
                style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '15px', outline: 'none', boxSizing: 'border-box', color: '#333' }} />
              {(searchResults || []).map(c => (
                <div key={c.id} onClick={() => selectCustomer(c)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}>
                  <div>
                    <p style={{ fontWeight: '600', fontSize: '14px', margin: '0 0 2px' }}>{c.full_name}</p>
                    <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>{c.mobile} · {c.customer_code}</p>
                    {c.address && <p style={{ fontSize: '11px', color: '#aaa', margin: '2px 0 0' }}>📍 {c.address}</p>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '13px', fontWeight: '700', color: Number(c.balance) > 0 ? '#f44336' : '#4caf50', margin: '0 0 2px' }}>
                      Rs. {Math.abs(Number(c.balance)).toLocaleString()}
                    </p>
                    {Number(c.our_bottles_placed) > 0 && (
                      <p style={{ fontSize: '10px', color: '#e65100', margin: 0 }}>🫙 {c.our_bottles_placed} {t('bottles', 'بوتلیں')}</p>
                    )}
                  </div>
                </div>
              ))}
              {!isOnline && customers.length === 0 && (
                <p style={{ fontSize: '12px', color: '#aaa', textAlign: 'center', margin: '12px 0 0' }}>{t('No cached customers — please connect to internet first', 'پہلے انٹرنیٹ سے جڑیں')}</p>
              )}
            </div>
          )}

          {/* Step 2 — Sale Form */}
          {step === 2 && selectedCustomer && (
            <div>
              {/* Customer header */}
              <div style={{ background: '#0f4c81', color: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontWeight: '700', fontSize: '16px', margin: '0 0 2px' }}>{selectedCustomer.full_name}</p>
                  <p style={{ fontSize: '12px', opacity: 0.8, margin: '0 0 2px' }}>{selectedCustomer.mobile} · {selectedCustomer.customer_code}</p>
                  {selectedCustomer.address && <p style={{ fontSize: '11px', opacity: 0.7, margin: 0 }}>📍 {selectedCustomer.address}</p>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '11px', opacity: 0.7, margin: '0 0 2px' }}>{t('Balance', 'بیلنس')}</p>
                  <p style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 4px', color: selectedCustomer.balance > 0 ? '#ffcdd2' : '#c8e6c9' }}>
                    Rs. {Number(selectedCustomer.balance || 0).toLocaleString()}
                  </p>
                  {Number(selectedCustomer.our_bottles_placed) > 0 && (
                    <p style={{ fontSize: '11px', opacity: 0.8, margin: 0 }}>🫙 {selectedCustomer.our_bottles_placed} {t('our bottles', 'ہماری بوتلیں')}</p>
                  )}
                </div>
              </div>

              {/* 19L — hardcoded */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '14px' }}>{t('Bottles', 'بوتلیں')}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <p style={{ fontSize: '14px', fontWeight: '600', margin: 0 }}>19 {t('Litre', 'لیٹر')}</p>
                  {numBtn(qty19l, setQty19l)}
                </div>

                {/* Bottle products from DB */}
                {bottleProducts.map(p => {
                  const rate = getBottleRate(p)
                  if (rate <= 0 && (quantities[p.id] || 0) === 0) return null
                  return (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                      <p style={{ fontSize: '14px', fontWeight: '600', margin: 0 }}>{p.name}</p>
                      {numBtn(quantities[p.id] || 0, v => setQuantities(q => ({ ...q, [p.id]: v })))}
                    </div>
                  )
                })}

                {/* Extra products */}
                {extraProducts.filter(p => (quantities[p.id] || 0) > 0 || Number(p.sale_price) > 0).map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>{p.name}</p>
                      <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Rs. {p.sale_price} · {t('Stock', 'اسٹاک')}: {p.current_stock}</p>
                    </div>
                    {numBtn(quantities[p.id] || 0, v => setQuantities(q => ({ ...q, [p.id]: v })))}
                  </div>
                ))}
              </div>

              {/* Empty Bottles Returned */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #fff3e0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: '700', color: '#e65100', margin: '0 0 4px' }}>🫙 {t('Empty Bottles Returned', 'خالی بوتلیں واپس')}</p>
                    <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>
                      {t('Our bottles with customer', 'گاہک کے پاس ہماری بوتلیں')}: <strong>{Number(selectedCustomer.our_bottles_placed || 0)}</strong>
                    </p>
                    {bottlesReturned > 0 && (
                      <p style={{ fontSize: '11px', color: '#1a7a4a', margin: '4px 0 0', fontWeight: '600' }}>
                        {t('After delivery', 'ڈیلیوری کے بعد')}: {Math.max(0, Number(selectedCustomer.our_bottles_placed || 0) + qty19l - bottlesReturned)} {t('our bottles', 'ہماری بوتلیں')}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button onClick={() => setBottlesReturned(Math.max(0, bottlesReturned - 1))}
                      style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #ddd', background: '#f5f5f5', fontSize: '18px', cursor: 'pointer' }}>−</button>
                    <span style={{ fontSize: '22px', fontWeight: '700', minWidth: '30px', textAlign: 'center', color: bottlesReturned > 0 ? '#e65100' : '#ccc' }}>{bottlesReturned}</span>
                    <button onClick={() => setBottlesReturned(bottlesReturned + 1)}
                      style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid #e65100', background: '#e65100', color: 'white', fontSize: '18px', cursor: 'pointer' }}>+</button>
                  </div>
                </div>
              </div>

              {/* Rate for 19L */}
              {qty19l > 0 && (
                <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>{t('Rate — 19L', 'قیمت — 19 لیٹر')}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                    {RATES.map(r => (
                      <button key={r} onClick={() => setSelectedRate(r)}
                        style={{ padding: '10px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: selectedRate === r ? '#0f4c81' : '#f0f0f0', color: selectedRate === r ? 'white' : '#333', fontWeight: '700', fontSize: '14px' }}>
                        Rs. {r}
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>{t('یا خود لکھیں (Manual Rate)', 'یا خود لکھیں')}</p>
                  <input type="number" value={selectedRate || ''} onChange={e => setSelectedRate(e.target.value === '' ? null : Number(e.target.value))}
                    placeholder="e.g. 130"
                    style={{ width: '100%', padding: '10px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '20px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center', color: '#333' }} />
                  {selectedRate && (
                    <p style={{ fontSize: '12px', color: '#0f4c81', fontWeight: '600', margin: '6px 0 0', textAlign: 'center' }}>
                      ✅ {t('Rate', 'قیمت')}: Rs. {selectedRate} {t('per bottle', 'فی بوتل')}
                    </p>
                  )}
                </div>
              )}

              {/* Payment Method */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>{t('Payment Method', 'ادائیگی کا طریقہ')}</p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {[
                    { key: 'cash', label: t('نقد', 'نقد'), sublabel: t('Cash', 'Cash'), color: '#1a7a4a' },
                    { key: 'jazzcash', label: t('جیز کیش', 'جیز کیش'), sublabel: 'JazzCash', color: '#9c27b0' },
                    { key: 'credit', label: t('ادھار', 'ادھار'), sublabel: t('Credit', 'Credit'), color: '#f44336' },
                  ].map(pm => (
                    <button key={pm.key} onClick={() => { setPaymentMethod(pm.key); setCashReceived('') }}
                      style={{ flex: 1, padding: '14px 8px', border: '2px solid', borderColor: paymentMethod === pm.key ? pm.color : '#eee', borderRadius: '10px', cursor: 'pointer', background: paymentMethod === pm.key ? pm.color : 'white', color: paymentMethod === pm.key ? 'white' : '#555', fontWeight: '700', fontSize: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <span>{pm.label}</span>
                      <span style={{ fontSize: '10px', opacity: 0.8 }}>{pm.sublabel}</span>
                    </button>
                  ))}
                </div>

                {paymentMethod === 'cash' && total > 0 && (
                  <div style={{ marginTop: '14px', background: '#f0f7ff', borderRadius: '10px', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{ fontSize: '13px', color: '#555' }}>{t('Total', 'کل')}</span>
                      <span style={{ fontSize: '15px', fontWeight: '700', color: '#0f4c81' }}>Rs. {total.toLocaleString()}</span>
                    </div>
                    <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>{t('Cash Received', 'موصول نقد')}</label>
                    <input type="number" value={cashReceived} onChange={e => setCashReceived(e.target.value)}
                      placeholder={total.toString()}
                      style={{ width: '100%', padding: '12px', border: '2px solid #c8e0ff', borderRadius: '8px', fontSize: '20px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center', color: '#333' }} />
                    <button onClick={() => setCashReceived(String(total))}
                      style={{ marginTop: '8px', padding: '6px 14px', background: '#e3f0ff', border: '1px solid #c8e0ff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#0f4c81', fontWeight: '600' }}>
                      {t('Full', 'پوری')}: Rs. {total.toLocaleString()}
                    </button>
                    {cashReceived && cashReceivedNum < total && cashReceivedNum >= 0 && (
                      <div style={{ marginTop: '10px', padding: '10px', background: '#ffebee', borderRadius: '8px', border: '1px solid #ffcdd2' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: '#c62828', fontWeight: '600' }}>{t('Credit Portion', 'ادھار حصہ')}</span>
                          <span style={{ fontSize: '14px', fontWeight: '700', color: '#c62828' }}>Rs. {(total - cashReceivedNum).toLocaleString()}</span>
                        </div>
                        <p style={{ fontSize: '11px', color: '#e57373', margin: '4px 0 0' }}>{t('Will be added to customer balance', 'گاہک کے بیلنس میں شامل ہوگا')}</p>
                      </div>
                    )}
                    {cashReceived && cashReceivedNum >= total && (
                      <div style={{ marginTop: '10px', padding: '8px 10px', background: '#e8f5e9', borderRadius: '8px' }}>
                        <p style={{ fontSize: '12px', color: '#1a7a4a', fontWeight: '600', margin: 0 }}>✅ {t('Full payment received', 'پوری ادائیگی موصول')}</p>
                      </div>
                    )}
                  </div>
                )}
                {paymentMethod === 'jazzcash' && (
                  <div style={{ marginTop: '10px', padding: '10px', background: '#fff3e0', borderRadius: '8px' }}>
                    <p style={{ fontSize: '12px', color: '#e65100', margin: 0 }}>⚠️ {t('JazzCash goes to office — admin will confirm payment.', 'جیز کیش دفتر کو جاتی ہے — ایڈمن تصدیق کرے گا۔')}</p>
                  </div>
                )}
              </div>

              {/* Total & Complete */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <p style={{ fontSize: '16px', color: '#555', margin: 0 }}>{t('Total', 'کل')}</p>
                  <p style={{ fontSize: '28px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {total.toLocaleString()}</p>
                </div>
                {!isOnline && <p style={{ fontSize: '12px', color: '#ea580c', margin: '0 0 10px', textAlign: 'center' }}>📵 {t('Will save offline', 'آف لائن محفوظ ہوگا')}</p>}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => { setStep(1); setSelectedCustomer(null); setBottlesReturned(0); if (onClearPreSelected) onClearPreSelected() }}
                    style={{ flex: 1, padding: '14px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                    ← {t('Back', 'واپس')}
                  </button>
                  <button onClick={completeSale} disabled={saving}
                    style={{ flex: 2, padding: '14px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
                    {saving ? t('Saving...', 'محفوظ ہو رہا ہے...') : '✓ ' + t('Complete Sale', 'فروخت مکمل کریں')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
