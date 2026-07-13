import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import { savePendingDelivery } from '../offlineDB'

export default function RiderSellToCustomer({ rider, tenantId, preSelectedCustomer, onClearPreSelected, isOnline, dbReady, lang = 'en' }) {
  const [customers, setCustomers] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [search, setSearch] = useState('')
  const [qty19l, setQty19l] = useState(1)
  const [bottleProducts, setBottleProducts] = useState([]) // half litre, 1.5L etc from DB
  const [extraProducts, setExtraProducts] = useState([])   // trading items
  const [quantities, setQuantities] = useState({})
  const [selectedRate, setSelectedRate] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [received, setReceived] = useState('')
  const [bottlesReturned, setBottlesReturned] = useState(0)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [showCustomerList, setShowCustomerList] = useState(false)

  function t(en, ur) { return lang === 'ur' ? ur : en }

  useEffect(() => {
    if (tenantId) { fetchCustomers(); fetchProducts() }
  }, [tenantId])

  useEffect(() => {
    if (preSelectedCustomer) {
      setSelectedCustomer(preSelectedCustomer)
      setSelectedRate(preSelectedCustomer.rate_19l || 100)
      setBottleRatesFromCustomer(preSelectedCustomer)
      onClearPreSelected()
    }
  }, [preSelectedCustomer])

  async function fetchProducts() {
    const { data } = await supabase.from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .eq('is_saleable', true)
      .order('name')
    const bottle = (data || []).filter(p => p.bottle_type === 'half_litre' || p.bottle_type === '1_5l')
    const extra = (data || []).filter(p => !p.bottle_type)
    setBottleProducts(bottle)
    setExtraProducts(extra)
    const q = {}
    data?.forEach(p => { q[p.id] = 0 })
    setQuantities(q)
  }

  function setBottleRatesFromCustomer(c) {
    // Rates for bottle-mapped products come from customer rates
    // Will be applied during total calculation
  }

  async function fetchCustomers() {
    const { data } = await supabase.from('customers')
      .select('*').eq('tenant_id', tenantId).eq('is_active', true)
      .order('full_name')
    setCustomers(data || [])
  }

  const filtered = search
    ? customers.filter(c => c.full_name?.toLowerCase().includes(search.toLowerCase()) || c.mobile?.includes(search) || c.customer_code?.toLowerCase().includes(search.toLowerCase()))
    : customers

  function selectCustomer(c) {
    setSelectedCustomer(c)
    setSelectedRate(c.rate_19l || 100)
    setShowCustomerList(false)
    setSearch('')
  }

  // Get rate for bottle product based on customer rates
  function getBottleRate(p) {
    if (!selectedCustomer) return Number(p.sale_price || 0)
    if (p.bottle_type === 'half_litre') return Number(selectedCustomer.rate_half_litre || p.sale_price || 0)
    if (p.bottle_type === '1_5l') return Number(selectedCustomer.rate_1_5l || p.sale_price || 0)
    return Number(p.sale_price || 0)
  }

  const isJazz = paymentMethod === 'jazzcash'
  const isCredit = paymentMethod === 'credit'

  // Calculate totals
  const bottleTotal = bottleProducts.reduce((s, p) => s + (quantities[p.id] || 0) * getBottleRate(p), 0)
  const extraTotal = extraProducts.reduce((s, p) => s + (quantities[p.id] || 0) * Number(p.sale_price || 0), 0)
  const total = (qty19l * (selectedRate || 0)) + bottleTotal + extraTotal

  const receivedNum = isJazz || isCredit ? 0 : Number(received) || 0
  const creditPortion = isCredit ? total : Math.max(0, total - receivedNum)

  // Get qty_half_litre and qty_1_5l from bottle products
  function getBottleQtys() {
    let qtyHalf = 0, qty15l = 0
    bottleProducts.forEach(p => {
      if (p.bottle_type === 'half_litre') qtyHalf += (quantities[p.id] || 0)
      if (p.bottle_type === '1_5l') qty15l += (quantities[p.id] || 0)
    })
    return { qtyHalf, qty15l }
  }

  async function completeSale() {
    if (!selectedCustomer) return alert(t('Please select a customer', 'براہ کرم کسٹمر منتخب کریں'))
    const { qtyHalf, qty15l } = getBottleQtys()
    const hasAny = qty19l > 0 || qtyHalf > 0 || qty15l > 0 || [...bottleProducts, ...extraProducts].some(p => (quantities[p.id] || 0) > 0)
    if (!hasAny) return alert(t('Please add at least one bottle', 'کم از کم ایک بوتل شامل کریں'))
    if (qty19l > 0 && !selectedRate) return alert(t('Please select rate for 19L', '19 لیٹر کی قیمت منتخب کریں'))
    setSaving(true)

    let deliveryLat = null, deliveryLng = null
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }))
      deliveryLat = pos.coords.latitude
      deliveryLng = pos.coords.longitude
    } catch (err) { console.log('GPS not available') }

    const now = new Date().toISOString()
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
      amount_received: isJazz ? 0 : receivedNum,
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

      // Deduct stock for all sold products
      const allSoldProducts = [...bottleProducts, ...extraProducts].filter(p => (quantities[p.id] || 0) > 0)
      for (const p of allSoldProducts) {
        const qtySold = quantities[p.id]
        await supabase.from('products')
          .update({ current_stock: Math.max(0, Number(p.current_stock || 0) - qtySold) })
          .eq('id', p.id).eq('tenant_id', tenantId)

        // Post COGS for finished goods
        if (p.product_type === 'finished_good') {
          const avgCost = Number(p.average_cost || p.purchase_price || 0)
          const cogsCost = qtySold * avgCost
          if (cogsCost > 0) {
            try {
              const { data: je } = await supabase.from('journal_entries').insert([{
                tenant_id: tenantId,
                entry_date: now.split('T')[0],
                reference_type: 'cogs',
                reference_id: savedDelivery.id,
                narration: `COGS — ${p.name} × ${qtySold} sold`,
                total_amount: cogsCost,
                created_by: 'system'
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

      // Post delivery journal — isRiderEntry = true → DR 1101 Receivable from Riders
      try {
        const { postDeliveryJournal } = await import('../accountingEngine')
        await postDeliveryJournal(savedDelivery, selectedCustomer.id, tenantId, true)
      } catch (err) { console.error('Journal post error:', err) }

      // Save GPS to customer if first delivery
      if (deliveryLat && deliveryLng) {
        const { data: cust } = await supabase.from('customers').select('latitude, longitude').eq('id', selectedCustomer.id).eq('tenant_id', tenantId).single()
        if (cust && !cust.latitude) {
          await supabase.from('customers').update({ latitude: String(deliveryLat), longitude: String(deliveryLng) }).eq('id', selectedCustomer.id).eq('tenant_id', tenantId)
        }
      }
    } else {
      await savePendingDelivery(deliveryData)
    }

    setSuccess({ customer: selectedCustomer.full_name, total, qty19l, qtyHalf, qty15l, paymentMethod, received: receivedNum, creditPortion })
    setSelectedCustomer(null); setSearch(''); setQty19l(1); setBottlesReturned(0)
    setReceived(''); setPaymentMethod('cash'); setSelectedRate(null)
    const q = {}; [...bottleProducts, ...extraProducts].forEach(p => { q[p.id] = 0 }); setQuantities(q)
    await fetchProducts()
    setSaving(false)
  }

  function numBtn(val, setter) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => setter(Math.max(0, val - 1))}
          style={{ width: '44px', height: '44px', borderRadius: '50%', border: '2px solid #ddd', background: '#f5f5f5', fontSize: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>−</button>
        <span style={{ fontSize: '28px', fontWeight: '700', minWidth: '40px', textAlign: 'center', color: val > 0 ? '#1a7a4a' : '#ccc' }}>{val}</span>
        <button onClick={() => setter(val + 1)}
          style={{ width: '44px', height: '44px', borderRadius: '50%', border: '2px solid #1a7a4a', background: '#1a7a4a', color: 'white', fontSize: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>+</button>
      </div>
    )
  }

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <p style={{ fontSize: '52px', margin: '0 0 12px' }}>✅</p>
        <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 8px' }}>{t('Delivery Complete!', 'ڈیلیوری مکمل!')}</h3>
        <p style={{ fontSize: '16px', color: '#555', margin: '0 0 6px' }}>{success.customer}</p>
        <p style={{ fontSize: '22px', fontWeight: '700', color: '#0f4c81', margin: '0 0 6px' }}>Rs. {success.total.toLocaleString()}</p>
        {success.qty19l > 0 && <p style={{ fontSize: '14px', color: '#888', margin: '0 0 2px' }}>19L × {success.qty19l}</p>}
        {success.qtyHalf > 0 && <p style={{ fontSize: '14px', color: '#888', margin: '0 0 2px' }}>Half × {success.qtyHalf}</p>}
        {success.qty15l > 0 && <p style={{ fontSize: '14px', color: '#888', margin: '0 0 2px' }}>1.5L × {success.qty15l}</p>}
        {success.creditPortion > 0 && <p style={{ fontSize: '14px', color: '#f44336', fontWeight: '600', margin: '6px 0 0' }}>📋 Rs. {success.creditPortion.toLocaleString()} {t('added to balance', 'بیلنس میں شامل')}</p>}
        <button onClick={() => setSuccess(null)}
          style={{ marginTop: '24px', padding: '14px 40px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '16px', fontWeight: '700' }}>
          {t('+ Next Delivery', '+ اگلی ڈیلیوری')}
        </button>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>👤 {t('Sell to Customer', 'کسٹمر کو فروخت')}</h2>

      {/* Customer Selection */}
      {!selectedCustomer ? (
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '10px', textTransform: 'uppercase' }}>{t('Select Customer', 'کسٹمر منتخب کریں')}</p>
          <input value={search} onChange={e => { setSearch(e.target.value); setShowCustomerList(true) }}
            onFocus={() => setShowCustomerList(true)}
            placeholder={t('Search by name, mobile or ID...', 'نام، موبائل یا ID سے تلاش کریں...')}
            style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '10px', fontSize: '15px', outline: 'none', boxSizing: 'border-box', marginBottom: '10px' }} />
          {showCustomerList && (
            <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '10px' }}>
              {filtered.slice(0, 20).map(c => (
                <div key={c.id} onClick={() => selectCustomer(c)}
                  style={{ padding: '12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white' }}>
                  <div>
                    <p style={{ fontWeight: '700', fontSize: '14px', margin: '0 0 2px' }}>{c.full_name}</p>
                    <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{c.mobile} · {c.customer_code}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: '13px', fontWeight: '700', color: Number(c.balance) > 0 ? '#f44336' : '#1a7a4a', margin: '0 0 2px' }}>Rs. {Math.abs(Number(c.balance || 0)).toLocaleString()}</p>
                    <p style={{ fontSize: '10px', color: '#aaa', margin: 0 }}>Rs.{c.rate_19l}/19L</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #c8e6c9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ fontWeight: '700', fontSize: '15px', margin: '0 0 2px', color: '#1a7a4a' }}>✅ {selectedCustomer.full_name}</p>
              <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>{selectedCustomer.mobile} · {selectedCustomer.customer_code}</p>
              <p style={{ fontSize: '12px', fontWeight: '600', margin: '2px 0 0', color: Number(selectedCustomer.balance) > 0 ? '#f44336' : '#1a7a4a' }}>
                {t('Balance', 'بیلنس')}: Rs. {Math.abs(Number(selectedCustomer.balance || 0)).toLocaleString()}
                {Number(selectedCustomer.balance) <= 0 ? ` ${t('(Clear)', '(صاف)')}` : ` ${t('due', 'باقی')}`}
              </p>
            </div>
            <button onClick={() => { setSelectedCustomer(null); setSearch(''); setSelectedRate(null) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '20px' }}>✕</button>
          </div>
          <p style={{ fontSize: '11px', color: '#0f4c81', fontWeight: '600', margin: '8px 0 0' }}>
            Rate: 19L=Rs.{selectedCustomer.rate_19l}
            {selectedCustomer.rate_half_litre > 0 ? ` · Half=Rs.${selectedCustomer.rate_half_litre}` : ''}
            {selectedCustomer.rate_1_5l > 0 ? ` · 1.5L=Rs.${selectedCustomer.rate_1_5l}` : ''}
            {' · '}{t('Bottles out', 'بوتلیں باہر')}: {selectedCustomer.our_bottles_placed || 0}
          </p>
        </div>
      )}

      {selectedCustomer && (
        <>
          {/* 19L — hardcoded */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <p style={{ fontSize: '16px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 2px' }}>🍶 {t('19 Litre Bottle', '19 لیٹر بوتل')}</p>
                <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Rs. {selectedRate || selectedCustomer.rate_19l} {t('each', 'فی بوتل')}</p>
              </div>
              {numBtn(qty19l, setQty19l)}
            </div>
            {qty19l > 0 && (
              <>
                <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '8px' }}>{t('Rate per bottle', 'فی بوتل قیمت')}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  {[90, 100, 110, 120, 150, 160, 170, 180].map(r => (
                    <button key={r} onClick={() => setSelectedRate(r)}
                      style={{ padding: '8px 14px', border: '2px solid', borderColor: selectedRate === r ? '#1a7a4a' : '#eee', borderRadius: '8px', cursor: 'pointer', background: selectedRate === r ? '#1a7a4a' : '#f8f9fa', color: selectedRate === r ? 'white' : '#333', fontWeight: '700', fontSize: '13px' }}>
                      Rs.{r}
                    </button>
                  ))}
                </div>
                <input type="number" value={selectedRate || ''} onChange={e => setSelectedRate(e.target.value === '' ? null : Number(e.target.value))}
                  placeholder={t('Custom rate...', 'اپنی قیمت...')}
                  style={{ width: '100%', padding: '10px', border: '2px solid', borderColor: selectedRate ? '#1a7a4a' : '#ddd', borderRadius: '8px', fontSize: '18px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }} />
              </>
            )}
          </div>

          {/* Bottle-mapped products from DB */}
          {bottleProducts.map(p => (
            (selectedCustomer[p.bottle_type === 'half_litre' ? 'rate_half_litre' : 'rate_1_5l'] > 0 || (quantities[p.id] || 0) > 0) && (
              <div key={p.id} style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: '15px', fontWeight: '600', color: '#333', margin: '0 0 2px' }}>
                      {p.bottle_type === 'half_litre' ? '💧' : '🧴'} {p.name}
                    </p>
                    <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Rs. {getBottleRate(p)} {t('each', 'فی بوتل')}</p>
                  </div>
                  {numBtn(quantities[p.id] || 0, v => setQuantities(q => ({ ...q, [p.id]: v })))}
                </div>
                {(quantities[p.id] || 0) > 0 && (
                  <p style={{ fontSize: '13px', color: '#0f4c81', fontWeight: '700', margin: '10px 0 0', textAlign: 'center', background: '#e3f0ff', padding: '8px', borderRadius: '8px' }}>
                    {quantities[p.id]} × Rs.{getBottleRate(p)} = Rs. {((quantities[p.id] || 0) * getBottleRate(p)).toLocaleString()}
                  </p>
                )}
              </div>
            )
          ))}

          {/* Extra products */}
          {extraProducts.length > 0 && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '12px', textTransform: 'uppercase' }}>{t('Other Products', 'دیگر مصنوعات')}</p>
              {extraProducts.map((p, i) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: i < extraProducts.length - 1 ? '12px' : '0', marginBottom: i < extraProducts.length - 1 ? '12px' : '0', borderBottom: i < extraProducts.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>{p.name}</p>
                    <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Rs. {p.sale_price} · {t('Stock', 'اسٹاک')}: {p.current_stock}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button onClick={() => setQuantities(q => ({ ...q, [p.id]: Math.max(0, (q[p.id] || 0) - 1) }))}
                      style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid #ddd', background: '#f5f5f5', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>−</button>
                    <span style={{ fontSize: '20px', fontWeight: '700', minWidth: '28px', textAlign: 'center', color: (quantities[p.id] || 0) > 0 ? '#1a7a4a' : '#ccc' }}>{quantities[p.id] || 0}</span>
                    <button onClick={() => setQuantities(q => ({ ...q, [p.id]: (q[p.id] || 0) + 1 }))}
                      style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid #1a7a4a', background: '#1a7a4a', color: 'white', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>+</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bottles Returned */}
          {qty19l > 0 && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#555', marginBottom: '10px' }}>🔄 {t('Bottles Returned', 'بوتلیں واپس')}</p>
              {numBtn(bottlesReturned, v => setBottlesReturned(Math.min(v, qty19l)))}
              {bottlesReturned > 0 && <p style={{ fontSize: '12px', color: '#888', margin: '8px 0 0', textAlign: 'center' }}>
                {t('After delivery', 'ڈیلیوری کے بعد')}: {Math.max(0, Number(selectedCustomer.our_bottles_placed || 0) + qty19l - bottlesReturned)} {t('our bottles', 'ہماری بوتلیں')}
              </p>}
            </div>
          )}

          {/* Payment Method */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '10px', textTransform: 'uppercase' }}>{t('Payment Method', 'ادائیگی کا طریقہ')}</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[{ key: 'cash', icon: '💵', label: t('Cash', 'نقد'), color: '#1a7a4a' }, { key: 'jazzcash', icon: '📱', label: 'JazzCash', color: '#9c27b0' }, { key: 'credit', icon: '📋', label: t('Credit', 'ادھار'), color: '#f44336' }].map(pm => (
                <button key={pm.key} onClick={() => setPaymentMethod(pm.key)}
                  style={{ flex: 1, padding: '12px 4px', border: '2px solid', borderColor: paymentMethod === pm.key ? pm.color : '#eee', borderRadius: '10px', cursor: 'pointer', background: paymentMethod === pm.key ? pm.color : 'white', color: paymentMethod === pm.key ? 'white' : '#555', fontWeight: '700', fontSize: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '22px' }}>{pm.icon}</span>
                  <span>{pm.label}</span>
                </button>
              ))}
            </div>

            {paymentMethod === 'cash' && (
              <div style={{ marginTop: '12px' }}>
                <p style={{ fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>{t('Amount Received (Rs.)', 'موصول شدہ رقم (Rs.)')}</p>
                <input type="number" value={received} onChange={e => setReceived(e.target.value)} placeholder={String(total)}
                  style={{ width: '100%', padding: '12px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '22px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }} />
                {received && Number(received) < total && (
                  <p style={{ fontSize: '12px', color: '#f44336', fontWeight: '600', margin: '6px 0 0' }}>📋 Rs. {(total - Number(received)).toLocaleString()} {t('will be added to balance', 'بیلنس میں شامل ہوگا')}</p>
                )}
                <button onClick={() => setReceived(String(total))}
                  style={{ width: '100%', marginTop: '8px', padding: '8px', background: '#f0f4ff', border: '1px solid #d0d9ff', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#0f4c81', fontWeight: '600' }}>
                  {t('Full Amount', 'پوری رقم')}: Rs. {total.toLocaleString()}
                </button>
              </div>
            )}
          </div>

          {/* Total & Submit */}
          <div style={{ background: 'linear-gradient(135deg, #0f4c81, #1a7a4a)', borderRadius: '14px', padding: '20px', marginBottom: '12px', color: 'white', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', opacity: 0.8, margin: '0 0 6px' }}>{t('Total Amount', 'کل رقم')}</p>
            <p style={{ fontSize: '44px', fontWeight: '700', margin: '0 0 4px', letterSpacing: '-2px' }}>Rs. {total.toLocaleString()}</p>
            {creditPortion > 0 && !isCredit && <p style={{ fontSize: '12px', opacity: 0.7, margin: 0 }}>📋 Rs. {creditPortion.toLocaleString()} {t('credit', 'ادھار')}</p>}
          </div>

          {!isOnline && (
            <div style={{ background: '#fff3e0', border: '1px solid #ffe082', borderRadius: '10px', padding: '10px 14px', marginBottom: '12px' }}>
              <p style={{ fontSize: '12px', color: '#e65100', fontWeight: '600', margin: 0 }}>📵 {t('Offline — will sync when internet returns', 'آف لائن — انٹرنیٹ آنے پر مطابق ہوگا')}</p>
            </div>
          )}

          <button onClick={completeSale} disabled={saving}
            style={{ width: '100%', padding: '18px', background: isJazz ? '#9c27b0' : isCredit ? '#f44336' : '#1a7a4a', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '16px', fontWeight: '700', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
            {saving ? t('Saving...', 'محفوظ ہو رہا ہے...') : `✓ ${t('Complete Delivery', 'ڈیلیوری مکمل کریں')} — Rs. ${total.toLocaleString()}`}
          </button>
        </>
      )}
    </div>
  )
}
