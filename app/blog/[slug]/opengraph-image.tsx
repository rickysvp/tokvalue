import { ImageResponse } from 'next/og'
import { getPostBySlug } from '@/lib/blog'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'TokValue — TikTok Account Valuation'

function titleFontSize(title: string): number {
  if (title.length > 100) return 42
  if (title.length > 78) return 48
  if (title.length > 56) return 56
  if (title.length > 38) return 64
  return 72
}

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = getPostBySlug(slug)

  const title = post?.title ?? 'TokValue Blog'
  const category = post?.category ?? 'Creator Economy'

  return new ImageResponse(
    (
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#000000',
          padding: '64px 72px',
        }}
      >
        {/* top accent bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '14px',
            display: 'flex',
          }}
        >
          <div style={{ width: '50%', height: '14px', backgroundColor: '#00F2EA' }} />
          <div style={{ width: '50%', height: '14px', backgroundColor: '#FF0050' }} />
        </div>

        {/* brand row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 800 }}>
            <span style={{ color: '#FFFFFF' }}>Tok</span>
            <span style={{ color: '#00F2EA' }}>Value</span>
          </div>
          <div style={{ fontSize: 20, color: '#9CA3AF' }}>
            · TikTok Account Valuation
          </div>
        </div>

        {/* category + title */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              border: '2px solid #00F2EA',
              color: '#00F2EA',
              fontSize: 24,
              fontWeight: 700,
              padding: '8px 18px',
            }}
          >
            {category}
          </div>
          <div
            style={{
              color: '#FFFFFF',
              fontSize: titleFontSize(title),
              fontWeight: 800,
              lineHeight: 1.12,
              maxWidth: '1050px',
              letterSpacing: '-0.02em',
            }}
          >
            {title}
          </div>
        </div>

        {/* footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '3px solid #1F1F1F',
            paddingTop: '22px',
          }}
        >
          <div style={{ fontSize: 24, color: '#E5E7EB', fontWeight: 600 }}>
            tokvalue.com
          </div>
          <div style={{ display: 'flex', fontSize: 20, color: '#9CA3AF' }}>
            Free TikTok account valuation
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
