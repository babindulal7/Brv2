import { createServer } from 'vite'
process.env.VITE_DATA_SOURCE = 'mock'
process.env.VITE_MOCK_SEEDED = 'true'
const server = await createServer({ mode: 'mock', cacheDir: 'C:/Users/use/.codex-temp/new-rental-vite-cache', server: { port: 3008, host: '127.0.0.1', strictPort: true } })
await server.listen()
server.printUrls()
