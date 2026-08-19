'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowUpRight, FileText, Loader2, LogIn, LogOut, Mail, ShieldCheck } from 'lucide-react'
import {
  getSessionToken, getActiveEmail, setActiveEmail, setSessionToken, fetchBalance,
} from '@/lib/credits-client'

export default function SettingsPage() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(false)

  useEffect(() => {
    const storedEmail = getActiveEmail()
    const token = getSessionToken()

    if (!storedEmail || !token) {
      setAuthError(true)
      setLoading(false)
      return
    }

    // 以 /api/credits/balance 响应中的 email 为准（服务端从 session token 解出并确认）
    fetchBalance(storedEmail).then(balance => {
      if (balance?.email) {
        setEmail(balance.email)
      } else {
        // 余额接口失败（token 失效等）时回退到本地存储的邮箱
        setEmail(storedEmail)
      }
    }).finally(() => setLoading(false))
  }, [])

  function handleSignOut() {
    setActiveEmail(null)
    setSessionToken(null)
    router.push('/')
  }

  // ── 未登录：引导回首页 ──
  if (authError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-8">
          <Link href="/"
            className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-[#FF0050] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Evaluation
          </Link>
        </div>
        <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-12 text-center">
          <LogIn className="mx-auto h-10 w-10 text-neutral-600 mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Sign in to Manage Your Settings</h2>
          <p className="text-neutral-400 mb-6 max-w-md mx-auto leading-relaxed">
            Verify your email to access your account settings.
          </p>
          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF0050] to-[#e60049] px-5 py-2.5 text-sm font-semibold text-white hover:from-[#e60049] hover:to-[#cc0040] transition-all shadow-lg shadow-[#FF0050]/25"
          >
            Back to Home <ArrowLeft className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-12 text-center">
          <Loader2 className="mx-auto h-10 w-10 text-neutral-600 mb-4 animate-spin" />
          <p className="text-neutral-400">Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-8">
        <Link href="/"
          className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-[#FF0050] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Evaluation
        </Link>
        <div className="mt-4">
          <h1 className="text-3xl font-bold">Settings</h1>
        </div>
      </div>

      <div className="space-y-4">
        {/* 当前账号邮箱 */}
        <div className="flex items-center justify-between rounded-2xl border border-neutral-800 bg-[#141414] p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#00F2EA]/10">
              <Mail className="h-5 w-5 text-[#00F2EA]" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Signed in as
              </div>
              <div className="mt-0.5 font-semibold text-white break-all">{email}</div>
            </div>
          </div>
          <ShieldCheck className="h-5 w-5 text-neutral-600" />
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="flex w-full items-center justify-between rounded-2xl border border-neutral-800 bg-[#141414] p-5 text-left transition-colors hover:border-[#FF0050]/40"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FF0050]/10">
              <LogOut className="h-5 w-5 text-[#FF0050]" />
            </div>
            <div>
              <div className="font-semibold text-white">Sign out</div>
              <div className="mt-0.5 text-sm text-neutral-500">
                Clear your session on this device and return to the homepage.
              </div>
            </div>
          </div>
        </button>

        {/* Terms / Privacy */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/terms"
            className="flex items-center justify-between rounded-2xl border border-neutral-800 bg-[#141414] p-5 transition-colors hover:border-[#00F2EA]/30"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-800">
                <FileText className="h-5 w-5 text-neutral-400" />
              </div>
              <div className="font-semibold text-white">Terms of Service</div>
            </div>
            <ArrowUpRight className="h-4 w-4 text-neutral-500" />
          </Link>
          <Link
            href="/privacy"
            className="flex items-center justify-between rounded-2xl border border-neutral-800 bg-[#141414] p-5 transition-colors hover:border-[#00F2EA]/30"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-800">
                <ShieldCheck className="h-5 w-5 text-neutral-400" />
              </div>
              <div className="font-semibold text-white">Privacy Policy</div>
            </div>
            <ArrowUpRight className="h-4 w-4 text-neutral-500" />
          </Link>
        </div>
      </div>
    </div>
  )
}
