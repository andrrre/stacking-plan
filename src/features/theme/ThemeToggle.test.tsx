import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeToggle } from './ThemeToggle'
import { THEME_KEY } from './themeStorage'

describe('ThemeToggle', () => {
  it('names the action, switches data-theme on <html> and saves the choice', async () => {
    render(<ThemeToggle />)
    const start = document.documentElement.dataset.theme
    expect(start === 'light' || start === 'dark').toBe(true)
    const other = start === 'dark' ? 'light' : 'dark'
    const button = screen.getByRole('button', { name: `Switch to ${other} theme` })
    await userEvent.click(button)
    expect(document.documentElement.dataset.theme).toBe(other)
    expect(localStorage.getItem(THEME_KEY)).toBe(JSON.stringify(other))
    expect(screen.getByRole('button', { name: `Switch to ${start} theme` })).toBe(button)
    await userEvent.click(button)
    expect(document.documentElement.dataset.theme).toBe(start)
  })
})
