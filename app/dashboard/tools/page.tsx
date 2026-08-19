'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, BarChart3, Loader2, LogIn, TrendingUp, UserRound } from 'lucide-react'
import { getSessionToken, getActiveEmail } from '@/lib/credits-client'

interface ToolCard {
  key: string
  icon: typeof TrendingUp
  title: string
  description: string
  placeholder: string
  cta: string
}

// 三卡全部 funnel 到首页评估流（/evaluate/{username}），不造独立功能
const TOOLS: ToolCard[] = [
  {
    key: 'valuation',
    icon: TrendingUp,
    title: 'Valuation',
    description: 'Find out what a TikTok account is worth. Get an instant value range based on followers, engagement, and market data.',
    placeholder: 'Enter a TikTok username',
    cta: 'Value this account',
  },
  {
    key: 'scorecard',
    icon: BarChart3,
    title: 'Scorecard',
    description: 'Score any public creator across 10 dimensions. See strengths, weaknesses, and how the account ranks against similar creators.',
    placeholder: 'Enter a TikTok username',
    cta: 'Score this account',
  },
  {
    key: 'profile',
    icon: UserRound,
    title: 'Basic Creator Profile',
    description: 'Understand a creator at a glance: content categories, persona type, posting rhythm, and audience region.',
    placeholder: 'Enter a TikTok username',
    cta: 'Profile this account',
  },
]

export default function ToolsPage() {
  const router = useRouter()
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [authError, setAuthError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedEmail = getActiveEmail()
    const token = getSessionToken()
    if (!storedEmail || !token) {
      setAuthError(true)
    }
    setLoading(false)
  }, [])

  function handleSubmit(key: string, e: React.FormEvent) {
    e.preventDefault()
    const username = (inputs[key] || '').trim().replace(/^@/, '')
    if (!username) return
    router.push(`/evaluate/${encodeURIComponent(username)}`)
  }

  // ── 未登录：引导回首页 ──
  if (authError && !loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
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
          <h2 className="text-xl font-semibold text-white mb-2">Sign in to Use the Tools</h2>
          <p className="text-neutral-400 mb-6 max-w-md mx-auto leading-relaxed">
            Verify your email to value, score, and profile any TikTok account.
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
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-12 text-center">
          <Loader2 className="mx-auto h-10 w-10 text-neutral-600 mb-4 animate-spin" />
          <p className="text-neutral-400">Loading tools...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8">
        <Link href="/"
          className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-[#FF0050] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Evaluation
        </Link>
        <div className="mt-4">
          <h1 className="text-3xl font-bold">Tools</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Everything starts with one evaluation. Pick a tool and enter a username.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {TOOLS.map(tool => {
          const Icon = tool.icon
          return (
            <div
              key={tool.key}
              className="rounded-2xl border border-neutral-800 bg-[#141414] p-6 transition-colors hover:border-[#00F2EA]/30"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#00F2EA]/10">
                  <Icon className="h-5 w-5 text-[#00F2EA]" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-white">{tool.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-neutral-400">{tool.description}</p>

                  <form onSubmit={e => handleSubmit(tool.key, e)} className="mt-4">
                    <div className="flex items-center rounded-xl border border-neutral-700 bg-neutral-900/80 px-3 py-2 focus-within:border-[#FF0050] transition-colors">
                      <span className="mr-2 text-neutral-500">@</span>
                      <input
                        type="text"
                        value={inputs[tool.key] || ''}
                        onChange={e => setInputs(prev => ({ ...prev, [tool.key]: e.target.value }))}
                        placeholder={tool.placeholder}
                        aria-label={tool.placeholder}
                        autoComplete="off"
                        className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-600"
                      />
                      <button
                        type="submit"
                        disabled={!(inputs[tool.key] || '').trim()}
                        className="ml-3 inline-flex items-center gap-1.5 rounded-lg bg-[#FF0050] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#e60049] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {tool.cta}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
