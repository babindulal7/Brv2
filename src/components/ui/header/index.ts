/**
 * src/components/ui/header/index.ts — Babin Rentals OS
 * Public exports for Universal Page Header Standard.
 */

export { PageHeader, type PageHeaderProps, type PageHeaderSearchConfig, type PageHeaderBulkSelection } from './PageHeader'
export {
  type PageActionItem,
  type PageActionPriority,
  type PageActionConfirmConfig,
  type PageActionDropdownItem,
  type PageActionContext,
  type ResolvedPageActions,
  resolvePageActions,
  isActionVisible,
  isActionEnabled,
} from './pageActionRegistry'
