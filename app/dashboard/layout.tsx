import React from 'react'
import { DashboardDataProvider } from '@/components/dashboard/dashboard-data'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardDataProvider>
      {children}
    </DashboardDataProvider>
  )
}
