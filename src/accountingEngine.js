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

// ─── GET CASH ACCOUNT BY PAYMENT METHOD ───────────────────────────
function getCashAccount(paymentMethod) {
  switch (paymentMethod) {
    case 'jazzcash': return { code: '1002', name: 'JazzCash Account' }
    case 'bank': return { code: '1003', name: 'Bank Account' }
    default: return { code: '1001', name: 'Cash in Hand' }
  }
}

// ─── GET SALES ACCOUNT BY BOTTLE TYPE ─────────────────────────────
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
    lines.push({ account_code: '4001', account_name: 'Water Sales - 19L', credit: totalAmount })
  }

  return lines
}

// ─── GET EXPENSE ACCOUNT BY CATEGORY ──────────────────────────────
function getExpenseAccount(category) {
  const map = {
    rent: { code: '6004', name: 'Rent' },
    electricity: { code: '6005', name: 'Electricity' },
    supplies: { code: '6008', name: 'Supplies' },
    fuel: { code: '6006', name: 'Fuel - Office' },
    salary: { code: '6001', name: 'Rider Salaries' },
    maintenance: { code: '6007', name: 'Maintenance' },
    other: { code: '6009', name: 'Other Expenses' },
  }
  return map[category] || { code: '6009', name: 'Other Expenses' }
}

// ─── 1. POST DELIVERY JOURNAL ENTRY ───────────────────────────────
export async function postDeliveryJournal(delivery, customerId, tenantId) {
  try {
    const totalAmount = Number(delivery.total_amount || 0)
    const cashReceived = Number(delivery.amount_received || 0)
    const creditPortion = Number(delivery.credit_amount || 0)
    const paymentMethod = delivery.payment_method
    const salesLines = getSalesBreakdown(delivery)
    const lines = []

    if (paymentMethod === 'cash') {
      if (cashReceived > 0) {
        const cashAcc = getCashAccount('cash')
        lines.push({ account_code: cashAcc.code, account_name: cashAcc.name, debit: cashReceived })
      }
      if (creditPortion > 0) {
        lines.push({ account_code: '1100', account_name: 'Accounts Receivable', debit: creditPortion })
      }
    } else if (paymentMethod === 'jazzcash') {
      lines.push({ account_code: '1100', account_name: 'Accounts Receivable', debit: totalAmount })
    } else if (paymentMethod === 'credit') {
      lines.push({ account_code: '1100', account_name: 'Accounts Receivable', debit: totalAmount })
    }

    salesLines.forEach(s => lines.push({ ...s, debit: 0 }))

    const entryId = await postJournalEntry({
      tenantId,
      date: delivery.delivered_at?.split('T')[0] || new Date().toISOString().split('T')[0],
      referenceType: 'delivery',
      referenceId: delivery.id,
      narration: `Water delivery — ${delivery.qty_19l || 0}×19L ${delivery.qty_half_litre || 0}×Half ${delivery.qty_1_5l || 0}×1.5L — ${paymentMethod}`,
      lines
    })

    if (entryId && delivery.id) {
      await supabase.from('deliveries')
        .update({ journal_entry_id: entryId })
        .eq('id', delivery.id)
        .eq('tenant_id', tenantId)
    }

    return entryId
  } catch (err) {
    console.error('postDeliveryJournal error:', err)
    return null
  }
}

