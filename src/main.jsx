import React from 'react'
import { createRoot } from 'react-dom/client'
import App, { OfflineBar, applyTheme } from './App.jsx'
import './styles.css'

applyTheme()

// A render crash shows a way back instead of a blank screen.
class Crash extends React.Component {
  state = { crashed: false }
  static getDerivedStateFromError() { return { crashed: true } }
  render() {
    if (!this.state.crashed) return this.props.children
    return <div className="empty" role="alert">Something went wrong.<br /><button className="btn mt" onClick={() => { history.replaceState({}, ''); location.reload() }}>Reload SplitIt</button></div>
  }
}

createRoot(document.getElementById('root')).render(<Crash><OfflineBar /><App /></Crash>)

// Service worker for push notifications (see public/sw.js).
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
