import { supabase } from './supabase'

// ─── CORE JOURNAL POSTING FUNCTION ────────────────────────────────
async function postJournalEntry({ date, referenceType, referenceId, narration, lines, tenantId }) {
  const totalAmount = lines.reduce((s, l) => s + (l.debit || 0), 0)

  const { data: entry, error } = await supabase
    .from('journal_entries')
    .insert([{
      tenant_id: tenantId,
      entry_date: date || new Date().toISOString().split('T')[0],
      reference_type: referenceType,
      reference_id: referenceId,
      narration,
      total_amount: totalAmount,
      created_by: 'system'
    }])
    .select().single()

  if (error) { console.error('Journal entry error:', error); return null }

  const entryLines = lines.map(l => ({
    tenant_id: tenantId,
    journal_entry_id: entry.id,
    account_code: l.account_code,
    account_name: l.account_name,
    debit: l.debit || 0,
    credit: l.credit || 0
  }))

  const { error: linesError } = await supabase
    .from('journal_entry_lines')
    .insert(entryLines)

  if (linesError) { console.error('Journal lines error:', linesError); return null }

  return entry.id
}

// ─── HELPER: GET CASH ACCOUNT BY PAYMENT METHOD ───────────────────
// For CEO/admin direct accounts
function getCashAccount(paymentMethod) {
  switch (paymentMethod) {
    case 'jazzcash':   return { code: '1002', name: 'JazzCash Account' }
    case 'easypaisa':  return { code: '1004', name: 'EasyPaisa Account' }
    case 'bank':       return { code: '1003', name: 'Bank Account' }
    default:           return { code: '1001', name: 'Cash in Hand' }
  }
}

// ─── HELPER: GET CLEARING ACCOUNT BY PAYMENT METHOD ───────────────
// Unconfirmed mobile money sits in clearing until confirmed
function getClearingAccount(paymentMethod) {
  switch (paymentMethod) {
    case 'easypaisa': return { code: '1103', name: 'EasyPaisa Clearing - Pending' }
    default:          return { code: '1102', name: 'JazzCash Clearing - Pending' }
  }
}

// ─── HELPER: GET SALES ACCOUNT BY BOTTLE TYPE ─────────────────────
function getSalesBreakdown(delivery) {
  const lines = []
  const qty19l = Number(delivery.qty_19l || 0)
  const qtyHalf = Number(delivery.qty_half_litre || 0)
  const qty15l = Number(delivery.qty_1_5l || 0)
  const totalAmount = Number(delivery.total_amount || 0)

  if (qty19l > 0 && qtyHalf === 0 && qty15l === 0) {
    lines.push({ account_code: '4001', account_name: 'Water Sales - 19L', credit: totalAmount })
  } else if (qtyHalf > 0 && qty19l === 0 && qty15l === 0) {
    lines.push({ account_code: '4002', account_name: 'Water Sales - Half Litre', credit: totalAmount })
  } else if (qty15l > 0 && qty19l === 0 && qtyHalf === 0) {
    lines.push({ account_code: '4003', account_name: 'Water Sales - 1.5L', credit: totalAmount })
  } else {
    // Mixed — split proportionally or post to 4001
    lines.push({ account_code: '4001', account_name: 'Water Sales - 19L', credit: totalAmount })
  }

  return lines
}

