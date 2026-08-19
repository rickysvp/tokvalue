'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Copy, Check, Mail, Send, Loader2, Link2 } from 'lucide-react'
import { getSessionToken } from '@/lib/credits-client'
import { trackEvent } from '@/lib/track-client'

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  username: string
}

export function ShareModal({ isOpen, onClose, username }: ShareModalProps) {
  const [shareUrl, setShareUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const createShareLink = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // share 接口已要求鉴权：仅付费用户可分享自己评估过的账号
      const token = getSessionToken()
      if (!token) throw new Error('LOGIN_REQUIRED')
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create share link')
      // B7 Spec §15：share 链接创建成功
      trackEvent('report_shared', { username })
      setShareUrl(data.shareUrl)
    } catch (err) {
      console.error('[share-link] failed:', err)
      setError(err instanceof Error && err.message === 'LOGIN_REQUIRED'
        ? 'Please verify your email first — sharing is available after unlocking.'
        : 'Failed to create share link. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [username])

  useEffect(() => {
    if (isOpen) {
      setCopied(false)
      createShareLink()
    }
  }, [isOpen, createShareLink])

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select text in input
      const input = document.getElementById('share-url-input') as HTMLInputElement
      if (input) {
        input.select()
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    }
  }

  function handleEmail() {
    const subject = encodeURIComponent(`Check out @${username}'s TikTok account value on TokValue`)
    const body = encodeURIComponent(`I found this TikTok account valuation report for @${username} — check it out:\n\n${shareUrl}`)
    window.open(`mailto:?subject=${subject}&body=${body}`)
  }

  function handleTwitter() {
    const text = encodeURIComponent(`@${username}'s TikTok account is worth how much? 💰 Check it out on TokValue:`)
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(shareUrl)}`)
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-neutral-700 bg-[#141414] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#FF0050]/20 to-[#00F2EA]/20 flex items-center justify-center">
              <Link2 className="h-4 w-4 text-[#00F2EA]" />
            </div>
            <h3 className="text-base font-semibold text-white">Share Report</h3>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white transition-colors rounded-lg p-1 hover:bg-neutral-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-[#00F2EA]" />
              <span className="ml-2 text-sm text-neutral-500">Creating share link...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-sm text-red-400 mb-4">{error}</p>
              <button
                onClick={createShareLink}
                className="text-sm text-[#00F2EA] hover:underline"
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              {/* URL Display + Copy */}
              <div className="mb-5">
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">Share Link</label>
                <div className="flex items-center gap-2">
                  <input
                    id="share-url-input"
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-xs text-neutral-300 outline-none focus:border-[#00F2EA] transition-colors"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    onClick={handleCopy}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all ${
                      copied
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-[#00F2EA] text-black hover:bg-[#00d9d2]'
                    }`}
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Share Buttons */}
              <div>
                <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">Share via</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleTwitter}
                    className="flex items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-medium text-neutral-300 hover:border-[#00F2EA] hover:text-[#00F2EA] transition-all"
                  >
                    <Send className="h-4 w-4" />
                    Twitter / X
                  </button>
                  <button
                    onClick={handleEmail}
                    className="flex items-center justify-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-medium text-neutral-300 hover:border-[#FF0050] hover:text-[#FF0050] transition-all"
                  >
                    <Mail className="h-4 w-4" />
                    Email
                  </button>
                </div>
              </div>

              {/* Footer hint */}
              <p className="mt-4 text-xs text-neutral-600 text-center leading-relaxed">
                Anyone with this link can view the full evaluation report for @{username}.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
