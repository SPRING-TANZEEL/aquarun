import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import * as AccountingEngine from '../accountingEngine'
import InvoiceModal from '../components/InvoiceModal'

const RATES_19L = [90, 100, 110, 120, 150, 160, 170, 180]

export default function AdminQuickSale({ tenantId }) {
  const [mode, setMode] = useState('sale')
  const [products, setProducts] = useState([])
  const [quantities, setQuantities] = useState({})
  const [rates, setRates] = useState({})
  const [qty19l, setQty19l] = useState(1)
  const [rate19l, setRate19l] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [notes, setNotes] = useState('')
  const [bottlesReturned, setBottlesReturned] = useState(0)
  const [customerName, setCustomerName] = useState('')
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0])
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [showInvoice, setShowInvoice] = useState(false)
  const [lastDelivery, setLastDelivery] = useState(null)
  const [settings, setSettings] = useState({})
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethodReceipt, setPaymentMethodReceipt] = useState('cash')
  const [paymentSearch, setPaymentSearch] = useState('')
  const [paymentSearchResults, setPaymentSearchResults] = useState([])
  const [paymentCustomer, setPaymentCustomer] = useState(null)
  const [paymentNotes, setPaymentNotes] = useState('')
  const [returnCustomer, setReturnCustomer] = useState(null)
  const [returnSearch, setReturnSearch] = useState('')
  const [returnSearchResults, setReturnSearchResults] = useState([])
  const [returnQty, setReturnQty] = useState(0)
  const [returnSaving, setReturnSaving] = useState(false)
  const [amountReceived, setAmountReceived] = useState('')

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (tenantId) { fetchProducts(); fetchSettings() }
  }, [tenantId])

  async function fetchSettings() {
    const { data } = await supabase.from('business_settings').select('*').eq('tenant_id', tenantId)
    const map = {}
    data?.forEach(s => { map[s.setting_key] = s.setting_value })
    setSettings(map)
  }

  async function fetchProducts() {
    const { data } = await supabase.from('products')
      .select('*').eq('tenant_id', tenantId).eq('is_active', true).eq('is_saleable', true)
      .order('product_type').order('name')
    setProducts(data || [])
    const q = {}; const r = {}
    data?.forEach(p => { q[p.id] = 0; r[p.id] = Number(p.sale_price) || 0 })
    setQuantities(q); setRates(r)
  }

  async function searchCustomer(val) {
    setCustomerSearch(val)
    if (val.length < 2) { setCustomerResults([]); return }
    const { data } = await supabase.from('customer_balances')
      .select('id, full_name, mobile, customer_code, address, balance, rate_19l, rate_half_litre, rate_1_5l, is_tax_applicable, our_bottles_placed')
      .eq('tenant_id', tenantId).eq('is_active', true)
      .or(`full_name.ilike.%${val}%,mobile.ilike.%${val}%,customer_code.ilike.%${val}%`).limit(5)
    setCustomerResults(data || [])
  }

  async function searchPaymentCustomer(val) {
    setPaymentSearch(val)
    if (val.length < 2) { setPaymentSearchResults([]); return }
    const { data } = await supabase.from('customer_balances')
      .select('id, full_name, mobile, customer_code, address, balance, rate_19l, rate_half_litre, rate_1_5l, is_tax_applicable, our_bottles_placed')
      .eq('tenant_id', tenantId).eq('is_active', true)
      .or(`full_name.ilike.%${val}%,mobile.ilike.%${val}%,customer_code.ilike.%${val}%`).limit(5)
    setPaymentSearchResults(data || [])
  }

  function selectCustomer(c) {
    setSelectedCustomer(c)
    setCustomerResults([])
    setCustomerName('')
    if (c.rate_19l) setRate19l(Number(c.rate_19l))
    const newRates = { ...rates }
    products.forEach(p => {
      if (p.bottle_type === 'half_litre' && c.rate_half_litre) newRates[p.id] = Number(c.rate_half_litre)
      if (p.bottle_type === '1_5l' && c.rate_1_5l) newRates[p.id] = Number(c.rate_1_5l)
    })
    setRates(newRates)
  }

  const bottleProducts = products.filter(p => p.bottle_type === 'half_litre' || p.bottle_type === '1_5l')
  const extraProducts = products.filter(p => !p.bottle_type)
  const bottleTotal = bottleProducts.reduce((s, p) => s + (quantities[p.id] || 0) * (rates[p.id] || 0), 0)
  const extraTotal = extraProducts.reduce((s, p) => s + (quantities[p.id] || 0) * (rates[p.id] || 0), 0)
  const subTotal = (qty19l * (rate19l || 0)) + bottleTotal + extraTotal
  const taxRate = selectedCustomer?.is_tax_applicable ? Number(settings.sales_tax_rate || 0) : 0
  const taxAmount = Math.round(subTotal * taxRate / 100)
  const total = subTotal + taxAmount
  const customerOutstanding = selectedCustomer ? Math.max(0, Number(selectedCustomer.balance || 0)) : 0
  const customerAdvance = selectedCustomer ? Math.max(0, -(Number(selectedCustomer.balance || 0))) : 0
  const totalDue = paymentMethod === 'cash' ? total + customerOutstanding : total
  const received = paymentMethod === 'cash' ? (amountReceived !== '' ? Number(amountReceived) : total) : total
  const change = received - totalDue
  const isAdvanceAdjustment = paymentMethod === 'cash' && customerAdvance > 0 && amountReceived === ''
  const advanceAfterSale = customerAdvance - total

  function getBottleQtys() {
    let qtyHalf = 0, qty15l = 0
    bottleProducts.forEach(p => {
      if (p.bottle_type === 'half_litre') qtyHalf += (quantities[p.id] || 0)
      if (p.bottle_type === '1_5l') qty15l += (quantities[p.id] || 0)
    })
    return { qtyHalf, qty15l }
  }

  function getSaleLabel() {
    const labels = {
      cash: '💵 Cash Sale',
      jazzcash: '📱 JazzCash Sale',
      easypaisa: '💚 EasyPaisa Sale',
      bank: '🏦 Bank Sale',
      credit: '📋 Credit Sale'
    }
    return labels[paymentMethod] || 'Sale'
  }

  function getSaleBg() {
    const bgs = {
      cash: 'linear-gradient(135deg,#1a7a4a,#2e7d32)',
      jazzcash: 'linear-gradient(135deg,#9c27b0,#7b1fa2)',
      easypaisa: 'linear-gradient(135deg,#2e7d32,#1b5e20)',
      bank: 'linear-gradient(135deg,#0f4c81,#0d3a61)',
      credit: 'linear-gradient(135deg,#f44336,#c62828)'
    }
    return bgs[paymentMethod] || bgs.cash
  }

  // ── RECEIVE PAYMENT ─────────────────────────────────────────────
  async function receivePayment() {
    if (!paymentCustomer) return alert('Please select a customer')
    if (!paymentAmount || Number(paymentAmount) <= 0) return alert('Please enter payment amount')
    setSaving(true)

    const amount = Number(paymentAmount)
    const isPending = ['jazzcash', 'easypaisa', 'bank'].includes(paymentMethodReceipt)

    const { data: savedPayment, error } = await supabase.from('payments').insert([{
      tenant_id: tenantId, customer_id: paymentCustomer.id, amount,
      payment_method: paymentMethodReceipt,
      payment_date: new Date().toISOString().split('T')[0],
      jazzcash_confirmed: !isPending,
      notes: paymentNotes || `Payment received from ${paymentCustomer.full_name}`,
      is_voided: false, rider_id: null
    }]).select().single()

    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    if (!isPending) {
      await supabase.from('customers').update({ balance: Number(paymentCustomer.balance || 0) - amount })
        .eq('id', paymentCustomer.id).eq('tenant_id', tenantId)
    }

    try {
      await AccountingEngine.postPaymentJournal(savedPayment, tenantId, false)
    } catch (err) { console.error('Journal error:', err) }

    setSuccess({
      type: 'payment', name: paymentCustomer.full_name, amount,
      method: paymentMethodReceipt,
      newBalance: !isPending ? Number(paymentCustomer.balance || 0) - amount : paymentCustomer.balance,
      jazzPending: isPending, customerMobile: paymentCustomer.mobile || ''
    })
    setPaymentCustomer(null); setPaymentSearch(''); setPaymentAmount(''); setPaymentNotes('')
    setSaving(false)
  }

  // ── POST SALE ───────────────────────────────────────────────────
  async function postSale() {
    const { qtyHalf, qty15l } = getBottleQtys()
    const hasItems = qty19l > 0 || qtyHalf > 0 || qty15l > 0 || products.some(p => (quantities[p.id] || 0) > 0)
    if (!hasItems) return alert('Please enter at least one item')
    if (qty19l > 0 && !rate19l) return alert('Please select rate for 19L bottle')
    if (paymentMethod === 'credit' && !selectedCustomer) return alert('Please select a customer for credit sale')
    setSaving(true)

    const walkinName = selectedCustomer?.full_name || customerName || 'Walk-in Customer'
    const descParts = []
    if (qty19l > 0) descParts.push(`19L×${qty19l}@Rs.${rate19l}`)
    bottleProducts.filter(p => (quantities[p.id] || 0) > 0).forEach(p => { descParts.push(`${p.name}×${quantities[p.id]}@Rs.${rates[p.id]}`) })
    extraProducts.filter(p => (quantities[p.id] || 0) > 0).forEach(p => { descParts.push(`${p.name}×${quantities[p.id]}@Rs.${rates[p.id]}`) })

    const deliveryData = {
      tenant_id: tenantId, customer_id: selectedCustomer?.id || null, rider_id: null,
      qty_19l: qty19l, qty_half_litre: qtyHalf, qty_1_5l: qty15l,
      rate_applied: rate19l || 0, total_amount: subTotal,
      payment_method: paymentMethod,
      amount_received: ['credit', 'jazzcash', 'easypaisa', 'bank'].includes(paymentMethod) ? 0 : Math.min(received, total),
      credit_amount: paymentMethod === 'credit' ? total : (isAdvanceAdjustment ? total : (received < total ? total - received : received > total ? -(received - total) : 0)),
      jazzcash_confirmed: false,
      delivered_at: new Date(saleDate).toISOString(), is_voided: false,
      bottles_returned: bottlesReturned,
      notes: [walkinName !== 'Walk-in Customer' ? `Customer: ${walkinName}` : '', descParts.join(' | '), notes].filter(Boolean).join(' — '),
      tax_rate: taxRate, tax_amount: taxAmount, total_with_tax: total
    }

    const { data: savedDelivery, error } = await supabase.from('deliveries').insert([deliveryData]).select().single()
    if (error) { alert('Error: ' + error.message); setSaving(false); return }

    const deliveryItems = []
    if (qty19l > 0) deliveryItems.push({ tenant_id: tenantId, delivery_id: savedDelivery.id, product_id: null, product_name: '19 Litre Water Bottle', bottle_type: '19l', qty: qty19l, rate: rate19l || 0, amount: qty19l * (rate19l || 0) })
    bottleProducts.forEach(p => {
      if ((quantities[p.id] || 0) > 0) {
        const rate = rates[p.id] || Number(p.sale_price) || 0
        deliveryItems.push({ tenant_id: tenantId, delivery_id: savedDelivery.id, product_id: p.id, product_name: p.name, bottle_type: p.bottle_type, qty: quantities[p.id], rate, amount: quantities[p.id] * rate })
      }
    })
    extraProducts.forEach(p => {
      if ((quantities[p.id] || 0) > 0) {
        const rate = rates[p.id] || Number(p.sale_price) || 0
        deliveryItems.push({ tenant_id: tenantId, delivery_id: savedDelivery.id, product_id: p.id, product_name: p.name, bottle_type: null, qty: quantities[p.id], rate, amount: quantities[p.id] * rate })
      }
    })
    if (deliveryItems.length > 0) await supabase.from('delivery_items').insert(deliveryItems)

    const allSoldProducts = products.filter(p => (quantities[p.id] || 0) > 0)
    for (const p of allSoldProducts) {
      const qtySold = quantities[p.id]
      const avgCost = Number(p.average_cost || p.purchase_price || 0)
      const cogsCost = qtySold * avgCost
      await supabase.from('products').update({ current_stock: Math.max(0, Number(p.current_stock || 0) - qtySold) }).eq('id', p.id).eq('tenant_id', tenantId)
      if ((p.product_type === 'finished_good' || p.product_type === 'trading') && cogsCost > 0) {
        try {
          const { data: je } = await supabase.from('journal_entries').insert([{ tenant_id: tenantId, entry_date: saleDate, reference_type: 'cogs', reference_id: savedDelivery.id, narration: `COGS — ${p.name} × ${qtySold} sold`, total_amount: cogsCost, created_by: 'admin' }]).select().single()
          if (je) {
            const saleAmount = Number(p.selling_price || p.unit_cost || 0) * qtySold
            const drAccount = paymentMethod === 'cash' ? '1001' : paymentMethod === 'jazzcash' ? '1002' : '1100'
            const drName = paymentMethod === 'cash' ? 'Cash in Hand' : paymentMethod === 'jazzcash' ? 'JazzCash Account' : 'Accounts Receivable'
            await supabase.from('journal_entry_lines').insert([
              { tenant_id: tenantId, journal_entry_id: je.id, account_code: '5003', account_name: 'Cost of Goods Sold', debit: cogsCost, credit: 0 },
              { tenant_id: tenantId, journal_entry_id: je.id, account_code: p.product_type === 'trading' ? '1202' : '1201', account_name: p.product_type === 'trading' ? 'Inventory - Trading Items' : 'Inventory - Finished Goods', debit: 0, credit: cogsCost },
              { tenant_id: tenantId, journal_entry_id: je.id, account_code: drAccount, account_name: drName, debit: saleAmount, credit: 0 },
              { tenant_id: tenantId, journal_entry_id: je.id, account_code: '4004', account_name: 'Other Product Sales', debit: 0, credit: saleAmount },
            ])
          }
        } catch (err) { console.error('COGS journal error:', err) }
      }
    }

    if (paymentMethod === 'credit' && selectedCustomer) {
      await supabase.from('customers').update({ balance: Number(selectedCustomer.balance || 0) + total }).eq('id', selectedCustomer.id).eq('tenant_id', tenantId)
    } else if (paymentMethod === 'cash' && selectedCustomer) {
      if (isAdvanceAdjustment) {
        // Advance covers sale — reduce advance by sale amount
        const newBalance = Number(selectedCustomer.balance || 0) + total
        await supabase.from('customers').update({ balance: newBalance }).eq('id', selectedCustomer.id).eq('tenant_id', tenantId)
      } else if (amountReceived !== '') {
        // Custom amount received — newBalance = old balance + sale - received
        const newBalance = Number(selectedCustomer.balance || 0) + total - Number(amountReceived)
        await supabase.from('customers').update({ balance: newBalance }).eq('id', selectedCustomer.id).eq('tenant_id', tenantId)
      }
    }

    if (selectedCustomer && (qty19l > 0 || bottlesReturned > 0)) {
      const currentBottles = Number(selectedCustomer.our_bottles_placed || 0)
      await supabase.from('customers').update({ our_bottles_placed: Math.max(0, currentBottles + qty19l - bottlesReturned) }).eq('id', selectedCustomer.id).eq('tenant_id', tenantId)
    }

    try {
      const journalAmountReceived = (paymentMethod === 'cash' && !isAdvanceAdjustment && amountReceived !== '') ? Number(amountReceived) : null
      const journalCustomerBalance = selectedCustomer ? Number(selectedCustomer.balance || 0) : 0
      await AccountingEngine.postDeliveryJournal(savedDelivery, selectedCustomer?.id || null, tenantId, false, journalAmountReceived, journalCustomerBalance)
    } catch (err) { console.error('Journal post error:', err) }

    try {
      const year = new Date().getFullYear()
      const counterKey = `invoice_counter_${year}`
      const { data: counterRows } = await supabase.from('business_settings').select('setting_value').eq('tenant_id', tenantId).eq('setting_key', counterKey)
      const counter = Number(counterRows?.[0]?.setting_value || 0) + 1
      const { data: tenantData } = await supabase.from('tenants').select('tenant_code').eq('id', tenantId).single()
      const code = tenantData?.tenant_code || 'INV'
      const invoiceNumber = `${code}-${year}-${String(counter).padStart(4, '0')}`
      await supabase.from('business_settings').upsert({ tenant_id: tenantId, setting_key: counterKey, setting_value: String(counter) }, { onConflict: 'tenant_id,setting_key' })
      await supabase.from('deliveries').update({ invoice_number: invoiceNumber }).eq('id', savedDelivery.id)
      setLastDelivery({ ...savedDelivery, invoice_number: invoiceNumber, tax_amount: taxAmount, total_with_tax: total, _customer: selectedCustomer })
    } catch (err) { console.error('Invoice number error:', err) }

    setSuccess({ type: 'sale', total, paymentMethod, name: walkinName, desc: descParts.join(', '), deliveryId: savedDelivery.id, customerMobile: selectedCustomer?.mobile || '', newBalance: selectedCustomer ? (paymentMethod === 'credit' ? Number(selectedCustomer.balance || 0) + total : Number(selectedCustomer.balance || 0)) : 0 })
    setQty19l(1); setRate19l(null); setPaymentMethod('cash'); setNotes(''); setCustomerName(''); setBottlesReturned(0); setAmountReceived('')
    setSaleDate(new Date().toISOString().split('T')[0])
    setSelectedCustomer(null); setCustomerSearch('')
    await fetchProducts()
    setSaving(false)
  }

  async function processBottleReturn() {
    if (!returnCustomer) return alert('Please select a customer')
    if (returnQty <= 0) return alert('Please enter bottles to return')
    if (returnQty > Number(returnCustomer.our_bottles_placed || 0)) return alert('Cannot return more bottles than customer has (' + returnCustomer.our_bottles_placed + ' bottles)')
    setReturnSaving(true)
    try {
      // Update customer bottle count
      const newCount = Number(returnCustomer.our_bottles_placed || 0) - returnQty
      await supabase.from('customers').update({ our_bottles_placed: Math.max(0, newCount) })
        .eq('id', returnCustomer.id).eq('tenant_id', tenantId)

      // Post bottle movement journal (negative = returning)
      const { data: bottleProduct } = await supabase.from('products')
        .select('average_cost').eq('tenant_id', tenantId).eq('bottle_type', '19l').eq('product_type', 'trading').maybeSingle()
      const bottleCost = Number(bottleProduct?.average_cost || 900)
      await AccountingEngine.postBottleMovementJournal(-returnQty, bottleCost, tenantId, returnCustomer.id, new Date().toISOString().split('T')[0], 'Admin')
      const { data: bp1 } = await supabase.from('products').select('id, current_stock').eq('tenant_id', tenantId).eq('bottle_type', '19l').eq('product_type', 'trading').maybeSingle()
      if (bp1) await supabase.from('products').update({ current_stock: Number(bp1.current_stock || 0) + returnQty }).eq('id', bp1.id)

      setSuccess({ type: 'bottle_return', name: returnCustomer.full_name, qty: returnQty, newCount, customerMobile: returnCustomer.mobile || '' })
      setReturnCustomer(null); setReturnSearch(''); setReturnQty(0)
    } catch (err) {
      alert('Error: ' + err.message)
    }
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

  const inp = { width: '100%', padding: '10px 12px', border: '1.5px solid #e0e0e0', borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box', background: 'white', color: '#333', caretColor: '#0f4c81' }
  const card = { background: 'white', borderRadius: '12px', padding: '12px 14px', marginBottom: '10px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)', border: '1px solid #f0f0f0' }

  function SmallNumBtn({ val, onDec, onInc, color = '#0f4c81' }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button onClick={onDec} style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1.5px solid #ddd', background: '#f5f5f5', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>−</button>
        <span style={{ fontSize: '18px', fontWeight: '700', minWidth: '24px', textAlign: 'center', color: val > 0 ? color : '#ccc' }}>{val}</span>
        <button onClick={onInc} style={{ width: '32px', height: '32px', borderRadius: '50%', border: `1.5px solid ${color}`, background: color, color: 'white', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>+</button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', margin: '0 0 4px' }}>⚡ Quick Sale & Payment</h2>
        <p style={{ fontSize: '13px', color: '#888', margin: 0 }}>Walk-in sales and customer payment receipts</p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button onClick={() => { setMode('sale'); setSuccess(null) }}
          style={{ flex: 1, padding: '12px', border: '2px solid', borderColor: mode === 'sale' ? '#0f4c81' : '#eee', borderRadius: '10px', cursor: 'pointer', background: mode === 'sale' ? '#0f4c81' : 'white', color: mode === 'sale' ? 'white' : '#555', fontWeight: '700', fontSize: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
          <span style={{ fontSize: '20px' }}>⚡</span>
          <span>Quick Sale</span>
          <span style={{ fontSize: '11px', opacity: 0.8 }}> </span>
        </button>
        <button onClick={() => { setMode('payment'); setSuccess(null) }}
          style={{ flex: 1, padding: '12px', border: '2px solid', borderColor: mode === 'payment' ? '#1a7a4a' : '#eee', borderRadius: '10px', cursor: 'pointer', background: mode === 'payment' ? '#1a7a4a' : 'white', color: mode === 'payment' ? 'white' : '#555', fontWeight: '700', fontSize: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
          <span style={{ fontSize: '20px' }}>💰</span>
          <span>Receive Payment</span>
          <span style={{ fontSize: '11px', opacity: 0.8 }}> </span>
        </button>
        <button onClick={() => { setMode('return'); setSuccess(null); setReturnCustomer(null); setReturnSearch(''); setReturnQty(0) }}
          style={{ flex: 1, padding: '12px', border: '2px solid', borderColor: mode === 'return' ? '#e65100' : '#eee', borderRadius: '10px', cursor: 'pointer', background: mode === 'return' ? '#e65100' : 'white', color: mode === 'return' ? 'white' : '#555', fontWeight: '700', fontSize: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
          <span style={{ fontSize: '20px' }}>🫙</span>
          <span>Return Bottles</span>
          <span style={{ fontSize: '11px', opacity: 0.8 }}> </span>
        </button>
      </div>

      {success && (
        <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '12px', padding: '14px 16px', marginBottom: '14px' }}>
          {success.type === 'bottle_return' ? (
            <>
              <p style={{ fontWeight: '700', color: '#1b5e20', margin: '0 0 4px' }}>✅ Bottles Returned!</p>
              <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>👤 {success.name}</p>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#e65100', margin: '0 0 2px' }}>🫙 {success.qty} bottle{success.qty > 1 ? 's' : ''} returned</p>
              <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>Remaining with customer: <strong>{success.newCount}</strong></p>
            </>
          ) : success.type === 'payment' ? (
            <>
              <p style={{ fontWeight: '700', color: '#1b5e20', margin: '0 0 4px' }}>✅ Payment Received!</p>
              <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>👤 {success.name}</p>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 2px' }}>Rs. {success.amount.toLocaleString()} — {success.method}</p>
              {success.jazzPending && <p style={{ fontSize: '12px', color: '#e65100', margin: '4px 0 0', fontWeight: '600' }}>⚠️ Pending — confirm in reconciliation to update balance</p>}
              {!success.jazzPending && <p style={{ fontSize: '12px', color: '#555', margin: '4px 0 0' }}>New balance: <strong style={{ color: success.newBalance > 0 ? '#f44336' : '#1a7a4a' }}>Rs. {Math.abs(success.newBalance).toLocaleString()} {success.newBalance > 0 ? 'outstanding' : success.newBalance < 0 ? 'advance' : 'clear'}</strong></p>}
            </>
          ) : (
            <>
              <p style={{ fontWeight: '700', color: '#1b5e20', margin: '0 0 4px' }}>✅ Sale Posted!</p>
              <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 2px' }}>👤 {success.name}</p>
              <p style={{ fontSize: '13px', color: '#2e7d32', margin: '0 0 4px' }}>{success.desc}</p>
              <p style={{ fontSize: '15px', fontWeight: '700', color: '#1a7a4a', margin: 0 }}>Rs. {success.total.toLocaleString()} — {success.paymentMethod}</p>
            </>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => setSuccess(null)} style={{ padding: '5px 14px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
              {mode === 'sale' ? '+ New Sale' : mode === 'return' ? '+ New Return' : '+ New Payment'}
            </button>
            {success?.deliveryId && (
              <button onClick={() => setShowInvoice(true)} style={{ padding: '5px 14px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                🧾 Print Invoice
              </button>
            )}
            {success?.type === 'sale' && (() => {
              const rawPhone = success?.customerMobile || ''
              const customerPhone = rawPhone.replace(/\D/g, '').replace(/^0/, '').replace(/^92/, '')
              const waNumber = customerPhone ? `92${customerPhone}` : ''
              const bizName = settings.business_name || 'AquaRun'
              const balanceMsg = success?.newBalance > 0 ? `\n⚠️ Outstanding Balance: Rs. ${success.newBalance.toLocaleString()}` : success?.newBalance < 0 ? `\n✅ Advance Credit: Rs. ${Math.abs(success.newBalance).toLocaleString()}` : `\n✅ Account Clear`
              const msg = `*${bizName} — Sale Receipt*\n\n👤 Customer: ${success.name}\n📦 Items: ${success.desc}\n💰 Amount: Rs. ${success.total.toLocaleString()}\n💳 Payment: ${success.paymentMethod}${balanceMsg}\n\n_Thank you for your business!_\n_${bizName}_`
              const url = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`
              return <button onClick={() => window.open(url, '_blank')} style={{ padding: '5px 14px', background: '#25d366', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>💬 WhatsApp</button>
            })()}
            {success?.type === 'payment' && success?.customerMobile && (() => {
              const phone = success.customerMobile.replace(/\D/g, '').replace(/^0/, '').replace(/^92/, '')
              const waNumber = phone ? `92${phone}` : ''
              const bizName = settings.business_name || 'AquaRun'
              const msg = `*${bizName} — Payment Received*\n\n👤 Customer: ${success.name}\n💰 Amount Received: Rs. ${success.amount.toLocaleString()}\n💳 Method: ${success.method}\n${success.jazzPending ? `⚠️ Pending confirmation\n` : ''}${!success.jazzPending ? `📊 New Balance: Rs. ${Math.abs(success.newBalance).toLocaleString()}${success.newBalance > 0 ? ' (outstanding)' : success.newBalance < 0 ? ' CR' : ' (clear)'}` : ''}\n\n_Thank you!_\n_${bizName}_`
              const url = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`
              return <button onClick={() => window.open(url, '_blank')} style={{ padding: '5px 14px', background: '#25d366', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>💬 WhatsApp</button>
            })()}
          </div>
        </div>
      )}

      {/* ── PAYMENT MODE ─────────────────────────────────────────── */}
      {mode === 'payment' && (
        <div>
          <div style={card}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '8px', textTransform: 'uppercase' }}>Select Customer *</p>
            {paymentCustomer ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#e3f0ff', borderRadius: '8px', border: '1px solid #c8d8ff' }}>
                <div>
                  <p style={{ fontWeight: '700', fontSize: '14px', margin: '0 0 2px', color: '#0f4c81' }}>{paymentCustomer.full_name}</p>
                  <p style={{ fontSize: '12px', color: '#555', margin: '0 0 2px' }}>{paymentCustomer.mobile} · {paymentCustomer.customer_code}</p>
                  <p style={{ fontSize: '13px', fontWeight: '700', margin: 0, color: Number(paymentCustomer.balance) > 0 ? '#f44336' : '#1a7a4a' }}>
                    Outstanding: Rs. {Math.abs(Number(paymentCustomer.balance || 0)).toLocaleString()}
                    {Number(paymentCustomer.balance) <= 0 && ' (No balance due)'}
                  </p>
                </div>
                <button onClick={() => { setPaymentCustomer(null); setPaymentSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '20px', marginLeft: '8px' }}>✕</button>
              </div>
            ) : (
              <div>
                <input value={paymentSearch} onChange={e => searchPaymentCustomer(e.target.value)} placeholder="Search by name, mobile or customer ID..." style={inp} />
                {paymentSearchResults.length > 0 && (
                  <div style={{ border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden', marginTop: '4px' }}>
                    {paymentSearchResults.map(c => (
                      <div key={c.id} onClick={() => { setPaymentCustomer(c); setPaymentSearchResults([]); setPaymentSearch(''); if (c.balance > 0) setPaymentAmount(String(c.balance)) }}
                        style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white' }}>
                        <div>
                          <p style={{ fontWeight: '600', fontSize: '13px', margin: '0 0 2px' }}>{c.full_name}</p>
                          <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{c.mobile} · {c.customer_code}</p>
                          {c.address && <p style={{ fontSize: '11px', color: '#aaa', margin: '2px 0 0' }}>📍 {c.address}</p>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ fontSize: '13px', fontWeight: '700', color: Number(c.balance) > 0 ? '#f44336' : '#1a7a4a', margin: 0 }}>Rs. {Math.abs(Number(c.balance)).toLocaleString()}</p>
                          <p style={{ fontSize: '10px', color: '#aaa', margin: 0 }}>{Number(c.balance) > 0 ? 'outstanding' : 'advance'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={card}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '8px', textTransform: 'uppercase' }}>Payment Method</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { key: 'cash', label: 'Cash', urdu: 'نقد', icon: '💵', color: '#1a7a4a' },
                { key: 'jazzcash', label: 'JazzCash', urdu: 'JZC', icon: '📱', color: '#9c27b0' },
                ...(settings?.jazzcash_number_2 ? [{ key: 'easypaisa', label: 'EasyPaisa', urdu: 'EP', icon: '💚', color: '#4caf50' }] : []),
                ...(settings?.bank_name ? [{ key: 'bank', label: 'Bank', urdu: 'بینک', icon: '🏦', color: '#0f4c81' }] : []),
              ].map(pm => (
                <button key={pm.key} onClick={() => setPaymentMethodReceipt(pm.key)}
                  style={{ flex: 1, padding: '10px 4px', border: '2px solid', borderColor: paymentMethodReceipt === pm.key ? pm.color : '#eee', borderRadius: '10px', cursor: 'pointer', background: paymentMethodReceipt === pm.key ? pm.color : 'white', color: paymentMethodReceipt === pm.key ? 'white' : '#555', fontWeight: '700', fontSize: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                  <span style={{ fontSize: '20px' }}>{pm.icon}</span>
                  <span>{pm.urdu}</span>
                  <span style={{ fontSize: '10px', opacity: 0.8 }}>{pm.label}</span>
                </button>
              ))}
            </div>
            {paymentMethodReceipt === 'jazzcash' && <p style={{ fontSize: '12px', color: '#9c27b0', margin: '8px 0 0', background: '#f3e5f5', padding: '7px 10px', borderRadius: '8px', fontWeight: '600' }}>📱 JazzCash — pending until confirmed in reconciliation</p>}
            {paymentMethodReceipt === 'easypaisa' && <p style={{ fontSize: '12px', color: '#4caf50', margin: '8px 0 0', background: '#e8f5e9', padding: '7px 10px', borderRadius: '8px', fontWeight: '600' }}>💚 EasyPaisa: {settings?.jazzcash_number_2} — pending until confirmed</p>}
            {paymentMethodReceipt === 'bank' && <p style={{ fontSize: '12px', color: '#0f4c81', margin: '8px 0 0', background: '#e3f0ff', padding: '7px 10px', borderRadius: '8px', fontWeight: '600' }}>🏦 {settings?.bank_name} — {settings?.bank_account_number} — pending until confirmed</p>}
            {paymentMethodReceipt === 'cash' && <p style={{ fontSize: '12px', color: '#1a7a4a', margin: '8px 0 0', background: '#e8f5e9', padding: '7px 10px', borderRadius: '8px', fontWeight: '600' }}>💵 Cash goes directly to CEO Cash in Hand</p>}
          </div>

          <div style={card}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '8px', textTransform: 'uppercase' }}>Amount Received (Rs.)</p>
            <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0" style={{ ...inp, fontSize: '28px', fontWeight: '700', textAlign: 'center', marginBottom: '8px' }} />
            {paymentCustomer && Number(paymentCustomer.balance) > 0 && (
              <button onClick={() => setPaymentAmount(String(paymentCustomer.balance))} style={{ width: '100%', padding: '8px', background: '#f0f7ff', border: '1px solid #c8d8ff', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#0f4c81', fontWeight: '600' }}>
                Full Balance: Rs. {Number(paymentCustomer.balance).toLocaleString()}
              </button>
            )}
          </div>

          <div style={card}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '6px', textTransform: 'uppercase' }}>Notes (optional)</p>
            <input value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} placeholder="e.g. Monthly payment, partial payment..." style={inp} />
          </div>

          <div style={card}>
            {paymentCustomer && paymentAmount && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', padding: '10px 12px', background: '#f0f7ff', borderRadius: '8px' }}>
                <span style={{ fontSize: '15px', fontWeight: '700', color: '#333' }}>Amount to Receive</span>
                <span style={{ fontSize: '26px', fontWeight: '800', color: '#0f4c81' }}>Rs. {Number(paymentAmount).toLocaleString()}</span>
              </div>
            )}
            <button onClick={receivePayment} disabled={saving}
              style={{ width: '100%', padding: '14px', background: paymentMethodReceipt === 'cash' ? 'linear-gradient(135deg,#1a7a4a,#2e7d32)' : paymentMethodReceipt === 'jazzcash' ? 'linear-gradient(135deg,#9c27b0,#7b1fa2)' : paymentMethodReceipt === 'easypaisa' ? 'linear-gradient(135deg,#2e7d32,#1b5e20)' : 'linear-gradient(135deg,#0f4c81,#0d3a61)', color: 'white', border: 'none', borderRadius: '10px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: '700', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              {saving ? '⏳ Saving...' : `✓ ${paymentMethodReceipt === 'cash' ? '💵 Receive Cash' : paymentMethodReceipt === 'jazzcash' ? '📱 Record JazzCash' : paymentMethodReceipt === 'easypaisa' ? '💚 Record EasyPaisa' : '🏦 Record Bank'} — Rs. ${Number(paymentAmount || 0).toLocaleString()}`}
            </button>
          </div>
        </div>
      )}

      {/* ── SALE MODE ─────────────────────────────────────────────── */}
      {mode === 'sale' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', alignItems: 'start' }}>

          {/* LEFT COLUMN */}
          <div>
            {/* Payment Method */}
            <div style={card}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payment Method</p>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[
                  { key: 'cash',      label: 'Cash',      urdu: 'نقد',     icon: '💵', color: '#1a7a4a' },
                  { key: 'jazzcash',  label: 'JazzCash',  urdu: 'JZC',     icon: '📱', color: '#9c27b0' },
                  ...(settings?.jazzcash_number_2 ? [{ key: 'easypaisa', label: 'EasyPaisa', urdu: 'EP', icon: '💚', color: '#4caf50' }] : []),
                  ...(settings?.bank_name ? [{ key: 'bank', label: 'Bank', urdu: 'بینک', icon: '🏦', color: '#0f4c81' }] : []),
                  { key: 'credit',    label: 'Credit',    urdu: 'ادھار',   icon: '📋', color: '#f44336' },
                ].map(pm => (
                  <button key={pm.key} onClick={() => setPaymentMethod(pm.key)}
                    style={{ flex: 1, padding: '10px 4px', border: '2px solid', borderColor: paymentMethod === pm.key ? pm.color : '#eee', borderRadius: '10px', cursor: 'pointer', background: paymentMethod === pm.key ? pm.color : 'white', color: paymentMethod === pm.key ? 'white' : '#555', fontWeight: '700', fontSize: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    <span style={{ fontSize: '18px' }}>{pm.icon}</span>
                    <span>{pm.urdu}</span>
                    <span style={{ fontSize: '10px', opacity: 0.8 }}>{pm.label}</span>
                  </button>
                ))}
              </div>
              <p style={{ fontSize: '11px', fontWeight: '600', margin: '8px 0 0', padding: '6px 10px', borderRadius: '6px', background: paymentMethod === 'cash' ? '#e8f5e9' : paymentMethod === 'jazzcash' ? '#f3e5f5' : paymentMethod === 'easypaisa' ? '#e8f5e9' : paymentMethod === 'bank' ? '#e3f0ff' : '#ffebee', color: paymentMethod === 'cash' ? '#1a7a4a' : paymentMethod === 'jazzcash' ? '#9c27b0' : paymentMethod === 'easypaisa' ? '#4caf50' : paymentMethod === 'bank' ? '#0f4c81' : '#f44336' }}>
                {paymentMethod === 'cash' && '💵 Goes to CEO Cash in Hand'}
                {paymentMethod === 'jazzcash' && '📱 Goes to CEO JazzCash — confirm in reconciliation'}
                {paymentMethod === 'easypaisa' && '💚 EasyPaisa — pending until confirmed'}
                {paymentMethod === 'bank' && '🏦 Bank Transfer — pending until confirmed'}
                {paymentMethod === 'credit' && '📋 Select customer — added to their balance'}
              </p>
            </div>

            {/* Customer */}
            <div style={card}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Customer {paymentMethod === 'credit' ? <span style={{ color: '#f44336' }}>★ Required</span> : <span style={{ color: '#aaa', fontWeight: '400' }}>(Optional)</span>}
              </p>
              {selectedCustomer ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#e3f0ff', borderRadius: '8px', border: '1px solid #c8d8ff' }}>
                  <div>
                    <p style={{ fontWeight: '700', fontSize: '14px', margin: '0 0 2px', color: '#0f4c81' }}>{selectedCustomer.full_name}</p>
                    <p style={{ fontSize: '11px', color: '#555', margin: 0 }}>{selectedCustomer.mobile} · Balance: <strong style={{ color: Number(selectedCustomer.balance) > 0 ? '#f44336' : '#1a7a4a' }}>Rs. {Math.abs(Number(selectedCustomer.balance || 0)).toLocaleString()}</strong></p>
                  {Number(selectedCustomer.our_bottles_placed || 0) > 0 && <p style={{ fontSize: '11px', color: '#e65100', margin: '2px 0 0', fontWeight: '600' }}>🫙 {selectedCustomer.our_bottles_placed} bottles currently with customer</p>}
                  </div>
                  <button onClick={() => { setSelectedCustomer(null); setCustomerSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '18px', marginLeft: '8px' }}>✕</button>
                </div>
              ) : (
                <div>
                  {paymentMethod !== 'credit' && <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Walk-in name (optional)" style={{ ...inp, marginBottom: '6px' }} />}
                  <input value={customerSearch} onChange={e => searchCustomer(e.target.value)} placeholder="Search by name, mobile or ID..." style={inp} />
                  {customerResults.length > 0 && (
                    <div style={{ border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden', marginTop: '4px' }}>
                      {customerResults.map(c => (
                        <div key={c.id} onClick={() => selectCustomer(c)} style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white' }}>
                          <div>
                            <p style={{ fontWeight: '600', fontSize: '13px', margin: '0 0 1px' }}>{c.full_name}</p>
                            <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{c.mobile} · {c.customer_code}</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: '12px', fontWeight: '700', color: Number(c.balance) > 0 ? '#f44336' : '#1a7a4a', margin: '0 0 2px' }}>Rs. {Math.abs(Number(c.balance)).toLocaleString()}</p>
                            <p style={{ fontSize: '10px', color: '#aaa', margin: 0 }}>Rate: Rs.{c.rate_19l} · {c.customer_code}</p>
                            {c.address && <p style={{ fontSize: '10px', color: '#888', margin: '2px 0 0' }}>📍 {c.address}</p>}
                            {Number(c.our_bottles_placed || 0) > 0 && <p style={{ fontSize: '10px', color: '#e65100', margin: '2px 0 0', fontWeight: '600' }}>🫙 {c.our_bottles_placed} bottles</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sale Date */}
            <div style={card}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sale Date</p>
              <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} max={new Date().toISOString().split('T')[0]} style={{ ...inp, fontSize: '14px' }} />
              {saleDate !== new Date().toISOString().split('T')[0] && <p style={{ fontSize: '11px', color: '#e65100', margin: '5px 0 0', fontWeight: '600' }}>⚠️ Back-dated — {new Date(saleDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</p>}
            </div>

            {/* Notes */}
            <div style={card}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notes (optional)</p>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any note..." style={inp} />
            </div>

            {/* Total & Submit */}
            <div style={{ ...card, border: '2px solid #e3f0ff' }}>
              {[
                qty19l > 0 && rate19l && { label: `🍶 19L ×${qty19l} @Rs.${rate19l}`, val: qty19l * rate19l },
                ...bottleProducts.filter(p => (quantities[p.id] || 0) > 0).map(p => ({ label: `${p.name} ×${quantities[p.id]} @Rs.${rates[p.id]}`, val: (quantities[p.id] || 0) * (rates[p.id] || 0) })),
                ...extraProducts.filter(p => (quantities[p.id] || 0) > 0).map(p => ({ label: `${p.name} ×${quantities[p.id]}`, val: (quantities[p.id] || 0) * (rates[p.id] || 0) }))
              ].filter(Boolean).map((row, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#555', marginBottom: '4px' }}>
                  <span>{row.label}</span>
                  <span style={{ fontWeight: '600' }}>Rs. {row.val.toLocaleString()}</span>
                </div>
              ))}
              {taxAmount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#f57f17', marginBottom: '4px', fontWeight: '600' }}>
                  <span>🧾 Sales Tax ({taxRate}%)</span>
                  <span>Rs. {taxAmount.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid #eee', paddingTop: '10px', marginTop: '8px', marginBottom: '12px' }}>
                <span style={{ fontSize: '16px', fontWeight: '700', color: '#333' }}>Total Amount</span>
                <span style={{ fontSize: '30px', fontWeight: '800', color: '#0f4c81', letterSpacing: '-1px' }}>Rs. {total.toLocaleString()}</span>
              </div>
              {paymentMethod === 'cash' && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '12px', color: '#555', display: 'block', marginBottom: '4px', fontWeight: '700' }}>💵 Amount Received (Rs.)</label>
                  <input type="number" value={amountReceived} onChange={e => setAmountReceived(e.target.value)}
                    placeholder={`Default: Rs. ${total.toLocaleString()}`}
                    style={{ width: '100%', padding: '10px', border: '1.5px solid #ddd', borderRadius: '8px', fontSize: '16px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }} />
                  {selectedCustomer && customerOutstanding > 0 && <p style={{ fontSize: '11px', color: '#e65100', margin: '0 0 5px', fontWeight: '600' }}>📋 Includes outstanding balance: Rs. {customerOutstanding.toLocaleString()} · Total due: Rs. {totalDue.toLocaleString()}</p>}
                  {selectedCustomer && customerAdvance > 0 && amountReceived === '' && (
                    <div style={{ background: '#e8f5e9', padding: '8px 10px', borderRadius: '6px', marginBottom: '6px' }}>
                      <p style={{ fontSize: '11px', color: '#1a7a4a', margin: '0 0 2px', fontWeight: '700' }}>✅ Customer has Rs. {customerAdvance.toLocaleString()} advance</p>
                      <p style={{ fontSize: '11px', color: '#1a7a4a', margin: 0 }}>{advanceAfterSale >= 0 ? `Sale will be adjusted — Rs. ${advanceAfterSale.toLocaleString()} advance remaining` : `Advance covers Rs. ${customerAdvance.toLocaleString()} — Rs. ${Math.abs(advanceAfterSale).toLocaleString()} still due`}</p>
                    </div>
                  )}
                  {amountReceived !== '' && change > 0 && <p style={{ fontSize: '12px', color: '#1a7a4a', margin: '5px 0 0', fontWeight: '600', background: '#e8f5e9', padding: '6px 10px', borderRadius: '6px' }}>✅ Change: Rs. {change.toLocaleString()} → goes to customer advance</p>}
                  {amountReceived !== '' && change < 0 && <p style={{ fontSize: '12px', color: '#f44336', margin: '5px 0 0', fontWeight: '600', background: '#ffebee', padding: '6px 10px', borderRadius: '6px' }}>⚠️ Short: Rs. {Math.abs(change).toLocaleString()} → goes to outstanding balance</p>}
                  {amountReceived !== '' && change === 0 && <p style={{ fontSize: '12px', color: '#0f4c81', margin: '5px 0 0', fontWeight: '600', background: '#e3f0ff', padding: '6px 10px', borderRadius: '6px' }}>✅ Full payment — account cleared</p>}
                </div>
              )}
              {paymentMethod === 'credit' && selectedCustomer && <p style={{ fontSize: '12px', color: '#f44336', background: '#ffebee', padding: '7px 10px', borderRadius: '6px', marginBottom: '10px', fontWeight: '600' }}>📋 Rs. {total.toLocaleString()} will be added to {selectedCustomer.full_name}'s balance</p>}
              <button onClick={postSale} disabled={saving}
                style={{ width: '100%', padding: '14px', background: getSaleBg(), color: 'white', border: 'none', borderRadius: '10px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '15px', fontWeight: '700', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                {saving ? '⏳ Saving...' : isAdvanceAdjustment
                  ? `✓ Adjust from Advance — Rs. ${total.toLocaleString()}${advanceAfterSale >= 0 ? ` | Remaining Advance: Rs. ${advanceAfterSale.toLocaleString()}` : ` | Outstanding: Rs. ${Math.abs(advanceAfterSale).toLocaleString()}`}`
                  : `✓ ${getSaleLabel()} — Rs. ${(paymentMethod === 'cash' && amountReceived !== '' ? Number(amountReceived) : total).toLocaleString()}`}
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN — Other Products */}
          <div>
            {/* 19L Bottle —  */}
            <div style={{ ...card, border: '2px solid #c8d8ff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div>
                  <p style={{ fontSize: '15px', fontWeight: '700', color: '#0f4c81', margin: '0 0 1px' }}>🍶 19 Litre Bottle</p>
                  <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>Main product · select quantity and rate</p>
                </div>
                <SmallNumBtn val={qty19l} onDec={() => setQty19l(Math.max(0, qty19l - 1))} onInc={() => setQty19l(qty19l + 1)} />
              </div>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>Rate per bottle (Rs.)</p>
              {/* Rates in 2 rows of 4 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px', marginBottom: '8px' }}>
                {RATES_19L.map(r => (
                  <button key={r} onClick={() => setRate19l(r)}
                    style={{ padding: '7px 4px', border: '2px solid', borderColor: rate19l === r ? '#0f4c81' : '#eee', borderRadius: '7px', cursor: 'pointer', background: rate19l === r ? '#0f4c81' : '#f8f9fa', color: rate19l === r ? 'white' : '#333', fontWeight: '700', fontSize: '12px', textAlign: 'center' }}>
                    Rs.{r}
                  </button>
                ))}
              </div>
              <input type="number" value={rate19l || ''} onChange={e => setRate19l(e.target.value === '' ? null : Number(e.target.value))} placeholder="Or type custom rate..."
                style={{ ...inp, fontSize: '14px', fontWeight: '700', textAlign: 'center', borderColor: rate19l ? '#0f4c81' : '#ddd' }} />
              {rate19l && qty19l > 0 && <p style={{ fontSize: '13px', color: '#0f4c81', fontWeight: '700', margin: '6px 0 0', textAlign: 'center', background: '#e3f0ff', padding: '6px', borderRadius: '7px' }}>{qty19l} × Rs.{rate19l} = <strong>Rs. {(qty19l * rate19l).toLocaleString()}</strong></p>}
            </div>

            {/* Empty Bottles Returned */}
            <div style={{ ...card, border: '1px solid #fff3e0', padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '11px', fontWeight: '700', color: '#e65100', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>🫙 Empty Bottles Returned</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button onClick={() => setBottlesReturned(Math.max(0, bottlesReturned - 1))}
                    style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid #ddd', background: '#f5f5f5', fontSize: '16px', cursor: 'pointer' }}>−</button>
                  <span style={{ fontSize: '22px', fontWeight: '700', minWidth: '32px', textAlign: 'center', color: bottlesReturned > 0 ? '#e65100' : '#ccc' }}>{bottlesReturned}</span>
                  <button onClick={() => setBottlesReturned(bottlesReturned + 1)}
                    style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid #e65100', background: '#e65100', color: 'white', fontSize: '16px', cursor: 'pointer' }}>+</button>
                </div>
              </div>
              {bottlesReturned > 0 && selectedCustomer && (
                <p style={{ fontSize: '11px', color: '#e65100', margin: '6px 0 0', fontWeight: '600' }}>
                  🫙 {bottlesReturned} empty bottle{bottlesReturned > 1 ? 's' : ''} returned by {selectedCustomer.full_name}
                </p>
              )}
            </div>

            {bottleProducts.map(p => (
              <div key={p.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: '600', color: '#333', margin: '0 0 2px' }}>
                      {p.bottle_type === 'half_litre' ? '💧' : '🧴'} {p.name}
                      <span style={{ fontSize: '11px', color: '#aaa', fontWeight: '400', marginLeft: '6px' }}>optional</span>
                    </p>
                    <p style={{ fontSize: '10px', color: '#888', margin: 0 }}>Stock: {p.current_stock} pcs</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {(quantities[p.id] || 0) > 0 && (
                      <input type="number" value={rates[p.id] || ''} onChange={e => setRates(r => ({ ...r, [p.id]: Number(e.target.value) || 0 }))}
                        placeholder="Rate"
                        style={{ width: '70px', padding: '6px 8px', border: '1.5px solid #ddd', borderRadius: '6px', fontSize: '13px', fontWeight: '700', outline: 'none', textAlign: 'center', color: '#333', background: 'white' }} />
                    )}
                    <SmallNumBtn val={quantities[p.id] || 0} onDec={() => setQuantities(q => ({ ...q, [p.id]: Math.max(0, (q[p.id] || 0) - 1) }))} onInc={() => setQuantities(q => ({ ...q, [p.id]: (q[p.id] || 0) + 1 }))} />
                  </div>
                </div>
                {(quantities[p.id] || 0) > 0 && (rates[p.id] || 0) > 0 && (
                  <p style={{ fontSize: '11px', color: '#0f4c81', fontWeight: '600', margin: '5px 0 0', textAlign: 'right' }}>
                    {quantities[p.id]} × Rs.{rates[p.id]} = Rs. {((quantities[p.id] || 0) * (rates[p.id] || 0)).toLocaleString()}
                  </p>
                )}
              </div>
            ))}

            {extraProducts.length > 0 && (
              <div style={card}>
                <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Other Products</p>
                {extraProducts.map((p, i) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < extraProducts.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 1px', color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                      <p style={{ fontSize: '10px', color: '#aaa', margin: 0 }}>
                        Stock: {p.current_stock} · Rs.{p.sale_price}
                        {p.product_type === 'finished_good' && <span style={{ color: '#1a7a4a', marginLeft: '4px' }}>· Cost: Rs.{Number(p.average_cost || 0).toFixed(2)}</span>}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: '8px' }}>
                      {(quantities[p.id] || 0) > 0 && (
                        <input type="number" value={rates[p.id] || ''} onChange={e => setRates(r => ({ ...r, [p.id]: Number(e.target.value) || 0 }))}
                          placeholder="Rate"
                          style={{ width: '60px', padding: '5px 6px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', fontWeight: '700', outline: 'none', textAlign: 'center', color: '#333', background: 'white' }} />
                      )}
                      <button onClick={() => setQuantities(q => ({ ...q, [p.id]: Math.max(0, (q[p.id] || 0) - 1) }))} style={{ width: '26px', height: '26px', borderRadius: '50%', border: '1px solid #ddd', background: '#f5f5f5', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>−</button>
                      <span style={{ fontSize: '14px', fontWeight: '700', minWidth: '20px', textAlign: 'center', color: (quantities[p.id] || 0) > 0 ? '#0f4c81' : '#ccc' }}>{quantities[p.id] || 0}</span>
                      <button onClick={() => setQuantities(q => ({ ...q, [p.id]: (q[p.id] || 0) + 1 }))} style={{ width: '26px', height: '26px', borderRadius: '50%', border: '1px solid #0f4c81', background: '#0f4c81', color: 'white', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {mode === 'return' && (
        <div>
          <div style={{ background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
            <p style={{ fontSize: '13px', color: '#e65100', fontWeight: '700', margin: '0 0 4px' }}>🫙 Bottle Return</p>
            <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>Only customers with bottles placed will appear in search. Journal entry posts automatically.</p>
          </div>

          <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '8px', textTransform: 'uppercase' }}>Select Customer *</p>
            {returnCustomer ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#fff3e0', borderRadius: '8px', border: '1px solid #ffcc80' }}>
                <div>
                  <p style={{ fontWeight: '700', fontSize: '14px', margin: '0 0 2px', color: '#e65100' }}>{returnCustomer.full_name}</p>
                  <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>{returnCustomer.mobile} · {returnCustomer.customer_code}</p>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81', margin: '4px 0 0' }}>🫙 {returnCustomer.our_bottles_placed} bottle{Number(returnCustomer.our_bottles_placed) > 1 ? 's' : ''} currently with customer</p>
                </div>
                <button onClick={() => { setReturnCustomer(null); setReturnSearch(''); setReturnQty(0) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '20px' }}>✕</button>
              </div>
            ) : (
              <div>
                <input value={returnSearch} onChange={e => searchReturnCustomer(e.target.value)} placeholder="Search customer with bottles..." style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e0e0e0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                {returnSearchResults.length > 0 && (
                  <div style={{ border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden', marginTop: '4px' }}>
                    {returnSearchResults.map(c => (
                      <div key={c.id} onClick={() => { setReturnCustomer(c); setReturnSearchResults([]); setReturnSearch(''); setReturnQty(Number(c.our_bottles_placed || 0)) }}
                        style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white' }}>
                        <div>
                          <p style={{ fontWeight: '600', fontSize: '13px', margin: '0 0 1px' }}>{c.full_name}</p>
                          <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>{c.mobile} · {c.customer_code}</p>
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: '700', color: '#e65100', background: '#fff3e0', padding: '3px 10px', borderRadius: '20px' }}>🫙 {c.our_bottles_placed}</span>
                      </div>
                    ))}
                  </div>
                )}
                {returnSearch.length >= 2 && returnSearchResults.length === 0 && (
                  <p style={{ fontSize: '12px', color: '#888', margin: '8px 0 0', textAlign: 'center' }}>No customers with bottles found</p>
                )}
              </div>
            )}
          </div>

          {returnCustomer && (
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 1px 6px rgba(0,0,0,0.07)' }}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: '#999', marginBottom: '8px', textTransform: 'uppercase' }}>Bottles to Return</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', padding: '16px 0' }}>
                <button onClick={() => setReturnQty(Math.max(0, returnQty - 1))}
                  style={{ width: '44px', height: '44px', borderRadius: '50%', border: '1.5px solid #ddd', background: '#f5f5f5', fontSize: '20px', cursor: 'pointer', fontWeight: '700' }}>−</button>
                <span style={{ fontSize: '40px', fontWeight: '800', color: returnQty > 0 ? '#e65100' : '#ccc', minWidth: '60px', textAlign: 'center' }}>{returnQty}</span>
                <button onClick={() => setReturnQty(Math.min(Number(returnCustomer.our_bottles_placed || 0), returnQty + 1))}
                  style={{ width: '44px', height: '44px', borderRadius: '50%', border: '1.5px solid #e65100', background: '#e65100', color: 'white', fontSize: '20px', cursor: 'pointer', fontWeight: '700' }}>+</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                <div style={{ textAlign: 'center', padding: '10px', background: '#fff3e0', borderRadius: '8px' }}>
                  <p style={{ fontSize: '10px', color: '#888', margin: '0 0 4px', textTransform: 'uppercase' }}>Currently With Customer</p>
                  <p style={{ fontSize: '18px', fontWeight: '800', color: '#e65100', margin: 0 }}>{returnCustomer.our_bottles_placed}</p>
                </div>
                <div style={{ textAlign: 'center', padding: '10px', background: returnQty > 0 ? '#e8f5e9' : '#f5f5f5', borderRadius: '8px' }}>
                  <p style={{ fontSize: '10px', color: '#888', margin: '0 0 4px', textTransform: 'uppercase' }}>After Return</p>
                  <p style={{ fontSize: '18px', fontWeight: '800', color: returnQty > 0 ? '#1a7a4a' : '#ccc', margin: 0 }}>{Math.max(0, Number(returnCustomer.our_bottles_placed || 0) - returnQty)}</p>
                </div>
              </div>
              <button onClick={() => setReturnQty(Number(returnCustomer.our_bottles_placed || 0))}
                style={{ width: '100%', padding: '8px', background: '#f0f4ff', border: '1px solid #c8d8ff', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', color: '#0f4c81', fontWeight: '600', marginBottom: '12px' }}>
                Return All {returnCustomer.our_bottles_placed} Bottles
              </button>
              <button onClick={processBottleReturn} disabled={returnSaving || returnQty <= 0}
                style={{ width: '100%', padding: '14px', background: returnQty <= 0 || returnSaving ? '#e0e0e0' : '#e65100', color: returnQty <= 0 || returnSaving ? '#aaa' : 'white', border: 'none', borderRadius: '10px', cursor: returnQty <= 0 || returnSaving ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '700' }}>
                {returnSaving ? '⏳ Processing...' : `✓ Confirm Return — ${returnQty} Bottle${returnQty > 1 ? 's' : ''}`}
              </button>
            </div>
          )}
        </div>
      )}

      {showInvoice && lastDelivery && (
        <InvoiceModal
          deliveries={[lastDelivery]}
          customer={selectedCustomer || { full_name: customerName || 'Walk-in', mobile: '', customer_code: '', address: '' }}
          settings={settings}
          invoiceNumber={lastDelivery.invoice_number}
          onClose={() => setShowInvoice(false)}
        />
      )}
    </div>
  )
}
