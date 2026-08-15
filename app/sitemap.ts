import type { MetadataRoute } from 'next'
import { getAllPosts, getAllAuthors, getTagsByMinPosts, getAllCategories, categoryToSlug } from '@/lib/blog'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://tokvalue.com'

  // 静态页面（含真实 lastModified）
  const staticPages: MetadataRoute.Sitemap = [
    { url: base, lastModified: '2026-08-03', changeFrequency: 'daily', priority: 1 },
    { url: `${base}/blog`, lastModified: '2026-08-03', changeFrequency: 'daily', priority: 0.9 },
  // P0-2: /history and /tracker are login-gated pages — excluded from sitemap by design
    { url: `${base}/about`, lastModified: '2026-08-04', changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/contact`, lastModified: '2026-08-04', changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/privacy`, lastModified: '2026-08-03', changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/terms`, lastModified: '2026-08-03', changeFrequency: 'yearly', priority: 0.2 },
  ]

  // 博客文章（真实更新时间，新增文章自动带上）
  const blogPages: MetadataRoute.Sitemap = getAllPosts().map((post) => ({
    url: `${base}/blog/${post.slug}`,
    lastModified: post.updatedAt || post.publishedAt,
    changeFrequency: 'monthly',
    priority: 0.8,
  }))

  // 作者页
  const authorPages: MetadataRoute.Sitemap = getAllAuthors().map((a) => ({
    url: `${base}/authors/${a.slug}`,
    lastModified: '2026-08-04',
    changeFrequency: 'monthly',
    priority: 0.2,
  }))

  // 分类页
  const categoryPages: MetadataRoute.Sitemap = getAllCategories().map((category) => ({
    url: `${base}/blog/category/${categoryToSlug(category)}`,
    lastModified: '2026-08-04',
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  // 标签页：只收录被 ≥2 篇文章引用的 tag（单文章 tag 页是薄内容，不进 sitemap）
  const tagPages: MetadataRoute.Sitemap = getTagsByMinPosts(2).map((tag) => ({
    url: `${base}/blog/tag/${tag.toLowerCase().replace(/ /g, '-')}`,
    lastModified: '2026-08-04',
    changeFrequency: 'weekly',
    priority: 0.4,
  }))

  return [...staticPages, ...blogPages, ...authorPages, ...categoryPages, ...tagPages]
}
