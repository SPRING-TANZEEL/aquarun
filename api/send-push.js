import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { tenantId, userType, title, body, url, tag } = req.body

  try {
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    let query = supabase.from('push_subscriptions')
      .select('subscription')
      .eq('tenant_id', tenantId)

    if (userType && userType !== 'all') {
      query = query.eq('user_type', userType)
    }

    const { data: subscriptions, error } = await query
    if (error) throw error
    if (!subscriptions?.length) return res.json({ sent: 0 })

    const payload = JSON.stringify({ title, body, url: url || '/', tag: tag || 'aquarun' })

    let sent = 0, failed = 0
    for (const sub of subscriptions) {
      try {
        const subscription = typeof sub.subscription === 'string'
          ? JSON.parse(sub.subscription)
          : sub.subscription
        await webpush.sendNotification(subscription, payload)
        sent++
      } catch (err) {
        if (err.statusCode === 410) {
          await supabase.from('push_subscriptions')
            .delete().eq('subscription', sub.subscription)
        }
        failed++
      }
    }

    res.json({ sent, failed })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
