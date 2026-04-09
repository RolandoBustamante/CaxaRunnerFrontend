import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import PublicView from './components/PublicView.jsx'

const isPublic = window.location.pathname === '/publico';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isPublic ? <PublicView /> : <App />}
  </StrictMode>,
)
