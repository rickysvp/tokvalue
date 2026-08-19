import { describe, it, expect } from 'vitest'
import { radarPolygonPoints, radarAxisAnchors } from './radar-geometry'

const DEG = Math.PI / 180

describe('radarPolygonPoints', () => {
  it('places the first axis straight up at full score', () => {
    const [p] = radarPolygonPoints([100], 120, 120, 100)
    expect(p.x).toBeCloseTo(120)
    expect(p.y).toBeCloseTo(20) // cy - radius
  })

  it('halves the radius when score is 50', () => {
    const [p] = radarPolygonPoints([50], 120, 120, 100)
    expect(p.x).toBeCloseTo(120)
    expect(p.y).toBeCloseTo(70) // cy - radius * 0.5
  })

  it('clamps out-of-range scores to [0, 100]', () => {
    const [over, under] = radarPolygonPoints([150, -20], 120, 120, 100)
    expect(over.x).toBeCloseTo(120)
    expect(over.y).toBeCloseTo(20) // 150 clamped to 100
    expect(under.x).toBeCloseTo(120)
    expect(under.y).toBeCloseTo(120) // -20 clamped to 0 → center
  })

  it('spaces n=3 axes at -90°, 30°, 150°', () => {
    const points = radarPolygonPoints([100, 100, 100], 120, 120, 100)
    const secondAxisAngle = -90 + 360 / 3 // 30°
    expect(points[1].x).toBeCloseTo(120 + 100 * Math.cos(secondAxisAngle * DEG))
    expect(points[1].y).toBeCloseTo(120 + 100 * Math.sin(secondAxisAngle * DEG))
    expect(points[0].x).toBeCloseTo(120)
    expect(points[2].y).toBeCloseTo(120 + 100 * Math.sin(150 * DEG))
  })
})

describe('radarAxisAnchors', () => {
  it('returns full-radius endpoints for each axis', () => {
    const anchors = radarAxisAnchors(3, 120, 120, 100)
    expect(anchors).toHaveLength(3)
    const full = radarPolygonPoints([100, 100, 100], 120, 120, 100)
    anchors.forEach((a, i) => {
      expect(a.x).toBeCloseTo(full[i].x)
      expect(a.y).toBeCloseTo(full[i].y)
    })
  })
})
