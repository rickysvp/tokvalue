import { describe, expect, it } from 'vitest'

describe('production Content Security Policy', () => {
  it('allows WebAssembly compilation without enabling general JavaScript eval', async () => {
    const { default: nextConfig } = await import('./next.config.mjs')
    const entries = await nextConfig.headers!()
    const csp = entries[0].headers.find(header => header.key === 'Content-Security-Policy')?.value

    expect(csp).toContain("'wasm-unsafe-eval'")
    expect(csp).not.toContain("'unsafe-eval'")
  })
})
