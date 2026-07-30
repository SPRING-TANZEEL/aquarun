import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../supabase'

// ═══════════════════════════════════════════════════════════
// PROJECTION ENGINE — Weighted Moving Average + Day Pattern
// ═══════════════════════════════════════════════════════════

function calcCustomerStats(deliveries) {
  if (!deliveries || deliveries.length < 2) return null
  const sorted = [...deliveries]
    .filter(d => d.qty_19l > 0)
    .sort((a, b) => new Date(a.delivered_at) - new Date(b.delivered_at))
  if (sorted.length < 2) return null

  const gaps = [], rates = [], dayOfWeekCounts = {}
  for (let i = 1; i < sorted.length; i++) {
    const gap = (new Date(sorted[i].delivered_at) - new Date(sorted[i - 1].delivered_at)) / 86400000
    if (gap > 0 && gap < 60) {
      gaps.push(gap)
      rates.push(sorted[i - 1].qty_19l / gap)
    }
    const dow = new Date(sorted[i].delivered_at).getDay()
    dayOfWeekCounts[dow] = (dayOfWeekCounts[dow] || 0) + 1
  }
  if (gaps.length === 0) return null

  // Weighted moving average — recent gaps weighted more
  const weights = gaps.map((_, i) => {
    const recency = i / (gaps.length - 1) // 0=oldest, 1=newest
    return 0.1 + recency * 0.9 // weight range: 0.1 to 1.0
  })
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  const weightedGap = gaps.reduce((s, g, i) => s + g * weights[i], 0) / totalWeight
  const weightedRate = rates.reduce((s, r, i) => s + r * weights[i], 0) / totalWeight

  // Qty trend: compare recent average to older average
  const mid = Math.floor(sorted.length / 2)
  const recentAvgQty = sorted.slice(mid).reduce((s, d) => s + d.qty_19l, 0) / (sorted.length - mid)
  const olderAvgQty = sorted.slice(0, mid).reduce((s, d) => s + d.qty_19l, 0) / mid
  const qtyTrend = recentAvgQty - olderAvgQty // positive = increasing demand

  // Day of week pattern strength
  const totalDeliveries = sorted.length
  const dominantDow = Object.entries(dayOfWeekCounts).sort((a, b) => b[1] - a[1])[0]
  const dayPatternStrength = dominantDow ? dominantDow[1] / totalDeliveries : 0

  // Confidence: high if many deliveries + low variance in gaps
  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length
  const variance = gaps.reduce((s, g) => s + Math.pow(g - avgGap, 2), 0) / gaps.length
  const cv = Math.sqrt(variance) / avgGap // coefficient of variation
  let confidence = 'low'
  if (totalDeliveries >= 8 && cv < 0.25) confidence = 'high'
  else if (totalDeliveries >= 4 && cv < 0.5) confidence = 'medium'

  const last = sorted[sorted.length - 1]
  return {
    avgGap: +weightedGap.toFixed(1),
    avgRate: +weightedRate.toFixed(3),
    lastDeliveredAt: last.delivered_at,
    lastQty19l: last.qty_19l,
    totalDeliveries,
    confidence,
    qtyTrend: +qtyTrend.toFixed(2),
    dayPatternStrength: +dayPatternStrength.toFixed(2),
    dominantDow: dominantDow ? Number(dominantDow[0]) : null,
  }
}

function getProjection(stats) {
  if (!stats) return { key: 'nodata', label: 'No Data', daysLeft: null, daysAgo: null, confidence: 'low' }
  const today = new Date()
  const last = new Date(stats.lastDeliveredAt)
  const daysAgo = (today - last) / 86400000

  // Adjust last qty with trend
  const trendAdjustedQty = Math.max(1, stats.lastQty19l + stats.qtyTrend * 0.5)
  const remaining = trendAdjustedQty - daysAgo * stats.avgRate
  const daysLeft = remaining / stats.avgRate

  if (remaining <= 0)                    return { key: 'ranout', label: 'Ran Out',     daysLeft: +daysLeft.toFixed(1), daysAgo: +daysAgo.toFixed(1), confidence: stats.confidence }
  if (remaining <= stats.avgRate * 1.2)  return { key: 'today',  label: 'Needs Today', daysLeft: +daysLeft.toFixed(1), daysAgo: +daysAgo.toFixed(1), confidence: stats.confidence }
  if (remaining <= stats.avgRate * 2.5)  return { key: 'soon',   label: 'Needs Soon',  daysLeft: +daysLeft.toFixed(1), daysAgo: +daysAgo.toFixed(1), confidence: stats.confidence }
  return                                  { key: 'ok',     label: 'Sufficient',  daysLeft: +daysLeft.toFixed(1), daysAgo: +daysAgo.toFixed(1), confidence: stats.confidence }
}

function formatDaysLeft(proj) {
  if (!proj || proj.daysLeft === null) return '—'
  if (proj.daysLeft <= 0) return `${Math.abs(Math.round(proj.daysLeft))}d overdue`
  return `~${proj.daysLeft.toFixed(1)}d left`
}

function countByKey(customers) {
  const c = { all: customers.length, ranout: 0, today: 0, soon: 0, ok: 0, nodata: 0 }
  customers.forEach(x => { if (c[x.proj?.key] !== undefined) c[x.proj.key]++ })
  return c
}

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const STATUS_COLORS = {
  pending:   { bg: '#fff3e0', color: '#e65100', label: 'Pending',   icon: '⏳' },
  assigned:  { bg: '#e3f0ff', color: '#0f4c81', label: 'Assigned',  icon: '🚴' },
  completed: { bg: '#e8f5e9', color: '#1a7a4a', label: 'Completed', icon: '✅' },
  cancelled: { bg: '#ffebee', color: '#c62828', label: 'Cancelled', icon: '✕'  },
}

const PROJ_STYLE = {
  ranout: { bg: '#ffebee', color: '#c62828', border: '#fecaca', dot: '#c62828' },
  today:  { bg: '#fff3e0', color: '#e65100', border: '#fed7aa', dot: '#e65100' },
  soon:   { bg: '#fff8e1', color: '#b45309', border: '#fde68a', dot: '#b45309' },
  ok:     { bg: '#e8f5e9', color: '#1a7a4a', border: '#bbf7d0', dot: '#1a7a4a' },
  nodata: { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0', dot: '#94a3b8' },
}

const CONFIDENCE_STYLE = {
  high:   { color: '#1a7a4a', bg: '#e8f5e9', label: '🟢 High'   },
  medium: { color: '#b45309', bg: '#fff8e1', label: '🟡 Medium' },
  low:    { color: '#c62828', bg: '#ffebee', label: '🔴 Low'    },
}

const BULK_TABS = [
  { key: 'all',    label: 'All'          },
  { key: 'ranout', label: 'Ran Out'      },
  { key: 'today',  label: 'Needs Today'  },
  { key: 'soon',   label: 'Needs Soon'   },
  { key: 'ok',     label: 'Sufficient'   },
  { key: 'nodata', label: 'No Data'      },
]

const TAB_COLORS = {
  all: '#0f4c81', ranout: '#c62828', today: '#e65100',
  soon: '#b45309', ok: '#1a7a4a', nodata: '#64748b',
}

const SOURCE_LABEL = {
  portal:    { label: 'Customer Portal', color: '#7c3aed', bg: '#f3e8ff' },
  admin:     { label: 'Admin',           color: '#0f4c81', bg: '#e3f0ff' },
  bulk:      { label: 'Bulk Generated',  color: '#1a7a4a', bg: '#e8f5e9' },
  recurring: { label: 'Recurring',       color: '#b45309', bg: '#fff8e1' },
}

const inp = {
  width: '100%', padding: '10px 12px', border: '1.5px solid #e0e0e0',
  borderRadius: '8px', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  background: 'white', color: '#333',
}

// ═══════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════

function ProjBadge({ proj }) {
  if (!proj) return null
  const s = PROJ_STYLE[proj.key] || PROJ_STYLE.nodata
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      color: s.color, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, display: 'inline-block', flexShrink: 0 }} />
      {proj.label}
    </span>
  )
}

function ConfidenceBadge({ confidence }) {
  if (!confidence) return null
  const s = CONFIDENCE_STYLE[confidence] || CONFIDENCE_STYLE.low
  return (
    <span style={{
      fontSize: 10, padding: '2px 6px', borderRadius: 6, fontWeight: 600,
      color: s.color, background: s.bg, whiteSpace: 'nowrap',
    }}>{s.label}</span>
  )
}

function StatPill({ label, value, color, bg, active, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: active ? color : bg, border: `1px solid ${color}44`,
      borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '10px 12px',
      cursor: 'pointer', flex: '1 1 70px', minWidth: 65, transition: 'all 0.15s',
    }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: active ? '#fff' : color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: active ? '#ffffffcc' : '#666', marginTop: 2, lineHeight: 1.3 }}>{label}</div>
    </div>
  )
}

