'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { BarChart3, Clock, ChevronDown, LogOut, Share2 } from 'lucide-react'
import { getServerDict } from '@/lib/i18n/server'

const dict = getServerDict()

interface UserMenuProps {
  email: string
  onSwitchAccount: () => void
}

/**
 * 登录后的用户邮箱下拉菜单。
 * 收纳非常用入口（Tracker / History）与「切换账号」，释放顶部导航栏空间。
 */
export function UserMenu({ email, onSwitchAccount }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      {/* 触发器：邮箱 pill */}
      <button
        onClick={() => setOpen(v => !v)}
        className="hidden sm:flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900/60 py-0.5 pl-0.5 pr-2.5 min-w-0 hover:border-neutral-600 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-[#FF0050] to-[#00F2EA] flex items-center justify-center text-[10px] font-bold text-black shrink-0">
          {(email[0] || '?').toUpperCase()}
        </div>
        <span className="text-[11px] text-neutral-400 truncate max-w-[120px]" title={email}>
          {email}
        </span>
        <ChevronDown className={`h-3 w-3 text-neutral-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* 下拉面板 */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-neutral-800 bg-[#141414] shadow-2xl shadow-black/60 overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-neutral-800/60">
            <p className="text-[10px] text-neutral-500 truncate" title={email}>{email}</p>
          </div>
          <div className="p-1">
            <Link
              href="/referral"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800/60 hover:text-white transition-colors"
            >
              <Share2 className="h-4 w-4 text-[#FF0050]" />
              {dict.nav.referral}
            </Link>
            <Link
              href="/tracker"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800/60 hover:text-white transition-colors"
            >
              <BarChart3 className="h-4 w-4 text-cyan-400" />
              {dict.nav.tracker}
            </Link>
            <Link
              href="/history"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800/60 hover:text-white transition-colors"
            >
              <Clock className="h-4 w-4 text-cyan-400" />
              {dict.nav.history}
            </Link>
          </div>
          <div className="border-t border-neutral-800/60 p-1">
            <button
              onClick={() => { setOpen(false); onSwitchAccount() }}
              className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800/60 hover:text-white transition-colors"
            >
              <LogOut className="h-4 w-4 text-neutral-500" />
              {dict.common.switchAccount}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
