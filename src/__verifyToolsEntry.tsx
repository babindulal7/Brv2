/* TEMPORARY verification harness — delete after verifying Settings ▸ Tools. */
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import type { Role } from './lib/auth'
import { ThemeProvider, useTheme } from './lib/theme'
import './styles/theme.css'
import Tools from './modules/settings/Tools'

const ROLES: Role[] = ['Owner', 'Admin', 'Coordinator', 'Warehouse', 'Technician', 'Accounts', 'Driver', 'Client']

function Bar() {
  const { user, login } = useAuth()
  const theme = useTheme()
  return (
    <div id="verify-bar" style={{ padding: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <span data-role={user?.role}>role: {user?.role}</span>
      {ROLES.map((r) => (
        <button
          key={r}
          id={`role-${r}`}
          type="button"
          onClick={() => login({ id: 'u', name: 'Verify', role: r, isSharedDevice: false })}
        >
          {r}
        </button>
      ))}
      <button id="theme-toggle" type="button" onClick={theme.toggle}>
        theme: {theme.theme}
      </button>
    </div>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <AuthProvider>
    <ThemeProvider initial="dark">
      <BrowserRouter>
        <Bar />
        <div style={{ padding: 16, background: 'var(--bg)', minHeight: '100vh' }}>
          <Tools />
        </div>
      </BrowserRouter>
    </ThemeProvider>
  </AuthProvider>,
)
