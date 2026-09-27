/** Warm page code on navigation intent. This does not fetch or cache user data. */
const routes: Record<string, () => Promise<unknown>> = {
  '/dashboard': () => import('../modules/today/Today'),
  '/rentals': () => import('../modules/rentals/RentalsList'),
  '/rentals/new': () => Promise.all([
    import('../modules/rentals/RentalsList'), import('../modules/rentals/NewRental'),
  ]),
  '/operations': () => import('../modules/operations/OperationsQueues'),
  '/calendar': () => import('../modules/calendar/Calendar'),
  '/crew': () => import('../modules/crew/CrewBooking'),
  '/inventory': () => import('../modules/inventory/Inventory'),
  '/clients': () => import('../modules/clients/Clients'),
  '/finance': () => import('../modules/finance/Finance'),
  '/reports/pulse': () => import('../modules/reports/Pulse'),
  '/tools': () => import('../modules/tools/ToolsLanding'),
  '/settings': () => import('../modules/settings/Settings'),
}

export function installRoutePreload(
  target: Document = document,
  loaders: Record<string, () => Promise<unknown>> = routes,
): () => void {
  const requested = new Set<string>()
  const preload = (event: Event) => {
    if (!(event.target instanceof Element)) return
    const link = event.target.closest('a[href]')
    if (!link || link.hasAttribute('download')) return
    const url = new URL(link.getAttribute('href')!, target.baseURI)
    if (url.origin !== new URL(target.baseURI).origin) return
    const path = url.pathname === '/rentals' && url.searchParams.get('action') === 'new'
      ? '/rentals/new' : url.pathname
    const loader = loaders[path]
    if (!loader || requested.has(path)) return
    requested.add(path)
    // A speculative failure must not break navigation and may be retried.
    void Promise.resolve().then(loader).catch(() => requested.delete(path))
  }
  target.addEventListener('pointerover', preload)
  target.addEventListener('focusin', preload)
  target.addEventListener('pointerdown', preload)
  return () => {
    target.removeEventListener('pointerover', preload)
    target.removeEventListener('focusin', preload)
    target.removeEventListener('pointerdown', preload)
  }
}