// ─── HELPER: GET EXPENSE ACCOUNT BY CATEGORY ──────────────────────
function getExpenseAccount(category, isRider = false) {
  // Rider-specific mapping
  const riderMap = {
    fuel:        { code: '6017', name: 'Rider Fuel & Vehicle' },
    repair:      { code: '6019', name: 'Rider Repairs' },
    refreshment: { code: '6018', name: 'Rider Refreshments' },
    maintenance: { code: '6019', name: 'Rider Repairs' },
    vehicle:     { code: '6017', name: 'Rider Fuel & Vehicle' },
    other:       { code: '6009', name: 'Other Expenses' },
  }

  // Office/admin mapping
  const officeMap = {
    rent:         { code: '6004', name: 'Rent' },
    electricity:  { code: '6005', name: 'Electricity' },
    fuel:         { code: '6006', name: 'Fuel - Office' },
    maintenance:  { code: '6007', name: 'Maintenance' },
    supplies:     { code: '6008', name: 'Supplies' },
    salary:       { code: '6001', name: 'Rider Salaries' },
    telephone:    { code: '6013', name: 'Telephone & Internet' },
    printing:     { code: '6015', name: 'Printing & Stationery' },
    marketing:    { code: '6016', name: 'Advertising & Marketing' },
    water_testing:{ code: '6010', name: 'Water Testing Fees' },
    vehicle:      { code: '6011', name: 'Vehicle Running Cost' },
    bank_charges: { code: '6014', name: 'Bank Charges' },
    other:        { code: '6009', name: 'Other Expenses' },
  }

  const map = isRider ? riderMap : officeMap
  return map[category] || { code: '6009', name: 'Other Expenses' }
}

// ─── 1. POST DELIVERY JOURNAL ENTRY ───────────────────────────────
// isRiderEntry = true when rider logs delivery (rider_id is NOT NULL)
// isRiderEntry = false when admin logs via Quick Sale (rider_id IS NULL)
export async function postDeliveryJournal(delivery, customerId, tenantId, isRiderEntry = true) {
  try {
    const totalAmount = Number(delivery.total_amount || 0)
    const cashReceived = Number(delivery.amount_received || 0)
    const creditPortion = Number(delivery.credit_amount || 0)
    const paymentMethod = delivery.payment_method
    const salesLines = getSalesBreakdown(delivery)
    const lines = []

    if (paymentMethod === 'cash') {
      // Cash received goes to rider holding (if rider) or directly to CEO cash (if admin)
      if (cashReceived > 0) {
        if (isRiderEntry) {
          lines.push({ account_code: '1101', account_name: 'Receivable from Riders', debit: cashReceived })
        } else {
          lines.push({ account_code: '1001', account_name: 'Cash in Hand', debit: cashReceived })
        }
      }
      // Credit portion always goes to customer AR
      if (creditPortion > 0) {
        lines.push({ account_code: '1100', account_name: 'Accounts Receivable', debit: creditPortion })
      }
    } else if (paymentMethod === 'jazzcash') {
      // Jazz always goes to clearing — confirmed later via reconciliation
      lines.push({ account_code: '1102', account_name: 'JazzCash Clearing - Pending', debit: totalAmount })
    } else if (paymentMethod === 'easypaisa') {
      // EasyPaisa goes to its own clearing
      lines.push({ account_code: '1103', account_name: 'EasyPaisa Clearing - Pending', debit: totalAmount })
    } else if (paymentMethod === 'credit') {
      // Customer owes — goes to AR
      lines.push({ account_code: '1100', account_name: 'Accounts Receivable', debit: totalAmount })
    }

    // Credit side — sales revenue
    salesLines.forEach(s => lines.push({ ...s, debit: 0 }))

    const entryId = await postJournalEntry({
      tenantId,
      date: delivery.delivered_at?.split('T')[0] || new Date().toISOString().split('T')[0],
      referenceType: 'delivery',
      referenceId: delivery.id,
      narration: `Water delivery — ${delivery.qty_19l || 0}×19L ${delivery.qty_half_litre || 0}×Half ${delivery.qty_1_5l || 0}×1.5L — ${paymentMethod} — ${isRiderEntry ? 'rider' : 'admin'}`,
      lines
    })

    if (entryId && delivery.id) {
      await supabase.from('deliveries')
        .update({ journal_entry_id: entryId })
        .eq('id', delivery.id)
        .eq('tenant_id', tenantId)
    }

    // Post commission accrual for commission-based riders
    if (isRiderEntry && delivery.rider_id) {
      await postCommissionAccrualJournal(delivery, tenantId)
    }

    return entryId
  } catch (err) {
    console.error('postDeliveryJournal error:', err)
    return null
  }
}

