import { describe, it, expect } from 'vitest'
import { scoreProfile } from '../scoring'
import { RawProfile } from '../../types'
import {
  getFollowerTier,
  getBrandDealFollowerCap,
  calcBrandDealValue,
  BrandDealInput,
} from './valuation'

const now = Math.floor(Date.now() / 1000)

function post(id: string, playCount: number, createTime: number, desc = '#fitness #workout daily routine') {
  return {
    id,
    playCount,
    likeCount: Math.round(playCount * 0.05),
    commentCount: Math.round(playCount * 0.005),
    shareCount: Math.round(playCount * 0.002),
    createTime,
    desc,
  }
}

function buildProfile(overrides: Partial<RawProfile> = {}): RawProfile {
  return {
    username: 'testcreator',
    nickname: 'Test Creator',
    followerCount: 50000,
    followingCount: 500,
    totalLikes: 2500000,
    videoCount: 120,
    secUid: 'sec-uid-test',
    region: 'US',
    avatar: 'https://example.com/avatar.jpg',
    bio: 'Fitness and lifestyle content creator',
    verified: true,
    posts: [
      post('1', 250000, now - 1 * 86400),
      post('2', 180000, now - 3 * 86400),
      post('3', 320000, now - 5 * 86400),
      post('4', 150000, now - 8 * 86400),
      post('5', 200000, now - 12 * 86400),
      post('6', 90000, now - 20 * 86400),
      post('7', 120000, now - 30 * 86400),
      post('8', 80000, now - 45 * 86400),
      post('9', 110000, now - 60 * 86400),
      post('10', 70000, now - 80 * 86400),
    ],
    ...overrides,
  }
}

/** 极端"播放 × 参与率"组合直调输入（审计复现：修复前 perVideoMid = $463,320） */
const extremeMidInput: BrandDealInput = {
  effectiveAvgPlays: 2_000_000,
  categoryCpm: 30,
  er: 20,
  regionMult: 1.0,
  postsPerMonth: 12,
  followers: 200_000,
  playGrowth: 60,
  risks: [],
  verified: true,
  categories: ['finance'],
}

// ===== 报价上限锚点表 =====

describe('getBrandDealFollowerCap（粉丝分层报价上限锚点）', () => {
  it('nano/micro/mid 返回正上限，macro/mega 返回 0（走 MARKET_ANCHORS）', () => {
    expect(getFollowerTier(3_000)).toBe('nano')
    expect(getFollowerTier(50_000)).toBe('micro')
    expect(getFollowerTier(200_000)).toBe('mid')
    expect(getBrandDealFollowerCap('nano', 3_000)).toBeGreaterThan(0)
    expect(getBrandDealFollowerCap('micro', 50_000)).toBeGreaterThan(0)
    expect(getBrandDealFollowerCap('mid', 200_000)).toBeGreaterThan(0)
    expect(getBrandDealFollowerCap('macro', 800_000)).toBe(0)
    expect(getBrandDealFollowerCap('mega', 5_000_000)).toBe(0)
  })

  it('cap 与 followerCount 挂钩且不超过分层封顶', () => {
    // nano：3K 粉线性项生效（≈$1,050），9K 粉触顶 $2,500
    expect(getBrandDealFollowerCap('nano', 3_000)).toBe(1_050)
    expect(getBrandDealFollowerCap('nano', 9_000)).toBe(2_500)
    // micro：5 万粉线性项 ≈ $10,500，10 万粉触顶 $12,000
    expect(getBrandDealFollowerCap('micro', 50_000)).toBe(10_500)
    expect(getBrandDealFollowerCap('micro', 99_999)).toBe(12_000)
    // mid：10 万粉线性项 $12,000 触顶，20 万粉仍为 $12,000（审计案例 20 万粉 → $12K）
    expect(getBrandDealFollowerCap('mid', 100_000)).toBe(12_000)
    expect(getBrandDealFollowerCap('mid', 200_000)).toBe(12_000)
  })
})

// ===== 极端报价 clamp（审计 Major 修复） =====

