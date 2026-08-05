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
  // Mock logged-in state for testing Phase 7 constraints.
  // Change to null to test login page, or change role to 'Warehouse' to test route gating.
  const [user, setUser] = useState<AuthUser | null>({
    id: 'usr_1',
    name: 'Sita',
    role: 'Warehouse', // Test RBAC
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
