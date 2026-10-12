import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import type { IconName } from '../components/ui/Icon'
import type { PageActionItem } from '../components/ui/header/pageActionRegistry'

export interface PageHeaderSearchConfig {
  value: string
  onChange: (value: string) => void
  placeholder?: string | undefined
  onClear?: (() => void) | undefined
  onKeyDown?: ((e: React.KeyboardEvent<HTMLInputElement>) => void) | undefined
  ariaLabel?: string | undefined
  inputRef?: React.RefObject<HTMLInputElement> | undefined
}

export interface PageHeaderBulkSelection {
  count: number
  onClear: () => void
  actions: PageActionItem[]
}

export interface WorkspaceHeaderData {
  title: string
  leading?: ReactNode | undefined
  icon?: IconName | undefined
  status?: ReactNode | undefined
  eyebrow?: ReactNode | undefined
  description?: ReactNode | undefined
  breadcrumb?: ReactNode | undefined
  backHref?: string | undefined
  backLabel?: string | undefined
  onBack?: (() => void) | undefined
  unsavedChanges?: boolean | undefined
  isDirty?: boolean | undefined
  search?: PageHeaderSearchConfig | ReactNode | undefined
  actionsConfig?: PageActionItem[] | undefined
  workflowState?: string | undefined
  bulkSelection?: PageHeaderBulkSelection | undefined
  actions?: ReactNode | undefined
  module?: string | undefined
  creationContext?: Record<string, unknown> | undefined
  showAddMenu?: boolean | undefined
}

interface WorkspaceContextType {
  leftPanelElement: HTMLElement | null
  setLeftPanelElement: (el: HTMLElement | null) => void
  rightPanelElement: HTMLElement | null
  setRightPanelElement: (el: HTMLElement | null) => void
  headerActionsElement: HTMLElement | null
  setHeaderActionsElement: (el: HTMLElement | null) => void
  /** Opt-in slots: only pages that use these replace the shell's global search. */
  headerSearchElement: HTMLElement | null
  setHeaderSearchElement: (el: HTMLElement | null) => void
  hasPageSearch: boolean
  setHasPageSearch: (active: boolean) => void
  headerRightActionsElement: HTMLElement | null
  setHeaderRightActionsElement: (el: HTMLElement | null) => void
  hasPageRightActions: boolean
  setHasPageRightActions: (active: boolean) => void
  pageInfo: ReactNode | null
  setPageInfo: (info: ReactNode | null) => void
  headerData: WorkspaceHeaderData | null
  setHeaderData: (data: WorkspaceHeaderData | null) => void
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [leftPanelElement, setLeftPanelElement] = useState<HTMLElement | null>(null)
  const [rightPanelElement, setRightPanelElement] = useState<HTMLElement | null>(null)
  const [headerActionsElement, setHeaderActionsElement] = useState<HTMLElement | null>(null)
  const [headerSearchElement, setHeaderSearchElement] = useState<HTMLElement | null>(null)
  const [hasPageSearch, setHasPageSearch] = useState(false)
  const [hasPageRightActions, setHasPageRightActions] = useState(false)
  const [headerRightActionsElement, setHeaderRightActionsElement] = useState<HTMLElement | null>(null)
  const [pageInfo, setPageInfo] = useState<ReactNode | null>(null)
  const [headerData, setHeaderDataState] = useState<WorkspaceHeaderData | null>(null)

  const setHeaderData = useCallback((data: WorkspaceHeaderData | null) => {
    setHeaderDataState((prev) => {
      if (prev === data) return prev
      if (!prev || !data) return data
      if (
        prev.title === data.title &&
        prev.icon === data.icon &&
        prev.status === data.status &&
        prev.eyebrow === data.eyebrow &&
        prev.description === data.description &&
        prev.backHref === data.backHref &&
        prev.backLabel === data.backLabel &&
        prev.onBack === data.onBack &&
        prev.unsavedChanges === data.unsavedChanges &&
        prev.isDirty === data.isDirty &&
        prev.search === data.search &&
        prev.actionsConfig === data.actionsConfig &&
        prev.workflowState === data.workflowState &&
        prev.bulkSelection === data.bulkSelection &&
        prev.actions === data.actions &&
        prev.leading === data.leading &&
        prev.breadcrumb === data.breadcrumb &&
        prev.module === data.module &&
        prev.creationContext === data.creationContext &&
        prev.showAddMenu === data.showAddMenu
      ) {
        return prev
      }
      return data
    })
  }, [])

  return (
    <WorkspaceContext.Provider value={{
      leftPanelElement, setLeftPanelElement,
      rightPanelElement, setRightPanelElement,
      headerActionsElement, setHeaderActionsElement,
      headerSearchElement, setHeaderSearchElement, hasPageSearch, setHasPageSearch,
      headerRightActionsElement, setHeaderRightActionsElement,
      hasPageRightActions, setHasPageRightActions,
      pageInfo, setPageInfo,
      headerData, setHeaderData,
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
