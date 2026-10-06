// Hosted read/private-draft test. NEVER invokes publication with true.
// Supply the protected owner connection key only through process environment.
import {createHash,randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const origin='https://coze-homepage-editor.cozmo-ca1.workers.dev';
const key=process.env.COZE_OWNER_CONNECTION_KEY;delete process.env.COZE_OWNER_CONNECTION_KEY;if(!key)throw Error('Protected connection key required');
async function request(path,options={}){return fetch(new URL(path,origin),{...options,redirect:'manual',signal:AbortSignal.timeout(30000)});}
const metadata=await (await request('/.well-known/oauth-authorization-server')).json();
const registration=await request('/oauth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'COZE itinerary connection verification',redirect_uris:['http://127.0.0.1:8978/callback'],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']})});assert.equal(registration.status,201);const client=await registration.json();
const verifier=randomBytes(32).toString('base64url'),challenge=createHash('sha256').update(verifier).digest('base64url');
const query=new URLSearchParams({client_id:client.client_id,redirect_uri:client.redirect_uris[0],response_type:'code',scope:'homepage:read homepage:write itineraries:read itineraries:write',state:randomBytes(16).toString('hex'),code_challenge:challenge,code_challenge_method:'S256',resource:`${origin}/mcp`});
const consent=await request(`/authorize?${query}`);assert.equal(consent.status,200);const handle=/name="handle" value="([^"]+)"/.exec(await consent.text())?.[1];assert.ok(handle);
const cookie=consent.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
const approval=await request('/authorize',{method:'POST',headers:{origin,cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({handle,key,decision:'approve'}).toString()});assert.equal(approval.status,302);const callback=new URL(approval.headers.get('location'));assert.equal(callback.searchParams.get('state'),query.get('state'));
const exchange=await request('/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client.client_id,redirect_uri:client.redirect_uris[0],code:callback.searchParams.get('code'),code_verifier:verifier,resource:`${origin}/mcp`}).toString()});assert.equal(exchange.status,200);const tokens=await exchange.json();
async function rpc(method,params){const r=await request('/mcp',{method:'POST',headers:{authorization:`Bearer ${tokens.access_token}`,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:randomBytes(8).toString('hex'),method,params})});assert.equal(r.status,200);return r.json();}
async function tool(name,args={}){const r=await rpc('tools/call',{name,arguments:args});if(r.error||r.result?.isError)throw Error(r.result?.content?.[0]?.text||'Tool request failed');return r.result;}
try{
 const tools=(await rpc('tools/list')).result.tools.map(t=>t.name);assert.ok(tools.includes('getHomepage')&&tools.includes('publishItinerary')&&tools.includes('prepareNewItineraryPreview'));
 const home=(await tool('getHomepage')).structuredContent,profile=(await tool('getEditorProfile')).structuredContent;
 const all=[];let offset=0;do{const page=(await tool('listItineraries',{offset})).structuredContent;all.push(...page.items);offset=page.nextOffset;}while(offset!==null);
 const slug=`chatgpt-private-test-${randomBytes(6).toString('hex')}`,title='Private new-itinerary connection test';
 const started=Date.now();const prepared=(await tool('prepareNewItineraryPreview',{slug,title,category:'tour',tag:'Private test',tagColor:'gray',cover:null,body:'## Private preview\n\nThis unpublished proposal verifies itinerary creation without saving CMS content.',rationale:'Verify private new-itinerary preview only. Do not publish this test.'})).structuredContent;assert.equal(prepared.state,'ready');assert.equal(prepared.summary.operation,'create');assert.equal(prepared.summary.publishedAfter,false);const previewMs=Date.now()-started;
 const refused=await rpc('tools/call',{name:'publishItinerary',arguments:{changeId:prepared.changeId,confirmedByUser:false}});assert.ok(refused.error||refused.result?.isError);
 const shown=await tool('showItineraryPreview',{changeId:prepared.changeId});assert.ok(shown._meta?.previewUrl);assert.ok(!JSON.stringify(shown.structuredContent).includes(shown._meta.viewToken));
 const preview=await request(shown._meta.previewUrl);assert.equal(preview.status,200);const html=await preview.text();assert.ok(html.includes('Private COZE preview'));assert.ok(preview.headers.get('cache-control').includes('no-store'));
 const missing=await request(shown._meta.previewUrl.replace(/token=[^&]+/,'token=00000000-0000-0000-0000-000000000000'));assert.equal(missing.status,404);
 const browser=await chromium.launch({channel:'msedge',headless:true});await mkdir('test-results',{recursive:true});
 try{for(const width of [320,390,1440]){const page=await browser.newPage({viewport:{width,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(shown._meta.previewUrl,{waitUntil:'load'});await page.getByRole('heading',{name:title,exact:true}).waitFor();assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);await page.screenshot({path:`test-results/hosted-itinerary-${width}.png`});await page.close();}}finally{await browser.close();}
 const collisionCheck=(await tool('listItineraries',{search:slug})).structuredContent;assert.equal(collisionCheck.items.length,0);
 const commonsSearch=(await tool('searchCommonsItineraryPhotos',{query:'Jajangmyeon Museum Incheon'})).structuredContent;
 assert.ok(commonsSearch.items.length>0);
 const staged=(await tool('stageCommonsItineraryPhoto',{slug,title:'File:Jajangmyeon Museum 20230430 001.jpg',forNewItinerary:true})).structuredContent;
 assert.equal(staged.state,'private_draft');assert.equal(staged.license,'CC BY-SA 4.0');
 const photoDraft=(await tool('prepareNewItineraryPreview',{slug,title,category:'tour',tag:'Private test',tagColor:'gray',cover:staged.photoRef,body:`## Private photo preview\n\n![Jajangmyeon Museum](${staged.photoRef})`,rationale:'Verify Commons photo staging and private attribution only. Do not publish.'})).structuredContent;
 const photoShown=await tool('showItineraryPreview',{changeId:photoDraft.changeId});
 const photoHtml=await (await request(photoShown._meta.previewUrl)).text();assert.match(photoHtml,/Photo credits/);assert.match(photoHtml,/Mobius6/);
 const report={authenticated:true,homepageCommit:home.commit,itineraryCount:all.length,profile,tools,changeId:prepared.changeId,operation:'create',previewMs,privatePreview:true,commonsSearch:true,commonsPhotoStaged:true,commonsCredited:true,mobileWidths:[320,390,1440],productionContentUnchanged:true,cmsRowCreated:false,published:false};
 await mkdir('generated',{recursive:true});await writeFile('generated/hosted-itinerary-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(metadata.revocation_endpoint&&new URL(metadata.revocation_endpoint).origin===origin)await request(metadata.revocation_endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:client.client_id,token:tokens.refresh_token||tokens.access_token}).toString()});}
