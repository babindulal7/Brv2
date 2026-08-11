import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

/* Self-hosted, same families the ops app already ships — no CDN font request
   blocking first paint on a page whose whole job is first impressions. */
import '@fontsource/outfit/500.css'
import '@fontsource/outfit/600.css'
import '@fontsource/outfit/700.css'
import '@fontsource/source-sans-3/400.css'
import '@fontsource/source-sans-3/600.css'

import './marketing.css'
import MarketingPage from './MarketingPage'

const el = document.getElementById('marketing-root')
if (!el) throw new Error('marketing-root missing from marketing.html')

createRoot(el).render(
  <StrictMode>
    <MarketingPage />
  </StrictMode>,
)
