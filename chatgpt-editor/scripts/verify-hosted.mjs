// Real hosted connection check. Secrets are supplied only through the process environment.
// `prepare` makes an isolated CSS-comment-only preview; it NEVER publishes main.
import { createHash, randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
const origin = 'https://coze-homepage-editor.cozmo-ca1.workers.dev';
const key = process.env.COZE_OWNER_CONNECTION_KEY;
delete process.env.COZE_OWNER_CONNECTION_KEY;
if (!key) throw Error('Provide the owner connection key through a protected process environment.');
const request = async (path, options = {}) => {
  const response = await fetch(new URL(path, origin), { ...options, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
  return response;
};
const assertStatus = async (r, expected) => { if (r.status !== expected) throw Error(`Connection check returned HTTP ${r.status}, expected ${expected}.`); };
const metadata = await (await request('/.well-known/oauth-authorization-server')).json();
const registration = await request('/oauth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
  client_name: 'COZE owner connection check', redirect_uris: ['http://127.0.0.1:8978/callback'], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
}) });
await assertStatus(registration, 201); const client = await registration.json();
const verifier = randomBytes(32).toString('base64url'); const challenge = createHash('sha256').update(verifier).digest('base64url');
const query = new URLSearchParams({ client_id: client.client_id, redirect_uri: client.redirect_uris[0], response_type: 'code', scope: 'homepage:read homepage:write', state: randomBytes(16).toString('hex'), code_challenge: challenge, code_challenge_method: 'S256', resource: `${origin}/mcp` });
let callback;
if (process.argv[2] === 'browser') {
  const { browserConsent } = await import('./browser-consent.mjs');
  callback = await browserConsent(`${origin}/authorize?${query}`, key, client.redirect_uris[0]);
} else {
const consent = await request(`/authorize?${query}`); await assertStatus(consent, 200);
const handle = /name="handle" value="([^"]+)"/.exec(await consent.text())?.[1]; if (!handle) throw Error('Consent form missing.');
const cookie = consent.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
const approval = await request('/authorize', { method: 'POST', headers: { origin, cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ handle, key, decision: 'approve' }).toString() });
await assertStatus(approval, 302); callback = new URL(approval.headers.get('location'));
}
if (callback.searchParams.get('state') !== query.get('state')) throw Error('OAuth state mismatch.');
const tokenResponse = await request('/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: client.client_id, redirect_uri: client.redirect_uris[0], code: callback.searchParams.get('code'), code_verifier: verifier, resource: `${origin}/mcp` }).toString() });
await assertStatus(tokenResponse, 200); const tokens = await tokenResponse.json();
async function tool(name, args = {}) {
  const r = await request('/mcp', { method: 'POST', headers: { authorization: `Bearer ${tokens.access_token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: randomBytes(8).toString('hex'), method: 'tools/call', params: { name, arguments: args } }) });
  await assertStatus(r, 200); const value = await r.json();
  if (value.error || value.result?.isError) throw Error(value.result?.content?.[0]?.text || 'MCP request failed.');
  return value.result.structuredContent;
}
try {
  const homepage = await tool('getHomepage');
  console.log(JSON.stringify({ authenticated: true, commit: homepage.commit, editableFiles: homepage.files.length }));
  let result;
  if (process.argv[2] === 'prepare') {
    const path = 'src/components/pages/HomePageV3.astro'; const file = await tool('getHomepageFile', { path });
    if (file.commit !== homepage.commit) throw Error('Main changed; retry the read.');
    const style = /<style\b[^>]*>/.exec(file.content)?.[0]; if (!style) throw Error('No homepage stylesheet found.');
    result = await tool('prepareHomepagePreview', { expectedCommit: homepage.commit, rationale: 'Verify the isolated editor connection; no visible homepage change and no production publication.', edits: [{ path, find: style, replace: `${style}\n/* COZE editor isolated connection test. */` }] });
  } else if (process.argv[2] === 'status') result = await tool('getHomepageChange', { changeId: process.argv[3] });
  if (result) {
    delete result._viewToken;
    await mkdir('generated', { recursive: true });
    await writeFile('generated/hosted-check.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  }
} finally {
  if (metadata.revocation_endpoint && new URL(metadata.revocation_endpoint).origin === origin) {
    await request(metadata.revocation_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: client.client_id, token: tokens.refresh_token || tokens.access_token }).toString() });
  }
}
