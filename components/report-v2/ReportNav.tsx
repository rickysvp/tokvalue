'use client'

import { useEffect, useState } from 'react'

/**
 * 报告锚点导航：桌面左侧竖排固定，移动端顶部 sticky 横滚 pill 条。
 * IntersectionObserver 高亮当前 section；点击原生锚点平滑滚动
 * （globals.css scroll-behavior: smooth + 各 section scroll-mt 偏移）。
 */
export function ReportNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
        }
      },
      { rootMargin: '-40% 0px -55% 0px' },
    )
    for (const { id } of items) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [items])

  return (
    <>
      {/* 桌面：左侧竖排固定 */}
      <nav aria-label="Report sections" className="hidden lg:flex fixed left-6 top-1/3 z-30 -translate-y-1/2 flex-col gap-1">
        {items.map(item => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={`whitespace-nowrap py-1 text-xs transition-colors ${
              active === item.id ? 'font-medium text-[#1d4ed8]' : 'text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            {item.label}
          </a>
        ))}
      </nav>

      {/* 移动：顶部 sticky 横滚 pill 条 */}
      <nav
        aria-label="Report sections"
        className="sticky top-14 z-30 -mx-4 flex gap-2 overflow-x-auto bg-[#F7F8FA]/95 px-4 py-2 backdrop-blur lg:hidden"
      >
        {items.map(item => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              active === item.id
                ? 'bg-[#1d4ed8] text-white'
                : 'border border-[#E5E7EB] bg-white text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </>
  )
}
