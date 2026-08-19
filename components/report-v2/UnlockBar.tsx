'use client'

import { useState } from 'react'
import { Lock, ChevronDown } from 'lucide-react'

export function UnlockBar({ price, ctaText, includedText, includedItems, onUnlock }: {
  price: string
  ctaText: string
  includedText: string
  includedItems: readonly string[]
  onUnlock: () => void
}) {
  const [showIncluded, setShowIncluded] = useState(false)
  return (
    <div className="sticky bottom-0 z-40 border-t border-[#E5E7EB] bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#111827]">{ctaText} — {price}</p>
          <button type="button" onClick={() => setShowIncluded(v => !v)} className="inline-flex items-center gap-1 text-xs text-[#1d4ed8] hover:underline">
            {includedText}
            <ChevronDown className={`h-3 w-3 transition-transform ${showIncluded ? 'rotate-180' : ''}`} />
          </button>
        </div>
        <button
          type="button"
          onClick={onUnlock}
          className="shrink-0 rounded-xl bg-[#1d4ed8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1e40af] transition-colors"
        >
          <span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" />{ctaText}</span>
        </button>
      </div>
      {showIncluded && (
        <div className="border-t border-[#E5E7EB] bg-white px-4 py-4">
          <ul className="mx-auto grid max-w-3xl gap-2 sm:grid-cols-2">
            {includedItems.map(item => (
              <li key={item} className="text-[13px] text-[#374151]">✓ {item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
