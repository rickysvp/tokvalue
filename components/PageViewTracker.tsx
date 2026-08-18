'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { captureUtm, getUtm } from '@/lib/utm'

/**
 * 生成 UUID v4。crypto.randomUUID() 仅在安全上下文（HTTPS / localhost）可用，
 * 非 HTTPS 部署时回退到 crypto.getRandomValues 手动拼接。
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // 回退：用 getRandomValues 生成 UUID v4
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
}

/**
 * 全站 page_view 埋点。
 * - 监听 pathname 变化，覆盖 SPA 客户端导航（避免只在首屏触发）
 * - 用 sessionStorage 存 session_id 做 UV 去重
 * - 单一来源：app/page.tsx 不再重复发 page_view
 */
export function PageViewTracker() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname) return
    // 采集 utm（首次访问时从 URL 解析写入 sessionStorage）
    captureUtm()
    // 从 sessionStorage 读取或生成 session_id（标签页级别去重）
    let sessionId = sessionStorage.getItem('tokvalue_sid')
    if (!sessionId) {
      sessionId = generateUUID()
      sessionStorage.setItem('tokvalue_sid', sessionId)
    }
    const utm = getUtm()
    const body = JSON.stringify({
      event_type: 'page_view',
      path: pathname,
      referrer: document.referrer || '',
      session_id: sessionId,
      ...(utm ? { metadata: { utm } } : {}),
    })
    // keepalive 确保页面卸载时请求仍能发出（替代 sendBeacon，且支持 POST + JSON）
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => { /* 埋点失败不影响用户体验 */ })
  }, [pathname])

  return null
}
