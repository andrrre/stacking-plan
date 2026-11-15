import { Component, type ReactNode } from 'react'
import { resetUrl } from './resetUrl'
import styles from './ErrorBoundary.module.css'

type Props = { children: ReactNode; reload?: (url: string) => void }

/** Top-level catch for render errors: a short message instead of a blank page. Does not log (React already does). */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  private reset = () => {
    const url = resetUrl(window.location.pathname, window.location.search)
    const reload = this.props.reload ?? ((u: string) => window.location.assign(u))
    reload(url)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className={styles.box} role="alert">
        <h1 className={styles.title}>Something went wrong</h1>
        <p className={styles.text}>The view could not be shown. Reset it to start again from the default view.</p>
        <button type="button" className={styles.button} onClick={this.reset}>Reset view</button>
      </div>
    )
  }
}
