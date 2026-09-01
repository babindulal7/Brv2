/* v4.1 §7.8 release gate, run against the SHIPPED theme.css.
   Parses the real file so this measures what merged, not what was intended. */
const fs=require('fs')
const css=fs.readFileSync(require('path').join(__dirname,'..','src','styles','theme.css'),'utf8').replace(/\r\n/g,'\n')

function block(sel){
  const i=css.indexOf(sel); if(i<0) throw new Error('missing '+sel)
  const s=css.indexOf('{',i), e=css.indexOf('\n}',s)
  const out={}
  for(const m of css.slice(s,e).matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]]=m[2]
  return out
}
/* v4.2 §2.1 flipped the default: bare :root now carries the LIGHT values and
   dark is the addressed theme. The selectors here mirror theme.css exactly —
   this gate parses the shipped file, so it must track the shipped shape. */
const D=block(":root[data-theme='dark'] {")
const L=block(":root,\n:root[data-theme='light'] {")

function srgb(c){c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4)}
function lum(x){const h=x.replace('#','')
 return 0.2126*srgb(parseInt(h.slice(0,2),16))+0.7152*srgb(parseInt(h.slice(2,4),16))+0.0722*srgb(parseInt(h.slice(4,6),16))}
function ratio(a,b){const l1=lum(a),l2=lum(b);return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)}

let fails=0,n=0
function chk(theme,T,label,fg,bg,need){
  const f=T[fg],b=T[bg]
  if(!f||!b){console.log(`MISS  ${theme} ${label}: ${fg}=${f} ${bg}=${b}`);fails++;return}
  const r=ratio(f,b); n++
  const ok=r>=need; if(!ok)fails++
  console.log(`${ok?'PASS':'FAIL'} ${r.toFixed(2).padStart(6)}:1 (>=${need})  ${theme} ${label.padEnd(28)} ${f} on ${b}`)
}
for(const [theme,T] of [['DARK ',D],['LIGHT',L]]){
  // §7.8: every on-colour on its hue
  chk(theme,T,'on-primary / primary','--on-primary','--primary',4.5)
  chk(theme,T,'on-success / success','--on-success','--success',4.5)
  chk(theme,T,'on-danger / danger','--on-danger','--danger',4.5)
  chk(theme,T,'on-warn / warn','--on-warn','--warn',4.5)
  chk(theme,T,'on-ready / ready','--on-ready','--ready',4.5)
  chk(theme,T,'on-neutral / neutral','--on-neutral','--neutral',4.5)
  chk(theme,T,'on-dim / dim','--on-dim','--dim',4.5)
  // §7.8: --text-2 (= --muted) on --surface, and the body ink
  chk(theme,T,'muted(text-2) / surface','--muted','--surface',4.5)
  chk(theme,T,'text / surface','--text','--surface',4.5)
  chk(theme,T,'text2 / surface','--text2','--surface',4.5)
  // §7.8: --ext text on both backgrounds
  chk(theme,T,'ext-fg / surface','--ext-fg','--surface',4.5)
  chk(theme,T,'ext-fg / bg','--ext-fg','--bg',4.5)
  chk(theme,T,'ext-line / surface (3:1)','--ext-line','--surface',3.0)
  // v4.2 §3 — the gold outline on the CANVAS gradient's darker stop. This is
  // the warning the spec ships with the cream canvas: the mark must stay
  // legible on it, and #af903a measured 2.70:1 there before the fix.
  chk(theme,T,'ext-line / bg-gradient-1 (3:1)','--ext-line','--bg-gradient-1',3.0)
  // status text-safe variants used as micro-copy on cards
  chk(theme,T,'primary-text / surface','--primary-text','--surface',4.5)
  chk(theme,T,'success-text / surface','--success-text','--surface',4.5)
  chk(theme,T,'danger-text / surface','--danger-text','--surface',4.5)
  chk(theme,T,'warn-text / surface','--warn-text','--surface',4.5)
  chk(theme,T,'ready-text / surface','--ready-text','--surface',4.5)
  // primary button ink
  chk(theme,T,'btn-primary fg/bg','--btn-primary-fg','--btn-primary-bg',4.5)
  console.log('')
}
console.log(`${n-fails}/${n} pass, ${fails} FAIL`)
process.exit(fails?1:0)
