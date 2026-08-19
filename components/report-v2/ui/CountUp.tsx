'use client'

import { useEffect, useRef, useState } from 'react'

/** 按目标量级取整显示，避免动画中途小数抖动 */
export function formatCountUpValue(target: number, progress: number, _step: number): string {
  const current = target * Math.max(0, Math.min(1, progress))
  if (target >= 1_000_000) return `$${(current / 1_000_000).toFixed(1)}M`
  if (target >= 10_000) {
    const k = Math.round(current / 1000)
    return k === 0 ? '$0' : `$${k}K`
  }
  return `$${Math.round(current)}`
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function CountUp({ target, durationMs = 1200, className }: {
  target: number
  durationMs?: number
  className?: string
}) {
  const [text, setText] = useState(() => formatCountUpValue(target, 0, 1))
  const rafRef = useRef<number>(0)

  useEffect(() => {
    // 无障碍降级：直接显示终值
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setText(formatCountUpValue(target, 1, 1))
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs)
      setText(formatCountUpValue(target, easeOutCubic(progress), 1))
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, durationMs])

  return <span className={`tabular-nums ${className ?? ''}`}>{text}</span>
}
