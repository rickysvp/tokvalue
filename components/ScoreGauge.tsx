'use client'

import { useId, useMemo } from 'react'
import { TIER_COLORS, tierLabel } from '@/lib/tier'
import { valueTierOf } from '@/lib/pillar'

interface ScoreGaugeProps {
  score: number
  tier: string
  size?: number
  stroke?: number
  showLabel?: boolean
}

export function ScoreGauge({ score, tier, size = 160, stroke = 12, showLabel = false }: ScoreGaugeProps) {
  const gradientId = useId()
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const progress = useMemo(() => clamp(score / 100, 0, 1) * circumference, [score, circumference])
  const color = TIER_COLORS[tier] || '#FF0050'
  // Spec §7.2：S–F 字母 → 4 档价值层级短词（Premium / Growth / Developing / Early）
  const tierWord = valueTierOf(tier).replace(' Value', '')

  function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n))
  }

  // Auto-scale font size based on word length and ring dimensions（防溢出）
  const tierFontSize = Math.round(size * (tierWord.length >= 10 ? 0.17 : tierWord.length >= 7 ? 0.21 : 0.26))

  return (
    <div className="inline-flex flex-col items-center">
      <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${valueTierOf(tier)} account, score ${score}`}>
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FF0050" />
              <stop offset="100%" stopColor="#00F2EA" />
            </linearGradient>
          </defs>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={stroke}
            fill="transparent"
            className="text-neutral-800"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={`url(#${gradientId})`}
            strokeWidth={stroke}
            fill="transparent"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center px-2">
          <span className="font-extrabold capitalize tracking-tight leading-none" style={{ fontSize: tierFontSize, color }}>
            {tierWord}
          </span>
        </div>
      </div>
      {showLabel && (
        <p className="text-xs text-neutral-500 text-center mt-1 truncate max-w-full">
          {tierLabel(tier)}
        </p>
      )}
    </div>
  )
}
