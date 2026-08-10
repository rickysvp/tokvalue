import { getPostsByCategory } from '@/lib/blog'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { Calendar, Clock } from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'

const CATEGORIES: Record<string, { name: string; description: string }> = {
  'monetization': {
    name: 'Monetization',
    description: 'Guides on making money with TikTok: brand deals, creator fund, TikTok Shop, and more.',
  },
  'analytics-strategy': {
    name: 'Analytics & Strategy',
    description: 'Data-driven growth strategies, metrics analysis, and performance optimization.',
  },
  'creator-economy': {
    name: 'Creator Economy',
    description: 'Industry trends, market insights, and creator economy analysis.',
  },
  'case-studies': {
    name: 'Case Studies',
    description: 'Real-world examples and success stories from TikTok creators.',
  },
  'guides': {
    name: 'Guides',
    description: 'Step-by-step tutorials and how-to guides for TikTok creators.',
  },
}

export async function generateStaticParams() {
  return Object.keys(CATEGORIES).map(slug => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const category = CATEGORIES[slug]
  if (!category) return { title: 'Category Not Found — TokValue Blog' }

  return {
    title: `${category.name} Guides — TokValue Blog`,
    description: category.description,
    openGraph: {
      title: `${category.name} — TokValue Blog`,
      description: category.description,
      type: 'website',
    },
  }
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const category = CATEGORIES[slug]
  if (!category) return <div>Category not found</div>

  const posts = getPostsByCategory(category.name)

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-4 py-16">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-2 text-sm text-neutral-400 mb-4">
            <Link href="/blog" className="hover:text-[#00F2EA]">Blog</Link>
            <span>/</span>
            <span className="text-[#FF0050]">{category.name}</span>
          </div>
          <h1 className="text-4xl font-bold mb-4">{category.name}</h1>
          <p className="text-neutral-400 text-lg">{category.description}</p>
          <p className="text-sm text-neutral-500 mt-2">{posts.length} articles</p>
        </div>

        {/* Posts */}
        <div className="space-y-6">
          {posts.map(post => (
            <article key={post.slug} className="rounded-2xl border border-neutral-800 bg-[#0a0a0a] p-6 hover:border-[#00F2EA]/20 transition-colors">
              <Link href={`/blog/${post.slug}`}>
                <h2 className="text-xl font-bold mb-2 hover:text-[#00F2EA] transition-colors">
                  {post.title}
                </h2>
              </Link>
              <p className="text-neutral-400 mb-4 line-clamp-2">{post.description}</p>
              <div className="flex items-center gap-4 text-sm text-neutral-500">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {new Date(post.publishedAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {post.readTime} min read
                </div>
                <div className="flex gap-2">
                  {post.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="text-xs text-[#00F2EA]">#{tag}</span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>

        {posts.length === 0 && (
          <div className="text-center py-12 text-neutral-400">
            No articles in this category yet.
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
