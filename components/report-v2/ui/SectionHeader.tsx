'use client'

export function SectionHeader({ index, title, subtitle, id }: {
  index: number
  title: string
  subtitle?: string
  id?: string
}) {
  return (
    <div id={id} className="scroll-mt-24 mb-6">
      <div className="flex items-baseline gap-3">
        <span className="text-sm font-semibold text-[#6B7280] tabular-nums">{String(index).padStart(2, '0')}</span>
        <h2 className="text-xl font-semibold text-[#111827]">{title}</h2>
      </div>
      {subtitle && <p className="mt-1.5 text-sm text-[#6B7280]">{subtitle}</p>}
    </div>
  )
}
