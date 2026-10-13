import { createServer } from 'vite'

// QA-only watcher exclusions: an archive application creates locked temporary
// files in the repository while Vite is running. No app configuration changes.
const server = await createServer({
  mode: 'mock',
  cacheDir: 'node_modules/.vite-today-responsive',
  server: {
    host: '0.0.0.0',
    port: 3009,
    strictPort: true,
    watch: { usePolling: false, ignored: ['**/*.rartemp', '**/tmp/**', '**/artifacts/**'] },
  },
})
await server.listen()
server.printUrls()
