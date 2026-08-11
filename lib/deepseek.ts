import { TrendAnalysis, CommercializationAdvice, ContentStrategy } from '@/types'

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions'
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || ''
const AI_ENABLED = !!DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== 'your_deepseek_api_key_here'

// ── Language support ──

/** Maps locale codes to display names. Extend this list for new languages. */
const LANG_NAMES: Record<string, string> = {
  en: 'English',
  zh: 'Chinese (Simplified)',
  ja: 'Japanese',
  ko: 'Korean',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  ar: 'Arabic',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
}

/** Languages that use CJK characters — no Chinese-detection check needed for these. */
const CJK_LANGS = new Set(['zh', 'ja', 'ko'])

/** Normalize an Accept-Language header to a primary lang code. */
export function getLangFromAcceptLanguage(header: string | null): string {
  if (!header) return 'en'
  const primary = header.split(',')[0].trim()
  return primary.split('-')[0].toLowerCase()
}

/** Detect Chinese characters (U+4E00–U+9FFF) in any string. */
function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text)
}

/**
 * Generate a language-enforcement instruction for the AI prompt.
 * Includes an explanation of *why* it's critical — the account data may contain
 * the wrong language, and the model must translate/adapt.
 */
function getLanguageInstruction(lang: string): string {
  const name = LANG_NAMES[lang] || LANG_NAMES.en || 'English'
  return (
    `CRITICAL LANGUAGE RULE: ALL text content in the JSON output MUST be written in ${name}.\n` +
    `The account data below may contain text in another language — you must translate or adapt it to ${name} in your output.\n` +
    `Do NOT mix languages. Do NOT output Chinese, Japanese, or any other language unless the target is specifically ${name}.\n` +
    `Wrong-language output will be automatically detected and discarded.`
  )
}

// ── Account snapshot ──

interface AccountSnapshot {
  username: string
  nickname: string
  followerCount: number
  videoCount: number
  totalLikes: number
  engagementRate: number
  avgPlays: number
  playGrowth: number
  region: string
  categories: string[]
  tier: string
  score: number
  videoDescriptions: string[]
}

// ── DeepSeek API client ──

async function callDeepSeek(systemPrompt: string, userPrompt: string): Promise<string | null> {
  if (!AI_ENABLED) return null

  try {
    const res = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      console.error('[deepseek] API error', res.status, await res.text().catch(() => ''))
      return null
    }

    const data = await res.json()
    return data.choices?.[0]?.message?.content || null
  } catch (err) {
    console.error('[deepseek] call failed:', err)
    return null
  }
}

/**
 * Call DeepSeek with language validation. For non-CJK target languages,
 * check the output for Chinese characters. If found, retry once with a
 * stricter prompt. If the retry still fails, return null.
 */
async function callDeepSeekValidated(
  systemPrompt: string,
  userPrompt: string,
  lang: string,
): Promise<string | null> {
  const result = await callDeepSeek(systemPrompt, userPrompt)
  if (!result) return null

  // Skip Chinese-check for CJK languages
  if (CJK_LANGS.has(lang)) return result

  if (containsChinese(result)) {
    console.warn(
      '[deepseek] Chinese characters detected in output (target: ' +
        (LANG_NAMES[lang] || lang) +
        '), retrying with stricter prompt…',
    )

    const stricterSystem = systemPrompt
      + '\n\n---\n⚠️ YOUR PREVIOUS RESPONSE CONTAINED CHINESE CHARACTERS. '
      + `ALL text values in the JSON MUST be in ${LANG_NAMES[lang] || 'English'} ONLY. `
      + 'Chinese, Japanese, and any other CJK characters are FORBIDDEN in this output.'

    const retryResult = await callDeepSeek(stricterSystem, userPrompt)
    if (retryResult && !containsChinese(retryResult)) {
      console.log('[deepseek] Retry successful — output is clean')
      return retryResult
    }

    console.warn('[deepseek] Retry also failed language check — returning null')
    return null
  }

  return result
}

// ── JSON helpers ──

