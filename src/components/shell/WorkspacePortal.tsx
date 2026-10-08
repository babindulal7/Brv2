import { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useOptionalWorkspace } from '../../lib/workspaceContext'

export function WorkspaceLeftPanel({ children }: { children: ReactNode }) {
  const workspace = useOptionalWorkspace()
  if (!workspace) return <>{children}</>
  const { leftPanelElement } = workspace
  if (!leftPanelElement) return null
  return createPortal(children, leftPanelElement)
}

export function WorkspaceRightPanel({ children }: { children: ReactNode }) {
  const workspace = useOptionalWorkspace()
  if (!workspace) return <>{children}</>
  const { rightPanelElement } = workspace
  if (!rightPanelElement) return null
  return createPortal(children, rightPanelElement)
}

export function WorkspaceHeaderActions({ children }: { children: ReactNode }) {
  const workspace = useOptionalWorkspace()
  if (!workspace) return <>{children}</>
  const { headerActionsElement } = workspace
  if (!headerActionsElement) return null
  return createPortal(children, headerActionsElement)
}
