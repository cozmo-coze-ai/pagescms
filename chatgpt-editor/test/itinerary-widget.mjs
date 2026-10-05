import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import widget from '../src/widget.generated.ts';
import {renderItinerary} from '../src/itinerary-model.ts';
const revision='a'.repeat(64),changeId=crypto.randomUUID(),viewToken=crypto.randomUUID();
const previewUrl=`https://editor.example.test/itinerary-preview/${changeId}?token=${viewToken}`;
const result={content:[],structuredContent:{kind:'itinerary',changeId,revision,state:'ready'},_meta:{viewToken,previewUrl}};
const content={slug:'seoul-tour',title:'An afternoon in Seoul',category:'tour',tag:'Popular',tagColor:'green',cover:'seoul-tour/cover.png',published:true,body:'## Your afternoon\n\nTake time to enjoy the neighbourhood.\n\n| Stop | Detail |\n|---|---|\n| Walk | Follow the existing route |\n\n![Street](/itineraries/seoul-tour/photo.png)'};
const preview=await renderItinerary(content,revision).text();
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPyoAAAAASUVORK5CYII=','base64');
const host=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{width:100%;height:800px;border:0}</style><iframe src="https://widget.example.test/"></iframe><script>window.calls=[];addEventListener('message',e=>{const d=e.data;if(d?.jsonrpc!=='2.0')return;if(d.method==='ui/initialize')e.source.postMessage({jsonrpc:'2.0',id:d.id,result:{protocolVersion:'2026-01-26',hostInfo:{name:'Local test host',version:'1'},hostCapabilities:{serverTools:{}},hostContext:{}}},e.origin);if(d.method==='ui/notifications/initialized')e.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:${JSON.stringify(result)}},e.origin);if(d.method==='tools/call'){window.calls.push(d.params);e.source.postMessage({jsonrpc:'2.0',id:d.id,result:{content:[],structuredContent:{previewShown:true}}},e.origin);}});</script>`;
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 await mkdir('test-results',{recursive:true});
 for(const width of [320,390,768,1024,1440]){
  const page=await browser.newPage({viewport:{width,height:950}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname.endsWith('supabase.co'))return route.fulfill({status:200,contentType:'image/png',body:image});if(url.hostname.includes('google'))return route.fulfill({status:204,body:''});const body=url.hostname==='host.example.test'?host:url.hostname==='widget.example.test'?widget:preview;return route.fulfill({status:200,contentType:'text/html',body});});
  await page.goto('https://host.example.test/');const component=page.frameLocator('iframe');const frame=component.frameLocator('iframe');
  await frame.getByRole('heading',{name:'An afternoon in Seoul',exact:true}).waitFor();await component.getByRole('status').filter({hasText:'Preview ready'}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.calls.map(c=>c.name)),['markItineraryPreviewViewed']);
  assert.equal(await component.getByLabel('Preview language').isVisible(),false);
  assert.equal(await component.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);
  assert.equal(await frame.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);
  assert.equal(await frame.locator('main.notion-page article.article').count(),1);
  assert.equal(await frame.locator('.article-cover').evaluate(el=>getComputedStyle(el).aspectRatio),'16 / 9');
  assert.equal(await frame.locator('.status-badge').getAttribute('class'),'status-badge status-green');
  assert.equal(await frame.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(249, 248, 244)');
  assert.equal(await frame.locator('.article').evaluate(el=>getComputedStyle(el).maxWidth),'700px');
  assert.deepEqual(errors,[]);
  await component.getByRole('button',{name:'Phone',exact:true}).click();assert.equal(await component.locator('iframe').evaluate(el=>el.clientWidth),390);
  await page.screenshot({path:`test-results/itinerary-${width}.png`});await page.close();
 }
 console.log('PASS: actual itinerary content renderer and MCP Apps acknowledgement, phone/desktop controls, hidden homepage language switcher, no overflow or JS errors at 320/390/768/1024/1440px. Local host simulation only.');
}finally{await browser.close();}
