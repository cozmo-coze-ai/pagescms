import { chromium } from '@playwright/test';

// Exercise the actual form and browser-generated headers. Never log the form
// body, authorization query, callback URL, cookies or credentials.
export async function browserConsent(authorizeUrl, key, callbackUrl, localHandler) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    if (localHandler) await page.route(`${new URL(authorizeUrl).origin}/**`, localHandler);
    await page.route(`${callbackUrl}*`, route => route.fulfill({ contentType: 'text/plain', body: 'Connection check complete.' }));
    const consent = await page.goto(authorizeUrl);
    if (consent.status() !== 200) throw Error(`Browser consent returned HTTP ${consent.status()}.`);
    await page.getByLabel('Your personal connection key').fill(key);
    const responsePromise = page.waitForResponse(r => new URL(r.url()).pathname === '/authorize' && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    const approval = await responsePromise;
    const origin = (await approval.request().allHeaders()).origin ?? '(missing)';
    console.log(JSON.stringify({ browserFormStatus: approval.status(), submittedOrigin: origin }));
    if (approval.status() !== 302) throw Error(`Browser sign-in failed with HTTP ${approval.status()}.`);
    const location = await approval.headerValue('location');
    if (!location?.startsWith(callbackUrl)) throw Error('Unexpected browser callback destination.');
    return new URL(location);
  } finally { await browser.close(); }
}
