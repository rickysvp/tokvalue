// lib/recall.test.ts — selectRecallCandidates 纯函数测试（无需真实数据库）
import { describe, it, expect } from 'vitest'
import { selectRecallCandidates } from './recall'

const NOW = new Date('2026-08-19T12:00:00.000Z')
const DAY_MS = 86_400_000

/** daysAgo 天前（相对 NOW）的 ISO 时间戳 */
function at(daysAgo: number): string {
  return new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString()
}

function run(
  events: Array<{ email: string; username: string; createdAt: string }>,
  alreadySent: Set<string> = new Set()
) {
  return selectRecallCandidates(events, alreadySent, NOW)
}

describe('selectRecallCandidates — 窗口边界', () => {
  it('恰好 10 天前命中（窗口右端点包含）', () => {
    const out = run([{ email: 'a@x.com', username: 'alice', createdAt: at(10) }])
    expect(out).toEqual([{ email: 'a@x.com', username: 'alice' }])
  })

  it('10.5 天前命中（窗口内部）', () => {
    const out = run([{ email: 'a@x.com', username: 'alice', createdAt: at(10.5) }])
    expect(out).toEqual([{ email: 'a@x.com', username: 'alice' }])
  })

  it('9.99 天前不命中（尚未满 10 天）', () => {
    const out = run([{ email: 'a@x.com', username: 'alice', createdAt: at(9.99) }])
    expect(out).toEqual([])
  })

  it('11.01 天前不命中（超过 11 天）', () => {
    const out = run([{ email: 'a@x.com', username: 'alice', createdAt: at(11.01) }])
    expect(out).toEqual([])
  })

  it('恰好 11 天前不命中（窗口左端点排除）', () => {
    const out = run([{ email: 'a@x.com', username: 'alice', createdAt: at(11) }])
    expect(out).toEqual([])
  })

  it('空事件返回空', () => {
    expect(run([])).toEqual([])
  })
})

describe('selectRecallCandidates — 回访排除', () => {
  it('同 email 窗口内完成后又有新的 review_completed（已回访）→ 排除', () => {
    const out = run([
      { email: 'a@x.com', username: 'alice', createdAt: at(10.5) },
      { email: 'a@x.com', username: 'alice', createdAt: at(3) },
    ])
    expect(out).toEqual([])
  })

  it('回访事件只比窗口事件晚一点（9.99 天前）同样排除', () => {
    const out = run([
      { email: 'a@x.com', username: 'alice', createdAt: at(10.5) },
      { email: 'a@x.com', username: 'alice', createdAt: at(9.99) },
    ])
    expect(out).toEqual([])
  })

  it('窗口之前的旧事件不影响窗口内最新事件的命中', () => {
    const out = run([
      { email: 'a@x.com', username: 'old', createdAt: at(12) },
      { email: 'a@x.com', username: 'alice', createdAt: at(10.2) },
    ])
    expect(out).toEqual([{ email: 'a@x.com', username: 'alice' }])
  })
})

describe('selectRecallCandidates — 已发排除', () => {
  it('alreadySent 中的 email 不再召回', () => {
    const out = selectRecallCandidates(
      [{ email: 'a@x.com', username: 'alice', createdAt: at(10.5) }],
      new Set(['a@x.com']),
      NOW
    )
    expect(out).toEqual([])
  })

  it('alreadySent 只影响命中的 email，不影响其他人', () => {
    const out = selectRecallCandidates(
      [
        { email: 'a@x.com', username: 'alice', createdAt: at(10.5) },
        { email: 'b@x.com', username: 'bob', createdAt: at(10.8) },
      ],
      new Set(['a@x.com']),
      NOW
    )
    expect(out).toEqual([{ email: 'b@x.com', username: 'bob' }])
  })
})

describe('selectRecallCandidates — 多 username 同 email 取最新', () => {
  it('同 email 多个 username 命中最新一条的 username', () => {
    const out = run([
      { email: 'a@x.com', username: 'alice', createdAt: at(10.5) },
      { email: 'a@x.com', username: 'bob', createdAt: at(10.2) },
    ])
    expect(out).toEqual([{ email: 'a@x.com', username: 'bob' }])
  })

  it('同 email 乱序传入仍取时间最新（而非数组末尾）', () => {
    // at(10.2) 比 at(10.5) 更新：时间最新的是 bob，尽管它在数组首位
    const out = run([
      { email: 'a@x.com', username: 'bob', createdAt: at(10.2) },
      { email: 'a@x.com', username: 'alice', createdAt: at(10.5) },
    ])
    expect(out).toEqual([{ email: 'a@x.com', username: 'bob' }])
  })
})

describe('selectRecallCandidates — 混合场景', () => {
  it('多个 email 各自独立判定，只返回窗口内且未回访未发送的', () => {
    const out = selectRecallCandidates(
      [
        // 命中：恰好 10 天前
        { email: 'hit@x.com', username: 'hit', createdAt: at(10) },
        // 不命中：9.99 天前
        { email: 'toofresh@x.com', username: 'fresh', createdAt: at(9.99) },
        // 不命中：11.01 天前
        { email: 'tooold@x.com', username: 'old', createdAt: at(11.01) },
        // 不命中：已回访（窗口事件后有新事件）
        { email: 'returned@x.com', username: 'r1', createdAt: at(10.5) },
        { email: 'returned@x.com', username: 'r2', createdAt: at(2) },
      ],
      new Set(),
      NOW
    )
    expect(out).toEqual([{ email: 'hit@x.com', username: 'hit' }])
  })

  it('无效 createdAt 被忽略（不抛错、不产生候选）', () => {
    const out = run([
      { email: 'bad@x.com', username: 'bad', createdAt: 'not-a-date' },
      { email: 'good@x.com', username: 'good', createdAt: at(10.5) },
    ])
    expect(out).toEqual([{ email: 'good@x.com', username: 'good' }])
  })
})
