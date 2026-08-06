import { useRef, useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function InvoiceModal({ deliveries, customer, settings, onClose, invoiceNumber, monthlyTotalPaid, monthlyBalanceDue }) {
  const printRef = useRef()
  const thermalRef = useRef()
  const [lineItems, setLineItems] = useState({})
  const [loadingItems, setLoadingItems] = useState(true)

  useEffect(() => { fetchLineItems() }, [])

  async function fetchLineItems() {
    setLoadingItems(true)
    const deliveryIds = deliveries.map(d => d.id).filter(Boolean)
    if (deliveryIds.length === 0) { setLoadingItems(false); return }

    const { data } = await supabase.from('delivery_items')
      .select('*').in('delivery_id', deliveryIds).order('created_at', { ascending: true })

    const map = {}
    deliveryIds.forEach(id => { map[id] = [] })
    data?.forEach(item => { if (map[item.delivery_id]) map[item.delivery_id].push(item) })

    deliveryIds.forEach(id => {
      if (map[id].length === 0) {
        const d = deliveries.find(x => x.id === id)
        if (!d) return
        if (Number(d.qty_19l || 0) > 0) {
          const rate = Number(d.rate_applied || customer?.rate_19l || 0)
          map[id].push({ product_name: '19 Litre Water Bottle', bottle_type: '19l', qty: Number(d.qty_19l), rate, amount: Number(d.qty_19l) * rate })
        }
        if (Number(d.qty_half_litre || 0) > 0) {
          const rate = Number(customer?.rate_half_litre || d.rate_applied || 0)
          map[id].push({ product_name: 'Half Litre Water Bottle', bottle_type: 'half_litre', qty: Number(d.qty_half_litre), rate, amount: Number(d.qty_half_litre) * rate })
        }
        if (Number(d.qty_1_5l || 0) > 0) {
          const rate = Number(customer?.rate_1_5l || d.rate_applied || 0)
          map[id].push({ product_name: '1.5 Litre Water Bottle', bottle_type: '1_5l', qty: Number(d.qty_1_5l), rate, amount: Number(d.qty_1_5l) * rate })
        }
      }
    })

    setLineItems(map)
    setLoadingItems(false)
  }

  const allLines = deliveries.flatMap(d => (lineItems[d.id] || []).map(item => ({ ...item, date: d.delivered_at, payment_method: d.payment_method })))
  const grandSubTotal = allLines.reduce((s, l) => s + Number(l.amount || 0), 0)
  const grandTax = deliveries.reduce((s, d) => {
    const taxRate = Number(d.tax_rate || 0)
    const deliverySubTotal = (lineItems[d.id] || []).reduce((x, l) => x + Number(l.amount || 0), 0)
    return s + Math.round(deliverySubTotal * taxRate / 100 * 100) / 100
  }, 0)
  const grandTotal = grandSubTotal + grandTax
  const isMonthly = deliveries.length > 1
  const invoiceNo = invoiceNumber || 'INV-' + Date.now().toString().slice(-8)
  const today = new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
  const paymentMethod = deliveries[0]?.payment_method
  const payLabel = paymentMethod === 'cash' ? 'Cash' : paymentMethod === 'jazzcash' ? 'JazzCash' : paymentMethod === 'easypaisa' ? 'EasyPaisa' : 'Credit'
  const amountPaid = Number(deliveries[0]?.amount_received || grandTotal)
  const balanceDue = Math.max(0, grandTotal - amountPaid)

  function printA4() {
    const content = printRef.current.innerHTML
    const win = window.open('', '_blank')
    win.document.write(`
      <html><head><title>Invoice ${invoiceNo}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; color: #222; font-size: 13px; }
        @media print { button { display: none !important; } @page { size: A4; margin: 15mm; } }
      </style>
      </head><body>${content}</body></html>
    `)
    win.document.close()
    win.onload = () => { win.focus(); win.print(); win.onafterprint = () => win.close() }
  }

  function printThermal() {
    const content = thermalRef.current.innerHTML
    const win = window.open('', '_blank')
    win.document.write(`
      <html><head><title>Receipt</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { font-family: 'Courier New', monospace; width: 76mm; margin: 0 auto; font-size: 11px; color: #000; padding: 2mm; }
        @media print { button { display: none !important; } @page { size: 80mm auto; margin: 0mm 2mm; } body { width: 76mm; } }
      </style>
      </head><body>${content}</body></html>
    `)
    win.document.close()
    win.onload = () => { win.focus(); win.print(); win.onafterprint = () => win.close() }
  }

  if (loadingItems) return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center' }}>
        <p style={{ fontSize: '16px', color: '#0f4c81', fontWeight: '600' }}>Loading invoice...</p>
      </div>
    </div>
  )

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: '#f5f6fa', borderRadius: '16px', padding: '20px', maxWidth: '860px', width: '100%', maxHeight: '95vh', overflow: 'auto' }}>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#333' }}>🧾 Invoice — {invoiceNo}</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={printA4} style={{ padding: '8px 18px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>🖨️ Print A4</button>
            <button onClick={printThermal} style={{ padding: '8px 18px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>🧾 Receipt</button>
            <button onClick={onClose} style={{ padding: '8px 16px', background: '#eee', color: '#555', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>✕ Close</button>
          </div>
        </div>

        {/* ── A4 PREVIEW ── */}
        <div ref={printRef} style={{ background: 'white', borderRadius: '12px', padding: '32px', marginBottom: '20px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '16px', borderBottom: '3px solid #0f4c81', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              {settings.business_logo && (
                <img src={settings.business_logo} alt="logo" style={{ width: '64px', height: '64px', objectFit: 'contain', borderRadius: '8px' }} />
              )}
              <div>
                <p style={{ fontSize: '20px', fontWeight: '800', color: '#0f4c81', margin: '0 0 3px' }}>{settings.business_name || 'Business Name'}</p>
                {settings.business_tagline && <p style={{ fontSize: '11px', color: '#888', margin: '0 0 2px', fontStyle: 'italic' }}>{settings.business_tagline}</p>}
                {settings.business_address && <p style={{ fontSize: '11px', color: '#666', margin: '0 0 2px' }}>📍 {settings.business_address}</p>}
                {settings.complaint_number && <p style={{ fontSize: '11px', color: '#666', margin: '0 0 2px' }}>📞 {settings.complaint_number}</p>}
                {settings.ntn_number && <p style={{ fontSize: '11px', color: '#666', margin: '0 0 2px' }}>NTN: {settings.ntn_number}</p>}
                {settings.strn_number && <p style={{ fontSize: '11px', color: '#666', margin: 0 }}>STRN: {settings.strn_number}</p>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '28px', fontWeight: '800', color: '#0f4c81', letterSpacing: '3px', margin: '0 0 8px' }}>INVOICE</p>
              <div style={{ background: '#f0f4ff', borderRadius: '8px', padding: '10px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', fontSize: '12px', marginBottom: '5px' }}>
                  <span style={{ color: '#888' }}>Invoice No</span>
                  <span style={{ fontWeight: '700', color: '#0f4c81' }}>{invoiceNo}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', fontSize: '12px' }}>
                  <span style={{ color: '#888' }}>Date</span>
                  <span style={{ fontWeight: '600', color: '#333' }}>{today}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bill To — compact single line */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '18px', gap: '16px' }}>
            <div style={{ background: '#f0f4ff', borderLeft: '4px solid #0f4c81', padding: '10px 16px', borderRadius: '6px', flex: 1 }}>
              <p style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 5px' }}>Bill To</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <p style={{ fontSize: '16px', fontWeight: '700', color: '#0f4c81', margin: 0 }}>{customer?.full_name || 'Walk-in Customer'}</p>
                {customer?.customer_code && <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>ID: {customer.customer_code}</p>}
                {customer?.mobile && <p style={{ fontSize: '11px', color: '#555', margin: 0 }}>📞 {customer.mobile}</p>}
                {customer?.address && <p style={{ fontSize: '11px', color: '#666', margin: 0 }}>📍 {customer.address}</p>}
              </div>
            </div>
            {isMonthly && (
              <div style={{ background: '#f0fff4', borderLeft: '4px solid #1a7a4a', padding: '10px 16px', borderRadius: '6px', minWidth: '160px' }}>
                <p style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Period</p>
                <p style={{ fontSize: '14px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 2px' }}>{deliveries.length} Deliveries</p>
                <p style={{ fontSize: '11px', color: '#555', margin: 0 }}>Monthly Statement</p>
              </div>
            )}
          </div>

          {/* Items Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
            <thead>
              <tr style={{ background: '#0f4c81' }}>
                {isMonthly && <th style={{ padding: '10px 12px', color: 'white', fontSize: '11px', fontWeight: '700', textAlign: 'left', textTransform: 'uppercase' }}>Date</th>}
                <th style={{ padding: '10px 12px', color: 'white', fontSize: '11px', fontWeight: '700', textAlign: 'left', textTransform: 'uppercase' }}>Description</th>
                <th style={{ padding: '10px 12px', color: 'white', fontSize: '11px', fontWeight: '700', textAlign: 'center', textTransform: 'uppercase' }}>Qty</th>
                <th style={{ padding: '10px 12px', color: 'white', fontSize: '11px', fontWeight: '700', textAlign: 'right', textTransform: 'uppercase' }}>Unit Rate</th>
                <th style={{ padding: '10px 12px', color: 'white', fontSize: '11px', fontWeight: '700', textAlign: 'right', textTransform: 'uppercase' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {isMonthly ? (
                deliveries.map((d, di) =>
                  (lineItems[d.id] || []).map((item, li) => (
                    <tr key={`${di}-${li}`} style={{ background: (di + li) % 2 === 0 ? 'white' : '#f8f9ff', borderBottom: '1px solid #eef0f5' }}>
                      {li === 0 && (
                        <td rowSpan={(lineItems[d.id] || []).length} style={{ padding: '10px 12px', fontSize: '11px', color: '#666', verticalAlign: 'middle', borderBottom: '1px solid #eef0f5', whiteSpace: 'nowrap' }}>
                          {d.delivered_at ? new Date(d.delivered_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' }) : today}
                        </td>
                      )}
                      <td style={{ padding: '10px 12px', fontSize: '12px', color: '#333', borderBottom: '1px solid #eef0f5' }}>{item.product_name}</td>
                      <td style={{ padding: '10px 12px', fontSize: '12px', textAlign: 'center', borderBottom: '1px solid #eef0f5' }}>{item.qty}</td>
                      <td style={{ padding: '10px 12px', fontSize: '12px', textAlign: 'right', borderBottom: '1px solid #eef0f5', color: '#555' }}>Rs. {Number(item.rate).toLocaleString()}</td>
                      <td style={{ padding: '10px 12px', fontSize: '12px', fontWeight: '700', color: '#0f4c81', textAlign: 'right', borderBottom: '1px solid #eef0f5' }}>Rs. {Number(item.amount).toLocaleString()}</td>
                    </tr>
                  ))
                )
              ) : (
                allLines.map((item, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f8f9ff', borderBottom: '1px solid #eef0f5' }}>
                    <td style={{ padding: '10px 12px', fontSize: '13px', color: '#333', borderBottom: '1px solid #eef0f5', fontWeight: '500' }}>{item.product_name}</td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'center', borderBottom: '1px solid #eef0f5' }}>{item.qty}</td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', textAlign: 'right', borderBottom: '1px solid #eef0f5', color: '#555' }}>Rs. {Number(item.rate).toLocaleString()}</td>
                    <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: '700', color: '#0f4c81', textAlign: 'right', borderBottom: '1px solid #eef0f5' }}>Rs. {Number(item.amount).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Totals + QR Codes */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', gap: '16px' }}>

            {/* QR Codes — left */}
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {settings.jazzcash_number && (
                <div style={{ textAlign: 'center' }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent('JazzCash: ' + settings.jazzcash_number)}`}
                    alt="JazzCash QR"
                    style={{ width: '90px', height: '90px', border: '2px solid #e65100', borderRadius: '6px', display: 'block', marginBottom: '4px' }}
                  />
                  <p style={{ fontSize: '9px', fontWeight: '700', color: '#e65100', margin: '0 0 1px' }}>JazzCash</p>
                  <p style={{ fontSize: '9px', color: '#555', margin: 0 }}>{settings.jazzcash_number}</p>
                </div>
              )}
              {settings.easypaisa_number && (
                <div style={{ textAlign: 'center' }}>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent('EasyPaisa: ' + settings.easypaisa_number)}`}
                    alt="EasyPaisa QR"
                    style={{ width: '90px', height: '90px', border: '2px solid #1a7a4a', borderRadius: '6px', display: 'block', marginBottom: '4px' }}
                  />
                  <p style={{ fontSize: '9px', fontWeight: '700', color: '#1a7a4a', margin: '0 0 1px' }}>EasyPaisa</p>
                  <p style={{ fontSize: '9px', color: '#555', margin: 0 }}>{settings.easypaisa_number}</p>
                </div>
              )}
              {(settings.jazzcash_number || settings.easypaisa_number) && (
                <p style={{ fontSize: '10px', color: '#888', margin: 0, fontStyle: 'italic', alignSelf: 'center' }}>📱 Scan to Pay</p>
              )}
            </div>

            {/* Totals — right */}
            <div style={{ width: '300px', border: '1px solid #e0e8ff', borderRadius: '10px', overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #eee', fontSize: '13px' }}>
                <span style={{ color: '#555' }}>Subtotal</span>
                <span style={{ fontWeight: '600' }}>Rs. {grandSubTotal.toLocaleString()}</span>
              </div>
              {grandTax > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #eee', fontSize: '13px', background: '#fff8f0' }}>
                  <span style={{ color: '#e65100' }}>Sales Tax ({settings.sales_tax_rate || 0}%)</span>
                  <span style={{ fontWeight: '600', color: '#e65100' }}>Rs. {grandTax.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 16px', background: '#0f4c81', color: 'white' }}>
                <span style={{ fontSize: '15px', fontWeight: '700' }}>Total</span>
                <span style={{ fontSize: '18px', fontWeight: '800' }}>Rs. {grandTotal.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', background: '#f8f9fa', fontSize: '12px', color: '#666' }}>
                <span>Payment Method</span>
                <span style={{ fontWeight: '600' }}>{payLabel}</span>
              </div>
              {paymentMethod === 'jazzcash' && settings.jazzcash_number && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 16px', background: '#fff8f0', fontSize: '11px', color: '#e65100' }}>
                  <span>JazzCash Account</span>
                  <span style={{ fontWeight: '600' }}>{settings.jazzcash_number}</span>
                </div>
              )}
              {paymentMethod === 'easypaisa' && settings.easypaisa_number && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 16px', background: '#f0fff4', fontSize: '11px', color: '#1a7a4a' }}>
                  <span>EasyPaisa Account</span>
                  <span style={{ fontWeight: '600' }}>{settings.easypaisa_number}</span>
                </div>
              )}
              {paymentMethod === 'bank' && settings.bank_account_number && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 16px', background: '#f0f4ff', fontSize: '11px', color: '#0f4c81' }}>
                  <span>{settings.bank_name || 'Bank'} — {settings.bank_account_title || ''}</span>
                  <span style={{ fontWeight: '600' }}>{settings.bank_account_number}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 16px', borderTop: '1px solid #eee', fontSize: '12px', color: '#555' }}>
                <span>Amount Paid</span>
                <span style={{ fontWeight: '600' }}>Rs. {amountPaid.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', background: balanceDue > 0 ? '#fff5f5' : '#f0fff4', fontSize: '13px', fontWeight: '700', color: balanceDue > 0 ? '#f44336' : '#1a7a4a' }}>
                <span>Balance Due</span>
                <span>Rs. {balanceDue.toLocaleString()}</span>
              </div>
              {isMonthly && monthlyTotalPaid > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', borderTop: '1px solid #eee', fontSize: '12px', color: '#1a7a4a' }}>
                    <span>Already Paid</span>
                    <span style={{ fontWeight: '600' }}>Rs. {monthlyTotalPaid.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', background: monthlyBalanceDue > 0 ? '#fff5f5' : '#f0fff4', fontSize: '13px', fontWeight: '700', color: monthlyBalanceDue > 0 ? '#f44336' : '#1a7a4a' }}>
                    <span>Monthly Balance Due</span>
                    <span>Rs. {(monthlyBalanceDue || 0).toLocaleString()}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ borderTop: '2px solid #e0e8ff', paddingTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <p style={{ fontSize: '11px', color: '#aaa', fontStyle: 'italic', margin: '0 0 2px' }}>This is a system generated invoice.</p>
              {settings.whatsapp_number && <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>WhatsApp: {settings.whatsapp_number}</p>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '12px', fontWeight: '700', color: '#0f4c81', margin: '0 0 2px' }}>Thank you for your business!</p>
              <p style={{ fontSize: '10px', color: '#bbb', margin: 0 }}>Powered by <strong>AquaRun</strong> — Water Delivery Management System</p>
            </div>
          </div>
        </div>

        {/* ── THERMAL RECEIPT ── */}
        <div style={{ borderTop: '2px dashed #ddd', paddingTop: '16px' }}>
          <p style={{ fontSize: '12px', color: '#888', marginBottom: '10px', fontWeight: '600' }}>🧾 Thermal Receipt Preview (80mm)</p>
          <div ref={thermalRef} style={{ fontFamily: 'monospace', fontSize: '11px', width: '300px', border: '1px dashed #bbb', padding: '14px', background: 'white', lineHeight: 1.6 }}>
            <div style={{ textAlign: 'center', marginBottom: '8px' }}>
              <p style={{ fontWeight: '700', fontSize: '14px', margin: '0 0 2px' }}>{settings.business_name || 'Business'}</p>
              {settings.business_tagline && <p style={{ fontSize: '9px', margin: '0 0 2px', fontStyle: 'italic' }}>{settings.business_tagline}</p>}
              {settings.business_address && <p style={{ fontSize: '9px', margin: '0 0 2px' }}>{settings.business_address}</p>}
              {settings.ntn_number && <p style={{ fontSize: '9px', margin: '0 0 2px' }}>NTN: {settings.ntn_number}</p>}
              {settings.complaint_number && <p style={{ fontSize: '9px', margin: 0 }}>Tel: {settings.complaint_number}</p>}
            </div>
            <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '5px 0', margin: '6px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span>Invoice:</span><span style={{ fontWeight: '700' }}>{invoiceNo}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span>Date:</span><span>{today}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span>Customer:</span><span style={{ fontWeight: '600' }}>{customer?.full_name || 'Walk-in'}</span></div>
              {customer?.mobile && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}><span>Mobile:</span><span>{customer.mobile}</span></div>}
            </div>
            <div style={{ margin: '6px 0' }}>
              {allLines.map((item, i) => (
                <div key={i} style={{ marginBottom: '4px' }}>
                  <div style={{ fontSize: '10px', fontWeight: '600' }}>{item.product_name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', paddingLeft: '4px' }}>
                    <span>{item.qty} x Rs.{Number(item.rate).toLocaleString()}</span>
                    <span style={{ fontWeight: '600' }}>Rs. {Number(item.amount).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px dashed #000', paddingTop: '5px', marginTop: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
                <span>Subtotal</span><span>Rs. {grandSubTotal.toLocaleString()}</span>
              </div>
              {grandTax > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
                  <span>Tax ({settings.sales_tax_rate || 0}%)</span><span>Rs. {grandTax.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '700', borderTop: '1px dashed #000', marginTop: '4px', paddingTop: '4px' }}>
                <span>TOTAL</span><span>Rs. {grandTotal.toLocaleString()}</span>
              </div>
              {isMonthly && monthlyTotalPaid > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginTop: '3px' }}>
                    <span>Paid</span><span>Rs. {monthlyTotalPaid.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '700', marginTop: '2px' }}>
                    <span>Balance Due</span><span>Rs. {(monthlyBalanceDue || 0).toLocaleString()}</span>
                  </div>
                </>
              )}
              <div style={{ fontSize: '10px', marginTop: '4px', color: '#555' }}>Payment: {payLabel}</div>
              {deliveries[0]?.payment_method === 'cash' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginTop: '4px' }}>
                    <span>Amount Paid</span><span>Rs. {amountPaid.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '700', marginTop: '2px', borderTop: '1px dashed #000', paddingTop: '3px' }}>
                    <span>Balance Due</span><span>Rs. {balanceDue.toLocaleString()}</span>
                  </div>
                </>
              )}
            </div>
            <div style={{ textAlign: 'center', marginTop: '10px', borderTop: '1px dashed #000', paddingTop: '7px' }}>
              <p style={{ fontSize: '10px', margin: '0 0 2px', fontWeight: '600' }}>Thank you for your business!</p>
              {settings.whatsapp_number && <p style={{ fontSize: '9px', margin: '0 0 3px' }}>WhatsApp: {settings.whatsapp_number}</p>}
              <p style={{ fontSize: '8px', margin: 0, color: '#999' }}>Powered by AquaRun</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
