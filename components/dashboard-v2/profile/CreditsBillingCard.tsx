import Link from 'next/link'
import React from 'react'
import { Card } from '../ui/Card'

export function CreditsBillingCard({
  credits: { remaining, usedOfPack, packLabel },
  purchaseHistoryHref
}: {
  credits: { remaining: number; usedOfPack?: number; packLabel?: string }
  purchaseHistoryHref?: string
}) {
  return (
    <Card className="p-[18px] sm:p-5">
      <div className="flex items-center justify-between mb-3.5">
        <div className="text-[11px] uppercase tracking-[0.5px] text-[#6b7280] font-semibold">Credits & Billing</div>
        {purchaseHistoryHref && <Link href={purchaseHistoryHref} className="text-[12px] text-[#1d4ed8] hover:underline">Purchase history →</Link>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1.2fr_1fr] gap-3.5 mb-3.5">
        <div className="p-3.5 rounded-lg border" style={{ background: 'linear-gradient(135deg,#1d4ed808,#04785708)', borderColor: 'rgba(29,78,216,0.15)' }}>
          <div className="text-[11px] text-[#6b7280] mb-1">Evaluation credits</div>
          <div className="text-[22px] font-semibold tabular-nums tracking-tight text-[#111827] leading-none">
            {remaining} <span className="text-[12px] font-normal text-[#6b7280]">remaining</span>
          </div>
          {packLabel ? (
            <div className="text-[11px] text-[#6b7280] mt-0.5">{packLabel}{usedOfPack != null ? ` · ${usedOfPack} used` : ''}</div>
          ) : (
            <div className="text-[11px] text-[#6b7280] mt-0.5">No active pack</div>
          )}
        </div>
        <div className="p-3.5 rounded-lg border border-[#e5e7eb] bg-[#fafafa] flex flex-col justify-between">
          <div>
            <div className="text-[11px] text-[#6b7280] mb-1">Need more?</div>
            <Link
              href="/pricing"
              className="block text-center text-[12px] px-3 py-1.5 bg-[#111827] text-white rounded-[7px] font-medium hover:bg-black"
            >Buy more credits</Link>
            <div className="text-[10px] text-[#6b7280] mt-1 text-center">From $9 / 1-pack</div>
          </div>
        </div>
      </div>
      <div className="p-3.5 rounded-lg border border-dashed border-[#e5e7eb] bg-[#fafafa]">
        <div className="text-[11px] text-[#6b7280] mb-0.5">Current plan</div>
        <div className="text-[13px] font-medium text-[#111827]">Pay-as-you-go · no active subscription</div>
        <div className="text-[11px] text-[#6b7280] mt-0.5">No recurring charges. Credits are purchased one-time and used per evaluation.</div>
      </div>
    </Card>
  )
}
