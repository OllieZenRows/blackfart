import test from 'node:test';
import assert from 'node:assert/strict';
import { SymphonyEngine } from '../app/symphony/engine.ts';

function fixture() {
 let tick, liveContext;
 const starts=[]; const sources=[]; const pending=new Map();
 const realSetInterval=globalThis.setInterval, realClearInterval=globalThis.clearInterval;
 globalThis.setInterval=(callback)=>{tick=callback;return 777};
 globalThis.clearInterval=()=>{tick=undefined};
 class Param {value=0;setValueAtTime(){}linearRampToValueAtTime(){}}
 class Node {gain=new Param();threshold=new Param();knee=new Param();ratio=new Param();attack=new Param();release=new Param();playbackRate=new Param();connect(){}disconnect(){this.disconnected=true}start(time){starts.push({time,id:this.buffer.id,rate:this.playbackRate.value})}stop(time){if(time===undefined)this.cancelled=true}}
 class Context {
  currentTime=0;state='running';sampleRate=44100;destination=new Node();
  // Keep the fake context available so tests can advance its audio clock.
  // eslint-disable-next-line @typescript-eslint/no-this-alias
  constructor(channels){if(channels===undefined)liveContext=this}
  createGain(){return new Node()}createDynamicsCompressor(){return new Node()}
  createBufferSource(){const node=new Node();sources.push(node);return node}
  async resume(){}async close(){}
  async decodeAudioData(bytes){return {id:new Uint8Array(bytes)[0],duration:1,sampleRate:1000,getChannelData:()=>new Float32Array(1000).fill(0.5)}}
 }
 globalThis.window={AudioContext:Context,OfflineAudioContext:Context};
 globalThis.fetch=(url)=>new Promise((resolve,reject)=>pending.set(url,{resolve,reject}));
 return {
  starts,sources,pending,
  resolve(url,id){assert.ok(pending.has(url),`fetch pending: ${url}`);pending.get(url).resolve({ok:true,arrayBuffer:async()=>new Uint8Array([id]).buffer});pending.delete(url)},
  reject(url){pending.get(url).reject(new Error('Unable to decode sample'));pending.delete(url)},
  advance(time){liveContext.currentTime=time;tick?.()},
  get running(){return Boolean(tick)},
  restore(){globalThis.setInterval=realSetInterval;globalThis.clearInterval=realClearInterval;},
 };
}
const score=(name='a',pitch=0)=>({tempo:120,tracks:[{id:'bass',sample:`/audio/${name}.mp3`,pitch,volume:0.7,muted:false,steps:Array(16).fill(true)}]});
async function start(engine,f){const play=engine.play(score(),()=>{});f.resolve('/audio/a.mp3',1);await play;}

test('live updates affect future notes without resetting the step clock',async()=>{
 const f=fixture(), engine=new SymphonyEngine();
 try {
  await start(engine,f);
  assert.deepEqual(f.starts.map(n=>n.time),[0.06]);
  await engine.update(score('a',12));
  f.advance(0.15);
  assert.equal(f.starts[1].time,0.185);
  assert.equal(f.starts[1].rate,2);
  assert.equal(f.starts.length,2);
 }finally{engine.dispose();f.restore()}
});

test('latest edit wins when its sample loads before an earlier edit',async()=>{
 const f=fixture(),engine=new SymphonyEngine();
 try {
  await start(engine,f);
  const older=engine.update(score('b',-12));
  const newer=engine.update(score('c',12));
  f.resolve('/audio/c.mp3',3);await newer;
  f.resolve('/audio/b.mp3',2);await older;
  f.advance(0.15);
  assert.equal(f.starts.at(-1).id,3);
  assert.equal(f.starts.at(-1).rate,2);
 }finally{engine.dispose();f.restore()}
});

test('stop during an update cancels scheduled voices and prevents delayed restart',async()=>{
 const f=fixture(),engine=new SymphonyEngine();
 try {
  await start(engine,f);
  const update=engine.update(score('b'));
  engine.stop();
  const startsAtStop=f.starts.length;
  f.resolve('/audio/b.mp3',2);await update;
  f.advance(0.8);
  assert.equal(f.running,false);
  assert.equal(f.starts.length,startsAtStop);
  assert.ok(f.sources.every(node=>node.cancelled && node.disconnected));
 }finally{engine.dispose();f.restore()}
});

test('a pending edit from a stopped session cannot overwrite a new playback session',async()=>{
 const f=fixture(),engine=new SymphonyEngine();
 try {
  await start(engine,f);
  const stale=engine.update(score('b'));
  engine.stop();
  const restarted=engine.play(score('c'),()=>{});
  f.resolve('/audio/c.mp3',3);await restarted;
  f.resolve('/audio/b.mp3',2);await stale;
  f.advance(0.15);
  assert.equal(f.starts.at(-1).id,3);
 }finally{engine.dispose();f.restore()}
});

test('obsolete failed edits do not surface errors or stop the latest composition',async()=>{
 const f=fixture(),engine=new SymphonyEngine();
 try {
  await start(engine,f);
  const stale=engine.update(score('b'));
  await engine.update(score('a',7));
  f.reject('/audio/b.mp3');await stale;
  f.advance(0.15);
  assert.ok(f.running);
  assert.equal(f.starts.at(-1).rate,Math.pow(2,7/12));
 }finally{engine.dispose();f.restore()}
});

test('current failed edit reports a usable error without replacing the working score',async()=>{
 const f=fixture(),engine=new SymphonyEngine();
 try {
  await start(engine,f);
  const latest=engine.update(score('b'));
  f.reject('/audio/b.mp3');
  await assert.rejects(latest,/Unable to decode sample/);
  f.advance(0.15);
  assert.equal(f.starts.at(-1).id,1);
 }finally{engine.dispose();f.restore()}
});
