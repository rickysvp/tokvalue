'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ArrowRight, ScanLine, Radar, TrendingUp } from 'lucide-react'

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
   Real reports fill these from the actual evaluation result.
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

const DEMO_VALUE = 2_100_000 // $2.1M
const DEMO_TIER = 'A'

/* ─── SVG radar helpers ─────────────────────────────────────── */
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

function RadarSVG({ values, animated }: { values: { label: string; value: number }[]; animated: boolean }) {
  const cx = 180
  const cy = 180
  const R = 95
  const n = values.length
  const levels = [0.25, 0.5, 0.75, 1]

  const ringPoints = (fraction: number) =>
    values
      .map((_, i) => polar(cx, cy, R * fraction, -90 + (i * 360) / n))
      .map((p) => `${p.x},${p.y}`)
      .join(' ')

  const dataPoints = values
    .map((d, i) => polar(cx, cy, (R * d.value) / 100, -90 + (i * 360) / n))
    .map((p) => `${p.x},${p.y}`)
    .join(' ')

  const axisEnds = values.map((_, i) => polar(cx, cy, R, -90 + (i * 360) / n))
  const labelPts = values.map((_, i) => polar(cx, cy, R + 24, -90 + (i * 360) / n))

  return (
    <svg viewBox="0 0 360 360" className="w-full h-full" role="img" aria-label="10-dimension analysis radar">
      {/* grid rings */}
      {levels.map((lv, i) => (
        <polygon
          key={i}
          points={ringPoints(lv)}
          fill="none"
          stroke="#27272a"
          strokeWidth="0.6"
          style={{ opacity: animated ? 1 : 0, transition: `opacity 0.5s ease ${0.1 + i * 0.12}s` }}
        />
      ))}
      {/* axes */}
      {axisEnds.map((p, i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={p.x}
          y2={p.y}
          stroke="#1f1d26"
          strokeWidth="0.6"
          style={{ opacity: animated ? 1 : 0, transition: `opacity 0.4s ease ${0.2 + i * 0.05}s` }}
        />
      ))}
      {/* data polygon */}
      <polygon
        points={dataPoints}
        fill="#FF0050"
        fillOpacity="0.14"
        stroke="#FF0050"
        strokeWidth="1.6"
        strokeLinejoin="round"
        style={{
          opacity: animated ? 1 : 0,
          transform: animated ? 'scale(1)' : 'scale(0.2)',
          transformOrigin: '180px 180px',
          transition: 'opacity 0.6s ease 0.4s, transform 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.4s',
        }}
      />
      {/* vertex dots */}
      {dataPoints.split(' ').map((pt, i) => {
        const [x, y] = pt.split(',').map(Number)
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="2.6"
            fill="#FF0050"
            style={{ opacity: animated ? 1 : 0, transition: `opacity 0.4s ease ${0.55 + i * 0.04}s` }}
          />
        )
      })}
      {/* labels */}
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
            style={{ opacity: animated ? 1 : 0, transition: `opacity 0.4s ease ${0.5 + i * 0.07}s` }}
          >
            {d.label}
          </text>
        )
      })}
    </svg>
  )
}

/* ─── Count-up hook ─────────────────────────────────────────── */
function useCountUp(target: number, active: boolean, duration = 1200) {
  const [val, setVal] = useState(target)
  useEffect(() => {
    if (!active) return
    let raf = 0
    const start = performance.now()
    setVal(0) // restart from zero for the count-up effect
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setVal(Math.round(target * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
      else setVal(target) // ensure final value
    }
    raf = requestAnimationFrame(tick)
    // Fallback: if rAF is throttled/blocked (e.g. headless), force final value
    const fallback = setTimeout(() => setVal(target), duration + 120)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(fallback)
    }
  }, [target, active, duration])
  return val
}

function formatUsd(n: number) {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return '$' + Math.round(n)
}

