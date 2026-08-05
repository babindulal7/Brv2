import { createContext, useContext, useState, ReactNode } from 'react'

export type Role = 'Owner' | 'Manager' | 'Coordinator' | 'Warehouse' | 'Technician' | 'Accounts' | 'Driver' | 'Client'

interface AuthUser {
  id: string
  name: string
  role: Role
  isSharedDevice: boolean
}

interface AuthContextType {
  user: AuthUser | null
  login: (user: AuthUser) => void
  logout: () => void
  isLocked: boolean
  setLocked: (locked: boolean) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  // Mock logged-in session — real auth is Phase 7 and not built yet.
  //
  // `role` is the switch for every capability check in the app (lib/rbac.ts).
  // Set it to 'Warehouse' to verify Foundation §8.3: money must vanish from the
  // DOM entirely — the Payment column, the Payment Due / Revenue KPI cards and
  // every deposit line are *omitted*, never masked or blurred. 'Owner' shows the
  // full money-visible app, which is what the reference mockups depict.
  // Set the whole user to null to see the login screen.
  const [user, setUser] = useState<AuthUser | null>({
    id: 'usr_1',
    name: 'Sita',
    role: 'Owner',
    isSharedDevice: true,
  })
  const [isLocked, setLocked] = useState(false)

  const login = (newUser: AuthUser) => setUser(newUser)
  const logout = () => {
    setUser(null)
    setLocked(false)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isLocked, setLocked }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
