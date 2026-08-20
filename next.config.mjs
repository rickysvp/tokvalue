/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**.tiktokcdn.com' },
      { protocol: 'https', hostname: '**.tiktokcdn-us.com' },
      { protocol: 'https', hostname: '**.tiktokcdn-eu.com' },
      { protocol: 'https', hostname: '**.tiktokcdn-asia.com' },
      { protocol: 'https', hostname: '**.muscdn.com' },
    ],
  },
  async redirects() {
    return [
      {
        source: '/dashboard/settings',
        destination: '/dashboard/profile',
        permanent: true,
      },
      {
        source: '/dashboard/settings/:path*',
        destination: '/dashboard/profile',
        permanent: true,
      },
      {
        source: '/dashboard/growth-plan',
        destination: '/dashboard/growth',
        permanent: true,
      },
      {
        source: '/dashboard/tools',
        destination: '/dashboard',
        permanent: true,
      },
    ]
  },
  async headers() {
    // 开发模式（HMR/React Refresh 依赖 unsafe-eval）不加 CSP，避免 hydration 崩溃；生产才加严格 CSP。
    const isDev = process.env.NODE_ENV === 'development'
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ...(isDev ? [] : [{
          key: 'Content-Security-Policy',
          // 核心目标：即使存在 XSS，也阻断「向外部域外传 token」的通道。
          // - connect-src 'self'：客户端 fetch/XHR 只能打同源 /api/*（token 无法外传）
          // - script-src 'unsafe-inline'：JSON-LD（next/script + dangerouslySetInnerHTML）必需
          // - style-src 'unsafe-inline'：styled-jsx（<style jsx>）必需
          // - img-src https:：头像走 tiktokcdn 多级子域（CSP 无多级通配，图片非主要攻击面）
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "media-src 'self'",
            "frame-src 'none'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
          ].join('; '),
        }]),
      ],
    }]
  },
}

export default nextConfig
