import { test } from "node:test";
import assert from "node:assert/strict";
import { ItineraryBackend, itineraryBuildState } from "../src/itinerary-backend.ts";
import { contentRevision, validateContent, renderItinerary, type ItineraryContent, type ItineraryRecord } from "../src/itinerary-model.ts";
import { PublicError, type Env, type Store } from "../src/types.ts";
import type { ItineraryRepository } from "../src/itinerary-db.ts";
import { mcpResponse, result } from "../src/mcp.ts";

const content: ItineraryContent={slug:"seoul-tour",title:"Seoul tour",category:"tour",tag:null,tagColor:null,cover:null,published:true,body:"## Welcome\n\nA walk through Seoul."};
class Memory implements Store {
  data=new Map<string,any>();
  async get<T>(key:string){return structuredClone(this.data.get(key)) as T|undefined;}
  async put<T>(key:string,value:T){this.data.set(key,structuredClone(value));}
  async delete(key:string){this.data.delete(key);}
  async list<T>(options?:{prefix?:string}){return new Map([...this.data.entries()].filter(([k])=>k.startsWith(options?.prefix??""))) as Map<string,T>;}
}
async function setup(published=true) {
  const store=new Memory(); const saved=new Map<string,any>(); let role="editor",writes=0,lostResponse=false;
  let current:ItineraryRecord={content:{...content,published},revision:"",updatedAt:"2026-09-29T00:00:00.000Z"}; current.revision=await contentRevision(current.content);
  const db:ItineraryRepository={
    async authorize(owner,write){if(owner!=="alice"&&owner!=="bob")throw new PublicError("Removed",403); if(role==="removed" || write && role!=="editor")throw new PublicError("Read only",403);return owner;},
    async list(){return {items:[{slug:content.slug}],nextOffset:null};},
    async read(owner,slug){await this.authorize(owner);if(slug!==content.slug)throw new PublicError("Not found",404);return structuredClone(current);},
    async published(owner,id){await this.authorize(owner);return saved.get(id)??null;},
    async publish(owner,id,before,after){await this.authorize(owner,true);if(current.revision!==before.revision)throw new PublicError("Stale",409);writes++;current={...current,content:after,revision:await contentRevision(after)};const value={publishedAt:new Date().toISOString(),affectsSite:before.content.published||after.published};saved.set(id,value);if(lostResponse)throw new Error("Connection lost after commit");return value;},
  };
  let manifest:any=null;
  const kv=new Map<string,ArrayBuffer>();
  const env={PUBLIC_ORIGIN:"https://editor.example.test",OAUTH_KV:{async put(key:string,value:Uint8Array){kv.set(key,Uint8Array.from(value).buffer);},async get(key:string){return kv.get(key)??null;}}} as unknown as Env;
  const backend=new ItineraryBackend(env,store,db,async()=>manifest);
  const prepare=()=>backend.prepare("alice",{slug:content.slug,expectedRevision:current.revision,changes:{title:"A quieter Seoul walk"},rationale:"Requested title update"});
  return {backend,store,db,env,prepare,current:()=>current,writes:()=>writes,setRole:(r:string)=>role=r,lose:()=>lostResponse=true,setManifest:(m:any)=>manifest=m};
}
test("itinerary preview preserves omitted fields, is idempotent and makes no production writes",async()=>{
  const s=await setup();const a=await s.prepare(),b=await s.prepare();assert.equal(a.changeId,b.changeId);assert.equal(s.writes(),0);
  const after:any=await s.store.get(`itinerary-after:${a.changeId}`);assert.equal(after.body,content.body);assert.equal(after.published,true);
  assert.equal('_previewUrl' in a,false);const shown:any=await s.backend.status("alice",a.changeId,true);const output=result(shown,true);
  assert.equal(JSON.stringify(output.structuredContent).includes(shown._viewToken),false);assert.equal(JSON.stringify(output.content).includes(shown._previewUrl),false);
  assert.ok(output._meta?.previewUrl);
});
test("itinerary publication requires confirmation, actual preview acknowledgement and ownership",async()=>{
  const s=await setup();const a=await s.prepare();
  await assert.rejects(s.backend.publish("alice",a.changeId,false),/confirm/);
  await assert.rejects(s.backend.publish("alice",a.changeId,true),/preview/);
  await assert.rejects(s.backend.viewed("alice",a.changeId,"wrong"),/preview/);
  await assert.rejects(s.backend.status("bob",a.changeId),/not found/);
  const shown:any=await s.backend.status("alice",a.changeId,true);await s.backend.viewed("alice",a.changeId,shown._viewToken);
  assert.equal((await s.backend.publish("alice",a.changeId,true)).state,"publishing");assert.equal(s.writes(),1);
  await s.backend.publish("alice",a.changeId,true);assert.equal(s.writes(),1);
  s.setManifest({version:1,fetchedAt:"2000-01-01T00:00:00Z",entries:{[content.slug]:s.current().revision}});
  assert.equal((await s.backend.status("alice",a.changeId)).state,"publishing");
  s.setManifest({version:1,fetchedAt:new Date(Date.now()+1000).toISOString(),entries:{[content.slug]:s.current().revision}});
  assert.equal((await s.backend.status("alice",a.changeId)).state,"live");
});
test("a lost database commit response is reconciled without a duplicate publication",async()=>{
  const s=await setup();const a=await s.prepare();const shown:any=await s.backend.status("alice",a.changeId,true);
  await s.backend.viewed("alice",a.changeId,shown._viewToken);s.lose();await assert.rejects(s.backend.publish("alice",a.changeId,true),/Connection lost/);
  await s.backend.publish("alice",a.changeId,true);assert.equal(s.writes(),1);
});
test("CMS conflicts, expiry and access revocation stop publication",async()=>{
  const s=await setup();const a=await s.prepare();const shown:any=await s.backend.status("alice",a.changeId,true);await s.backend.viewed("alice",a.changeId,shown._viewToken);
  s.current().updatedAt="2026-09-29T01:00:00.000Z";await assert.rejects(s.backend.publish("alice",a.changeId,true),/changed/);assert.equal(s.writes(),0);
  s.setRole("viewer");await assert.rejects(s.backend.publish("alice",a.changeId,true),/Read only/);s.setRole("editor");
  const draft:any=await s.store.get(`itinerary:${a.changeId}`);draft.expires=1;await s.store.put(`itinerary:${a.changeId}`,draft);
  await assert.rejects(s.backend.publish("alice",a.changeId,true),/fresh/);assert.equal((await s.backend.status("alice",a.changeId)).state,"expired");
  assert.equal((await s.backend.preview(a.changeId,shown._viewToken)).status,404);
});
test("editing an unpublished itinerary never silently makes it public",async()=>{
  const s=await setup(false);const a=await s.prepare();const shown:any=await s.backend.status("alice",a.changeId,true);await s.backend.viewed("alice",a.changeId,shown._viewToken);
  assert.equal((await s.backend.publish("alice",a.changeId,true)).state,"saved_draft");assert.equal(s.current().content.published,false);
});
test("unsafe HTML, image URLs, encoded script links and address changes are refused",async()=>{
  for(const body of ['<script>alert(1)</script>','<img src=x onerror=alert(1)>','<a href="jav&#97;script:alert(1)">go</a>','<a href="java\nscript:alert(1)">go</a>','<svg onload=alert(1)>','[x](javascript:alert(1))','![x](https://evil.example/x.png)'])assert.throws(()=>validateContent({...content,body}),(error:unknown)=>error instanceof Error,body);
  validateContent({...content,body:'<aside>Note</aside>\n\n![Photo](/itineraries/seoul-tour/photo.jpg)'});
  const s=await setup();await assert.rejects(s.backend.prepare("alice",{slug:content.slug,expectedRevision:s.current().revision,changes:{slug:"new-address"},rationale:"Change"}));
  assert.equal(s.writes(),0);
});
test("private preview checks its capability, escapes titles and uses a restrictive CSP",async()=>{
  const s=await setup();const a=await s.prepare();assert.equal((await s.backend.preview(a.changeId,"bad")).status,404);
  const response=renderItinerary({...content,title:'<img src=x onerror=alert(1)>',body:'**Hello**'},"a".repeat(64));
  const html=await response.text();assert.ok(html.includes('&#60;img'));assert.ok(html.includes('<strong>Hello</strong>'));
  assert.ok(response.headers.get('content-security-policy')?.includes("form-action 'none'"));assert.ok(response.headers.get('cache-control')?.includes('no-store'));
});

