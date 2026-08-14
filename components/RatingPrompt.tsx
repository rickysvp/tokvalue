'use client'

import { useState, useRef } from 'react'
import { Star } from 'lucide-react'

interface RatingPromptProps {
  username: string
}

/**
 * 报告页底部的满意度采集：1-5 星评分。
 * 数据真实存入 DB（/api/rating），用于首页社会证明。
 * 评分完成后本地记录，避免重复弹窗。
 */
export function RatingPrompt({ username }: RatingPromptProps) {
  const [submitted, setSubmitted] = useState(false)
  const [hovered, setHovered] = useState(0)
  const [error, setError] = useState(false)
  const pending = useRef(false)

  const submit = async (rating: number) => {
    if (submitted || pending.current) return
    const name = username.trim()
    if (!name || name.length > 50) return
    pending.current = true
    try {
      const res = await fetch('/api/rating', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name, rating }),
      })
      if (res.ok) {
        setSubmitted(true)
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    } finally {
      pending.current = false
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <p className="text-sm text-neutral-400">Thanks for your feedback! 🙏</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 text-center">
      <p className="text-sm font-medium text-white mb-3">How accurate was this report?</p>
      <div className="flex items-center justify-center gap-1" role="radiogroup" aria-label="Rate this report">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => submit(n)}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            className="p-1 transition-transform hover:scale-110"
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
          >
            <Star
              className={`h-7 w-7 ${
                n <= (hovered || 0) ? 'fill-[#E8A840] text-[#E8A840]' : 'text-neutral-600'
              }`}
            />
          </button>
        ))}
      </div>
      {error && (
        <p className="text-xs text-neutral-500 mt-2">Couldn&apos;t save your rating. Please try again.</p>
      )}
    </div>
  )
}
