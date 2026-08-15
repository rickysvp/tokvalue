import { getServerDict } from '@/lib/i18n/server'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

/**
 * HomepageJsonLd — 首页结构化数据（JSON-LD）。
 * 在 SSR 输出中注入，帮助搜索引擎理解网站实体与 FAQ 内容。
 */
export function HomepageJsonLd() {
  const d: EnDict = getServerDict()

  const faq = Object.values(d.home.faq.questions).map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.a,
    },
  }))

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': 'https://tokvalue.com/#website',
        url: 'https://tokvalue.com/',
        name: 'TokValue',
        description: d.seo.description,
        inLanguage: 'en',
        publisher: {
          '@id': 'https://tokvalue.com/#organization',
        },
      },
      {
        '@type': 'Organization',
        '@id': 'https://tokvalue.com/#organization',
        name: 'TokValue',
        url: 'https://tokvalue.com/',
        logo: {
          '@type': 'ImageObject',
          url: 'https://tokvalue.com/tokvalue.png',
          width: 3890,
          height: 892,
        },
      },
      {
        '@type': 'WebApplication',
        name: 'TokValue — Free TikTok Account Value Calculator',
        url: 'https://tokvalue.com/',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Any',
        description: d.seo.shortDescription,
        isAccessibleForFree: true,
        offers: {
          '@type': 'AggregateOffer',
          lowPrice: '0',
          highPrice: '99',
          priceCurrency: 'USD',
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq,
      },
    ],
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}
