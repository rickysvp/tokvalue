import { describe, expect, it } from 'vitest'
import { buildA4PagePlan } from './export-pdf-layout'

describe('buildA4PagePlan', () => {
  it('keeps the report aspect ratio and covers every pixel across A4 pages', () => {
    const plan = buildA4PagePlan(1200, 5000)

    expect(plan.pageWidthMm).toBe(210)
    expect(plan.pageHeightMm).toBe(297)
    expect(plan.imageHeightMm).toBeCloseTo(875)
    expect(plan.pageCount).toBe(3)
    expect(plan.pageOffsetsMm).toEqual([0, -297, -594])
  })

  it('uses one page for a short report and rejects empty canvases', () => {
    expect(buildA4PagePlan(1200, 1000).pageCount).toBe(1)
    expect(() => buildA4PagePlan(0, 1000)).toThrow('empty report canvas')
  })
})
