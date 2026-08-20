import React from 'react'
import { Card } from '../ui/Card'

export function AccountCard({ user, onEdit }: {
  user: { name: string; email: string; signedUpLabel?: string; roleLabel?: string; avatarInitial?: string }
  onEdit?: () => void
}) {
  return (
    <Card className="p-[18px] sm:p-5">
      <SectionHeader uppercase>Account</SectionHeader>
      <div className="flex items-center gap-3.5">
        <div className="w-[52px] h-[52px] rounded-[12px] text-white text-[20px] font-semibold flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg,#1d4ed8,#047857)' }}>
          {user.avatarInitial || user.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-[#111827] truncate">{user.name}</div>
          <div className="text-[12px] text-[#6b7280] truncate">{user.email}</div>
          <div className="text-[11px] text-[#6b7280] mt-0.5">{user.signedUpLabel || ''}{user.roleLabel ? ` · ${user.roleLabel}` : ''}</div>
        </div>
        <button
          onClick={onEdit}
          className="text-[12px] px-3 py-1.5 border border-[#e5e7eb] bg-white text-[#111827] rounded-[7px] hover:bg-gray-50"
        >Edit</button>
      </div>
    </Card>
  )
}

function SectionHeader({ children, uppercase }: { children: React.ReactNode; uppercase?: boolean }) {
  return (
    <div className={`mb-3 ${uppercase ? 'text-[11px] uppercase tracking-[0.5px]' : 'text-[12px]'} text-[#6b7280] font-semibold`}>
      {children}
    </div>
  )
}
