'use client'

import { useRef, useCallback, useState } from 'react'
import { X, Download, Loader2, ImageDown } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import html2canvas from 'html2canvas'
import type { Evaluation } from '@/types'
import { useI18n } from '@/lib/i18n'
import { formatNumber, formatUsdRange } from '@/lib/format'
import { tierColor } from '@/lib/tier'

interface ShareCardModalProps {
  isOpen: boolean
  onClose: () => void
  result: Evaluation
}

/**
 * ShareCardModal — generate a ready-to-post social image for a valuation.
 *
 * Design principles:
 * - Clean, professional layout with clear visual hierarchy
 * - TokValue brand identity: gradient (#FF0050 → #00F2EA) + bold typography
 * - No external images (CORS-safe for html2canvas)
 * - 1080×1350 output (Instagram 4:5 portrait)
 */
export function ShareCardModal({ isOpen, onClose, result }: ShareCardModalProps) {
  const { dict } = useI18n()
  const cardRef = useRef<HTMLDivElement>(null)
  const [generating, setGenerating] = useState(false)

  const color = tierColor(result.tier)
  const valueRange = formatUsdRange(result.businessValue.totalValue.low, result.businessValue.totalValue.high)
  const perVideo = result.brandDealPerVideo
    ? formatUsdRange(result.brandDealPerVideo.low, result.brandDealPerVideo.high)
    : null
  const engagement = result.metrics?.engagementRate != null ? `${result.metrics.engagementRate}%` : null

  const handleDownload = useCallback(async () => {
    if (!cardRef.current || generating) return
    setGenerating(true)
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      })
      const link = document.createElement('a')
      link.download = `tokvalue-${result.username}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } catch (err) {
      console.error('[share-card] failed:', err)
    } finally {
      setGenerating(false)
    }
  }, [result.username, generating])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-neutral-700 bg-[#141414] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#FF0050]/20 to-[#00F2EA]/20 flex items-center justify-center">
              <ImageDown className="h-4 w-4 text-[#00F2EA]" />
            </div>
            <h3 className="text-base font-semibold text-white">{dict.evaluation.shareCard}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white transition-colors rounded-lg p-1 hover:bg-neutral-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Card preview */}
        <div className="p-5">
          <p className="text-xs text-neutral-500 mb-4">{dict.evaluation.shareCardHint}</p>

          <div className="flex justify-center overflow-auto">
            {/* Share Card — 540×675 logical, 1080×1350 actual */}
            <div
              ref={cardRef}
              className="relative w-[540px] h-[675px] rounded-3xl overflow-hidden flex flex-col"
              style={{
                background: 'linear-gradient(145deg, #0f0f0f 0%, #1a1a1a 50%, #0f0f0f 100%)',
              }}
            >
              {/* Subtle brand gradient orbs */}
              <div 
                className="absolute -top-20 -left-20 w-64 h-64 rounded-full opacity-30"
                style={{ background: 'radial-gradient(circle, rgba(255,0,80,0.4) 0%, transparent 70%)' }}
              />
              <div 
                className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full opacity-30"
                style={{ background: 'radial-gradient(circle, rgba(0,242,234,0.4) 0%, transparent 70%)' }}
              />

              {/* Content container */}
              <div className="relative flex-1 flex flex-col p-12">
                
                {/* Header: Brand */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* TokValue Logo — CSS-drawn to avoid CORS */}
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-lg"
                      style={{ 
                        background: 'linear-gradient(135deg, #FF0050 0%, #00F2EA 100%)',
                        boxShadow: '0 4px 20px rgba(255,0,80,0.3)',
                      }}
                    >
                      TV
                    </div>
                    <div>
                      <div className="text-xl font-black text-white tracking-tight">TokValue</div>
                      <div className="text-[10px] font-medium text-neutral-400 uppercase tracking-widest">
                        TikTok Valuation
                      </div>
                    </div>
                  </div>
                </div>

                {/* Account Info */}
                <div className="mt-8">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                    <span className="text-neutral-400 text-sm">@</span>
                    <span className="text-white font-semibold text-sm">{result.username}</span>
                  </div>
                  <h2 className="mt-3 text-3xl font-bold text-white leading-tight">
                    {result.nickname}
                  </h2>
                </div>

                {/* Main Value — Hero Section */}
                <div className="mt-8">
                  <div className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">
                    Estimated Account Value
                  </div>
                  <div 
                    className="text-6xl font-black tracking-tighter leading-none"
                    style={{ 
                      background: 'linear-gradient(90deg, #FF0050 0%, #00F2EA 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    {valueRange}
                  </div>
                </div>

                {/* Tier Badge Row */}
                <div className="mt-6 flex items-center gap-4">
                  <div
                    className="flex items-center justify-center w-20 h-20 rounded-2xl border-3"
                    style={{ 
                      borderColor: color,
                      background: `${color}15`,
                      boxShadow: `0 0 30px ${color}30`,
                    }}
                  >
                    <span className="text-4xl font-black" style={{ color }}>
                      {result.tier}
                    </span>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-white">{result.score}<span className="text-neutral-500 text-lg">/100</span></div>
                    <div className="text-sm text-neutral-400">Overall Score</div>
                    <div className="text-xs text-neutral-500 mt-0.5">10-dimension analysis</div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="mt-8 grid grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-4 text-center">
                    <div className="text-xl font-bold text-white tabular-nums">{formatNumber(result.followerCount)}</div>
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500 mt-1">Followers</div>
                  </div>
                  <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-4 text-center">
                    <div className="text-xl font-bold text-white tabular-nums">{engagement ?? '—'}</div>
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500 mt-1">Engagement</div>
                  </div>
                  <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-4 text-center">
                    <div className="text-xl font-bold text-white tabular-nums">{perVideo ?? '—'}</div>
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500 mt-1">Per Video</div>
                  </div>
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Footer: CTA + QR */}
                <div className="mt-8 pt-6 border-t border-white/[0.08]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="rounded-xl bg-white p-2 shadow-lg">
                        <QRCodeSVG value="https://tokvalue.com" size={56} fgColor="#0a0a0a" bgColor="#ffffff" level="M" />
                      </div>
                      <div>
                        <div className="text-white font-bold text-base">What&apos;s your account worth?</div>
                        <div className="text-neutral-400 text-sm">Free valuation at <span className="text-[#00F2EA] font-medium">tokvalue.com</span></div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 text-[10px] text-neutral-600 text-center">
                    Estimate only · Not financial advice · Data from public sources
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Download button */}
          <button
            onClick={handleDownload}
            disabled={generating}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF0050] to-[#e60049] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#FF0050]/25 hover:from-[#e60049] hover:to-[#cc0040] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {generating ? dict.evaluation.shareCardDownloading : 'Download Share Card'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ShareCardModal
