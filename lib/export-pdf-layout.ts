export interface A4PagePlan {
  pageWidthMm: number
  pageHeightMm: number
  imageHeightMm: number
  pageCount: number
  pageOffsetsMm: number[]
}

/** Scale one report screenshot to A4 width and repeat it at page-sized offsets. */
export function buildA4PagePlan(canvasWidth: number, canvasHeight: number): A4PagePlan {
  if (canvasWidth <= 0 || canvasHeight <= 0) throw new Error('empty report canvas')
  const pageWidthMm = 210
  const pageHeightMm = 297
  const imageHeightMm = canvasHeight * pageWidthMm / canvasWidth
  const pageCount = Math.max(1, Math.ceil(imageHeightMm / pageHeightMm))
  return {
    pageWidthMm,
    pageHeightMm,
    imageHeightMm,
    pageCount,
    pageOffsetsMm: Array.from({ length: pageCount }, (_, index) => index === 0 ? 0 : -index * pageHeightMm),
  }
}
