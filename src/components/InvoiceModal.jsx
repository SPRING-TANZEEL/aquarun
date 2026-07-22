import { useRef } from 'react'

export default function InvoiceModal({ deliveries, customer, settings, onClose, invoiceNumber }) {
  const printRef = useRef()
  const thermalRef = useRef()

  const grandSubTotal = deliveries.reduce((s, d) => s + Number(d.total_amount || 0), 0)
  const grandTax = deliveries.reduce((s, d) => s + Number(d.tax_amount || 0), 0)
  const grandTotal = deliveries.reduce((s, d) => s + Number(d.total_with_tax || d.total_amount || 0), 0)
  const invoiceNo = invoiceNumber || 'INV-' + Date.now().toString().slice(-8)
  const today = new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })

  function printA4() {
    const content = printRef.current.innerHTML
    const win = window.open('', '_blank')
    win.document.write(`
      <html><head><title>Invoice</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
        .header { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid #0f4c81; padding-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th { background: #0f4c81; color: white; padding: 10px; text-align: left; font-size: 13px; }
        td { padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 13px; }
        .totals { display: flex; justify-content: flex-end; }
        .totals-box { width: 260px; }
        .total-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee; font-size: 13px; }
        .grand-total { display: flex; justify-content: space-between; padding: 10px 0; border-top: 2px solid #0f4c81; font-size: 16px; font-weight: 700; color: #0f4c81; }
        .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eee; padding-top: 12px; }
        @media print { button { display: none !important; } }
      </style>
      </head><body>${content}</body></html>
    `)
    win.document.close()
    setTimeout(() => win.print(), 500)
  }

  function printThermal() {
    const content = thermalRef.current.innerHTML
    const win = window.open('', '_blank')
    win.document.write(`
      <html><head><title>Receipt</title>
      <style>
        body { font-family: monospace; width: 80mm; margin: 0 auto; font-size: 11px; color: #000; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .dashed { border-top: 1px dashed #000; margin: 4px 0; }
        .row { display: flex; justify-content: space-between; margin: 2px 0; }
        @media print { button { display: none !important; } }
      </style>
      </head><body>${content}</body></html>
    `)
    win.document.close()
    setTimeout(() => win.print(), 500)
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', maxWidth: '800px', width: '100%', maxHeight: '90vh', overflow: 'auto' }}>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>🧾 Invoice Preview</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={printA4}
              style={{ padding: '8px 16px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
              🖨️ Print A4
            </button>
            <button onClick={printThermal}
              style={{ padding: '8px 16px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
              🧾 Print Receipt
            </button>
            <button onClick={onClose}
              style={{ padding: '8px 16px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
              ✕ Close
            </button>
          </div>
        </div>

        {/* A4 Preview */}
        <div ref={printRef} style={{ border: '1px solid #eee', borderRadius: '8px', padding: '24px', marginBottom: '20px' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', paddingBottom: '16px', borderBottom: '2px solid #0f4c81' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              {settings.business_logo && (
                <img src={settings.business_logo} alt="logo" style={{ width: '70px', height: '70px', objectFit: 'contain' }} />
              )}
              <div>
                <p style={{ fontSize: '20px', fontWeight: '700', color: '#0f4c81', margin: '0 0 4px' }}>{settings.business_name || 'Business Name'}</p>
                {settings.business_tagline && <p style={{ fontSize: '12px', color: '#888', margin: '0 0 4px' }}>{settings.business_tagline}</p>}
                {settings.business_address && <p style={{ fontSize: '12px', color: '#555', margin: '0 0 2px' }}>📍 {settings.business_address}</p>}
                {settings.complaint_number && <p style={{ fontSize: '12px', color: '#555', margin: '0 0 2px' }}>📞 {settings.complaint_number}</p>}
                {settings.ntn_number && <p style={{ fontSize: '12px', color: '#555', margin: '0 0 2px' }}>NTN: {settings.ntn_number}</p>}
                {settings.strn_number && <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>STRN: {settings.strn_number}</p>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '22px', fontWeight: '700', color: '#0f4c81', margin: '0 0 4px' }}>INVOICE</p>
              <p style={{ fontSize: '12px', color: '#555', margin: '0 0 2px' }}>No: {invoiceNo}</p>
              <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>Date: {today}</p>
            </div>
          </div>

          {/* Customer */}
          <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
            <p style={{ fontSize: '11px', color: '#888', margin: '0 0 4px', textTransform: 'uppercase' }}>Bill To</p>
            <p style={{ fontSize: '15px', fontWeight: '700', color: '#333', margin: '0 0 2px' }}>{customer?.full_name}</p>
            <p style={{ fontSize: '12px', color: '#555', margin: '0 0 2px' }}>{customer?.mobile} · ID: {customer?.customer_code}</p>
            {customer?.address && <p style={{ fontSize: '12px', color: '#555', margin: 0 }}>📍 {customer.address}</p>}
          </div>

          {/* Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
            <thead>
              <tr style={{ background: '#0f4c81' }}>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', color: 'white' }}>Date</th>
                <th style={{ padding: '10px', textAlign: 'left', fontSize: '12px', color: 'white' }}>Description</th>
                <th style={{ padding: '10px', textAlign: 'center', fontSize: '12px', color: 'white' }}>Qty</th>
                <th style={{ padding: '10px', textAlign: 'right', fontSize: '12px', color: 'white' }}>Rate</th>
                <th style={{ padding: '10px', textAlign: 'right', fontSize: '12px', color: 'white' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d, i) => (
                <tr key={d.id || i} style={{ background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '8px 10px', fontSize: '12px', color: '#555', borderBottom: '1px solid #eee' }}>
                    {d.delivered_at ? new Date(d.delivered_at).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : today}
                  </td>
                  <td style={{ padding: '8px 10px', fontSize: '12px', color: '#333', borderBottom: '1px solid #eee' }}>
                    {d.qty_19l > 0 ? '19L Water Bottle' : d.qty_half_litre > 0 ? 'Half Litre Bottle' : '1.5L Bottle'}
                  </td>
                  <td style={{ padding: '8px 10px', fontSize: '12px', textAlign: 'center', borderBottom: '1px solid #eee' }}>
                    {Number(d.qty_19l || 0) + Number(d.qty_half_litre || 0) + Number(d.qty_1_5l || 0)}
                  </td>
                  <td style={{ padding: '8px 10px', fontSize: '12px', textAlign: 'right', borderBottom: '1px solid #eee' }}>
                    Rs. {Number(d.rate_applied || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '8px 10px', fontSize: '12px', fontWeight: '600', color: '#0f4c81', textAlign: 'right', borderBottom: '1px solid #eee' }}>
                    Rs. {Number(d.total_amount || 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: '260px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #eee', fontSize: '13px' }}>
                <span style={{ color: '#555' }}>Subtotal</span>
                <span style={{ fontWeight: '600' }}>Rs. {grandSubTotal.toLocaleString()}</span>
              </div>
              {grandTax > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #eee', fontSize: '13px' }}>
                  <span style={{ color: '#f57f17' }}>Sales Tax ({settings.sales_tax_rate}%)</span>
                  <span style={{ fontWeight: '600', color: '#f57f17' }}>Rs. {grandTax.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '2px solid #0f4c81', marginTop: '4px' }}>
                <span style={{ fontSize: '15px', fontWeight: '700', color: '#0f4c81' }}>Total</span>
                <span style={{ fontSize: '18px', fontWeight: '700', color: '#0f4c81' }}>Rs. {grandTotal.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#888' }}>
                <span>Payment</span>
                <span>{deliveries[0]?.payment_method === 'cash' ? '💵 Cash' : deliveries[0]?.payment_method === 'jazzcash' ? '📱 JazzCash' : '📋 Credit'}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: '30px', textAlign: 'center', borderTop: '1px solid #eee', paddingTop: '12px' }}>
            <p style={{ fontSize: '12px', color: '#888', margin: '0 0 4px' }}>Thank you for your business!</p>
            {settings.whatsapp_number && <p style={{ fontSize: '11px', color: '#888', margin: '0 0 8px' }}>WhatsApp: {settings.whatsapp_number}</p>}
            <p style={{ fontSize: '10px', color: '#bbb', margin: 0 }}>Powered by <strong>AquaRun</strong> — Water Delivery Management System</p>
          </div>
        </div>

        {/* Thermal Preview */}
        <div style={{ borderTop: '2px dashed #ddd', paddingTop: '16px' }}>
          <p style={{ fontSize: '12px', color: '#888', marginBottom: '8px', fontWeight: '600' }}>🧾 Thermal Receipt (80mm)</p>
          <div ref={thermalRef} style={{ fontFamily: 'monospace', fontSize: '11px', width: '300px', border: '1px dashed #ddd', padding: '12px', background: 'white' }}>
            <div style={{ textAlign: 'center', marginBottom: '6px' }}>
              <p style={{ fontWeight: '700', fontSize: '13px', margin: '0 0 2px' }}>{settings.business_name}</p>
              {settings.business_address && <p style={{ fontSize: '10px', margin: '0 0 2px' }}>{settings.business_address}</p>}
              {settings.ntn_number && <p style={{ fontSize: '10px', margin: '0 0 2px' }}>NTN: {settings.ntn_number}</p>}
              {settings.strn_number && <p style={{ fontSize: '10px', margin: 0 }}>STRN: {settings.strn_number}</p>}
            </div>
            <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '4px 0', margin: '6px 0' }}>
              <p style={{ margin: '0 0 2px', fontSize: '10px' }}>Invoice: {invoiceNo}</p>
              <p style={{ margin: '0 0 2px', fontSize: '10px' }}>Date: {today}</p>
              <p style={{ margin: 0, fontSize: '10px' }}>Customer: {customer?.full_name}</p>
              {customer?.mobile && <p style={{ margin: 0, fontSize: '10px' }}>Mobile: {customer.mobile}</p>}
            </div>
            {deliveries.map((d, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', margin: '3px 0' }}>
                <span>{d.qty_19l > 0 ? `19L x${d.qty_19l}` : d.qty_half_litre > 0 ? `Half x${d.qty_half_litre}` : `1.5L x${d.qty_1_5l}`} @ Rs.{d.rate_applied}</span>
                <span>Rs. {Number(d.total_amount).toLocaleString()}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px dashed #000', marginTop: '6px', paddingTop: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
                <span>Subtotal</span><span>Rs. {grandSubTotal.toLocaleString()}</span>
              </div>
              {grandTax > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
                  <span>Tax {settings.sales_tax_rate}%</span><span>Rs. {grandTax.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '700', borderTop: '1px dashed #000', marginTop: '4px', paddingTop: '4px' }}>
                <span>TOTAL</span><span>Rs. {grandTotal.toLocaleString()}</span>
              </div>
              <div style={{ fontSize: '10px', marginTop: '4px' }}>
                Payment: {deliveries[0]?.payment_method === 'cash' ? 'Cash' : deliveries[0]?.payment_method === 'jazzcash' ? 'JazzCash' : 'Credit'}
              </div>
            </div>
            <div style={{ textAlign: 'center', marginTop: '8px', borderTop: '1px dashed #000', paddingTop: '6px', fontSize: '10px' }}>
              <p style={{ margin: '0 0 2px' }}>Thank you for your business!</p>
              {settings.whatsapp_number && <p style={{ margin: '0 0 4px' }}>WhatsApp: {settings.whatsapp_number}</p>}
              <p style={{ margin: 0, fontSize: '9px' }}>Powered by AquaRun</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}