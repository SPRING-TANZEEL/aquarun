// AquaRun Push Notification Helper

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

// Register service worker and subscribe to push
export async function subscribeToPush(userId, userType, tenantId) {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.log('Push notifications not supported')
      return null
    }

    // Register service worker
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    // Check existing subscription
    let subscription = await reg.pushManager.getSubscription()

    if (!subscription) {
      // Request permission
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        console.log('Notification permission denied')
        return null
      }

      // Subscribe
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      })
    }

    // Save subscription to Supabase
    const { supabase } = await import('./supabase')
    const subData = JSON.stringify(subscription)

    await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      user_type: userType,
      tenant_id: tenantId,
      subscription: subData,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,user_type' })

    console.log('Push subscription saved ✓')
    return subscription
  } catch (err) {
    console.error('Push subscription error:', err)
    return null
  }
}

// Unsubscribe
export async function unsubscribeFromPush(userId, userType) {
  try {
    if (!('serviceWorker' in navigator)) return

    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    if (!reg) return

    const subscription = await reg.pushManager.getSubscription()
    if (subscription) await subscription.unsubscribe()

    const { supabase } = await import('./supabase')
    await supabase.from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('user_type', userType)
  } catch (err) {
    console.error('Unsubscribe error:', err)
  }
}

// Send notification via Edge Function
export async function sendPushNotification({ tenantId, userType, title, body, url, tag }) {
  try {
    const { supabase } = await import('./supabase')
    await supabase.functions.invoke('send-push', {
      body: { tenantId, userType, title, body, url, tag }
    })
  } catch (err) {
    console.error('Send push error:', err)
  }
}
