import { getPostsByTag, getAllPosts } from '@/lib/blog'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { Calendar, Clock } from 'lucide-react'
import Link from 'next/link'
import type { Metadata } from 'next'

export async function generateStaticParams() {
  const allTags = new Set<string>()
  const posts = getAllPosts()
  posts.forEach(p => p.tags.forEach(t => allTags.add(t)))

  return Array.from(allTags).map(tag => ({
    tag: tag.toLowerCase().replace(/ /g, '-'),
  }))
}

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const { tag } = await params
  const tagName = tag.replace(/-/g, ' ')

  return {
    title: `Articles tagged "${tagName}" — TokValue Blog`,
    description: `All articles tagged with "${tagName}" on TokValue Blog.`,
    openGraph: {
      title: `#${tagName} — TokValue Blog`,
      description: `All articles tagged with "${tagName}" on TokValue Blog.`,
      type: 'website',
    },
  }
}

export default async function TagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params
  const tagName = tag.replace(/-/g, ' ')
  const posts = getPostsByTag(tagName)

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-4 py-16">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-2 text-sm text-neutral-400 mb-4">
            <Link href="/blog" className="hover:text-[#00F2EA]">Blog</Link>
            <span>/</span>
            <span className="text-[#FF0050]">#{tagName}</span>
          </div>
          <h1 className="text-4xl font-bold mb-4">
            Tagged: <span className="text-[#00F2EA]">#{tagName}</span>
          </h1>
          <p className="text-neutral-400 text-lg">
            {posts.length} article{posts.length !== 1 ? 's' : ''} tagged with &quot;{tagName}&quot;
          </p>
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
                {post.category && (
                  <Link
                    href={`/blog/category/${post.category.toLowerCase().replace(/ /g, '-')}`}
                    className="text-xs text-[#FF0050] hover:underline"
                  >
                    {post.category}
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>

        {posts.length === 0 && (
          <div className="text-center py-12 text-neutral-400">
            No articles with this tag yet.
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
