export interface RadarPoint {
  x: number
  y: number
}

const DEG2RAD = Math.PI / 180

function clampScore(score: number): number {
  return Math.min(100, Math.max(0, score))
}

/**
 * 雷达图多边形顶点：第 i 轴角度 = -90° + 360°/n · i，
 * 半径 r = radius · clamp(score, 0, 100) / 100，点 = (cx + r·cosθ, cy + r·sinθ)
 */
export function radarPolygonPoints(
  scores: number[],
  cx: number,
  cy: number,
  radius: number,
): RadarPoint[] {
  const n = scores.length
  return scores.map((score, i) => {
    const theta = (-90 + (360 / n) * i) * DEG2RAD
    const r = (radius * clampScore(score)) / 100
    return { x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) }
  })
}

/** 满半径轴端点（放轴 label 用） */
export function radarAxisAnchors(count: number, cx: number, cy: number, radius: number): RadarPoint[] {
  return radarPolygonPoints(new Array(count).fill(100), cx, cy, radius)
}
