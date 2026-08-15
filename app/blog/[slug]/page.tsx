import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { Calendar, Clock, ArrowLeft } from 'lucide-react'
import { getPostBySlug, getAllPosts, getRelatedPosts, getAuthorBySlug, categoryToSlug } from '@/lib/blog'
import { extractTOC } from '@/lib/blog'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { TableOfContents } from './TableOfContents'
import { ReadingProgress } from './ReadingProgress'
import { BlogPostJsonLd } from './BlogPostJsonLd'
import { ArticleContent } from './ArticleContent'

export function generateStaticParams() {
  return getAllPosts().map(p => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return { title: 'Post Not Found — TokValue Blog' }

  const author = getAuthorBySlug(post.author)
  const url = `https://tokvalue.com/blog/${slug}`

  return {
    title: `${post.title} — TokValue Blog`,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [author?.name || post.author],
      tags: post.tags,
      url,
      images: [
        {
          url: '/og.jpg?v=2',
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: ['/og.jpg?v=2'],
    },
    alternates: {
      canonical: url,
    },
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()

  const toc = extractTOC(post.content)
  const related = getRelatedPosts(slug, 3)
  const postUrl = `https://tokvalue.com/blog/${slug}`
  const author = getAuthorBySlug(post.author)

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      <SiteHeader />

      <BlogPostJsonLd
        title={post.title}
        description={post.description}
        publishedAt={post.publishedAt}
        updatedAt={post.updatedAt}
        authorName={author?.name || post.author}
        authorUrl={author ? `https://tokvalue.com/authors/${author.slug}` : undefined}
        tags={post.tags}
        url={postUrl}
        content={post.content}
      />

      <ReadingProgress />

      <main className="flex-1">
        <article className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-[1fr_220px] lg:gap-12">
            {/* Main content */}
            <div className="min-w-0">
              <Link
                href="/blog"
                className="mb-8 inline-flex items-center gap-1.5 text-sm text-neutral-400 transition-colors hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Blog
              </Link>

              {/* Header */}
              <header className="mb-8">
                <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
                  <span className="rounded-full border border-[#00F2EA]/20 bg-[#00F2EA]/5 px-3 py-1 text-xs font-medium text-[#00F2EA]">
                    {post.category}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-neutral-500">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(post.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-neutral-500">
                    <Clock className="h-3.5 w-3.5" />
                    {post.readTime} read
                  </span>
                  {post.updatedAt && (
                    <span className="inline-flex items-center gap-1.5 text-neutral-500">
                      Updated {new Date(post.updatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                </div>

                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl leading-tight">
                  {post.title}
                </h1>

                <p className="mt-4 text-lg text-neutral-400 leading-relaxed">
                  {post.description}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {post.category && (
                    <Link
                      href={`/blog/category/${categoryToSlug(post.category)}`}
                      className="inline-block rounded bg-[#FF0050]/20 px-2.5 py-1 text-xs text-[#FF0050] hover:bg-[#FF0050]/30 transition-colors"
                    >
                      {post.category}
                    </Link>
                  )}
                  {post.tags.map(tag => (
                    <Link
                      key={tag}
                      href={`/blog/tag/${tag.toLowerCase().replace(/ /g, '-')}`}
                      className="inline-block rounded bg-neutral-800 px-2.5 py-1 text-xs text-neutral-400 hover:bg-neutral-700 hover:text-white transition-colors"
                    >
                      #{tag}
                    </Link>
                  ))}
                </div>
              </header>

              {/* Author */}
              <div className="flex items-center gap-3 py-4 border-y border-neutral-800 my-8">
                <Link href={`/authors/${post.author}`} className="flex items-center gap-3 group">
                  {author?.avatar ? (
                    <Image
                      src={author.avatar}
                      alt={author.name || post.author}
                      width={40}
                      height={40}
                      className="rounded-full"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#FF2D78] to-[#00F2EA] text-sm font-bold text-white">
                      {author?.avatarInitial || post.author.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-white group-hover:text-[#00F2EA] transition-colors">{author?.name || post.author}</p>
                    <p className="text-xs text-neutral-500">{author?.role || 'TokValue Team'}</p>
                  </div>
                </Link>
              </div>

              {/* Article body with CTAs */}
              <ArticleContent content={post.content} />

              {/* Bottom CTA */}
              <div className="mt-12 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-8 text-center">
                <h3 className="text-xl font-bold">Ready to find out what your account is worth?</h3>
                <p className="mt-2 text-neutral-400">
                  Get a complete TikTok business valuation with our free evaluation tool.
                </p>
                <Link
                  href="/"
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#00F2EA] px-8 py-3 text-sm font-semibold text-black transition hover:bg-[#00D4CE]"
                >
                  Evaluate My Account →
                </Link>
              </div>

              {/* Share + back nav */}
              <div className="mt-10 flex items-center justify-between border-t border-neutral-800 pt-8">
                <Link href="/blog" className="text-sm text-neutral-400 transition-colors hover:text-white">
                  ← All Articles
                </Link>
                <Link
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(postUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-neutral-400 transition-colors hover:text-white"
                >
                  Share on X
                </Link>
              </div>

              {/* Related */}
              {related.length > 0 && (
                <div className="mt-12">
                  <h3 className="mb-6 text-lg font-semibold text-white">Related Articles</h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {related.map(p => (
                      <Link
                        key={p.slug}
                        href={`/blog/${p.slug}`}
                        className="group block rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 transition hover:border-neutral-700"
                      >
                        <p className="mb-2 text-xs text-[#00F2EA]">{p.category}</p>
                        <h4 className="line-clamp-2 text-sm font-medium leading-snug text-white group-hover:text-[#00F2EA] transition-colors">
                          {p.title}
                        </h4>
                        <p className="mt-2 text-xs text-neutral-500">
                          {new Date(p.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sticky TOC */}
            <aside className="hidden lg:block">
              <div className="sticky top-24">
                <TableOfContents items={toc} />
              </div>
            </aside>
          </div>
        </article>
      </main>

      <SiteFooter />
    </div>
  )
}
