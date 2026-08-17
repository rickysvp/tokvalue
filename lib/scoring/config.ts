/** S/A/B/C/D/E/F 等级分数阈值（满分 100）。S=顶级头部，F=无效账号 */
export const TIER_THRESHOLDS = { S: 85, A: 70, B: 55, C: 40, D: 25, E: 10 } as const

/**
 * 10 维权重，按粉丝层级差异化
 * nano/micro 强调互动健康+内容爆款+增长势能
 * mid 均衡权重
 * macro/mega 强调触达+影响力+商业+变现，弱化互动率/内容垂直度/稳定性
 */
export const DIMENSION_WEIGHTS_BY_TIER: Record<string, Record<string, number>> = {
  nano: {
    reach: 0.10, engagement: 0.18, content: 0.15, authenticity: 0.12,
    momentum: 0.12, stability: 0.10, commerce: 0.08, monetization: 0.07,
    health: 0.05, influence: 0.03,
  },
  micro: {
    reach: 0.11, engagement: 0.16, content: 0.14, authenticity: 0.12,
    momentum: 0.11, stability: 0.10, commerce: 0.09, monetization: 0.08,
    health: 0.05, influence: 0.04,
  },
  mid: {
    reach: 0.12, engagement: 0.14, content: 0.13, authenticity: 0.12,
    momentum: 0.10, stability: 0.10, commerce: 0.10, monetization: 0.08,
    health: 0.05, influence: 0.06,
  },
  macro: {
    reach: 0.14, engagement: 0.10, content: 0.10, authenticity: 0.10,
    momentum: 0.08, stability: 0.08, commerce: 0.12, monetization: 0.10,
    health: 0.07, influence: 0.11,
  },
  mega: {
    reach: 0.16, engagement: 0.06, content: 0.06, authenticity: 0.08,
    momentum: 0.05, stability: 0.05, commerce: 0.14, monetization: 0.12,
    health: 0.08, influence: 0.20,
  },
}

/** 默认权重（向后兼容），已弃用，改用 DIMENSION_WEIGHTS_BY_TIER */
export const DIMENSION_WEIGHTS = DIMENSION_WEIGHTS_BY_TIER.mid

/**
 * 品牌合作 CPM（千次播放成本），单位 USD/千次播放
 * 数据来源：Influencer Marketing Hub 2024、Collabstr 平台行情
 * 美国市场中值，其他地区通过 REGION_VALUE_MULTIPLIER 调整
 */
export const CATEGORY_BRAND_CPM: Record<string, number> = {
  'Finance & Investing': 30, 'finance': 30,
  'Tech & Gadgets': 22, 'tech': 22,
  'Beauty & Skincare': 20, 'beauty': 20, 'makeup': 20,
  'Fashion & Style': 18, 'fashion': 18,
  'Fitness & Sports': 18, 'fitness': 18, 'Combat Sports': 18,
  'Food & Cooking': 15, 'food': 15, 'cooking': 15,
  'Travel': 16, 'travel': 16,
  'Gaming': 12, 'gaming': 12, 'games': 12,
  'Comedy': 9, 'comedy': 9, 'funny': 9,
  'Music & Dance': 12, 'music': 12, 'dance': 12,
  'Pets & Animals': 14, 'pets': 14,
  'Lifestyle': 14, 'lifestyle': 14,
  'Beauty & Lifestyle': 14,
  'Shopping & Deals': 22, 'shopping': 22, 'deals': 22,  // 带货账号 CPM 高于 Lifestyle
  'General Entertainment': 10, 'entertainment': 10,
  'default': 15,
}

/**
 * 创作者基金 RPM（千次播放收益），单位 USD/千次播放
 * 数据来源：TikTok 官方 Creator Fund / Creativity Program Beta 2024
 * 美国创作者 $0.03-0.05，西欧 $0.02-0.03，东南亚 $0.005-0.01
 */
export const CATEGORY_CREATOR_RPM: Record<string, number> = {
  // 北美
  'US': 0.04, 'CA': 0.035,
  // 西欧
  'UK': 0.03, 'IE': 0.028, 'DE': 0.025, 'FR': 0.025, 'IT': 0.022, 'ES': 0.022,
  'NL': 0.025, 'BE': 0.025, 'AT': 0.025, 'CH': 0.028,
  // 北欧
  'SE': 0.025, 'NO': 0.028, 'DK': 0.028, 'FI': 0.025,
  // 南欧
  'PT': 0.018, 'GR': 0.018,
  // 东欧
  'PL': 0.015, 'CZ': 0.016, 'HU': 0.013, 'RO': 0.012, 'BG': 0.01,
  // 东亚
  'JP': 0.02, 'KR': 0.02, 'TW': 0.015, 'HK': 0.018,
  // 东南亚
  'SG': 0.02, 'MY': 0.009, 'TH': 0.008, 'ID': 0.008, 'PH': 0.007, 'VN': 0.007,
  // 南亚
  'IN': 0.006, 'PK': 0.005, 'BD': 0.005,
  // 中东
  'AE': 0.02, 'SA': 0.018, 'IL': 0.018, 'QA': 0.02, 'KW': 0.018, 'BH': 0.016, 'OM': 0.015, 'IQ': 0.012,
  // 拉美
  'BR': 0.012, 'MX': 0.01, 'AR': 0.009, 'CO': 0.01, 'CL': 0.01, 'PE': 0.009,
  // 大洋洲
  'AU': 0.035, 'NZ': 0.03,
  // 中亚
  'KZ': 0.008, 'UZ': 0.006,
  // 独联体
  'RU': 0.015, 'UA': 0.012, 'TR': 0.012,
  // 非洲
  'ZA': 0.015, 'EG': 0.008, 'NG': 0.006, 'KE': 0.006, 'MA': 0.007, 'TN': 0.007, 'GH': 0.005,
  'default': 0.015,
}

/**
 * 地区价值系数（相对于美国市场 1.0）
 * 反映该地区广告主购买力、CPM 溢价
 */