// ─── 2. POST PAYMENT JOURNAL ENTRY ────────────────────────────────
// isRiderEntry = true when rider collects payment (rider_id NOT NULL)
// isRiderEntry = false when admin records payment directly
export async function postPaymentJournal(payment, tenantId, isRiderEntry = true) {
  try {
    const amount = Number(payment.amount || 0)
    const paymentMethod = payment.payment_method
    const lines = []

    if (paymentMethod === 'cash') {
      // Cash collection — rider holding or direct to CEO
      if (isRiderEntry) {
        lines.push({ account_code: '1101', account_name: 'Receivable from Riders', debit: amount })
      } else {
        lines.push({ account_code: '1001', account_name: 'Cash in Hand', debit: amount })
      }
      lines.push({ account_code: '1100', account_name: 'Accounts Receivable', credit: amount })

    } else if (paymentMethod === 'jazzcash') {
      // Jazz payment — unconfirmed goes to clearing
      lines.push({ account_code: '1102', account_name: 'JazzCash Clearing - Pending', debit: amount })
      lines.push({ account_code: '1100', account_name: 'Accounts Receivable', credit: amount })

    } else if (paymentMethod === 'easypaisa') {
      // EasyPaisa — goes to its clearing
      lines.push({ account_code: '1103', account_name: 'EasyPaisa Clearing - Pending', debit: amount })
      lines.push({ account_code: '1100', account_name: 'Accounts Receivable', credit: amount })
    }

    if (lines.length === 0) return null

    const entryId = await postJournalEntry({
      tenantId,
      date: payment.payment_date || new Date().toISOString().split('T')[0],
      referenceType: 'payment',
      referenceId: payment.id,
      narration: `Customer payment — ${paymentMethod} — ${isRiderEntry ? 'collected by rider' : 'recorded by admin'}`,
      lines
    })

    if (entryId && payment.id) {
      await supabase.from('payments')
        .update({ journal_entry_id: entryId })
        .eq('id', payment.id)
        .eq('tenant_id', tenantId)
    }

    return entryId
  } catch (err) {
    console.error('postPaymentJournal error:', err)
    return null
  }
}

// ─── 3. POST JAZZCASH/EASYPAISA CONFIRMATION JOURNAL ENTRY ────────
// When admin confirms jazz/easypaisa — moves from clearing to actual account
export async function postJazzCashConfirmationJournal(record, recordType, tenantId) {
  try {
    const amount = Number(record.total_amount || record.amount || 0)
    const paymentMethod = record.payment_method || 'jazzcash'

    // Determine which accounts to use
    const actualAcc = paymentMethod === 'easypaisa'
      ? { code: '1004', name: 'EasyPaisa Account' }
      : { code: '1002', name: 'JazzCash Account' }

    const clearingAcc = getClearingAccount(paymentMethod)

    const lines = [
      // Move from clearing to actual account
      { account_code: actualAcc.code, account_name: actualAcc.name, debit: amount },
      { account_code: clearingAcc.code, account_name: clearingAcc.name, credit: amount }
    ]

    const entryId = await postJournalEntry({
      tenantId,
      date: new Date().toISOString().split('T')[0],
      referenceType: recordType + '_confirmed',
      referenceId: record.id,
      narration: `${paymentMethod === 'easypaisa' ? 'EasyPaisa' : 'JazzCash'} confirmed — ${recordType} — moved from clearing to account`,
      lines
    })

    return entryId
  } catch (err) {
    console.error('postJazzCashConfirmationJournal error:', err)
    return null
  }
}

// ─── 4. POST RIDER EXPENSE JOURNAL ENTRY ──────────────────────────
// Rider spends from his holding cash — reduces what he owes to office
export async function postRiderExpenseJournal(expense, tenantId) {
  try {
    const amount = Number(expense.amount || 0)
    const expenseAcc = getExpenseAccount(expense.expense_type || expense.category || 'other', true)

    const lines = [
      // Debit the correct expense account
      { account_code: expenseAcc.code, account_name: expenseAcc.name, debit: amount },
      // Credit rider holding — rider spent from his cash, reduces what he owes
      { account_code: '1101', account_name: 'Receivable from Riders', credit: amount }
    ]

    const entryId = await postJournalEntry({
      tenantId,
      date: expense.expense_date || new Date().toISOString().split('T')[0],
      referenceType: 'rider_expense',
      referenceId: expense.id,
      narration: `Rider expense — ${expense.expense_type || expense.category || 'general'} — ${expense.description || ''} — deducted from rider holding`,
      lines
    })

    if (entryId && expense.id) {
      await supabase.from('expenses')
        .update({ journal_entry_id: entryId })
        .eq('id', expense.id)
        .eq('tenant_id', tenantId)
    }

    return entryId
  } catch (err) {
    console.error('postRiderExpenseJournal error:', err)
    return null
  }
}

