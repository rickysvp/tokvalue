'use client'

import Image from 'next/image'
import { useRef, useCallback, useState } from 'react'
import { X, Download, Loader2, ImageDown } from 'lucide-react'
import html2canvas from 'html2canvas'
import type { Evaluation } from '@/types'
import { useI18n } from '@/lib/i18n'
import { formatNumber } from '@/lib/format'
import { TOKVALUE_LOGO_BASE64 } from '@/lib/logo-base64'



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
 * - 1080×1920 output (TikTok/IG 9:16 portrait)
 * - html2canvas-safe: no background-clip:text, no filter, no backdrop-filter
 */
export function ShareCardModal({ isOpen, onClose, result }: ShareCardModalProps) {
  const { dict } = useI18n()
  const cardRef = useRef<HTMLDivElement>(null)
  const [generating, setGenerating] = useState(false)

  // const color = tierColor(result.tier) // reserved for future use
  // Show highest value for bragging rights
  const valueHigh = result.businessValue.totalValue.high
  const valueDisplay = valueHigh >= 1000000 
    ? `$${(valueHigh / 1000000).toFixed(1)}M`
    : valueHigh >= 1000 
    ? `$${(valueHigh / 1000).toFixed(0)}K`
    : `$${valueHigh}`

  // Get avatar initial for fallback
  const avatarInitial = result.nickname?.[0]?.toUpperCase() || result.username[0]?.toUpperCase() || '?'

  // 10 dimensions for radar chart (DimensionScores object → array)
  const d = result.dimensions
  const dimensions = [
    { label: 'Reach',      value: d?.reach      ?? 80 },
    { label: 'Engage',     value: d?.engagement  ?? 80 },
    { label: 'Content',    value: d?.content     ?? 80 },
    { label: 'Authentic',  value: d?.authenticity ?? 80 },
    { label: 'Momentum',   value: d?.momentum    ?? 80 },
    { label: 'Stable',     value: d?.stability   ?? 80 },
    { label: 'Commerce',   value: d?.commerce    ?? 80 },
    { label: 'Monetize',   value: d?.monetization ?? 80 },
    { label: 'Health',     value: d?.health      ?? 80 },
    { label: 'Influence',  value: d?.influence   ?? 80 },
  ]

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
            <h3 className="text-base font-semibold text-white">Share your TokValue</h3>
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

          <div className="flex justify-center overflow-auto">
            {/* Share Card — 540×960 logical, 1080×1920 actual */}
            <div
              ref={cardRef}
              className="relative w-[540px] h-[960px] rounded-[28px] overflow-hidden flex flex-col"
              style={{
                background: `
                  radial-gradient(120% 80% at 12% -8%, rgba(255,0,80,0.15) 0%, transparent 46%),
                  radial-gradient(120% 90% at 100% 110%, rgba(0,242,234,0.10) 0%, transparent 50%),
                  #0E0E14
                `,
                border: '1px solid #262626',
              }}
            >
              {/* Subtle grid pattern */}
              <div 
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: `
                    linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)
                  `,
                  backgroundSize: '30px 30px',
                  opacity: 0.45,
                }}
              />

              {/* Content container */}
              <div className="relative flex-1 flex flex-col p-10">
                
                {/* Top accent line */}
                <div 
                  className="h-[3px] w-full rounded-full mb-6"
                  style={{ background: 'linear-gradient(90deg, #FF0050, #00F2EA)' }}
                />

                {/* User Profile Header */}
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  {result.avatarData || result.avatar ? (
                    <Image 
                      src={result.avatarData || result.avatar || ''} 
                      alt=""
                      width={64}
                      height={64}
                      className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                      style={{
                        boxShadow: '0 0 0 2px #FF0050, 0 0 0 4px rgba(0,242,234,0.5)',
                      }}
                    />
                  ) : (
                    <div 
                      className="w-16 h-16 rounded-full flex items-center justify-center text-[24px] font-extrabold text-white flex-shrink-0"
                      style={{ 
                        background: 'linear-gradient(135deg, #2a2a36, #15151d)',
                        boxShadow: '0 0 0 2px #FF0050, 0 0 0 4px rgba(0,242,234,0.5)',
                      }}
                    >
                      {avatarInitial}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex items-center gap-2">
                      <div className="text-xl font-bold text-white leading-tight">{result.nickname || result.username}</div>
                      {result.verified && (
                        <div className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-[#00F2EA]/15 text-[#00F2EA] text-[10px] font-semibold">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                        </div>
                      )}
                    </div>
                    <div className="text-[#8B8792] text-[14px]">@{result.username}</div>
                  </div>
                  {/* Tier Badge - no circle, larger text */}
                  <div className="flex-shrink-0">
                    <span 
                      className="text-[56px] font-black leading-none"
                      style={{ 
                        color: '#FF0050',
                        textShadow: '0 0 30px rgba(255,0,80,0.5)',
                      }}
                    >
                      {result.tier}
                    </span>
                  </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-[#262626] my-5" />

                {/* Stats Row */}
                <div className="flex">
                  <div className="flex-1 text-center relative">
                    <div className="text-[26px] font-extrabold text-white tracking-tight">{formatNumber(result.followerCount)}</div>
                    <div className="text-[9.5px] tracking-[0.14em] text-[#5C5866] uppercase mt-1.5">Followers</div>
                  </div>
                  <div className="flex-1 text-center relative">
                    <div className="absolute left-0 top-[12%] h-[76%] w-px bg-[#262626]" />
                    <div className="text-[26px] font-extrabold text-white tracking-tight">{formatNumber(result.totalLikes || 0)}</div>
                    <div className="text-[9.5px] tracking-[0.14em] text-[#5C5866] uppercase mt-1.5">Likes</div>
                  </div>
                  <div className="flex-1 text-center relative">
                    <div className="absolute left-0 top-[12%] h-[76%] w-px bg-[#262626]" />
                    <div className="text-[26px] font-extrabold text-white tracking-tight">{formatNumber(result.videoCount || 0)}</div>
                    <div className="text-[9.5px] tracking-[0.14em] text-[#5C5866] uppercase mt-1.5">Videos</div>
                  </div>
                </div>

                {/* Main Value — Highest value for bragging */}
                <div className="mt-8 text-center">
                  <div className="text-[11px] tracking-[0.22em] text-[#8B8792] uppercase mb-3">Estimated Account Value</div>
                  <div 
                    className="text-[78px] font-extrabold tracking-tight leading-none"
                    style={{ 
                      color: '#fff',
                      textShadow: '0 0 48px rgba(255,0,80,0.52)',
                    }}
                  >
                    {valueDisplay}
                  </div>
                </div>

                {/* Radar Chart */}
                <div className="flex justify-center mt-12 px-4">
                  <svg width="340" height="340" viewBox="0 0 280 280">
                    <defs>
                      <linearGradient id="radarGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#FF0050" />
                        <stop offset="100%" stopColor="#00F2EA" />
                      </linearGradient>
                    </defs>
                    {/* Grid rings */}
                    {[0.25, 0.5, 0.75, 1].map((f, i) => {
                      const points = dimensions.map((_, idx) => {
                        const angle = (-90 + idx * 36) * Math.PI / 180
                        const r = 88 * f
                        return `${140 + r * Math.cos(angle)},${140 + r * Math.sin(angle)}`
                      }).join(' ')
                      return (
                        <polygon
                          key={i}
                          points={points}
                          fill="none"
                          stroke="rgba(255,255,255,0.08)"
                          strokeWidth="1"
                        />
                      )
                    })}
                    {/* Axes and labels */}
                    {dimensions.map((dim, i) => {
                      const angle = (-90 + i * 36) * Math.PI / 180
                      const x = 140 + 88 * Math.cos(angle)
                      const y = 140 + 88 * Math.sin(angle)
                      const lx = 140 + 114 * Math.cos(angle)
                      const ly = 140 + 114 * Math.sin(angle)
                      return (
                        <g key={i}>
                          <line x1="140" y1="140" x2={x} y2={y} stroke="rgba(255,255,255,0.10)" strokeWidth="1" />
                          <text
                            x={lx}
                            y={ly + 3}
                            fill="#6B6770"
                            fontSize="8.5"
                            fontFamily="Sora, sans-serif"
                            textAnchor="middle"
                          >
                            {dim.label}
                          </text>
                        </g>
                      )
                    })}
                    {/* Data polygon */}
                    <polygon
                      points={dimensions.map((dim, i) => {
                        const angle = (-90 + i * 36) * Math.PI / 180
                        const r = 88 * (dim.value / 100)
                        return `${140 + r * Math.cos(angle)},${140 + r * Math.sin(angle)}`
                      }).join(' ')}
                      fill="url(#radarGrad)"
                      fillOpacity="0.28"
                      stroke="url(#radarGrad)"
                      strokeWidth="2.5"
                    />
                    {/* Vertex dots */}
                    {dimensions.map((dim, i) => {
                      const angle = (-90 + i * 36) * Math.PI / 180
                      const r = 88 * (dim.value / 100)
                      const x = 140 + r * Math.cos(angle)
                      const y = 140 + r * Math.sin(angle)
                      return (
                        <circle key={i} cx={x} cy={y} r="2.6" fill="#fff" />
                      )
                    })}
                  </svg>
                </div>
                <div className="text-center text-[10px] tracking-[0.18em] text-[#5C5866] uppercase mt-2 mb-6">
                  Performance Profile · 10 Dimensions
                </div>

                {/* Spacer to push footer down */}
                <div className="flex-1 min-h-[20px]" />

                {/* Footer: Brand + CTA */}
                <div 
                  className="flex items-center justify-between pt-4 border-t border-[#262626]"
                >
                  <div className="flex items-center" style={{ maxWidth: '140px' }}>
                    <img 
                      src={TOKVALUE_LOGO_BASE64} 
                      alt="TokValue" 
                      className="w-full h-auto object-contain"
                      style={{ maxHeight: '32px' }}
                    />
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-[#8B8792]">What&apos;s your account worth?</div>
                    <div className="text-sm text-[#00F2EA] font-bold">tokvalue.com</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-6 flex flex-col gap-3">
            {/* Download button */}
            <button
              onClick={handleDownload}
              disabled={generating}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF0050] to-[#e60049] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#FF0050]/25 hover:from-[#e60049] hover:to-[#cc0040] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {generating ? dict.evaluation.shareCardDownloading : 'Download Share Card'}
            </button>

            {/* Share buttons */}
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  if (!cardRef.current) return
                  try {
                    const canvas = await html2canvas(cardRef.current, { backgroundColor: null, scale: 2, useCORS: true, allowTaint: true, logging: false })
                    const link = document.createElement('a')
                    link.download = `tokvalue-${result.username}.png`
                    link.href = canvas.toDataURL('image/png')
                    link.click()
                    alert('Image saved! Open TikTok app to upload.')
                  } catch (err) { console.error('[share] failed:', err) }
                }}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#141414] border border-[#262626] px-4 py-3 text-sm font-medium text-white hover:bg-[#1a1a1a] transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>
                TikTok
              </button>
              <button
                onClick={async () => {
                  if (!cardRef.current) return
                  try {
                    const canvas = await html2canvas(cardRef.current, { backgroundColor: null, scale: 2, useCORS: true, allowTaint: true, logging: false })
                    const link = document.createElement('a')
                    link.download = `tokvalue-${result.username}.png`
                    link.href = canvas.toDataURL('image/png')
                    link.click()
                    alert('Image saved! Open Instagram app to upload.')
                  } catch (err) { console.error('[share] failed:', err) }
                }}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#141414] border border-[#262626] px-4 py-3 text-sm font-medium text-white hover:bg-[#1a1a1a] transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                Instagram
              </button>
              <button
                onClick={() => {
                  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`My TikTok account is worth ${valueDisplay}! Check yours at tokvalue.com`)}`, '_blank')
                }}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#141414] border border-[#262626] px-4 py-3 text-sm font-medium text-white hover:bg-[#1a1a1a] transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                X
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ShareCardModal
