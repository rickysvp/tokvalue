'use client'

import Link from 'next/link'
import { Gift } from 'lucide-react'
import { getServerDict } from '@/lib/i18n/server'

const dict = getServerDict()

/**
 * 推荐赚佣金入口（header 醒目 CTA）。
 * 独立金色渐变，区别于粉色主 CTA 与青色积分 pill，视觉上强调「分享即赚钱」。
 * 对所有用户展示（未登录点击进 referral 页会引导登录）。
 */
export function ReferralCta() {
  return (
    <Link
      href="/referral"
      className="group relative overflow-hidden rounded-full px-3.5 py-1.5 text-xs font-bold text-black shadow-lg shadow-amber-500/25 hover:shadow-xl hover:shadow-amber-500/40 transition-all"
      aria-label={dict.nav.referralCtaHint}
    >
      {/* 金色渐变底 */}
      <span className="absolute inset-0 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400" />
      {/* 扫光 */}
      <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/60 to-white/0 translate-x-[-120%] group-hover:translate-x-[120%] transition-transform duration-700" />
      {/* 内容 */}
      <span className="relative z-10 flex items-center gap-1.5">
        <Gift className="h-3.5 w-3.5" />
        {dict.nav.referralCta}
        <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
        </span>
      </span>
    </Link>
  )
}
