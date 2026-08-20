import React from 'react'
export function Card({ children, className = '', as: As = 'div' }:
  { children: React.ReactNode; className?: string; as?: any }) {
  return <As className={`bg-white border border-[#e5e7eb] rounded-[10px] ${className}`}>{children}</As>
}
