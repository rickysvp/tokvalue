import Link from 'next/link'
import type { ReactNode } from 'react'

const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all'

const variantClasses = {
  primary: 'bg-[#FF0050] text-white hover:bg-[#e60049] shadow-lg shadow-[#FF0050]/25',
  gradient: 'bg-gradient-to-r from-[#FF0050] to-[#e60049] text-white hover:from-[#e60049] hover:to-[#cc0040] shadow-lg shadow-[#FF0050]/25',
  outline: 'border border-neutral-700 bg-transparent text-neutral-300 hover:bg-neutral-800',
} as const

const sizeClasses = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3 text-base',
} as const

interface CtaButtonProps {
  variant?: 'primary' | 'gradient' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  href?: string
  children: ReactNode
  className?: string
  icon?: ReactNode
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
}

export function CtaButton({
  variant = 'primary',
  size = 'md',
  href,
  children,
  className = '',
  icon,
  disabled,
  onClick,
  type = 'button',
}: CtaButtonProps) {
  const cls = `${base} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim()

  const content = (
    <>
      {icon}
      {children}
    </>
  )

  if (href) {
    return (
      <Link href={href} className={cls}>
        {content}
      </Link>
    )
  }

  return (
    <button type={type} disabled={disabled} className={`${cls} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={onClick}>
      {content}
    </button>
  )
}
