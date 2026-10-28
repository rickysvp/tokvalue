import { getAllPosts, getAuthorBySlug } from '@/lib/blog'

const BASE = 'https://tokvalue.com'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function GET() {
  const posts = getAllPosts().sort(
    (a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt)
  )

  const items = posts
    .map((post) => {
      const link = `${BASE}/blog/${post.slug}`
      const author = getAuthorBySlug(post.author)
      const authorName = author?.name ?? post.author
      const categories = post.tags
        .map((t) => `      <category>${escapeXml(t)}</category>`)
        .join('\n')

      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${new Date(post.updatedAt || post.publishedAt).toUTCString()}</pubDate>
      <dc:creator>${escapeXml(authorName)}</dc:creator>
${categories}
      <description>${escapeXml(post.description)}</description>
    </item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>TokValue Blog</title>
    <link>${BASE}/blog</link>
    <atom:link href="${BASE}/feed.xml" rel="self" type="application/rss+xml" />
    <description>TikTok account valuation, analytics, and monetization guides — how to measure and grow the commercial value of a TikTok account.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
