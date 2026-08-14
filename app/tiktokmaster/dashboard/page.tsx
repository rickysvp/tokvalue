'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  LogOut, TrendingUp, DollarSign, Users, Activity,
  Settings, Loader2, CheckCircle2, XCircle, Search, FileText,
  CreditCard, Zap, RefreshCw, Filter,
  Clock, AlertCircle, AlertTriangle, Globe,
  PieChart as PieIcon,
} from 'lucide-react'
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  LineChart, Line, Legend,
} from 'recharts'
import type { PieLabelRenderProps } from 'recharts'

// ── Types ──
interface StatsData {
  overview: {
    totalRevenue: number
    revenueToday: number
    revenueWeek: number
    revenueMonth: number
    totalPayers: number
    payersToday: number
    payersWeek: number
    payersMonth: number
    evaluationsToday: number
    evaluationsWeek: number
    evaluationsMonth: number
    remainingCredits: number
    apiErrors?: {
      errorsToday: number
      errorsMonth: number
      errorsTotal: number
      byCode: { code: string; count: number }[]
    }
  }
  revenue: {
    byDay: { date: string; amount: number }[]
    byPackage: { id: string; count: number; revenue: number }[]
  }
  pvuv: {
    totalPV: number
    totalUV: number
    pvToday: number
    uvToday: number
    pvWeek: number
    uvWeek: number
    pvMonth: number
    uvMonth: number
  }
  users: Array<{
    email: string
    hasPaid: boolean
    remainingCredits: number
    totalPurchased: number
    usedCredits: number
    verifiedAt: string
    lastPurchaseAt: string | null
    disabled: boolean
  }>
  sources: Array<{
    source: string
    visitors: number
    pct: number
  }>
  trends?: {
    payersByDay: Array<{ date: string; count: number }>
    evaluationsByDay: Array<{ date: string; count: number }>
    pvuvByDay: Array<{ date: string; pv: number; uv: number }>
  }
}

type TrendPeriod = '7d' | '14d' | '30d' | '90d'

const TREND_PERIODS: { key: TrendPeriod; label: string }[] = [
  { key: '7d', label: '7天' },
  { key: '14d', label: '14天' },
  { key: '30d', label: '30天' },
  { key: '90d', label: '90天' },
]

interface LogItem {
  id: number
  eventType: string
  path: string
  username: string
  email: string
  metadata: Record<string, unknown> | null
  ipHash: string
  userAgent: string
  createdAt: string
}

type Tab = 'overview' | 'revenue' | 'users' | 'logs' | 'ops'

// ── 赠送原因选项 ──
const GRANT_REASONS = [
  '客户补偿',
  '活动推广',
  '测试用途',
  '合作赠送',
  '体验赠送',
  'VIP回馈',
  '其他',
]

// ── Helpers ──
function fmtUsd(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}
function fmtNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}
function pct(a: number, b: number): string {
  if (b === 0) return '0.0%'
  return `${((a / b) * 100).toFixed(1)}%`
}
function fmtTime(s: string): string {
  const d = new Date(s)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString('zh-CN')
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  page_view: { label: '页面浏览', color: 'text-blue-400' },
  search: { label: '搜索账号', color: 'text-cyan-400' },
  evaluate_start: { label: '开始评估', color: 'text-purple-400' },
  evaluate_done: { label: '评估完成', color: 'text-green-400' },
  paywall_view: { label: '付费墙展示', color: 'text-amber-400' },
  paywall_click: { label: '付费墙点击', color: 'text-orange-400' },
  purchase: { label: '购买完成', color: 'text-[#00F2EA]' },
  email_sent: { label: '邮件发送', color: 'text-pink-400' },
  email_verified: { label: '邮箱验证', color: 'text-indigo-400' },
  share_created: { label: '分享创建', color: 'text-teal-400' },
  api_error: { label: 'API错误', color: 'text-red-400' },
}

function getEventLabel(type: string): { label: string; color: string } {
  return EVENT_LABELS[type] || { label: type, color: 'text-neutral-400' }
}

const PIE_COLORS = ['#00F2EA', '#FF0050', '#22c55e', '#a855f7', '#f59e0b', '#3b82f6', '#ec4899']
const SOURCE_COLORS: Record<string, string> = {
  '直接访问': '#525252',
  'Google': '#4285f4',
  '百度': '#2932e1',
  'X/Twitter': '#1d9bf0',
  'TikTok': '#ff0050',
  'YouTube': '#ff0000',
  'Facebook': '#1877f2',
  'Instagram': '#e4405f',
  'Reddit': '#ff4500',
  'GitHub': '#fafafa',
  'Bing': '#00897b',
  'Product Hunt': '#da552f',
}

const PACKAGE_LABELS: Record<string, string> = {
  pack1: '单次评估',
  pack6: '6次套餐',
  pack30: '30次套餐',
}