export const REGION_VALUE_MULTIPLIER: Record<string, number> = {
  // 北美
  'US': 1.0, 'CA': 0.85,
  // 西欧（高购买力）
  'UK': 0.85, 'IE': 0.8, 'DE': 0.75, 'FR': 0.7, 'IT': 0.65, 'ES': 0.65,
  'NL': 0.75, 'BE': 0.75, 'AT': 0.75, 'CH': 0.9,
  // 北欧
  'SE': 0.75, 'NO': 0.75, 'DK': 0.75, 'FI': 0.7,
  // 南欧
  'PT': 0.55, 'GR': 0.5,
  // 东欧
  'PL': 0.4, 'CZ': 0.45, 'HU': 0.4, 'RO': 0.35, 'BG': 0.3,
  // 东亚
  'JP': 0.7, 'KR': 0.65, 'TW': 0.55, 'HK': 0.7,
  // 东南亚
  'SG': 0.7, 'MY': 0.32, 'TH': 0.28, 'ID': 0.25, 'PH': 0.25, 'VN': 0.22,
  // 南亚
  'IN': 0.2, 'PK': 0.15, 'BD': 0.12,
  // 中东
  'AE': 0.75, 'SA': 0.6, 'IL': 0.65, 'QA': 0.7, 'KW': 0.65, 'BH': 0.6, 'OM': 0.5, 'IQ': 0.35,
  // 拉美
  'BR': 0.35, 'MX': 0.35, 'AR': 0.3, 'CO': 0.3, 'CL': 0.32, 'PE': 0.28,
  // 大洋洲
  'AU': 0.85, 'NZ': 0.8,
  // 中亚
  'KZ': 0.25, 'UZ': 0.18,
  // 独联体
  'RU': 0.35, 'UA': 0.3, 'TR': 0.3,
  // 非洲
  'ZA': 0.35, 'EG': 0.2, 'NG': 0.18, 'KE': 0.18, 'MA': 0.22, 'TN': 0.2, 'GH': 0.15,
  'default': 0.5,
}

/**
 * 视频成熟度时间窗口（小时）
 * 来源：TikTok 推荐算法公开分析：冷启动 0-24h，放量期 24-72h，成熟期 3-30d
 */
export const MATURITY_WINDOWS = {
  immatureHours: 24,    // <24h 冷启动期（不计入均播）
  growingHours: 72,     // 24-72h 放量期（降权计入）
  matureDays: 30,       // 3-30d 成熟期（主指标）
  archiveDays: 365,     // >30d 长尾期（历史爆款参考）
} as const

/**
 * 互动率分段阈值（%）与对应乘数
 * 用于 engagementMultiplier，影响品牌报价
 * 顶级互动账号溢价上限提到 3.0x（原 1.6x 严重低估头部）
 */
export const ENGAGEMENT_TIERS = [
  { min: 15, multiplier: 3.0, label: 'Viral' },
  { min: 9, multiplier: 2.4, label: 'Very High' },
  { min: 6, multiplier: 1.8, label: 'High' },
  { min: 3, multiplier: 1.3, label: 'Good' },
  { min: 1, multiplier: 1.0, label: 'Normal' },
  { min: 0, multiplier: 0.7, label: 'Low' },
] as const

/**
 * 层级溢价系数（品牌报价倍数）
 * nano 1.0x → mega 8.0x
 * mega 基于公开市场报价校准（MrBeast $2.5M/条 vs 公式基础 ~$200K）
 */
export const TIER_PREMIUM = {
  nano: 1.0,
  micro: 1.2,
  mid: 1.8,
  macro: 3.0,
  mega: 8.0,
} as const

/**
 * 品牌合作月均接单上限（按 tier 分层）
 * mega 单条价值高，月均 2 条；nano 小单多，月均 10 条
 */
export const BRAND_DEAL_LIMITS_BY_TIER: Record<string, { maxRatioOfMonthlyPosts: number; maxPerMonth: number }> = {
  nano: { maxRatioOfMonthlyPosts: 0.5, maxPerMonth: 10 },
  micro: { maxRatioOfMonthlyPosts: 0.4, maxPerMonth: 8 },
  mid: { maxRatioOfMonthlyPosts: 0.35, maxPerMonth: 6 },
  macro: { maxRatioOfMonthlyPosts: 0.3, maxPerMonth: 4 },
  mega: { maxRatioOfMonthlyPosts: 0.2, maxPerMonth: 2 },
}

/** 内容资产 videoCount 上限（按 tier） */
export const VIDEO_COUNT_CAP_BY_TIER: Record<string, number> = {
  nano: 50,
  micro: 100,
  mid: 200,
  macro: 300,
  mega: 500,
}

/** 内容 CPM 占品牌 CPM 的比例（按 tier，头部长尾价值更高） */
export const CONTENT_CPM_RATIO_BY_TIER: Record<string, number> = {
  nano: 0.3,
  micro: 0.3,
  mid: 0.35,
  macro: 0.4,
  mega: 0.5,
}

/** 内容资产折现率（按 tier，头部内容资产更保值） */
export const DISCOUNT_FACTOR_BY_TIER: Record<string, number> = {
  nano: 0.2,
  micro: 0.25,
  mid: 0.3,
  macro: 0.35,
  mega: 0.4,
}

/**
 * 粉丝资产幂律定价基础单价（USD/粉，应用时 value = base * followers^0.85）
 * 基于真实市场校准：1亿粉娱乐账号粉丝资产 ≈ $200-500M
 * mega 校准：1 亿粉 × 12.0 × 100M^0.85 ≈ $200-400M
 */
export const FOLLOWER_BASE_RATE: Record<string, number> = {
  nano: 0.005,
  micro: 0.01,
  mid: 0.05,
  macro: 0.5,
  mega: 12.0,
}

/** 幂律指数（粉丝边际价值递减） */
export const FOLLOWER_POWER_LAW_EXPONENT = 0.85

