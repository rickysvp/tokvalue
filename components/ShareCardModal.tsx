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
 * Unlike ShareModal (paid-only link sharing), the share card is available to
 * everyone — it turns free-tier visible data (value range, tier, per-video
 * rate, follower count) into a viral-friendly image that drives discovery.
 *
 * All visual content is text/CSS/inline-SVG (no external images) so
 * html2canvas never taints the canvas via cross-origin resources.
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
        backgroundColor: '#0a0a0a',
        scale: 2, // 540×675 logical → 1080×1350 output
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
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-neutral-700 bg-[#141414] shadow-2xl"
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

          <div className="flex justify-center">
            {/* Logical 540×675, scaled up 2x on export */}
            <div
              ref={cardRef}
              style={{ width: 540, height: 675, backgroundColor: '#0a0a0a' }}
              className="relative rounded-2xl overflow-hidden border border-neutral-800"
            >
              {/* Background gradients */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(255,0,80,0.18),_transparent_55%)]" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(0,242,234,0.14),_transparent_55%)]" />

              {/* Content */}
              <div className="relative h-full flex flex-col p-10">
                {/* Top row: brand + label */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-7 w-7 rounded-lg bg-gradient-to-br from-[#FF0050] to-[#00F2EA]" />
                    <span className="text-xl font-black tracking-tight text-white">TokValue</span>
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
                    TikTok Account Valuation
                  </span>
                </div>

                {/* Account */}
                <div className="mt-8">
                  <div className="text-[15px] text-neutral-400">
                    @<span className="text-neutral-200 font-medium">{result.username}</span>
                  </div>
                  <div className="mt-1 text-[32px] font-black tracking-tight text-white leading-none">
                    {result.nickname}
                  </div>
                </div>

                {/* Value range — the hero number */}
                <div className="mt-6">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                    Estimated Account Value
                  </div>
                  <div className="mt-2 text-[56px] font-black tracking-tighter text-[#00F2EA] leading-none">
                    {valueRange}
                  </div>
                </div>

                {/* Tier + score badge */}
                <div className="mt-6 flex items-center gap-4">
                  <div
                    className="flex items-center justify-center h-16 w-16 rounded-2xl border-2"
                    style={{ borderColor: color }}
                  >
                    <span className="text-3xl font-black uppercase" style={{ color }}>
                      {result.tier}
                    </span>
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-white">Score {result.score}/100</div>
                    <div className="text-[11px] text-neutral-400">10-dimension analysis</div>
                  </div>
                </div>

                {/* Stats row */}
                <div className="mt-7 grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-center">
                    <div className="text-lg font-bold text-white tabular-nums">{formatNumber(result.followerCount)}</div>
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500">Followers</div>
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-center">
                    <div className="text-lg font-bold text-white tabular-nums">{engagement ?? '—'}</div>
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500">Engagement</div>
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-center">
                    <div className="text-lg font-bold text-white tabular-nums">{perVideo ?? '—'}</div>
                    <div className="text-[10px] uppercase tracking-wider text-neutral-500">Per Video</div>
                  </div>
                </div>

                {/* Footer: QR + CTA */}
                <div className="mt-auto flex items-center justify-between pt-6">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-white p-1.5">
                      <QRCodeSVG value="https://tokvalue.com" size={52} fgColor="#0a0a0a" bgColor="#ffffff" level="M" />
                    </div>
                    <div>
                      <div className="text-[13px] font-bold text-white">What&apos;s yours worth?</div>
                      <div className="text-[11px] text-neutral-400">Free valuation → tokvalue.com</div>
                    </div>
                  </div>
                  <span className="text-[10px] text-neutral-600">Estimate only, not financial advice</span>
                </div>
              </div>
            </div>
          </div>

          {/* Download button */}
          <button
            onClick={handleDownload}
            disabled={generating}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF0050] to-[#e60049] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#FF0050]/25 hover:from-[#e60049] hover:to-[#cc0040] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {generating ? dict.evaluation.shareCardDownloading : dict.evaluation.exportPng}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ShareCardModal
