/**
 * Credits system — shared types, constants, and pure helpers.
 * No fs / localStorage / window references here — safe for both server and client.
 */

import { getServerDict } from '@/lib/i18n/server'

export interface CreditBalance {
  email: string
  credits: number
  totalPurchased: number
  purchases: Array<{
    packageId: string
    credits: number
    amount: number       // USD
    purchasedAt: number  // epoch ms
    paymentId?: string   // Creem checkout/order id in production
  }>
  verifiedAt: number
}

export interface CreditPackage {
  id: 'pack1' | 'pack6' | 'pack30'
  label: string
  credits: number
  price: number       // USD
  perUnit: string     // display, derived from price/credits
  badge?: string
  highlight?: boolean
}

const dict = getServerDict()

// 套餐定义（perUnit 由 price/credits 动态派生，不再手算硬编码，保证与价格改动一致）
const RAW_PACKAGES: Array<Omit<CreditPackage, 'perUnit'>> = [
  { id: 'pack1', label: dict.creditPackages.pack1.label, credits: 1, price: 9 },
  { id: 'pack6', label: dict.creditPackages.pack6.label, credits: 6, price: 29, badge: dict.creditPackages.pack6.badge, highlight: true },
  { id: 'pack30', label: dict.creditPackages.pack30.label, credits: 30, price: 99 },
]

export const CREDIT_PACKAGES: CreditPackage[] = RAW_PACKAGES.map(p => ({
  ...p,
  perUnit: `$${(p.price / p.credits).toFixed(2)} ${dict.home.pricing.perEvaluation}`,
}))

/** 单次评估单价（USD），用于节省比例计算 */
export function unitPrice(pkg: CreditPackage): number {
  return pkg.credits > 0 ? pkg.price / pkg.credits : pkg.price
}

/** 相对 pack1（单次 $9）的节省百分比；pack1 本身返回 null */
export function savePct(pkg: CreditPackage): number | null {
  if (pkg.id === 'pack1') return null
  const anchor = CREDIT_PACKAGES.find(p => p.id === 'pack1')
  if (!anchor || anchor.credits <= 0) return null
  const anchorUnit = anchor.price / anchor.credits
  if (anchorUnit <= 0) return null
  return Math.round((1 - unitPrice(pkg) / anchorUnit) * 100)
}

export function findPackage(id: string): CreditPackage | undefined {
  return CREDIT_PACKAGES.find(p => p.id === id)
}