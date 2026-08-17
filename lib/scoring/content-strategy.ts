import { ContentStrategy, ContentPillar, ContentCadence } from '../../types'
import { CATEGORY_PILLAR_HINTS, CATEGORY_HASHTAGS } from './config'
import type { FollowerTier } from './valuation'

const PILLAR_ICONS: Record<string, string> = {
  'Finance Tips': '📊', 'Investment Cases': '📈', 'Market Trends': '📰', 'Saving Hacks': '💰', 'Money Traps': '⚠️',
  'Product Reviews': '🔍', 'How-To Tips': '💡', 'Unboxings': '📦', 'Tech News': '📡', 'Buying Guides': '🛒',
  'Makeup Tutorials': '💄', 'Skincare Routines': '🧴', 'Favorites': '🎁', 'Beauty Tips': '🎨',
  'OOTD': '👗', 'Item Picks': '👜', 'Style Tips': '🧥', 'Trend Try-Ons': '👠', 'Hauls': '🛍️',
  'Recipe Tutorials': '🍳', 'Restaurant Reviews': '🍜', 'Food Making': '👨‍🍳', 'Ingredient Tests': '🥗', 'Cooking Tips': '🔪',
  'Workout Tutorials': '🏋️', 'Fitness Tips': '💪', 'Meal Pairing': '🥗', 'Move Demos': '🏃', 'Bulk/Cut': '⚖️',
  'Combat Training': '🥊', 'Fight Breakdowns': '🥋', 'Skill Lessons': '🎯', 'Training Daily': '💪', 'Athlete Stories': '🏆',
  'Gameplay': '🎮', 'Walkthroughs': '🕹️', 'Game Reviews': '🎯', 'Highlights': '🔥', 'New Game Demos': '🆕',
  'Travel Vlogs': '✈️', 'Travel Guides': '🗺️', 'Spot Recommendations': '🏖️', 'Food Tours': '🍣', 'Travel Tips': '🎒',
  'Knowledge Explainers': '📚', 'Study Tips': '✏️', 'Value Shares': '🧠', 'Book Insights': '📖', 'Mindset Growth': '🎓',
  'Funny Skits': '😂', 'Prank Daily': '🎭', 'Top Comments': '💬', 'Hilarious Moments': '🤣', 'Comedy Shorts': '🎬',
  'Emotional Shorts': '💔', 'Story Acting': '🎬', 'Plot Twists': '🔄', 'Life Relatability': '💭', 'Series': '📺',
  'Car Reviews': '🚗', 'Car Care Tips': '🔧', 'Mod Shares': '🏁', 'Test Drives': '🚙', 'Car Culture': '🏎️',
  'Pet Daily': '🐱', 'Pet Care Tips': '🐾', 'Pet Training': '🦮', 'Funny Moments': '😹', 'Pet Favorites': '🐶',
  'Parenting Tips': '👶', 'Parent-Child Moments': '👨‍👩‍👧', 'Baby Favorites': '🍼', 'Baby Food Tutorials': '🥣', 'Early Learning': '🧸',
  'Looks Showcase': '✨', 'Glow-Up Tips': '💫', 'Style Shares': '👗', 'Life Vlogs': '📸', 'Makeup Shares': '💋',
  'Content Creation': '🎬', 'Daily Shares': '📱', 'Fan Interaction': '💬', 'Expert Shares': '🎯', 'Growth Logs': '🌱',
}

function pillarIcon(name: string): string {
  return PILLAR_ICONS[name] || '🎬'
}

const CATEGORY_VIDEO_DURATION: Record<string, { min: number; max: number; label: string }> = {
  '美妆护肤': { min: 30, max: 60, label: '30-60s (best for beauty tutorials & showcases)' },
  'beauty': { min: 30, max: 60, label: '30-60s (best for beauty tutorials & showcases)' },
  '知识教育': { min: 60, max: 180, label: '60-180s (educational content needs room to explain)' },
  'education': { min: 60, max: 180, label: '60-180s (educational content needs room to explain)' },
  '科技数码': { min: 45, max: 120, label: '45-120s (reviews & unboxings need detail)' },
  'tech': { min: 45, max: 120, label: '45-120s (reviews & unboxings need detail)' },
  '金融理财': { min: 60, max: 180, label: '60-180s (finance tips need clear explanation)' },
  'finance': { min: 60, max: 180, label: '60-180s (finance tips need clear explanation)' },
  '搞笑': { min: 15, max: 45, label: '15-45s (comedy clips should be short & punchy)' },
  'comedy': { min: 15, max: 45, label: '15-45s (comedy clips should be short & punchy)' },
  '娱乐': { min: 15, max: 45, label: '15-45s (entertainment clips should be short & punchy)' },
  '剧情': { min: 30, max: 90, label: '30-90s (short dramas need a full arc)' },
  'drama': { min: 30, max: 90, label: '30-90s (short dramas need a full arc)' },
  '游戏': { min: 15, max: 60, label: '15-60s (game highlights & quick clips)' },
  'gaming': { min: 15, max: 60, label: '15-60s (game highlights & quick clips)' },
  '美食': { min: 30, max: 90, label: '30-90s (recipes & food tours at a steady pace)' },
  'food': { min: 30, max: 90, label: '30-90s (recipes & food tours at a steady pace)' },
  '健身运动': { min: 30, max: 90, label: '30-90s (workouts & form demos)' },
  'fitness': { min: 30, max: 90, label: '30-90s (workouts & form demos)' },
  'default': { min: 15, max: 60, label: '15-60s (general short-form sweet spot)' },
}

