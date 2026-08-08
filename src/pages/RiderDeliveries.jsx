import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import * as AccountingEngine from '../accountingEngine'
import {
  getOrdersOffline, updateOrderStatusOffline,
  savePendingDelivery
} from '../offlineDB'

const RATES = [90, 100, 110, 120, 150, 160, 170, 180]

const REMARK_TYPES = [
  { key: 'not_home',      labelEn: 'Not at Home',    labelUr: 'گھر پر نہیں',     icon: '🏠' },
  { key: 'has_water',     labelEn: 'Has Water',       labelUr: 'پانی موجود ہے',   icon: '💧' },
  { key: 'wont_purchase', labelEn: "Won't Buy",       labelUr: 'نہیں خریدیں گے', icon: '🚫' },
  { key: 'shifted',       labelEn: 'Shifted House',   labelUr: 'گھر بدل لیا',    icon: '🏚️' },
  { key: 'vacation',      labelEn: 'On Vacation',     labelUr: 'چھٹی پر ہیں',    icon: '✈️' },
  { key: 'no_response',   labelEn: 'No Response',     labelUr: 'کوئی جواب نہیں', icon: '📵' },
  { key: 'office_closed', labelEn: 'Office Closed',   labelUr: 'دفتر بند',        icon: '🏢' },
  { key: 'other',         labelEn: 'Other',           labelUr: 'دیگر',            icon: '💬' },
]