/** 变现能力估值周期（月，按 tier） */
export const VALUATION_PERIOD_BY_TIER: Record<string, number> = {
  nano: 4,
  micro: 6,
  mid: 12,
  macro: 18,
  mega: 24,
}

/** 变现渠道权重（品牌 > Shop > 订阅 > LIVE > 基金） */
export const CHANNEL_WEIGHTS: Record<string, number> = {
  brand_deals: 1.0,
  tiktok_shop: 0.8,
  amazon_associates: 0.75,
  shopify_dtc: 0.85,
  live_commerce: 0.9,
  subscriptions: 0.6,
  live_gifts: 0.5,
  creator_program: 0.3,
}

/** IP/品牌资产倍数（IP = brandDealAnnual × multiple，仅 macro/mega 计入）
 * 调整：mega 5→3, macro 2→1.5 — IP 价值不应 5 倍于年收入，避免高粉低播账号 IP 资产虚高 */
export const TIER_IP_MULTIPLE: Record<string, number> = {
  nano: 0,
  micro: 0,
  mid: 0,
  macro: 1.5,
  mega: 3,
}

/** 品类 IP 系数（金融/科技 IP 价值高，搞笑低） */
export const CATEGORY_IP_MULTIPLIER: Record<string, number> = {
  'Finance & Investing': 2.0, 'finance': 2.0,
  'Tech & Gadgets': 1.8, 'tech': 1.8,
  'Beauty & Skincare': 1.5, 'beauty': 1.5, 'makeup': 1.5,
  'Fashion & Style': 1.3, 'fashion': 1.3,
  'Fitness & Sports': 1.2, 'fitness': 1.2,
  'Food & Cooking': 1.0, 'food': 1.0, 'cooking': 1.0,
  'Travel': 1.0, 'travel': 1.0,
  'Lifestyle': 0.9, 'lifestyle': 0.9,
  'Pets & Animals': 0.9, 'pets': 0.9,
  'Gaming': 0.9, 'gaming': 0.9, 'games': 0.9,
  'Music & Dance': 0.9, 'music': 0.9, 'dance': 0.9,
  'Comedy': 0.8, 'comedy': 0.8, 'funny': 0.8,
  'General Entertainment': 1.0, 'entertainment': 1.0,
  'default': 1.0,
}

/**
 * 市场基准锚点（USD/条，mega/macro 品牌报价夹紧用）
 * 基于公开报价：MrBeast $2.5M, Charli $100K, Khaby $50K, Zach King $80K, Logan Paul $150K
 */
export const MARKET_ANCHORS: Record<string, Record<string, number>> = {
  mega: {
    'Finance & Investing': 500000, 'finance': 500000,
    'Tech & Gadgets': 400000, 'tech': 400000,
    'Beauty & Skincare': 200000, 'beauty': 200000, 'makeup': 200000,
    'Fashion & Style': 180000, 'fashion': 180000,
    'Fitness & Sports': 150000, 'fitness': 150000,
    'Food & Cooking': 120000, 'food': 120000, 'cooking': 120000,
    'Travel': 130000, 'travel': 130000,
    'Gaming': 100000, 'gaming': 100000, 'games': 100000,
    'Music & Dance': 100000, 'music': 100000, 'dance': 100000,
    'Comedy': 50000, 'comedy': 50000, 'funny': 50000,
    'Lifestyle': 120000, 'lifestyle': 120000,
    'General Entertainment': 200000, 'entertainment': 200000,
    'default': 150000,
  },
  macro: {
    'Finance & Investing': 80000, 'finance': 80000,
    'Tech & Gadgets': 60000, 'tech': 60000,
    'Beauty & Skincare': 40000, 'beauty': 40000, 'makeup': 40000,
    'Fashion & Style': 35000, 'fashion': 35000,
    'Fitness & Sports': 30000, 'fitness': 30000,
    'Food & Cooking': 25000, 'food': 25000, 'cooking': 25000,
    'Travel': 26000, 'travel': 26000,
    'Gaming': 20000, 'gaming': 20000, 'games': 20000,
    'Music & Dance': 20000, 'music': 20000, 'dance': 20000,
    'Comedy': 12000, 'comedy': 12000, 'funny': 12000,
    'Lifestyle': 22000, 'lifestyle': 22000,
    'General Entertainment': 30000, 'entertainment': 30000,
    'default': 25000,
  },
}

/** 市场基准夹紧系数（公式输出限制在 anchor × [0.1, 3.0] 区间）
 * 调整：下限 0.3→0.1 — 允许高粉低播账号报价反映真实触达能力（原来 0.3 托底过高） */
export const MARKET_ANCHOR_CLAMP = { low: 0.1, high: 3.0 }

/** 播放折损阈值 — 品牌报价折损系数配置
 * playFanRatio < threshold 时，品牌报价按 decayFactor 折损
 * 调整目的：高粉低播账号（如 @dudamartins_52）品牌报价应反映真实触达能力 */
export const PLAY_FAN_PENALTY = {
  threshold: 0.1,        // playFanRatio < 0.1 触发折损
  decayFactor: 0.5,      // 折损系数：每低于阈值 0.01，报价 ×0.5^(差距/0.05)
  minMultiplier: 0.2,    // 最低折损倍数（防止归零）
}

/** 粉丝资产播放因子配置（calcFollowerAssetValue 用）
 * playFanFactor = clamp(playFanRatio / tierBenchmark, min, max)
 * 高粉低播账号粉丝资产应反映真实触达能力 */
export const PLAY_FAN_FACTOR_CLAMP = { min: 0.3, max: 1.5 }

/** 动量乘数参数（playGrowth → momentumMultiplier） */
export const MOMENTUM_PARAMS = {
  highGrowthThreshold: 50,    // playGrowth > 50% → 1.3x
  highGrowthMultiplier: 1.3,
  lowGrowthThreshold: -30,    // playGrowth < -30% → 0.7x
  lowGrowthMultiplier: 0.7,
  neutral: 1.0,
} as const

