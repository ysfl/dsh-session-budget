/** Silent render guard: a component failure hides that surface instead of
 *  taking the conversation down with it. The host owns the fallback UI. */
import { Component, type ErrorInfo, type ReactElement, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Deliberately silent: this plugin must never be the reason a session looks
    // broken, and the browser console already carries the stack.
  }

  render(): ReactNode {
    return this.state.hasError ? null : this.props.children
  }
}
