const { chromium } = require('C:/Users/use/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')

async function run() {
  const directory = __dirname
  const log = fs.openSync(path.join(directory, 'mock-server.log'), 'w')
  const serverArguments = process.env.BROWSER_STATIC_MOCK === '1'
    ? ['node_modules/vite/bin/vite.js', 'preview', '--outDir', 'artifacts/scrape-adoption-2026-10-13/mock-dist', '--host', '127.0.0.1', '--port', '3037', '--strictPort']
    : ['node_modules/vite/bin/vite.js', '--mode', 'mock', '--host', '127.0.0.1', '--port', '3037', '--strictPort']
  const devServer = spawn(process.execPath, serverArguments, {
    cwd: path.resolve(directory, '../..'), windowsHide: true, stdio: ['ignore', log, log],
    env: { ...process.env, VITE_DATA_SOURCE: 'mock' },
  })
  const base = 'http://127.0.0.1:3037'
  let ready = false
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(base)).ok) { ready = true; break } } catch {}
    if (devServer.exitCode !== null) break
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!ready) { devServer.kill(); fs.closeSync(log); throw new Error('Isolated mock server did not start') }
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  const errors = []
  const failedRequests = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('requestfailed', request => failedRequests.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText }))
  // This origin is the separate Vite mock server launched for this test; it never uses live writes.
  const name = 'CSV verification client'
  const csv = 'name,phone,email,clientType,pan\n' +
    `${name},9899999123,csv-one@example.test,Individual,600111222\n` +
    `${name},9799999124,csv-two@example.test,Individual,600111223`
  try {
    await page.goto(`${base}/login`, { waitUntil: 'commit', timeout: 120000 })
    await page.getByRole('button', { name: 'Skip', exact: true }).click({ timeout: 120000 })
    await page.getByRole('button', { name: 'Owner', exact: true }).click({ timeout: 120000 })
    await page.goto(`${base}/clients?tab=import`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.locator('input[type=file]').waitFor({ state: 'attached', timeout: 30000 })
    await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-clients.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    const commit = page.getByRole('button', { name: 'Import 2 Clients', exact: true })
    await commit.waitFor({ timeout: 30000 })
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Import 2 Clients' && !b.disabled))
    await page.screenshot({ path: path.join(directory, 'import-desktop-preview.png'), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: path.join(directory, 'import-phone-preview.png'), fullPage: true })
    const width = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }))
    assert.ok(width.content <= width.viewport + 1, `Phone page overflows: ${JSON.stringify(width)}`)
    await commit.click()
    await page.getByText('2 of 2 clients confirmed saved.', { exact: false }).waitFor({ timeout: 30000 })
    assert.equal(await page.locator('a[href^="/clients/"]').count(), 2)
    await page.screenshot({ path: path.join(directory, 'import-phone-saved.png'), fullPage: true })
    await page.getByRole('button', { name: 'View Clients', exact: true }).click()
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`${base}/clients?q=${encodeURIComponent(name)}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.getByText(name, { exact: true }).first().waitFor({ timeout: 30000 })
    const occurrences = await page.getByText(name, { exact: true }).count()
    assert.ok(occurrences >= 2, 'Both equal-name, different-phone clients must survive reload')
    await page.goto(`${base}/clients?tab=import`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-clients.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await page.getByText('Possible duplicate of', { exact: false }).first().waitFor({ timeout: 30000 })
    assert.equal(await page.getByRole('button', { name: 'Import 0 Clients', exact: true }).isDisabled(), true)
    await page.screenshot({ path: path.join(directory, 'import-existing-duplicates.png'), fullPage: true })
    const result = { environment: 'isolated mock origin', imported: 2, retainedAfterReload: occurrences, repeatedImportBlocked: true, phoneWidth: width, pageErrors: errors }
    fs.writeFileSync(path.join(directory, 'browser-result.json'), JSON.stringify(result, null, 2))
    assert.deepEqual(errors, [])
    console.log(JSON.stringify(result))
  } catch (error) {
    await page.screenshot({ path: path.join(directory, 'failure.png'), fullPage: true })
    const failure = { url: page.url(), visibleText: (await page.locator('body').innerText()).slice(0, 5000), pageErrors: errors, failedRequests, error: String(error) }
    fs.writeFileSync(path.join(directory, 'browser-failure.json'), JSON.stringify(failure, null, 2))
    console.log(JSON.stringify(failure))
    throw error
  } finally { await browser.close(); devServer.kill(); fs.closeSync(log) }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
