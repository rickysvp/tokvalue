'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Search, ScanLine, Radar, TrendingUp } from 'lucide-react'

interface HowItWorksProps {
  dict: {
    badge: string
    title: string
    steps: ReadonlyArray<{ number: string; title: string; desc: string }>
    cta: string
  }
}

/* ─────────────────────────────────────────────────────────────
   Demo data — fixed, hand-tuned shape so the motion reads clearly.
────────────────────────────────────────────────────────────── */
const DEMO_PROFILE = {
  nickname: 'Maya Chen',
  handle: '@mayacreates',
  avatarInitial: 'M',
  followers: '1.2M',
  likes: '48.6M',
  videos: '512',
}

const DEMO_DIMS = [
  { label: 'Reach', value: 85 },
  { label: 'Engage', value: 78 },
  { label: 'Content', value: 70 },
  { label: 'Authentic', value: 62 },
  { label: 'Momentum', value: 80 },
  { label: 'Stable', value: 75 },
  { label: 'Commerce', value: 88 },
  { label: 'Monetize', value: 82 },
  { label: 'Health', value: 72 },
  { label: 'Influence', value: 76 },
]

const DEMO_VALUE = 2_100_000
const DEMO_VALUE_LOW = 1_700_000
const DEMO_VALUE_HIGH = 2_600_000
const DEMO_TIER = 'A'

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

/* ─── mount-triggered animation flag ────────────────────────── */
function useReveal(delay = 60) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setOn(true), delay)
    return () => clearTimeout(t)
  }, [delay])
  return on
}

/* ─── scene progress (interval-driven, rAF-free so it also
       completes under throttled/headless environments) ──────── */
function useProgress(active: boolean, duration = 2600) {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (!active) {
      setProgress(0)
      return
    }
    const steps = 48
    const stepMs = duration / steps
    let i = 0
    const id = setInterval(() => {
      i++
      const t = i / steps
      setProgress(1 - Math.pow(1 - t, 3))
      if (i >= steps) clearInterval(id)
    }, stepMs)
    return () => clearInterval(id)
  }, [active, duration])
  return progress
}

/* ─── SVG radar helpers ─────────────────────────────────────── */
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

function RadarSVG({ values, progress }: { values: { label: string; value: number }[]; progress: number }) {
  const cx = 180
  const cy = 180
  const R = 95
  const total = values.length
  const levels = [0.25, 0.5, 0.75, 1]

  // per-vertex staggered growth: vertex i sprouts from center in sequence
  const WINDOW = total + 2
  const vertexEase = (i: number) => {
    const start = i / WINDOW
    const end = (i + 1.5) / WINDOW
    const p = clamp((progress - start) / (end - start), 0, 1)
    return 1 - Math.pow(1 - p, 3)
  }
  const dataPos = (i: number) => polar(cx, cy, (R * values[i].value) / 100, -90 + (i * 360) / total)
  const vertexPos = (i: number) => {
    const p = vertexEase(i)
    const d = dataPos(i)
    return { x: cx + (d.x - cx) * p, y: cy + (d.y - cy) * p }
  }

  const ringPoints = (fraction: number) =>
    values.map((_, i) => polar(cx, cy, R * fraction, -90 + (i * 360) / total)).map((p) => `${p.x},${p.y}`).join(' ')

  const axisEnds = values.map((_, i) => polar(cx, cy, R, -90 + (i * 360) / total))
  const labelPts = values.map((_, i) => polar(cx, cy, R + 24, -90 + (i * 360) / total))

  const polyPoints = values.map((_, i) => {
    const p = vertexPos(i)
    return `${p.x},${p.y}`
  }).join(' ')

  const ringOp = clamp(progress / 0.18, 0, 1)
  const axisOp = clamp((progress - 0.04) / 0.3, 0, 1)

  return (
    <svg viewBox="0 0 360 360" className="w-full h-full" role="img" aria-label="10-dimension analysis radar">
      {/* grid rings — fade in early */}
      {levels.map((lv, i) => (
        <polygon
          key={i}
          points={ringPoints(lv)}
          fill="none"
          stroke="#27272a"
          strokeWidth="0.6"
          opacity={ringOp * (0.45 + 0.55 * (i / (levels.length - 1)))}
        />
      ))}
      {/* axes — draw outward once, subtle */}
      {axisEnds.map((p, i) => (
        <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#2a2931" strokeWidth="0.6" opacity={axisOp} />
      ))}
      {/* data polygon — sprouts vertex by vertex from center */}
      <polygon
        points={polyPoints}
        fill="#FF0050"
        fillOpacity="0.14"
        stroke="#FF0050"
        strokeWidth="1.6"
        strokeLinejoin="round"
        opacity={clamp(progress / 0.1, 0, 1)}
      />
      {/* vertex dots — light up as each vertex lands */}
      {values.map((_, i) => {
        const p = vertexPos(i)
        return <circle key={i} cx={p.x} cy={p.y} r="2.6" fill="#FF0050" opacity={vertexEase(i)} />
      })}
      {/* labels — light up in sweep order, synced to each vertex */}
      {values.map((d, i) => {
        const p = labelPts[i]
        const anchor = p.x < cx - 20 ? 'end' : p.x > cx + 20 ? 'start' : 'middle'
        return (
          <text
            key={i}
            x={p.x}
            y={p.y}
            textAnchor={anchor}
            dominantBaseline="middle"
            fontSize="11"
            fontWeight="600"
            fill={i % 2 === 0 ? '#f5f5f5' : '#8b8792'}
            opacity={vertexEase(i)}
          >
            {d.label}
          </text>
        )
      })}
    </svg>
  )
}