const CATEGORY_COLLAB_IDEAS: Record<string, { type: string; description: string; potential: 'high' | 'medium' }[]> = {
  '美妆护肤': [
    { type: 'Brand Reviews', description: 'Partner with beauty brands for product reviews or makeup tutorials', potential: 'high' },
    { type: 'Niche Collabs', description: 'Co-create makeup challenges with fellow beauty creators', potential: 'high' },
    { type: 'Skincare Experts', description: 'Collaborate with dermatologists or skincare brands for educational content', potential: 'medium' },
  ],
  'beauty': [
    { type: 'Brand Reviews', description: 'Partner with beauty brands for product reviews or makeup tutorials', potential: 'high' },
    { type: 'Niche Collabs', description: 'Co-create makeup challenges with fellow beauty creators', potential: 'high' },
    { type: 'Skincare Experts', description: 'Collaborate with dermatologists or skincare brands for educational content', potential: 'medium' },
  ],
  '时尚穿搭': [
    { type: 'Fashion Brands', description: 'Partner with clothing brands for OOTD and styling content', potential: 'high' },
    { type: 'Creator Style Swaps', description: 'Swap styles with a same-size fashion creator', potential: 'high' },
    { type: 'Store Visits', description: 'Collaborate with boutiques or thrift stores for in-person content', potential: 'medium' },
  ],
  'fashion': [
    { type: 'Fashion Brands', description: 'Partner with clothing brands for OOTD and styling content', potential: 'high' },
    { type: 'Creator Style Swaps', description: 'Swap styles with a same-size fashion creator', potential: 'high' },
    { type: 'Store Visits', description: 'Collaborate with boutiques or thrift stores for in-person content', potential: 'medium' },
  ],
  '科技数码': [
    { type: 'Tech Brands', description: 'Partner with phone, headphone, or laptop brands for reviews', potential: 'high' },
    { type: 'Tech Creator Collabs', description: 'Co-create comparison reviews or debate videos with tech creators', potential: 'high' },
    { type: 'E-Commerce Events', description: 'Promote seasonal sales with electronics retailers', potential: 'medium' },
  ],
  'tech': [
    { type: 'Tech Brands', description: 'Partner with phone, headphone, or laptop brands for reviews', potential: 'high' },
    { type: 'Tech Creator Collabs', description: 'Co-create comparison reviews or debate videos with tech creators', potential: 'high' },
    { type: 'E-Commerce Events', description: 'Promote seasonal sales with electronics retailers', potential: 'medium' },
  ],
  '美食': [
    { type: 'Restaurant & Food Brands', description: 'Partner with restaurants or food brands for tours and recipes', potential: 'high' },
    { type: 'Kitchenware Brands', description: 'Create tutorials featuring cookware or appliances', potential: 'medium' },
    { type: 'Food Creator Collabs', description: 'Co-create cooking challenges with other food creators', potential: 'medium' },
  ],
  'food': [
    { type: 'Restaurant & Food Brands', description: 'Partner with restaurants or food brands for tours and recipes', potential: 'high' },
    { type: 'Kitchenware Brands', description: 'Create tutorials featuring cookware or appliances', potential: 'medium' },
    { type: 'Food Creator Collabs', description: 'Co-create cooking challenges with other food creators', potential: 'medium' },
  ],
  '健身运动': [
    { type: 'Sports Brands', description: 'Partner with activewear or supplement brands for training content', potential: 'high' },
    { type: 'Gym Partnerships', description: 'Collaborate with gyms or studios for workout content', potential: 'high' },
    { type: 'Fitness Creator Collabs', description: 'Co-create training challenges with fitness creators', potential: 'medium' },
  ],
  'fitness': [
    { type: 'Sports Brands', description: 'Partner with activewear or supplement brands for training content', potential: 'high' },
    { type: 'Gym Partnerships', description: 'Collaborate with gyms or studios for workout content', potential: 'high' },
    { type: 'Fitness Creator Collabs', description: 'Co-create training challenges with fitness creators', potential: 'medium' },
  ],
  'default': [
    { type: 'Niche Creator Collabs', description: 'Cross-promote with similar-size creators in your niche', potential: 'high' },
    { type: 'Brand Custom Content', description: 'Create product reviews or tutorials for relevant brands', potential: 'high' },
    { type: 'Hashtag Challenges', description: 'Join or launch branded challenges to expand reach', potential: 'medium' },
    { type: 'Cross-Niche Collabs', description: 'Partner with creators in complementary niches', potential: 'medium' },
  ],
}

