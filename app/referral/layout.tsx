import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Referral Program — TokValue',
  description: 'Earn 40% commission when someone buys through your TokValue referral link.',
  robots: 'noindex, follow',
}

export default function ReferralLayout({ children }: { children: React.ReactNode }) {
  return children
}
