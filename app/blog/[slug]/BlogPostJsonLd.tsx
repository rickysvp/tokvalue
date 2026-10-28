import Script from 'next/script'
import { categoryToSlug } from '@/lib/blog'

interface BlogPostJsonLdProps {
  title: string
  description: string
  publishedAt: string
  updatedAt?: string
  authorName: string
  authorUrl?: string
  tags: string[]
  category: string
  url: string
  content?: string
}

function extractFaqs(content?: string): Array<{ q: string; a: string }> {
  if (!content) return []
  const faqs: Array<{ q: string; a: string }> = []
  const detailsRe = /<details>[\s\S]*?<summary>(.+?)<\/summary>([\s\S]*?)<\/details>/g
  let m: RegExpExecArray | null
  while ((m = detailsRe.exec(content)) !== null) {
    const q = m[1].trim()
    const a = m[2]
      .replace(/<[^>]+>/g, '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (q && a) faqs.push({ q, a })
  }
  return faqs
}

// Approximate visible word count: strip HTML, markdown syntax, and URLs.
function countWords(markdown?: string): number {
  if (!markdown) return 0
  const text = markdown
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#*`>|_~]/g, ' ')
    .replace(/^[-+]\s+/gm, ' ')
  return text.split(/\s+/).filter(Boolean).length
}

export function BlogPostJsonLd({
  title,
  description,
  publishedAt,
  updatedAt,
  authorName,
  authorUrl,
  tags,
  category,
  url,
  content,
}: BlogPostJsonLdProps) {
  const faqs = extractFaqs(content)
  const image = `${url}/opengraph-image`
  const categoryUrl = `https://tokvalue.com/blog/category/${categoryToSlug(category)}`

  const blogPosting: Record<string, unknown> = {
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    headline: title,
    description,
    url,
    image,
    datePublished: publishedAt,
    dateModified: updatedAt || publishedAt,
    wordCount: countWords(content),
    inLanguage: 'en-US',
    articleSection: category,
    keywords: tags.join(', '),
    author: {
      '@type': 'Person',
      name: authorName,
      ...(authorUrl ? { url: authorUrl } : {}),
    },
    publisher: {
      '@type': 'Organization',
      name: 'TokValue',
      logo: {
        '@type': 'ImageObject',
        url: 'https://tokvalue.com/tokvalue.png',
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
  }

  if (faqs.length > 0) {
    blogPosting.mainEntity = {
      '@type': 'FAQPage',
      mainEntity: faqs.map(f => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: f.a,
        },
      })),
    }
  }

  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://tokvalue.com/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://tokvalue.com/blog' },
      { '@type': 'ListItem', position: 3, name: category, item: categoryUrl },
      { '@type': 'ListItem', position: 4, name: title, item: url },
    ],
  }

  const graph = {
    '@context': 'https://schema.org',
    '@graph': [blogPosting, breadcrumb],
  }

  return (
    <Script
      id="blog-post-jsonld"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  )
}
