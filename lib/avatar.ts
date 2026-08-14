// 头像持久化工具：下载 TikTok 头像 → sharp 压缩为 WebP → base64
// 解决 TikTok CDN 签名 URL 24h 过期问题（存 base64 到 Neon，永久可读）

import sharp from 'sharp'

const AVATAR_SIZE = 96 // 头像墙显示尺寸，96px 足够，节省存储

/**
 * 下载并压缩头像为 base64 data URI。
 * 返回 null 表示失败（调用方应回退到原 URL 或占位）。
 */
export async function fetchAndEncodeAvatar(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  try {
    // TikTok CDN 需要完整浏览器头（尤其 Accept: image/webp）才能下载
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Referer: 'https://www.tiktok.com/',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    const input = Buffer.from(await res.arrayBuffer())
    if (input.length < 500) return null

    // 压缩为正方形 WebP
    const output = await sharp(input)
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer()

    return `data:image/webp;base64,${output.toString('base64')}`
  } catch {
    return null
  }
}
