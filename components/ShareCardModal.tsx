'use client'

import { useRef, useCallback, useState } from 'react'
import { X, Download, Loader2, ImageDown } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import html2canvas from 'html2canvas'
import type { Evaluation } from '@/types'
import { useI18n } from '@/lib/i18n'
import { formatNumber, formatUsdRange } from '@/lib/format'
import { tierColor } from '@/lib/tier'
import { W_LOGO_BASE64 } from '@/lib/logo-base64'

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
  // Show highest value for bragging rights
  const valueHigh = result.businessValue.totalValue.high
  const valueDisplay = valueHigh >= 1000000 
    ? `$${(valueHigh / 1000000).toFixed(1)}M`
    : valueHigh >= 1000 
    ? `$${(valueHigh / 1000).toFixed(0)}K`
    : `$${valueHigh}`
  const engagement = result.metrics?.engagementRate != null ? `${result.metrics.engagementRate}%` : null
  // Get avatar initial for display
  const avatarInitial = result.nickname?.[0]?.toUpperCase() || result.username[0]?.toUpperCase() || '?'

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
                
                {/* User Profile Header */}
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div 
                    className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white"
                    style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}80 100%)` }}
                  >
                    {avatarInitial}
                  </div>
                  <div>
                    <div className="text-xl font-bold text-white">{result.nickname || result.username}</div>
                    <div className="text-neutral-400 text-sm">@{result.username}</div>
                    {result.verified && (
                      <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-[#00F2EA]/20 text-[#00F2EA] text-xs font-medium">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                        Verified
                      </div>
                    )}
                  </div>
                </div>

                {/* Main Value — Highest value for bragging */}
                <div className="mt-6 text-center">
                  <div className="text-xs font-medium text-neutral-500 uppercase tracking-widest mb-1">My Account Value</div>
                  <div 
                    className="text-8xl font-black tracking-tighter"
                    style={{ 
                      background: 'linear-gradient(135deg, #FF0050 0%, #00F2EA 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      filter: 'drop-shadow(0 4px 30px rgba(255,0,80,0.4))',
                    }}
                  >
                    {valueDisplay}
                  </div>
                  <div className="mt-2 text-sm text-neutral-400">up to</div>
                </div>

                {/* Bragging Stats Row */}
                <div className="mt-6 flex justify-center items-center gap-6">
                  {/* Tier Badge */}
                  <div className="text-center">
                    <div
                      className="flex items-center justify-center w-20 h-20 rounded-2xl mx-auto"
                      style={{ 
                        border: `3px solid ${color}`,
                        background: `${color}20`,
                        boxShadow: `0 0 30px ${color}40`,
                      }}
                    >
                      <span className="text-4xl font-black" style={{ color }}>{result.tier}</span>
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">Tier</div>
                  </div>
                  
                  {/* Score */}
                  <div className="text-center">
                    <div className="text-3xl font-black text-white">{result.score}</div>
                    <div className="text-xs text-neutral-500">/100 Score</div>
                  </div>
                  
                  {/* Followers */}
                  <div className="text-center">
                    <div className="text-3xl font-black text-white">{formatNumber(result.followerCount)}</div>
                    <div className="text-xs text-neutral-500">Followers</div>
                  </div>
                </div>

                {/* Engagement highlight */}
                {engagement && (
                  <div className="mt-4 text-center">
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
                      <span className="text-[#00F2EA] font-bold">{engagement}</span>
                      <span className="text-neutral-400 text-sm">engagement rate</span>
                    </span>
                  </div>
                )}

                {/* Spacer */}
                <div className="flex-1" />

                {/* Footer: Brand + CTA */}
                <div className="mt-auto pt-6 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img src={W_LOGO_BASE64} alt="TokValue" className="w-8 h-8 rounded-lg" />
                    <span className="text-white font-bold">TokValue</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-neutral-400">What&apos;s your account worth?</div>
                    <div className="text-sm text-[#00F2EA] font-medium">tokvalue.com</div>
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
