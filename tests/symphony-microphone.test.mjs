import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MusicListener} from '../app/symphony/microphone.ts';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};};
function setup(t,getUserMedia){
 const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 const oldInterval=globalThis.setInterval,oldClear=globalThis.clearInterval;
 const timers=new Map();let serial=0;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia}}});
 globalThis.setInterval=fn=>{const id=++serial;timers.set(id,fn);return id;};globalThis.clearInterval=id=>timers.delete(id);
 t.after(()=>{if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;globalThis.setInterval=oldInterval;globalThis.clearInterval=oldClear;});
 const nodes=[],edges=[];
 const makeNode=()=>{const node={disconnected:0,connect(other){edges.push([node,other]);return other;},disconnect(){node.disconnected++;}};nodes.push(node);return node;};
 const context={state:'running',currentTime:10,destination:{name:'speakers'},resume:async()=>{},createMediaStreamSource:()=>makeNode(),createBiquadFilter:()=>Object.assign(makeNode(),{frequency:{value:0},Q:{value:0}}),createAnalyser:()=>Object.assign(makeNode(),{fftSize:1024,smoothingTimeConstant:0,getFloatTimeDomainData(values){values.fill(0.03);}})};
 return {context,nodes,edges,timers,listener:new MusicListener(()=>context)};
}
function stream(){const tracks=Array.from({length:2},()=>({stopped:0,onended:null,stop(){this.stopped++;}}));return {tracks,getTracks:()=>tracks};}
test('blocked permission reports actionable message and starts no nodes or timer',async t=>{
 const f=setup(t,async()=>{throw Object.assign(new Error('no'),{name:'NotAllowedError'});});
 await assert.rejects(f.listener.start(()=>{},()=>{}),/Microphone blocked/);
 assert.equal(f.nodes.length,0);assert.equal(f.timers.size,0);f.listener.stop();
});
test('cancellation during permission releases the late stream',async t=>{
 const permission=deferred(),f=setup(t,()=>permission.promise),late=stream();
 const started=f.listener.start(()=>assert.fail('late callback'),()=>assert.fail('late ended'));
 f.listener.stop();permission.resolve(late);
 assert.equal(await started,false);assert.ok(late.tracks.every(track=>track.stopped===1));assert.equal(f.nodes.length,0);assert.equal(f.timers.size,0);
});
test('stop disconnects every node, releases every track and timer; no speaker connection',async t=>{
 const active=stream(),f=setup(t,async()=>active),reads=[];
 assert.equal(await f.listener.start((frames,level)=>reads.push({frames,level}),()=>{}),true);
 assert.equal(f.nodes.length,3);assert.equal(f.timers.size,1);assert.equal(f.edges.length,2);
 assert.ok(f.edges.every(edge=>edge[1]!==f.context.destination));
 const tick=[...f.timers.values()][0];tick();assert.equal(reads.length,1);assert.equal(reads[0].frames[0].time,10);assert.ok(reads[0].level>0);
 f.listener.stop();assert.equal(f.timers.size,0);assert.ok(f.nodes.every(node=>node.disconnected===1));assert.ok(active.tracks.every(track=>track.stopped===1&&track.onended===null));
 f.context.currentTime=12;tick();assert.equal(reads.length,1);
 f.listener.stop();assert.ok(active.tracks.every(track=>track.stopped===1));
});
test('device disconnection releases resources and reports once',async t=>{
 const active=stream(),f=setup(t,async()=>active);let ended=0;
 await f.listener.start(()=>{},()=>ended++);
 const onEnded=active.tracks[0].onended;onEnded();onEnded();
 assert.equal(ended,1);assert.equal(f.timers.size,0);assert.ok(f.nodes.every(node=>node.disconnected===1));assert.ok(active.tracks.every(track=>track.stopped===1));
});
test('cancellation while AudioContext resume is pending releases acquired stream',async t=>{
 const active=stream(),resume=deferred(),f=setup(t,async()=>active);f.context.resume=()=>resume.promise;
 const started=f.listener.start(()=>{},()=>{});await Promise.resolve();f.listener.stop();resume.resolve();
 assert.equal(await started,false);assert.ok(active.tracks.every(track=>track.stopped===1));assert.equal(f.nodes.length,0);
});
test('failed context resume releases stream',async t=>{
 const active=stream(),f=setup(t,async()=>active);f.context.resume=async()=>{throw new Error('resume failed');};
 await assert.rejects(f.listener.start(()=>{},()=>{}),/resume failed/);
 assert.ok(active.tracks.every(track=>track.stopped===1));assert.equal(f.timers.size,0);
});