// ─── 2. POST PAYMENT JOURNAL ENTRY ────────────────────────────────
export async function postPaymentJournal(payment, tenantId) {
  try {
    const amount = Number(payment.amount || 0)
    const paymentMethod = payment.payment_method
    const isConfirmedJazz = paymentMethod === 'jazzcash' && payment.jazzcash_confirmed
    const isCash = paymentMethod === 'cash'
    const lines = []

    if (isCash || isConfirmedJazz) {
      const cashAcc = getCashAccount(paymentMethod)
      lines.push({ account_code: cashAcc.code, account_name: cashAcc.name, debit: amount })
      lines.push({ account_code: '1100', account_name: 'Accounts Receivable', credit: amount })
    }

    if (lines.length === 0) return null

    const entryId = await postJournalEntry({
      tenantId,
      date: payment.payment_date || new Date().toISOString().split('T')[0],
      referenceType: 'payment',
      referenceId: payment.id,
      narration: `Customer payment received — ${paymentMethod}`,
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

// ─── 3. POST JAZZCASH CONFIRMATION JOURNAL ENTRY ──────────────────
export async function postJazzCashConfirmationJournal(record, recordType, tenantId) {
  try {
    const amount = Number(record.total_amount || record.amount || 0)
    const lines = [
      { account_code: '1002', account_name: 'JazzCash Account', debit: amount },
      { account_code: '1100', account_name: 'Accounts Receivable', credit: amount }
    ]

    const entryId = await postJournalEntry({
      tenantId,
      date: new Date().toISOString().split('T')[0],
      referenceType: recordType + '_jazzcash_confirmed',
      referenceId: record.id,
      narration: `JazzCash confirmed — ${recordType}`,
      lines
    })

    return entryId
  } catch (err) {
    console.error('postJazzCashConfirmationJournal error:', err)
    return null
  }
}

// ─── 4. POST RIDER EXPENSE JOURNAL ENTRY ──────────────────────────
export async function postRiderExpenseJournal(expense, tenantId) {
  try {
    const amount = Number(expense.amount || 0)
    const lines = [
      { account_code: '6003', account_name: 'Rider Field Expenses', debit: amount },
      { account_code: '1001', account_name: 'Cash in Hand', credit: amount }
    ]

    const entryId = await postJournalEntry({
      tenantId,
      date: expense.expense_date || new Date().toISOString().split('T')[0],
      referenceType: 'rider_expense',
      referenceId: expense.id,
      narration: `Rider field expense — ${expense.expense_type || 'general'} — ${expense.description || ''}`,
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
export async function postSalaryPaymentJournal(payment, tenantId) {
  try {
    const amount = Number(payment.amount_paid || 0)
    const cashAcc = getCashAccount(payment.payment_method || 'cash')

    const lines = [
      { account_code: '6001', account_name: 'Rider Salaries', debit: amount },
      { account_code: cashAcc.code, account_name: cashAcc.name, credit: amount }
    ]

    const entryId = await postJournalEntry({
      tenantId,
      date: payment.payment_date || new Date().toISOString().split('T')[0],
      referenceType: 'salary_payment',
      referenceId: payment.id,
      narration: `Salary payment — ${payment.month_year || ''} — paid from ${payment.payment_method || 'cash'}`,
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

// ─── 8. POST STOCK PURCHASE JOURNAL ENTRY ─────────────────────────
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

// ─── 9. POST OWNER TRANSACTION JOURNAL ENTRY ──────────────────────
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

// ─── 10. POST ACCOUNT TRANSFER JOURNAL ENTRY ──────────────────────
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

// ─── 11. POST CASH TRANSFER FROM RIDER JOURNAL ENTRY ──────────────
export async function postCashTransferJournal(transfer, tenantId) {
  try {
    const amount = Number(transfer.amount || 0)
    const transferType = transfer.transfer_type || 'cash'
    const toAcc = getCashAccount(transferType)

    const lines = [
      { account_code: toAcc.code, account_name: toAcc.name, debit: amount },
      { account_code: '1001', account_name: 'Cash in Hand', credit: amount }
    ]

    const entryId = await postJournalEntry({
      tenantId,
      date: transfer.transfer_date || new Date().toISOString().split('T')[0],
      referenceType: 'cash_transfer',
      referenceId: transfer.id,
      narration: `Cash transfer from rider to office — ${transferType}`,
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

// ─── 12. REVERSE JOURNAL ENTRY (for void) ─────────────────────────
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
      narration: `Reversal of journal entry — ${referenceType} voided`,
      lines: reversalLines
    })

    return entryId
  } catch (err) {
    console.error('reverseJournalEntry error:', err)
    return null
  }
}