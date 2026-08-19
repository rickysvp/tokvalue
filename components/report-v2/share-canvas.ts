import { Evaluation } from '@/types'
import { valueTierOf, valueTierColor } from '@/lib/pillar'
import { formatNumber } from '@/lib/format'

export function layoutShareCard() {
  return {
    width: 1200,
    height: 630,
    logo: { x: 80, y: 72, size: 40 },
    username: { x: 80, y: 180, size: 44 },
    value: { x: 80, y: 320, size: 96 },
    range: { x: 80, y: 440, size: 34 },
    badge: { x: 80, y: 500, size: 28 },
    watermark: { x: 880, y: 580, size: 24 },
  }
}

export function drawShareCard(canvas: HTMLCanvasElement, result: Evaluation, isPremium: boolean): void {
  const l = layoutShareCard()
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = l.width
  canvas.height = l.height

  const tierColor = valueTierColor(result.tier)

  ctx.fillStyle = '#F7F8FA'
  ctx.fillRect(0, 0, l.width, l.height)

  ctx.fillStyle = tierColor
  ctx.font = `600 ${l.logo.size}px sans-serif`
  ctx.fillText('TokValue', l.logo.x, l.logo.y + l.logo.size)

  ctx.fillStyle = '#111827'
  ctx.font = `600 ${l.username.size}px sans-serif`
  ctx.fillText(`@${result.username}`, l.username.x, l.username.y + l.username.size)

  const range = result.valuationV2?.range
  ctx.fillStyle = tierColor
  ctx.font = `700 ${l.value.size}px sans-serif`
  const mid = range?.mid ?? result.businessValue.totalValue.high
  ctx.fillText(isPremium ? `$${formatNumber(mid)}` : '$•••••', l.value.x, l.value.y + l.value.size)

  if (range) {
    ctx.fillStyle = '#6B7280'
    ctx.font = `400 ${l.range.size}px sans-serif`
    ctx.fillText(`Estimated value range: $${formatNumber(range.low)} – $${formatNumber(range.high)}`, l.range.x, l.range.y + l.range.size)
  }

  ctx.fillStyle = tierColor
  ctx.font = `600 ${l.badge.size}px sans-serif`
  const percentile = result.peerRanking.overallPercentile
  ctx.fillText(`${valueTierOf(result.tier)} · Top ${100 - percentile}% of similar creators`, l.badge.x, l.badge.y + l.badge.size)

  ctx.fillStyle = '#9CA3AF'
  ctx.font = `400 ${l.watermark.size}px sans-serif`
  ctx.fillText('tokvalue.com', l.watermark.x, l.watermark.y + l.watermark.size)
}
