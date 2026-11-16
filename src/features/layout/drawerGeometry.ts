// Where the side drawers are heading, read from the DOM, for layout decisions that must not flip mid-slide.

/**
 * How much wider (+) or narrower (−) the stage will be once the side drawers have finished sliding: each
 * pushing drawer's current width less the width it is heading for (its `--drawer-w` when open, else 0).
 * Overlaying drawers (narrow screens) never change the stage, and at rest the answer is 0.
 */
export function pendingDrawerShift(): number {
  return [...document.querySelectorAll<HTMLElement>('[data-drawer]')].reduce((sum, el) => {
    const style = getComputedStyle(el)
    if (style.position === 'absolute') return sum
    const target = el.dataset.open === 'true' ? parseFloat(style.getPropertyValue('--drawer-w')) || 0 : 0
    return sum + el.getBoundingClientRect().width - target
  }, 0)
}
