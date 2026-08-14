/**
 * 获取客户端真实 IP —— 防 x-forwarded-for 首段伪造。
 *
 * Vercel 会把真实 IP 追加到 x-forwarded-for 末尾，首段可被客户端伪造，
 * 因此取末段（最接近服务器端的跳，最难伪造）。
 * 优先使用 Vercel 专有的 x-vercel-forwarded-for（不可被客户端伪造）。
 */

export function getClientIp(request: Request): string {
  // Vercel 专有头，不可被客户端伪造
  const vff = request.headers.get('x-vercel-forwarded-for')
  if (vff) {
    const parts = vff.split(',').map(s => s.trim()).filter(Boolean)
    return parts[parts.length - 1] || '127.0.0.1'
  }
  // x-forwarded-for: client, proxy1, proxy2... 末段最接近服务器
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',').map(s => s.trim()).filter(Boolean)
    return parts[parts.length - 1] || '127.0.0.1'
  }
  return request.headers.get('x-real-ip')?.trim() || '127.0.0.1'
}