/** 增长乘数参数（变现能力估值用，按 tier） */
export const GROWTH_MULTIPLIER_PARAMS = {
  highGrowthThreshold: 30,
  highGrowthMultiplier: 1.2,
  lowGrowthThreshold: -20,
  lowGrowthMultiplier: 0.8,
  neutral: 1.0,
} as const

/** 风险折损系数（影响全组件估值） */
export const RISK_DISCOUNT = {
  high: 0.7,
  medium: 0.85,
  none: 1.0,
} as const

/** 已认证账号品牌报价加成 */
export const VERIFIED_MULTIPLIER = 1.1

/** 互动因子（粉丝资产用，按 tier 差异化阈值）
 * mega 1.5%+ 即高互动，micro 需 6%+ 才高互动
 */
export const ENGAGEMENT_FACTOR = {
  tiers: {
    nano:   { high: 6, good: 3, normal: 1 },
    micro:  { high: 5, good: 2.5, normal: 1 },
    mid:    { high: 4, good: 2, normal: 0.8 },
    macro:  { high: 3, good: 1.5, normal: 0.6 },
    mega:   { high: 1.5, good: 1.0, normal: 0.5 },
  },
  factors: { high: 1.0, good: 0.9, normal: 0.7, low: 0.5 },
} as const

/** 品牌信号关键词（IP 资产检测用） */
export const BRANDING_SIGNAL_KEYWORDS = {
  founder: ['founder', 'ceo', 'owner', 'creator of', 'co-founder', '创始人', '主理人'],
  brand: ['brand', 'shop', 'store', 'company', 'product', '品牌', '店铺', '旗舰店', '自有'],
  crossPlatform: ['youtube', 'instagram', 'twitter', 'twitch', 'website', 'link in bio', '主页链接'],
  product: ['merch', 'course', 'book', 'app', 'subscribe', '周边', '课程', '电子书'],
  // 带货 storefront 信号（识别 Amazon/Shopify/Etsy 自建电商）
  storefront: ['amazon storefront', 'amazon store', 'etsy shop', 'shopify store', 'my store', 'tiktok shop', 'storefront', '旗舰店', '我的店铺'],
}

/** 品牌信号加成系数 */
export const BRANDING_SIGNAL_BONUS = {
  founder: 0.20,
  brand: 0.15,
  crossPlatform: 0.15,
  product: 0.10,
  verified: 0.10,
  max: 0.50,  // 总加成上限 50%
} as const

/**
 * 风险信号阈值
 */
export const RISK_THRESHOLDS = {
  followerFollowingCritical: 0.05,    // 粉关比<0.05=高风险（大量买粉）
  followerFollowingWarning: 0.1,      // 粉关比<0.1=中风险
  engagementRateCritical: 0.5,        // 互动率<0.5%=高风险
  engagementRateWarning: 1.0,         // 互动率<1%=中风险
  inactiveDaysCritical: 60,           // 断更>60天=高风险
  inactiveDaysWarning: 30,            // 断更>30天=中风险
  cvPlaysCritical: 2.0,               // CV>2=流量极不稳定
  cvPlaysWarning: 1.2,                // CV>1.2=波动较大
} as const

/**
 * 粉丝资产价值（每千粉 USD）
 * 已弃用，保留向后兼容；新逻辑用 FOLLOWER_BASE_RATE 幂律公式
 * @deprecated 改用 FOLLOWER_BASE_RATE + FOLLOWER_POWER_LAW_EXPONENT
 */
export const FOLLOWER_VALUE_PER_1K = {
  nano: 5,       // <10K，粉丝粘性高
  micro: 15,     // 10K-100K
  mid: 30,       // 100K-500K
  macro: 50,     // 500K-1M
  mega: 80,      // >1M
} as const

/** 品类粉丝价值系数（垂类粉丝更值钱） */
export const CATEGORY_FAN_VALUE_MULT: Record<string, number> = {
  'Finance & Investing': 2.0, 'finance': 2.0,
  'Tech & Gadgets': 1.8, 'tech': 1.8,
  'Beauty & Skincare': 1.4, 'beauty': 1.4, 'makeup': 1.4,
  'Fashion & Style': 1.3, 'fashion': 1.3,
  'Fitness & Sports': 1.2, 'fitness': 1.2, 'Combat Sports': 1.2,
  'Food & Cooking': 1.0, 'food': 1.0, 'cooking': 1.0,
  'Travel': 1.0, 'travel': 1.0,
  'Lifestyle': 1.1, 'lifestyle': 1.1,
  'Pets & Animals': 0.9, 'pets': 0.9,
  'Gaming': 0.9, 'gaming': 0.9, 'games': 0.9,
  'Music & Dance': 0.9, 'music': 0.9, 'dance': 0.9,
  'Comedy': 0.8, 'comedy': 0.8, 'funny': 0.8,
  'General Entertainment': 0.9, 'entertainment': 0.9,
  'default': 1.0,
}

/** 内容资产系数（保留向后兼容，新逻辑用 CONTENT_CPM_RATIO_BY_TIER + DISCOUNT_FACTOR_BY_TIER）
 * @deprecated 改用 tier 分层参数
 */
export const CONTENT_VALUE_MULTIPLIER = {
  contentCpmRatio: 0.2,    // 老视频 CPM = 品牌 CPM × 0.2
  discountFactor: 0.3,     // 资产折现率（历史内容只按 30% 计入当前价值）
} as const

/**
 * 同侪基准函数
 * 基于 followerCount 用 log 曲线生成同档位平均互动率/播放粉比
 * 数据拟合：1K粉 er≈4.5%，100K粉 er≈2.5%，1M粉 er≈1.5%，10M粉 er≈1.0%
 */
export function getPeerBenchmarks(followerCount: number) {
  const logF = Math.log10(Math.max(followerCount, 100))
  // er = -0.6*log10(f) + 5.0
  const avgER = clamp(-0.6 * logF + 5.0, 0.8, 6.0)
  const top10ER = avgER * 1.8
  // avgPlaysRatio: 1K粉 0.8，100K粉 0.5，1M粉 0.35，10M粉 0.2
  const avgPlaysRatio = clamp(-0.1 * logF + 1.0, 0.1, 1.0)
  // postsPerMonth: 1K粉 12条，1M粉 8条
  const postsPerMonth = clamp(-1.0 * logF + 15, 4, 20)
  return { avgER, top10ER, avgPlaysRatio, postsPerMonth }
}

