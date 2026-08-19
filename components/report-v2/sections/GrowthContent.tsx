'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Evaluation } from '@/types'
import { formatNumber } from '@/lib/format'
import { SectionHeader } from '../ui/SectionHeader'
import type { EnDict } from '@/lib/i18n/dictionaries/en'

const POSITIVE_COLOR = '#047857'
const NEGATIVE_COLOR = '#dc2626'

const VOLUME_COLOR: Record<string, string> = {
  high: '#047857',
  medium: '#1d4ed8',
  low: '#6B7280',
}

const POTENTIAL_COLOR: Record<string, string> = {
  high: '#047857',
  medium: '#1d4ed8',
}

function truncateDesc(desc: string | undefined, max = 60): string {
  const text = (desc ?? '').trim()
  if (!text) return '—'
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function GrowthContent({ result, dict }: { result: Evaluation; dict: EnDict }) {
  const g = dict.reportV2.growth
  const [showStrategy, setShowStrategy] = useState(false)

  const topVideos = [...(result.posts ?? [])]
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, 3)
  const topics = result.trendAnalysis?.trendingTopics ?? []
  const strategy = result.contentStrategy

  if (topVideos.length === 0 && topics.length === 0 && !strategy) return null

  return (
    <section>
      <SectionHeader index={9} title={g.title} subtitle={g.subtitle} id="growth-content" />
      <div className="space-y-4">
        {/* Top-performing videos */}
        {topVideos.length > 0 && (
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-[13px] font-medium text-[#6B7280]">{g.topVideos}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {topVideos.map(post => (
                <div
                  key={post.id}
                  className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-3.5"
                >
                  <p className="line-clamp-2 min-h-[2.5rem] text-[13px] leading-relaxed text-[#374151]">
                    {truncateDesc(post.desc)}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[#E5E7EB] pt-3">
                    <div>
                      <p className="text-xs text-[#6B7280]">{g.plays}</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-[#111827]">
                        {formatNumber(post.playCount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[#6B7280]">{g.likes}</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-[#111827]">
                        {formatNumber(post.likeCount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[#6B7280]">{g.shares}</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-[#111827]">
                        {formatNumber(post.shareCount)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trending in your niche */}
        {topics.length > 0 && (
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-[13px] font-medium text-[#6B7280]">{g.trends}</p>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {topics.map(topic => {
                const growthColor = topic.growth >= 0 ? POSITIVE_COLOR : NEGATIVE_COLOR
                return (
                  <div
                    key={topic.topic}
                    className="rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2.5"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-[#111827]">{topic.topic}</span>
                      <span className="text-xs text-[#6B7280]">#{topic.hashtag}</span>
                      <span
                        className="text-xs font-semibold tabular-nums"
                        style={{ color: growthColor }}
                      >
                        {topic.growth >= 0 ? '+' : ''}{topic.growth}%
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-[#6B7280]">{g.relevance}</span>
                      <div className="h-1 w-16 rounded-full bg-[#F3F4F6]">
                        <div
                          className="h-full rounded-full bg-[#1d4ed8]"
                          style={{ width: `${Math.max(0, Math.min(100, topic.relevance))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Content strategy 折叠区 */}
        {strategy && (
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <button
              type="button"
              onClick={() => setShowStrategy(s => !s)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#1d4ed8] hover:underline"
            >
              {g.strategy}
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showStrategy ? 'rotate-180' : ''}`}
              />
            </button>
            {showStrategy && (
              <div className="mt-4 space-y-6 border-t border-[#E5E7EB] pt-4">
                {/* 内容支柱 */}
                {strategy.pillars?.length > 0 && (
                  <div>
                    <p className="text-[13px] font-medium text-[#6B7280]">{g.pillars}</p>
                    <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
                      {strategy.pillars.map(pillar => (
                        <div
                          key={pillar.type}
                          className="rounded-xl border border-[#E5E7EB] bg-[#F7F8FA] px-3.5 py-2.5"
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-sm font-medium text-[#111827]">{pillar.type}</span>
                            <span className="text-xs text-[#6B7280]">{pillar.frequency}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 推荐标签 */}
                {strategy.recommendedHashtags?.length > 0 && (
                  <div>
                    <p className="text-[13px] font-medium text-[#6B7280]">{g.hashtags}</p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {strategy.recommendedHashtags.map(tag => {
                        const color = VOLUME_COLOR[tag.volume] ?? '#6B7280'
                        return (
                          <span
                            key={tag.tag}
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                            style={{ color, backgroundColor: `${color}14` }}
                          >
                            #{tag.tag}
                            <span className="font-normal text-[#6B7280]">
                              {g.volume[tag.volume]}
                            </span>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* 最佳发布时间 */}
                {strategy.optimalSchedule?.length > 0 && (
                  <div>
                    <p className="text-[13px] font-medium text-[#6B7280]">{g.schedule}</p>
                    <div className="mt-2.5 overflow-hidden rounded-xl border border-[#E5E7EB]">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[#E5E7EB] bg-[#F7F8FA] text-left text-xs text-[#6B7280]">
                            <th className="px-3.5 py-2 font-medium">{g.scheduleDay}</th>
                            <th className="px-3.5 py-2 font-medium">{g.scheduleTime}</th>
                            <th className="px-3.5 py-2 font-medium">{g.scheduleFormat}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {strategy.optimalSchedule.map((slot, i) => (
                            <tr
                              key={`${slot.day}-${slot.time}-${i}`}
                              className={i < strategy.optimalSchedule.length - 1 ? 'border-b border-[#E5E7EB]' : ''}
                            >
                              <td className="px-3.5 py-2 font-medium text-[#111827]">{slot.day}</td>
                              <td className="px-3.5 py-2 tabular-nums text-[#374151]">{slot.time}</td>
                              <td className="px-3.5 py-2 text-[#374151]">{slot.format}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 合作建议 */}
                {strategy.collaborationIdeas?.length > 0 && (
                  <div>
                    <p className="text-[13px] font-medium text-[#6B7280]">{g.collabs}</p>
                    <ul className="mt-2.5 space-y-2.5">
                      {strategy.collaborationIdeas.map(idea => {
                        const color = POTENTIAL_COLOR[idea.potential] ?? '#1d4ed8'
                        return (
                          <li key={idea.type} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                            <span className="text-sm font-medium text-[#111827]">{idea.type}</span>
                            <span
                              className="rounded-full px-2 py-0.5 text-xs font-medium"
                              style={{ color, backgroundColor: `${color}14` }}
                            >
                              {g.potential[idea.potential]}
                            </span>
                            <span className="w-full text-[13px] leading-relaxed text-[#6B7280]">
                              {idea.description}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
