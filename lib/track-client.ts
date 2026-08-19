'use client'

/**
 * 客户端埋点上报（client-safe）。
 * 自 EvaluatePage 的本地 trackEvent 抽取共用（B7 WS-C），行为保持一致：
 * - fetch /api/track + sendBeacon 兜底，fire-and-forget 不阻塞 UI
 * - 自动附带 path / referrer / utm
 * - event_type 需在 /api/track 白名单内，否则服务端 400（不影响业务）
 */

import { getUtm } from '@/lib/utm'

export function trackEvent(
  event_type: string,
  metadata?: Record<string, unknown>,
  extra?: { username?: string; email?: string },
) {
  const utm = getUtm()
  const body = JSON.stringify({
    event_type,
    path: typeof window !== 'undefined' ? window.location.pathname : '/',
    metadata: { ...(metadata || {}), ...(utm ? { utm } : {}) },
    referrer: typeof window !== 'undefined' ? (document.referrer || '') : '',
    ...(extra?.username ? { username: extra.username } : {}),
    ...(extra?.email ? { email: extra.email } : {}),
  })
  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(err => {
    console.warn(`[analytics] trackEvent ${event_type} failed:`, err)
    try { navigator.sendBeacon('/api/track', body) } catch {}
  })
}