/**
 * 订阅转化率阶梯（月均）
 * 数据来源：TikTok LIVE Subscription 公开报告
 */
export const SUBSCRIPTION_CONVERSION_RATES = {
  nano: 0.005,    // <10K: 0.5%
  micro: 0.003,   // 10K-100K: 0.3%
  mid: 0.002,     // 100K-500K: 0.2%
  macro: 0.001,   // 500K-1M: 0.1%
  mega: 0.0005,   // >1M: 0.05%
} as const

/** 订阅加权均价（USD/月），平台抽成 50% 后创作者实得 */
export const SUBSCRIPTION_AVG_PRICE = 8
export const SUBSCRIPTION_CREATOR_CUT = 0.5

/**
 * TikTok Shop 运营系数（按品类）
 * 仅支持开启 Shop 的品类，conversionRate 为月活跃粉购买转化率
 */
export const SHOP_OPERATIONAL_METRICS: Record<string, { aov: number; commission: number; conversionRate: number }> = {
  'Beauty & Skincare': { aov: 25, commission: 0.15, conversionRate: 0.004 },
  'beauty': { aov: 25, commission: 0.15, conversionRate: 0.004 },
  'Fashion & Style': { aov: 35, commission: 0.18, conversionRate: 0.003 },
  'fashion': { aov: 35, commission: 0.18, conversionRate: 0.003 },
  'Food & Cooking': { aov: 20, commission: 0.12, conversionRate: 0.003 },
  'food': { aov: 20, commission: 0.12, conversionRate: 0.003 },
  'Lifestyle': { aov: 30, commission: 0.15, conversionRate: 0.002 },
  'lifestyle': { aov: 30, commission: 0.15, conversionRate: 0.002 },
  'Fitness & Sports': { aov: 45, commission: 0.12, conversionRate: 0.002 },
  'fitness': { aov: 45, commission: 0.12, conversionRate: 0.002 },
  'Tech & Gadgets': { aov: 80, commission: 0.08, conversionRate: 0.0015 },
  'tech': { aov: 80, commission: 0.08, conversionRate: 0.0015 },
  'Shopping & Deals': { aov: 35, commission: 0.15, conversionRate: 0.004 },
  'shopping': { aov: 35, commission: 0.15, conversionRate: 0.004 },
  'deals': { aov: 35, commission: 0.15, conversionRate: 0.004 },
}

/**
 * Amazon Associates 联盟营销指标（按品类）
 * 佣金率参考 Amazon Associates 实际费率（4-10%），AOV 偏高
 */
export const AMAZON_ASSOCIATES_METRICS: Record<string, { aov: number; commission: number; conversionRate: number }> = {
  'Shopping & Deals': { aov: 45, commission: 0.045, conversionRate: 0.0035 },
  'shopping': { aov: 45, commission: 0.045, conversionRate: 0.0035 },
  'deals': { aov: 45, commission: 0.045, conversionRate: 0.0035 },
  'Tech & Gadgets': { aov: 90, commission: 0.04, conversionRate: 0.0025 },
  'tech': { aov: 90, commission: 0.04, conversionRate: 0.0025 },
  'Beauty & Skincare': { aov: 28, commission: 0.06, conversionRate: 0.004 },
  'beauty': { aov: 28, commission: 0.06, conversionRate: 0.004 },
  'Fashion & Style': { aov: 40, commission: 0.08, conversionRate: 0.003 },
  'fashion': { aov: 40, commission: 0.08, conversionRate: 0.003 },
  'Fitness & Sports': { aov: 50, commission: 0.045, conversionRate: 0.0025 },
  'fitness': { aov: 50, commission: 0.045, conversionRate: 0.0025 },
  'Home & Living': { aov: 55, commission: 0.06, conversionRate: 0.003 },
  'Lifestyle': { aov: 40, commission: 0.05, conversionRate: 0.0028 },
  'lifestyle': { aov: 40, commission: 0.05, conversionRate: 0.0028 },
  'default': { aov: 40, commission: 0.045, conversionRate: 0.003 },
}

/**
 * Shopify DTC 自营电商指标（按品类）
 * 无佣金分成（creator 保留全额利润），但需扣除利润率 margin
 * AOV 与转化率高于 affiliate，因自有品牌信任度更高
 */
export const SHOPIFY_DTC_METRICS: Record<string, { aov: number; margin: number; conversionRate: number }> = {
  'Shopping & Deals': { aov: 55, margin: 0.35, conversionRate: 0.0035 },
  'shopping': { aov: 55, margin: 0.35, conversionRate: 0.0035 },
  'deals': { aov: 55, margin: 0.35, conversionRate: 0.0035 },
  'Tech & Gadgets': { aov: 120, margin: 0.3, conversionRate: 0.002 },
  'tech': { aov: 120, margin: 0.3, conversionRate: 0.002 },
  'Beauty & Skincare': { aov: 32, margin: 0.5, conversionRate: 0.0045 },
  'beauty': { aov: 32, margin: 0.5, conversionRate: 0.0045 },
  'Fashion & Style': { aov: 48, margin: 0.45, conversionRate: 0.0035 },
  'fashion': { aov: 48, margin: 0.45, conversionRate: 0.0035 },
  'Fitness & Sports': { aov: 65, margin: 0.35, conversionRate: 0.0025 },
  'fitness': { aov: 65, margin: 0.35, conversionRate: 0.0025 },
  'Home & Living': { aov: 70, margin: 0.4, conversionRate: 0.003 },
  'Lifestyle': { aov: 50, margin: 0.4, conversionRate: 0.003 },
  'lifestyle': { aov: 50, margin: 0.4, conversionRate: 0.003 },
  'default': { aov: 50, margin: 0.38, conversionRate: 0.003 },
}

