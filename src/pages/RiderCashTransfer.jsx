import { useState, useEffect } from 'react'
import { supabase } from '../supabase'

export default function RiderCashTransfer({ rider, tenantId, lang = 'en' }) {
  const [mainRider, setMainRider] = useState(null)
  const [pendingTransfers, setPendingTransfers] = useState([])
  const [todayBalance, setTodayBalance] = useState(0)
  const [totalUncleared, setTotalUncleared] = useState(0)
  const [amount, setAmount] = useState('')
  const [transferTo, setTransferTo] = useState(null)
  const [transferType, setTransferType] = useState('cash')
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(null)
  const [success, setSuccess] = useState(null)
  const [loading, setLoading] = useState(true)

  function t(en, ur) { return lang === 'ur' ? ur : en }

  useEffect(() => { if (tenantId) fetchData() }, [tenantId])

  async function fetchData() {
    setLoading(true)

    const { data: mainRiderData } = await supabase.from('riders').select('*')
      .eq('tenant_id', tenantId).eq('is_main_rider', true).eq('is_active', true).single()
    setMainRider(mainRiderData || null)

    const today = new Date().toISOString().split('T')[0]
    const todayFrom = today + 'T00:00:00'
    const todayTo = today + 'T23:59:59'

    // Today's balance
    const { data: todayDeliveries } = await supabase.from('deliveries').select('amount_received, payment_method')
      .eq('tenant_id', tenantId).eq('rider_id', rider.id).eq('is_voided', false)
      .gte('delivered_at', todayFrom).lte('delivered_at', todayTo)
    const { data: todayPayments } = await supabase.from('payments').select('amount')
      .eq('tenant_id', tenantId).eq('rider_id', rider.id).eq('payment_method', 'cash').eq('is_voided', false)
      .gte('created_at', todayFrom).lte('created_at', todayTo)
    const { data: todayExpenses } = await supabase.from('expenses').select('amount')
      .eq('tenant_id', tenantId).eq('rider_id', rider.id).eq('is_voided', false)
      .gte('created_at', todayFrom).lte('created_at', todayTo)
    const { data: receivedTransfers } = await supabase.from('cash_transfers').select('amount')
      .eq('tenant_id', tenantId).eq('to_rider_id', rider.id).eq('status', 'confirmed')
      .gte('confirmed_at', todayFrom).lte('confirmed_at', todayTo)

    let todayCashSales = 0
    todayDeliveries?.forEach(d => { if (d.payment_method === 'cash') todayCashSales += Number(d.amount_received) })
    const todayCol = todayPayments?.reduce((s, p) => s + Number(p.amount), 0) || 0
    const todayExp = todayExpenses?.reduce((s, e) => s + Number(e.amount), 0) || 0
    const todayRec = receivedTransfers?.reduce((s, t) => s + Number(t.amount), 0) || 0
    const todayBal = todayCashSales + todayCol + todayRec - todayExp
    setTodayBalance(todayBal)

    // Total uncleared (all time)
    const { data: allDeliveries } = await supabase.from('deliveries').select('amount_received, payment_method')
      .eq('rider_id', rider.id).eq('tenant_id', tenantId).eq('is_voided', false)
    const { data: allPayments } = await supabase.from('payments').select('amount')
      .eq('rider_id', rider.id).eq('tenant_id', tenantId).eq('payment_method', 'cash').eq('is_voided', false)
    const { data: allExpenses } = await supabase.from('expenses').select('amount')
      .eq('rider_id', rider.id).eq('tenant_id', tenantId).eq('is_voided', false)
    const { data: allTransfers } = await supabase.from('cash_transfers').select('amount')
      .eq('from_rider_id', rider.id).eq('tenant_id', tenantId).eq('to_office', true).eq('status', 'confirmed')

    let allCashSales = 0
    allDeliveries?.forEach(d => { if (d.payment_method === 'cash') allCashSales += Number(d.amount_received) })
    const allCol = allPayments?.reduce((s, p) => s + Number(p.amount), 0) || 0
    const allExp = allExpenses?.reduce((s, e) => s + Number(e.amount), 0) || 0
    const allTrans = allTransfers?.reduce((s, t) => s + Number(t.amount), 0) || 0
    setTotalUncleared(allCashSales + allCol - allExp - allTrans)

    const { data: pending } = await supabase.from('cash_transfers')
      .select('*, from_rider:from_rider_id(full_name)')
      .eq('tenant_id', tenantId).eq('to_rider_id', rider.id).eq('status', 'pending')
    setPendingTransfers(pending || [])

    setLoading(false)
  }

  async function submitTransfer() {
    if (!transferTo) return alert(t('Please select where to return cash', 'براہ کرم منتخب کریں کہ کیش کہاں واپس کرنی ہے'))
    if (!amount || Number(amount) <= 0) return alert(t('Please enter amount', 'براہ کرم رقم درج کریں'))
    if (transferType === 'cash' && Number(amount) > totalUncleared) return alert(t('Amount cannot be more than total uncleared cash: Rs. ', 'رقم کل غیر منتقل کیش سے زیادہ نہیں ہو سکتی: Rs. ') + totalUncleared.toLocaleString())
    setSaving(true)
    const isOffice = transferTo === 'office'
    const toRiderId = isOffice ? null : mainRider?.id
    const { error } = await supabase.from('cash_transfers').insert([{
      tenant_id: tenantId, from_rider_id: rider.id, to_rider_id: toRiderId,
      to_office: isOffice, amount: Number(amount),
      transfer_date: new Date().toISOString().split('T')[0],
      transfer_type: transferType, status: 'pending'
    }])
    if (error) { alert('Error: ' + error.message); setSaving(false); return }
    setSuccess({ amount: Number(amount), to: isOffice ? t('Office', 'دفتر') : mainRider?.full_name, type: transferType })
    setAmount(''); setTransferTo(null); setTransferType('cash')
    fetchData()
    setSaving(false)
  }

  async function confirmTransfer(transfer) {
    setConfirming(transfer.id)
    const { error } = await supabase.from('cash_transfers')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_by: rider.full_name })
      .eq('id', transfer.id).eq('tenant_id', tenantId)
    if (error) { alert('Error: ' + error.message); setConfirming(null); return }
    fetchData()
    setConfirming(null)
  }

  async function rejectTransfer(transfer) {
    setConfirming(transfer.id)
    await supabase.from('cash_transfers').update({ status: 'rejected' }).eq('id', transfer.id).eq('tenant_id', tenantId)
    fetchData()
    setConfirming(null)
  }

  const isMainRider = rider.is_main_rider
  const todayLabel = new Date().toLocaleDateString('en-PK', { weekday: 'long', day: '2-digit', month: 'long' })

  if (loading) return <p style={{ textAlign: 'center', color: '#888', padding: '40px' }}>{t('Loading...', 'لوڈ ہو رہا ہے...')}</p>

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '4px' }}>💸 {t('Cash Transfer', 'کیش منتقلی')}</h2>
      <p style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
        {isMainRider
          ? t('You are the Main Rider — confirm incoming cash and return to office', 'آپ مین رائیڈر ہیں — آنے والا کیش تصدیق کریں اور دفتر کو واپس کریں')
          : t('Return your cash to Main Rider or Office', 'اپنا کیش مین رائیڈر یا دفتر کو واپس کریں')}
      </p>

      {success && (
        <div style={{ background: '#e8f5e9', border: '2px solid #4caf50', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
          <p style={{ fontWeight: '700', color: '#1b5e20', marginBottom: '4px' }}>✅ {t('Transfer Submitted!', 'منتقلی جمع ہو گئی!')}</p>
          <p style={{ fontSize: '13px', color: '#2e7d32', margin: 0 }}>
            Rs. {success.amount.toLocaleString()} {t('sent to', 'بھیجی گئی')} {success.to} {t('via', 'کے ذریعے')} {success.type === 'jazzcash' ? '📱 JazzCash' : '💵 ' + t('Cash', 'کیش')} — {t('waiting for confirmation', 'تصدیق کا انتظار')}
          </p>
          <button onClick={() => setSuccess(null)}
            style={{ marginTop: '8px', padding: '4px 12px', background: 'none', border: '1px solid #4caf50', borderRadius: '6px', color: '#1a7a4a', cursor: 'pointer', fontSize: '12px' }}>
            OK
          </button>
        </div>
      )}

      {/* Two balance cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
        <div style={{ background: todayBalance > 0 ? 'linear-gradient(135deg, #0f4c81, #1565c0)' : 'linear-gradient(135deg, #1a7a4a, #2e7d32)', color: 'white', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
          <p style={{ fontSize: '11px', opacity: 0.8, margin: '0 0 4px', textTransform: 'uppercase' }}>{t('Today', 'آج')}</p>
          <p style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 2px' }}>Rs. {Math.max(0, todayBalance).toLocaleString()}</p>
          <p style={{ fontSize: '10px', opacity: 0.7, margin: 0 }}>{todayLabel}</p>
        </div>
        <div style={{ background: totalUncleared > 0 ? 'linear-gradient(135deg, #c62828, #e65100)' : 'linear-gradient(135deg, #1a7a4a, #0f4c81)', color: 'white', borderRadius: '12px', padding: '16px', textAlign: 'center' }}>
          <p style={{ fontSize: '11px', opacity: 0.8, margin: '0 0 4px', textTransform: 'uppercase' }}>{t('Total Uncleared', 'کل غیر منتقل')}</p>
          <p style={{ fontSize: '24px', fontWeight: '700', margin: '0 0 2px' }}>Rs. {totalUncleared.toLocaleString()}</p>
          <p style={{ fontSize: '10px', opacity: 0.7, margin: 0 }}>{t('All time', 'ہمیشہ سے')}</p>
        </div>
      </div>

      {totalUncleared > 0 && (
        <div style={{ background: '#fff3e0', border: '1px solid #ffe082', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
          <p style={{ fontSize: '12px', color: '#e65100', margin: 0, fontWeight: '600' }}>
            ⚠️ {t('You have Rs.', 'آپ کے پاس Rs.')} {totalUncleared.toLocaleString()} {t('total uncleared cash — please transfer to office', 'کل غیر منتقل کیش ہے — براہ کرم دفتر کو منتقل کریں')}
          </p>
        </div>
      )}

      {pendingTransfers.length > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '2px solid #ffe082' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#795548', marginBottom: '12px' }}>
            ⏳ {t('Pending Cash Receipts', 'زیر التواء کیش وصولیاں')} — {pendingTransfers.length}
          </p>
          {pendingTransfers.map(tr => (
            <div key={tr.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#fffdf0', borderRadius: '8px', border: '1px solid #ffe082', marginBottom: '8px' }}>
              <div>
                <p style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>🚴 {tr.from_rider?.full_name}</p>
                <p style={{ fontSize: '12px', color: '#888', margin: '0 0 2px' }}>
                  {tr.transfer_type === 'jazzcash' ? '📱 JazzCash' : `💵 ${t('Cash Transfer', 'کیش منتقلی')}`}
                </p>
                <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>{new Date(tr.created_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '18px', fontWeight: '700', color: '#0f4c81', margin: '0 0 6px' }}>Rs. {Number(tr.amount).toLocaleString()}</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => rejectTransfer(tr)} disabled={confirming === tr.id}
                    style={{ padding: '6px 12px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                    ✕ {t('Reject', 'رد')}
                  </button>
                  <button onClick={() => confirmTransfer(tr)} disabled={confirming === tr.id}
                    style={{ padding: '6px 12px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                    {confirming === tr.id ? '...' : `✓ ${t('Confirm', 'تصدیق')}`}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalUncleared > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '8px' }}>{t('How are you sending?', 'کیسے بھیج رہے ہیں؟')}</p>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            <button onClick={() => setTransferType('cash')}
              style={{ flex: 1, padding: '14px', border: '2px solid', borderColor: transferType === 'cash' ? '#0f4c81' : '#eee', borderRadius: '10px', cursor: 'pointer', background: transferType === 'cash' ? '#e3f0ff' : '#f8f9fa', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '24px' }}>💵</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81' }}>{t('Physical Cash', 'نقد')}</span>
              <span style={{ fontSize: '11px', color: '#888' }}>{t('Handing cash directly', 'براہ راست کیش')}</span>
            </button>
            <button onClick={() => setTransferType('jazzcash')}
              style={{ flex: 1, padding: '14px', border: '2px solid', borderColor: transferType === 'jazzcash' ? '#9c27b0' : '#eee', borderRadius: '10px', cursor: 'pointer', background: transferType === 'jazzcash' ? '#fdf4ff' : '#f8f9fa', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '24px' }}>📱</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#9c27b0' }}>JazzCash</span>
              <span style={{ fontSize: '11px', color: '#888' }}>{t('Sent via JazzCash', 'جیز کیش سے')}</span>
            </button>
          </div>

          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '8px' }}>{t('Return Cash To', 'کیش کہاں واپس کریں')}</p>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
            {!isMainRider && mainRider && (
              <button onClick={() => setTransferTo('main_rider')}
                style={{ flex: 1, padding: '16px', border: '2px solid', borderColor: transferTo === 'main_rider' ? '#f59e0b' : '#eee', borderRadius: '10px', cursor: 'pointer', background: transferTo === 'main_rider' ? '#fff8e1' : '#f8f9fa', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '28px' }}>⭐</span>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#795548' }}>{mainRider.full_name}</span>
                <span style={{ fontSize: '11px', color: '#888' }}>{t('Main Rider', 'مین رائیڈر')}</span>
              </button>
            )}
            <button onClick={() => setTransferTo('office')}
              style={{ flex: 1, padding: '16px', border: '2px solid', borderColor: transferTo === 'office' ? '#0f4c81' : '#eee', borderRadius: '10px', cursor: 'pointer', background: transferTo === 'office' ? '#e3f0ff' : '#f8f9fa', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '28px' }}>🏢</span>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f4c81' }}>{t('Office / Admin', 'دفتر / ایڈمن')}</span>
              <span style={{ fontSize: '11px', color: '#888' }}>CEO</span>
            </button>
          </div>

          {transferType === 'jazzcash' && (
            <div style={{ background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px' }}>
              <p style={{ fontSize: '12px', color: '#6b21a8', margin: 0 }}>📱 {t('Make sure you have already sent JazzCash payment before submitting.', 'جمع کرنے سے پہلے یقینی بنائیں کہ جیز کیش بھیج دیا ہے۔')}</p>
            </div>
          )}
          {transferType === 'cash' && (
            <div style={{ background: '#f0f7ff', border: '1px solid #c8d8ff', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px' }}>
              <p style={{ fontSize: '12px', color: '#0f4c81', margin: 0 }}>💵 {t('You are handing physical cash to office.', 'آپ دفتر کو جسمانی نقد دے رہے ہیں۔')}</p>
            </div>
          )}

          <p style={{ fontSize: '13px', fontWeight: '700', color: '#555', marginBottom: '6px' }}>{t('Amount (Rs.)', 'رقم (Rs.)')}</p>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
            style={{ width: '100%', padding: '14px', border: '2px solid #ddd', borderRadius: '8px', fontSize: '24px', fontWeight: '700', outline: 'none', boxSizing: 'border-box', textAlign: 'center', marginBottom: '8px' }} />

          <button onClick={() => setAmount(String(totalUncleared))}
            style={{ padding: '6px 14px', background: '#f0f4ff', border: '1px solid #d0d9ff', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#0f4c81', fontWeight: '600', marginBottom: '16px' }}>
            {t('Full Uncleared: Rs.', 'کل غیر منتقل: Rs.')} {totalUncleared.toLocaleString()}
          </button>

          <button onClick={submitTransfer} disabled={saving}
            style={{ width: '100%', padding: '14px', background: transferType === 'jazzcash' ? '#9c27b0' : '#1a7a4a', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontWeight: '700', marginTop: '8px' }}>
            {saving ? t('Submitting...', 'جمع ہو رہا ہے...') : transferType === 'jazzcash' ? `📱 ${t('Submit JazzCash Transfer', 'جیز کیش منتقلی جمع کریں')}` : `✓ ${t('Submit Cash Transfer', 'کیش منتقلی جمع کریں')}`}
          </button>
        </div>
      )}

      {totalUncleared <= 0 && pendingTransfers.length === 0 && (
        <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: '32px', marginBottom: '8px' }}>✅</p>
          <p style={{ color: '#1a7a4a', fontWeight: '700', marginBottom: '4px' }}>{t('All Clear!', 'سب صاف!')}</p>
          <p style={{ color: '#888', fontSize: '13px' }}>{t('No uncleared cash to transfer.', 'منتقل کرنے کے لیے کوئی غیر منتقل کیش نہیں۔')}</p>
        </div>
      )}

      <button onClick={fetchData}
        style={{ width: '100%', padding: '12px', background: '#f0f4ff', color: '#0f4c81', border: '1px solid #c8d8ff', borderRadius: '10px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', marginTop: '8px' }}>
        🔄 {t('Refresh', 'تازہ کریں')}
      </button>
    </div>
  )
}