function extractJson(content: string): unknown {
  content = content.trim()
  // Strip markdown code block if present
  if (content.startsWith('```')) {
    const lines = content.split('\n')
    const withoutFirst = lines.slice(1)
    const withoutLast = withoutFirst[withoutFirst.length - 1]?.trim() === '```'
      ? withoutFirst.slice(0, -1)
      : withoutFirst
    content = withoutLast.join('\n').trim()
  }

  try {
    return JSON.parse(content)
  } catch {
    // Try to fix common LLM JSON errors: unquoted string values after colon
    const fixed = content
      .replace(/:(\s*)(#[a-zA-Z0-9_]+)(?=[,}\]])/g, ': "$2"')
      .replace(/:(\s*)([a-zA-Z][a-zA-Z0-9_]*)(\s*)(?=[,}\]])/g, (_match, p1, p2, p3) => {
        return `: "${p2}"${p3}`
      })
    return JSON.parse(fixed)
  }
}

// ═══════════════════════════════════════════════════════════════
// AI-Powered Trend Analysis
// ═══════════════════════════════════════════════════════════════

export async function generateTrendAnalysis(
  snapshot: AccountSnapshot,
  lang = 'en',
): Promise<TrendAnalysis | null> {
  const langInstr = getLanguageInstruction(lang)

  const systemPrompt =
    `You are a TikTok trend analysis expert. Based on account data, analyze the most suitable trending topics, sounds, content predictions, and best posting times for this account.\n` +
    `Return ONLY valid JSON, no markdown code blocks.\n` +
    langInstr

  const userPrompt = `Analyze the following TikTok account and provide trend recommendations:

Account Info:
- Username: @${snapshot.username}
- Nickname: ${snapshot.nickname}
- Followers: ${snapshot.followerCount.toLocaleString()}
- Videos: ${snapshot.videoCount}
- Engagement Rate: ${snapshot.engagementRate}%
- Avg Plays: ${snapshot.avgPlays.toLocaleString()}
- Play Growth: ${snapshot.playGrowth}%
- Region: ${snapshot.region}
- Categories: ${snapshot.categories.join(', ')}
- Tier: ${snapshot.tier} (${snapshot.score}pts)

Recent video descriptions:
${snapshot.videoDescriptions.slice(0, 5).map((d, i) => `${i + 1}. ${d}`).join('\n')}

Return this JSON structure:
{
  "trendingTopics": [
    { "topic": "Topic name", "hashtag": "HashtagFormat", "growth": number, "relevance": number(0-100) }
  ] (5 items),
  "trendingSounds": [
    { "name": "Sound name", "artist": "Artist", "usageCount": "Usage description", "growth": number }
  ] (3 items),
  "contentPredictions": [
    { "direction": "Content direction", "confidence": number(0-100), "expectedEngagement": "Expected engagement range", "why": "Why this direction works" }
  ] (3 items),
  "bestPostTimes": [
    { "day": "Mon/Tue/Wed/Thu/Fri/Sat/Sun", "hour": number(0-23), "score": number(0-100) }
  ] (7 items, one per day),
  "summary": "2-3 sentence trend analysis summary"
}`

  const result = await callDeepSeekValidated(systemPrompt, userPrompt, lang)
  if (!result) return null

  try {
    return extractJson(result) as TrendAnalysis
  } catch {
    console.error('[deepseek] failed to parse trend analysis JSON, raw:', result.slice(0, 200))
    return null
  }
}

// ═══════════════════════════════════════════════════════════════
// AI-Powered Commercialization Advice
// ═══════════════════════════════════════════════════════════════