test("photos stay private until the exact preview is confirmed and cannot cross owners or itineraries",async()=>{
  const s=await setup();const original=globalThis.fetch;let publicWrites=0;
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0WEAAAAASUVORK5CYII=','base64');
  globalThis.fetch=async(input,init)=>{const url=String(input);if(url.startsWith('https://files.openai.com/'))return new Response(png);assert.ok(url.includes('/storage/v1/object/itineraries-media/'));assert.equal(init?.method,'POST');assert.equal((init?.headers as Record<string,string>)['x-upsert'],'false');publicWrites++;return new Response('{}',{status:200});};
  try {
    await assert.rejects(s.backend.photo('alice',{slug:content.slug,filename:'photo.png',downloadUrl:'https://evil.example/photo.png'}),/Arbitrary/);
    const photo=await s.backend.photo('alice',{slug:content.slug,filename:'photo.png',downloadUrl:'https://files.openai.com/test.png'});
    assert.equal(photo.state,'private_draft');assert.equal(publicWrites,0);
    const input={slug:content.slug,expectedRevision:s.current().revision,changes:{cover:photo.photoRef,body:`![A calm street](${photo.photoRef})`},rationale:'Requested photo'};
    await assert.rejects(s.backend.prepare('bob',input),/another itinerary/);
    const preview=await s.backend.prepare('alice',input);const shown:any=await s.backend.status('alice',preview.changeId,true);
    const html=await (await s.backend.preview(preview.changeId,shown._viewToken)).text();assert.ok(html.includes(`/itinerary-preview/${preview.changeId}/`));assert.equal(publicWrites,0);
    assert.equal((await s.backend.preview(preview.changeId,shown._viewToken,photo.photoRef.slice(7))).status,200);
    assert.equal((await s.backend.preview(preview.changeId,'wrong',photo.photoRef.slice(7))).status,404);
    await assert.rejects(s.backend.publish('alice',preview.changeId,true),/preview/);assert.equal(publicWrites,0);
    s.env.SUPABASE_URL='https://ihitnwzljfldctswwrsv.supabase.co';s.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-storage-key';
    await s.backend.viewed('alice',preview.changeId,shown._viewToken);await s.backend.publish('alice',preview.changeId,true);
    assert.equal(publicWrites,1);assert.equal(s.writes(),1);assert.ok(s.current().content.body.includes('/itineraries/seoul-tour/chatgpt-'));assert.ok(!s.current().content.body.includes('@photo:'));
  }finally{globalThis.fetch=original;}
});

