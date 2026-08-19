'use client'

import { HelpCircle } from 'lucide-react'
import { useState } from 'react'

export function HelpHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <button
      type="button"
      aria-label="What is this?"
      onClick={() => setOpen(v => !v)}
      className="inline-flex text-[#9CA3AF] hover:text-[#1d4ed8]"
    >
      <HelpCircle className="h-4 w-4" />
      {open && (
        <span className="absolute left-1/2 z-20 mt-6 w-56 -translate-x-1/2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs leading-relaxed text-[#374151] shadow-lg">
          {text}
        </span>
      )}
    </button>
  )
}
