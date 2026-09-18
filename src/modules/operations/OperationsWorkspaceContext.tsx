import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { BookingStatus, JobName } from '../../lib/workflow'
import OperationsShell from './OperationsShell'

interface OpenWorkspace { bookingNo: string; bookingStatus: BookingStatus; job: JobName }
interface OperationsWorkspaceValue {
  openOperations: (bookingNo: string, bookingStatus: BookingStatus, job: JobName) => void
  closeOperations: () => void
}
const OperationsWorkspaceContext = createContext<OperationsWorkspaceValue | null>(null)

export function OperationsWorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<OpenWorkspace | null>(null)
  const closeOperations = useCallback(() => setWorkspace(null), [])
  const openOperations = useCallback((bookingNo: string, bookingStatus: BookingStatus, job: JobName) => setWorkspace({ bookingNo, bookingStatus, job }), [])
  const value = useMemo(() => ({ openOperations, closeOperations }), [closeOperations, openOperations])
  return <OperationsWorkspaceContext.Provider value={value}>
    {children}
    {workspace && <OperationsShell isOpen bookingNo={workspace.bookingNo} bookingStatus={workspace.bookingStatus} initialJob={workspace.job} onClose={closeOperations} />}
  </OperationsWorkspaceContext.Provider>
}

export function useOperationsWorkspace(): OperationsWorkspaceValue {
  const value = useContext(OperationsWorkspaceContext)
  if (!value) throw new Error('useOperationsWorkspace must be used inside OperationsWorkspaceProvider')
  return value
}
