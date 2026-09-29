import {test} from 'node:test';
import assert from 'node:assert/strict';
import {members, member, cmsUser, type Env} from '../src/types.ts';
const original = {id:'owner',name:'Owner',keyHash:'a'.repeat(64),enabled:true};
const teammate = {id:'teammate',name:'Teammate',keyHash:'b'.repeat(64),enabled:true,cmsUserId:'cms-teammate'};
const env = (extra: unknown, primary=original) => ({TEAM_MEMBERS_JSON:JSON.stringify([primary]),
  ITINERARY_EDITORS_JSON:JSON.stringify({owner:'cms-owner'}),ADDITIONAL_EDITORS_JSON:JSON.stringify(extra)} as Env);
test('a separate teammate keeps the original login and CMS mapping unchanged',()=>{
 const e=env([teammate]);assert.equal(members(e).length,2);
 assert.deepEqual(member(e,'owner'),original);assert.equal(cmsUser(e,'owner'),'cms-owner');
 assert.equal(member(e,'teammate')?.name,'Teammate');assert.equal(cmsUser(e,'teammate'),'cms-teammate');
});
test('supplemental entries cannot replace or reactivate original identities or reuse keys',()=>{
 for(const override of [{...teammate,id:'owner'},{...teammate,keyHash:original.keyHash}]){
  const e=env([override],{...original,enabled:false});assert.equal(members(e).length,1);
  assert.equal(member(e,'owner'),undefined);assert.equal(cmsUser(e,'owner'),undefined);
 }
});
test('revoking a teammate immediately removes both membership and itinerary access',()=>{
 for(const extra of [[],[{...teammate,enabled:false}]]){
  const e=env(extra);assert.equal(member(e,'teammate'),undefined);assert.equal(cmsUser(e,'teammate'),undefined);
  assert.equal(cmsUser(e,'owner'),'cms-owner');
 }
});
test('malformed and ambiguous new entries fail closed without breaking the original login',()=>{
 for(const extra of [{},[null],[{...teammate,keyHash:'plaintext'}],[{...teammate,enabled:'true'}],
  [{...teammate,cmsUserId:' '}],[teammate,{...teammate,keyHash:'c'.repeat(64)}],
  [teammate,{...teammate,id:'another'}]]){
  const e=env(extra);assert.deepEqual(members(e),[original]);assert.equal(cmsUser(e,'teammate'),undefined);
 }
 const malformed={...env([]),ADDITIONAL_EDITORS_JSON:'{invalid'};
 assert.deepEqual(members(malformed),[original]);assert.equal(cmsUser(malformed,'owner'),'cms-owner');
});
