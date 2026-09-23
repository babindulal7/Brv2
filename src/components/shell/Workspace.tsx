import { ReactNode } from 'react'

interface WorkspaceProps {
  /** The main application navigation (e.g., Sidebar) */
  navigation: ReactNode
  /** Left side panel (e.g., Filters) */
  leftPanel?: ReactNode
  /** Right side panel (e.g., Actions) */
  rightPanel?: ReactNode
  /** Main content area */
  children: ReactNode
}

/**
 * Global Workspace container handling the horizontal reflow of panels.
 * Ensures the main content dynamically shrinks when panels open,
 * preserving alignment and width token constraints.
 */
export function Workspace({ navigation, leftPanel, rightPanel, children }: WorkspaceProps) {
  return (
    <div
      className="app-workspace"
      style={{
        display: 'flex',
        flex: 1,
        minHeight: 0, // critical for nested scrolling
        height: 'calc(100dvh - var(--global-header-height))',
        position: 'relative',
        width: '100%',
        overflow: 'hidden', // prevent the document body from growing
      }}
    >
      {navigation}
      
      {leftPanel}
      
      <main
        className="app-workspace-main"
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'auto',
          position: 'relative',
          // Padding matches the legacy App.tsx <main> structure
          padding: 'var(--page-padding)',
        }}
      >
        {children}
      </main>

      {rightPanel}
    </div>
  )
}
