import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api-governance', () => ({
  recordApiCall: vi.fn(async () => {}),
  recordProviderOutcome: vi.fn(async () => {}),
  isProviderCircuitOpen: vi.fn(async () => false),
  readCostPerCallUsd: vi.fn(() => 0.01),
}))

import { fetchProfile } from './tiktok'

const originalProviders = process.env.TIKTOK_PROVIDERS
const originalKeys = process.env.RAPIDAPI_KEYS
const originalKey = process.env.RAPIDAPI_KEY

beforeEach(() => {
  process.env.TIKTOK_PROVIDERS = 'tiktok-scraper7.p.rapidapi.com:test-key,tiktok-api6.p.rapidapi.com:test-key'
  delete process.env.RAPIDAPI_KEYS
  delete process.env.RAPIDAPI_KEY
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (originalProviders === undefined) delete process.env.TIKTOK_PROVIDERS
  else process.env.TIKTOK_PROVIDERS = originalProviders
  if (originalKeys === undefined) delete process.env.RAPIDAPI_KEYS
  else process.env.RAPIDAPI_KEYS = originalKeys
  if (originalKey === undefined) delete process.env.RAPIDAPI_KEY
  else process.env.RAPIDAPI_KEY = originalKey
})

function api6Profile() {
  return Response.json({ username: 'nljo_kiyokazu', nickname: 'Creator', followers: 123, total_videos: 5, secondary_id: 'sec-123' })
}

describe('fetchProfile provider responses', () => {
  it('tries the next provider when an upstream message says invalid API key', async () => {
    const called: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      called.push(url)
      if (url.includes('tiktok-scraper7')) return Response.json({ message: 'Invalid API key' })
      if (url.endsWith('/user/details')) return api6Profile()
      return Response.json({ videos: [] })
    }))

    const profile = await fetchProfile('@nljo_kiyokazu')
    expect(profile.followerCount).toBe(123)
    expect(called.some(url => url.endsWith('/user/details'))).toBe(true)
  })

  it('tries the next provider after one provider says user does not exist', async () => {
    const called: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      called.push(url)
      if (url.includes('tiktok-scraper7')) return Response.json({ detail: 'User nljo_kiyokazu does not exist' })
      if (url.endsWith('/user/details')) return api6Profile()
      return Response.json({ videos: [] })
    }))

    const profile = await fetchProfile('nljo_kiyokazu')
    expect(profile.secUid).toBe('sec-123')
    expect(called.some(url => url.endsWith('/user/details'))).toBe(true)
  })

  it('does not call an ambiguous response account not found when another provider says not found', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('tiktok-scraper7')) return Response.json({ code: -1, msg: 'unique_id is invalid' })
      if (url.endsWith('/user/details')) return Response.json({ detail: 'User nljo_kiyokazu does not exist' })
      return Response.json({ videos: [] })
    }))

    await expect(fetchProfile('nljo_kiyokazu')).rejects.toMatchObject({ code: 'API_ERROR' })
  })

  it('rejects empty userInfo rather than creating a profile from the requested username', async () => {
    process.env.TIKTOK_PROVIDERS = 'tiktok-api23.p.rapidapi.com:test-key'
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ statusCode: 10221, status_code: 0, userInfo: { user: {} } })))

    await expect(fetchProfile('nljo_kiyokazu')).rejects.toMatchObject({ code: 'API_ERROR' })
  })

  it('accepts an identified account with zero followers and videos', async () => {
    process.env.TIKTOK_PROVIDERS = 'tiktok-api23.p.rapidapi.com:test-key'
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      statusCode: 0,
      userInfo: { user: { uniqueId: 'new_creator', nickname: 'New Creator' }, stats: { followerCount: 0, videoCount: 0 } },
    })))

    const profile = await fetchProfile('new_creator')
    expect(profile.nickname).toBe('New Creator')
    expect(profile.followerCount).toBe(0)
  })

  it('returns account not found when every provider explicitly reports a missing user', async () => {
    const called: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      called.push(url)
      return Response.json({ detail: 'User nljo_kiyokazu does not exist' })
    }))

    await expect(fetchProfile('nljo_kiyokazu')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' })
    expect(called.filter(url => url.includes('/user/info?') || url.endsWith('/user/details'))).toHaveLength(2)
  })
})
