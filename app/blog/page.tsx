import type { Metadata } from 'next'
import Link from 'next/link'
import Script from 'next/script'
import { getAllPosts, getFeaturedPost } from '@/lib/blog'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import BlogIndexClient from './blog-index-client'

export const metadata: Metadata = {
  title: 'TokValue Blog — TikTok Creator Economy Insights',
  description:
    'Expert guides on TikTok account valuation, brand deal pricing, creator monetization, and analytics. Data-driven insights for TikTok creators at every tier.',
  openGraph: {
    title: 'TokValue Blog',
    description: 'Expert guides on TikTok creator economy, brand deals, and analytics.',
    type: 'website',
    url: 'https://tokvalue.com/blog',
    images: [
      {
        url: '/og.jpg?v=2',
        width: 1200,
        height: 630,
        alt: 'TokValue — TikTok Account Value Calculator',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TokValue Blog',
    description: 'Expert guides on TikTok creator economy, brand deals, and analytics.',
    images: ['/og.jpg?v=2'],
  },
  alternates: {
    canonical: '/blog',
  },
}

export default function BlogIndexPage() {
  const posts = getAllPosts()
  const featured = getFeaturedPost()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': 'https://tokvalue.com/blog/#collection',
    url: 'https://tokvalue.com/blog',
    name: 'TokValue Blog — TikTok Creator Economy Insights',
    description:
      'Expert guides on TikTok account valuation, brand deal pricing, creator monetization, and analytics.',
    isPartOf: { '@id': 'https://tokvalue.com/#website' },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: posts.length,
      itemListElement: posts.slice(0, 25).map((post, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `https://tokvalue.com/blog/${post.slug}`,
        name: post.title,
      })),
    },
  }

  return (
    <>
      <Script
        id="blog-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    <div className="min-h-screen flex flex-col bg-black text-white">
      <SiteHeader />

      <main className="flex-1">
        <BlogIndexClient posts={posts} featured={featured} />

        {/* CTA */}
        <section className="border-t border-neutral-800 py-16">
          <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold">Ready to find out what your account is worth?</h2>
            <p className="mt-3 text-neutral-400">
              Get a complete business valuation with detailed brand deal estimates, monetization analysis, and growth projections.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#00F2EA] px-8 py-3 text-sm font-semibold text-black transition hover:bg-[#00D4CE]"
            >
              Evaluate Your Account →
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
    </>
  )
}