interface BuildStrategyInput {
  categories: string[]
  cadence: ContentCadence
  followerTier: FollowerTier
}

export function buildContentStrategy(input: BuildStrategyInput): ContentStrategy {
  const { categories, cadence, followerTier } = input

  const pillarNames: string[] = []
  const seen = new Set<string>()
  for (const cat of categories) {
    const hints = CATEGORY_PILLAR_HINTS[cat] || CATEGORY_PILLAR_HINTS[cat.toLowerCase()] || CATEGORY_PILLAR_HINTS.default
    for (const h of hints) {
      if (!seen.has(h) && pillarNames.length < 4) {
        seen.add(h)
        pillarNames.push(h)
      }
    }
    if (pillarNames.length >= 4) break
  }
  if (pillarNames.length === 0) {
    for (const h of CATEGORY_PILLAR_HINTS.default) {
      pillarNames.push(h)
      if (pillarNames.length >= 4) break
    }
  }

  const pillarFrequency = (idx: number): string => {
    const pw = cadence.avgPostsPerWeek
    if (pw < 1) return idx === 0 ? '1 / week' : '1-2 / month'
    if (pw < 3) return idx === 0 ? '1-2 / week' : idx === 1 ? '1 / week' : '2 / month'
    return idx === 0 ? '2-3 / week' : idx === 1 ? '1-2 / week' : '1 / week'
  }

  const exampleTemplates: Record<string, string[]> = {
    'Finance Tips': ['3 money mistakes almost everyone makes', '5 practical saving tips for beginners', 'How to start investing on a small salary'],
    'Investment Cases': ['How I started investing with $1,000', 'My monthly investment recap', 'Should beginners buy index funds?'],
    'Product Reviews': ['Is this worth it? 30-day real-use review', 'Side-by-side comparison at the same price', 'My honest thoughts after unboxing'],
    'Makeup Tutorials': ['5-minute everyday makeup', 'Base makeup tips every beginner needs', 'The makeup look everyone keeps asking about'],
    'OOTD': ['One week of outfits', 'Flattering outfits for every body type', 'How to look expensive on a budget'],
    'Recipe Tutorials': ['3-step weeknight meals', 'Restaurant-level dishes at home', 'Meal-prep inspiration for busy days'],
    'Workout Tutorials': ['Beginner gym mistakes to avoid', '10-minute abs follow-along', 'What to eat during a bulk'],
    'Gameplay': ['The level that took me 3 days', 'Best loadout for the new patch', '10 tips every beginner should know'],
    'Travel Vlogs': ['This hidden gem is stunning', '3-day weekend travel guide', 'What solo travel is really like'],
    'Knowledge Explainers': ['99% of people do not know this', 'One book that changed my thinking', '5 ways to work smarter, not harder'],
    'Funny Skits': ['When my mom joins TikTok', 'A day in the life of an introvert', 'Relatable office moments'],
    'Emotional Shorts': ['When your partner is controlling', 'The realest couple moments', 'What you learn after a breakup'],
    'Content Creation': ['How I started creating content', 'What to do when you hit a creative wall', '3 filming tips for new creators'],
    'default': ['Beginner tips you need to know', 'Mistakes I made so you do not have to', 'A method that actually worked for me'],
  }

  const pillars: ContentPillar[] = pillarNames.map((name, idx) => {
    const examples = exampleTemplates[name] || exampleTemplates.default
    const whyMap: Record<string, string> = {
      0: 'Core content direction that defines your niche and expertise — prioritize quality here.',
      1: 'Supporting direction that adds variety and covers more audience interests.',
      2: 'Extension direction that adds personality and strengthens fan loyalty.',
      3: 'Experimental direction for testing new formats and finding growth opportunities.',
    }
    const erMap: Record<number, string> = {
      0: '4.0-6.5%',
      1: '3.5-5.5%',
      2: '3.0-5.0%',
      3: '2.5-4.5%',
    }
    return {
      type: name,
      icon: pillarIcon(name),
      frequency: pillarFrequency(idx),
      expectedEngagement: erMap[idx] || '3.0-5.0%',
      examples: examples.slice(0, 3),
      why: whyMap[idx] || 'Diversify your content matrix to attract different audience preferences.',
    }
  })

  const tagSet = new Set<string>()
  for (const cat of categories) {
    const tags = CATEGORY_HASHTAGS[cat] || CATEGORY_HASHTAGS[cat.toLowerCase()] || CATEGORY_HASHTAGS.default
    for (const t of tags) {
      tagSet.add(t)
      if (tagSet.size >= 10) break
    }
    if (tagSet.size >= 10) break
  }
  if (tagSet.size < 8) {
    for (const t of CATEGORY_HASHTAGS.default) {
      tagSet.add(t)
      if (tagSet.size >= 10) break
    }
  }

  const isHighVolumeCat = ['美妆护肤', 'beauty', '时尚穿搭', 'fashion', '搞笑', 'comedy', '娱乐', '游戏', 'gaming'].some(
    c => categories.some(cat => cat.toLowerCase() === c.toLowerCase())
  )

  const recommendedHashtags = Array.from(tagSet).slice(0, 10).map((tag, idx) => ({
    tag,
    volume: isHighVolumeCat ? 'high' as const : 'medium' as const,
    // Deterministic relevance by rank: top tag 0.95, decaying ~0.03 per position
    relevance: Number(Math.max(0.55, 0.95 - idx * 0.04).toFixed(2)),
  }))

  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const topWeekdays = cadence.bestWeekdays.slice(0, 3)
  const topTimeSlots = cadence.bestTimeSlots.slice(0, 3)

  const formatTime = (hour: number): string => `${hour.toString().padStart(2, '0')}:00`

  const scheduleFormats = ['Core Tutorial', 'Interactive', 'Casual Daily']
  const optimalSchedule: { day: string; time: string; format: string }[] = []
  for (let i = 0; i < Math.max(topWeekdays.length, topTimeSlots.length, 3); i++) {
    const day = topWeekdays[i % Math.max(topWeekdays.length, 1)]?.weekday || weekdayLabels[(2 + i) % 7]
    const hour = topTimeSlots[i % Math.max(topTimeSlots.length, 1)]?.hour ?? (19 + i) % 24
    const fmt = scheduleFormats[i % scheduleFormats.length]
    optimalSchedule.push({ day, time: formatTime(hour), format: fmt })
  }

  let videoDuration = CATEGORY_VIDEO_DURATION.default
  for (const cat of categories) {
    const d = CATEGORY_VIDEO_DURATION[cat] || CATEGORY_VIDEO_DURATION[cat.toLowerCase()]
    if (d) { videoDuration = d; break }
  }

  let collabIdeas: { type: string; description: string; potential: 'high' | 'medium' }[] = []
  for (const cat of categories) {
    const ideas = CATEGORY_COLLAB_IDEAS[cat] || CATEGORY_COLLAB_IDEAS[cat.toLowerCase()]
    if (ideas && ideas.length > 0) {
      collabIdeas = ideas.slice(0, 4)
      break
    }
  }
  if (collabIdeas.length === 0) collabIdeas = CATEGORY_COLLAB_IDEAS.default

  const tierAdvice: Record<FollowerTier, string> = {
    nano: 'You are in the early-growth stage: post consistently and join trending topics to build momentum.',
    micro: 'You have a solid fan base: focus on your niche and start testing monetization.',
    mid: 'You are a mid-tier creator: optimize your brand-deal pricing and commercial workflow.',
    macro: 'You are a top creator: build a multi-platform presence and explore your own product line.',
    mega: 'You are a top-tier creator: build a personal IP ecosystem and long-term brand partnerships.',
  }

  const rhythmText = cadence.postingRhythm === 'daily' ? 'daily' : cadence.postingRhythm === 'weekly' ? 'weekly' : 'irregular'
  const summary = `Based on the account data (${categories.slice(0,2).join(', ') || 'general lifestyle'} niche, ${rhythmText} posting rhythm), ${tierAdvice[followerTier]}`

  return {
    pillars,
    recommendedHashtags,
    optimalSchedule,
    videoDuration,
    collaborationIdeas: collabIdeas.slice(0, 4),
    summary,
  }
}
