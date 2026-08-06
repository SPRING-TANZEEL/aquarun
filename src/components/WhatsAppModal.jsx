import { buildDeliveryMessage, buildPaymentMessage, openWhatsApp } from '../whatsappHelper'

export default function WhatsAppModal({ type, data, bizName, onClose }) {
  // type: 'delivery' | 'payment'
  // data: { customerName, mobile, items, total, paymentMethod, creditPortion, newBalance, invoiceNumber, amount, method, jazzPending }

  const message = type === 'delivery'
    ? buildDeliveryMessage({ bizName, ...data })
    : buildPaymentMessage({ bizName, ...data })

  const hasMobile = !!(data.mobile || '').replace(/\D/g, '')

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480, padding: '20px 20px 32px', boxShadow: '0 -8px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ width: 36, height: 4, background: '#ddd', borderRadius: 2, margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#333', margin: 0 }}>💬 Send WhatsApp</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>✕</button>
        </div>

        <div style={{ background: '#f0f7ff', borderRadius: 10, padding: '12px 14px', marginBottom: 14, maxHeight: 220, overflowY: 'auto' }}>
          <p style={{ fontSize: 12, color: '#555', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{message}</p>
        </div>

        {!hasMobile && (
          <div style={{ background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
            <p style={{ fontSize: 12, color: '#e65100', margin: 0 }}>⚠️ No mobile number — WhatsApp will open without a contact selected</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1.5px solid #e0e0e0', background: '#fff', color: '#555', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
            ✕ Skip
          </button>
          <button onClick={() => { openWhatsApp(data.mobile, message); onClose() }}
            style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: '#25d366', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
            💬 Send on WhatsApp
          </button>
        </div>
      </div>
    </div>
  )
}