describe('calcBrandDealValue 报价上限 clamp', () => {
  it('审计案例：20 万粉极端组合报价被压到 mid 层锚点内（修复前 $463,320）', () => {
    const r = calcBrandDealValue({ ...extremeMidInput })
    // mid 层锚点：20 万粉 → $12,000（数千至一万二量级，非数十万）
    expect(r.perVideoMid).toBe(12_000)
    // high = mid × 1.5，同受锚点约束
    expect(r.perVideoHigh).toBe(18_000)
    // monthly = perVideo × monthlyBrandPosts（2 条/月，mid 层接单上限下调 5→2）
    expect(r.monthlyBrandPosts).toBe(2)
    expect(r.monthlyMid).toBe(24_000)
    // 标记锚点生效
    expect(r.detail.followerCapAnchored).toBe(true)
    expect(r.detail.marketAnchored).toBe(false)
  })

  it('micro 层极端爆款（10 万粉 + 500 万均播 + er 20%）同样被 clamp（修复前 $257K+）', () => {
    const r = calcBrandDealValue({
      ...extremeMidInput,
      followers: 99_999,
      effectiveAvgPlays: 5_000_000,
    })
    expect(r.perVideoMid).toBe(12_000)
    expect(r.detail.followerCapAnchored).toBe(true)
  })

  it('nano 层极端爆款（1 万粉内 + 45 万均播 + er 20%）被压到 nano 封顶（修复前 $57K+）', () => {
    const r = calcBrandDealValue({
      ...extremeMidInput,
      followers: 9_000,
      effectiveAvgPlays: 450_000,
    })
    expect(r.perVideoMid).toBe(2_500)
    expect(r.detail.followerCapAnchored).toBe(true)
  })

  it('mega 层不受粉丝锚点影响，继续走 MARKET_ANCHORS 夹紧（正常大报价保留）', () => {
    // 100 万粉 + 30 万均播的正常高互动号：raw ≈ $154K，位于 mega fashion 锚点区间 [$18K, $540K] 内
    const r = calcBrandDealValue({
      ...extremeMidInput,
      followers: 1_000_000,
      effectiveAvgPlays: 300_000,
      categoryCpm: 15,
      er: 17,
      categories: ['fashion'],
    })
    expect(r.perVideoMid).toBeGreaterThan(12_000) // 未被中腰部锚点误伤
    expect(r.detail.followerCapAnchored).toBe(false)
    expect(r.detail.marketAnchored).toBe(false)
  })
})

// ===== 正常账号不回归 =====

describe('正常账号报价不受 clamp 影响（不回归）', () => {
  it('micro 正常爆款账号（50K 粉，粉比 ~6.5x，er 5.7%）：报价与修复前一致', () => {
    // 基线：perVideoMid = $6,037（播放量改用中位数抗爆款 + 互动溢价封顶后下调）
    const e = scoreProfile(buildProfile(), { now })
    expect(e.brandDealPerVideo!.mid).toBe(6_037)
    // 收入明细不应带 Follower-Cap 标记
    const brandBreakdown = e.incomeEstimate.breakdown.find(b => b.source === 'brand_deals')!
    expect(brandBreakdown.detail).not.toContain('Follower-Cap')
  })

  it('micro 正常账号（30K 粉，粉比 ~2.4x，er 5.7%）：报价与修复前一致', () => {
    const e = scoreProfile(buildProfile({
      followerCount: 30_000,
      totalLikes: 400_000,
      videoCount: 80,
      posts: Array.from({ length: 10 }, (_, i) => post(`m${i}`, 30_000, now - (i + 1) * 86400)),
    }), { now })
    // 基线：perVideoMid = $1,006（播放量改用中位数 + 互动溢价封顶后下调）
    expect(e.brandDealPerVideo!.mid).toBe(1_006)
  })

  it('nano 正常小号（3K 粉）：报价与修复前一致', () => {
    const e = scoreProfile(buildProfile({
      followerCount: 3_000,
      totalLikes: 50_000,
      videoCount: 20,
      posts: Array.from({ length: 6 }, (_, i) => post(`n${i}`, 800, now - (i + 1) * 86400, '#lifestyle daily vlog')),
    }), { now })
    // 基线：perVideoMid = $30（nano 层最低保底价，播放量用中位数后跌至保底）
    expect(e.brandDealPerVideo!.mid).toBe(30)
  })
})

// ===== 估值倒挂修复（totalValue 对称检查） =====

describe('中腰部极端爆款的总估值不再倒挂（totalValue cap）', () => {
  it('20 万粉极端爆款账号：单条报价 clamp 后，totalValue 各区间受全局 cap 约束且低于头部锚点', () => {
    // 修复前：perVideoMid $772K / totalValue.mid $31.7M（超过 MrBeast 级测试基准 $10M+，估值倒挂）
    const e = scoreProfile(buildProfile({
      followerCount: 200_000,
      totalLikes: 120_000_000,
      videoCount: 120,
      bio: 'finance investor money tips',
      posts: Array.from({ length: 10 }, (_, i) =>
        post(`c${i}`, 2_000_000, now - (i + 1) * 86400, '#finance #money #invest tips')),
    }), { now })

    // 单条报价被压到 mid 层锚点
    expect(e.brandDealPerVideo!.mid).toBe(12_000)

    // totalValue.mid 恢复到中腰部量级（< $5M，远低于修复前 $31.7M）
    expect(e.businessValue.totalValue.mid).toBeLessThan(5_000_000)
    // 对称 cap：totalHigh 同样受 brandDealAnnual × 30 × 1.5 约束
    const brandAnnual = e.businessValue.components.find(c => c.label === 'Brand Deal Annual Value')!.amount.mid
    expect(e.businessValue.totalValue.high).toBeLessThanOrEqual(brandAnnual * 30 * 1.5 + 1)
    // 不再倒挂：20 万粉账号总估值应显著低于 1 亿粉 MrBeast 级测试基准（≥ $10M）
    expect(e.businessValue.totalValue.mid).toBeLessThan(10_000_000)
  })
})
