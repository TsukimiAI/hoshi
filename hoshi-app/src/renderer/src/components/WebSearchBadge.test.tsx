import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WebSearchBadge } from './WebSearchBadge'

describe('WebSearchBadge', () => {
  it('renders default label', () => {
    render(<WebSearchBadge />)
    expect(screen.getByText('本次已联网')).toBeInTheDocument()
  })

  it('renders custom label', () => {
    render(<WebSearchBadge label="本次将联网" />)
    expect(screen.getByText('本次将联网')).toBeInTheDocument()
  })
})
