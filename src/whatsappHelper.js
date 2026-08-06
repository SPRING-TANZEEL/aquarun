export function buildDeliveryMessage({ bizName, customerName, items, total, paymentMethod, creditPortion, newBalance, invoiceNumber }) {
  const date = new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })
  let msg = `*${bizName}*\n`
  msg += `📅 ${date}\n\n`
  msg += `السلام علیکم *${customerName}*\n\n`
  msg += `*🧾 Sale Receipt*\n`
  if (invoiceNumber) msg += `Invoice: ${invoiceNumber}\n`
  msg += `━━━━━━━━━━━━━━━━━━━━\n`
  items.forEach(i => { msg += `• ${i}\n` })
  msg += `━━━━━━━━━━━━━━━━━━━━\n`
  msg += `💰 *Total: Rs. ${total.toLocaleString()}*\n`
  msg += `💳 Payment: ${paymentMethod}\n`
  if (creditPortion > 0) msg += `📋 Credit: Rs. ${creditPortion.toLocaleString()}\n`
  if (newBalance > 0) msg += `\n⚠️ *Outstanding Balance: Rs. ${newBalance.toLocaleString()}*\nBراہ کرم جلد از جلد ادائیگی کریں۔\n`
  else if (newBalance <= 0) msg += `\n✅ *Account Clear — Thank you!*\n`
  msg += `\n_${bizName}_`
  return msg
}

export function buildPaymentMessage({ bizName, customerName, amount, method, newBalance, jazzPending }) {
  const date = new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })
  let msg = `*${bizName}*\n`
  msg += `📅 ${date}\n\n`
  msg += `السلام علیکم *${customerName}*\n\n`
  msg += `*💰 Payment Receipt*\n`
  msg += `━━━━━━━━━━━━━━━━━━━━\n`
  msg += `Amount Received: Rs. ${amount.toLocaleString()}\n`
  msg += `Method: ${method}\n`
  if (jazzPending) msg += `⚠️ Pending confirmation\n`
  msg += `━━━━━━━━━━━━━━━━━━━━\n`
  if (!jazzPending) {
    if (newBalance > 0) msg += `📊 Remaining Balance: Rs. ${newBalance.toLocaleString()}\n`
    else msg += `✅ *Account Clear — Thank you!*\n`
  }
  msg += `\n_${bizName}_`
  return msg
}

export function openWhatsApp(mobile, message) {
  const phone = (mobile || '').replace(/\D/g, '').replace(/^0/, '').replace(/^92/, '')
  const waNumber = phone ? `92${phone}` : ''
  const url = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`
  window.open(url, '_blank')
}