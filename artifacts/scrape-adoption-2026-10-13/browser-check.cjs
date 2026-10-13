const { chromium } = require('C:/Users/use/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')

async function run() {
  const directory = __dirname
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const base = 'http://127.0.0.1:3037'
  // This origin is the separate Vite mock server launched for this test; it never uses live writes.
  const name = 'CSV verification client'
  const csv = 'name,phone,email,clientType,pan\n' +
    `${name},9899999123,csv-one@example.test,Individual,600111222\n` +
    `${name},9799999124,csv-two@example.test,Individual,600111223`
  try {
    await page.goto(`${base}/clients?tab=import`)
    await page.getByText('Import Clients', { exact: true }).first().waitFor({ timeout: 60000 })
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
    assert.equal(await page.locator('a').filter({ hasText: /^C-/ }).count(), 2)
    await page.screenshot({ path: path.join(directory, 'import-phone-saved.png'), fullPage: true })
    await page.getByRole('button', { name: 'View Clients', exact: true }).click()
    await page.goto(`${base}/clients?q=${encodeURIComponent(name)}`)
    await page.getByText(name, { exact: true }).first().waitFor({ timeout: 30000 })
    const occurrences = await page.getByText(name, { exact: true }).count()
    assert.ok(occurrences >= 2, 'Both equal-name, different-phone clients must survive reload')
    await page.goto(`${base}/clients?tab=import`)
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
    console.log(JSON.stringify({ url: page.url(), visibleText: (await page.locator('body').innerText()).slice(0, 5000), pageErrors: errors }))
    throw error
  } finally { await browser.close() }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
