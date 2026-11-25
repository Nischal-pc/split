import React from 'react'
import { createRoot } from 'react-dom/client'
import App, { OfflineBar } from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(<><OfflineBar /><App /></>)

// Service worker for push notifications (see public/sw.js).
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
