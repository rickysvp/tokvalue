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

  it('maps tiktok-ultra-api1 native snake_case response to RawProfile', async () => {
    process.env.TIKTOK_PROVIDERS = 'tiktok-ultra-api1.p.rapidapi.com:test-key'
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/v3/realtime/influencer/detail')) {
        return Response.json({
          code: 0, message: 'ok',
          data: { user: { unique_id: 'nljo_kiyokazu', nickname: 'Creator', sec_uid: 'sec-ultra-1', follower_count: 456, following_count: 12, aweme_count: 34, total_favorited: 7890, signature: 'hello', avatar_larger: 'https://a/av.jpg' } },
        })
      }
      if (url.includes('/api/v3/realtime/influencer/video/list')) {
        return Response.json({
          code: 0, message: 'ok',
          data: { aweme_list: [{ aweme_id: 'v1', desc: 'first', create_time: 100, statistics: { play_count: 1000, digg_count: 100, comment_count: 10, share_count: 5 } }] },
        })
      }
      return Response.json({})
    }))

    const profile = await fetchProfile('@nljo_kiyokazu')
    expect(profile.followerCount).toBe(456)
    expect(profile.videoCount).toBe(34)
    expect(profile.totalLikes).toBe(7890)
    expect(profile.secUid).toBe('sec-ultra-1')
    expect(profile.dataQuality).toBe('full')
    expect(profile.posts[0]).toMatchObject({ id: 'v1', playCount: 1000, likeCount: 100 })
  })

  it('parses tiktok-api23 data.itemList video response shape', async () => {
    process.env.TIKTOK_PROVIDERS = 'tiktok-api23.p.rapidapi.com:test-key'
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/api/user/info')) {
        return Response.json({ statusCode: 0, userInfo: { user: { uniqueId: 'creator_a', secUid: 'sec-a23' }, stats: { followerCount: 100, videoCount: 2 } } })
      }
      if (url.includes('/api/user/posts')) {
        return Response.json({ data: { statusCode: 0, itemList: [{ id: 'p1', createTime: 100, desc: 'hello', stats: { playCount: 5000, diggCount: 300, commentCount: 20, shareCount: 7 } }] } })
      }
      return Response.json({})
    }))

    const profile = await fetchProfile('creator_a')
    expect(profile.dataQuality).toBe('full')
    expect(profile.posts[0]).toMatchObject({ id: 'p1', playCount: 5000, likeCount: 300, shareCount: 7 })
  })

  it('maps atlas-tiktok-scraper flat profile + number_of_* stats with int32 overflow fix', async () => {
    process.env.TIKTOK_PROVIDERS = 'atlas-tiktok-scraper-api.p.rapidapi.com:test-key'
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/user/details')) {
        return Response.json({
          username: 'khaby_lame', user_id: '123', nickname: 'Khabane lame',
          followers: 163000000, following: 82, total_videos: 1359, total_heart: -1604780146,
          profile_image: 'https://a/av.jpg', description: 'ciao', verified: true, links: [],
        })
      }
      if (url.includes('/user/videos')) {
        return Response.json({
          username: 'khaby_lame', secondary_id: 'sec-atlas-1',
          videos: [{ video_id: 'v1', description: 'first', create_time: 100, statistics: { number_of_plays: 3600000, number_of_hearts: 280100, number_of_comments: 6720, number_of_reposts: 31700 } }],
        })
      }
      return Response.json({})
    }))

    const profile = await fetchProfile('@khaby_lame')
    expect(profile.followerCount).toBe(163000000)
    expect(profile.videoCount).toBe(1359)
    expect(profile.totalLikes).toBe(-1604780146 + 2 ** 32)
    expect(profile.secUid).toBe('sec-atlas-1')
    expect(profile.dataQuality).toBe('full')
    expect(profile.posts[0]).toMatchObject({ id: 'v1', playCount: 3600000, likeCount: 280100, commentCount: 6720, shareCount: 31700 })
  })

  it('promotes HTTP 404 not_found body from atlas to USER_NOT_FOUND', async () => {
    process.env.TIKTOK_PROVIDERS = 'atlas-tiktok-scraper-api.p.rapidapi.com:test-key'
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/user/details')) {
        return Response.json({ status: 404, error: 'not_found', message: 'User ghost_user not found', detail: 'User ghost_user not found' }, { status: 404 })
      }
      return Response.json({ videos: [] })
    }))

    await expect(fetchProfile('ghost_user')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' })
  })

  it('does not treat gateway endpoint-404 as USER_NOT_FOUND', async () => {
    process.env.TIKTOK_PROVIDERS = 'atlas-tiktok-scraper-api.p.rapidapi.com:test-key'
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ message: "Endpoint '\\/user\\/details' does not exist" }, { status: 404 })))

    await expect(fetchProfile('khaby_lame')).rejects.toMatchObject({ code: 'API_ERROR' })
  })

  it('maps tiktok381 user/stats response with flat video stats', async () => {
    process.env.TIKTOK_PROVIDERS = 'tiktok381.p.rapidapi.com:test-key'
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/userinfo-by-username')) {
        return Response.json({
          user: { id: '127905465618821121', uniqueId: 'khaby_lame', nickname: 'Khabane lame', secUid: 'sec-381', avatarLarger: 'https://a/av.jpg', signature: 'ciao' },
          stats: { followingCount: 82, followerCount: 162976841, heartCount: 2689632157, videoCount: 1360 },
        })
      }
      if (url.includes('/user-posts')) {
        return Response.json({
          videos: [{ video_id: 'v1', aweme_id: 'a1', title: 'first', create_time: 100, play_count: 3589833, digg_count: 280165, comment_count: 6716, share_count: 31669 }],
        })
      }
      return Response.json({})
    }))

    const profile = await fetchProfile('@khaby_lame')
    expect(profile.followerCount).toBe(162976841)
    expect(profile.videoCount).toBe(1360)
    expect(profile.totalLikes).toBe(2689632157)
    expect(profile.secUid).toBe('sec-381')
    expect(profile.dataQuality).toBe('full')
    expect(profile.posts[0]).toMatchObject({ id: 'v1', playCount: 3589833, likeCount: 280165, commentCount: 6716, shareCount: 31669 })
  })

  it('maps tiktok381 "Not found user" business error to USER_NOT_FOUND', async () => {
    process.env.TIKTOK_PROVIDERS = 'tiktok381.p.rapidapi.com:test-key'
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: 'error', message: 'Not found user' })))

    await expect(fetchProfile('ghost_user')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' })
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
