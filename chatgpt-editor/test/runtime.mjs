// End-to-end local OAuth + MCP + Durable Object test. Synthetic credentials only.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createHash, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { browserConsent } from '../scripts/browser-consent.mjs';

const origin = 'https://editor.example.test';
const key = randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('hex');
const supplemental=process.env.COZE_TEST_ADDITIONAL_MEMBER==='1';
const alice={id:'alice',name:'Alice',enabled:true,keyHash:hash(key)};
const testDatabase=process.env.CMS_TEST_DATABASE_URL;
if(testDatabase){const u=new URL(testDatabase);if(u.hostname!=='127.0.0.1'||u.port!=='55441'||u.pathname!=='/coze_itinerary_test')throw Error('Refusing a non-test database');const {Client}=await import('pg');const sql=new Client({connectionString:testDatabase});await sql.connect();await sql.query('UPDATE public."user" SET role=$1 WHERE id=$2',['editor','alice-db']);await sql.end();}
const mf = new Miniflare(convertV4MiniflareOptions({ name: 'test-editor', modules: true, scriptPath: 'dist/index.js', compatibilityDate: '2026-09-24', compatibilityFlags: ['nodejs_compat', 'global_fetch_strictly_public'],
  kvNamespaces: ['OAUTH_KV'], durableObjects: { EDITOR: { className: 'EditorStore', useSQLite: true } },
  ...(testDatabase?{hyperdrives:{CMS_DATABASE:testDatabase}}:{}),
  bindings: { PUBLIC_ORIGIN: origin, GITHUB_TOKEN: 'synthetic-github-token', PREVIEW_HOST_SUFFIX: 'example.workers.dev', TEAM_MEMBERS_JSON: JSON.stringify(supplemental?[{id:'existing',name:'Existing',enabled:true,keyHash:hash('existing-synthetic-key')}]:[alice]),ITINERARY_EDITORS_JSON:JSON.stringify(supplemental?{}:{alice:'alice-db'}),ADDITIONAL_EDITORS_JSON:JSON.stringify(supplemental?[{...alice,cmsUserId:'alice-db'}]:[]) },
  outboundService: request => {
    const url = new URL(request.url);
    if(url.hostname==='www.coze.care')return new Response('Not published',{status:404});
    assert.equal(url.hostname, 'api.github.com');
    assert.equal(request.headers.get('authorization'), 'Bearer synthetic-github-token');
    if (url.pathname.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: 'a'.repeat(40) } });
    if (url.pathname.includes('/contents/public/')) return Response.json([]);
    return new Response('Unexpected test request', { status: 500 });
  },
}));
try {
  const fetch = (url, options) => mf.dispatchFetch(new URL(url, origin), options);
  const noAuth = await fetch('/mcp', { method: 'POST' });
  assert.equal(noAuth.status, 401);
  const metadata = await fetch('/.well-known/oauth-protected-resource/mcp');
  assert.equal(metadata.status, 200);
  assert.deepEqual((await metadata.json()).scopes_supported, ['homepage:read']);
  const register = await fetch('/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Test ChatGPT', redirect_uris: ['https://chatgpt.com/connector_platform/oauth/callback'], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }) });
  assert.equal(register.status, 201);
  const client = await register.json();
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const query = new URLSearchParams({ client_id: client.client_id, redirect_uri: client.redirect_uris[0], response_type: 'code', scope: 'homepage:read homepage:write'+(testDatabase?' itineraries:read itineraries:write':''), state: 'test-state', code_challenge: challenge, code_challenge_method: 'S256', resource: `${origin}/mcp` });
  const consent = await fetch(`/authorize?${query}`);
  assert.equal(consent.status, 200);
  const html = await consent.text();
  const handle = /name="handle" value="([^"]+)"/.exec(html)?.[1]; assert.ok(handle);
  const cookie = consent.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  // Keep cross-origin protection: fixing browser headers must not permit
  // null, absent, foreign or merely same-site sibling origins.
  for (const untrusted of [null, 'null', 'https://attacker.example.test', 'https://chatgpt.com']) {
    const rejected = await fetch('/authorize', { method: 'POST', headers: { ...(untrusted === null ? {} : { origin: untrusted }), cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ handle, key, decision: 'approve' }).toString(), redirect: 'manual' });
    assert.equal(rejected.status, 403);
  }
  // Actual native form submit; the browser, not this test, supplies Origin.
  const redirect = await browserConsent(`${origin}/authorize?${query}`, key, client.redirect_uris[0], async route => {
    const browserRequest = route.request();
    const response = await mf.dispatchFetch(browserRequest.url(), {
      method: browserRequest.method(), headers: await browserRequest.allHeaders(),
      ...(browserRequest.method() === 'POST' ? { body: browserRequest.postData() } : {}), redirect: 'manual',
    });
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  assert.equal(redirect.searchParams.get('state'), 'test-state');
  const exchangeBody = { grant_type: 'authorization_code', client_id: client.client_id, redirect_uri: client.redirect_uris[0], code: redirect.searchParams.get('code'), code_verifier: verifier, resource: `${origin}/mcp` };
  const tokenResponse = await fetch('/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(exchangeBody).toString() });
  assert.equal(tokenResponse.status, 200, await tokenResponse.clone().text());
  let token = await tokenResponse.json(); assert.ok(token.access_token);
  // A later scope upgrade in the same browser still requires visible consent,
  // but must not ask the member to type their connection key again.
  const rememberedQuery = new URLSearchParams(query);
  rememberedQuery.set('state', 'remember-first');
  const firstConsent = await fetch(`/authorize?${rememberedQuery}`);
  assert.equal(firstConsent.status, 200);
  const firstHandle = /name="handle" value="([^"]+)"/.exec(await firstConsent.text())?.[1]; assert.ok(firstHandle);
  const firstCookie = firstConsent.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const firstApproval = await fetch('/authorize', { method: 'POST', headers: { origin, cookie: firstCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ handle: firstHandle, key, decision: 'approve' }).toString(), redirect: 'manual' });
  assert.equal(firstApproval.status, 302);
  const browserCookie = firstApproval.headers.getSetCookie().find(c => c.startsWith('__Host-coze_editor_session='))?.split(';')[0];
  assert.ok(browserCookie, 'successful sign-in must remember this browser');
  const upgradedQuery = new URLSearchParams(query);
  upgradedQuery.set('state', 'remember-upgrade');
  upgradedQuery.set('scope', 'homepage:read homepage:write itineraries:read itineraries:write');
  const upgradeConsent = await fetch(`/authorize?${upgradedQuery}`, { headers: { cookie: browserCookie } });
  assert.equal(upgradeConsent.status, 200);
  const upgradeHtml = await upgradeConsent.text();
  assert.ok(upgradeHtml.includes('Signed in on this browser as'));
  assert.ok(upgradeHtml.includes('itineraries:write'));
  assert.ok(!upgradeHtml.includes('name="key"'));
  const upgradeHandle = /name="handle" value="([^"]+)"/.exec(upgradeHtml)?.[1]; assert.ok(upgradeHandle);
  const upgradeCookie = [browserCookie, ...upgradeConsent.headers.getSetCookie().map(c => c.split(';')[0])].join('; ');
  const rejectedUpgrade = await fetch('/authorize', { method: 'POST', headers: { origin: 'https://attacker.example.test', cookie: upgradeCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ handle: upgradeHandle, decision: 'approve' }).toString(), redirect: 'manual' });
  assert.equal(rejectedUpgrade.status, 403);
  const upgradeApproval = await fetch('/authorize', { method: 'POST', headers: { origin, cookie: upgradeCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ handle: upgradeHandle, decision: 'approve' }).toString(), redirect: 'manual' });
  assert.equal(upgradeApproval.status, 302, await upgradeApproval.clone().text());
  const upgradeRedirect = new URL(upgradeApproval.headers.get('location'));
  assert.equal(upgradeRedirect.searchParams.get('state'), 'remember-upgrade');
  const upgradeExchangeBody = { ...exchangeBody, code: upgradeRedirect.searchParams.get('code') };
  const upgradeTokenResponse = await fetch('/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(upgradeExchangeBody).toString() });
  assert.equal(upgradeTokenResponse.status, 200, await upgradeTokenResponse.clone().text());
  token = await upgradeTokenResponse.json(); assert.ok(token.access_token);
  const switched = await fetch(`/authorize?${upgradedQuery}&switch=1`, { headers: { cookie: browserCookie } });
  assert.ok((await switched.text()).includes('name="key"'), 'account switching must require a key');
  const otherBrowser = await fetch(`/authorize?${upgradedQuery}`, { headers: { cookie: '__Host-coze_editor_session=' + 'f'.repeat(64) } });
  assert.ok((await otherBrowser.text()).includes('name="key"'), 'an unknown browser must require a key');
  const otherRegistration = await fetch('/oauth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Another client', redirect_uris: [client.redirect_uris[0]], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }) });
  assert.equal(otherRegistration.status, 201);
  const otherClient = await otherRegistration.json();
  const otherClientQuery = new URLSearchParams(upgradedQuery); otherClientQuery.set('client_id', otherClient.client_id);
  const otherClientConsent = await fetch(`/authorize?${otherClientQuery}`, { headers: { cookie: browserCookie } });
  assert.equal(otherClientConsent.status, 200);
  const otherClientHtml = await otherClientConsent.text();
  assert.ok(otherClientHtml.includes('name="key"'), 'a different OAuth client must require its own sign-in');
  const otherClientHandle = /name="handle" value="([^"]+)"/.exec(otherClientHtml)?.[1]; assert.ok(otherClientHandle);
  const otherClientCookies = [browserCookie, ...otherClientConsent.headers.getSetCookie().map(c => c.split(';')[0])].join('; ');
  const crossClientApproval = await fetch('/authorize', { method: 'POST', headers: { origin, cookie: otherClientCookies, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ handle: otherClientHandle, decision: 'approve' }).toString(), redirect: 'manual' });
  assert.equal(crossClientApproval.status, 403);
  const tools = await fetch('/mcp', { method: 'POST', headers: { authorization: `Bearer ${token.access_token}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
  assert.equal(tools.status, 200, await tools.clone().text());
  assert.ok((await tools.json()).result.tools.some(t => t.name === 'publishHomepage'));
  const list = await fetch('/mcp', { method: 'POST', headers: { authorization: `Bearer ${token.access_token}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'listHomepageChanges', arguments: {} } }) });
  assert.equal(list.status, 200); assert.deepEqual((await list.json()).result.structuredContent.changes, []);
  const homepage = await fetch('/mcp', { method: 'POST', headers: { authorization: `Bearer ${token.access_token}`, accept: 'application/json, text/event-stream', 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'getHomepage', arguments: {} } }) });
  const readResult = await homepage.json();
  assert.equal(readResult.result.isError, undefined, JSON.stringify(readResult));
  assert.equal(readResult.result.structuredContent.commit, 'a'.repeat(40));
  if(testDatabase){
    const call=async(name,args={})=>{const r=await fetch('/mcp',{method:'POST',headers:{authorization:`Bearer ${token.access_token}`,accept:'application/json, text/event-stream','content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method:'tools/call',params:{name,arguments:args}})});return (await r.json()).result;};
    const items=await call('listItineraries');assert.equal(items.isError,undefined,JSON.stringify(items));assert.equal(items.structuredContent.items.length,1);
    const current=(await call('getItinerary',{slug:'seoul-tour'})).structuredContent;
    const draft=await call('prepareItineraryPreview',{slug:'seoul-tour',expectedRevision:current.revision,changes:{title:`Local Workerd test ${Date.now()}`},rationale:'Verify local runtime only'});assert.equal(draft.isError,undefined,JSON.stringify(draft));const changeId=draft.structuredContent.changeId;
    assert.equal((await call('publishItinerary',{changeId,confirmedByUser:true})).isError,true);
    const shown=await call('showItineraryPreview',{changeId});assert.ok(shown._meta.previewUrl);const page=await fetch(shown._meta.previewUrl);assert.equal(page.status,200);assert.ok((await page.text()).includes('Content preview'));
    assert.equal((await call('markItineraryPreviewViewed',{changeId,viewToken:shown._meta.viewToken})).isError,undefined);
    const saved=await call('publishItinerary',{changeId,confirmedByUser:true});assert.equal(saved.isError,undefined,JSON.stringify(saved));assert.equal(saved.structuredContent.state,'publishing');
    console.log('PASS: full-scope OAuth, Hyperdrive/pg in Workerd, CMS list/read, private preview, preview gating and atomic publication to the disposable local database.');
  }
  const replay = await fetch('/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(upgradeExchangeBody).toString() });
  assert.equal(replay.status, 400);
  const afterReplay = await fetch('/mcp', { method: 'POST', headers: { authorization: `Bearer ${token.access_token}` } });
  assert.equal(afterReplay.status, 401);
  console.log('PASS: native browser sign-in, cross-origin rejection, OAuth discovery, PKCE, consent cookie, code replay protection, authenticated MCP, outbound GitHub read and Durable Object storage.');
} finally { await mf.dispose(); }
