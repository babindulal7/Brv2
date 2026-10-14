const esbuild = require('../../node_modules/esbuild');
const fs=require('node:fs');const path=require('node:path');
(async()=>{
 const dir=path.join(__dirname,'preview');
 await esbuild.build({entryPoints:{app:'src/main.tsx'},outdir:dir,bundle:true,format:'esm',jsx:'automatic',sourcemap:false,define:{'import.meta.env':JSON.stringify({DEV:true,PROD:false,MODE:'mock',BASE_URL:'/',VITE_DATA_SOURCE:'mock',VITE_MOCK_SEEDED:'true'}),'process.env.NODE_ENV':'"development"'},loader:{'.woff':'file','.woff2':'file','.png':'file','.svg':'file','.jpg':'file','.wasm':'file'}});
 fs.writeFileSync(path.join(dir,'app.html'),'<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>');console.log('Isolated populated preview built');
})().catch(e=>{console.error(e.message);process.exitCode=1});
