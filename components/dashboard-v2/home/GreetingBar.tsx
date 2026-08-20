'use client'
import Link from 'next/link'
import React from 'react'

export function GreetingBar({
  firstName,
  currentUsername,
  accounts,
  onSwitchAccount,
  latestEvaluationAvailable
}: {
  firstName: string
  currentUsername: string
  accounts?: string[]
  onSwitchAccount?: (u: string) => void
  latestEvaluationAvailable: boolean
}) {
  const h = new Date().getHours()
  const period = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div>
          <h1 className="text-[24px] font-semibold text-[#111827] leading-tight">
            Good {period}, {firstName} 👋
          </h1>
          <p className="text-[13px] text-[#6b7280] mt-0.5">
            Working on{' '}
            <UsernameSwitcher
              current={currentUsername}
              accounts={accounts}
              onChange={onSwitchAccount}
            />
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {latestEvaluationAvailable && (
            <Link
              href={`/evaluate/${encodeURIComponent(currentUsername)}`}
              className="px-3.5 py-[7px] text-[12px] border border-[#e5e7eb] bg-white text-[#111827] rounded-[7px] font-medium hover:bg-gray-50"
            >
              Review again
            </Link>
          )}
          <Link
            href="/"
            className="px-3.5 py-[7px] text-[12px] border border-[#1d4ed8] bg-[#1d4ed8] text-white rounded-[7px] font-medium hover:opacity-95"
          >
            Evaluate new
          </Link>
        </div>
      </div>
    </div>
  )
}

function UsernameSwitcher({
  current,
  accounts = [],
  onChange
}: {
  current: string
  accounts?: string[]
  onChange?: (u: string) => void
}) {
  if (accounts.length <= 1) {
    return (
      <span className="font-medium text-[#111827]">@{current}</span>
    )
  }
  return (
    <select
      className="inline-block ml-1 text-[13px] text-[#1d4ed8] font-medium border-none bg-transparent cursor-pointer border-b border-dashed border-[#1d4ed8] pr-3 appearance-none"
      value={current}
      onChange={e => onChange?.(e.target.value)}
    >
      {accounts.map(a => (
        <option key={a} value={a}>
          @{a}
        </option>
      ))}
    </select>
  )
}
