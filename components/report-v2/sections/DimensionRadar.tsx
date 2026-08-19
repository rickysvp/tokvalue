'use client'

import { Evaluation } from '@/types'
import { radarPolygonPoints, radarAxisAnchors } from '../radar-geometry'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

const DIMENSION_KEYS = [
  'reach',
  'engagement',
  'content',
  'authenticity',
  'momentum',
  'stability',
  'commerce',
  'monetization',
  'health',
  'influence',
] as const

type DimensionKey = (typeof DIMENSION_KEYS)[number]

const CX = 120
const CY = 120
const RADIUS = 100
const GRID_LEVELS = [33, 66, 100]

function toPointsString(points: { x: number; y: number }[]): string {
  return points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
}

function anchorFor(x: number): 'start' | 'middle' | 'end' {
  if (x > CX + 1) return 'start'
  if (x < CX - 1) return 'end'
  return 'middle'
}

export function DimensionRadar({ result, dict }: { result: Evaluation; dict: EnDict }) {
  const r = dict.reportV2.radar
  const scores = DIMENSION_KEYS.map(k => result.dimensions[k])
  const dataPoints = radarPolygonPoints(scores, CX, CY, RADIUS)
  const gridRings = GRID_LEVELS.map(level =>
    radarPolygonPoints(new Array(DIMENSION_KEYS.length).fill(level), CX, CY, RADIUS),
  )
  const axisEnds = radarAxisAnchors(DIMENSION_KEYS.length, CX, CY, RADIUS)
  const labelAnchors = radarAxisAnchors(DIMENSION_KEYS.length, CX, CY, 112)

  return (
    <section>
      <SectionHeader index={3} title={r.title} subtitle={r.subtitle} id="dimension-radar" />
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="grid gap-6 sm:grid-cols-[240px,1fr]">
          <div>
            {/* 左右两侧 label 会超出 240 宽的 viewBox，overflow-visible 让其可见 */}
            <svg
              viewBox="0 0 240 240"
              className="w-full max-w-[240px] overflow-visible"
              role="img"
              aria-label={r.title}
            >
              {gridRings.map((ring, i) => (
                <polygon
                  key={i}
                  points={toPointsString(ring)}
                  fill="none"
                  stroke="#E5E7EB"
                  strokeWidth={1}
                />
              ))}
              {axisEnds.map((end, i) => (
                <line
                  key={i}
                  x1={CX}
                  y1={CY}
                  x2={end.x}
                  y2={end.y}
                  stroke="#E5E7EB"
                  strokeWidth={1}
                />
              ))}
              <polygon
                points={toPointsString(dataPoints)}
                fill="rgba(29,78,216,0.15)"
                stroke="#1d4ed8"
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {labelAnchors.map((a, i) => (
                <text
                  key={i}
                  x={a.x}
                  y={a.y}
                  fontSize={11}
                  fill="#6B7280"
                  textAnchor={anchorFor(a.x)}
                  dominantBaseline="middle"
                >
                  {r.labels[DIMENSION_KEYS[i]]}
                </text>
              ))}
            </svg>
            <p className="mt-3 text-xs leading-relaxed text-[#9CA3AF]">{r.caption}</p>
          </div>

          <div className="space-y-3.5 sm:pl-2">
            {DIMENSION_KEYS.map(key => {
              const score = result.dimensions[key]
              return (
                <div key={key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-[#111827]">{r.labels[key]}</span>
                    <span className="text-sm font-semibold tabular-nums text-[#111827]">{score}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-[#F3F4F6]">
                    <div
                      className="h-full rounded-full bg-[#1d4ed8]"
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
