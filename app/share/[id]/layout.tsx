import type { Metadata } from 'next'

// Public report pages are user-generated, thin, and contain third-party account
// data — keep them out of search indexes (follow: true preserves internal-link equity).
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
}

export default function ShareReportLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
