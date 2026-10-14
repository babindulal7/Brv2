const esbuild = require('esbuild')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const root = path.resolve('artifacts/page-button-audit-2026-10-14/preview')
async function main() {
  await esbuild.build({ entryPoints: {app:'src/main.tsx'}, outdir:root, bundle:true, format:'esm', jsx:'automatic', sourcemap:false, define:{'import.meta.env':JSON.stringify({DEV:true,PROD:false,MODE:'mock',BASE_URL:'/',VITE_DATA_SOURCE:'mock',VITE_MOCK_SEEDED:'true'}),'process.env.NODE_ENV':'"development"'}, loader:{'.woff':'file','.woff2':'file','.png':'file','.svg':'file','.jpg':'file','.wasm':'file'} })
  fs.writeFileSync(path.join(root,'app.html'),'<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>')
  const publicRoot=path.resolve('public'), types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'}
  http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '');let file=path.resolve(root,name);if(path.relative(root,file).startsWith('..')){res.writeHead(403);res.end();return}if(!fs.existsSync(file)||fs.statSync(file).isDirectory()){const asset=path.resolve(publicRoot,name);file=!path.relative(publicRoot,asset).startsWith('..')&&fs.existsSync(asset)&&fs.statSync(asset).isFile()?asset:path.join(root,'app.html')}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res)}).listen(3023,'127.0.0.1',()=>console.log('Page audit preview http://127.0.0.1:3023'))
}
main().catch(e=>{console.error(e);process.exit(1)})
