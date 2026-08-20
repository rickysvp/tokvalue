/** @vitest-environment happy-dom */
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Sidebar } from '../Sidebar'

beforeEach(() => { cleanup() })
afterEach(() => { cleanup() })

describe('Sidebar nav items', () => {
  it('shows 4 primary links', () => {
    render(<Sidebar current="home" />)
    expect(screen.getAllByText(/Home/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Growth/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Reports/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Profile/).length).toBeGreaterThan(0)
  })
  it('marks Home active with blue tint', () => {
    render(<Sidebar current="home" />)
    const homeLinks = screen.getAllByText(/Home/)
    const withBlue = homeLinks.some(el => {
      const anchor = el.closest('a') || el.parentElement
      return anchor?.className?.match(/1d4ed8/)
    })
    expect(withBlue).toBe(true)
  })
})
