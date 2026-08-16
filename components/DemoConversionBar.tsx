'use client'

import Link from 'next/link'
import { Sparkles, ArrowRight } from 'lucide-react'

/**
 * DemoConversionBar — sticky bottom conversion bar for the @demo sample report page.
 *
 * The demo renders a full (mock) report so visitors see the product's value,
 * but a mock report can't be paid for — there's no real account to unlock.
 * This bar converts demo visitors by routing them to evaluate their *own*
 * account: free first look → paid unlock of the full report.
 */
export function DemoConversionBar() {
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-[#FF0050]/20 px-4 py-3 sm:py-4">
      <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-2 text-sm font-semibold text-white">
            <Sparkles className="h-4 w-4 text-[#FF0050]" />
            This is a sample report
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            Find out what <span className="text-[#00F2EA]">your</span> TikTok account is really worth — free first look.
          </p>
        </div>
        <Link
          href="/#hero"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#FF0050] to-[#e60049] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#FF0050]/25 hover:from-[#e60049] hover:to-[#cc0040] transition-all whitespace-nowrap"
        >
          Evaluate My Account
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <p className="text-center text-[10px] text-neutral-600 mt-1.5">
        First evaluation free · Full report from $9 · No subscription
      </p>
    </div>
  )
}

export default DemoConversionBar
