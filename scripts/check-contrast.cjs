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
  /*
   * v4.1 bug, found on /dashboard by Lighthouse: `--muted` was only ever
   * checked against `--surface`. It is overwhelmingly painted on the app's
   * TINTED surfaces, and #6d7076 measured 4.48:1 on #eef4fb and 4.45:1 on
   * #edf3fa — under AA — while passing 4.97:1 on white. A token that passes
   * the gate and fails the screen is worse than no gate, because it reports
   * green. These four pairs are the ones that actually shipped broken.
   */
  chk(theme,T,'muted / surface-2 (tinted)','--muted','--surface-2',4.5)
  chk(theme,T,'muted / card2 (tinted)','--muted','--card2',4.5)
  chk(theme,T,'muted / bg (canvas)','--muted','--bg',4.5)
  chk(theme,T,'muted / inset2 (darkest)','--muted','--inset2',4.5)
  /*
   * The same class of bug in the DARK sidebar: `--nav-active-accent` paints
   * the ACTIVE destination on the rail, and #386af7 measured 4.30:1 on
   * #050b12. Where the app tells you where you are cannot be the faintest
   * text on the screen. Three backgrounds, because the accent is used as ink
   * both inside and outside the active pill.
   */
  chk(theme,T,'nav-active-accent / sidebar','--nav-active-accent','--sidebar',4.5)
  chk(theme,T,'nav-active-accent / nav-bg','--nav-active-accent','--nav-active-bg',4.5)
  chk(theme,T,'nav-active-accent / surface','--nav-active-accent','--surface',4.5)
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
