import React from 'react'
export function Checkbox({
  checked, onChange, size = 18
}: { checked: boolean; onChange?: (next: boolean) => void; size?: number }) {
  const base = checked
    ? 'border-[#047857] bg-[#04785710] text-[#047857]'
    : 'border-[#d1d5db] bg-white'
  return (
    <div
      className={`inline-flex items-center justify-center rounded-md border-2 cursor-pointer select-none ${base}`}
      style={{ width: size, height: size, fontSize: size * 0.55, fontWeight: 700 }}
      onClick={() => onChange?.(!checked)}
    >
      <input type="checkbox" className="sr-only" checked={checked} readOnly />
      {checked && <span aria-hidden>✓</span>}
    </div>
  )
}
