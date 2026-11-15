import { it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { App } from './App'

it('renders the product name and demo badge', () => {
  render(<App />)
  expect(screen.getByText('StackMatch')).toBeInTheDocument()
  expect(screen.getByTestId('demo-badge')).toHaveTextContent('Demo data')
})
