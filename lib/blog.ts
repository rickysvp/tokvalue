// Blog library
export type { BlogPostMeta, BlogPost, Category } from './blog/content'
export { CATEGORIES } from './blog/content'
export { ALL_POSTS } from './blog/posts'
export { extractTOC } from './blog/posts'
export { AUTHORS, getAuthorBySlug, getAllAuthors } from './blog/authors'

import { ALL_POSTS } from './blog/posts'
import type { BlogPostMeta } from './blog/content'

export function getAllPosts(): BlogPostMeta[] {
  return ALL_POSTS
    .map(({ slug, title, description, excerpt, tags, publishedAt, updatedAt, readTime, category, featured, author, coverGradient }) => ({
      slug, title, description, excerpt, tags, publishedAt, updatedAt, readTime, category, featured, author, coverGradient,
    }))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
}

export function getPostBySlug(slug: string) {
  return ALL_POSTS.find(p => p.slug === slug)
}

export function getFeaturedPost(): BlogPostMeta | undefined {
  return ALL_POSTS
    .filter(p => p.featured)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())[0]
}

export function getRelatedPosts(slug: string, limit = 3): BlogPostMeta[] {
  const post = getPostBySlug(slug)
  if (!post) return []
  return getAllPosts()
    .filter(p => p.slug !== slug && p.category === post.category)
    .slice(0, limit)
}

export function getPostsByCategory(category: string): BlogPostMeta[] {
  return getAllPosts()
    .filter(p => p.category === category)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
}

export function getPostsByTag(tag: string): BlogPostMeta[] {
  const normalizedTag = tag.toLowerCase()
  return getAllPosts()
    .filter(p => p.tags.some(t => t.toLowerCase() === normalizedTag))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
}

export function getPostsByAuthor(authorSlug: string): BlogPostMeta[] {
  return getAllPosts()
    .filter(p => p.author === authorSlug)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
}

export function getAllTags(): string[] {
  const tags = new Set<string>()
  getAllPosts().forEach(p => p.tags.forEach(t => tags.add(t)))
  return Array.from(tags).sort()
}

export function getAllCategories(): string[] {
  const categories = new Set<string>()
  getAllPosts().forEach(p => {
    if (p.category) categories.add(p.category)
  })
  return Array.from(categories).sort()
}

/**
 * categoryToSlug — 把分类名（如 "Analytics & Strategy"）转成 URL slug（"analytics-strategy"）。
 * 与 app/blog/category/[slug]/page.tsx 的 CATEGORIES key 保持一致。
 */
export function categoryToSlug(category: string): string {
  return category
    .toLowerCase()
    .replace(/&/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
