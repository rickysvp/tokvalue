// lib/username-normalize.ts
/**
 * Username 归一化：免费辅闸（同账号全网 1 次免费生成）的 key 计算。
 * 规则：去首尾空格 + 去首部 @ + 小写 + 去特殊字符（. _ -）。
 * 目的：john.doe / John_Doe / @john-doe 归并为同一 key，堵住变体绕过辅闸。
 */
export function normalizeForGrantKey(input: string): string {
  return String(input || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[._-]/g, '')
}
