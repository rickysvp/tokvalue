import Link from 'next/link'
import React from 'react'
import { Pill } from '../ui/Pill'

export type ReportRow = {
  id: string
  username: string
  avatarColor?: string
  niche?: string
  followers?: number
  valueRange: string
  tier: string
  tierVariant: 'tier-premium' | 'tier-growth' | 'tier-developing' | 'tier-early'
  dateLabel: string
  kindLabel: string
  paid: boolean
  teaserOnly?: boolean
  delta?: { pct: number; label?: string }
  shareHref?: string
  pdfAvailable?: boolean
}

export function ReportsTable({ rows, onUnlock }: { rows: ReportRow[]; onUnlock?: (id: string) => void }) {
  if (rows.length === 0) {
    return <div className="text-center text-[13px] text-[#6b7280] py-10 border border-[#e5e7eb] rounded-[10px] bg-white">
      No evaluations yet. Run your first review on the <Link className="text-[#1d4ed8] underline" href="/">homepage</Link>.
    </div>
  }
  return (
    <div className="border border-[#e5e7eb] rounded-[10px] bg-white overflow-hidden">
      <div className="hidden md:grid grid-cols-[40px_1.3fr_1fr_0.7fr_1fr_1.2fr] gap-2 px-3.5 py-2.5 border-b border-[#e5e7eb] bg-[#fafafa] text-[11px] text-[#6b7280] font-semibold uppercase tracking-[0.4px]">
        <div></div>
        <div>Account</div>
        <div>Value</div>
        <div>Tier</div>
        <div>Reviewed</div>
        <div className="text-right">Actions</div>
      </div>

      {rows.map(r => (
        <div key={r.id}
          className="grid grid-cols-1 md:grid-cols-[40px_1.3fr_1fr_0.7fr_1fr_1.2fr] md:gap-2 gap-1 px-3.5 py-3.5 items-center border-b last:border-b-0 border-[#f3f4f6] text-[13px] hover:bg-[#fafbfc]"
        >
          <div className="hidden md:flex">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-semibold"
              style={{ background: r.avatarColor || 'linear-gradient(135deg,#1d4ed8,#047857)' }}>
              {r.username.charAt(0).toUpperCase()}
            </div>
          </div>
          <div className="flex items-center gap-2.5 md:block">
            <div className="md:hidden w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-semibold"
              style={{ background: r.avatarColor || 'linear-gradient(135deg,#1d4ed8,#047857)' }}>
              {r.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-medium text-[#111827]">@{r.username}</div>
              <div className="text-[11px] text-[#6b7280]">{r.niche}{r.followers ? ` · ${fmtK(r.followers)} followers` : ''}</div>
            </div>
          </div>
          <div>
            <div className={`font-semibold tabular-nums ${r.teaserOnly ? 'text-[#6b7280] blur-[3px]' : 'text-[#111827]'}`}>{r.valueRange}</div>
            {r.delta && (
              <div className={`text-[11px] ${r.delta.pct >= 0 ? 'text-[#047857]' : 'text-[#dc2626]'}`}>
                {r.delta.pct >= 0 ? '▲ +' : '▼'}{r.delta.pct.toFixed(1)}% {r.delta.label || ''}
              </div>
            )}
            {r.teaserOnly && <div className="text-[11px] text-[#6b7280]">🔒 Teaser only</div>}
          </div>
          <div><Pill variant={r.tierVariant}>{r.tier}</Pill></div>
          <div>
            <div className="text-[#111827] font-medium">{r.dateLabel}</div>
            <div className="text-[11px] text-[#6b7280]">{r.kindLabel}</div>
          </div>
          <div className="flex md:justify-end gap-1.5 mt-1 md:mt-0">
            <Link
              href={`/evaluate/${encodeURIComponent(r.username)}`}
              className="px-2.5 py-1 text-[11px] border border-[#e5e7eb] bg-white text-[#111827] rounded-md hover:bg-gray-50"
            >Open</Link>
            {r.teaserOnly ? (
              <button
                onClick={() => onUnlock?.(r.id)}
                className="px-2.5 py-1 text-[11px] border border-[#1d4ed8] bg-[#1d4ed8] text-white rounded-md font-medium hover:opacity-95"
              >Unlock $9</button>
            ) : (
              <>
                <Link
                  href={r.shareHref || `#`}
                  className="px-2.5 py-1 text-[11px] border border-[#e5e7eb] bg-white text-[#111827] rounded-md hover:bg-gray-50"
                >Share</Link>
                <button
                  disabled={!r.pdfAvailable}
                  className="px-2.5 py-1 text-[11px] border rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ borderColor: '#e5e7eb', background: '#fff', color: r.pdfAvailable ? '#111827' : '#9ca3af' }}
                >PDF</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function fmtK(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K'
  return String(v)
}