/**
 * 直播带货 GMV 佣金指标（按品类）
 * 直播转化率高于短视频，但需要直播频率支撑
 * viewerRate = 粉丝中观看直播的比例
 */
export const LIVE_COMMERCE_METRICS: Record<string, { aov: number; commission: number; conversionRate: number; viewerRate: number }> = {
  'Shopping & Deals': { aov: 35, commission: 0.15, conversionRate: 0.008, viewerRate: 0.06 },
  'shopping': { aov: 35, commission: 0.15, conversionRate: 0.008, viewerRate: 0.06 },
  'deals': { aov: 35, commission: 0.15, conversionRate: 0.008, viewerRate: 0.06 },
  'Beauty & Skincare': { aov: 28, commission: 0.18, conversionRate: 0.01, viewerRate: 0.07 },
  'beauty': { aov: 28, commission: 0.18, conversionRate: 0.01, viewerRate: 0.07 },
  'Fashion & Style': { aov: 38, commission: 0.15, conversionRate: 0.007, viewerRate: 0.05 },
  'fashion': { aov: 38, commission: 0.15, conversionRate: 0.007, viewerRate: 0.05 },
  'Food & Cooking': { aov: 25, commission: 0.12, conversionRate: 0.006, viewerRate: 0.05 },
  'food': { aov: 25, commission: 0.12, conversionRate: 0.006, viewerRate: 0.05 },
  'Fitness & Sports': { aov: 45, commission: 0.12, conversionRate: 0.005, viewerRate: 0.04 },
  'fitness': { aov: 45, commission: 0.12, conversionRate: 0.005, viewerRate: 0.04 },
  'Lifestyle': { aov: 35, commission: 0.13, conversionRate: 0.006, viewerRate: 0.045 },
  'lifestyle': { aov: 35, commission: 0.13, conversionRate: 0.006, viewerRate: 0.045 },
  'default': { aov: 32, commission: 0.14, conversionRate: 0.006, viewerRate: 0.05 },
}

/** LIVE 礼物月收入系数（每粉 USD/月） */
export const LIVE_GIFT_MULTIPLIERS = {
  nano: 0.01,
  micro: 0.008,
  mid: 0.005,
  macro: 0.003,
  mega: 0.002,
  default: 0.001,
} as const

/** 收入区间系数（low=mid×factor, high=mid×factor） */
export const INCOME_LOW_HIGH_FACTORS = {
  low: 0.6,
  high: 1.5,
} as const

/** 最低单条品牌合作报价（USD）——nano 账号也有基础制作成本 */
export const MIN_BRAND_DEAL_PRICE = 100

/** 品牌合作月均接单上限（占月发布量比例 + 绝对上限） */
export const BRAND_DEAL_LIMITS = {
  maxRatioOfMonthlyPosts: 0.3,
  maxPerMonth: 4,
} as const

/** 成熟视频点赞率 clamp 范围（防异常） */
export const LIKE_PLAY_RATIO_RANGE = { min: 0.005, max: 0.20 }

/** 默认播放/粉比（无 posts 数据时的 fallback） */
export const DEFAULT_PLAY_FOLLOWER_RATIO = 0.2

/**
 * 增长路线图参数（月化）
 * baseGrowth 来自 playGrowth，engagementBonus 来自互动率高于/低于基准
 */
export const GROWTH_RATE_PARAMS = {
  playGrowthTransmission: 0.3,     // 播放增长→收入增长传导系数
  baseGrowthMin: -0.05,
  baseGrowthMax: 0.08,
  engagementBonusPerPoint: 0.01,   // 互动率每高/低1%调整1%增速
  engagementBonusMax: 0.03,
  engagementBonusMin: -0.02,
  highRiskPenalty: -0.03,
  mediumRiskPenalty: -0.01,
  scaleSuppressPerLog: -0.005,     // 粉丝每多一个数量级，月增速 -0.5%
  monthlyGrowthMin: -0.10,
  monthlyGrowthMax: 0.15,
} as const

/** 变现资格门槛 */
export const MONETIZATION_THRESHOLDS = {
  creatorFundFollowers: 10000,           // 普通 Fund 10K 粉
  creativityBetaFollowers: 10000,        // Creativity Program Beta 10K 粉
  creativityBetaMonthlyViews: 100000,    // Beta 要求 100K 月播放
  creativityBetaPerVideoViews: 10000,    // Beta 要求 10K 均播
  tiktokShopFollowers: 1000,             // Shop 1K 粉
  subscriptionFollowers: 1000,           // 订阅 1K 粉
  liveGiftFollowers: 1000,               // LIVE 礼物 1K 粉
  amazonAssociatesFollowers: 5000,       // Amazon 联盟 5K 粉（需稳定流量才有 affiliate 转化）
  shopifyDtcFollowers: 10000,            // Shopify DTC 10K 粉（需自有品牌/供应链）
  liveCommerceFollowers: 50000,          // 直播带货 50K 粉（需规模粉丝支撑 GMV）
} as const

/**
 * 品类内容支柱提示（用于动态生成 contentStrategy.pillars）
 * 每个品类 4-6 个核心内容方向
 */
