'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Shield, Lock, Loader2 } from 'lucide-react'

export default function AdminLoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!password || loading) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/tiktokmaster/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '密码错误')
        return
      }
      // token 已由服务端经 Set-Cookie 写入 httpOnly cookie（同源 fetch 自动携带），
      // 前端 JS 不再接触 token，XSS 无法窃取
      router.push('/tiktokmaster/dashboard')
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-[#0a0a0a]">
      {/* 背景光晕 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-[#00F2EA]/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/3 w-96 h-96 bg-[#FF0050]/5 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-sm relative">
        <div className="rounded-2xl border border-neutral-800 bg-[#141414]/80 backdrop-blur-xl p-8">
          <div className="flex justify-center mb-6">
            <Image src="/tokvalue.png" alt="TokValue" width={120} height={30} className="h-8 w-auto object-contain" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-6">
            <Shield className="h-5 w-5 text-[#00F2EA]" />
            <h1 className="text-lg font-bold text-neutral-200">管理后台</h1>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-xs text-neutral-500 mb-2">管理员密码</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-600" />
                <input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  placeholder="请输入管理员密码"
                  className="w-full rounded-xl border border-neutral-700 bg-[#0f0f0f] pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-[#00F2EA] focus:outline-none"
                  autoFocus
                />
              </div>
            </div>

            {error && (
              <div className="text-xs text-red-400 mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full rounded-xl bg-[#00F2EA] text-black font-semibold py-2.5 text-sm hover:bg-[#00D8D0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? '登录中...' : '登录'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-neutral-700 mt-4">
          TokValue 管理后台 · 仅限授权访问
        </p>
      </div>
    </main>
  )
}