/* ─── Step scenes ───────────────────────────────────────────── */
function SceneScan({ active }: { active: boolean }) {
  return (
    <div className="relative flex flex-col items-center justify-center h-full px-6">
      {/* scan line sweeping over the profile card */}
      <div className="w-full max-w-[300px] rounded-2xl border border-[#1F1D26] bg-[#0E0E14] p-5 relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent, #00F2EA, transparent)',
            boxShadow: '0 0 24px 2px rgba(0,242,234,0.35)',
            animation: active ? 'hiw-scan 2.2s ease-in-out infinite' : 'none',
          }}
        />
        {/* header */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#00F2EA]">Scanning</span>
          <ScanLine className="h-3.5 w-3.5 text-[#00F2EA]" />
        </div>
        {/* avatar + name */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="h-12 w-12 rounded-full bg-gradient-to-br from-[#FF0050] to-[#00F2EA] p-[2px] shrink-0 animate-burst"
            style={{ animationDelay: '0.3s' }}
          >
            <div className="h-full w-full rounded-full bg-[#0E0E14] flex items-center justify-center text-lg font-bold text-white">
              {DEMO_PROFILE.avatarInitial}
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold text-white animate-fade-in-up" style={{ animationDelay: '0.45s' }}>
              {DEMO_PROFILE.nickname}
            </div>
            <div className="text-xs text-neutral-400 animate-fade-in-up" style={{ animationDelay: '0.55s' }}>
              {DEMO_PROFILE.handle}
            </div>
          </div>
        </div>
        {/* data rows */}
        <div className="grid grid-cols-3 gap-2 border-t border-[#1F1D26] pt-3">
          {[
            { k: 'Followers', v: DEMO_PROFILE.followers },
            { k: 'Likes', v: DEMO_PROFILE.likes },
            { k: 'Videos', v: DEMO_PROFILE.videos },
          ].map((s, i) => (
            <div key={s.k} className="text-center animate-fade-in-up" style={{ animationDelay: `${0.65 + i * 0.12}s` }}>
              <div className="text-sm font-bold text-white tabular-nums">{s.v}</div>
              <div className="text-[9px] uppercase tracking-wide text-neutral-500 mt-0.5">{s.k}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SceneAnalyze({ active }: { active: boolean }) {
  return (
    <div className="relative flex flex-col items-center justify-center h-full px-6">
      <div className="flex items-center gap-2 mb-1">
        <Radar className="h-3.5 w-3.5 text-[#FF0050]" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">10-dimension AI analysis</span>
      </div>
      <div className="w-full max-w-[320px] aspect-square">
        <RadarSVG values={DEMO_DIMS} animated={active} />
      </div>
    </div>
  )
}

function SceneValue({ active }: { active: boolean }) {
  const display = useCountUp(DEMO_VALUE, active)
  const bandLow = useCountUp(1_700_000, active, 1400)
  const bandHigh = useCountUp(2_600_000, active, 1400)
  return (
    <div className="relative flex flex-col items-center justify-center h-full px-6">
      <div className="w-full max-w-[340px] rounded-2xl border border-[#1F1D26] bg-[#0E0E14] p-6 text-center relative overflow-hidden">
        {/* top accent */}
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#FF0050] to-[#00F2EA]" />
        <div className="inline-flex items-center justify-center h-11 w-11 rounded-full border-2 border-[#FF0050] bg-[#FF0050]/10 text-lg font-bold text-[#FF0050] mb-3 animate-burst">
          {DEMO_TIER}
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mb-1">Estimated value</div>
        <div className="text-4xl font-extrabold text-white tabular-nums" style={{ textShadow: '0 0 40px rgba(255,0,80,0.45)' }}>
          {formatUsd(display)}
        </div>
        {/* value band */}
        <div className="mt-4 h-1.5 w-full rounded-full bg-[#1A1A24] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#00F2EA] to-[#FF0050]"
            style={{ width: active ? '82%' : '0%', transition: 'width 1s cubic-bezier(0.22,1,0.36,1) 0.5s' }}
          />
        </div>
        <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-neutral-400 animate-fade-in-up" style={{ animationDelay: '1.2s' }}>
          <TrendingUp className="h-3 w-3 text-[#00F2EA]" />
          Tier {DEMO_TIER} · Top-tier commercial potential
        </div>

        {/* range row */}
        <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-neutral-500">
          <span className="tabular-nums">{formatUsd(bandLow)}</span>
          <span className="h-px w-8 bg-[#2A2931]" />
          <span className="text-[#00F2EA] tabular-nums font-semibold">{formatUsd(bandHigh)}</span>
          <span className="text-neutral-600">range</span>
        </div>

        {/* data strip */}
        <div className="mt-5 grid grid-cols-3 border-t border-[#1F1D26] pt-4">
          {[
            { k: 'Followers', v: DEMO_PROFILE.followers },
            { k: 'Likes', v: DEMO_PROFILE.likes },
            { k: 'Videos', v: DEMO_PROFILE.videos },
          ].map((s) => (
            <div key={s.k} className="text-center">
              <div className="text-sm font-bold text-white tabular-nums">{s.v}</div>
              <div className="text-[9px] uppercase tracking-wide text-neutral-500 mt-0.5">{s.k}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Main component ────────────────────────────────────────── */
export function HowItWorks({ dict }: HowItWorksProps) {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [inView, setInView] = useState(false)
  const [username, setUsername] = useState('')
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
    }, 4200)
    return () => clearInterval(id)
  }, [inView, totalSteps])

  const goTo = useCallback(
    (i: number) => {
      setStep(i)
    },
    []
  )

  const onTry = (e: React.FormEvent) => {
    e.preventDefault()
    const target = username.trim()
    if (!target) return
    router.push(`/evaluate/${encodeURIComponent(target)}`)
  }

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
          {/* subtle grid backdrop */}
          <div className="absolute inset-0 bg-grid-pattern opacity-40 pointer-events-none" />
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
            <div className="relative h-[360px] sm:h-[400px]">
              <div key={step} className="absolute inset-0 animate-fade-in-up">
                {step === 0 && <SceneScan active={step === 0} />}
                {step === 1 && <SceneAnalyze active={step === 1} />}
                {step === 2 && <SceneValue active={step === 2} />}
              </div>
            </div>

            {/* active step caption */}
            <div className="px-6 pb-6 text-center">
              <h3 className="text-base font-semibold text-white mb-1">{dict.steps[step].title}</h3>
              <p className="text-sm text-neutral-400 max-w-xl mx-auto leading-relaxed">{dict.steps[step].desc}</p>
            </div>
          </div>
        </div>

        {/* Try it live */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="text-sm text-neutral-500">{dict.cta}</p>
          <form onSubmit={onTry} className="w-full max-w-md">
            <div className="flex items-center rounded-xl border border-neutral-700 bg-neutral-900/80 px-4 py-2.5 focus-within:border-[#FF0050] transition-colors">
              <span className="text-neutral-500 mr-2">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="tiktok handle"
                aria-label="TikTok handle"
                autoComplete="off"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-600"
              />
              <button
                type="submit"
                className="ml-2 inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#FF0050] to-[#e60049] px-4 py-2 text-xs font-semibold text-white shadow-md shadow-[#FF0050]/20 hover:from-[#e60049] hover:to-[#cc0040] transition-all"
              >
                Try it live
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* component-scoped keyframes (reduced-motion handled globally) */}
      <style jsx>{`
        @keyframes hiw-scan {
          0% { top: -2px; }
          100% { top: 100%; }
        }
      `}</style>
    </section>
  )
}

export default HowItWorks