export const CATEGORY_PILLAR_HINTS: Record<string, string[]> = {
  '金融理财': ['Finance Tips', 'Investment Cases', 'Market Trends', 'Saving Hacks', 'Money Traps'],
  'finance': ['Finance Tips', 'Investment Cases', 'Market Trends', 'Saving Hacks', 'Money Traps'],
  '科技数码': ['Product Reviews', 'How-To Tips', 'Unboxings', 'Tech News', 'Buying Guides'],
  'tech': ['Product Reviews', 'How-To Tips', 'Unboxings', 'Tech News', 'Buying Guides'],
  '美妆护肤': ['Product Reviews', 'Makeup Tutorials', 'Skincare Routines', 'Favorites', 'Beauty Tips'],
  'beauty': ['Product Reviews', 'Makeup Tutorials', 'Skincare Routines', 'Favorites', 'Beauty Tips'],
  '时尚穿搭': ['OOTD', 'Item Picks', 'Style Tips', 'Trend Try-Ons', 'Hauls'],
  'fashion': ['OOTD', 'Item Picks', 'Style Tips', 'Trend Try-Ons', 'Hauls'],
  '美食': ['Recipe Tutorials', 'Restaurant Reviews', 'Food Making', 'Ingredient Tests', 'Cooking Tips'],
  'food': ['Recipe Tutorials', 'Restaurant Reviews', 'Food Making', 'Ingredient Tests', 'Cooking Tips'],
  '健身运动': ['Workout Tutorials', 'Fitness Tips', 'Meal Pairing', 'Move Demos', 'Bulk/Cut'],
  'fitness': ['Workout Tutorials', 'Fitness Tips', 'Meal Pairing', 'Move Demos', 'Bulk/Cut'],
  '格斗运动': ['Combat Training', 'Fight Breakdowns', 'Skill Lessons', 'Training Daily', 'Athlete Stories'],
  '游戏': ['Gameplay', 'Walkthroughs', 'Game Reviews', 'Highlights', 'New Game Demos'],
  'gaming': ['Gameplay', 'Walkthroughs', 'Game Reviews', 'Highlights', 'New Game Demos'],
  '旅游': ['Travel Vlogs', 'Travel Guides', 'Spot Recommendations', 'Food Tours', 'Travel Tips'],
  'travel': ['Travel Vlogs', 'Travel Guides', 'Spot Recommendations', 'Food Tours', 'Travel Tips'],
  '知识教育': ['Knowledge Explainers', 'Study Tips', 'Value Shares', 'Book Insights', 'Mindset Growth'],
  'education': ['Knowledge Explainers', 'Study Tips', 'Value Shares', 'Book Insights', 'Mindset Growth'],
  '搞笑': ['Funny Skits', 'Prank Daily', 'Top Comments', 'Hilarious Moments', 'Comedy Shorts'],
  'comedy': ['Funny Skits', 'Prank Daily', 'Top Comments', 'Hilarious Moments', 'Comedy Shorts'],
  '剧情': ['Emotional Shorts', 'Story Acting', 'Plot Twists', 'Life Relatability', 'Series'],
  'drama': ['Emotional Shorts', 'Story Acting', 'Plot Twists', 'Life Relatability', 'Series'],
  '汽车': ['Car Reviews', 'Car Care Tips', 'Mod Shares', 'Test Drives', 'Car Culture'],
  'auto': ['Car Reviews', 'Car Care Tips', 'Mod Shares', 'Test Drives', 'Car Culture'],
  '宠物': ['Pet Daily', 'Pet Care Tips', 'Pet Training', 'Funny Moments', 'Pet Favorites'],
  'pets': ['Pet Daily', 'Pet Care Tips', 'Pet Training', 'Funny Moments', 'Pet Favorites'],
  '母婴亲子': ['Parenting Tips', 'Parent-Child Moments', 'Baby Favorites', 'Baby Food Tutorials', 'Early Learning'],
  'mom': ['Parenting Tips', 'Parent-Child Moments', 'Baby Favorites', 'Baby Food Tutorials', 'Early Learning'],
  '美女/颜值': ['Looks Showcase', 'Glow-Up Tips', 'Style Shares', 'Life Vlogs', 'Makeup Shares'],
  'default': ['Content Creation', 'Daily Shares', 'Fan Interaction', 'Expert Shares', 'Growth Logs'],
}

/**
 * 品类热门 Hashtags（真实标签参考 TikTok 实际热门）
 * 每个品类 8-12 个标签
 */
