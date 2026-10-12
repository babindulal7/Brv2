import { ReactNode, useLayoutEffect } from 'react'
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

/** Page-only search replaces the global command-palette search without adding a header. */
export function WorkspaceHeaderSearch({ children }: { children: ReactNode }) {
  const workspace = useOptionalWorkspace()
  const setActive = workspace?.setHasPageSearch
  useLayoutEffect(() => {
    if (!setActive) return
    setActive(true)
    return () => setActive(false)
  }, [setActive])
  if (!workspace) return <>{children}</>
  return workspace.headerSearchElement ? createPortal(children, workspace.headerSearchElement) : null
}

/** Opt-in right-side actions in the original, fixed-height application header. */
export function WorkspaceHeaderRightActions({ children }: { children: ReactNode }) {
  const workspace = useOptionalWorkspace()
  const setActive = workspace?.setHasPageRightActions
  // RULING 2026-10-12: page actions own the header before the browser paints.
  useLayoutEffect(() => {
    if (!setActive) return
    setActive(true)
    return () => setActive(false)
  }, [setActive])
  if (!workspace) return <>{children}</>
  return workspace.headerRightActionsElement ? createPortal(children, workspace.headerRightActionsElement) : null
}

