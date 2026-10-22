/** @vitest-environment happy-dom */
import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEMO_RESULT } from '@/lib/demo-data'
import en from '@/lib/i18n/dictionaries/en'

const { drawShareCard } = vi.hoisted(() => ({ drawShareCard: vi.fn() }))
vi.mock('../share-canvas', () => ({ drawShareCard }))
vi.mock('../ui/SectionHeader', () => ({ SectionHeader: () => null }))

import { ShareCardSection } from './ShareCardSection'

describe('ShareCardSection', () => {
  it('draws the share card when the report appears so page exports include it', async () => {
    render(
      <ShareCardSection
        result={DEMO_RESULT}
        dict={en}
        isPremium
        labels={{ title: 'Share Card', subtitle: 'Save your result.', download: 'Export PNG' }}
      />,
    )

    await waitFor(() => expect(drawShareCard).toHaveBeenCalledOnce())
  })
})
