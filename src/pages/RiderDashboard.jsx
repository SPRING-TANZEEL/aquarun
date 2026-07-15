import { useState, useEffect } from 'react'
import { initDB, getPendingCount } from '../offlineDB'
import { syncToServer, startAutoSync, onSyncUpdate, downloadRiderData } from '../syncManager'
import RiderDeliveries from './RiderDeliveries'
import RiderSellToCustomer from './RiderSellToCustomer'
import RiderReceivables from './RiderReceivables'
import RiderExpense from './RiderExpense'
import RiderCashSummary from './RiderCashSummary'
import RiderCashTransfer from './RiderCashTransfer'
import RiderSalary from './RiderSalary'
import RiderAdvanceApproval from './RiderAdvanceApproval'
import OfficeExpenses from './OfficeExpenses'

export default function RiderDashboard({ user, onLogout }) {
  const [activePage, setActivePage] = useState('deliveries')
  const [preSelectedCustomer, setPreSelectedCustomer] = useState(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState(null)
  const [dbReady, setDbReady] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadDone, setDownloadDone] = useState(false)
  const [showSyncBar, setShowSyncBar] = useState(true)
  const [lang, setLang] = useState(() => localStorage.getItem('aquarun_lang') || 'en')

  function t(en, ur) { return lang === 'ur' ? ur : en }

  function toggleLang() {
    const next = lang === 'en' ? 'ur' : 'en'
    setLang(next)
    localStorage.setItem('aquarun_lang', next)
  }

  useEffect(() => {
    setupOffline()
    const handleOnline = () => { setIsOnline(true); downloadData() }
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    const unsubscribe = onSyncUpdate(status => {
      setSyncing(status.syncing)
      if (status.pendingCount !== undefined) setPendingCount(status.pendingCount)
      if (status.lastSync) setLastSync(status.lastSync)
    })
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (user?.tenant_id) {
      import('../pushNotifications').then(({ subscribeToPush }) => {
        subscribeToPush(user.id, 'rider', user.tenant_id)
      })
    }
  }, [user])

  async function setupOffline() {
    try {
      await initDB()
      setDbReady(true)
      startAutoSync()
      const count = await getPendingCount()
      setPendingCount(count)
      if (navigator.onLine) await downloadData()
    } catch (err) {
      console.error('Offline setup error:', err)
      setDbReady(true)
    }
  }

  async function downloadData() {
    setDownloading(true)
    try {
      const result = await downloadRiderData(user)
      if (result.success) { setDownloadDone(true); setTimeout(() => setDownloadDone(false), 4000) }
    } catch (err) { console.error('Download error:', err) }
    setDownloading(false)
  }

  async function handleClearStuck() {
    if (!window.confirm('Clear all pending offline entries? Only use if entries are already posted or stuck. Continue?')) return
    try {
      const { clearAllPending } = await import('../offlineDB')
      await clearAllPending()
      setPendingCount(0)
      alert('✅ All pending entries cleared.')
    } catch (err) { alert('Error: ' + err.message) }
  }

  async function handleManualSync() {
    setSyncing(true)
    const result = await syncToServer()
    setSyncing(false)
    if (result.success) {
      setPendingCount(result.pendingCount || 0)
      setLastSync(new Date().toISOString())
      if (result.totalSynced > 0) alert(`✅ Synced ${result.totalSynced} entries to server!`)
      else alert('✅ Everything is already synced!')
    } else {
      alert('❌ Sync failed: ' + (result.message || result.error))
    }
  }

  const mainMenu = [
    { key: 'deliveries', icon: '📦', label: t('Delivery', 'ڈیلیوری') },
    { key: 'sell', icon: '👤', label: t('Customer', 'کسٹمر') },
    { key: 'receivables', icon: '💰', label: t('Balance', 'باقی') },
    { key: 'cash', icon: '💵', label: t('Cash', 'کیش') },
    { key: 'more', icon: '☰', label: t('More', 'مزید') },
  ]

  const moreItems = [
    { key: 'expense', icon: '💸', label: t('Log Expense', 'خرچہ'), desc: t('Fuel, repair, refreshment', 'پٹرول، مرمت، ناشتہ') },
    { key: 'transfer', icon: '🔄', label: t('Cash Transfer', 'کیش بھیجیں'), desc: t('Return cash to Main Rider or Office', 'مین رائیڈر یا دفتر کو کیش واپس کریں') },
    { key: 'salary', icon: '💼', label: t('My Salary', 'میری تنخواہ'), desc: t('View advances and remaining salary', 'ایڈوانس اور باقی تنخواہ دیکھیں') },
    ...(user.is_main_rider ? [
      { key: 'advances', icon: '📋', label: t('Advance Requests', 'ایڈوانس درخواستیں'), desc: t('Approve or reject advance requests', 'ایڈوانس درخواستیں منظور یا رد کریں') },
      { key: 'fieldexpenses', icon: '🏢', label: t('Field Expenses', 'فیلڈ خرچے'), desc: t('Log expenses paid from your cash', 'اپنے کیش سے ادا کیے گئے خرچے') },
    ] : []),
  ]

  function handleSelectCustomer(customer) {
    setPreSelectedCustomer(customer)
    setActivePage('sell')
  }

  function navigateTo(key) {
    if (key !== 'sell') setPreSelectedCustomer(null)
    setActivePage(key)
  }

  const isMoreActive = ['expense', 'transfer', 'salary', 'advances', 'fieldexpenses'].includes(activePage)

  return (
    <div style={{ minHeight: '100vh', background: '#f5f6fa', fontFamily: 'sans-serif' }}>

      {/* Header */}
      <div style={{ background: '#1a7a4a', color: 'white', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '22px' }}>💧</span>
          <div>
            <div style={{ fontWeight: '700', fontSize: '15px' }}>AquaRun {user.is_main_rider ? '⭐' : ''}</div>
            <div style={{ fontSize: '11px', opacity: 0.8 }}>🚴 {user.full_name}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Online status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '20px', background: isOnline ? 'rgba(255,255,255,0.2)' : 'rgba(239,68,68,0.3)', border: '1px solid ' + (isOnline ? 'rgba(255,255,255,0.3)' : 'rgba(239,68,68,0.5)') }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: isOnline ? '#86efac' : '#f87171' }} />
            <span style={{ fontSize: '11px', fontWeight: '600' }}>{isOnline ? t('Online', 'آن لائن') : t('Offline', 'آف لائن')}</span>
          </div>
          {/* Language toggle */}
          <button onClick={toggleLang}
            style={{ padding: '5px 10px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '700' }}>
            {lang === 'en' ? 'اردو' : 'EN'}
          </button>
          <button onClick={onLogout}
            style={{ padding: '5px 12px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
            {t('Logout', 'لاگ آؤٹ')}
          </button>
        </div>
      </div>

      {/* Sync Status Bar */}
      {showSyncBar && (
        <div style={{ background: pendingCount > 0 ? '#fff7ed' : isOnline ? '#f0fdf4' : '#fef2f2', borderBottom: '1px solid ' + (pendingCount > 0 ? '#fed7aa' : isOnline ? '#bbf7d0' : '#fecaca'), padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {syncing ? (
              <><span>🔄</span><span style={{ fontSize: '12px', color: '#0f4c81', fontWeight: '600' }}>{t('Syncing to server...', 'سرور سے مطابقت ہو رہی ہے...')}</span></>
            ) : downloading ? (
              <><span>⬇️</span><span style={{ fontSize: '12px', color: '#0f4c81', fontWeight: '600' }}>{t("Downloading today's data...", 'آج کا ڈیٹا ڈاؤن لوڈ ہو رہا ہے...')}</span></>
            ) : downloadDone ? (
              <><span>✅</span><span style={{ fontSize: '12px', color: '#1a7a4a', fontWeight: '600' }}>{t('Data downloaded — ready to work offline', 'ڈیٹا ڈاؤن لوڈ ہو گیا — آف لائن کام کے لیے تیار')}</span></>
            ) : pendingCount > 0 ? (
              <><span>⏳</span><span style={{ fontSize: '12px', color: '#ea580c', fontWeight: '600' }}>{pendingCount} {t('entries waiting to sync', 'اندراجات مطابقت کے منتظر')}</span></>
            ) : !isOnline ? (
              <><span>📵</span><span style={{ fontSize: '12px', color: '#dc2626', fontWeight: '600' }}>{t('Offline — data saving to phone', 'آف لائن — ڈیٹا فون میں محفوظ ہو رہا ہے')}</span></>
            ) : (
              <><span>✅</span><span style={{ fontSize: '12px', color: '#1a7a4a', fontWeight: '600' }}>
                {t('All synced', 'سب مطابق')} {lastSync ? '· ' + new Date(lastSync).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) : ''}
              </span></>
            )}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {isOnline && pendingCount > 0 && (
              <button onClick={handleManualSync} disabled={syncing}
                style={{ padding: '4px 12px', background: '#ea580c', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}>
                {syncing ? t('Syncing...', 'مطابقت...') : t('🔄 Sync Now', '🔄 ابھی مطابق کریں')}
              </button>
            )}
            {isOnline && !downloading && (
              <button onClick={downloadData}
                style={{ padding: '4px 10px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>
                ⬇️
              </button>
            )}
            <button onClick={() => setShowSyncBar(false)}
              style={{ padding: '4px 8px', background: 'transparent', color: '#888', border: 'none', cursor: 'pointer', fontSize: '14px' }}>✕</button>
          </div>
        </div>
      )}

      {/* Offline Warning */}
      {!isOnline && (
        <div style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca', padding: '8px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', color: '#dc2626', fontWeight: '600', margin: '0 0 2px' }}>
            📵 {t('Offline mode — entries saving to phone', 'آف لائن موڈ — اندراجات فون میں محفوظ ہو رہے ہیں')}
          </p>
          <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>
            {t('Will sync automatically when internet returns', 'انٹرنیٹ آنے پر خودبخود مطابق ہو جائے گا')}
          </p>
        </div>
      )}

      {/* Content */}
      <div style={{ padding: '16px', paddingBottom: '90px' }}>
        {activePage === 'deliveries' && <RiderDeliveries rider={user} tenantId={user.tenant_id} isOnline={isOnline} dbReady={dbReady} lang={lang} />}
        {activePage === 'sell' && <RiderSellToCustomer rider={user} tenantId={user.tenant_id} preSelectedCustomer={preSelectedCustomer} onClearPreSelected={() => setPreSelectedCustomer(null)} isOnline={isOnline} dbReady={dbReady} lang={lang} />}
        {activePage === 'receivables' && <RiderReceivables rider={user} tenantId={user.tenant_id} onSelectCustomer={handleSelectCustomer} isOnline={isOnline} dbReady={dbReady} lang={lang} />}
        {activePage === 'cash' && <RiderCashSummary rider={user} tenantId={user.tenant_id} lang={lang} />}
        {activePage === 'expense' && <RiderExpense rider={user} tenantId={user.tenant_id} isOnline={isOnline} dbReady={dbReady} lang={lang} />}
        {activePage === 'transfer' && <RiderCashTransfer rider={user} tenantId={user.tenant_id} lang={lang} />}
        {activePage === 'salary' && <RiderSalary rider={user} tenantId={user.tenant_id} lang={lang} />}
        {activePage === 'advances' && <RiderAdvanceApproval rider={user} tenantId={user.tenant_id} lang={lang} />}
        {activePage === 'fieldexpenses' && <OfficeExpenses rider={user} isCEO={false} tenantId={user.tenant_id} lang={lang} />}

        {activePage === 'more' && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#333', marginBottom: '16px' }}>☰ {t('More Options', 'مزید آپشن')}</h2>

            {/* Sync Status Card */}
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid ' + (pendingCount > 0 ? '#fed7aa' : '#e0e0e0') }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <p style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: 0 }}>📡 {t('Sync Status', 'مطابقت کی حالت')}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isOnline ? '#22c55e' : '#ef4444' }} />
                  <span style={{ fontSize: '12px', color: isOnline ? '#1a7a4a' : '#dc2626', fontWeight: '600' }}>
                    {isOnline ? t('Online', 'آن لائن') : t('Offline', 'آف لائن')}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ fontSize: '13px', color: '#555' }}>{t('Pending entries', 'زیر التواء اندراجات')}</span>
                <span style={{ fontSize: '13px', fontWeight: '700', color: pendingCount > 0 ? '#ea580c' : '#1a7a4a' }}>{pendingCount}</span>
              </div>
              {lastSync && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <span style={{ fontSize: '13px', color: '#555' }}>{t('Last synced', 'آخری مطابقت')}</span>
                  <span style={{ fontSize: '13px', color: '#888' }}>{new Date(lastSync).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                {isOnline && (
                  <button onClick={handleManualSync} disabled={syncing}
                    style={{ flex: 1, padding: '10px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                    {syncing ? t('🔄 Syncing...', '🔄 مطابقت...') : t('🔄 Sync Now', '🔄 ابھی مطابق کریں')}
                  </button>
                )}
                {isOnline && (
                  <button onClick={downloadData} disabled={downloading}
                    style={{ flex: 1, padding: '10px', background: '#1a7a4a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>
                    {downloading ? t('⬇️ Downloading...', '⬇️ ڈاؤن لوڈ...') : t('⬇️ Refresh Data', '⬇️ ڈیٹا تازہ کریں')}
                  </button>
                )}
                <button onClick={handleClearStuck}
                  style={{ width: '100%', padding: '10px', background: '#f44336', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', marginTop: '4px' }}>
                  🗑️ {t('Clear Stuck Entries', 'پھنسے ہوئے اندراجات صاف کریں')}
                </button>
              </div>
            </div>

            {/* Language toggle card */}
            <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '700', color: '#333', margin: '0 0 2px' }}>🌐 {t('Language / زبان', 'زبان / Language')}</p>
                  <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>{t('Currently: English', 'ابھی: اردو')}</p>
                </div>
                <button onClick={toggleLang}
                  style={{ padding: '10px 20px', background: '#0f4c81', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '700' }}>
                  {lang === 'en' ? 'اردو میں بدلیں' : 'Switch to English'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {moreItems.map(item => (
                <button key={item.key} onClick={() => navigateTo(item.key)}
                  style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1px solid #eee', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                  <span style={{ fontSize: '28px' }}>{item.icon}</span>
                  <div>
                    <p style={{ fontSize: '15px', fontWeight: '700', color: '#333', margin: '0 0 2px' }}>{item.label}</p>
                    <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>{item.desc}</p>
                  </div>
                  <span style={{ marginLeft: 'auto', color: '#ccc', fontSize: '18px' }}>›</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #eee', display: 'flex', zIndex: 100 }}>
        {mainMenu.map(m => (
          <button key={m.key} onClick={() => navigateTo(m.key)}
            style={{
              flex: 1, padding: '8px 2px', border: 'none',
              background: activePage === m.key || (m.key === 'more' && isMoreActive) ? '#e8f5e9' : 'white',
              color: activePage === m.key || (m.key === 'more' && isMoreActive) ? '#1a7a4a' : '#888',
              cursor: 'pointer', fontSize: '10px',
              fontWeight: activePage === m.key ? '700' : '400',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
              borderTop: activePage === m.key || (m.key === 'more' && isMoreActive) ? '3px solid #1a7a4a' : '3px solid transparent'
            }}>
            <span style={{ fontSize: '18px' }}>{m.icon}</span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}