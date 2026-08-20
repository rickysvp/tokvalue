import React from 'react'
import { Card } from '../ui/Card'

export function DangerZone({ onSignOut }: { onSignOut: () => Promise<any> | void }) {
  return (
    <Card className="p-[18px] sm:p-5 !border-[#dc262625]">
      <div className="text-[11px] uppercase tracking-[0.5px] text-[#dc2626] font-semibold mb-3.5">Danger zone</div>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[13px] font-medium text-[#111827]">Sign out of all devices</div>
          <div className="text-[11px] text-[#6b7280]">Ends all active sessions immediately</div>
        </div>
        <button
          onClick={onSignOut}
          className="text-[12px] px-3 py-1.5 border rounded-[7px] font-medium hover:bg-[#dc262608]"
          style={{ borderColor: '#dc2626', color: '#dc2626', background: '#fff' }}
        >Sign out</button>
      </div>
    </Card>
  )
}
