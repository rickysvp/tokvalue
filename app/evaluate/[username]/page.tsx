import { Metadata } from 'next'
import { EvaluatePage } from '@/components/EvaluatePage'

interface Props {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const raw = await params
  const username = decodeURIComponent(raw.username).replace(/^@/, '')
  return {
    title: `@${username} TikTok Account Valuation`,
    description: `See the valuation, income estimate, and growth analysis for @${username} on TikTok. Powered by TokValue.`,
    alternates: {
      canonical: `https://tokvalue.com/evaluate/@${username}`,
    },
    robots: {
      index: false,
      follow: true,
    },
  }
}

export default async function EvaluateUserPage({ params }: Props) {
  const raw = await params
  const username = decodeURIComponent(raw.username).replace(/^@/, '')
  return <EvaluatePage username={username} />
}
