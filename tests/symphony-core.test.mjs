import test from 'node:test';
import assert from 'node:assert/strict';
import { SymphonyEngine } from '../app/symphony/engine.ts';
let resolveFetch;
let starts = [];
class Param { value=0; setValueAtTime(){} linearRampToValueAtTime(){} }
class Node { gain=new Param(); threshold=new Param(); knee=new Param(); ratio=new Param(); attack=new Param(); release=new Param(); playbackRate=new Param(); connect(){} disconnect(){} start(...args){starts.push(args)} stop(){} }
class Context { currentTime=0; state='running'; sampleRate=44100; destination=new Node(); createGain(){return new Node()} createDynamicsCompressor(){return new Node()} createBufferSource(){return new Node()} async resume(){} async close(){} async decodeAudioData(){return {duration:1}} }
globalThis.window={AudioContext:Context,OfflineAudioContext:Context};
globalThis.AudioContext=Context;
globalThis.fetch=()=>new Promise(resolve=>resolveFetch=()=>resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}));
const score={tempo:120,tracks:[{id:'1',sample:'/audio/test.mp3',steps:Array(16).fill(true),pitch:0,volume:0.5,muted:false}]};
test('stop while a sample is loading prevents any delayed playback', async()=>{
 const engine=new SymphonyEngine();
 const playing=engine.play(score,()=>{});
 await new Promise(resolve=>setImmediate(resolve));
 engine.stop();
 resolveFetch();
 await playing;
 assert.equal(starts.length,0);
 engine.dispose();
});
test('rejects externally hosted sample paths before fetching', async()=>{
 const engine=new SymphonyEngine();
 await assert.rejects(engine.preview('https://example.org/a.mp3',0,1),/sample|audio|URL/i);
 engine.dispose();
});
test('preview skips leading silence and scheduled playback stops cleanly', async()=>{
 starts=[];
 const channel=new Float32Array(44100); channel.fill(0.4,22050);
 Context.prototype.decodeAudioData=async()=>({duration:1,sampleRate:44100,getChannelData:()=>channel});
 globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});
 const engine=new SymphonyEngine();
 await engine.preview('/audio/onset.mp3',0,1);
 assert.equal(starts.length,1);
 assert.ok(starts[0][1]>0.49 && starts[0][1]<0.51);
 await engine.play(score,()=>{});
 assert.ok(starts.length>1);
 engine.stop(); engine.dispose();
});
test('WAV export produces PCM16 stereo without creating or resuming a live context', async()=>{
 let liveContexts=0;
 class Live extends Context {constructor(){super();liveContexts++}}
 class Offline extends Context {
   constructor(channels,length,rate){super();this.length=length;this.rate=rate;}
   async startRendering(){return {numberOfChannels:2,length:this.length,sampleRate:this.rate,getChannelData:()=>new Float32Array(this.length)}}
 }
 globalThis.window={AudioContext:Live,OfflineAudioContext:Offline};
 const engine=new SymphonyEngine();
 const blob=await engine.renderWav(score);
 const bytes=await blob.arrayBuffer();const view=new DataView(bytes);
 assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'RIFF');
 assert.equal(view.getUint16(22,true),2);
 assert.equal(view.getUint16(34,true),16);
 assert.equal(view.getUint32(40,true),Math.ceil((8+0.75)*44100)*4);
 assert.equal(liveContexts,0);
 engine.dispose();
});