test("old broken images are flagged and preserved without permitting new broken references",()=>{
  const broken='![Original photo](/itineraries/blob:https:/cms.coze.care/old-photo)';
  const before={...content,body:broken};validateContent({...before,title:'New title'},before);
  assert.throws(()=>validateContent({...content,body:broken}));
  assert.throws(()=>validateContent({...before,body:`${broken}\n${broken}`},before));
});

test("publication errors, delays and newer CMS content never claim a successful live deployment",async()=>{
  const s=await setup();const a=await s.prepare();const shown:any=await s.backend.status('alice',a.changeId,true);await s.backend.viewed('alice',a.changeId,shown._viewToken);await s.backend.publish('alice',a.changeId,true);
  const failed=new ItineraryBackend(s.env,s.store,s.db,async()=>null,async()=>'failed');assert.equal((await failed.status('alice',a.changeId)).state,'failed');
  const draft:any=await s.store.get(`itinerary:${a.changeId}`);draft.publishedAt=new Date(Date.now()-660_000).toISOString();await s.store.put(`itinerary:${a.changeId}`,draft);
  assert.equal((await s.backend.status('alice',a.changeId)).state,'needs_attention');s.current().revision='b'.repeat(64);assert.equal((await s.backend.status('alice',a.changeId)).state,'superseded');
});

test("build monitoring ignores previews and old builds and treats unknown as in progress",async()=>{
  const original=globalThis.fetch;let builds:any[]=[];globalThis.fetch=async()=>Response.json({result:builds});
  const env={CF_API_TOKEN:'test',CF_ACCOUNT_ID:'test',PRODUCTION_WORKER_TAG:'test',PUBLIC_BUILD_TRIGGER_ID:'production'} as Env;const saved='2026-09-29T10:00:00Z';
  try{
    builds=[{trigger_uuid:'preview',created_on:'2026-09-29T11:00:00Z',build_outcome:'failure'},{trigger_uuid:'production',created_on:'2026-09-29T09:00:00Z',build_outcome:'success'}];assert.equal(await itineraryBuildState(env,saved),'queued');
    builds.push({trigger:{trigger_uuid:'production'},created_on:'2026-09-29T10:01:00Z',build_outcome:'unknown'});assert.equal(await itineraryBuildState(env,saved),'building');
    builds.at(-1).build_outcome='failure';assert.equal(await itineraryBuildState(env,saved),'failed');builds.at(-1).build_outcome='success';assert.equal(await itineraryBuildState(env,saved),'deployed');
  }finally{globalThis.fetch=original;}
});
test("itinerary tools require their own scopes and literal confirmation, leaving homepage access intact",async()=>{
  const calls:string[]=[];
  async function call(method:string,params:unknown={},scopes=["homepage:read","homepage:write"]){
    const req=new Request('https://editor.example.test/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
    return (await mcpResponse(req,async method=>{calls.push(method);return{ok:true}},true,'<p>Preview</p>',[],{enabled:true,scopes,resourceMetadata:'https://editor.example.test/.well-known/oauth-protected-resource/mcp',previewOrigin:'https://editor.example.test'})).json() as Promise<any>;
  }
  const list=await call('tools/list');assert.ok(list.result.tools.some((t:any)=>t.name==='getHomepage'));assert.ok(list.result.tools.some((t:any)=>t.name==='getItinerary'));
  const denied=await call('tools/call',{name:'getItinerary',arguments:{slug:content.slug}});assert.equal(denied.result.isError,true);assert.ok(denied.result._meta['mcp/www_authenticate']);assert.equal(calls.length,0);
  const allowed=await call('tools/call',{name:'getItinerary',arguments:{slug:content.slug}},['itineraries:read']);assert.equal(allowed.result.isError,undefined);assert.deepEqual(calls,['itinerary:read']);
  const invalid=await call('tools/call',{name:'publishItinerary',arguments:{changeId:crypto.randomUUID(),confirmedByUser:false}},['itineraries:read','itineraries:write']);assert.ok(invalid.error||invalid.result.isError);assert.equal(calls.length,1);
  const acknowledgement=list.result.tools.find((t:any)=>t.name==='markItineraryPreviewViewed');assert.deepEqual(acknowledgement._meta.ui.visibility,['app']);
});