export default function RiderDeliveries({ rider, tenantId, isOnline, dbReady, salesTaxRate = 16 }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [qty19l, setQty19l] = useState(0)
  const [qtyHalf, setQtyHalf] = useState(0)
  const [qty15l, setQty15l] = useState(0)
  const [selectedRate, setSelectedRate] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState(null)
  const [bizSettings, setBizSettings] = useState({})
  const [hasChurnIntelligence, setHasChurnIntelligence] = useState(false)

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

  const [cashReceived, setCashReceived] = useState('')
  const [bottlesReturned, setBottlesReturned] = useState(0)
  const [productQtys, setProductQtys] = useState({})
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [filter, setFilter] = useState('today')
  const [generatingSchedule, setGeneratingSchedule] = useState(false)
  const [scheduleGenerated, setScheduleGenerated] = useState(false)
  const [currentOrderIndex, setCurrentOrderIndex] = useState(null)
  const [navigating,     setNavigating]     = useState(false)
  const [selectedRemark, setSelectedRemark] = useState(null)
  const [otherRemarkText, setOtherRemarkText] = useState('')
  const [remarkSaved,    setRemarkSaved]    = useState(false)
  const [otherBrands,    setOtherBrands]    = useState(0)
  const [rescheduling,   setRescheduling]   = useState(false)
  const [riderLocation,  setRiderLocation]  = useState(null)
  const [completedCount, setCompletedCount] = useState(0)

  function getRiderLocation() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => setRiderLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => console.log('Location for sorting:', err.message),
      { timeout: 5000, maximumAge: 60000 }
    )
  }

  function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  }

  function sortByDistance(orderList, location) {
    if (!location) return orderList
    const withCoords    = orderList.filter(o =>  o.customers?.latitude && o.customers?.longitude)
    const withoutCoords = orderList.filter(o => !o.customers?.latitude || !o.customers?.longitude)
    withCoords.sort((a, b) => {
      const distA = haversineDistance(location.lat, location.lng, Number(a.customers.latitude), Number(a.customers.longitude))
      const distB = haversineDistance(location.lat, location.lng, Number(b.customers.latitude), Number(b.customers.longitude))
      return distA - distB
    })
    return [...withCoords, ...withoutCoords]
  }

  useEffect(() => { getRiderLocation(); fetchOrders() }, [filter, isOnline, dbReady, tenantId])

  async function fetchOrders() {
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    try {
      if (isOnline) {
        let query = supabase
          .from('orders')
          .select('*, customers(full_name, mobile, customer_code, balance, rate_19l, rate_half_litre, rate_1_5l, address, our_bottles_placed, other_brand_bottles_held, google_maps_link, is_tax_applicable, notes, delivery_notes)')
          .eq('tenant_id', tenantId)
          .eq('rider_id', rider.id)
          .eq('status', 'assigned')
          .order('is_priority', { ascending: false })
          .order('delivery_date', { ascending: true })
        if (filter === 'today') query = query.lte('delivery_date', today)
        const { data } = await query
        setOrders(sortByDistance(data || [], riderLocation))
        const { count } = await supabase.from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenantId).eq('rider_id', rider.id)
          .eq('status', 'completed').eq('delivery_date', today)
        setCompletedCount(count || 0)
      } else {
        if (dbReady) {
          const offlineOrders = await getOrdersOffline()
          let filtered = offlineOrders.filter(o => o.rider_id === rider.id && o.status === 'assigned')
          if (filter === 'today') {
            filtered = filtered.filter(o => !o.delivery_date || o.delivery_date <= today)
          }
          filtered.sort((a, b) => (b.is_priority ? 1 : 0) - (a.is_priority ? 1 : 0))
          setOrders(filtered)
        } else {
          setOrders([])
        }
      }
    } catch (err) {
      console.error('Error fetching orders:', err)
      setOrders([])
    }
    setLoading(false)
  }

  function selectOrder(order) {
    setSelectedOrder(order)
    setQty19l(order.qty_19l || 0)
    setQtyHalf(order.qty_half_litre || 0)
    setQty15l(order.qty_1_5l || 0)
    setSelectedRate(order.customers?.rate_19l || 100)
    setPaymentMethod(null)
    setCashReceived('')
    setBottlesReturned(0)
    setSuccess(null)
    // Pre-fill product quantities from order
    const pqtys = {}
    order.product_items?.forEach(p => { pqtys[p.product_id] = p.qty })
    setProductQtys(pqtys)
  }

  function subTotal() {
    const productTotal = selectedOrder?.product_items?.reduce((s, p) => {
      const qty = productQtys[p.product_id] ?? p.qty
      return s + (qty * (p.price || 0))
    }, 0) || 0
    return (qty19l * (selectedRate || 0)) +
      (qtyHalf * (selectedOrder?.customers?.rate_half_litre || 0)) +
      (qty15l * (selectedOrder?.customers?.rate_1_5l || 0)) +
      productTotal
  }

  function taxAmount() {
    const rate = selectedOrder?.customers?.is_tax_applicable ? salesTaxRate : 0
    return Math.round(subTotal() * rate / 100)
  }

  function totalAmount() {
    return subTotal() + taxAmount()
  }

  // ── GENERATE TODAY'S SCHEDULED ORDERS ──
  async function generateTodaySchedule() {
    if (!isOnline) return alert('Internet required')
    setGeneratingSchedule(true)

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const todayName = dayNames[new Date().getDay()]
    const today = new Date().toISOString().split('T')[0]

    const { data: scheduledCustomers } = await supabase.from('customers')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .eq('schedule_active', true)
      .contains('delivery_days', [todayName])

    if (!scheduledCustomers || scheduledCustomers.length === 0) {
      setGeneratingSchedule(false)
      alert(`No customers scheduled for ${todayName}`)
      return
    }

    let created = 0
    let skipped = 0

    for (const customer of scheduledCustomers) {
      const { data: existing } = await supabase.from('orders')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('customer_id', customer.id)
        .eq('delivery_date', today)
        .neq('status', 'cancelled')

      if (existing && existing.length > 0) { skipped++; continue }

      await supabase.from('orders').insert([{
        tenant_id: tenantId,
        customer_id: customer.id,
        rider_id: rider.id,
        qty_19l: Number(customer.default_qty_19l) || 1,
        qty_half_litre: Number(customer.default_qty_half) || 0,
        qty_1_5l: Number(customer.default_qty_1_5l) || 0,
        delivery_date: today,
        status: 'assigned',
        notes: 'Auto — Recurring schedule'
      }])
      created++
    }

    setGeneratingSchedule(false)
    setScheduleGenerated(true)
    alert(`✅ ${created} orders created · ${skipped} already existed`)
    fetchOrders()
  }

  async function completeDelivery() {
    if (!paymentMethod) return alert('Please select payment method')
    if (qty19l === 0 && qtyHalf === 0 && qty15l === 0) return alert('Please enter at least one bottle')
    if (qty19l > 0 && !selectedRate) return alert('Please select rate for 19L')

    const total = totalAmount()
    if (paymentMethod !== 'credit') {
      const recv = Number(cashReceived) || 0
      if (recv < 0) return alert('Amount received cannot be negative')
      if (recv > total) return alert('Amount received cannot exceed total Rs. ' + total.toLocaleString())
    }

    setSaving(true)

    let deliveryLat = null
    let deliveryLng = null
    try {
      const position = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
      )
      deliveryLat = position.coords.latitude
      deliveryLng = position.coords.longitude
    } catch (err) { console.log('GPS not available:', err.message) }

    const isJazz = paymentMethod === 'jazzcash'
    const isCredit = paymentMethod === 'credit'
    const isCash = paymentMethod === 'cash'
    const isPending = ['jazzcash', 'easypaisa', 'bank'].includes(paymentMethod)
    const received = isCredit ? 0 : isPending ? 0 : (Number(cashReceived) || total)
    const creditPortion = isCredit ? total : Math.max(0, total - received)
    const now = new Date().toISOString()

    const sub = subTotal()
    const tax = taxAmount()
    const deliveryData = {
      tenant_id: tenantId,
      order_id: selectedOrder.id,
      customer_id: selectedOrder.customer_id,
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
      other_brand_bottles: otherBrands,
      rate_half_litre: selectedOrder?.customers?.rate_half_litre || 0,
      rate_1_5l: selectedOrder?.customers?.rate_1_5l || 0,
      product_items: selectedOrder?.product_items || null,
    }

    if (isOnline) {
      const { data: savedDelivery, error } = await supabase
        .from('deliveries').insert([deliveryData]).select().single()
      if (error) { alert('Error: ' + error.message); setSaving(false); return }

      await supabase.from('orders').update({
        status: 'completed', completed_at: now
      }).eq('id', selectedOrder.id).eq('tenant_id', tenantId)

      // Save line items to delivery_items
      const riderItems = []
      if (qty19l > 0) riderItems.push({
        tenant_id: tenantId, delivery_id: savedDelivery.id,
        product_id: null, product_name: '19 Litre Water Bottle',
        bottle_type: '19l', qty: qty19l,
        rate: selectedRate || 0, amount: qty19l * (selectedRate || 0)
      })
      if (qtyHalf > 0) riderItems.push({
        tenant_id: tenantId, delivery_id: savedDelivery.id,
        product_id: null, product_name: 'Half Litre Water Bottle',
        bottle_type: 'half_litre', qty: qtyHalf,
        rate: Number(selectedOrder.customers?.rate_half_litre || 0),
        amount: qtyHalf * Number(selectedOrder.customers?.rate_half_litre || 0)
      })
      if (qty15l > 0) riderItems.push({
        tenant_id: tenantId, delivery_id: savedDelivery.id,
        product_id: null, product_name: '1.5 Litre Water Bottle',
        bottle_type: '1_5l', qty: qty15l,
        rate: Number(selectedOrder.customers?.rate_1_5l || 0),
        amount: qty15l * Number(selectedOrder.customers?.rate_1_5l || 0)
      })
      // Add extra products to delivery items
      selectedOrder.product_items?.forEach(p => {
        const qty = productQtys[p.product_id] ?? p.qty
        if (qty > 0) {
          riderItems.push({
            tenant_id: tenantId,
            delivery_id: savedDelivery.id,
            product_id: p.product_id,
            product_name: p.name,
            bottle_type: null,
            qty,
            rate: p.price || 0,
            amount: qty * (p.price || 0)
          })
        }
      })
      if (riderItems.length > 0) await supabase.from('delivery_items').insert(riderItems)

      // Balance calculated dynamically from customer_balances view — no manual update needed

      // ✅ Update our_bottles_placed
      // + qty delivered - bottles returned by customer
      const currentBottles = Number(selectedOrder.customers?.our_bottles_placed || 0)
      const currentOtherBrands = Number(selectedOrder.customers?.other_brand_bottles_held || 0)
      const newBottlesWithCustomer = Math.max(0, currentBottles + qty19l - bottlesReturned)
      const newOtherBrandsHeld = Math.max(0, currentOtherBrands - otherBrands)
      await supabase.from('customers')
        .update({
          our_bottles_placed: newBottlesWithCustomer,
          other_brand_bottles_held: newOtherBrandsHeld,
        })
        .eq('id', selectedOrder.customer_id)
        .eq('tenant_id', tenantId)

      try {
        const { postDeliveryJournal } = AccountingEngine
        await postDeliveryJournal(savedDelivery, selectedOrder.customer_id, tenantId)
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

      if (deliveryLat && deliveryLng && selectedOrder.customer_id) {
        await supabase.from('customers').update({
          latitude: String(deliveryLat),
          longitude: String(deliveryLng)
        }).eq('id', selectedOrder.customer_id).eq('tenant_id', tenantId)
      }

    } else {
      await savePendingDelivery(deliveryData)
      await updateOrderStatusOffline(selectedOrder.id, 'completed')
      // Balance calculated dynamically from customer_balances view — no manual update needed
    }

    setSuccess({
      customer: selectedOrder.customers?.full_name,
      customerMobile: selectedOrder.customers?.mobile || '',
      total, received, creditPortion, paymentMethod,
      bottlesReturned, qty19l,
      newBottlesWithCustomer: Math.max(0, Number(selectedOrder.customers?.our_bottles_placed || 0) + qty19l - bottlesReturned),
      savedOffline: !isOnline,
      deliveryRaw: savedDelivery ? { ...savedDelivery } : null,
      customerRaw: selectedOrder.customers,
      invoiceNumber: savedDelivery?.invoice_number || null
    })
    setPaymentMethod(null)
    setCashReceived('')
    setBottlesReturned(0)
    setProductQtys({})
    setOtherBrands(0)
    setSelectedRemark(null)
    setOtherRemarkText('')
    setSaving(false)

    // Auto-advance to next order
    setSelectedOrder(null)
    setCurrentOrderIndex(null)
    await fetchOrders()
  }

  async function saveRemark(remarkType, customText = '') {
    if (!selectedOrder || !rider) return
    const remarkText = remarkType === 'other' ? customText : ''
    await supabase.from('customer_visit_remarks').insert([{
      tenant_id: tenantId,
      customer_id: selectedOrder.customer_id,
      rider_id: rider.id,
      order_id: selectedOrder.id,
      remark_type: remarkType,
      remark_text: remarkText,
      visit_date: new Date().toISOString().split('T')[0],
    }])
    setSelectedRemark(remarkType)
    setRemarkSaved(true)
    setTimeout(() => setRemarkSaved(false), 2000)
  }

  async function rescheduleOrder() {
    if (!selectedOrder) return
    setRescheduling(true)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().split('T')[0]
    const newAttempts = (selectedOrder.delivery_attempts || 0) + 1
    const needsReview = newAttempts >= 3

    await supabase.from('orders').update({
      delivery_date: tomorrowStr,
      delivery_attempts: newAttempts,
      last_attempt_date: new Date().toISOString().split('T')[0],
      reschedule_reason: selectedRemark || 'not_home',
      admin_review_required: needsReview,
    }).eq('id', selectedOrder.id).eq('tenant_id', tenantId)

    setRescheduling(false)
    setSelectedOrder(null)
    setSelectedRemark(null)
    setOtherRemarkText('')
    await fetchOrders()

    if (needsReview) {
      alert(`⚠️ 3 attempts failed for ${selectedOrder.customers?.full_name}. Admin has been notified.`)
    } else {
      alert(`✅ Order rescheduled to tomorrow (Attempt ${newAttempts}/3)`)
    }
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
  const ourBottles = Number(selectedOrder?.customers?.our_bottles_placed || 0)
  const isCash = paymentMethod === 'cash'
  const isCredit = paymentMethod === 'credit'
  const isPending = ['jazzcash', 'easypaisa', 'bank'].includes(paymentMethod || '')

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: 0 }}>📦 My Deliveries</h2>
        {orders.length > 0 && (() => {
          const stops = orders
            .filter(o => o.customers?.latitude || o.customers?.address)
            .map(o => o.customers?.latitude && o.customers?.longitude
              ? `${o.customers.latitude},${o.customers.longitude}`
              : encodeURIComponent(o.customers?.address || ''))
          if (stops.length === 0) return null
          const isAndroid = /android/i.test(navigator.userAgent)
          const isIOS = /iphone|ipad/i.test(navigator.userAgent)
          const routeUrl = isAndroid
            ? `google.navigation:q=${stops[stops.length - 1]}&waypoints=${stops.slice(0,-1).join('|')}`
            : isIOS
            ? `comgooglemaps://?daddr=${stops[stops.length - 1]}&waypoints=${stops.slice(0,-1).join('|')}&directionsmode=driving`
            : `https://www.google.com/maps/dir/${stops.join('/')}`
          return (
            <a href={routeUrl}
              target="_blank" rel="noreferrer"
              style={{ padding: '8px 14px', background: '#1a7a4a', color: 'white', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              🗺️ My Route
            </a>
          )
        })()}
      </div>
      {/* Daily Progress Bar */}
      {(completedCount > 0 || orders.length > 0) && (
        <div style={{ background: 'white', borderRadius: 10, padding: '12px 14px', marginBottom: 12, boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>
              📦 Today's Progress
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1a7a4a' }}>
              {completedCount} / {completedCount + orders.length} completed
            </span>
          </div>
          <div style={{ height: 8, background: '#e0e0e0', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${completedCount + orders.length > 0 ? (completedCount / (completedCount + orders.length)) * 100 : 0}%`,
              background: 'linear-gradient(90deg, #1a7a4a, #4caf50)',
              borderRadius: 4,
              transition: 'width 0.5s ease'
            }} />
          </div>
          {completedCount + orders.length > 0 && (
            <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
              {orders.length} remaining · {Math.round((completedCount / (completedCount + orders.length)) * 100)}% done
            </p>
          )}
        </div>
      )}

      {!isOnline && (
        <p style={{ fontSize: '12px', color: '#ea580c', marginBottom: '12px', background: '#fff7ed', padding: '6px 10px', borderRadius: '6px', border: '1px solid #fed7aa' }}>
          📵 Offline — deliveries will sync when internet is available
        </p>
      )}

      {success && (
        <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
          <p style={{ fontWeight: '700', color: '#1b5e20', marginBottom: '4px' }}>✅ Delivery Completed!</p>
          <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>{success.customer} — Rs. {success.total.toLocaleString()}</p>
          {success.received > 0 && <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>Cash: Rs. {success.received.toLocaleString()}</p>}
          {success.creditPortion > 0 && <p style={{ fontSize: '13px', color: '#f44336', margin: '0 0 2px' }}>Credit: Rs. {success.creditPortion.toLocaleString()}</p>}
          <p style={{ fontSize: '13px', color: '#e65100', margin: '0 0 2px' }}>
            🫙 Delivered: {success.qty19l} · Returned: {success.bottlesReturned} · Our bottles now with customer: {success.newBottlesWithCustomer}
          </p>
          {success.savedOffline && (
            <p style={{ fontSize: '12px', color: '#ea580c', margin: '4px 0 0', fontWeight: '600' }}>📵 Saved offline — will sync later</p>
          )}
          {currentOrderIndex !== null && currentOrderIndex + 1 < orders.length && (
            <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.5)', borderRadius: 8 }}>
              <p style={{ fontSize: 12, color: '#1a7a4a', fontWeight: 700, margin: '0 0 2px' }}>⏭ Next Stop:</p>
              <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: '#1b5e20' }}>{orders[currentOrderIndex + 1]?.customers?.full_name}</p>
              {orders[currentOrderIndex + 1]?.customers?.address && (
                <p style={{ fontSize: 11, color: '#2e7d32', margin: '1px 0 0' }}>📍 {orders[currentOrderIndex + 1]?.customers?.address}</p>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => setSuccess(null)}
              style={{ padding: '4px 12px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '12px' }}>
              OK
            </button>
            {success?.deliveryRaw && (
              <button onClick={() => {
                const win = window.open('', '_blank')
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
                win.onload = () => { win.focus(); win.print(); win.onafterprint = () => win.close() }
              }}
                style={{ padding: '4px 12px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}>
              🧾 Print Receipt
            </button>
            )}
            {success?.customerMobile && (() => {
              const phone = success.customerMobile.replace(/\D/g, '').replace(/^0/, '').replace(/^92/, '')
              const waNumber = phone ? `92${phone}` : ''
              const bizName = bizSettings.business_name || 'AquaRun'
              const items = [
                success.qty19l > 0 ? `19L × ${success.qty19l}` : '',
              ].filter(Boolean).join(', ')
              const msg = `*${bizName} — Delivery Receipt*\n\n` +
                `👤 ${success.customer}\n` +
                `📦 ${items}\n` +
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

      {selectedOrder ? (
        <div>
          {/* Progress indicator */}
          {currentOrderIndex !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, height: 4, background: '#e0e0e0', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${((currentOrderIndex + 1) / orders.length) * 100}%`, background: '#1a7a4a', borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
              <span style={{ fontSize: 12, color: '#555', fontWeight: 600, whiteSpace: 'nowrap' }}>
                Stop {currentOrderIndex + 1} of {orders.length}
              </span>
            </div>
          )}

          {/* Customer header */}
          <div style={{ background: '#0f4c81', color: 'white', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: '700', fontSize: '16px', margin: '0 0 4px' }}>{selectedOrder.customers?.full_name}</p>
                {selectedOrder.customers?.address && (
                  <p style={{ fontSize: '12px', opacity: 0.8, margin: '0 0 2px' }}>📍 {selectedOrder.customers.address}</p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 2px' }}>
                  <p style={{ fontSize: '12px', opacity: 0.8, margin: 0 }}>📞 {selectedOrder.customers?.mobile}</p>
                  {selectedOrder.customers?.mobile && (
                    <a href={`tel:${selectedOrder.customers.mobile}`}
                      style={{ padding: '3px 10px', background: 'rgba(255,255,255,0.25)', color: 'white', borderRadius: 6, fontSize: 11, fontWeight: 700, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.4)' }}>
                      📲 Call
                    </a>
                  )}
                </div>
                {selectedOrder.notes && (
                  <p style={{ fontSize: '11px', opacity: 0.7, margin: '4px 0 0', background: 'rgba(255,255,255,0.15)', padding: '4px 8px', borderRadius: 6 }}>📝 {selectedOrder.notes}</p>
                )}
                {selectedOrder.customers?.delivery_notes && (
                  <p style={{ fontSize: '11px', opacity: 0.9, margin: '4px 0 0', background: 'rgba(255,165,0,0.3)', padding: '4px 8px', borderRadius: 6 }}>⚠️ {selectedOrder.customers.delivery_notes}</p>
                )}
                {selectedOrder.customers?.notes && (
                  <p style={{ fontSize: '11px', opacity: 0.7, margin: '4px 0 0', background: 'rgba(255,255,255,0.15)', padding: '4px 8px', borderRadius: 6 }}>💬 {selectedOrder.customers.notes}</p>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                <p style={{ fontSize: '11px', opacity: 0.7, margin: '0 0 2px' }}>Outstanding</p>
                <p style={{ fontSize: '16px', fontWeight: '700', margin: '0 0 6px', color: selectedOrder.customers?.balance > 0 ? '#ffcdd2' : '#c8e6c9' }}>
                  Rs. {Number(selectedOrder.customers?.balance || 0).toLocaleString()}
                </p>
                {ourBottles > 0 && (
                  <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '6px', padding: '4px 8px' }}>
                    <p style={{ fontSize: '11px', opacity: 0.9, margin: 0 }}>🫙 {ourBottles} our bottles</p>
                  </div>
                )}
              </div>
            </div>
            {(selectedOrder.customers?.latitude || selectedOrder.customers?.address || selectedOrder.customers?.google_maps_link) && (
              <a href={(() => {
                const dest = selectedOrder.customers?.latitude && selectedOrder.customers?.longitude
                  ? `${selectedOrder.customers.latitude},${selectedOrder.customers.longitude}`
                  : encodeURIComponent(selectedOrder.customers?.address || '')
                const isAndroid = /android/i.test(navigator.userAgent)
                const isIOS = /iphone|ipad/i.test(navigator.userAgent)
                if (selectedOrder.customers?.google_maps_link) return selectedOrder.customers.google_maps_link
                if (isAndroid) return `google.navigation:q=${dest}`
                if (isIOS) return `comgooglemaps://?daddr=${dest}&directionsmode=driving`
                return `https://www.google.com/maps/dir/Current+Location/${dest}`
              })()} target="_blank" rel="noreferrer"
                onClick={() => setNavigating(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: '10px', padding: '10px 18px', background: navigating ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.25)', color: 'white', borderRadius: '8px', fontSize: '14px', fontWeight: '700', textDecoration: 'none', width: '100%', justifyContent: 'center', border: '2px solid rgba(255,255,255,0.4)' }}>
                {navigating ? '🧭 Navigating — Tap to record delivery below' : '▶ Navigate to Customer'}
              </a>
            )}
            {navigating && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(255,255,255,0.15)', borderRadius: 8, textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', margin: 0, fontWeight: 600 }}>📱 Arrived? Scroll down to record delivery</p>
              </div>
            )}
          </div>

          {/* Visit Remark */}
          {hasChurnIntelligence ? (
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #f0f0f0' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>
              📝 Visit Remark <span style={{ fontSize: 11, color: '#aaa', fontWeight: 400 }}>(optional)</span>
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: selectedRemark === 'other' ? 10 : 0 }}>
              {REMARK_TYPES.map(r => (
                <button key={r.key} onClick={() => { setSelectedRemark(r.key); if (r.key !== 'other') saveRemark(r.key) }}
                  style={{ padding: '8px 12px', border: '1.5px solid', borderColor: selectedRemark === r.key ? '#0f4c81' : '#e0e0e0', borderRadius: 8, cursor: 'pointer', background: selectedRemark === r.key ? '#e3f0ff' : 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 72 }}>
                  <span style={{ fontSize: 18 }}>{r.icon}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: selectedRemark === r.key ? '#0f4c81' : '#555', lineHeight: 1.2 }}>{r.labelEn}</span>
                  <span style={{ fontSize: 9, color: '#888' }}>{r.labelUr}</span>
                </button>
              ))}
            </div>
            {selectedRemark === 'other' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input value={otherRemarkText} onChange={e => setOtherRemarkText(e.target.value)}
                  placeholder="Type remark..."
                  style={{ flex: 1, padding: '8px 12px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 13, outline: 'none' }} />
                <button onClick={() => saveRemark('other', otherRemarkText)} disabled={!otherRemarkText.trim()}
                  style={{ padding: '8px 16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                  Save
                </button>
              </div>
            )}
            {remarkSaved && (
              <p style={{ fontSize: 11, color: '#1a7a4a', fontWeight: 700, margin: '6px 0 0' }}>✅ Remark saved</p>
            )}

            {/* Reschedule button — shown when remark selected */}
            {selectedRemark && selectedRemark !== 'vacation' && selectedRemark !== 'has_water' && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: '#fff3e0', borderRadius: 8, border: '1px solid #ffcc80' }}>
                <p style={{ fontSize: 12, color: '#e65100', fontWeight: 600, margin: '0 0 8px' }}>
                  Customer not available — reschedule this order?
                  {(selectedOrder.delivery_attempts || 0) > 0 && (
                    <span style={{ marginLeft: 6, fontSize: 11, background: '#e65100', color: 'white', padding: '1px 7px', borderRadius: 10 }}>
                      Attempt {(selectedOrder.delivery_attempts || 0) + 1}/3
                    </span>
                  )}
                </p>
                <button onClick={rescheduleOrder} disabled={rescheduling}
                  style={{ width: '100%', padding: '10px', background: rescheduling ? '#e0e0e0' : '#e65100', color: 'white', border: 'none', borderRadius: 8, cursor: rescheduling ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
                  {rescheduling ? '⏳ Rescheduling...' : '📅 Reschedule to Tomorrow'}
                </button>
              </div>
            )}
          </div>

          ) : (
            <div style={{ background: '#f8f9fa', borderRadius: 10, padding: '12px 14px', marginBottom: 12, border: '1.5px dashed #ddd', textAlign: 'center' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#888', margin: '0 0 3px' }}>🔒 Visit Remarks</p>
              <p style={{ fontSize: 11, color: '#aaa', margin: 0 }}>Premium feature — contact admin to enable</p>
            </div>
          )}

          {/* Bottles to deliver */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '14px' }}>Bottles to Deliver</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>19 Litre</p>
                <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Ordered: {selectedOrder.qty_19l}</p>
              </div>
              {numBtn(qty19l, setQty19l)}
            </div>
            {selectedOrder.qty_half_litre > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>Half Litre</p>
                  <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Ordered: {selectedOrder.qty_half_litre}</p>
                </div>
                {numBtn(qtyHalf, setQtyHalf)}
              </div>
            )}
            {selectedOrder.qty_1_5l > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>1.5 Litre</p>
                  <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Ordered: {selectedOrder.qty_1_5l}</p>
                </div>
                {numBtn(qty15l, setQty15l)}
              </div>
            )}
          </div>

          {/* Extra Products */}
          {selectedOrder?.product_items?.length > 0 && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #f3e8ff' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#7c3aed', marginBottom: '14px' }}>📦 Other Products</p>
              {selectedOrder.product_items.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: i < selectedOrder.product_items.length - 1 ? '12px' : 0 }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>{p.name}</p>
                    <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Rs. {p.price || 0} each · Ordered: {p.qty}</p>
                  </div>
                  {numBtn(productQtys[p.product_id] ?? p.qty, val => setProductQtys(q => ({ ...q, [p.product_id]: val })))}
                </div>
              ))}
            </div>
          )}

          {/* ✅ BOTTLES RETURNED */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #fff3e0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '14px', fontWeight: '700', color: '#e65100', margin: '0 0 4px' }}>🫙 Empty Bottles Returned</p>
                <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>
                  Customer currently has: <strong>{ourBottles}</strong> of our bottles
                </p>
                {bottlesReturned > 0 && (
                  <p style={{ fontSize: '11px', color: '#1a7a4a', margin: '4px 0 0', fontWeight: '600' }}>
                    After delivery: {Math.max(0, ourBottles + qty19l - bottlesReturned)} our bottles with customer
                  </p>
                )}
              </div>
              {numBtn(bottlesReturned, setBottlesReturned)}
            </div>
          </div>


          {/* Rate */}
          {qty19l > 0 && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>Rate — 19L</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {RATES.map(r => (
                  <button key={r} onClick={() => setSelectedRate(r)}
                    style={{ padding: '10px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: selectedRate === r ? '#0f4c81' : '#f0f0f0', color: selectedRate === r ? 'white' : '#333', fontWeight: '700', fontSize: '14px' }}>
                    Rs. {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Payment */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '10px' }}>Payment Method</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              {[
                { key: 'cash', label: 'نقد', sublabel: 'Cash', color: '#1a7a4a' },
                { key: 'jazzcash', label: 'جیز کیش', sublabel: 'JazzCash', color: '#9c27b0' },
                ...(bizSettings?.jazzcash_number_2 ? [{ key: 'easypaisa', label: 'ایزی پیسہ', sublabel: 'EasyPaisa', color: '#4caf50' }] : []),
                ...(bizSettings?.bank_name ? [{ key: 'bank', label: 'بینک', sublabel: 'Bank', color: '#0f4c81' }] : []),
                { key: 'credit', label: 'ادھار', sublabel: 'Credit', color: '#f44336' },
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
                  <span style={{ fontSize: '13px', color: '#555' }}>Total Amount</span>
                  <span style={{ fontSize: '15px', fontWeight: '700', color: '#0f4c81' }}>Rs. {total.toLocaleString()}</span>
                </div>
                <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: '600' }}>
                  {isCash ? 'Cash Received' : 'Amount Received (partial allowed)'}
                </label>
                <input type="number" value={cashReceived} onChange={e => setCashReceived(e.target.value)}
                  placeholder={total.toString()}
                  style={{ width: '100%', padding: '12px', border: '2px solid #c8e0ff', borderRadius: '8px', fontSize: '20px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center', color: '#333' }} />
                <button onClick={() => setCashReceived(String(total))}
                  style={{ marginTop: '8px', padding: '6px 14px', background: '#e3f0ff', border: '1px solid #c8e0ff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#0f4c81', fontWeight: '600' }}>
                  Full: Rs. {total.toLocaleString()}
                </button>
                {cashReceived && cashReceivedNum < total && cashReceivedNum >= 0 && (
                  <div style={{ marginTop: '10px', padding: '10px', background: '#ffebee', borderRadius: '8px', border: '1px solid #ffcdd2' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', color: '#c62828', fontWeight: '600' }}>Remaining on Credit</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#c62828' }}>Rs. {(total - cashReceivedNum).toLocaleString()}</span>
                    </div>
                    <p style={{ fontSize: '11px', color: '#e57373', margin: '4px 0 0' }}>Will be added to customer balance</p>
                  </div>
                )}
                {cashReceived && cashReceivedNum >= total && (
                  <div style={{ marginTop: '10px', padding: '8px 10px', background: '#e8f5e9', borderRadius: '8px' }}>
                    <p style={{ fontSize: '12px', color: '#1a7a4a', fontWeight: '600', margin: 0 }}>✅ Full payment — no credit</p>
                  </div>
                )}
                {!cashReceived && (
                  <div style={{ marginTop: '8px', padding: '8px 10px', background: '#fff8e1', borderRadius: '8px' }}>
                    <p style={{ fontSize: '11px', color: '#b45309', margin: 0 }}>⚠️ Leave empty or enter 0 to add full amount to credit</p>
                  </div>
                )}
              </div>
            )}
            {isPending && (
              <div style={{ marginTop: '10px', padding: '10px', background: '#fff3e0', borderRadius: '8px' }}>
                <p style={{ fontSize: '12px', color: '#e65100', margin: 0 }}>⚠️ Digital payment goes to office — admin will confirm.</p>
              </div>
            )}
          </div>

          {/* Total & Complete */}
          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <p style={{ fontSize: '16px', color: '#555', margin: 0 }}>Total Amount</p>
              <p style={{ fontSize: '28px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>Rs. {total.toLocaleString()}</p>
            </div>
            {!isOnline && (
              <p style={{ fontSize: '12px', color: '#ea580c', margin: '0 0 10px', textAlign: 'center' }}>📵 Will save offline and sync later</p>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setSelectedOrder(null); setCashReceived(''); setBottlesReturned(0) }}
                style={{ flex: 1, padding: '14px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600' }}>
                ← Back
              </button>
              <button onClick={completeDelivery} disabled={saving}
                style={{ flex: 2, padding: '14px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700' }}>
                {saving ? 'Saving...' : '✓ Complete Delivery'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            {[
              { key: 'today', label: "Today's Orders" },
              { key: 'all', label: 'All Assigned' },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: filter === f.key ? '#1a7a4a' : '#f0f0f0', color: filter === f.key ? 'white' : '#555', fontWeight: filter === f.key ? '700' : '400', fontSize: '13px' }}>
                {f.label}
              </button>
            ))}
          </div>

          {loading ? (
            <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>Loading...</p>
          ) : orders.length === 0 ? (
            <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: '40px', marginBottom: '12px' }}>✅</p>
              <p style={{ fontWeight: '700', color: '#1a7a4a', marginBottom: '4px' }}>All done!</p>
              <p style={{ color: '#888', fontSize: '13px' }}>No pending deliveries.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>{orders.length} deliveries pending</p>
              {orders.map((o, idx) => {
                const balance = Number(o.customers?.balance || 0)
                const ourBottles = Number(o.customers?.our_bottles_placed || 0)
                return (
                  <div key={o.id} onClick={() => { selectOrder(o); setCurrentOrderIndex(idx); setNavigating(false) }}
                    style={{ background: o.is_priority ? '#fff8f8' : 'white', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: 'pointer', border: o.is_priority ? '2px solid #fca5a5' : '1px solid #eee', borderLeft: o.is_priority ? '4px solid #c62828' : undefined }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                          <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: o.is_priority ? '#c62828' : '#0f4c81', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>{o.is_priority ? '🔴' : idx + 1}</span>
                          <p style={{ fontWeight: '700', fontSize: '15px', margin: 0, color: '#333' }}>{o.customers?.full_name}</p>
                          {o.is_priority && <span style={{ fontSize: 10, background: '#c62828', color: '#fff', padding: '2px 7px', borderRadius: 20, fontWeight: 700, whiteSpace: 'nowrap' }}>URGENT</span>}
                        </div>
                        {o.customers?.address && (
                          <p style={{ fontSize: '12px', color: '#888', margin: '0 0 2px 30px' }}>📍 {o.customers.address}</p>
                        )}
                        <p style={{ fontSize: '12px', color: '#888', margin: '0 0 6px 30px' }}>📞 {o.customers?.mobile}</p>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginLeft: '30px' }}>
                          {o.qty_19l > 0 && <span style={{ fontSize: '12px', background: '#e3f0ff', color: '#0f4c81', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>🍶 {o.qty_19l} × 19L</span>}
                          {o.qty_half_litre > 0 && <span style={{ fontSize: '12px', background: '#e3f0ff', color: '#0f4c81', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>💧 {o.qty_half_litre} × Half</span>}
                          {o.qty_1_5l > 0 && <span style={{ fontSize: '12px', background: '#e3f0ff', color: '#0f4c81', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>🧴 {o.qty_1_5l} × 1.5L</span>}
                          {o.product_items?.map((p, i) => (
                            <span key={i} style={{ fontSize: '12px', background: '#f3e8ff', color: '#7c3aed', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>📦 {p.qty} × {p.name}</span>
                          ))}
                          {ourBottles > 0 && <span style={{ fontSize: '12px', background: '#fff3e0', color: '#e65100', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' }}>🫙 {ourBottles} bottles</span>}
                        </div>
                        {o.notes && <p style={{ fontSize: '11px', color: '#aaa', margin: '4px 0 0 30px' }}>{o.notes}</p>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '10px' }}>
                        <p style={{ fontSize: '13px', color: balance > 0 ? '#f44336' : '#4caf50', fontWeight: '700', margin: '0 0 4px' }}>
                          {balance > 0 ? `Rs. ${balance.toLocaleString()}` : balance < 0 ? `Adv ${Math.abs(balance).toLocaleString()}` : 'Clear'}
                        </p>
                        {(o.customers?.latitude || o.customers?.address) && (
                          <a href={(() => {
                            const dest = o.customers?.latitude && o.customers?.longitude
                              ? `${o.customers.latitude},${o.customers.longitude}`
                              : encodeURIComponent(o.customers?.address || '')
                            const isAndroid = /android/i.test(navigator.userAgent)
                            const isIOS = /iphone|ipad/i.test(navigator.userAgent)
                            if (isAndroid) return `google.navigation:q=${dest}`
                            if (isIOS) return `comgooglemaps://?daddr=${dest}&directionsmode=driving`
                            return `https://www.google.com/maps/dir/Current+Location/${dest}`
                          })()} target="_blank" rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ display: 'inline-block', padding: '4px 8px', background: '#e3f0ff', color: '#0f4c81', borderRadius: 6, fontSize: 11, fontWeight: 700, textDecoration: 'none', marginBottom: 4 }}>
                            📍 Nav
                          </a>
                        )}
                        <span style={{ fontSize: '20px', color: '#ccc', display: 'block' }}>›</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}