import type { HTMLAttributes, ReactNode } from 'react'

/** Layout only. Data loading, permissions and errors remain owned by PageBody. */
export interface PageShellProps extends HTMLAttributes<HTMLDivElement> {
  width?: 'full' | 'form' | 'settings'
  header?: ReactNode
  toolbar?: ReactNode
  summary?: ReactNode
}

export function PageShell({ width = 'full', header, toolbar, summary, children, className, ...props }: PageShellProps) {
  return (
    <div className={['page-shell', `page-shell--${width}`, 'animate-entrance', className].filter(Boolean).join(' ')} {...props}>
      {header}
      {toolbar}
      {summary}
      {children}
    </div>
  )
}

/** A normal labeled group: native tab navigation, not an ARIA toolbar that
 * promises arrow-key roving focus for arbitrary children. */
export function Toolbar({ children, actions, label = 'Page controls' }: {
  children?: ReactNode
  actions?: ReactNode
  label?: string
}) {
  return (
    <div className="page-toolbar" role="group" aria-label={label}>
      {children}
      {actions && <div className="page-toolbar__actions">{actions}</div>}
    </div>
  )
}

export { PageHeader } from './Page'
export { PageActions } from './PageActions'
