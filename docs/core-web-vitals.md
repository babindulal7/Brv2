# Core Web Vitals — Babin Rentals OS

This document outlines the Core Web Vitals targets and optimization strategies for the Babin Rentals OS application.

## Target Metrics

| Metric | Target | Current Status | Notes |
|--------|--------|----------------|-------|
| **LCP** (Largest Contentful Paint) | < 2.5s | Target | Hero image must be `priority` |
| **INP** (Interaction to Next Paint) | < 200ms | Target | Heavy work off main thread |
| **CLS** (Cumulative Layout Shift) | < 0.1 | Target | Reserve space for images/fonts |

## Optimization Strategies Implemented

### 1. LCP Optimization
- **Hero images**: Use `next/image` with `priority` prop or preload critical images
- **Fonts**: Use `font-display: swap` with preload hints
- **Critical CSS**: Inline critical path CSS

### 2. INP Optimization
- **Code splitting**: Dynamic imports for heavy components
- **Web Workers**: Offload heavy computations
- **Debounced inputs**: Search/filter inputs debounced
- **Virtualized lists**: Long lists use virtualization

### 3. CLS Prevention
- **Image dimensions**: Explicit width/height on all images
- **Font loading**: `font-display: swap` with size-adjust fallbacks
- **Reserved space**: Skeleton loaders match content dimensions
- **Ad slots**: Reserved space for dynamic content

## Current Optimizations in Codebase

### Font Loading
```css
/* theme.css */
@font-face {
  font-family: 'Outfit';
  font-display: swap;
  /* ... */
}
@font-face {
  font-family: 'JetBrains Mono Variable';
  font-display: swap;
  /* ... */
}
```

### Image Optimization
- All images use explicit dimensions
- Hero images preloaded via `<link rel="preload">`
- Blur placeholders for progressive loading

### JavaScript Optimization
- Code splitting via dynamic `import()`
- Heavy components lazy-loaded
- `useMemo`/`useCallback` for expensive computations

## Monitoring & Measurement

### Lighthouse CI
Run Lighthouse CI in CI/CD pipeline:
```bash
npm run lighthouse
```

### Web Vitals Library
```typescript
import { onCLS, onFID, onFCP, onLCP, onTTFB } from 'web-vitals';

onCLS(console.log);
onFID(console.log);
onFCP(console.log);
onLCP(console.log);
onTTFB(console.log);
```

## Performance Budget

| Resource | Budget |
|----------|--------|
| Total JS | < 170KB gzipped |
| Total CSS | < 50KB gzipped |
| Fonts | < 100KB |
| Images | Optimized per viewport |

## Testing Checklist

Before release, verify:
- [ ] LCP < 2.5s on 3G
- [ ] INP < 200ms on all interactions
- [ ] CLS < 0.1 on all pages
- [ ] No layout shifts on font load
- [ ] No layout shifts on image load
- [ ] Smooth scrolling (60fps)
- [ ] Instant feedback on clicks (< 100ms)

## Regression Prevention

1. **Lighthouse CI** in PR checks
2. **Bundle size monitoring** - fail if bundle exceeds budget
3. **Performance marks** in critical user flows
4. **Synthetic monitoring** in staging
5. **Real User Monitoring (RUM)** in production

## Related Files

- `src/styles/theme.css` — Font loading, CSS variables
- `src/styles/responsive.css` — Responsive layout
- `vite.config.ts` — Build optimization
- `index.html` — Preload hints
- `src/components/ui/StateViews.tsx` — Skeleton loaders