export const CATEGORY_HASHTAGS: Record<string, string[]> = {
  '金融理财': ['#personalfinance', '#investing', '#financialfreedom', '#moneymanagement', '#stockmarket', '#wealthbuilding', '#sidehustle', '#budgeting'],
  'finance': ['#personalfinance', '#investing', '#financialfreedom', '#moneymanagement', '#stockmarket', '#wealthbuilding', '#sidehustle', '#budgeting'],
  '科技数码': ['#techtok', '#gadgets', '#techreview', '#smartphone', '#unboxing', '#technews', '#coding', '#ai'],
  'tech': ['#techtok', '#gadgets', '#techreview', '#smartphone', '#unboxing', '#technews', '#coding', '#ai'],
  '美妆护肤': ['#beautytok', '#makeup', '#skincare', '#makeuptutorial', '#grwm', '#beautyhacks', '#makeuplook', '#skincareroutine'],
  'beauty': ['#beautytok', '#makeup', '#skincare', '#makeuptutorial', '#grwm', '#beautyhacks', '#makeuplook', '#skincareroutine'],
  '时尚穿搭': ['#fashiontiktok', '#ootd', '#fashionhaul', '#styleinspo', '#streetwear', '#outfitoftheday', '#thriftflip', '#lookbook'],
  'fashion': ['#fashiontiktok', '#ootd', '#fashionhaul', '#styleinspo', '#streetwear', '#outfitoftheday', '#thriftflip', '#lookbook'],
  '美食': ['#foodtiktok', '#cooking', '#recipe', '#foodie', '#easyrecipe', '#cookingtiktok', '#snack', '#foodtok'],
  'food': ['#foodtiktok', '#cooking', '#recipe', '#foodie', '#easyrecipe', '#cookingtiktok', '#snack', '#foodtok'],
  '健身运动': ['#fitnesstok', '#workout', '#gymtok', '#fitnessmotivation', '#homeworkout', '#gym', '#fitnessjourney', '#weightloss'],
  'fitness': ['#fitnesstok', '#workout', '#gymtok', '#fitnessmotivation', '#homeworkout', '#gym', '#fitnessjourney', '#weightloss'],
  '格斗运动': ['#boxing', '#mma', '#martialarts', '#fighter', '#training', '#fight', '#bjj', '#muaythai'],
  '游戏': ['#gaming', '#gametok', '#gamingontiktok', '#xbox', '#ps5', '#pcgaming', '#gamergirl', '#twitch'],
  'gaming': ['#gaming', '#gametok', '#gamingontiktok', '#xbox', '#ps5', '#pcgaming', '#gamergirl', '#twitch'],
  '旅游': ['#traveltiktok', '#travelgram', '#wanderlust', '#vacation', '#travelbucketlist', '#solotravel', '#hiddengems', '#tiktoktravel'],
  'travel': ['#traveltiktok', '#travelgram', '#wanderlust', '#vacation', '#travelbucketlist', '#solotravel', '#hiddengems', '#tiktoktravel'],
  '知识教育': ['#learnontiktok', '#edutok', '#didyouknow', '#facts', '#tiktoktaughtme', '#knowledge', '#studytok', '#lifelessons'],
  'education': ['#learnontiktok', '#edutok', '#didyouknow', '#facts', '#tiktoktaughtme', '#knowledge', '#studytok', '#lifelessons'],
  '搞笑': ['#comedy', '#funny', '#lol', '#humor', '#viral', '#memes', '#relatable', '#skit'],
  'comedy': ['#comedy', '#funny', '#lol', '#humor', '#viral', '#memes', '#relatable', '#skit'],
  '剧情': ['#drama', '#storytime', '#acting', '#shortfilm', '#pov', '#minimovie', '#relationship', '#emotional'],
  '汽车': ['#cartok', '#cars', '#carsoftiktok', '#cardiy', '#automobile', '#carguys', '#supercars', '#cartips'],
  'auto': ['#cartok', '#cars', '#carsoftiktok', '#cardiy', '#automobile', '#carguys', '#supercars', '#cartips'],
  '宠物': ['#petsoftiktok', '#catsoftiktok', '#dogsoftiktok', '#petlovers', '#cuteanimals', '#funnypets', '#petcheck', '#puppy'],
  'pets': ['#petsoftiktok', '#catsoftiktok', '#dogsoftiktok', '#petlovers', '#cuteanimals', '#funnypets', '#petcheck', '#puppy'],
  '母婴亲子': ['#momtok', '#parenting', '#baby', '#newmom', '#momlife', '#toddler', '#pregnancy', '#familyvlog'],
  '美女/颜值': ['#beautiful', '#pretty', '#model', '#glowup', '#aesthetic', '#photography', '#fypbeauty', '#lookoftheday'],
  'default': ['#fyp', '#foryou', '#foryoupage', '#viral', '#trending', '#tiktok', '#fypシ', '#xyzbca'],
}

/**
 * 商业意图关键词（中英双语），用于 commerce 维度检测带货/商业合作线索
 */
export const COMMERCE_INTENT_KEYWORDS = {
  en: ['link in bio', 'shop now', 'use code', 'discount', 'promo', 'affiliate', 'sponsored', 'partner', 'get yours', 'buy now', 'limited edition', 'available now', 'sale', 'coupon', 'collab', 'gifted', 'branddeal',
    // 带货账号常用词（清单/评测/deals finder）
    'amazon finds', 'tiktokmadeemebuyit', 'product roundup', 'must have', 'top 10', 'haul', 'unboxing', 'deals', 'storefront', 'amazon storefront', 'etsy shop', 'shopify', 'tiktok shop', 'product link', 'shopping link', 'my store', 'use my code', 'affiliate link'],
  zh: ['链接在主页', '购物车', '同款', '购买', '优惠', '折扣', '带货', '种草', '安利', '测评', '合作', '推广', '赞助', '码', '购买链接', '上新', '促销', '包邮', '好物推荐', '旗舰店',
    // 带货账号常用词
    '好物清单', '必买清单', '开箱', '亚马逊好物', 'amazon好物', '我的店铺', '专属链接', '优惠码', '粉丝专属'],
}

// ========== 三层评分体系（Spec 定义） ==========

/**
 * 三层评分权重（全 tier 统一）
 * 核心驱动 60%：规模价值 + 赛道溢价 + 变现能力 → 决定评级上限
 * 质量调节 30%：互动质量 + 内容质量 + 粉丝真实度 + 增长势能 → 同级内排名
 * 风险调节 10%：账号健康 + 流量稳定 + 行业位势 → 只扣分，触发降级
 */
export const THREE_LAYER_WEIGHTS = {
  core: {
    reach: 0.20,        // 规模价值：真实粉丝数 + 播放触达
    commerce: 0.20,     // 赛道溢价：品类 CPM × 地区系数
    monetization: 0.20, // 变现能力：已开通变现渠道 + 收入稳定性
  },
  quality: {
    engagement: 0.10,    // 互动质量：真实互动率 vs 同赛道基准 + 评论深度
    content: 0.08,       // 内容质量：播放稳定性(CV) + 爆款率 + 垂直度
    authenticity: 0.07,  // 粉丝真实度：粉关比 + 互动一致性
    momentum: 0.05,      // 增长势能：30天/60天播放变化率
  },
  risk: {
    health: 0.04,        // 账号健康：限流/违规/断更风险
    stability: 0.03,     // 流量稳定：成熟视频 CV 值
    influence: 0.03,     // 行业位势：高于/低于同体量平均（商业信号）
  },
} as const

/** 核心层归一化分数 → 评级区间映射 */
export const CORE_LAYER_RANGES = {
  high: 80,   // ≥80 → S/A 区间
  mid: 60,    // ≥60 → B/C 区间
  // <60 → D/E 区间
} as const

/**
 * 商业价值评级阈值（USD，中值）
 * 评级反映"值多少钱、靠不靠谱"，不是"有多大"
 * 50 万粉金融号可以拿 S，500 万粉僵尸号只能拿 D
 */
export const BUSINESS_VALUE_TIERS = {
  S: 1_000_000,    // > $1M
  A: 100_000,      // > $100K
  B: 10_000,       // > $10K
  C: 1_000,        // > $1K
  D: 100,          // > $100
} as const

/** 工具：clamp */
export function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)) }
