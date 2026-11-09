import { launchSeededApp, activate, login } from './e2e/support/app.fixture.ts';

const { app, page, closeMockServer } = await launchSeededApp();
try {
  await activate(page);
  await login(page);
  const main = page.locator('main.app-main');
  const previousContent = await main.innerText();
  const previousHash = await page.evaluate(() => window.location.hash);
  await page.evaluate((hash) => { window.location.hash = hash; }, '#/users');
  const deadline = Date.now() + 15_000;
  let interactive = 0;
  let heading = '';
  let pageContentChanged = previousHash === '#/users';
  let routeSpecificReady = false;
  let currentHash = '';
  while (Date.now() < deadline && (
    !interactive || !heading.includes('المستخدمون') || !pageContentChanged || !routeSpecificReady || currentHash !== '#/users'
  )) {
    interactive = await main.locator('button, input, select, a[href], [role="tab"]').count();
    const headings = main.locator('h1, h2, h3');
    if (interactive && await headings.count()) heading = (await headings.first().innerText()).trim();
    currentHash = await page.evaluate(() => window.location.hash);
    pageContentChanged = previousHash === '#/users' || (await main.innerText()) !== previousContent;
    routeSpecificReady = (await main.getByRole('tablist').getByRole('button', { name: 'المستخدمون', exact: true }).getAttribute('aria-selected')) === 'true';
    console.log({ interactive, heading, pageContentChanged, routeSpecificReady, currentHash, target: '#/users' });
    if (!interactive || !heading.includes('المستخدمون') || !pageContentChanged || !routeSpecificReady || currentHash !== '#/users') {
      await page.waitForTimeout(250);
    }
  }
  console.log('FINAL', { interactive, heading, pageContentChanged, routeSpecificReady, currentHash });
  console.log('URL', await page.evaluate(() => window.location.hash));
  console.log('TABS', JSON.stringify(await main.locator('[role="tablist"] button[role="tab"]').allTextContents()));
  console.log('SELECTED', JSON.stringify(await main.locator('[role="tablist"] button[role="tab"]').evaluateAll((nodes) => nodes.map((n) => ({ text: n.textContent, aria: n.getAttribute('aria-selected') })))));
} finally {
  await app.close();
  await closeMockServer();
}
