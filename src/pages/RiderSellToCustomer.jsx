import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import * as AccountingEngine from '../accountingEngine'
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
  const [bizSettings, setBizSettings] = useState({})
  const [bottlesReturned, setBottlesReturned] = useState(0)
  const [otherBrandsCollected, setOtherBrandsCollected] = useState(0)
  const [hasChurnIntelligence, setHasChurnIntelligence] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [step, setStep] = useState(1)
  const [showPayInfo, setShowPayInfo] = useState(false)

  // Products from DB
  const [bottleProducts, setBottleProducts] = useState([])
  const [extraProducts, setExtraProducts]   = useState([])
  const [quantities, setQuantities]         = useState({})

  // Payment receipt state
  const [paySearch, setPaySearch]   = useState('')
  const [payResults, setPayResults] = useState([])
  const [payCustomer, setPayCustomer] = useState(null)
  const [payAmount, setPayAmount]   = useState('')
  const [payMethod, setPayMethod]   = useState('cash')
  const [payNotes, setPayNotes]     = useState('')
  const [paySuccess, setPaySuccess] = useState(null)
  const [returnCustomer, setReturnCustomer] = useState(null)
  const [returnSearch, setReturnSearch] = useState('')
  const [returnSearchResults, setReturnSearchResults] = useState([])
  const [returnQty, setReturnQty] = useState(0)
  const [returnSaving, setReturnSaving] = useState(false)
  const [returnSuccess, setReturnSuccess] = useState(null)
  const [paySaving, setPaySaving]   = useState(false)

  function t(en, ur) { return lang === 'ur' ? ur : en }

  async function processBottleReturn() {
    if (!returnCustomer) return alert('Please select a customer')
    if (returnQty <= 0) return alert('Please enter bottles to return')
    if (returnQty > Number(returnCustomer.our_bottles_placed || 0)) return alert('Cannot return more bottles than customer has')
    setReturnSaving(true)
    try {
      const newCount = Number(returnCustomer.our_bottles_placed || 0) - returnQty
      await supabase.from('customers').update({ our_bottles_placed: Math.max(0, newCount) })
        .eq('id', returnCustomer.id).eq('tenant_id', tenantId)
      const { data: bottleProduct } = await supabase.from('products')
        .select('average_cost').eq('tenant_id', tenantId).eq('bottle_type', '19l').eq('product_type', 'trading').maybeSingle()
      const bottleCost = Number(bottleProduct?.average_cost || 900)
      await AccountingEngine.postBottleMovementJournal(-returnQty, bottleCost, tenantId, returnCustomer.id, new Date().toISOString().split('T')[0], rider?.full_name || 'Rider')
      const { data: bp2 } = await supabase.from('products').select('id, current_stock').eq('tenant_id', tenantId).eq('bottle_type', '19l').eq('product_type', 'trading').maybeSingle()
      if (bp2) await supabase.from('products').update({ current_stock: Number(bp2.current_stock || 0) + returnQty }).eq('id', bp2.id)
      setReturnSuccess({ name: returnCustomer.full_name, qty: returnQty, newCount })
      setReturnCustomer(null); setReturnSearch(''); setReturnQty(0)
    } catch (err) { alert('Error: ' + err.message) }
    setReturnSaving(false)
  }

  async function searchReturnCustomer(val) {
    setReturnSearch(val)
    if (val.length < 2) { setReturnSearchResults([]); return }
    const { data } = await supabase.from('customer_balances')
      .select('id, full_name, mobile, customer_code, our_bottles_placed')
      .eq('tenant_id', tenantId).eq('is_active', true)
      .or(`full_name.ilike.%${val}%,mobile.ilike.%${val}%,customer_code.ilike.%${val}%`).limit(5)
    setReturnSearchResults((data || []).filter(c => Number(c.our_bottles_placed || 0) > 0))
  }

  useEffect(() => {
    if (!tenantId) return
    supabase.from('business_settings').select('*').eq('tenant_id', tenantId).then(({ data }) => {
      const map = {}
      data?.forEach(s => { map[s.setting_key] = s.setting_value })
      setBizSettings(map)
    })
    supabase.from('tenants').select('has_churn_intelligence').eq('id', tenantId).maybeSingle().then(({ data }) => {
      setHasChurnIntelligence(data?.has_churn_intelligence || false)
    })
  }, [tenantId])

  useEffect(() => {
    if (tenantId) { fetchProducts(); fetchAndCacheCustomers() }
  }, [tenantId])

  useEffect(() => {
    if (!isOnline) {
      try {
        const cached = localStorage.getItem('cached_customers_' + tenantId)
        if (cached) setCustomers(JSON.parse(cached))
      } catch (err) { console.error('Cache parse error:', err) }
    } else {
      localStorage.removeItem('cached_customers_' + tenantId)
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
    localStorage.removeItem('cached_customers_' + tenantId)
    const { data } = await supabase.from('customer_balances')
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
    const extra  = (data || []).filter(p => !p.bottle_type)
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
    const { data } = await supabase.from('customer_balances')
      .select('*').eq('tenant_id', tenantId).eq('is_active', true)
      .or(`full_name.ilike.%${val}%,mobile.ilike.%${val}%,customer_code.ilike.%${val}%`).limit(5)
    setSearchResults(data || [])
  }

  async function searchPayCustomer(val) {
    setPaySearch(val)
    if (val.length < 2) { setPayResults([]); return }
    if (!isOnline) {
      const filtered = (customers || []).filter(c =>
        c.full_name?.toLowerCase().includes(val.toLowerCase()) ||
        c.mobile?.includes(val) ||
        c.customer_code?.toLowerCase().includes(val.toLowerCase())
      ).slice(0, 5)
      setPayResults(filtered)
      return
    }
    const { data } = await supabase.from('customer_balances')
      .select('*').eq('tenant_id', tenantId).eq('is_active', true)
      .or(`full_name.ilike.%${val}%,mobile.ilike.%${val}%,customer_code.ilike.%${val}%`).limit(5)
    setPayResults(data || [])
  }

  async function selectCustomer(customer) {
    let c = customer
    // Fetch other_brand_bottles_held separately as it's not in customer_balances view
    if (isOnline) {
      const { data: custExtra } = await supabase.from('customers')
        .select('other_brand_bottles_held').eq('id', c.id).maybeSingle()
      c = { ...c, other_brand_bottles_held: custExtra?.other_brand_bottles_held || 0 }
    }
    setSelectedCustomer(c)
    setSelectedRate(c.rate_19l || 100)
    setSearch('')
    setSearchResults([])
    setBottlesReturned(0)
    setOtherBrandsCollected(0)
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
    const extraTotal  = extraProducts.reduce((s, p) => s + (quantities[p.id] || 0) * Number(p.sale_price || 0), 0)
    const subTotal    = (qty19l * (selectedRate || 0)) + bottleTotal + extraTotal
    const taxRate     = selectedCustomer?.is_tax_applicable ? Number(selectedCustomer?.tax_rate || 16) : 0
    const taxAmount   = Math.round(subTotal * taxRate / 100)
    return subTotal + taxAmount
  }

  function taxAmount() {
    const bottleTotal = bottleProducts.reduce((s, p) => s + (quantities[p.id] || 0) * getBottleRate(p), 0)
    const extraTotal  = extraProducts.reduce((s, p) => s + (quantities[p.id] || 0) * Number(p.sale_price || 0), 0)
    const subTotal    = (qty19l * (selectedRate || 0)) + bottleTotal + extraTotal
    const taxRate     = selectedCustomer?.is_tax_applicable ? Number(selectedCustomer?.tax_rate || 16) : 0
    return Math.round(subTotal * taxRate / 100)
  }

  function subTotal() {
    const bottleTotal = bottleProducts.reduce((s, p) => s + (quantities[p.id] || 0) * getBottleRate(p), 0)
    const extraTotal  = extraProducts.reduce((s, p) => s + (quantities[p.id] || 0) * Number(p.sale_price || 0), 0)
    return (qty19l * (selectedRate || 0)) + bottleTotal + extraTotal
  }

  // ── RECEIVE PAYMENT ──────────────────────────────────────────────
  async function receivePayment() {
    if (!payCustomer) return alert('Please select a customer')
    if (!payAmount || Number(payAmount) <= 0) return alert('Please enter payment amount')
    setPaySaving(true)

    const amount  = Number(payAmount)
    const isJazz  = payMethod === 'jazzcash'
    const isPending = ['jazzcash', 'easypaisa', 'bank'].includes(payMethod)

    if (!isOnline) {
      const offlinePayments = JSON.parse(localStorage.getItem('offline_payments_' + tenantId) || '[]')
      offlinePayments.push({
        tenant_id: tenantId, customer_id: payCustomer.id, rider_id: rider.id,
        amount, payment_method: payMethod,
        payment_date: new Date().toISOString().split('T')[0],
        jazzcash_confirmed: !isPending,
        notes: payNotes || `Payment received by rider ${rider.full_name}`,
        is_voided: false,
        _offlineId: 'offline-' + Date.now(), _savedAt: new Date().toISOString()
      })
      localStorage.setItem('offline_payments_' + tenantId, JSON.stringify(offlinePayments))
      if (!isPending) {
        const cached = JSON.parse(localStorage.getItem('cached_customers_' + tenantId) || '[]')
        const updated = cached.map(c => c.id === payCustomer.id ? { ...c, balance: Number(c.balance || 0) - amount } : c)
        localStorage.setItem('cached_customers_' + tenantId, JSON.stringify(updated))
        setCustomers(updated)
      }
      setPaySuccess({ name: payCustomer.full_name, amount, method: payMethod, newBalance: Number(payCustomer.balance || 0) - amount, jazzPending: isPending, savedOffline: true })
      setPayCustomer(null); setPaySearch(''); setPayAmount(''); setPayNotes('')
      setPaySaving(false)
      return
    }

    const { data: savedPayment, error } = await supabase.from('payments').insert([{
      tenant_id: tenantId, customer_id: payCustomer.id, rider_id: rider.id,
      amount, payment_method: payMethod,
      payment_date: new Date().toISOString().split('T')[0],
      jazzcash_confirmed: !isPending,
      notes: payNotes || `Payment received by rider ${rider.full_name}`,
      is_voided: false
    }]).select().single()

    if (error) { alert('Error: ' + error.message); setPaySaving(false); return }

    if (!isPending) {
      const newBalance = Number(payCustomer.balance || 0) - amount
      await supabase.from('customers').update({ balance: newBalance }).eq('id', payCustomer.id).eq('tenant_id', tenantId)
    }

    try {
      const { postPaymentJournal } = AccountingEngine
      await postPaymentJournal(savedPayment, tenantId, true)
    } catch (err) { console.error('Journal error:', err) }

    setPaySuccess({
      name: payCustomer.full_name, customerMobile: payCustomer.mobile || '', amount, method: payMethod,
      newBalance: !isPending ? Number(payCustomer.balance || 0) - amount : payCustomer.balance,
      jazzPending: isPending
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
    if (!isCredit) {
      const recv = Number(cashReceived) || 0
      if (recv < 0) return alert('Amount received cannot be negative')
      if (recv > total) return alert('Amount received cannot exceed total Rs. ' + total.toLocaleString())
    }

    setSaving(true)
    const isCash2   = paymentMethod === 'cash'
    const isJazz   = paymentMethod === 'jazzcash'
    const isPending = ['jazzcash', 'easypaisa', 'bank'].includes(paymentMethod)
    const received = isCredit ? 0 : Number(cashReceived) || 0
    const creditPortion = isCredit ? total : Math.max(0, total - received)
    const isCash = isCash2
    const now = new Date().toISOString()

    let deliveryLat = null, deliveryLng = null
    try {
      const position = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
      )
      deliveryLat = position.coords.latitude
      deliveryLng = position.coords.longitude
    } catch (err) { console.log('GPS not available:', err.message) }

    const tax = taxAmount()
    const sub = subTotal()
    const deliveryData = {
      tenant_id: tenantId,
      customer_id: selectedCustomer.id,
      rider_id: rider.id,
      qty_19l: qty19l,
      qty_half_litre: qtyHalf,
      qty_1_5l: qty15l,
      rate_applied: selectedRate || 0,
      total_amount: sub,
      tax_amount: tax,
      total_with_tax: total,
      payment_method: paymentMethod,
      amount_received: isPending ? 0 : received,
      credit_amount: creditPortion,
      jazzcash_confirmed: false,
      delivered_at: now,
      is_voided: false,
      delivery_lat: deliveryLat,
      delivery_lng: deliveryLng,
      bottles_returned: bottlesReturned,
      other_brand_bottles: otherBrandsCollected,
    }

    let onlineDelivery = null
    if (isOnline) {
      const { data: savedDelivery, error } = await supabase
        .from('deliveries').insert([deliveryData]).select().single()
      if (error) { alert('Error: ' + error.message); setSaving(false); return }
      onlineDelivery = { ...savedDelivery }

      if (creditPortion > 0) {
        await supabase.from('customers').update({ balance: Number(selectedCustomer.balance) + creditPortion }).eq('id', selectedCustomer.id)
      }

      // Update bottles placed — our bottles and other brand bottles
      const currentBottles      = Number(selectedCustomer.our_bottles_placed || 0)
      const currentOtherBrands  = Number(selectedCustomer.other_brand_bottles_held || 0)
      const newOurBottles       = Math.max(0, currentBottles + qty19l - bottlesReturned)
      const newOtherBrandsHeld  = Math.max(0, currentOtherBrands - otherBrandsCollected)
      await supabase.from('customers')
        .update({
          our_bottles_placed: newOurBottles,
          other_brand_bottles_held: newOtherBrandsHeld,
        })
        .eq('id', selectedCustomer.id).eq('tenant_id', tenantId)

      // Deduct stock + COGS for all sold products
      const allSold = [...bottleProducts, ...extraProducts].filter(p => (quantities[p.id] || 0) > 0)
      for (const p of allSold) {
        const qtySold = quantities[p.id]
        await supabase.from('products')
          .update({ current_stock: Math.max(0, Number(p.current_stock || 0) - qtySold) })
          .eq('id', p.id).eq('tenant_id', tenantId)
        if (p.product_type === 'finished_good' || p.product_type === 'trading') {
          const avgCost  = Number(p.average_cost || p.purchase_price || 0)
          const cogsCost = qtySold * avgCost
          if (cogsCost > 0) {
            try {
              const { data: je } = await supabase.from('journal_entries').insert([{
                tenant_id: tenantId, entry_date: now.split('T')[0],
                reference_type: 'cogs', reference_id: savedDelivery.id,
                narration: `COGS — ${p.name} × ${qtySold}`, total_amount: cogsCost, created_by: 'system'
              }]).select().single()
              if (je) {
                const saleAmount = Number(p.selling_price || p.unit_cost || 0) * qtySold
                await supabase.from('journal_entry_lines').insert([
                  { tenant_id: tenantId, journal_entry_id: je.id, account_code: '5003', account_name: 'Cost of Goods Sold', debit: cogsCost, credit: 0 },
                  { tenant_id: tenantId, journal_entry_id: je.id, account_code: p.product_type === 'trading' ? '1202' : '1201', account_name: p.product_type === 'trading' ? 'Inventory - Trading Items' : 'Inventory - Finished Goods', debit: 0, credit: cogsCost },
                  { tenant_id: tenantId, journal_entry_id: je.id, account_code: '1001', account_name: 'Cash in Hand', debit: saleAmount, credit: 0 },
                  { tenant_id: tenantId, journal_entry_id: je.id, account_code: '4004', account_name: 'Other Product Sales', debit: 0, credit: saleAmount },
                ])
              }
            } catch (err) { console.error('COGS error:', err) }
          }
        }
      }

      // Save line items
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
          sellItems.push({ tenant_id: tenantId, delivery_id: savedDelivery.id, product_id: p.id, product_name: p.name, bottle_type: p.bottle_type, qty: quantities[p.id], rate, amount: quantities[p.id] * rate })
        }
      })
      extraProducts.forEach(p => {
        if ((quantities[p.id] || 0) > 0) {
          const rate = Number(p.sale_price || 0)
          sellItems.push({ tenant_id: tenantId, delivery_id: savedDelivery.id, product_id: p.id, product_name: p.name, bottle_type: null, qty: quantities[p.id], rate, amount: quantities[p.id] * rate })
        }
      })
      if (sellItems.length > 0) await supabase.from('delivery_items').insert(sellItems)

      try {
        const { postDeliveryJournal } = AccountingEngine
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

      // Save GPS on first delivery
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

    setSuccess({ customer: selectedCustomer.full_name, customerMobile: selectedCustomer.mobile || '', total, received, creditPortion, paymentMethod, bottlesReturned, otherBrandsCollected, savedOffline: !isOnline, deliveryRaw: onlineDelivery ? { ...onlineDelivery } : null, customerRaw: selectedCustomer })
    setSelectedCustomer(null)
    setQty19l(1); setSelectedRate(null); setPaymentMethod(null); setCashReceived('')
    setBottlesReturned(0); setOtherBrandsCollected(0); setStep(1)
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
  const isCash = paymentMethod === 'cash'
  const isCredit = paymentMethod === 'credit'
  const isPending = ['jazzcash', 'easypaisa', 'bank'].includes(paymentMethod)

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '12px' }}>🏪 {t('Sell & Receive', 'فروخت اور وصولی')}</h2>

      {/* Payment Info Card */}
      {(bizSettings.jazzcash_number_1 || bizSettings.jazzcash_number_2 || bizSettings.bank_account_number) && (
        <div style={{ marginBottom: '12px', border: '1px solid #e0e8ff', borderRadius: '10px', overflow: 'hidden' }}>
          <button onClick={() => setShowPaymentInfo && setShowPaymentInfo(p => !p)}
            style={{ width: '100%', padding: '10px 14px', background: '#f0f4ff', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            onClick={() => setShowPayInfo(p => !p)}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81' }}>💳 Payment Account Details</span>
            <span style={{ fontSize: '16px', color: '#0f4c81' }}>{showPayInfo ? '▲' : '▼'}</span>
          </button>
          {showPayInfo && (
            <div style={{ padding: '10px 14px', background: 'white' }}>
              {bizSettings.jazzcash_number_1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <span style={{ fontSize: '12px', color: '#9c27b0', fontWeight: '600' }}>📱 JazzCash</span>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: 0 }}>{bizSettings.jazzcash_number_1}</p>
                    {bizSettings.jazzcash_name_1 && <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{bizSettings.jazzcash_name_1}</p>}
                  </div>
                </div>
              )}
              {bizSettings.jazzcash_number_2 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <span style={{ fontSize: '12px', color: '#4caf50', fontWeight: '600' }}>💚 EasyPaisa</span>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: 0 }}>{bizSettings.jazzcash_number_2}</p>
                    {bizSettings.jazzcash_name_2 && <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{bizSettings.jazzcash_name_2}</p>}
                  </div>
                </div>
              )}
              {bizSettings.bank_account_number && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ fontSize: '12px', color: '#0f4c81', fontWeight: '600' }}>🏦 {bizSettings.bank_name || 'Bank'}</span>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '13px', fontWeight: '700', color: '#333', margin: 0 }}>{bizSettings.bank_account_number}</p>
                    {bizSettings.bank_account_title && <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{bizSettings.bank_account_title}</p>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

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
        <button onClick={() => { setSubTab('return'); setReturnSuccess(null); setReturnCustomer(null); setReturnSearch(''); setReturnQty(0) }}
          style={{ flex: 1, padding: '10px 6px', border: '2px solid', borderColor: subTab === 'return' ? '#e65100' : '#eee', borderRadius: '10px', cursor: 'pointer', background: subTab === 'return' ? '#e65100' : 'white', color: subTab === 'return' ? 'white' : '#555', fontWeight: '700', fontSize: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
          <span style={{ fontSize: '20px' }}>🫙</span>
          <span>{t('Return', 'واپسی')}</span>
          <span>{t('Bottles', 'بوتلیں')}</span>
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
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => setPaySuccess(null)}
                  style={{ padding: '4px 12px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '12px' }}>
                  + {t('New Payment', 'نئی ادائیگی')}
                </button>
                {paySuccess?.customerMobile && (() => {
                  const phone = paySuccess.customerMobile.replace(/\D/g, '').replace(/^0/, '').replace(/^92/, '')
                  const waNumber = phone ? `92${phone}` : ''
                  const bizName = bizSettings.business_name || 'AquaRun'
                  const msg = `*${bizName} — Payment Received*\n\n` +
                    `👤 ${paySuccess.name}\n` +
                    `💰 Amount: Rs. ${paySuccess.amount.toLocaleString()}\n` +
                    `💳 Method: ${paySuccess.method}\n` +
                    (paySuccess.jazzPending ? `⚠️ Pending confirmation\n` : '') +
                    (!paySuccess.jazzPending && paySuccess.newBalance > 0 ? `📊 Remaining: Rs. ${paySuccess.newBalance.toLocaleString()}\n` : '') +
                    (!paySuccess.jazzPending && paySuccess.newBalance <= 0 ? `✅ Account Clear\n` : '') +
                    `\n_Thank you!_\n_${bizName}_`
                  const url = waNumber
                    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`
                    : `https://wa.me/?text=${encodeURIComponent(msg)}`
                  return (
                    <button onClick={() => window.open(url, '_blank')}
                      style={{ padding: '4px 12px', background: '#25d366', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}>
                      💬 WhatsApp
                    </button>
                  )
                })()}
              </div>
            </div>
          )}

          {/* Customer Search */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>{t('Search Customer', 'کسٹمر تلاش کریں')}</p>
            {payCustomer ? (
              <div style={{ padding: '12px 14px', background: '#e3f0ff', borderRadius: '8px', border: '1px solid #c8d8ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontWeight: '700', fontSize: '15px', margin: '0 0 2px', color: '#0f4c81' }}>{payCustomer.full_name}</p>
                  <p style={{ fontSize: '12px', color: '#555', margin: '0 0 2px' }}>{payCustomer.mobile}</p>
                  {payCustomer.address && <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px' }}>📍 {payCustomer.address}</p>}
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
                  <div key={c.id} onClick={() => { setPayCustomer(c); setPaySearch(''); setPayResults([]) }}
                    style={{ padding: '12px 14px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', background: 'white' }}>
                    <p style={{ fontWeight: '700', margin: '0 0 2px', color: '#333' }}>{c.full_name}</p>
                    <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>{c.mobile}</p>
                    {Number(c.balance || 0) > 0 && <p style={{ fontSize: '11px', color: '#f44336', margin: '2px 0 0', fontWeight: '600' }}>⚠️ {t('Outstanding', 'باقی')}: Rs. {Number(c.balance).toLocaleString()}</p>}
                    {Number(c.balance || 0) < 0 && <p style={{ fontSize: '11px', color: '#1a7a4a', margin: '2px 0 0', fontWeight: '600' }}>✅ {t('Advance', 'ایڈوانس')}: Rs. {Math.abs(Number(c.balance)).toLocaleString()}</p>}
                    {Number(c.our_bottles_placed || 0) > 0 && <p style={{ fontSize: '11px', color: '#e65100', margin: '2px 0 0', fontWeight: '600' }}>🫙 {c.our_bottles_placed} {t('bottles with customer', 'بوتلیں گاہک کے پاس')}</p>}
                    {c.address && <p style={{ fontSize: '11px', color: '#aaa', margin: '2px 0 0' }}>📍 {c.address}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {payCustomer && (
            <div>
              {/* Amount */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>{t('Amount', 'رقم')}</p>
                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  placeholder="0"
                  style={{ width: '100%', padding: '14px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '24px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center', color: '#333' }} />
                {Number(payCustomer.balance) > 0 && (
                  <button onClick={() => setPayAmount(String(payCustomer.balance))}
                    style={{ marginTop: '8px', padding: '6px 14px', background: '#e3f0ff', border: '1px solid #c8d8ff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#0f4c81', fontWeight: '600' }}>
                    {t('Full Balance', 'پوری رقم')}: Rs. {Number(payCustomer.balance).toLocaleString()}
                  </button>
                )}
              </div>

              {/* Payment Method */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>{t('Payment Method', 'ادائیگی کا طریقہ')}</p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[
                    { key: 'cash',      label: t('نقد', 'نقد'),       sublabel: 'Cash',      color: '#1a7a4a' },
                    { key: 'jazzcash',  label: t('جیز کیش', 'جیز کیش'), sublabel: 'JazzCash',  color: '#9c27b0' },
                    ...(bizSettings?.jazzcash_number_2 ? [{ key: 'easypaisa', label: t('ایزی پیسہ', 'ایزی پیسہ'), sublabel: 'EasyPaisa', color: '#4caf50' }] : []),
                    ...(bizSettings?.bank_name ? [{ key: 'bank', label: t('بینک', 'بینک'), sublabel: 'Bank', color: '#0f4c81' }] : []),
                  ].map(pm => (
                    <button key={pm.key} onClick={() => setPayMethod(pm.key)}
                      style={{ flex: 1, padding: '10px 6px', border: '2px solid', borderColor: payMethod === pm.key ? pm.color : '#eee', borderRadius: '10px', cursor: 'pointer', background: payMethod === pm.key ? pm.color : 'white', color: payMethod === pm.key ? 'white' : '#555', fontWeight: '700', fontSize: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <span>{pm.label}</span>
                      <span style={{ fontSize: '10px', opacity: 0.8 }}>{pm.sublabel}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <input value={payNotes} onChange={e => setPayNotes(e.target.value)}
                  placeholder={t('Notes (optional)', 'نوٹ (اختیاری)')}
                  style={{ width: '100%', padding: '10px', border: '1.5px solid #ddd', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', color: '#333' }} />
              </div>

              <button onClick={receivePayment} disabled={paySaving}
                style={{ width: '100%', padding: '14px', background: paySaving ? '#e0e0e0' : '#f59e0b', color: 'white', border: 'none', borderRadius: '10px', cursor: paySaving ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: '700' }}>
                {paySaving ? t('Saving...', 'محفوظ ہو رہا ہے...') : '✓ ' + t('Receive Payment', 'ادائیگی وصول کریں')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── SELL TO CUSTOMER TAB ── */}
      {subTab === 'customer' && (
        <div>
          {success && (
            <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
              <p style={{ fontWeight: '700', color: '#1b5e20', margin: '0 0 4px' }}>✅ {t('Sale Complete!', 'فروخت مکمل!')}</p>
              <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>👤 {success.customer}</p>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 2px' }}>Rs. {success.total.toLocaleString()} — {success.paymentMethod}</p>
              {success.bottlesReturned > 0 && <p style={{ fontSize: '13px', color: '#e65100', margin: '0 0 2px' }}>🫙 {success.bottlesReturned} {t('our bottles returned', 'ہماری بوتلیں واپس')}</p>}
      {success.otherBrandsCollected > 0 && <p style={{ fontSize: '13px', color: '#0f4c81', margin: '0 0 2px' }}>🔄 {success.otherBrandsCollected} {t('competitor bottles collected', 'دوسرے برانڈ کی بوتلیں واپس لی')}</p>}
              {success.savedOffline && <p style={{ fontSize: '11px', color: '#e65100', margin: '4px 0 0', fontWeight: '600' }}>📵 {t('Saved offline — will sync when online', 'آف لائن محفوظ — آن لائن ہونے پر سنک ہوگا')}</p>}
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => setSuccess(null)}
                  style={{ padding: '4px 12px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '12px' }}>
                  + {t('New Sale', 'نئی فروخت')}
                </button>
                {success?.deliveryRaw && (
                  <button onClick={() => {
                    const win = window.open('about:blank', '_blank')
                const d = success.deliveryRaw
                    const c = success.customerRaw
                    const qty19l = Number(d.qty_19l || 0)
                    const qtyHalf = Number(d.qty_half_litre || 0)
                    const qty1_5l = Number(d.qty_1_5l || 0)
                    const rate = Number(d.rate_applied || c?.rate_19l || 0)
                    const subTotal = qty19l * rate + qtyHalf * Number(c?.rate_half_litre || 0) + qty1_5l * Number(c?.rate_1_5l || 0)
                    const tax = Math.round(Number(d.tax_amount || 0))
                    const grandTotal = subTotal + tax
                    const amountPaid = Number(d.amount_received || grandTotal)
                    const balanceDue = Math.max(0, grandTotal - amountPaid)
                    const today = new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
                    const payLabel = d.payment_method === 'cash' ? 'Cash' : d.payment_method === 'jazzcash' ? 'JazzCash' : d.payment_method === 'easypaisa' ? 'EasyPaisa' : 'Credit'
                    win.document.write(`<!DOCTYPE html>
<html><head><title>Receipt</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Courier New', monospace; width: 76mm; margin: 0 auto; font-size: 11px; color: #000; padding: 2mm; }
  @media print { button { display: none !important; } @page { size: 80mm auto; margin: 0mm 2mm; } body { width: 76mm; } }
</style>
</head><body>
  <div style="text-align:center;margin-bottom:8px">
    <p style="font-weight:700;font-size:14px;margin:0 0 2px">${bizSettings.business_name || 'AquaRun'}</p>
    ${bizSettings.business_tagline ? `<p style="font-size:9px;margin:0 0 2px;font-style:italic">${bizSettings.business_tagline}</p>` : ''}
    ${bizSettings.business_address ? `<p style="font-size:9px;margin:0 0 2px">${bizSettings.business_address}</p>` : ''}
    ${bizSettings.ntn_number ? `<p style="font-size:9px;margin:0 0 2px">NTN: ${bizSettings.ntn_number}</p>` : ''}
    ${bizSettings.complaint_number ? `<p style="font-size:9px;margin:0">Tel: ${bizSettings.complaint_number}</p>` : ''}
  </div>
  <div style="border-top:1px dashed #000;border-bottom:1px dashed #000;padding:5px 0;margin:6px 0">
    <div style="display:flex;justify-content:space-between;font-size:10px"><span>Invoice:</span><span style="font-weight:700">${d.invoice_number || '—'}</span></div>
    <div style="display:flex;justify-content:space-between;font-size:10px"><span>Date:</span><span>${today}</span></div>
    <div style="display:flex;justify-content:space-between;font-size:10px"><span>Customer:</span><span style="font-weight:600">${c?.full_name || 'Walk-in'}</span></div>
    ${c?.mobile ? `<div style="display:flex;justify-content:space-between;font-size:10px"><span>Mobile:</span><span>${c.mobile}</span></div>` : ''}
  </div>
  <div style="margin:6px 0">
    ${qty19l > 0 ? `<div style="margin-bottom:4px"><div style="font-size:10px;font-weight:600">19 Litre Water Bottle</div><div style="display:flex;justify-content:space-between;font-size:10px;padding-left:4px"><span>${qty19l} x Rs.${rate.toLocaleString()}</span><span style="font-weight:600">Rs. ${(qty19l * rate).toLocaleString()}</span></div></div>` : ''}
    ${qtyHalf > 0 ? `<div style="margin-bottom:4px"><div style="font-size:10px;font-weight:600">Half Litre Water Bottle</div><div style="display:flex;justify-content:space-between;font-size:10px;padding-left:4px"><span>${qtyHalf} x Rs.${Number(c?.rate_half_litre || 0).toLocaleString()}</span><span style="font-weight:600">Rs. ${(qtyHalf * Number(c?.rate_half_litre || 0)).toLocaleString()}</span></div></div>` : ''}
    ${qty1_5l > 0 ? `<div style="margin-bottom:4px"><div style="font-size:10px;font-weight:600">1.5 Litre Water Bottle</div><div style="display:flex;justify-content:space-between;font-size:10px;padding-left:4px"><span>${qty1_5l} x Rs.${Number(c?.rate_1_5l || 0).toLocaleString()}</span><span style="font-weight:600">Rs. ${(qty1_5l * Number(c?.rate_1_5l || 0)).toLocaleString()}</span></div></div>` : ''}
  </div>
  <div style="border-top:1px dashed #000;padding-top:5px;margin-top:4px">
    <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px"><span>Subtotal</span><span>Rs. ${subTotal.toLocaleString()}</span></div>
    ${tax > 0 ? `<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px"><span>Tax</span><span>Rs. ${tax.toLocaleString()}</span></div>` : ''}
    <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;border-top:1px dashed #000;margin-top:4px;padding-top:4px"><span>TOTAL</span><span>Rs. ${grandTotal.toLocaleString()}</span></div>
    <div style="font-size:10px;margin-top:4px">Payment: ${payLabel}</div>
    ${d.payment_method === 'cash' ? `
    <div style="display:flex;justify-content:space-between;font-size:10px;margin-top:4px"><span>Amount Paid</span><span>Rs. ${amountPaid.toLocaleString()}</span></div>
    <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;margin-top:2px;border-top:1px dashed #000;padding-top:3px"><span>Balance Due</span><span>Rs. ${balanceDue.toLocaleString()}</span></div>` : ''}
  </div>
  <div style="text-align:center;margin-top:10px;border-top:1px dashed #000;padding-top:7px">
    <p style="font-size:10px;margin:0 0 2px;font-weight:600">Thank you for your business!</p>
    ${bizSettings.whatsapp_number ? `<p style="font-size:9px;margin:0 0 3px">WhatsApp: ${bizSettings.whatsapp_number}</p>` : ''}
    <p style="font-size:8px;margin:0;color:#999">Powered by AquaRun</p>
  </div>
</body></html>`)
                    win.document.close()
                    setTimeout(() => { try { win.focus(); win.print(); } catch(e) {} }, 2500)
                  }}
                    style={{ padding: '4px 12px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}>
                    🧾 Print Receipt
                  </button>
                )}
                {success?.customerMobile && (() => {
                  const phone = success.customerMobile.replace(/\D/g, '').replace(/^0/, '').replace(/^92/, '')
                  const waNumber = phone ? `92${phone}` : ''
                  const bizName = bizSettings.business_name || 'AquaRun'
                  const msg = `*${bizName} — Sale Receipt*\n\n` +
                    `👤 ${success.customer}\n` +
                    `💰 Total: Rs. ${success.total.toLocaleString()}\n` +
                    `💳 Payment: ${success.paymentMethod}\n` +
                    (success.creditPortion > 0 ? `📋 Credit: Rs. ${success.creditPortion.toLocaleString()}\n` : '') +
                    `\n_Thank you!_\n_${bizName}_`
                  const url = waNumber
                    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`
                    : `https://wa.me/?text=${encodeURIComponent(msg)}`
                  return (
                    <button onClick={() => window.open(url, '_blank')}
                      style={{ padding: '4px 12px', background: '#25d366', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}>
                      💬 WhatsApp
                    </button>
                  )
                })()}
              </div>
            </div>
          )}

          {step === 1 && (
            <div>
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>{t('Search Customer', 'کسٹمر تلاش کریں')}</p>
                <input value={search} onChange={e => searchCustomer(e.target.value)}
                  placeholder={t('Name, mobile or customer ID...', 'نام، موبائل یا ID...')}
                  style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '15px', outline: 'none', boxSizing: 'border-box', color: '#333' }} />
                {searchResults.map(c => (
                  <div key={c.id} onClick={() => selectCustomer(c)}
                    style={{ padding: '12px 14px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}>
                    <p style={{ fontWeight: '700', margin: '0 0 2px', color: '#333' }}>{c.full_name}</p>
                    <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
                      {c.mobile} · Rs. {Number(c.rate_19l || 0)}/bottle
                      {Number(c.balance) > 0 && ` · Balance: Rs. ${Number(c.balance).toLocaleString()}`}
                    </p>
                    {c.address && <p style={{ fontSize: '11px', color: '#aaa', margin: '2px 0 0' }}>📍 {c.address}</p>}
                    {Number(c.our_bottles_placed) > 0 && (
                      <p style={{ fontSize: '10px', color: '#e65100', margin: 0 }}>🫙 {c.our_bottles_placed} {t('bottles', 'بوتلیں')}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 2 && selectedCustomer && (
            <div>
              {/* Customer Header */}
              <div style={{ background: '#0f4c81', color: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: '700', fontSize: '16px', margin: '0 0 4px' }}>{selectedCustomer.full_name}</p>
                    <p style={{ fontSize: '12px', opacity: 0.8, margin: '0 0 2px' }}>{selectedCustomer.mobile}</p>
                    {selectedCustomer.address && <p style={{ fontSize: '11px', opacity: 0.7, margin: '0 0 4px' }}>📍 {selectedCustomer.address}</p>}
                    {Number(selectedCustomer.our_bottles_placed) > 0 && (
                      <p style={{ fontSize: '11px', opacity: 0.8, margin: 0 }}>🫙 {selectedCustomer.our_bottles_placed} {t('our bottles', 'ہماری بوتلیں')}</p>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {Number(selectedCustomer.balance) !== 0 && (
                      <p style={{ fontSize: '14px', fontWeight: '700', margin: 0, color: Number(selectedCustomer.balance) > 0 ? '#ff8a80' : '#b9f6ca' }}>
                        {Number(selectedCustomer.balance) > 0 ? t('Owes', 'واجب') : t('Advance', 'ایڈوانس')}: Rs. {Math.abs(Number(selectedCustomer.balance)).toLocaleString()}
                      </p>
                    )}
                    <button onClick={() => { setStep(1); setSelectedCustomer(null); if (onClearPreSelected) onClearPreSelected() }}
                      style={{ marginTop: '6px', padding: '4px 10px', background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '11px' }}>
                      ← {t('Change', 'تبدیل')}
                    </button>
                  </div>
                </div>
              </div>

              {/* 19L Bottles */}
              <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: 0 }}>🫙 {t('19L Bottles', '19 لیٹر بوتلیں')}</p>
                  {numBtn(qty19l, setQty19l, 0)}
                </div>
              </div>

              {/* Other bottle products */}
              {bottleProducts.map(p => (
                <div key={p.id} style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: '0 0 2px' }}>{p.name}</p>
                      <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Rs. {getBottleRate(p)}/unit</p>
                    </div>
                    {numBtn(quantities[p.id] || 0, v => setQuantities(q => ({ ...q, [p.id]: v })))}
                  </div>
                </div>
              ))}

              {/* Extra products */}
              {extraProducts.map(p => (
                <div key={p.id} style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: '0 0 2px' }}>{p.name}</p>
                      <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Rs. {p.sale_price}/unit · Stock: {p.current_stock}</p>
                    </div>
                    {numBtn(quantities[p.id] || 0, v => setQuantities(q => ({ ...q, [p.id]: v })))}
                  </div>
                </div>
              ))}

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
                    { key: 'cash',     label: t('نقد', 'نقد'),         sublabel: t('Cash', 'Cash'),     color: '#1a7a4a' },
                    { key: 'jazzcash', label: t('جیز کیش', 'جیز کیش'), sublabel: 'JazzCash',             color: '#9c27b0' },
                    ...(bizSettings?.jazzcash_number_2 ? [{ key: 'easypaisa', label: t('ایزی پیسہ', 'ایزی پیسہ'), sublabel: 'EasyPaisa', color: '#4caf50' }] : []),
                    ...(bizSettings?.bank_name ? [{ key: 'bank', label: t('بینک', 'بینک'), sublabel: 'Bank', color: '#0f4c81' }] : []),
                    { key: 'credit',   label: t('ادھار', 'ادھار'),     sublabel: t('Credit', 'Credit'), color: '#f44336' },
                  ].map(pm => (
                    <button key={pm.key} onClick={() => { setPaymentMethod(pm.key); setCashReceived('') }}
                      style={{ flex: 1, padding: '14px 8px', border: '2px solid', borderColor: paymentMethod === pm.key ? pm.color : '#eee', borderRadius: '10px', cursor: 'pointer', background: paymentMethod === pm.key ? pm.color : 'white', color: paymentMethod === pm.key ? 'white' : '#555', fontWeight: '700', fontSize: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <span>{pm.label}</span>
                      <span style={{ fontSize: '10px', opacity: 0.8 }}>{pm.sublabel}</span>
                    </button>
                  ))}
                </div>

                {paymentMethod && paymentMethod !== 'credit' && total > 0 && (
                  <div style={{ marginTop: '14px', background: '#f0f7ff', borderRadius: '10px', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{ fontSize: '13px', color: '#555' }}>{t('Total', 'کل')}</span>
                      <span style={{ fontSize: '15px', fontWeight: '700', color: '#0f4c81' }}>Rs. {total.toLocaleString()}</span>
                    </div>
                    <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>
                      {isCash ? t('Cash Received', 'موصول نقد') : t('Amount Received (partial allowed)', 'موصول رقم (جزوی ممکن ہے)')}
                    </label>
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
                          <span style={{ fontSize: '13px', color: '#c62828', fontWeight: '600' }}>{t('Remaining (Credit)', 'باقی ادھار')}</span>
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
                    {!cashReceived && (
                      <div style={{ marginTop: '8px', padding: '8px 10px', background: '#fff8e1', borderRadius: '8px' }}>
                        <p style={{ fontSize: '11px', color: '#b45309', margin: 0 }}>⚠️ {t('Leave empty or enter 0 to add full amount to credit', 'خالی چھوڑیں یا 0 لکھیں تو پوری رقم ادھار میں جائے گی')}</p>
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
                  <button onClick={() => { setStep(1); setSelectedCustomer(null); setBottlesReturned(0); setOtherBrandsCollected(0); if (onClearPreSelected) onClearPreSelected() }}
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
      {/* ── RETURN BOTTLES TAB ── */}
      {subTab === 'return' && (
        <div>
          {returnSuccess && (
            <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '14px', marginBottom: '14px' }}>
              <p style={{ fontWeight: '700', color: '#1b5e20', margin: '0 0 4px' }}>✅ {t('Bottles Returned!', 'بوتلیں واپس!')}</p>
              <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>👤 {returnSuccess.name}</p>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#e65100', margin: '0 0 2px' }}>🫙 {returnSuccess.qty} {t('bottles returned', 'بوتلیں واپس')}</p>
              <p style={{ fontSize: '12px', color: '#555', margin: '0 0 8px' }}>{t('Remaining with customer', 'گاہک کے پاس باقی')}: <strong>{returnSuccess.newCount}</strong></p>
              <button onClick={() => setReturnSuccess(null)} style={{ padding: '5px 14px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                + {t('New Return', 'نئی واپسی')}
              </button>
            </div>
          )}

          <div style={{ background: 'white', borderRadius: '12px', padding: '14px', marginBottom: '10px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '8px', textTransform: 'uppercase' }}>{t('Select Customer', 'گاہک منتخب کریں')} *</p>
            {returnCustomer ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#fff3e0', borderRadius: '8px', border: '1px solid #ffcc80' }}>
                <div>
                  <p style={{ fontWeight: '700', fontSize: '14px', margin: '0 0 2px', color: '#e65100' }}>{returnCustomer.full_name}</p>
                  <p style={{ fontSize: '11px', color: '#555', margin: '0 0 4px' }}>{returnCustomer.mobile}</p>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>🫙 {returnCustomer.our_bottles_placed} {t('bottles with customer', 'بوتلیں گاہک کے پاس')}</p>
                </div>
                <button onClick={() => { setReturnCustomer(null); setReturnSearch(''); setReturnQty(0) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '20px' }}>✕</button>
              </div>
            ) : (
              <div>
                <input value={returnSearch} onChange={e => searchReturnCustomer(e.target.value)} placeholder={t('Search customer with bottles...', 'گاہک تلاش کریں...')}
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e0e0e0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                {returnSearchResults.map(c => (
                  <div key={c.id} onClick={() => { setReturnCustomer(c); setReturnSearchResults([]); setReturnSearch(''); setReturnQty(Number(c.our_bottles_placed || 0)) }}
                    style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', marginTop: '4px', borderRadius: '8px', border: '1px solid #eee' }}>
                    <div>
                      <p style={{ fontWeight: '600', fontSize: '13px', margin: '0 0 1px' }}>{c.full_name}</p>
                      <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{c.mobile}</p>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#e65100', background: '#fff3e0', padding: '3px 10px', borderRadius: '20px' }}>🫙 {c.our_bottles_placed}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {returnCustomer && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '8px', textTransform: 'uppercase' }}>{t('Bottles to Return', 'واپس کرنے والی بوتلیں')}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', padding: '12px 0' }}>
                <button onClick={() => setReturnQty(Math.max(0, returnQty - 1))}
                  style={{ width: '44px', height: '44px', borderRadius: '50%', border: '1.5px solid #ddd', background: '#f5f5f5', fontSize: '20px', cursor: 'pointer', fontWeight: '700' }}>−</button>
                <span style={{ fontSize: '40px', fontWeight: '800', color: returnQty > 0 ? '#e65100' : '#ccc', minWidth: '60px', textAlign: 'center' }}>{returnQty}</span>
                <button onClick={() => setReturnQty(Math.min(Number(returnCustomer.our_bottles_placed || 0), returnQty + 1))}
                  style={{ width: '44px', height: '44px', borderRadius: '50%', border: '1.5px solid #e65100', background: '#e65100', color: 'white', fontSize: '20px', cursor: 'pointer', fontWeight: '700' }}>+</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <div style={{ textAlign: 'center', padding: '8px', background: '#fff3e0', borderRadius: '8px' }}>
                  <p style={{ fontSize: '10px', color: '#888', margin: '0 0 2px' }}>{t('With Customer', 'گاہک کے پاس')}</p>
                  <p style={{ fontSize: '18px', fontWeight: '800', color: '#e65100', margin: 0 }}>{returnCustomer.our_bottles_placed}</p>
                </div>
                <div style={{ textAlign: 'center', padding: '8px', background: returnQty > 0 ? '#e8f5e9' : '#f5f5f5', borderRadius: '8px' }}>
                  <p style={{ fontSize: '10px', color: '#888', margin: '0 0 2px' }}>{t('After Return', 'واپسی کے بعد')}</p>
                  <p style={{ fontSize: '18px', fontWeight: '800', color: returnQty > 0 ? '#1a7a4a' : '#ccc', margin: 0 }}>{Math.max(0, Number(returnCustomer.our_bottles_placed || 0) - returnQty)}</p>
                </div>
              </div>
              <button onClick={() => setReturnQty(Number(returnCustomer.our_bottles_placed || 0))}
                style={{ width: '100%', padding: '8px', background: '#f0f4ff', border: '1px solid #c8d8ff', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', color: '#0f4c81', fontWeight: '600', marginBottom: '10px' }}>
                {t('Return All', 'سب واپس')} {returnCustomer.our_bottles_placed} {t('Bottles', 'بوتلیں')}
              </button>
              <button onClick={processBottleReturn} disabled={returnSaving || returnQty <= 0}
                style={{ width: '100%', padding: '14px', background: returnQty <= 0 || returnSaving ? '#e0e0e0' : '#e65100', color: returnQty <= 0 || returnSaving ? '#aaa' : 'white', border: 'none', borderRadius: '10px', cursor: returnQty <= 0 || returnSaving ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '700' }}>
                {returnSaving ? `⏳ ${t('Processing...', 'محفوظ ہو رہا ہے...')}` : `✓ ${t('Confirm Return', 'واپسی کی تصدیق')} — ${returnQty} ${t('Bottle', 'بوتل')}${returnQty > 1 ? 's' : ''}`}
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  )
}