function formatUsd(n: number) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return '$' + Math.round(n)
}

function formatFullUsd(n: number) {
  return '$' + n.toLocaleString('en-US')
}

/* ─── Step 1 · Scan the account ─────────────────────────────── */
function SceneScan({ active }: { active: boolean }) {
  const on = useReveal()
  const play = active && on
  return (
    <div className="relative flex flex-col items-center justify-center h-full px-6">
      <div className="w-full max-w-[300px] rounded-2xl border border-[#1F1D26] bg-[#0E0E14] p-5 relative overflow-hidden">
        {/* sweeping scan line with trailing glow */}
        <div
          className="pointer-events-none absolute inset-x-0"
          style={{
            height: 44,
            top: -44,
            background: 'linear-gradient(180deg, transparent, rgba(0,242,234,0.14) 45%, rgba(0,242,234,0.85) 100%)',
            filter: 'blur(0.5px)',
            animation: play ? 'hiw-scan 2.4s cubic-bezier(0.4,0,0.6,1) infinite' : 'none',
          }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent, #00F2EA, transparent)',
            boxShadow: '0 0 22px 2px rgba(0,242,234,0.5)',
            animation: play ? 'hiw-scan 2.4s cubic-bezier(0.4,0,0.6,1) infinite' : 'none',
          }}
        />

        {/* header */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#00F2EA] inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#00F2EA] animate-scan-pulse" />
            Scanning
          </span>
          <ScanLine className="h-3.5 w-3.5 text-[#00F2EA]" />
        </div>

        {/* avatar with rotating radar sweep ring */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative h-14 w-14 shrink-0">
            <svg className="absolute inset-0 h-full w-full animate-scan-rotate" viewBox="0 0 56 56" fill="none">
              <circle cx="28" cy="28" r="26.5" stroke="rgba(0,242,234,0.18)" strokeWidth="2" />
              <circle
                cx="28"
                cy="28"
                r="26.5"
                stroke="#00F2EA"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="42 124"
                style={{ filter: 'drop-shadow(0 0 6px rgba(0,242,234,0.8))' }}
              />
            </svg>
            <div className="absolute inset-[4px] rounded-full bg-[#0E0E14] flex items-center justify-center text-lg font-bold text-white">
              {DEMO_PROFILE.avatarInitial}
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold text-white" style={{ opacity: play ? 1 : 0.25, transition: 'opacity 0.5s ease 0.5s' }}>
              {DEMO_PROFILE.nickname}
            </div>
            <div className="text-xs text-neutral-400" style={{ opacity: play ? 1 : 0.25, transition: 'opacity 0.5s ease 0.65s' }}>
              {DEMO_PROFILE.handle}
            </div>
          </div>
        </div>

        {/* data rows — light up as scan passes */}
        <div className="grid grid-cols-3 gap-2 border-t border-[#1F1D26] pt-3">
          {[
            { k: 'Followers', v: DEMO_PROFILE.followers },
            { k: 'Likes', v: DEMO_PROFILE.likes },
            { k: 'Videos', v: DEMO_PROFILE.videos },
          ].map((s, i) => (
            <div key={s.k} className="text-center" style={{ opacity: play ? 1 : 0.15, transition: `opacity 0.4s ease ${0.9 + i * 0.18}s` }}>
              <div className="text-sm font-bold text-white tabular-nums">{s.v}</div>
              <div className="text-[9px] uppercase tracking-wide text-neutral-500 mt-0.5">{s.k}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Step 2 · AI analysis radar ────────────────────────────── */
function SceneAnalyze({ active }: { active: boolean }) {
  const progress = useProgress(active)
  return (
    <div className="relative flex flex-col items-center justify-center h-full px-6">
      <div className="flex items-center gap-2 mb-1" style={{ opacity: clamp(progress / 0.15, 0, 1), transition: 'opacity 0.3s ease' }}>
        <Radar className="h-3.5 w-3.5 text-[#FF0050]" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">10-dimension AI analysis</span>
      </div>
      <div className="w-full max-w-[320px] aspect-square">
        <RadarSVG values={DEMO_DIMS} progress={progress} />
      </div>
    </div>
  )
}

/* ─── Step 3 · Personal valuation certificate ──────────────── */
function SceneValue({ active }: { active: boolean }) {
  const on = useReveal()
  const play = active && on
  const progress = useProgress(play, 3000)

  // value count-up: roll 0 → final, then settle
  const valueProgress = clamp((progress - 0.12) / 0.45, 0, 1)
  const displayValue = Math.round(DEMO_VALUE * (1 - Math.pow(1 - valueProgress, 3)))
  const valueSettled = valueProgress >= 1

  // tier ring draw — after value settles
  const tierProgress = clamp((progress - 0.58) / 0.3, 0, 1)
  const tierSettled = tierProgress >= 1
  const RING = 2 * Math.PI * 29 // r=29 in 64 viewBox

  return (
    <div className="relative flex flex-col items-center justify-center h-full px-6">
      <div className="w-full max-w-[340px] rounded-2xl border border-[#1F1D26] bg-[#0E0E14] px-7 py-5 text-center relative overflow-hidden">
        {/* top accent */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-[#FF0050] to-[#00F2EA]" />

        {/* identity + tier — side by side */}
        <div
          className="flex items-center justify-between mb-5"
          style={{ opacity: play ? 1 : 0, transition: 'opacity 0.45s ease 0.08s' }}
        >
          {/* user identity */}
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0">
              <div className="absolute inset-0 rounded-full" style={{ background: 'conic-gradient(from 180deg, #FF0050, #00F2EA, #FF0050)' }} />
              <div className="absolute inset-[2px] rounded-full bg-[#0E0E14] flex items-center justify-center text-base font-bold text-white">
                {DEMO_PROFILE.avatarInitial}
              </div>
            </div>
            <div className="text-left">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-white">{DEMO_PROFILE.nickname}</span>
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#00F2EA]" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
              </div>
              <div className="text-xs text-neutral-400">{DEMO_PROFILE.handle}</div>
            </div>
          </div>

          {/* tier — rating medallion, letter only */}
          <div className="relative flex h-14 w-14 items-center justify-center">
            <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full -rotate-90">
              <circle cx="32" cy="32" r="29" fill="none" stroke="rgba(255,0,80,0.15)" strokeWidth="2.5" />
              <circle
                cx="32"
                cy="32"
                r="29"
                fill="none"
                stroke="#FF0050"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={RING}
                strokeDashoffset={RING * (1 - tierProgress)}
                style={{ filter: 'drop-shadow(0 0 8px rgba(255,0,80,0.6))' }}
              />
            </svg>
            <span
              className="relative text-2xl font-extrabold text-white"
              style={{
                opacity: tierSettled ? 1 : 0,
                transform: tierSettled ? 'scale(1)' : 'scale(0.4)',
                transition: 'opacity 0.25s ease, transform 0.35s cubic-bezier(0.34,1.56,0.64,1)',
              }}
            >
              {DEMO_TIER}
            </span>
          </div>
        </div>

        {/* hero value — centered, large */}
        <div
          className="text-[42px] leading-none font-bold font-serif text-white tracking-tight tabular-nums"
          style={{
            textShadow: '0 0 44px rgba(255,0,80,0.4)',
            opacity: play ? 1 : 0,
            transform: valueSettled ? 'scale(1)' : 'scale(0.98)',
            transition: 'opacity 0.4s ease 0.12s, transform 0.35s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          {formatFullUsd(displayValue)}
        </div>
        <div
          className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-neutral-500"
          style={{ opacity: play ? 1 : 0, transition: 'opacity 0.4s ease 0.2s' }}
        >
          Estimated account value
        </div>

        {/* range */}
        <div className="mt-5">
          <div className="relative h-1.5 rounded-full bg-[#1A1A24] overflow-hidden">
            <div
              className="absolute inset-y-0 rounded-full bg-gradient-to-r from-[#00F2EA] to-[#FF0050]"
              style={{ width: play ? '82%' : '0%', transition: 'width 1.2s cubic-bezier(0.22,1,0.36,1) 0.5s' }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] tabular-nums text-neutral-400 mt-2">
            <span>{formatUsd(DEMO_VALUE_LOW)}</span>
            <span>{formatUsd(DEMO_VALUE_HIGH)}</span>
          </div>
        </div>

        {/* footer */}
        <div className="mt-5 flex items-center justify-center gap-2 border-t border-[#1F1D26] pt-3" style={{ opacity: play ? 1 : 0, transition: 'opacity 0.4s ease 0.95s' }}>
          <span className="text-[10px] font-semibold tracking-wider text-neutral-500">TOKVALUE</span>
          <span className="text-[10px] text-neutral-600">·</span>
          <span className="text-[10px] text-neutral-600">Independent valuation</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Main component ────────────────────────────────────────── */
export function HowItWorks({ dict }: HowItWorksProps) {
  const [step, setStep] = useState(0)
  const [inView, setInView] = useState(false)
  const sectionRef = useRef<HTMLDivElement>(null)
  const totalSteps = dict.steps.length

  // Start auto-advance only when scrolled into view
  useEffect(() => {
    const el = sectionRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setInView(true)
      },
      { threshold: 0.4 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // Auto-advance loop
  useEffect(() => {
    if (!inView) return
    const id = setInterval(() => {
      setStep((s) => (s + 1) % totalSteps)
    }, 5200)
    return () => clearInterval(id)
  }, [inView, totalSteps])

  const goTo = useCallback((i: number) => setStep(i), [])

  const stepIcons = [Search, Radar, TrendingUp]

  return (
    <section ref={sectionRef} className="py-20" id="how-it-works">
      <div className="mx-auto max-w-5xl px-4">
        {/* header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#00F2EA]/20 bg-[#00F2EA]/5 px-4 py-1.5 text-xs font-medium text-[#00F2EA] mb-4">
            {dict.badge}
          </div>
          <h2 className="text-3xl font-bold">{dict.title}</h2>
        </div>

        {/* continuous demo window */}
        <div className="relative rounded-3xl border border-[#1F1D26] bg-[#0E0E14] overflow-hidden">
          <div className="absolute inset-0 bg-mesh-gradient pointer-events-none" />

          <div className="relative">
            {/* progress tabs */}
            <div className="flex items-center gap-1.5 px-5 pt-5">
              {dict.steps.map((s, i) => {
                const Icon = stepIcons[i] || Search
                const isActive = step === i
                const isDone = i < step
                return (
                  <button
                    key={i}
                    onClick={() => goTo(i)}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-300 ${
                      isActive
                        ? 'bg-[#1A1A24] text-white border border-[#00F2EA]/50 shadow-[0_0_16px_-4px_rgba(0,242,234,0.35)]'
                        : isDone
                        ? 'text-[#00F2EA] border border-[#00F2EA]/15'
                        : 'text-neutral-500 hover:text-neutral-300 border border-transparent'
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-[#00F2EA]' : isDone ? 'text-[#00F2EA]/70' : ''}`} />
                    {isDone && !isActive && (
                      <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                    )}
                    <span className="hidden sm:inline">
                      {s.number}. {s.title}
                    </span>
                    <span className="sm:hidden">{s.number}</span>
                  </button>
                )
              })}
            </div>

            {/* stage */}
            <div className="relative h-[340px] sm:h-[380px]">
              <div key={step} className="absolute inset-0">
                {step === 0 && <SceneScan active />}
                {step === 1 && <SceneAnalyze active />}
                {step === 2 && <SceneValue active />}
              </div>
            </div>

            {/* active step caption */}
            <div className="px-6 pb-6 text-center">
              <h3 className="text-base font-semibold text-white mb-1">{dict.steps[step].title}</h3>
              <p className="text-sm text-neutral-400 max-w-xl mx-auto leading-relaxed">{dict.steps[step].desc}</p>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes hiw-scan {
          0% { top: -44px; }
          100% { top: 100%; }
        }
      `}</style>
    </section>
  )
}

export default HowItWorks