// ─── 5. POST OFFICE EXPENSE JOURNAL ENTRY ─────────────────────────
// Admin pays expense directly from cash/jazz/bank — no change needed
export async function postOfficeExpenseJournal(expense, tenantId) {
  try {
    const amount = Number(expense.amount || 0)
    const expenseAcc = getExpenseAccount(expense.category)
    const cashAcc = getCashAccount(expense.payment_method || 'cash')

    const lines = [
      { account_code: expenseAcc.code, account_name: expenseAcc.name, debit: amount },
      { account_code: cashAcc.code, account_name: cashAcc.name, credit: amount }
    ]

    const entryId = await postJournalEntry({
      tenantId,
      date: expense.expense_date || new Date().toISOString().split('T')[0],
      referenceType: 'office_expense',
      referenceId: expense.id,
      narration: `Office expense — ${expense.category} — ${expense.description || ''} — paid from ${expense.payment_method || 'cash'}`,
      lines
    })

    if (entryId && expense.id) {
      await supabase.from('office_expenses')
        .update({ journal_entry_id: entryId })
        .eq('id', expense.id)
        .eq('tenant_id', tenantId)
    }

    return entryId
  } catch (err) {
    console.error('postOfficeExpenseJournal error:', err)
    return null
  }
}

// ─── 6. POST SALARY PAYMENT JOURNAL ENTRY ─────────────────────────
// Settles salary payable — DR 2100 Salary Payable  CR cash account
export async function postSalaryPaymentJournal(payment, tenantId) {
  try {
    const amount = Number(payment.amount_paid || 0)
    const cashAcc = getCashAccount(payment.payment_method || 'cash')

    const lines = [
      // Settle the salary payable liability
      { account_code: '2100', account_name: 'Salary Payable', debit: amount },
      // Pay from cash/jazz/bank
      { account_code: cashAcc.code, account_name: cashAcc.name, credit: amount }
    ]

    const entryId = await postJournalEntry({
      tenantId,
      date: payment.payment_date || new Date().toISOString().split('T')[0],
      referenceType: 'salary_payment',
      referenceId: payment.id,
      narration: `Salary paid — ${payment.month_year || ''} — ${payment.payment_method || 'cash'}`,
      lines
    })

    if (entryId && payment.id) {
      await supabase.from('salary_payments')
        .update({ journal_entry_id: entryId })
        .eq('id', payment.id)
        .eq('tenant_id', tenantId)
    }

    return entryId
  } catch (err) {
    console.error('postSalaryPaymentJournal error:', err)
    return null
  }
}

// ─── 7. POST SALARY ADVANCE JOURNAL ENTRY ─────────────────────────
// Advance paid from cash/jazz — DR 6002 Advances  CR cash account
export async function postSalaryAdvanceJournal(advance, tenantId) {
  try {
    const amount = Number(advance.amount || 0)
    const cashAcc = getCashAccount(advance.payment_method || 'cash')

    const lines = [
      { account_code: '6002', account_name: 'Salary Advances', debit: amount },
      { account_code: cashAcc.code, account_name: cashAcc.name, credit: amount }
    ]

    const entryId = await postJournalEntry({
      tenantId,
      date: new Date().toISOString().split('T')[0],
      referenceType: 'salary_advance',
      referenceId: advance.id,
      narration: `Salary advance — approved — paid from ${advance.payment_method || 'cash'}`,
      lines
    })

    if (entryId && advance.id) {
      await supabase.from('salary_advances')
        .update({ journal_entry_id: entryId })
        .eq('id', advance.id)
        .eq('tenant_id', tenantId)
    }

    return entryId
  } catch (err) {
    console.error('postSalaryAdvanceJournal error:', err)
    return null
  }
}

