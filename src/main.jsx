import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import PublicView from './components/PublicView.jsx'
import PublicResultsView from './components/PublicResultsView.jsx'
import PublicRegistrationView from './components/PublicRegistrationView.jsx'
import PaymentReviewView from './components/PaymentReviewView.jsx'

const isPublicTimer = window.location.pathname === "/publico" || /^\/timer\/[^/]+$/.test(window.location.pathname);
const isPublicResults = /^\/resultados\/[^/]+$/.test(window.location.pathname);
const isPublicRegistration = /^\/inscripciones\/[^/]+$/.test(window.location.pathname);
const isPaymentReview = /^\/validar-pago\/[^/]+$/.test(window.location.pathname);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isPublicTimer ? <PublicView /> : isPublicResults ? <PublicResultsView /> : isPublicRegistration ? <PublicRegistrationView /> : isPaymentReview ? <PaymentReviewView /> : <App />}
  </StrictMode>,
)