const TAB_CONFIG: Record<Tab, { label: string; icon: React.ReactNode; activeColor: string }> = {
  overview: { label: '数据总览', icon: <Activity className="h-4 w-4" />, activeColor: 'text-[#00F2EA] border-[#00F2EA]' },
  revenue:  { label: '收入分析', icon: <DollarSign className="h-4 w-4" />, activeColor: 'text-green-400 border-green-400' },
  users:    { label: '用户管理', icon: <Users className="h-4 w-4" />, activeColor: 'text-purple-400 border-purple-400' },
  logs:     { label: '系统日志', icon: <FileText className="h-4 w-4" />, activeColor: 'text-amber-400 border-amber-400' },
  ops:      { label: '运营操作', icon: <Settings className="h-4 w-4" />, activeColor: 'text-cyan-400 border-cyan-400' },
}

export default function AdminDashboard() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('overview')
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('30d')

  const [grantMode, setGrantMode] = useState<'single' | 'batch'>('single')
  const [grantEmail, setGrantEmail] = useState('')
  const [grantBatchEmails, setGrantBatchEmails] = useState('')
  const [grantCredits, setGrantCredits] = useState(5)
  const [grantReason, setGrantReason] = useState(GRANT_REASONS[0])
  const [grantLoading, setGrantLoading] = useState(false)
  const [grantResult, setGrantResult] = useState<{ success: boolean; msg: string } | null>(null)

  const [history, setHistory] = useState<Array<{ id: number; target_email: string; credits: number; reason: string; created_at: string }>>([])
  const [logs, setLogs] = useState<LogItem[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logFilter, setLogFilter] = useState('')
  const [logTypeFilter, setLogTypeFilter] = useState('all')
  const [userSearch, setUserSearch] = useState('')

  // 用户管理操作
  const [userAction, setUserAction] = useState<{
    type: 'deduct' | 'disable' | 'enable' | 'delete'
    email: string
  } | null>(null)
  const [deductAmount, setDeductAmount] = useState(1)
  const [actionReason, setActionReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionResult, setActionResult] = useState<{ success: boolean; msg: string } | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      // 鉴权依赖 httpOnly cookie（同源 fetch 自动携带），前端不再接触 token
      const res = await fetch(`/api/tiktokmaster/stats?period=${trendPeriod}`)
      if (res.status === 401) { router.push('/tiktokmaster'); return }
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.detail ? `数据加载失败: ${data.detail}` : '数据加载失败')
        console.error('[stats] API error:', data.error, data.detail)
      } else {
        // 防御性兜底：确保所有字段存在，避免渲染崩溃
        setStats({
          overview: data.overview || {
            totalRevenue: 0, revenueToday: 0, revenueWeek: 0, revenueMonth: 0,
            totalPayers: 0, payersToday: 0, payersWeek: 0, payersMonth: 0,
            evaluationsToday: 0, evaluationsWeek: 0, evaluationsMonth: 0,
            remainingCredits: 0,
          },
          revenue: data.revenue || { byDay: [], byPackage: [] },
          pvuv: data.pvuv || { totalPV: 0, totalUV: 0, pvToday: 0, uvToday: 0, pvWeek: 0, uvWeek: 0, pvMonth: 0, uvMonth: 0 },
          users: Array.isArray(data.users) ? data.users : [],
          sources: Array.isArray(data.sources) ? data.sources : [],
          trends: data.trends || {
            payersByDay: [],
            evaluationsByDay: [],
            pvuvByDay: [],
          },
        })
        setLastRefresh(new Date())
      }
    } catch (err) {
      setError('数据加载失败')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [router, trendPeriod])

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/tiktokmaster/credits/history?limit=50')
      const data = await res.json()
      setHistory(data.items || [])
    } catch {}
  }, [])

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const res = await fetch('/api/tiktokmaster/logs?limit=100')
      const data = await res.json()
      setLogs(data.items || [])
    } catch {
      console.error('获取日志失败')
    } finally {
      setLogsLoading(false)
    }
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => { if (tab === 'ops') fetchHistory() }, [tab, fetchHistory])
  useEffect(() => { if (tab === 'logs') fetchLogs() }, [tab, fetchLogs])

  async function handleGrant() {
    const emails = grantMode === 'single'
      ? [grantEmail]
      : grantBatchEmails.split(/[\n,]+/).map(e => e.trim()).filter(Boolean)

    if (emails.length === 0) { setGrantResult({ success: false, msg: '请输入至少一个邮箱' }); return }
    if (!grantReason) { setGrantResult({ success: false, msg: '请选择赠送原因' }); return }

    setGrantLoading(true)
    setGrantResult(null)
    try {
      const res = await fetch('/api/tiktokmaster/credits/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails, credits: grantCredits, reason: grantReason }),
      })
      const data = await res.json()
      if (res.ok) {
        setGrantResult({ success: true, msg: `已向 ${data.granted} 个邮箱赠送 ${data.totalCredits} 次评估` })
        setGrantEmail('')
        setGrantBatchEmails('')
        fetchHistory()
        fetchStats()
      } else {
        setGrantResult({ success: false, msg: data.error || '操作失败' })
      }
    } catch {
      setGrantResult({ success: false, msg: '网络错误' })
    } finally {
      setGrantLoading(false)
    }
  }

  async function logout() {
    // httpOnly cookie 前端 JS 无法清除，需调后端登出 route 下发过期指令
    try {
      await fetch('/api/tiktokmaster/auth', { method: 'DELETE' })
    } catch {}
    router.push('/tiktokmaster')
  }

  async function handleUserAction() {
    if (!userAction) return
    if (!actionReason) { setActionResult({ success: false, msg: '请选择操作原因' }); return }

    setActionLoading(true)
    setActionResult(null)
    try {
      const res = await fetch('/api/tiktokmaster/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: userAction.type,
          email: userAction.email,
          credits: userAction.type === 'deduct' ? deductAmount : undefined,
          reason: actionReason,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        const actionLabels: Record<string, string> = {
          deduct: `已扣减 ${deductAmount} 次评估，剩余 ${data.remainingCredits} 次`,
          disable: '用户已禁用',
          enable: '用户已解禁',
          delete: '用户已删除',
        }
        setActionResult({ success: true, msg: actionLabels[userAction.type] })
        fetchStats()
        setTimeout(() => {
          setUserAction(null)
          setActionResult(null)
          setActionReason('')
        }, 1500)
      } else {
        setActionResult({ success: false, msg: data.error || '操作失败' })
      }
    } catch {
      setActionResult({ success: false, msg: '网络错误' })
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#00F2EA]" />
      </main>
    )
  }

  if (error && !stats) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-red-400 flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      </main>
    )
  }

  const o = stats!.overview
  const r = stats!.revenue
  const src = stats!.sources || []

  const tabs = Object.entries(TAB_CONFIG).map(([key, cfg]) => ({ key: key as Tab, ...cfg }))

  const filteredUsers = stats!.users.filter(u =>
    !userSearch || u.email.toLowerCase().includes(userSearch.toLowerCase())
  )

  const filteredLogs = logs.filter(l => {
    if (logTypeFilter !== 'all' && l.eventType !== logTypeFilter) return false
    if (logFilter) {
      const q = logFilter.toLowerCase()
      return l.email.toLowerCase().includes(q) ||
             l.path.toLowerCase().includes(q) ||
             l.username.toLowerCase().includes(q) ||
             l.eventType.toLowerCase().includes(q)
    }
    return true
  })


  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      {/* ── 顶部导航栏 ── */}
      <header className="sticky top-0 z-50 bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-neutral-800/80">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Image src="/tokvalue.png" alt="TokValue" width={100} height={24} className="h-6 w-auto object-contain" />
            <span className="text-xs text-neutral-600 border-l border-neutral-800 pl-3">管理后台</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-neutral-600 flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              {lastRefresh.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <button
              onClick={() => { setLoading(true); fetchStats() }}
              className="text-xs text-neutral-500 hover:text-[#00F2EA] flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              刷新
            </button>
            <button onClick={logout} className="flex items-center gap-2 text-xs text-neutral-500 hover:text-red-400 transition-colors">
              <LogOut className="h-3.5 w-3.5" />
              退出
            </button>
          </div>
        </div>
      </header>

      {/* ── Tab 导航 ── */}
      <div className="sticky top-14 z-40 bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-neutral-800/80">
        <div className="max-w-[1400px] mx-auto px-6 flex gap-1 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key ? `${t.activeColor}` : 'border-transparent text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 内容区 ── */}
      <div className="max-w-[1400px] mx-auto px-6 py-8">

        {/* ════════ Tab: 数据总览 ════════ */}
        {tab === 'overview' && (
          <div className="space-y-8">
            {/* 核心指标卡片 */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard label="总收入" value={fmtUsd(o.totalRevenue)} sub={`今日 ${fmtUsd(o.revenueToday)}`} icon={<DollarSign className="h-5 w-5" />} gradient="from-[#00F2EA]/20 to-transparent" accent="text-[#00F2EA]" border="border-[#00F2EA]/30" />
              <StatCard label="付费用户" value={fmtNum(o.totalPayers)} sub={`今日新增 ${fmtNum(o.payersToday)}`} icon={<Users className="h-5 w-5" />} gradient="from-[#FF0050]/20 to-transparent" accent="text-[#FF0050]" border="border-[#FF0050]/30" />
              <StatCard label="评估次数（本月）" value={fmtNum(o.evaluationsMonth)} sub={`今日 ${fmtNum(o.evaluationsToday)}`} icon={<Activity className="h-5 w-5" />} gradient="from-green-500/20 to-transparent" accent="text-green-400" border="border-green-500/30" />
              <StatCard label="未使用评估数" value={fmtNum(o.remainingCredits)} sub="待消耗额度" icon={<TrendingUp className="h-5 w-5" />} gradient="from-amber-500/20 to-transparent" accent="text-amber-400" border="border-amber-500/30" />
              <StatCard label="API 错误（本月）" value={fmtNum(o.apiErrors?.errorsMonth ?? 0)} sub={`今日 ${fmtNum(o.apiErrors?.errorsToday ?? 0)}`} icon={<AlertTriangle className="h-5 w-5" />} gradient="from-red-500/20 to-transparent" accent="text-red-400" border="border-red-500/30" />
            </div>

            {/* 趋势周期切换器 */}
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs text-neutral-600 mr-1">趋势周期</span>
              <div className="inline-flex rounded-lg border border-neutral-800 bg-[#141414] p-0.5">
                {TREND_PERIODS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setTrendPeriod(p.key)}
                    className={`px-3 py-1 rounded-md text-xs transition-colors ${
                      trendPeriod === p.key
                        ? 'bg-[#00F2EA] text-black font-semibold'
                        : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 收入趋势 + 流量趋势（折线图） */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartCard title={`收入趋势（近${TREND_PERIODS.find(p => p.key === trendPeriod)?.label}）`} icon={<DollarSign className="h-4 w-4" />}>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={r.byDay}>
                      <defs>
                        <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#00F2EA" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#00F2EA" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#525252' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#525252' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#141414', border: '1px solid #2a2a2a', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#737373' }} />
                      <Area type="monotone" dataKey="amount" stroke="#00F2EA" strokeWidth={2} fill="url(#revGradient)" name="收入" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title={`流量趋势 · PV / UV（近${TREND_PERIODS.find(p => p.key === trendPeriod)?.label}）`} icon={<TrendingUp className="h-4 w-4" />}>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats!.trends?.pvuvByDay || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#525252' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#525252' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#141414', border: '1px solid #2a2a2a', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#737373' }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="pv" stroke="#a855f7" strokeWidth={2} dot={false} name="PV（页面浏览）" />
                      <Line type="monotone" dataKey="uv" stroke="#c084fc" strokeWidth={2} dot={false} name="UV（独立访客）" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </div>

            {/* 付费用户数 + 评估次数（折线图） */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartCard title={`付费用户数（近${TREND_PERIODS.find(p => p.key === trendPeriod)?.label}）`} icon={<Users className="h-4 w-4" />}>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats!.trends?.payersByDay || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#525252' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#525252' }} allowDecimals={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#141414', border: '1px solid #2a2a2a', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#737373' }} />
                      <Line type="monotone" dataKey="count" stroke="#FF0050" strokeWidth={2} dot={false} name="累计付费用户" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title={`评估次数（近${TREND_PERIODS.find(p => p.key === trendPeriod)?.label}）`} icon={<Activity className="h-4 w-4" />}>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats!.trends?.evaluationsByDay || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#525252' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#525252' }} allowDecimals={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#141414', border: '1px solid #2a2a2a', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#737373' }} />
                      <Line type="monotone" dataKey="count" stroke="#22c55e" strokeWidth={2} dot={false} name="每日评估次数" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </div>

            {/* 流量来源 + 详细指标 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 流量来源 */}
              <div className="lg:col-span-2 rounded-2xl border border-neutral-800 bg-[#141414] p-6">
                <h3 className="text-sm font-semibold text-neutral-300 mb-5 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-cyan-400" />
                  流量来源（用户从哪里来）
                </h3>
                {src.length > 0 ? (
                  <div className="space-y-3">
                    {src.map((s, i) => {
                      const color = SOURCE_COLORS[s.source] || PIE_COLORS[i % PIE_COLORS.length]
                      return (
                        <div key={i} className="flex items-center gap-4">
                          <div className="flex items-center gap-2 w-32 shrink-0">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                            <span className="text-sm text-neutral-200">{s.source}</span>
                          </div>
                          <div className="flex-1 h-6 bg-[#0f0f0f] rounded-md overflow-hidden">
                            <div
                              className="h-full rounded-md transition-all flex items-center justify-end pr-2"
                              style={{ width: `${Math.max(s.pct, 2)}%`, backgroundColor: color, opacity: 0.8 }}
                            >
                              <span className="text-xs text-white/90 font-medium">{s.pct}%</span>
                            </div>
                          </div>
                          <span className="text-sm text-neutral-400 tabular-nums w-16 text-right shrink-0">{s.visitors} 人</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-neutral-600 text-sm">
                    暂无流量来源数据
                    <p className="text-xs mt-2 text-neutral-700">部署后访问数据将自动记录</p>
                  </div>
                )}
              </div>

              {/* PV/UV 汇总 */}
              <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-6">
                <h3 className="text-sm font-semibold text-neutral-300 mb-5 flex items-center gap-2">
                  <BarChart className="h-4 w-4 text-purple-400" />
                  PV / UV 汇总
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-[#0f0f0f] p-4 border border-neutral-800/50">
                      <div className="text-xs text-neutral-500 mb-1">今日 PV</div>
                      <div className="text-xl font-bold text-purple-400 tabular-nums">{fmtNum(stats!.pvuv.pvToday)}</div>
                    </div>
                    <div className="rounded-xl bg-[#0f0f0f] p-4 border border-neutral-800/50">
                      <div className="text-xs text-neutral-500 mb-1">今日 UV</div>
                      <div className="text-xl font-bold text-fuchsia-400 tabular-nums">{fmtNum(stats!.pvuv.uvToday)}</div>
                    </div>
                    <div className="rounded-xl bg-[#0f0f0f] p-4 border border-neutral-800/50">
                      <div className="text-xs text-neutral-500 mb-1">总 PV</div>
                      <div className="text-xl font-bold text-purple-400 tabular-nums">{fmtNum(stats!.pvuv.totalPV)}</div>
                    </div>
                    <div className="rounded-xl bg-[#0f0f0f] p-4 border border-neutral-800/50">
                      <div className="text-xs text-neutral-500 mb-1">总 UV</div>
                      <div className="text-xl font-bold text-fuchsia-400 tabular-nums">{fmtNum(stats!.pvuv.totalUV)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════ Tab: 收入分析 ════════ */}
        {tab === 'revenue' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartCard title="套餐分布" icon={<PieIcon className="h-4 w-4" />}>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={r.byPackage.map(p => ({ ...p, name: PACKAGE_LABELS[p.id] || p.id }))} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(props: PieLabelRenderProps) => `${props.name}: ${props.value}次`}>
                        {r.byPackage.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#141414', border: '1px solid #2a2a2a', borderRadius: 8, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="每日收入（近14天）" icon={<DollarSign className="h-4 w-4" />}>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={r.byDay.slice(-14)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#525252' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#525252' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#141414', border: '1px solid #2a2a2a', borderRadius: 8, fontSize: 12 }} />
                      <Bar dataKey="amount" fill="#00F2EA" radius={[4, 4, 0, 0]} name="收入" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </div>

            {/* 套餐销售明细 */}
            <div className="rounded-2xl border border-neutral-800 bg-[#141414] overflow-hidden">
              <div className="p-6 pb-4">
                <h3 className="text-sm font-semibold text-neutral-300 flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-[#00F2EA]" />
                  套餐销售明细
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-neutral-500 border-y border-neutral-800 bg-[#0f0f0f]/50">
                    <th className="px-6 py-3 font-medium">套餐名称</th>
                    <th className="px-6 py-3 font-medium text-right">销售次数</th>
                    <th className="px-6 py-3 font-medium text-right">总收入</th>
                    <th className="px-6 py-3 font-medium text-right">占比</th>
                  </tr>
                </thead>
                <tbody>
                  {r.byPackage.map((pkg, i) => {
                    const totalRev = r.byPackage.reduce((s, p) => s + p.revenue, 0)
                    return (
                      <tr key={i} className="border-b border-neutral-800/50 hover:bg-neutral-800/20 transition-colors">
                        <td className="px-6 py-3.5 text-neutral-200">{PACKAGE_LABELS[pkg.id] || pkg.id}</td>
                        <td className="px-6 py-3.5 text-right tabular-nums">{pkg.count} 次</td>
                        <td className="px-6 py-3.5 text-right tabular-nums text-[#00F2EA] font-semibold">{fmtUsd(pkg.revenue)}</td>
                        <td className="px-6 py-3.5 text-right tabular-nums text-neutral-500">{pct(pkg.revenue, totalRev)}</td>
                      </tr>
                    )
                  })}
                  {r.byPackage.length === 0 && (
                    <tr><td colSpan={4} className="py-12 text-center text-neutral-600">暂无销售数据</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ════════ Tab: 用户管理 ════════ */}
        {tab === 'users' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-neutral-800 bg-[#141414] overflow-hidden">
              <div className="p-6 pb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-neutral-300">用户列表</h3>
                  <span className="text-xs text-neutral-600">共 {stats!.users.length} 人</span>
                  <div className="flex gap-2 ml-2">
                    <span className="px-2 py-0.5 rounded text-xs bg-green-500/10 text-green-400 border border-green-500/20">
                      {stats!.users.filter(u => u.hasPaid).length} 已付费
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs bg-neutral-500/10 text-neutral-400 border border-neutral-500/20">
                      {stats!.users.filter(u => !u.hasPaid).length} 免费用户
                    </span>
                    {stats!.users.some(u => u.disabled) && (
                      <span className="px-2 py-0.5 rounded text-xs bg-red-500/10 text-red-400 border border-red-500/20">
                        {stats!.users.filter(u => u.disabled).length} 已禁用
                      </span>
                    )}
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-600" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    placeholder="搜索邮箱..."
                    className="w-56 rounded-lg border border-neutral-700 bg-[#0f0f0f] pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-neutral-600 focus:border-[#00F2EA] focus:outline-none"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-neutral-500 border-y border-neutral-800 bg-[#0f0f0f]/50">
                      <th className="px-6 py-3 font-medium">邮箱</th>
                      <th className="px-6 py-3 font-medium">状态</th>
                      <th className="px-6 py-3 font-medium text-right">剩余评估</th>
                      <th className="px-6 py-3 font-medium text-right">累计购买</th>
                      <th className="px-6 py-3 font-medium text-right">已使用</th>
                      <th className="px-6 py-3 font-medium">注册时间</th>
                      <th className="px-6 py-3 font-medium">最近购买</th>
                      <th className="px-6 py-3 font-medium text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u, i) => (
                      <tr key={i} className="border-b border-neutral-800/50 hover:bg-neutral-800/20 transition-colors group">
                        <td className="px-6 py-3.5 text-neutral-200">{u.email}</td>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-1.5">
                            {u.disabled ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-500/10 text-red-400 border border-red-500/20">
                                <XCircle className="h-3 w-3" /> 已禁用
                              </span>
                            ) : u.hasPaid ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-500/10 text-green-400 border border-green-500/20">
                                <CheckCircle2 className="h-3 w-3" /> 已付费
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-neutral-500/10 text-neutral-400 border border-neutral-500/20">
                                <Users className="h-3 w-3" /> 免费用户
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-3.5 text-right tabular-nums">
                          <span className={u.remainingCredits > 0 ? 'text-[#00F2EA] font-semibold' : 'text-neutral-600'}>
                            {u.remainingCredits}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right tabular-nums text-neutral-400">{u.totalPurchased}</td>
                        <td className="px-6 py-3.5 text-right tabular-nums">
                          <span className={u.usedCredits > 0 ? 'text-[#FF0050] font-semibold' : 'text-neutral-600'}>
                            {u.usedCredits}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-neutral-500 text-xs">{fmtDate(u.verifiedAt)}</td>
                        <td className="px-6 py-3.5 text-neutral-500 text-xs">{u.lastPurchaseAt ? fmtDate(u.lastPurchaseAt) : '—'}</td>
                        <td className="px-6 py-3.5">
                          <div className="flex items-center justify-end gap-1.5">
                            {u.disabled ? (
                              <button
                                onClick={() => { setUserAction({ type: 'enable', email: u.email }); setActionReason(''); setActionResult(null) }}
                                className="px-2.5 py-1 rounded-md text-xs bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors"
                              >
                                解禁
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => { setUserAction({ type: 'deduct', email: u.email }); setActionReason(''); setActionResult(null); setDeductAmount(1) }}
                                  className="px-2.5 py-1 rounded-md text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                                >
                                  扣减
                                </button>
                                <button
                                  onClick={() => { setUserAction({ type: 'disable', email: u.email }); setActionReason(''); setActionResult(null) }}
                                  className="px-2.5 py-1 rounded-md text-xs bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 transition-colors"
                                >
                                  禁用
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => { setUserAction({ type: 'delete', email: u.email }); setActionReason(''); setActionResult(null) }}
                              className="px-2.5 py-1 rounded-md text-xs bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan={8} className="py-12 text-center text-neutral-600">暂无用户数据</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 用户操作弹窗 */}
            {userAction && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { if (!actionLoading) setUserAction(null) }}>
                <div className="w-full max-w-md rounded-2xl border border-neutral-700 bg-[#141414] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                  <h3 className="text-sm font-semibold text-neutral-200 mb-1">
                    {userAction.type === 'deduct' && '扣减评估次数'}
                    {userAction.type === 'disable' && '禁用用户'}
                    {userAction.type === 'enable' && '解禁用户'}
                    {userAction.type === 'delete' && '删除用户'}
                  </h3>
                  <p className="text-xs text-neutral-500 mb-5">
                    目标用户：<span className="text-neutral-300 font-mono">{userAction.email}</span>
                  </p>

                  {userAction.type === 'deduct' && (
                    <div className="mb-4">
                      <label className="block text-xs text-neutral-500 mb-2">扣减次数</label>
                      <input
                        type="number"
                        value={deductAmount}
                        onChange={e => setDeductAmount(Math.max(1, Number(e.target.value)))}
                        min={1}
                        max={999}
                        className="w-full rounded-xl border border-neutral-700 bg-[#0f0f0f] px-4 py-2.5 text-sm text-white focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                  )}

                  <div className="mb-4">
                    <label className="block text-xs text-neutral-500 mb-2">操作原因</label>
                    <select
                      value={actionReason}
                      onChange={e => setActionReason(e.target.value)}
                      className="w-full rounded-xl border border-neutral-700 bg-[#0f0f0f] px-4 py-2.5 text-sm text-white focus:border-[#00F2EA] focus:outline-none"
                    >
                      <option value="">请选择原因...</option>
                      {userAction.type === 'deduct' && ['客户退款', '违规操作', '系统修正', '误发回收', '其他'].map(r => <option key={r} value={r}>{r}</option>)}
                      {userAction.type === 'disable' && ['违规封禁', '恶意使用', '用户要求', '其他'].map(r => <option key={r} value={r}>{r}</option>)}
                      {userAction.type === 'enable' && ['申诉成功', '误封解禁', '其他'].map(r => <option key={r} value={r}>{r}</option>)}
                      {userAction.type === 'delete' && ['用户要求删除', '垃圾账号', '测试数据', '其他'].map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>

                  {userAction.type === 'delete' && (
                    <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      此操作不可撤销，将永久删除该用户的所有数据
                    </div>
                  )}

                  {actionResult && (
                    <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${actionResult.success ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                      {actionResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                      {actionResult.msg}
                    </div>
                  )}

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={() => { setUserAction(null); setActionResult(null); setActionReason('') }}
                      disabled={actionLoading}
                      className="flex-1 rounded-xl border border-neutral-700 py-2.5 text-sm text-neutral-400 hover:text-neutral-200 disabled:opacity-50 transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleUserAction}
                      disabled={actionLoading || !actionReason}
                      className={`flex-1 rounded-xl font-semibold py-2.5 text-sm disabled:opacity-50 transition-colors flex items-center justify-center gap-2 ${
                        userAction.type === 'delete'
                          ? 'bg-red-500 text-white hover:bg-red-600'
                          : userAction.type === 'deduct'
                          ? 'bg-amber-500 text-black hover:bg-amber-400'
                          : userAction.type === 'disable'
                          ? 'bg-orange-500 text-black hover:bg-orange-400'
                          : 'bg-green-500 text-black hover:bg-green-400'
                      }`}
                    >
                      {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      确认{userAction.type === 'deduct' ? '扣减' : userAction.type === 'disable' ? '禁用' : userAction.type === 'enable' ? '解禁' : '删除'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════ Tab: 系统日志 ════════ */}
        {tab === 'logs' && (
          <div className="space-y-6">
            {/* 日志统计卡片 */}
            <div className="grid grid-cols-5 gap-3">
              {Object.entries(EVENT_LABELS).slice(0, 5).map(([type, cfg]) => {
                const count = logs.filter(l => l.eventType === type).length
                return (
                  <div key={type} className="rounded-xl border border-neutral-800 bg-[#141414] p-4">
                    <div className={`text-xs ${cfg.color} mb-1`}>{cfg.label}</div>
                    <div className="text-xl font-bold tabular-nums text-white">{count}</div>
                  </div>
                )
              })}
            </div>

            {/* 错误码分布（近30天） */}
            {stats?.overview.apiErrors?.byCode && stats.overview.apiErrors.byCode.length > 0 && (
              <div className="rounded-xl border border-red-900/30 bg-red-950/10 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  <div className="text-xs text-neutral-400">API 错误码分布（近 30 天）</div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {stats.overview.apiErrors.byCode.map(item => {
                    const maxCount = Math.max(...stats.overview.apiErrors!.byCode.map(c => c.count), 1)
                    const pct = Math.round((item.count / maxCount) * 100)
                    return (
                      <div key={item.code} className="rounded-lg border border-neutral-800 bg-[#141414] p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-red-400 font-mono text-xs">{item.code}</span>
                          <span className="text-neutral-300 tabular-nums text-sm font-bold">{item.count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#FF0050] to-red-400" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-neutral-800 bg-[#141414] overflow-hidden">
              <div className="p-6 pb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-neutral-300 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-amber-400" />
                    系统事件日志
                  </h3>
                  <span className="text-xs text-neutral-600">共 {logs.length} 条</span>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={logTypeFilter}
                    onChange={e => setLogTypeFilter(e.target.value)}
                    className="rounded-lg border border-neutral-700 bg-[#0f0f0f] px-3 py-1.5 text-xs text-neutral-300 focus:border-amber-400 focus:outline-none"
                  >
                    <option value="all">全部类型</option>
                    {Object.entries(EVENT_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                  <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-600" />
                    <input
                      type="text"
                      value={logFilter}
                      onChange={e => setLogFilter(e.target.value)}
                      placeholder="搜索邮箱/路径..."
                      className="w-48 rounded-lg border border-neutral-700 bg-[#0f0f0f] pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-neutral-600 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <button onClick={fetchLogs} className="text-xs text-neutral-500 hover:text-amber-400 flex items-center gap-1.5 transition-colors">
                    <RefreshCw className="h-3 w-3" />
                    刷新
                  </button>
                </div>
              </div>

              {logsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-neutral-500 border-y border-neutral-800 bg-[#0f0f0f]/50">
                        <th className="px-6 py-3 font-medium w-12">#</th>
                        <th className="px-6 py-3 font-medium">时间</th>
                        <th className="px-6 py-3 font-medium">事件类型</th>
                        <th className="px-6 py-3 font-medium">邮箱/用户</th>
                        <th className="px-6 py-3 font-medium">路径</th>
                        <th className="px-6 py-3 font-medium">IP哈希</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.map((log, i) => {
                        const ev = getEventLabel(log.eventType)
                        return (
                          <tr key={log.id} className="border-b border-neutral-800/30 hover:bg-neutral-800/20 transition-colors">
                            <td className="px-6 py-2.5 text-neutral-600 text-xs tabular-nums">{i + 1}</td>
                            <td className="px-6 py-2.5 text-neutral-400 text-xs whitespace-nowrap">{fmtTime(log.createdAt)}</td>
                            <td className="px-6 py-2.5"><span className={`text-xs font-medium ${ev.color}`}>{ev.label}</span></td>
                            <td className="px-6 py-2.5 text-neutral-300 text-xs">{log.email || log.username || '—'}</td>
                            <td className="px-6 py-2.5 text-neutral-500 text-xs font-mono">{log.path || '—'}</td>
                            <td className="px-6 py-2.5 text-neutral-600 text-xs font-mono">{log.ipHash ? log.ipHash.slice(0, 12) + '...' : '—'}</td>
                          </tr>
                        )
                      })}
                      {filteredLogs.length === 0 && (
                        <tr><td colSpan={6} className="py-12 text-center text-neutral-600">暂无日志数据</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════ Tab: 运营操作 ════════ */}
        {tab === 'ops' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 赠送评估次数 */}
            <div className="rounded-2xl border border-[#00F2EA]/20 bg-[#141414] p-6">
              <h3 className="text-sm font-semibold text-neutral-300 mb-5 flex items-center gap-2">
                <Zap className="h-4 w-4 text-[#00F2EA]" />
                赠送评估次数
              </h3>

              <div className="flex gap-3 mb-5">
                <button
                  onClick={() => setGrantMode('single')}
                  className={`px-4 py-2 rounded-lg text-sm border transition-colors ${grantMode === 'single' ? 'border-[#00F2EA] text-[#00F2EA] bg-[#00F2EA]/10' : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'}`}
                >
                  单个邮箱
                </button>
                <button
                  onClick={() => setGrantMode('batch')}
                  className={`px-4 py-2 rounded-lg text-sm border transition-colors ${grantMode === 'batch' ? 'border-[#00F2EA] text-[#00F2EA] bg-[#00F2EA]/10' : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'}`}
                >
                  批量赠送
                </button>
              </div>

              <div className="space-y-4">
                {grantMode === 'single' ? (
                  <div>
                    <label className="block text-xs text-neutral-500 mb-2">用户邮箱</label>
                    <input
                      type="email"
                      value={grantEmail}
                      onChange={e => setGrantEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="w-full rounded-xl border border-neutral-700 bg-[#0f0f0f] px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-[#00F2EA] focus:outline-none"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-neutral-500 mb-2">邮箱列表（每行一个或用逗号分隔）</label>
                    <textarea
                      value={grantBatchEmails}
                      onChange={e => setGrantBatchEmails(e.target.value)}
                      placeholder={'user1@example.com\nuser2@example.com'}
                      rows={4}
                      className="w-full rounded-xl border border-neutral-700 bg-[#0f0f0f] px-4 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-[#00F2EA] focus:outline-none resize-none"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-neutral-500 mb-2">赠送次数</label>
                    <input
                      type="number"
                      value={grantCredits}
                      onChange={e => setGrantCredits(Number(e.target.value))}
                      min={1}
                      max={100}
                      className="w-full rounded-xl border border-neutral-700 bg-[#0f0f0f] px-4 py-2.5 text-sm text-white focus:border-[#00F2EA] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-500 mb-2">赠送原因</label>
                    <select
                      value={grantReason}
                      onChange={e => setGrantReason(e.target.value)}
                      className="w-full rounded-xl border border-neutral-700 bg-[#0f0f0f] px-4 py-2.5 text-sm text-white focus:border-[#00F2EA] focus:outline-none"
                    >
                      {GRANT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleGrant}
                  disabled={grantLoading}
                  className="w-full rounded-xl bg-[#00F2EA] text-black font-semibold py-3 text-sm hover:bg-[#00D8D0] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {grantLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {grantLoading ? '正在赠送...' : '确认赠送'}
                </button>

                {grantResult && (
                  <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${grantResult.success ? 'bg-green-500/10 border border-green-500/20 text-green-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                    {grantResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                    {grantResult.msg}
                  </div>
                )}
              </div>
            </div>

            {/* 赠送历史 */}
            <div className="rounded-2xl border border-neutral-800 bg-[#141414] overflow-hidden">
              <div className="p-6 pb-4">
                <h3 className="text-sm font-semibold text-neutral-300 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-neutral-400" />
                  赠送历史记录
                </h3>
              </div>
              <div className="overflow-y-auto max-h-[420px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#141414] z-10">
                    <tr className="text-left text-xs text-neutral-500 border-b border-neutral-800">
                      <th className="px-6 py-3 font-medium">时间</th>
                      <th className="px-6 py-3 font-medium">邮箱</th>
                      <th className="px-6 py-3 font-medium text-right">次数</th>
                      <th className="px-6 py-3 font-medium">原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={i} className="border-b border-neutral-800/30">
                        <td className="px-6 py-2.5 text-neutral-500 text-xs whitespace-nowrap">{fmtTime(h.created_at)}</td>
                        <td className="px-6 py-2.5 text-neutral-300 text-xs">{h.target_email}</td>
                        <td className="px-6 py-2.5 text-right tabular-nums text-[#00F2EA] font-semibold">{h.credits}</td>
                        <td className="px-6 py-2.5 text-neutral-500 text-xs">{h.reason}</td>
                      </tr>
                    ))}
                    {history.length === 0 && (
                      <tr><td colSpan={4} className="py-12 text-center text-neutral-600">暂无赠送记录</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

// ── 组件 ──

function StatCard({ label, value, sub, icon, gradient, accent, border }: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  gradient: string
  accent: string
  border: string
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border ${border} bg-[#141414] p-5`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} pointer-events-none`} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-neutral-400">{label}</span>
          <span className={accent}>{icon}</span>
        </div>
        <div className="text-2xl font-bold tabular-nums text-white">{value}</div>
        {sub && <div className="text-xs text-neutral-500 mt-1">{sub}</div>}
      </div>
    </div>
  )
}

function ChartCard({ title, icon, children }: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-[#141414] p-6">
      <h3 className="text-sm font-semibold text-neutral-300 mb-5 flex items-center gap-2">
        <span className="text-neutral-500">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  )
}