// ─── 8. POST COMMISSION ACCRUAL JOURNAL ENTRY ─────────────────────
// Auto-accrues commission earned per delivery for commission-based riders
// DR 6001 Rider Salaries  CR 2100 Salary Payable
export async function postCommissionAccrualJournal(delivery, tenantId) {
  try {
    if (!delivery.rider_id) return null

    // Fetch rider to check salary type and commission rates
    const { data: rider } = await supabase.from('riders')
      .select('salary_type, commission_19l, commission_half_litre, commission_1_5l, full_name')
      .eq('id', delivery.rider_id)
      .eq('tenant_id', tenantId)
      .single()

    if (!rider) return null
    if (rider.salary_type !== 'commission' && rider.salary_type !== 'fixed_commission') return null

    const qty19l = Number(delivery.qty_19l || 0)
    const qtyHalf = Number(delivery.qty_half_litre || 0)
    const qty15l = Number(delivery.qty_1_5l || 0)

    const commission =
      (qty19l * Number(rider.commission_19l || 0)) +
      (qtyHalf * Number(rider.commission_half_litre || 0)) +
      (qty15l * Number(rider.commission_1_5l || 0))

    if (commission <= 0) return null

    const lines = [
      // Accrue salary expense
      { account_code: '6001', account_name: 'Rider Salaries', debit: commission },
      // Build up salary payable liability
      { account_code: '2100', account_name: 'Salary Payable', credit: commission }
    ]

    const entryId = await postJournalEntry({
      tenantId,
      date: delivery.delivered_at?.split('T')[0] || new Date().toISOString().split('T')[0],
      referenceType: 'commission_accrual',
      referenceId: delivery.id,
      narration: `Commission accrual — ${rider.full_name} — ${qty19l}×19L + ${qtyHalf}×Half + ${qty15l}×1.5L = Rs. ${commission}`,
      lines
    })

    return entryId
  } catch (err) {
    console.error('postCommissionAccrualJournal error:', err)
    return null
  }
}

// ─── 9. POST CASH TRANSFER FROM RIDER JOURNAL ENTRY ───────────────
// Rider transfers holding cash/jazz to CEO office
// DR cash/jazz/easypaisa account  CR 1101 Receivable from Riders
export async function postCashTransferJournal(transfer, tenantId) {
  try {
    const amount = Number(transfer.amount || 0)
    const transferType = transfer.transfer_type || 'cash'
    const toAcc = getCashAccount(transferType)

    const lines = [
      // Money arrives in CEO account
      { account_code: toAcc.code, account_name: toAcc.name, debit: amount },
      // Clears from rider holding
      { account_code: '1101', account_name: 'Receivable from Riders', credit: amount }
    ]

    const entryId = await postJournalEntry({
      tenantId,
      date: transfer.transfer_date || new Date().toISOString().split('T')[0],
      referenceType: 'cash_transfer',
      referenceId: transfer.id,
      narration: `Rider cash transfer to office — ${transferType} — clears rider holding`,
      lines
    })

    if (entryId && transfer.id) {
      await supabase.from('cash_transfers')
        .update({ journal_entry_id: entryId })
        .eq('id', transfer.id)
        .eq('tenant_id', tenantId)
    }

    return entryId
  } catch (err) {
    console.error('postCashTransferJournal error:', err)
    return null
  }
}

// ─── 10. POST STOCK PURCHASE JOURNAL ENTRY ────────────────────────
export async function postStockPurchaseJournal(purchase, tenantId) {
  try {
    const amount = Number(purchase.total_cost || 0)
    const cashAcc = getCashAccount(purchase.payment_method || 'cash')

    const lines = [
      { account_code: '5001', account_name: 'Raw Material Cost', debit: amount },
      { account_code: cashAcc.code, account_name: cashAcc.name, credit: amount }
    ]

    const entryId = await postJournalEntry({
      tenantId,
      date: purchase.purchase_date || new Date().toISOString().split('T')[0],
      referenceType: 'stock_purchase',
      referenceId: purchase.id,
      narration: `Stock purchase — ${purchase.supplier || 'supplier'} — paid from ${purchase.payment_method || 'cash'}`,
      lines
    })

    if (entryId && purchase.id) {
      await supabase.from('stock_purchases')
        .update({ journal_entry_id: entryId })
        .eq('id', purchase.id)
        .eq('tenant_id', tenantId)
    }

    return entryId
  } catch (err) {
    console.error('postStockPurchaseJournal error:', err)
    return null
  }
}

