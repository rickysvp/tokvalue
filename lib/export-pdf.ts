import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import type { Evaluation } from '@/types'
import { buildA4PagePlan } from '@/lib/export-pdf-layout'

const REPORT_BACKGROUND = '#F7F8FA'

/**
 * Single rendering source for PNG and PDF exports. The exported pixels are the
 * same ReportShell DOM that the user sees, so new/conditional sections cannot
 * drift from a separately maintained PDF template.
 */
export async function captureReportCanvas(reportEl: HTMLElement): Promise<HTMLCanvasElement> {
  await document.fonts?.ready
  return html2canvas(reportEl, {
    backgroundColor: REPORT_BACKGROUND,
    scale: 2,
    useCORS: true,
    allowTaint: false,
    logging: false,
    windowWidth: reportEl.scrollWidth,
    windowHeight: reportEl.scrollHeight,
    scrollX: 0,
    scrollY: 0,
    onclone: (clonedDoc) => {
      // Sticky/fixed navigation must stay in document flow in the snapshot.
      clonedDoc.querySelectorAll('[class*="sticky"], [class*="fixed"]').forEach((el) => {
        const node = el as HTMLElement
        node.style.position = 'relative'
        node.style.top = 'auto'
        node.style.left = 'auto'
      })
      // Capture completed visual states rather than an animation mid-frame.
      clonedDoc.querySelectorAll('*').forEach((el) => {
        const node = el as HTMLElement
        node.style.animation = 'none'
        node.style.transition = 'none'
      })
    },
  })
}

export async function generatePdfBlob(
  result: Evaluation,
  reportEl: HTMLElement,
): Promise<Blob> {
  const canvas = await captureReportCanvas(reportEl)
  const image = canvas.toDataURL('image/png')
  const plan = buildA4PagePlan(canvas.width, canvas.height)
  const documentPdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })

  documentPdf.setProperties({
    title: `TokValue - @${result.username} Account Value Report`,
    author: 'TokValue',
    creator: 'TokValue.com',
  })

  plan.pageOffsetsMm.forEach((offset, index) => {
    if (index > 0) documentPdf.addPage('a4', 'portrait')
    documentPdf.addImage(
      image,
      'PNG',
      0,
      offset,
      plan.pageWidthMm,
      plan.imageHeightMm,
      'tokvalue-report',
      'FAST',
    )
  })

  return documentPdf.output('blob')
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export async function downloadPdf(result: Evaluation, reportEl: HTMLElement): Promise<void> {
  const blob = await generatePdfBlob(result, reportEl)
  const url = URL.createObjectURL(blob)
  try {
    triggerDownload(url, `TokValue-${result.username}-${new Date().toISOString().slice(0, 10)}.pdf`)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function downloadPng(result: Evaluation, reportEl: HTMLElement): Promise<void> {
  const canvas = await captureReportCanvas(reportEl)
  triggerDownload(canvas.toDataURL('image/png'), `tokvalue-${result.username}.png`)
}
