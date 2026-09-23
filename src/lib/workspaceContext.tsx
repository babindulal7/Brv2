import { createContext, useContext, useState, ReactNode } from 'react'

interface WorkspaceContextType {
  leftPanelElement: HTMLElement | null
  setLeftPanelElement: (el: HTMLElement | null) => void
  rightPanelElement: HTMLElement | null
  setRightPanelElement: (el: HTMLElement | null) => void
  headerActionsElement: HTMLElement | null
  setHeaderActionsElement: (el: HTMLElement | null) => void
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [leftPanelElement, setLeftPanelElement] = useState<HTMLElement | null>(null)
  const [rightPanelElement, setRightPanelElement] = useState<HTMLElement | null>(null)
  const [headerActionsElement, setHeaderActionsElement] = useState<HTMLElement | null>(null)

  return (
    <WorkspaceContext.Provider value={{
      leftPanelElement, setLeftPanelElement,
      rightPanelElement, setRightPanelElement,
      headerActionsElement, setHeaderActionsElement
    }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within a WorkspaceProvider')
  return ctx
}

/**
 * Portal helpers are also rendered by isolated page tests and Storybook-style
 * previews. In those environments there is deliberately no application shell;
 * treating the missing mount point as "not available" keeps the page itself
 * renderable without weakening the strict hook used by the live shell.
 */
export function useOptionalWorkspace() {
  return useContext(WorkspaceContext)
}