// ─── 11. POST OWNER TRANSACTION JOURNAL ENTRY ─────────────────────
export async function postOwnerTransactionJournal(transaction, tenantId) {
  try {
    const amount = Number(transaction.amount || 0)
    const cashAcc = getCashAccount(transaction.account || 'cash')
    const isInjection = transaction.transaction_type === 'injection'
    const lines = []

    if (isInjection) {
      lines.push({ account_code: cashAcc.code, account_name: cashAcc.name, debit: amount })
      lines.push({ account_code: '3001', account_name: 'Owner Capital', credit: amount })
    } else {
      lines.push({ account_code: '3002', account_name: 'Owner Drawings', debit: amount })
      lines.push({ account_code: cashAcc.code, account_name: cashAcc.name, credit: amount })
    }

    const entryId = await postJournalEntry({
      tenantId,
      date: transaction.transaction_date || new Date().toISOString().split('T')[0],
      referenceType: 'owner_transaction',
      referenceId: transaction.id,
      narration: `Owner ${isInjection ? 'capital injection' : 'drawing'} — ${cashAcc.name}`,
      lines
    })

    if (entryId && transaction.id) {
      await supabase.from('owner_transactions')
        .update({ journal_entry_id: entryId })
        .eq('id', transaction.id)
        .eq('tenant_id', tenantId)
    }

    return entryId
  } catch (err) {
    console.error('postOwnerTransactionJournal error:', err)
    return null
  }
}

// ─── 12. POST ACCOUNT TRANSFER JOURNAL ENTRY ──────────────────────
export async function postAccountTransferJournal(transfer, tenantId) {
  try {
    const amount = Number(transfer.amount || 0)
    const fromAcc = getCashAccount(transfer.from_account)
    const toAcc = getCashAccount(transfer.to_account)

    const lines = [
      { account_code: toAcc.code, account_name: toAcc.name, debit: amount },
      { account_code: fromAcc.code, account_name: fromAcc.name, credit: amount }
    ]

    const entryId = await postJournalEntry({
      tenantId,
      date: transfer.transfer_date || new Date().toISOString().split('T')[0],
      referenceType: 'account_transfer',
      referenceId: transfer.id,
      narration: `Internal transfer — ${fromAcc.name} to ${toAcc.name}`,
      lines
    })

    if (entryId && transfer.id) {
      await supabase.from('ceo_account_transfers')
        .update({ journal_entry_id: entryId })
        .eq('id', transfer.id)
        .eq('tenant_id', tenantId)
    }

    return entryId
  } catch (err) {
    console.error('postAccountTransferJournal error:', err)
    return null
  }
}

// ─── 13. REVERSE JOURNAL ENTRY (for void) ─────────────────────────
export async function reverseJournalEntry(originalEntryId, referenceId, referenceType, tenantId) {
  try {
    const { data: originalLines } = await supabase
      .from('journal_entry_lines')
      .select('*')
      .eq('journal_entry_id', originalEntryId)
      .eq('tenant_id', tenantId)

    if (!originalLines || originalLines.length === 0) return null

    const reversalLines = originalLines.map(l => ({
      account_code: l.account_code,
      account_name: l.account_name,
      debit: l.credit,
      credit: l.debit
    }))

    const entryId = await postJournalEntry({
      tenantId,
      date: new Date().toISOString().split('T')[0],
      referenceType: referenceType + '_reversal',
      referenceId: referenceId,
      narration: `Reversal — ${referenceType} voided`,
      lines: reversalLines
    })

    return entryId
  } catch (err) {
    console.error('reverseJournalEntry error:', err)
    return null
  }
}
