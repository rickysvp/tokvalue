import type { Metadata } from 'next'
import HomePage from '@/components/HomePageClient'
import { HomepageJsonLd } from '@/components/HomepageJsonLd'
import { getServerDict } from '@/lib/i18n/server'

const d = getServerDict()

export const metadata: Metadata = {
  title: d.seo.title,
  description: d.seo.description,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: d.seo.title,
    description: d.seo.shortDescription,
    url: 'https://tokvalue.com/',
    type: 'website',
    locale: 'en_US',
    siteName: 'TokValue',
    images: [
      {
        url: '/og.jpg',
        width: 1200,
        height: 630,
        alt: 'TokValue — TikTok Account Value Calculator',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: d.seo.title,
    description: d.seo.shortDescription,
    images: ['/og.jpg'],
  },
}

export default function HomePageRoot() {
  return (
    <>
      <HomepageJsonLd />
      <HomePage />
    </>
  )
}