// Daily Summary Banner
function DailySummary({ orders, riders, isMobile }) {
  const today = new Date().toISOString().split('T')[0]
  const todayOrders = orders.filter(o => o.delivery_date === today || !o.delivery_date)
  const pending = todayOrders.filter(o => o.status === 'pending').length
  const assigned = todayOrders.filter(o => o.status === 'assigned').length
  const completed = todayOrders.filter(o => o.status === 'completed').length
  const total19l = todayOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (o.qty_19l || 0), 0)
  const totalHalf = todayOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (o.qty_half_litre || 0), 0)
  const total15l = todayOrders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (o.qty_1_5l || 0), 0)

  // Per rider breakdown
  const riderBreakdown = {}
  todayOrders.filter(o => o.status === 'assigned' || o.status === 'completed').forEach(o => {
    const rname = o.riders?.full_name || 'Unassigned'
    if (!riderBreakdown[rname]) riderBreakdown[rname] = { orders: 0, bottles19l: 0 }
    riderBreakdown[rname].orders++
    riderBreakdown[rname].bottles19l += o.qty_19l || 0
  })

  if (todayOrders.length === 0) return null

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f4c81 0%, #1a6bad 100%)',
      borderRadius: 12, padding: '16px 20px', marginBottom: 16,
      boxShadow: '0 4px 16px rgba(15,76,129,0.25)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: 0 }}>📋 Today's Summary</p>
          <p style={{ color: '#93c5fd', fontSize: 11, margin: '2px 0 0' }}>
            {new Date().toLocaleDateString('en-PK', { weekday: 'long', day: '2-digit', month: 'long' })}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ color: '#fff', fontWeight: 800, fontSize: 22, margin: 0, lineHeight: 1 }}>{todayOrders.filter(o => o.status !== 'cancelled').length}</p>
          <p style={{ color: '#93c5fd', fontSize: 10, margin: 0 }}>Total Orders</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(3,1fr)' : 'repeat(6,1fr)', gap: 8, marginBottom: 12 }}>
        {[
          { label: 'Pending',   value: pending,   color: '#fbbf24' },
          { label: 'Assigned',  value: assigned,  color: '#60a5fa' },
          { label: 'Done',      value: completed, color: '#34d399' },
          { label: '19L Btls',  value: total19l,  color: '#a78bfa' },
          { label: 'Half Btls', value: totalHalf, color: '#f9a8d4' },
          { label: '1.5L Btls',  value: total15l,  color: '#fdba74' },
        ].map(s => (
          <div key={s.label} style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
            <p style={{ color: s.color, fontWeight: 800, fontSize: 18, margin: 0, lineHeight: 1 }}>{s.value}</p>
            <p style={{ color: '#cbd5e1', fontSize: 10, margin: '3px 0 0' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {Object.keys(riderBreakdown).length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(riderBreakdown).map(([name, data]) => (
            <div key={name} style={{
              background: 'rgba(255,255,255,0.15)', borderRadius: 6,
              padding: '5px 10px', display: 'flex', gap: 6, alignItems: 'center',
            }}>
              <span style={{ fontSize: 12 }}>🚴</span>
              <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>{name}</span>
              <span style={{ color: '#93c5fd', fontSize: 11 }}>{data.orders} orders · {data.bottles19l} btls</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Transfer Rider Modal
function TransferRiderModal({ riders, onConfirm, onCancel, saving, mode, sourceRiderName }) {
  const [targetRiderId, setTargetRiderId] = useState('')
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, color: '#1a1a2e' }}>🔄 Transfer Orders</h3>
            {mode === 'rider' && sourceRiderName && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>
                Transfer all orders from <strong>{sourceRiderName}</strong> to another rider
              </p>
            )}
            {mode === 'selected' && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>Reassign selected orders to a different rider</p>
            )}
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#888' }}>✕</button>
        </div>

        <p style={{ fontSize: 12, color: '#555', marginBottom: 10 }}>Select destination rider:</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {riders.map(r => (
            <div key={r.id} onClick={() => setTargetRiderId(r.id)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
              borderRadius: 10, cursor: 'pointer', transition: 'all 0.12s',
              border: targetRiderId === r.id ? '2px solid #0f4c81' : '1.5px solid #e0e0e0',
              background: targetRiderId === r.id ? '#e3f0ff' : '#fafafa',
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: targetRiderId === r.id ? '#0f4c81' : '#f0f0f0',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
                color: targetRiderId === r.id ? '#fff' : '#888',
              }}>🚴</div>
              <span style={{ fontWeight: 600, fontSize: 14, color: '#1a1a2e', flex: 1 }}>
                {r.full_name} {r.is_main_rider ? '⭐' : ''}
              </span>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                border: targetRiderId === r.id ? '6px solid #0f4c81' : '2px solid #ddd',
                background: '#fff', transition: 'all 0.12s',
              }} />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '12px', borderRadius: 10, border: '1.5px solid #e0e0e0',
            background: '#fff', color: '#555', fontWeight: 600, cursor: 'pointer', fontSize: 14,
          }}>Cancel</button>
          <button onClick={() => targetRiderId && onConfirm(targetRiderId)} disabled={!targetRiderId || saving} style={{
            flex: 2, padding: '12px', borderRadius: 10, border: 'none',
            background: targetRiderId ? '#0f4c81' : '#e0e0e0',
            color: targetRiderId ? '#fff' : '#aaa',
            fontWeight: 700, cursor: targetRiderId ? 'pointer' : 'not-allowed', fontSize: 14,
          }}>{saving ? 'Transferring...' : '✓ Transfer Orders'}</button>
        </div>
      </div>
    </div>
  )
}

// Rider assign popup for bulk
function RiderPopup({ riders, selectedIds, onConfirm, onCancel, saving, ridersMap }) {
  const [riderId, setRiderId] = useState('')
  const suggested = (() => {
    const freq = {}
    selectedIds.forEach(id => { const r = ridersMap[id]; if (r) freq[r] = (freq[r] || 0) + 1 })
    if (Object.keys(freq).length === 0) return null
    return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]
  })()
  useEffect(() => { if (suggested && !riderId) setRiderId(suggested) }, [suggested])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 20px 32px',
        width: '100%', maxWidth: 480, boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
      }}>
        <div style={{ width: 36, height: 4, background: '#ddd', borderRadius: 2, margin: '0 auto 18px' }} />
        <h3 style={{ margin: '0 0 4px', fontSize: 16, color: '#1a1a2e' }}>Assign Rider</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#888' }}>
          Generating orders for <strong>{selectedIds.length} customers</strong>
        </p>
        {suggested && (
          <div style={{ background: '#e3f0ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#0f4c81' }}>
            💡 Previously used rider suggested
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {riders.map(r => (
            <div key={r.id} onClick={() => setRiderId(r.id)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
              border: riderId === r.id ? '2px solid #0f4c81' : '1.5px solid #e0e0e0',
              background: riderId === r.id ? '#e3f0ff' : '#fafafa', transition: 'all 0.12s',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: riderId === r.id ? '#0f4c81' : '#f0f0f0',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                color: riderId === r.id ? '#fff' : '#888',
              }}>🚴</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#1a1a2e' }}>{r.full_name} {r.is_main_rider ? '⭐' : ''}</div>
                {suggested === r.id && <div style={{ fontSize: 11, color: '#0f4c81', marginTop: 1 }}>Previously assigned to these customers</div>}
              </div>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                border: riderId === r.id ? '6px solid #0f4c81' : '2px solid #ddd',
                background: '#fff', transition: 'all 0.12s',
              }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: '1.5px solid #e0e0e0', background: '#fff', color: '#555', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
          <button onClick={() => riderId && onConfirm(riderId)} disabled={!riderId || saving} style={{
            flex: 2, padding: '12px 0', borderRadius: 10, border: 'none',
            background: riderId ? '#1a7a4a' : '#e0e0e0', color: riderId ? '#fff' : '#aaa',
            fontWeight: 700, cursor: riderId ? 'pointer' : 'not-allowed', fontSize: 14,
          }}>{saving ? 'Generating...' : `✓ Generate ${selectedIds.length} Orders`}</button>
        </div>
      </div>
    </div>
  )
}

function ResultModal({ created, skipped, riderName, onClose, onAnother }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 20px 36px', width: '100%', maxWidth: 480, textAlign: 'center', boxShadow: '0 -8px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ width: 36, height: 4, background: '#ddd', borderRadius: 2, margin: '0 auto 20px' }} />
        <div style={{ fontSize: 44, marginBottom: 10 }}>✅</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a2e', marginBottom: 4 }}>{created} Orders Created</div>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>Assigned to <strong>{riderName}</strong></div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>{new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
        {skipped > 0 && (
          <div style={{ fontSize: 12, color: '#e65100', background: '#fff3e0', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 12px', marginBottom: 16, textAlign: 'left' }}>
            ⚠ {skipped} skipped — already had an order today
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onAnother} style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: '1.5px solid #e0e0e0', background: '#fff', color: '#555', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>New Batch</button>
          <button onClick={onClose} style={{ flex: 1, padding: '12px 0', borderRadius: 10, border: 'none', background: '#0f4c81', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>View Orders</button>
        </div>
      </div>
    </div>
  )
}

// Mobile customer card for bulk view
function CustomerCard({ c, isSelected, onToggle }) {
  const s = PROJ_STYLE[c.proj?.key] || PROJ_STYLE.nodata
  return (
    <div onClick={onToggle} style={{
      background: isSelected ? '#e3f0ff' : '#fff',
      border: isSelected ? '2px solid #0f4c81' : '1px solid #eee',
      borderRadius: 10, padding: '12px 14px', marginBottom: 8,
      display: 'flex', alignItems: 'flex-start', gap: 10,
      cursor: 'pointer', transition: 'all 0.12s',
    }}>
      <input type="checkbox" checked={isSelected} onChange={onToggle}
        onClick={e => e.stopPropagation()}
        style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, accentColor: '#0f4c81' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</p>
          <ProjBadge proj={c.proj} />
        </div>
        {c.address && <p style={{ fontSize: 11, color: '#888', margin: '2px 0 0' }}>📍 {c.address}</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap', fontSize: 11, color: '#888' }}>
          {c.mobile && <span>📱 {c.mobile}</span>}
          {c.stats?.lastDeliveredAt
            ? <span>🚚 {new Date(c.stats.lastDeliveredAt).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })}</span>
            : <span style={{ color: '#ccc' }}>No deliveries yet</span>}
          {c.stats && <span>Every {c.stats.avgGap}d</span>}
          {c.proj?.daysLeft !== null && <span style={{ fontWeight: 600, color: s.color }}>{formatDaysLeft(c.proj)}</span>}
        </div>
        {c.stats?.dominantDow !== null && c.stats?.dayPatternStrength > 0.4 && (
          <p style={{ fontSize: 10, color: '#7c3aed', margin: '3px 0 0' }}>
            📅 Usually orders on {DAYS[c.stats.dominantDow]}s
          </p>
        )}
        {c.lastRiderName && <div style={{ marginTop: 4, fontSize: 11, color: '#0f4c81' }}>🚴 Usually: {c.lastRiderName}</div>}
        <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {(c.default_qty_19l || 0) > 0 && <span style={{ fontSize: 10, background: '#e3f0ff', color: '#0f4c81', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>19L×{c.default_qty_19l}</span>}
          {(c.default_qty_half || 0) > 0 && <span style={{ fontSize: 10, background: '#e8f5e9', color: '#1a7a4a', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>½L×{c.default_qty_half}</span>}
          {(c.default_qty_1_5l || 0) > 0 && <span style={{ fontSize: 10, background: '#fff3e0', color: '#e65100', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>1.5L×{c.default_qty_1_5l}</span>}
          {c.stats && <ConfidenceBadge confidence={c.proj?.confidence} />}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export default function Orders({ tenantId, hasMapFeature = false }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  // ── order state ──
  const [orders, setOrders]                   = useState([])
  const [riders, setRiders]                   = useState([])
  const [loading, setLoading]                 = useState(true)
  const [filter, setFilter]                   = useState('pending')
  const today = new Date().toISOString().split('T')[0]
  const [dateFrom, setDateFrom]               = useState(today)
  const [dateTo, setDateTo]                   = useState(today)
  const [selectedOrders, setSelectedOrders]   = useState([])
  const [assignRiderId, setAssignRiderId]     = useState('')
  const [assigning, setAssigning]             = useState(false)
  const [showAddForm, setShowAddForm]         = useState(false)
  const [form, setForm]                       = useState({
    customer_id: '', qty_19l: 0, qty_half_litre: 0, qty_1_5l: 0,
    delivery_date: new Date().toISOString().split('T')[0], notes: '', is_priority: false,
  })
  const [saving, setSaving]                   = useState(false)
  const [customerSearch, setCustomerSearch]   = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  // ── transfer state ──
  const [showTransfer, setShowTransfer]       = useState(false)
  const [transferMode, setTransferMode]       = useState('selected') // 'selected' | 'rider'
  const [transferSourceRider, setTransferSourceRider] = useState(null)
  const [transferring, setTransferring]       = useState(false)
  const [transferRiderFilter, setTransferRiderFilter] = useState('all')

  // ── bulk state ──
  const [allCustomers, setAllCustomers]       = useState([])
  const [bulkLoading, setBulkLoading]         = useState(false)
  const [bulkSearch, setBulkSearch]           = useState('')
  const [bulkTab, setBulkTab]                 = useState('all')
  const [bulkRiderFilter, setBulkRiderFilter] = useState('all')
  const [bulkSelected, setBulkSelected]       = useState(new Set())
  const [showRiderPopup, setShowRiderPopup]   = useState(false)
  const [bulkSaving, setBulkSaving]           = useState(false)
  const [bulkResult, setBulkResult]           = useState(null)
  const [lastRiderMap, setLastRiderMap]       = useState({})
  const [bulkSort, setBulkSort]               = useState('lastDelivery')
  const [bulkSortDir, setBulkSortDir]         = useState('asc')

  // ── effects ──
  useEffect(() => { if (tenantId) { fetchOrders(); fetchRiders() } }, [filter, tenantId, dateFrom, dateTo])
  useEffect(() => { if (tenantId && filter === 'bulk') fetchBulkData() }, [tenantId, filter])

  // ── data fetching ──
  async function fetchOrders() {
    setLoading(true)
    let q = supabase
      .from('orders')
      .select('*, customers(full_name, mobile, customer_code, address, delivery_notes, rate_19l, balance, latitude, longitude), riders(full_name, id)')
      .eq('tenant_id', tenantId)
      .gte('delivery_date', dateFrom)
      .lte('delivery_date', dateTo)
      .order('is_priority', { ascending: false })
      .order('created_at', { ascending: false })
    if (filter !== 'all' && filter !== 'bulk') q = q.eq('status', filter)
    const { data } = await q
    setOrders(data || [])
    setSelectedOrders([])
    setLoading(false)
  }

  async function fetchRiders() {
    const { data } = await supabase.from('riders')
      .select('*').eq('tenant_id', tenantId).eq('is_active', true)
    setRiders(data || [])
  }

  async function searchCustomer(val) {
    setCustomerSearch(val)
    if (val.length < 2) { setCustomerResults([]); return }
    const { data } = await supabase.from('customer_balances').select('*')
      .eq('tenant_id', tenantId).eq('is_active', true)
      .or(`full_name.ilike.%${val}%,mobile.ilike.%${val}%,customer_code.ilike.%${val}%`).limit(5)
    setCustomerResults(data || [])
  }

  // ── order actions ──
  function toggleSelectOrder(id) {
    setSelectedOrders(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggleSelectAll() {
    if (selectedOrders.length === orders.length) setSelectedOrders([])
    else setSelectedOrders(orders.map(o => o.id))
  }

  async function togglePriority(order) {
    const newVal = !order.is_priority
    await supabase.from('orders').update({ is_priority: newVal }).eq('id', order.id).eq('tenant_id', tenantId)
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, is_priority: newVal } : o))
  }

  async function assignOrders() {
    if (!assignRiderId) return alert('Please select a rider')
    if (!selectedOrders.length) return alert('Please select at least one order')
    setAssigning(true)
    const { error } = await supabase.from('orders')
      .update({ rider_id: assignRiderId, status: 'assigned', assigned_at: new Date().toISOString() })
      .in('id', selectedOrders).eq('tenant_id', tenantId)
    if (error) { alert('Error: ' + error.message); setAssigning(false); return }
    setSelectedOrders([]); setAssignRiderId(''); fetchOrders(); setAssigning(false)
  }

  async function cancelOrder(id) {
    if (!window.confirm('Cancel this order?')) return
    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', id).eq('tenant_id', tenantId)
    fetchOrders()
  }

  async function saveOrder() {
    if (!selectedCustomer) return alert('Please select a customer')
    if (!form.qty_19l && !form.qty_half_litre && !form.qty_1_5l) return alert('Please enter at least one bottle quantity')
    setSaving(true)
    const { error } = await supabase.from('orders').insert([{
      tenant_id: tenantId,
      customer_id: selectedCustomer.id,
      qty_19l: form.qty_19l,
      qty_half_litre: form.qty_half_litre,
      qty_1_5l: form.qty_1_5l,
      delivery_date: form.delivery_date,
      notes: form.notes || selectedCustomer.delivery_notes || '',
      status: 'pending',
      source: 'admin',
      is_priority: form.is_priority,
    }])
    if (error) { alert('Error: ' + error.message); setSaving(false); return }
    setShowAddForm(false); setSelectedCustomer(null); setCustomerSearch('')
    setForm({ customer_id: '', qty_19l: 0, qty_half_litre: 0, qty_1_5l: 0, delivery_date: new Date().toISOString().split('T')[0], notes: '', is_priority: false })
    fetchOrders(); setSaving(false)
  }

  // ── transfer functions ──
  async function handleTransfer(targetRiderId) {
    setTransferring(true)
    let orderIds = []
    if (transferMode === 'selected') {
      orderIds = selectedOrders
    } else if (transferMode === 'rider' && transferSourceRider) {
      const toTransfer = orders.filter(o => o.riders?.id === transferSourceRider.id && (o.status === 'assigned' || o.status === 'pending'))
      orderIds = toTransfer.map(o => o.id)
    }
    if (orderIds.length === 0) { alert('No orders to transfer'); setTransferring(false); return }
    const { error } = await supabase.from('orders')
      .update({
        rider_id: targetRiderId,
        assigned_rider_id: targetRiderId,
        transferred_from_rider_id: transferSourceRider?.id || null,
        status: 'assigned',
        assigned_at: new Date().toISOString(),
      })
      .in('id', orderIds).eq('tenant_id', tenantId)
    if (error) { alert('Error: ' + error.message); setTransferring(false); return }
    setShowTransfer(false); setSelectedOrders([]); setTransferSourceRider(null)
    fetchOrders(); setTransferring(false)
  }

  function openTransferForRider(rider) {
    setTransferMode('rider')
    setTransferSourceRider(rider)
    setShowTransfer(true)
  }

  function openTransferForSelected() {
    if (selectedOrders.length === 0) return alert('Select orders first')
    setTransferMode('selected')
    setTransferSourceRider(null)
    setShowTransfer(true)
  }

  // ── WhatsApp notification ──
  function googleMapsNavLink(lat, lng, address) {
    if (lat && lng) return `https://www.google.com/maps?q=${lat},${lng}`
    return `https://www.google.com/maps/search/${encodeURIComponent(address)}`
  }

  function generateRouteLink(riderId) {
    const riderOrders = orders.filter(o => o.riders?.id === riderId && o.status === 'assigned')
    const validStops = riderOrders
      .filter(o => o.customers?.latitude || o.customers?.address)
      .map(o => o.customers?.latitude && o.customers?.longitude
        ? `${o.customers.latitude},${o.customers.longitude}`
        : o.customers.address)
    if (validStops.length === 0) return null
    // Max 9 stops for Google Maps navigation to work with Start button
    const limited = validStops.slice(0, 9)
    return `https://www.google.com/maps/dir/${limited.map(s => encodeURIComponent(s)).join('/')}`
  }

  function notifyRider(rider, mode = 'whatsapp') {
    if (!rider) return
    const riderOrders = orders.filter(o => o.riders?.id === rider.id && o.status === 'assigned')
    const total19l = riderOrders.reduce((s, o) => s + (o.qty_19l || 0), 0)
    const summary = riderOrders.map(o => `• ${o.customers?.full_name}${o.customers?.address ? ` — ${o.customers.address}` : ''} — ${[o.qty_19l > 0 && `19L×${o.qty_19l}`, o.qty_half_litre > 0 && `½L×${o.qty_half_litre}`].filter(Boolean).join(' ')}`).join('\n')
    const routeLink = hasMapFeature ? generateRouteLink(rider.id) : null
    const msg = `🚴 Delivery Orders for Today\n\n${summary}\n\nTotal 19L: ${total19l} bottles${routeLink ? `\n\n🗺️ Route Map:\n${routeLink}` : ''}\n\nPlease confirm receipt.`
    if (mode === 'whatsapp') {
      const phone = (rider.mobile || '').replace(/\D/g, '')
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
    }
    if (mode === 'copy') {
      navigator.clipboard.writeText(msg).then(() => {
        alert(`✅ Copied! Paste in ${rider.full_name}'s WhatsApp chat.`)
      }).catch(() => {
        prompt(`Copy this message:`, msg)
      })
    }
  }

  // ── bulk data fetch ──
  async function fetchBulkData() {
    setBulkLoading(true)
    setBulkSelected(new Set())

    const today = new Date().toISOString().split('T')[0]

    // Already ordered today
    const { data: todayOrders } = await supabase.from('orders').select('customer_id')
      .eq('tenant_id', tenantId).eq('delivery_date', today)
      .in('status', ['pending', 'assigned'])

    const alreadyOrderedSet = new Set((todayOrders || []).map(o => o.customer_id))

    const { data: customers } = await supabase
      .from('customers')
      .select('id, full_name, mobile, address, delivery_notes, default_qty_19l, default_qty_half, default_qty_1_5l, customer_code, balance')
      .eq('tenant_id', tenantId).eq('is_active', true).order('full_name')

    if (!customers) { setBulkLoading(false); return }

    const { data: deliveries } = await supabase
      .from('deliveries')
      .select('customer_id, delivered_at, qty_19l, rider_id, delivery_lat, delivery_lng')
      .eq('tenant_id', tenantId).eq('is_voided', false)
      .order('delivered_at', { ascending: false })

    const delivMap = {}, riderMap = {}
    ;(deliveries || []).forEach(d => {
      if (!delivMap[d.customer_id]) delivMap[d.customer_id] = []
      delivMap[d.customer_id].push(d)
      if (!riderMap[d.customer_id] && d.rider_id) riderMap[d.customer_id] = d.rider_id
    })

    const { data: riderList } = await supabase.from('riders').select('id, full_name').eq('tenant_id', tenantId)
    const riderNameMap = {}
    ;(riderList || []).forEach(r => { riderNameMap[r.id] = r.full_name })

    const enriched = customers
      .filter(c => !alreadyOrderedSet.has(c.id)) // exclude already ordered
      .map(c => {
        const hist = delivMap[c.id] || []
        const stats = calcCustomerStats(hist)
        const proj = getProjection(stats)
        const lastRiderId = riderMap[c.id] || null
        // Route: get last GPS from deliveries
        const lastDelivWithGps = hist.find(d => d.delivery_lat && d.delivery_lng)
        return {
          ...c,
          stats,
          proj,
          deliveryCount: hist.length,
          lastRiderId,
          lastRiderName: lastRiderId ? riderNameMap[lastRiderId] : null,
          lastLat: lastDelivWithGps?.delivery_lat || null,
          lastLng: lastDelivWithGps?.delivery_lng || null,
          alreadyOrdered: alreadyOrderedSet.has(c.id),
        }
      })

    setAllCustomers(enriched)
    setLastRiderMap(riderMap)
    setBulkLoading(false)
  }

  // ── bulk derived ──
  const projCounts = useMemo(() => countByKey(allCustomers), [allCustomers])

  const filteredBulk = useMemo(() => {
    let list = bulkTab === 'all' ? allCustomers : allCustomers.filter(c => c.proj?.key === bulkTab)
    if (bulkRiderFilter !== 'all') list = list.filter(c => c.lastRiderId === bulkRiderFilter)
    if (bulkSort === 'lastDelivery') {
      list = [...list].sort((a, b) => {
        const aDate = a.stats?.lastDeliveredAt ? new Date(a.stats.lastDeliveredAt) : new Date(0)
        const bDate = b.stats?.lastDeliveredAt ? new Date(b.stats.lastDeliveredAt) : new Date(0)
        return bulkSortDir === 'asc' ? aDate - bDate : bDate - aDate
      })
    } else if (bulkSort === 'rider') {
      list = [...list].sort((a, b) => {
        const aName = a.lastRiderName || 'zzz'
        const bName = b.lastRiderName || 'zzz'
        return bulkSortDir === 'asc' ? aName.localeCompare(bName) : bName.localeCompare(aName)
      })
    }
    if (bulkSearch) {
      const q = bulkSearch.toLowerCase()
      list = list.filter(c =>
        c.full_name?.toLowerCase().includes(q) ||
        c.mobile?.toLowerCase().includes(q) ||
        c.address?.toLowerCase().includes(q)
      )
    }
    // Route optimization: sort by GPS proximity if same rider filter
    if (bulkRiderFilter !== 'all') {
      const withGps = list.filter(c => c.lastLat && c.lastLng)
      const withoutGps = list.filter(c => !c.lastLat || !c.lastLng)
      if (withGps.length > 1) {
        // Simple nearest-neighbor sort from first point
        const sorted = [withGps[0]]
        const remaining = withGps.slice(1)
        while (remaining.length > 0) {
          const last = sorted[sorted.length - 1]
          let nearest = 0, minDist = Infinity
          remaining.forEach((c, i) => {
            const dist = Math.pow(c.lastLat - last.lastLat, 2) + Math.pow(c.lastLng - last.lastLng, 2)
            if (dist < minDist) { minDist = dist; nearest = i }
          })
          sorted.push(remaining.splice(nearest, 1)[0])
        }
        list = [...sorted, ...withoutGps]
      }
    }
    return list
  }, [allCustomers, bulkTab, bulkRiderFilter, bulkSearch, bulkSort, bulkSortDir])

  const allBulkChecked = filteredBulk.length > 0 && filteredBulk.every(c => bulkSelected.has(c.id))
  const someBulkChecked = filteredBulk.some(c => bulkSelected.has(c.id)) && !allBulkChecked

  function toggleBulkAll() {
    const n = new Set(bulkSelected)
    if (allBulkChecked) filteredBulk.forEach(c => n.delete(c.id))
    else filteredBulk.forEach(c => n.add(c.id))
    setBulkSelected(n)
  }
  function toggleBulkOne(id) {
    const n = new Set(bulkSelected)
    n.has(id) ? n.delete(id) : n.add(id)
    setBulkSelected(n)
  }
  function autoSelectUrgent() {
    const n = new Set(bulkSelected)
    allCustomers.filter(c => c.proj?.key === 'ranout' || c.proj?.key === 'today').forEach(c => n.add(c.id))
    setBulkSelected(n)
  }

  const selectedBulkCustomers = allCustomers.filter(c => bulkSelected.has(c.id))
  const totalQty19l  = selectedBulkCustomers.reduce((s, c) => s + (c.default_qty_19l  || 0), 0)
  const totalQtyHalf = selectedBulkCustomers.reduce((s, c) => s + (c.default_qty_half || 0), 0)
  const totalQty15l  = selectedBulkCustomers.reduce((s, c) => s + (c.default_qty_1_5l || 0), 0)

  const selectedRiderHistoryMap = useMemo(() => {
    const m = {}
    selectedBulkCustomers.forEach(c => { if (c.lastRiderId) m[c.id] = c.lastRiderId })
    return m
  }, [bulkSelected, allCustomers])

  async function generateOrders(riderId) {
    setBulkSaving(true)
    const today = new Date().toISOString().split('T')[0]
    const { data: existing } = await supabase.from('orders').select('customer_id')
      .eq('tenant_id', tenantId).eq('delivery_date', today)
      .in('customer_id', selectedBulkCustomers.map(c => c.id))
    const alreadyOrdered = new Set((existing || []).map(o => o.customer_id))
    const toCreate = selectedBulkCustomers.filter(c => !alreadyOrdered.has(c.id))
    const skipped  = selectedBulkCustomers.length - toCreate.length
    if (toCreate.length > 0) {
      const { error } = await supabase.from('orders').insert(
        toCreate.map(c => ({
          tenant_id: tenantId,
          customer_id: c.id,
          rider_id: riderId,
          qty_19l: c.default_qty_19l || 0,
          qty_half_litre: c.default_qty_half || 0,
          qty_1_5l: c.default_qty_1_5l || 0,
          delivery_date: today,
          status: 'assigned',
          source: 'bulk',
          assigned_at: new Date().toISOString(),
          notes: c.delivery_notes || '',
        }))
      )
      if (error) { alert('Error: ' + error.message); setBulkSaving(false); return }
    }
    const riderName = riders.find(r => r.id === riderId)?.full_name || ''
    setBulkSaving(false); setShowRiderPopup(false)
    setBulkResult({ created: toCreate.length, skipped, riderName })
  }

  function resetBulk() { setBulkSelected(new Set()); setBulkResult(null); fetchBulkData() }
  function handleViewOrders() { setBulkResult(null); setFilter('assigned') }

  // Unique riders with assigned orders today
  const ridersWithOrders = useMemo(() => {
    const map = {}
    orders.filter(o => o.status === 'assigned' && o.riders).forEach(o => {
      if (!map[o.riders.id]) map[o.riders.id] = { ...o.riders, orderCount: 0 }
      map[o.riders.id].orderCount++
    })
    return Object.values(map)
  }, [orders])

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Modals */}
      {showRiderPopup && (
        <RiderPopup riders={riders} selectedIds={[...bulkSelected]} ridersMap={selectedRiderHistoryMap}
          onConfirm={generateOrders} onCancel={() => setShowRiderPopup(false)} saving={bulkSaving} />
      )}
      {bulkResult && (
        <ResultModal created={bulkResult.created} skipped={bulkResult.skipped}
          riderName={bulkResult.riderName} onClose={handleViewOrders} onAnother={resetBulk} />
      )}
      {showTransfer && (
        <TransferRiderModal
          riders={riders.filter(r => r.id !== transferSourceRider?.id)}
          onConfirm={handleTransfer} onCancel={() => setShowTransfer(false)}
          saving={transferring} mode={transferMode} sourceRiderName={transferSourceRider?.full_name}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, color: '#1a1a2e', fontWeight: 800 }}>📦 Orders</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888' }}>Manage deliveries, routes and riders</p>
        </div>
        {filter !== 'bulk' && (
          <button onClick={() => setShowAddForm(!showAddForm)} style={{
            padding: '10px 20px', background: showAddForm ? '#6b7280' : '#0f4c81', color: 'white',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>{showAddForm ? '✕ Cancel' : '+ New Order'}</button>
        )}
      </div>

      {/* Daily Summary */}
      {filter !== 'bulk' && orders.length > 0 && (
        <DailySummary orders={orders} riders={riders} isMobile={isMobile} />
      )}

      {/* Add Order Form */}
      {showAddForm && filter !== 'bulk' && (
        <div style={{
          background: 'white', borderRadius: 12, padding: 20, marginBottom: 16,
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)', border: '2px solid #e3f0ff',
        }}>
          <h3 style={{ margin: '0 0 16px', color: '#0f4c81', fontSize: 15, fontWeight: 700 }}>➕ New Order</h3>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4, fontWeight: 600 }}>Customer *</label>
            {selectedCustomer ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#e3f0ff', borderRadius: 8, border: '1.5px solid #bfdbfe' }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 2px', color: '#0f4c81' }}>{selectedCustomer.full_name}</p>
                  <p style={{ fontSize: 11, color: '#555', margin: '0 0 2px' }}>{selectedCustomer.mobile} · {selectedCustomer.customer_code}</p>
                  {selectedCustomer.address && <p style={{ fontSize: 11, color: '#888', margin: 0 }}>📍 {selectedCustomer.address}</p>}
                  {selectedCustomer.balance > 0 && <p style={{ fontSize: 11, color: '#f44336', margin: '2px 0 0', fontWeight: 600 }}>⚠️ Balance: Rs. {Number(selectedCustomer.balance).toLocaleString()}</p>}
                  {selectedCustomer.delivery_notes && <p style={{ fontSize: 11, color: '#7c3aed', margin: '2px 0 0' }}>📝 {selectedCustomer.delivery_notes}</p>}
                </div>
                <button onClick={() => { setSelectedCustomer(null); setCustomerSearch('') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: 20, padding: '4px' }}>✕</button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input value={customerSearch} onChange={e => searchCustomer(e.target.value)}
                  placeholder="Search by name, mobile, or ID..." style={inp} />
                {customerResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1.5px solid #e0e0e0', borderRadius: 8, zIndex: 50, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                    {customerResults.map(c => (
                      <div key={c.id} onClick={() => {
                        setSelectedCustomer(c); setCustomerResults([])
                        setForm(f => ({
                          ...f,
                          qty_19l: c.default_qty_19l || 0,
                          qty_half_litre: c.default_qty_half || 0,
                          qty_1_5l: c.default_qty_1_5l || 0,
                          notes: c.delivery_notes || '',
                        }))
                      }} style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', background: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <p style={{ fontWeight: 600, fontSize: 13, margin: '0 0 2px' }}>{c.full_name}</p>
                          <p style={{ fontSize: 11, color: '#888', margin: 0 }}>{c.mobile} · {c.customer_code}</p>
                          {c.address && <p style={{ fontSize: 10, color: '#aaa', margin: '1px 0 0' }}>📍 {c.address}</p>}
                        </div>
                        {c.balance > 0 && <span style={{ fontSize: 11, color: '#f44336', fontWeight: 600, whiteSpace: 'nowrap' }}>Rs. {Number(c.balance).toLocaleString()}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
            {[{ key: 'qty_19l', label: '19 Litre' }, { key: 'qty_half_litre', label: 'Half Litre' }, { key: 'qty_1_5l', label: '1.5 Litre' }].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4, fontWeight: 600 }}>{f.label}</label>
                <input type="number" value={form[f.key]} min="0"
                  onChange={e => setForm({ ...form, [f.key]: Number(e.target.value) })} style={inp} />
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4, fontWeight: 600 }}>Delivery Date</label>
              <input type="date" value={form.delivery_date} onChange={e => setForm({ ...form, delivery_date: e.target.value })} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4, fontWeight: 600 }}>Delivery Notes</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Special instructions..." style={inp} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: form.is_priority ? '#c62828' : '#555' }}>
              <input type="checkbox" checked={form.is_priority} onChange={e => setForm({ ...form, is_priority: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: '#c62828' }} />
              🔴 Mark as Priority
            </label>
            {form.is_priority && <span style={{ fontSize: 11, color: '#c62828', background: '#ffebee', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>Rider will see this first</span>}
          </div>

          <button onClick={saveOrder} disabled={saving} style={{
            padding: '12px 28px', background: form.is_priority ? '#c62828' : '#1a7a4a', color: 'white', border: 'none',
            borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700,
            width: isMobile ? '100%' : 'auto', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
          }}>{saving ? '⏳ Saving...' : `✓ Create Order`}</button>
        </div>
      )}

      {/* Date filter */}
      {filter !== 'bulk' && (
        <div style={{
          background: 'white', borderRadius: 10, padding: '10px 14px', marginBottom: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, color: '#555', fontWeight: 600 }}>📅 Date Range:</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ padding: '7px 10px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 13, outline: 'none' }} />
          <span style={{ fontSize: 12, color: '#888' }}>to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ padding: '7px 10px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 13, outline: 'none' }} />
          {[
            { label: 'Today',      from: today,                                          to: today },
            { label: 'Yesterday',  from: new Date(Date.now()-86400000).toISOString().split('T')[0], to: new Date(Date.now()-86400000).toISOString().split('T')[0] },
            { label: 'Last 7d',    from: new Date(Date.now()-6*86400000).toISOString().split('T')[0], to: today },
            { label: 'This Month', from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], to: today },
          ].map(d => (
            <button key={d.label} onClick={() => { setDateFrom(d.from); setDateTo(d.to) }}
              style={{
                padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: dateFrom === d.from && dateTo === d.to ? '#0f4c81' : '#f0f4f8',
                color: dateFrom === d.from && dateTo === d.to ? '#fff' : '#555',
              }}>{d.label}</button>
          ))}
        </div>
      )}

      {/* Main filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch' }}>
        {[
          { key: 'pending',   label: '⏳ Pending'      },
          { key: 'assigned',  label: '🚴 Assigned'     },
          { key: 'completed', label: '✅ Completed'    },
          { key: 'cancelled', label: '✕ Cancelled'     },
          { key: 'all',       label: '📋 All'           },
          { key: 'bulk',      label: '📦 Bulk Generate' },
        ].map(f => (
          <button key={f.key} onClick={() => { setFilter(f.key); setShowAddForm(false) }} style={{
            padding: '9px 16px', border: 'none', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
            background: filter === f.key ? (f.key === 'bulk' ? '#1a7a4a' : '#0f4c81') : '#f0f4f8',
            color: filter === f.key ? 'white' : '#555',
            fontWeight: filter === f.key ? 700 : 500, fontSize: 13, flexShrink: 0,
            boxShadow: filter === f.key ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
            transition: 'all 0.15s',
          }}>{f.label}</button>
        ))}
      </div>

      {/* ══ BULK GENERATE VIEW ══ */}
      {filter === 'bulk' && (
        <div>
          {bulkLoading ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', background: 'white', borderRadius: 12 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
              <p style={{ color: '#888', fontSize: 14 }}>Loading customers & delivery history...</p>
            </div>
          ) : (
            <>
              {/* Stat pills */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
                {[
                  { key: 'all',    label: 'Remaining', color: '#0f4c81', bg: '#e3f0ff' },
                  { key: 'ranout', label: 'Ran Out',   color: '#c62828', bg: '#ffebee' },
                  { key: 'today',  label: 'Needs Today',color: '#e65100', bg: '#fff3e0' },
                  { key: 'soon',   label: 'Needs Soon', color: '#b45309', bg: '#fff8e1' },
                  { key: 'ok',     label: 'Sufficient', color: '#1a7a4a', bg: '#e8f5e9' },
                  { key: 'nodata', label: 'No Data',    color: '#64748b', bg: '#f1f5f9' },
                ].map(s => (
                  <StatPill key={s.key} label={s.label} value={projCounts[s.key] ?? 0}
                    color={s.color} bg={s.bg} active={bulkTab === s.key}
                    onClick={() => { setBulkTab(s.key); setBulkRiderFilter('all') }} />
                ))}
              </div>

              {/* Search + rider filter */}
              <div style={{
                background: 'white', borderRadius: 10, padding: 12, marginBottom: 10,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
              }}>
                <input value={bulkSearch} onChange={e => setBulkSearch(e.target.value)}
                  placeholder="Search name, mobile or address..."
                  style={{ ...inp, flex: 1, minWidth: 160, padding: '9px 12px' }} />
                <select value={bulkRiderFilter} onChange={e => setBulkRiderFilter(e.target.value)}
                  style={{ padding: '9px 12px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 13, color: '#555', outline: 'none', background: '#fff' }}>
                  <option value="all">All Riders</option>
                  {riders.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                </select>
                {bulkRiderFilter !== 'all' && (
                  <span style={{ fontSize: 11, color: '#7c3aed', background: '#f3e8ff', padding: '5px 10px', borderRadius: 6, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    🗺️ Route optimized
                  </span>
                )}
                <button onClick={autoSelectUrgent} style={{
                  padding: '9px 14px', background: '#fff3e0', border: '1px solid #fed7aa',
                  borderRadius: 8, color: '#c45309', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}>⚡ Auto-select Urgent</button>
              </div>

              {/* Projection sub-tabs */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', paddingBottom: 4 }}>
                {BULK_TABS.map(t => {
                  const active = bulkTab === t.key
                  const col = TAB_COLORS[t.key]
                  const cnt = projCounts[t.key] ?? 0
                  return (
                    <button key={t.key} onClick={() => setBulkTab(t.key)} style={{
                      padding: '6px 12px', border: active ? `1.5px solid ${col}` : '1px solid #e0e0e0',
                      borderRadius: 20, cursor: 'pointer', fontSize: 12,
                      fontWeight: active ? 700 : 400,
                      background: active ? col + '18' : '#f8f9fa',
                      color: active ? col : '#666',
                      display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                    }}>
                      {t.label}
                      <span style={{
                        fontSize: 10, fontWeight: 700,
                        background: active ? col : '#ddd', color: active ? '#fff' : '#888',
                        padding: '1px 5px', borderRadius: 8, minWidth: 16, textAlign: 'center',
                      }}>{cnt}</span>
                    </button>
                  )
                })}
              </div>

              {/* Select all bar */}
              <div style={{
                background: 'white', borderRadius: 10, padding: '10px 14px', marginBottom: 8,
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <input type="checkbox" checked={allBulkChecked}
                  ref={el => { if (el) el.indeterminate = someBulkChecked }}
                  onChange={toggleBulkAll}
                  style={{ width: 17, height: 17, cursor: 'pointer', accentColor: '#0f4c81' }} />
                <span style={{ fontSize: 13, color: '#555', flex: 1 }}>
                  {bulkSelected.size === 0
                    ? `Select all ${filteredBulk.length} shown (already ordered today excluded)`
                    : `${bulkSelected.size} of ${allCustomers.length} selected`}
                </span>
                {bulkSelected.size > 0 && (
                  <button onClick={() => setBulkSelected(new Set())}
                    style={{ fontSize: 12, color: '#c62828', background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
                )}
              </div>

              {/* Customer list */}
              {filteredBulk.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', background: 'white', borderRadius: 12 }}>
                  <p style={{ fontSize: 28, marginBottom: 8 }}>🎉</p>
                  <p style={{ color: '#1a7a4a', fontSize: 14, fontWeight: 600 }}>All customers have orders for today!</p>
                  <p style={{ color: '#888', fontSize: 12 }}>No remaining customers to order for.</p>
                </div>
              ) : isMobile ? (
                <div style={{ marginBottom: bulkSelected.size > 0 ? 80 : 0 }}>
                  {filteredBulk.map(c => (
                    <CustomerCard key={c.id} c={c} isSelected={bulkSelected.has(c.id)} onToggle={() => toggleBulkOne(c.id)} />
                  ))}
                </div>
              ) : (
                <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'auto', marginBottom: bulkSelected.size > 0 ? 72 : 0 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                    <thead>
                      <tr style={{ background: '#f8f9fa' }}>
                        <th style={{ padding: '11px 14px', width: 40 }}>
                          <input type="checkbox" checked={allBulkChecked}
                            ref={el => { if (el) el.indeterminate = someBulkChecked }}
                            onChange={toggleBulkAll}
                            style={{ width: 15, height: 15, cursor: 'pointer' }} />
                        </th>
                        {['Customer & Address', 'Last Delivery', 'Avg Gap', 'Deliveries', 'Usual Rider', 'Projection', 'Confidence', 'Days Left', 'Default Qty'].map(h => {
                          const sortKey = h === 'Last Delivery' ? 'lastDelivery' : h === 'Usual Rider' ? 'rider' : null
                          const isActive = sortKey && bulkSort === sortKey
                          return (
                            <th key={h} onClick={() => {
                              if (!sortKey) return
                              if (isActive) setBulkSortDir(d => d === 'asc' ? 'desc' : 'asc')
                              else { setBulkSort(sortKey); setBulkSortDir('asc') }
                            }} style={{ padding: '11px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, borderBottom: '1px solid #eee', whiteSpace: 'nowrap', cursor: sortKey ? 'pointer' : 'default', userSelect: 'none', color: isActive ? '#0f4c81' : '#666' }}>
                              {h}{isActive ? (bulkSortDir === 'asc' ? ' ↑' : ' ↓') : sortKey ? ' ↕' : ''}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBulk.map((c, idx) => {
                        const isSel = bulkSelected.has(c.id)
                        const ps = PROJ_STYLE[c.proj?.key] || PROJ_STYLE.nodata
                        return (
                          <tr key={c.id} onClick={() => toggleBulkOne(c.id)}
                            style={{ borderBottom: '1px solid #f0f0f0', background: isSel ? '#f0f7ff' : idx % 2 === 0 ? 'white' : '#fafafa', cursor: 'pointer' }}>
                            <td style={{ padding: '11px 14px' }}>
                              <input type="checkbox" checked={isSel} onChange={() => toggleBulkOne(c.id)}
                                onClick={e => e.stopPropagation()}
                                style={{ width: 15, height: 15, cursor: 'pointer' }} />
                            </td>
                            <td style={{ padding: '11px 10px' }}>
                              <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 1px', color: '#1a1a2e' }}>{c.full_name}</p>
                              {c.address && <p style={{ fontSize: 11, color: '#888', margin: '0 0 1px' }}>📍 {c.address}</p>}
                              <p style={{ fontSize: 11, color: '#aaa', margin: 0 }}>{c.mobile}</p>
                              {c.deliveryCount < 5 && (
                                <p style={{ fontSize: 10, color: '#f59e0b', margin: '2px 0 0', fontWeight: 600 }}>
                                  {c.deliveryCount === 0 ? '⚠ No deliveries yet' : `⚠ ${c.deliveryCount} deliveries — learning`}
                                </p>
                              )}
                              {c.stats?.dominantDow !== null && c.stats?.dayPatternStrength > 0.4 && (
                                <p style={{ fontSize: 10, color: '#7c3aed', margin: '2px 0 0' }}>📅 Usually: {DAYS[c.stats.dominantDow]}s</p>
                              )}
                            </td>
                            <td style={{ padding: '11px 10px', fontSize: 12, color: '#555' }}>
                              {c.stats?.lastDeliveredAt ? new Date(c.stats.lastDeliveredAt).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' }) : '—'}
                            </td>
                            <td style={{ padding: '11px 10px', fontSize: 12, color: '#555' }}>
                              {c.stats ? `${c.stats.avgGap}d` : '—'}
                            </td>
                            <td style={{ padding: '11px 10px', fontSize: 12, textAlign: 'center' }}>
                              <span style={{ background: '#f0f0f0', color: '#555', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>{c.deliveryCount}</span>
                            </td>
                            <td style={{ padding: '11px 10px', fontSize: 12 }}>
                              {c.lastRiderName ? <span style={{ color: '#0f4c81', fontWeight: 600 }}>🚴 {c.lastRiderName}</span> : <span style={{ color: '#ccc' }}>—</span>}
                            </td>
                            <td style={{ padding: '11px 10px' }}><ProjBadge proj={c.proj} /></td>
                            <td style={{ padding: '11px 10px' }}><ConfidenceBadge confidence={c.proj?.confidence} /></td>
                            <td style={{ padding: '11px 10px', fontSize: 12, fontWeight: 600, color: ps.color }}>{formatDaysLeft(c.proj)}</td>
                            <td style={{ padding: '11px 10px', fontSize: 11 }}>
                              {(c.default_qty_19l || 0) > 0 && <div><span style={{ background: '#e3f0ff', color: '#0f4c81', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>19L×{c.default_qty_19l}</span></div>}
                              {(c.default_qty_half || 0) > 0 && <div style={{ marginTop: 2 }}><span style={{ background: '#e8f5e9', color: '#1a7a4a', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>½L×{c.default_qty_half}</span></div>}
                              {(c.default_qty_1_5l || 0) > 0 && <div style={{ marginTop: 2 }}><span style={{ background: '#fff3e0', color: '#e65100', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>1.5L×{c.default_qty_1_5l}</span></div>}
                              {!(c.default_qty_19l) && !(c.default_qty_half) && !(c.default_qty_1_5l) && <span style={{ color: '#ccc' }}>—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div style={{ padding: '10px 14px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#888' }}>
                      {bulkSelected.size} of {allCustomers.length} remaining selected
                      {bulkSelected.size > 0 && ` · 19L: ${totalQty19l}${totalQtyHalf > 0 ? ` · ½L: ${totalQtyHalf}` : ''}${totalQty15l > 0 ? ` · 1.5L: ${totalQty15l}` : ''}`}
                    </span>
                    {bulkSelected.size > 0 && (
                      <button onClick={() => setBulkSelected(new Set())}
                        style={{ fontSize: 12, color: '#c62828', background: 'none', border: 'none', cursor: 'pointer' }}>Clear selection</button>
                    )}
                  </div>
                </div>
              )}

              {/* Sticky bottom bar */}
              {bulkSelected.size > 0 && (
                <div style={{
                  position: 'fixed', bottom: 0, left: 0, right: 0, background: '#0f4c81',
                  padding: isMobile ? '12px 16px' : '14px 24px',
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  boxShadow: '0 -4px 20px rgba(0,0,0,0.2)', zIndex: 100,
                }}>
                  <div>
                    <span style={{ color: '#fff', fontWeight: 700, fontSize: isMobile ? 14 : 15 }}>
                      {bulkSelected.size} customers selected
                    </span>
                    <div style={{ color: '#93c5fd', fontSize: 11, marginTop: 1 }}>
                      {totalQty19l > 0 && `19L: ${totalQty19l}  `}
                      {totalQtyHalf > 0 && `½L: ${totalQtyHalf}  `}
                      {totalQty15l > 0 && `1.5L: ${totalQty15l}`}
                    </div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => setShowRiderPopup(true)} style={{
                    padding: isMobile ? '10px 18px' : '11px 28px', borderRadius: 9, border: 'none',
                    background: '#1a7a4a', color: '#fff', fontWeight: 700, fontSize: isMobile ? 13 : 15,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}>✓ Generate {bulkSelected.size} Orders →</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ══ EXISTING ORDERS VIEW ══ */}
      {filter !== 'bulk' && (
        <>
          {/* Transfer rider by rider — only for assigned tab */}
          {filter === 'assigned' && ridersWithOrders.length > 0 && (
            <div style={{ background: 'white', borderRadius: 10, padding: '12px 16px', marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#555', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🔄 Transfer All Orders by Rider</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ridersWithOrders.map(r => (
                  <div key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button onClick={() => openTransferForRider(r)} style={{
                      padding: '7px 14px', background: '#f0f4f8', border: '1.5px solid #e0e0e0',
                      borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#0f4c81',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      🚴 {r.full_name}
                      <span style={{ background: '#0f4c81', color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 11 }}>{r.orderCount}</span>
                      → Transfer
                    </button>
                    {hasMapFeature && generateRouteLink(r.id) && (
                      <a href={generateRouteLink(r.id)} target="_blank" rel="noreferrer" style={{
                        padding: '7px 12px', background: '#e8f5e9', border: '1.5px solid #86efac',
                        borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1a7a4a',
                        textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5,
                      }}>🗺️ Route</a>
                    )}
                    <button onClick={() => notifyRider(r, 'whatsapp')} style={{
                      padding: '7px 12px', background: '#e8f5e9', border: '1.5px solid #86efac',
                      borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1a7a4a',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>💬 WhatsApp</button>
                    <button onClick={() => notifyRider(r, 'copy')} style={{
                      padding: '7px 12px', background: '#f0f7ff', border: '1.5px solid #bfdbfe',
                      borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#0f4c81',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>📋 Copy</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Select all + bulk assign/transfer bar */}
          {(filter === 'pending' || filter === 'assigned' || filter === 'all') && orders.length > 0 && (
            <div style={{
              background: 'white', borderRadius: 10, padding: '12px 16px', marginBottom: 12,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <input type="checkbox"
                checked={selectedOrders.length === orders.length && orders.length > 0}
                onChange={toggleSelectAll}
                style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#0f4c81' }} />
              <span style={{ fontSize: 13, color: '#555' }}>
                {selectedOrders.length === 0 ? 'Select all' : `${selectedOrders.length} selected`}
              </span>
              {selectedOrders.length > 0 && (
                <>
                  <select value={assignRiderId} onChange={e => setAssignRiderId(e.target.value)}
                    style={{ padding: '8px 12px', border: '1.5px solid #e0e0e0', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff' }}>
                    <option value="">Assign to Rider...</option>
                    {riders.map(r => <option key={r.id} value={r.id}>{r.full_name}{r.is_main_rider ? ' ⭐' : ''}</option>)}
                  </select>
                  <button onClick={assignOrders} disabled={assigning} style={{
                    padding: '8px 16px', background: '#1a7a4a', color: 'white',
                    border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}>{assigning ? 'Assigning...' : `✓ Assign ${selectedOrders.length}`}</button>
                  <button onClick={openTransferForSelected} style={{
                    padding: '8px 16px', background: '#e3f0ff', color: '#0f4c81',
                    border: '1.5px solid #bfdbfe', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}>🔄 Transfer {selectedOrders.length}</button>
                </>
              )}
            </div>
          )}

          <div style={{ background: 'white', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            {loading ? (
              <p style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading...</p>
            ) : orders.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <p style={{ fontSize: 32, marginBottom: 8 }}>📦</p>
                <p style={{ color: '#888', fontSize: 14 }}>No {filter === 'all' ? '' : filter} orders found.</p>
              </div>
            ) : isMobile ? (
              <div style={{ padding: 8 }}>
                {orders.map(o => {
                  const s = STATUS_COLORS[o.status] || STATUS_COLORS.pending
                  const isSel = selectedOrders.includes(o.id)
                  const src = SOURCE_LABEL[o.source] || SOURCE_LABEL.admin
                  return (
                    <div key={o.id} style={{
                      background: isSel ? '#f0f7ff' : o.is_priority ? '#fff8f8' : '#fff',
                      border: isSel ? '2px solid #0f4c81' : o.is_priority ? '2px solid #fca5a5' : '1px solid #eee',
                      borderRadius: 10, padding: '12px 14px', marginBottom: 8,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                          {(o.status === 'pending' || o.status === 'assigned') && (
                            <input type="checkbox" checked={isSel} onChange={() => toggleSelectOrder(o.id)}
                              style={{ width: 17, height: 17, flexShrink: 0, marginTop: 2, accentColor: '#0f4c81' }} />
                          )}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {o.is_priority && <span style={{ fontSize: 14 }}>🔴</span>}
                              <p style={{ fontWeight: 700, fontSize: 14, margin: 0, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customers?.full_name}</p>
                            </div>
                            {o.customers?.address && <p style={{ fontSize: 11, color: '#888', margin: '1px 0 0' }}>📍 {o.customers.address}</p>}
                            <p style={{ fontSize: 11, color: '#aaa', margin: '1px 0 0' }}>{o.customers?.mobile}</p>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                          <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{s.icon} {s.label}</span>
                          <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: src.bg, color: src.color, whiteSpace: 'nowrap' }}>{src.label}</span>
                        </div>
                      </div>
                      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: '#555' }}>
                        <span style={{ fontWeight: 600 }}>{[o.qty_19l > 0 && `19L×${o.qty_19l}`, o.qty_half_litre > 0 && `½L×${o.qty_half_litre}`, o.qty_1_5l > 0 && `1.5L×${o.qty_1_5l}`].filter(Boolean).join('  ')}</span>
                        {o.delivery_date && <span>📅 {new Date(o.delivery_date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' })}</span>}
                        {o.riders && <span style={{ color: '#0f4c81', fontWeight: 600 }}>🚴 {o.riders.full_name}</span>}
                      </div>
                      {o.customers?.balance > 0 && <p style={{ fontSize: 11, color: '#f44336', margin: '5px 0 0', fontWeight: 600 }}>⚠️ Outstanding: Rs. {Number(o.customers.balance).toLocaleString()}</p>}
                      {o.notes && <p style={{ fontSize: 11, color: '#7c3aed', margin: '4px 0 0' }}>📝 {o.notes}</p>}
                      {o.customers?.delivery_notes && !o.notes && <p style={{ fontSize: 11, color: '#7c3aed', margin: '4px 0 0' }}>📝 {o.customers.delivery_notes}</p>}
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        {o.status !== 'completed' && o.status !== 'cancelled' && (
                          <>
                            <button onClick={() => togglePriority(o)} style={{
                              padding: '5px 10px', background: o.is_priority ? '#ffebee' : '#f0f4f8',
                              color: o.is_priority ? '#c62828' : '#555',
                              border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                            }}>{o.is_priority ? '🔴 Priority' : '⭕ Set Priority'}</button>
                            <button onClick={() => cancelOrder(o.id)} style={{
                              padding: '5px 10px', background: '#ffebee', color: '#c62828',
                              border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                            }}>✕ Cancel</button>
                          </>
                        )}
                        {o.riders && o.status === 'assigned' && (
                          <a href={`https://wa.me/${(o.riders.mobile || '').replace(/\D/g, '')}?text=${encodeURIComponent(`📦 Order: ${o.customers?.full_name} — ${[o.qty_19l > 0 && `19L×${o.qty_19l}`, o.qty_half_litre > 0 && `½L×${o.qty_half_litre}`].filter(Boolean).join(' ')} — ${o.customers?.address || ''}`)}`}
                            target="_blank" rel="noreferrer"
                            style={{ padding: '5px 10px', background: '#e8f5e9', color: '#1a7a4a', borderRadius: 6, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
                            💬 WhatsApp
                          </a>
                        )}
                        {hasMapFeature && (o.customers?.address || o.customers?.latitude) && (
                          <a href={googleMapsNavLink(o.customers?.latitude, o.customers?.longitude, o.customers?.address)}
                            target="_blank" rel="noreferrer"
                            style={{ padding: '5px 10px', background: '#f0f7ff', color: '#0f4c81', borderRadius: 6, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
                            📍 {o.customers?.latitude ? 'GPS' : 'Map'}
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    <th style={{ padding: '12px 16px', width: 40 }}></th>
                    {['Priority', 'Customer', 'Address', 'Bottles', 'Date', 'Rider', 'Notes', 'Source', 'Balance', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '12px 10px', textAlign: 'left', fontSize: 11, color: '#666', fontWeight: 700, borderBottom: '1px solid #eee', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o, idx) => {
                    const s = STATUS_COLORS[o.status] || STATUS_COLORS.pending
                    const isSel = selectedOrders.includes(o.id)
                    const src = SOURCE_LABEL[o.source] || SOURCE_LABEL.admin
                    return (
                      <tr key={o.id} style={{ borderBottom: '1px solid #f0f0f0', background: isSel ? '#f0f7ff' : o.is_priority ? '#fff8f8' : idx % 2 === 0 ? 'white' : '#fafafa' }}>
                        <td style={{ padding: '12px 16px' }}>
                          {(o.status === 'pending' || o.status === 'assigned') && (
                            <input type="checkbox" checked={isSel} onChange={() => toggleSelectOrder(o.id)}
                              style={{ width: 16, height: 16, cursor: 'pointer' }} />
                          )}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                          <button onClick={() => togglePriority(o)} title={o.is_priority ? 'Remove priority' : 'Set priority'}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>
                            {o.is_priority ? '🔴' : '⭕'}
                          </button>
                        </td>
                        <td style={{ padding: '12px 10px' }}>
                          <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px', color: '#1a1a2e' }}>{o.customers?.full_name}</p>
                          <p style={{ fontSize: 11, color: '#888', margin: 0 }}>{o.customers?.mobile}</p>
                        </td>
                        <td style={{ padding: '12px 10px', fontSize: 12, color: '#555', maxWidth: 140 }}>
                          {o.customers?.address || <span style={{ color: '#ccc' }}>—</span>}
                        </td>
                        <td style={{ padding: '12px 10px', fontSize: 12, color: '#555' }}>
                          {o.qty_19l > 0 && <div style={{ fontWeight: 600 }}>19L × {o.qty_19l}</div>}
                          {o.qty_half_litre > 0 && <div>Half × {o.qty_half_litre}</div>}
                          {o.qty_1_5l > 0 && <div>1.5L × {o.qty_1_5l}</div>}
                        </td>
                        <td style={{ padding: '12px 10px', fontSize: 12, color: '#555', whiteSpace: 'nowrap' }}>
                          {o.delivery_date ? new Date(o.delivery_date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td style={{ padding: '12px 10px', fontSize: 12 }}>
                          {o.riders ? <span style={{ color: '#0f4c81', fontWeight: 600 }}>🚴 {o.riders.full_name}</span> : <span style={{ color: '#ccc' }}>Not assigned</span>}
                        </td>
                        <td style={{ padding: '12px 10px', fontSize: 11, color: '#7c3aed', maxWidth: 140 }}>
                          {o.notes || o.customers?.delivery_notes || <span style={{ color: '#ccc' }}>—</span>}
                        </td>
                        <td style={{ padding: '12px 10px' }}>
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 600, background: src.bg, color: src.color, whiteSpace: 'nowrap' }}>{src.label}</span>
                        </td>
                        <td style={{ padding: '12px 10px', fontSize: 12 }}>
                          {o.customers?.balance > 0
                            ? <span style={{ color: '#f44336', fontWeight: 600 }}>Rs. {Number(o.customers.balance).toLocaleString()}</span>
                            : <span style={{ color: '#1a7a4a' }}>Clear</span>}
                        </td>
                        <td style={{ padding: '12px 10px' }}>
                          <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>{s.icon} {s.label}</span>
                        </td>
                        <td style={{ padding: '12px 10px' }}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {o.status !== 'completed' && o.status !== 'cancelled' && (
                              <button onClick={() => cancelOrder(o.id)} style={{ padding: '4px 10px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✕ Cancel</button>
                            )}
                            {o.riders && o.status === 'assigned' && (
                              <a href={`https://wa.me/${(o.riders.mobile || '').replace(/\D/g, '')}?text=${encodeURIComponent(`📦 Order: ${o.customers?.full_name} — ${[o.qty_19l > 0 && `19L×${o.qty_19l}`, o.qty_half_litre > 0 && `½L×${o.qty_half_litre}`].filter(Boolean).join(' ')}`)}`}
                                target="_blank" rel="noreferrer"
                                style={{ padding: '4px 10px', background: '#e8f5e9', color: '#1a7a4a', borderRadius: 6, fontSize: 11, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                💬 WA
                              </a>
                            )}
                            {hasMapFeature && (o.customers?.address || o.customers?.latitude) && (
                              <a href={googleMapsNavLink(o.customers?.latitude, o.customers?.longitude, o.customers?.address)}
                                target="_blank" rel="noreferrer"
                                style={{ padding: '4px 10px', background: '#f0f7ff', color: '#0f4c81', borderRadius: 6, fontSize: 11, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                📍 {o.customers?.latitude ? 'GPS' : 'Map'}
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