export async function generateCommercializationAdvice(
  snapshot: AccountSnapshot,
  lang = 'en',
): Promise<CommercializationAdvice | null> {
  const langInstr = getLanguageInstruction(lang)

  const systemPrompt =
    `You are a TikTok monetization advisor. Based on account data, recommend the most suitable monetization directions and specific action steps.\n` +
    `Return ONLY valid JSON, no markdown code blocks.\n` +
    langInstr

  const userPrompt = `Analyze the following TikTok account and recommend monetization directions:

Account Info:
- Username: @${snapshot.username}
- Nickname: ${snapshot.nickname}
- Followers: ${snapshot.followerCount.toLocaleString()}
- Videos: ${snapshot.videoCount}
- Engagement Rate: ${snapshot.engagementRate}%
- Avg Plays: ${snapshot.avgPlays.toLocaleString()}
- Play Growth: ${snapshot.playGrowth > 0 ? '+' : ''}${snapshot.playGrowth}%
- Region: ${snapshot.region}
- Categories: ${snapshot.categories.join(', ')}
- Tier: ${snapshot.tier} (${snapshot.score}pts)

Recent video descriptions:
${snapshot.videoDescriptions.slice(0, 5).map((d, i) => `${i + 1}. ${d}`).join('\n')}

From the following 8 directions, recommend the top 5 best fits: Brand Sponsorships, Short-Video Commerce, Live Shopping, Live Gifts/Donations, Creator Fund, Digital Products/Courses, Community Membership, E-commerce Store

For each direction, provide:
- fitScore (0-100)
- difficulty (low/medium/high)
- estimatedMonthlyRevenue (low/mid/high, in USD)
- revenuePotential (low/medium/high)
- one-sentence description
- 3-4 specific action steps
- why this direction is recommended
- 2-3 prerequisites

Return JSON:
{
  "directions": [
    {
      "name": "Direction name",
      "icon": "Building2/ShoppingBag/Radio/Gift/Coins/BookOpen/Users/Store",
      "fitScore": number,
      "difficulty": "low/medium/high",
      "estimatedMonthlyRevenue": { "low": number, "mid": number, "high": number },
      "revenuePotential": "low/medium/high",
      "description": "Description",
      "actionSteps": ["Step 1", "Step 2", "Step 3", "Step 4"],
      "why": "Reason for recommendation",
      "prerequisites": ["Prerequisite 1", "Prerequisite 2"]
    }
  ] (5 items, sorted by fitScore descending),
  "primaryRecommendation": "One-sentence summary of top recommendation",
  "secondaryRecommendation": "One-sentence summary of runner-up",
  "estimatedTotalMonthly": { "low": number, "mid": number, "high": number },
  "summary": "2-3 sentence monetization summary"
}`

  const result = await callDeepSeekValidated(systemPrompt, userPrompt, lang)
  if (!result) return null

  try {
    return extractJson(result) as CommercializationAdvice
  } catch {
    console.error('[deepseek] failed to parse commercialization JSON, raw:', result.slice(0, 200))
    return null
  }
}

// ═══════════════════════════════════════════════════════════════
// AI-Powered Content Strategy
// ═══════════════════════════════════════════════════════════════

export async function generateContentStrategy(
  snapshot: AccountSnapshot,
  lang = 'en',
): Promise<ContentStrategy | null> {
  const langInstr = getLanguageInstruction(lang)

  const systemPrompt =
    `You are a TikTok content strategy expert. Based on account data, provide customized content strategy recommendations.\n` +
    `Return ONLY valid JSON, no markdown code blocks.\n` +
    langInstr

  const userPrompt = `Analyze the following TikTok account and provide content strategy recommendations:

Account Info:
- Username: @${snapshot.username}
- Nickname: ${snapshot.nickname}
- Followers: ${snapshot.followerCount.toLocaleString()}
- Videos: ${snapshot.videoCount}
- Engagement Rate: ${snapshot.engagementRate}%
- Avg Plays: ${snapshot.avgPlays.toLocaleString()}
- Play Growth: ${snapshot.playGrowth > 0 ? '+' : ''}${snapshot.playGrowth}%
- Region: ${snapshot.region}
- Categories: ${snapshot.categories.join(', ')}
- Tier: ${snapshot.tier} (${snapshot.score}pts)

Recent video descriptions:
${snapshot.videoDescriptions.slice(0, 5).map((d, i) => `${i + 1}. ${d}`).join('\n')}

Return JSON:
{
  "pillars": [
    {
      "type": "Content type",
      "icon": "BookOpen/Camera/TrendingUp",
      "frequency": "X per week",
      "expectedEngagement": "Expected engagement rate range",
      "examples": ["Example title 1", "Example title 2", "Example title 3"],
      "why": "Why this type is recommended"
    }
  ] (3 items),
  "recommendedHashtags": [
    { "tag": "#hashtag", "volume": "high/medium/low", "relevance": number(0-100) }
  ] (5 items),
  "optimalSchedule": [
    { "day": "Mon/Tue/Wed/Thu/Fri", "time": "HH:00", "format": "Content type" }
  ] (5 items),
  "collaborationIdeas": [
    { "type": "Collaboration type", "description": "Description", "potential": "high/medium/low" }
  ] (2-3 items),
  "summary": "2-3 sentence content strategy summary"
}`

  const result = await callDeepSeekValidated(systemPrompt, userPrompt, lang)
  if (!result) return null

  try {
    return extractJson(result) as ContentStrategy
  } catch {
    console.error('[deepseek] failed to parse content strategy JSON, raw:', result.slice(0, 200))
    return null
  }
}
