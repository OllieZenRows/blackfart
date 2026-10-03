import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatePulse, generateGroove } from '../app/symphony/music-analysis.ts';
function pulse(bpm, offset=0.173, length=12, start=100) {
  return Array.from({length:Math.round(length/0.025)},(_,i)=>{
    const local=i*0.025, since=((local-offset)%(60/bpm)+60/bpm)%(60/bpm);
    return {time:start+local,energy:since<0.09 ? Math.exp(-since/0.025) : 0};
  });
}
for (const bpm of [60,80,100,112,120,137,160,179]) test(`tempo and phase ${bpm}`,()=>{
  const result=estimatePulse(pulse(bpm)); assert.ok(result);
  assert.ok(Math.abs(result.bpm-bpm)<1,JSON.stringify(result));
  const beatError=Math.abs((result.beatTime-100-0.173)/(60/bpm)-Math.round((result.beatTime-100-0.173)/(60/bpm)))*(60/bpm);
  assert.ok(beatError<0.04,JSON.stringify(result)); assert.ok(result.confidence>0.7);
});
test('silence, short and nonperiodic noise return null',()=>{
  assert.equal(estimatePulse(pulse(112).map(f=>({...f,energy:0}))),null);
  assert.equal(estimatePulse(pulse(112,0.173,2)),null);
  let seed=123;
  const noise=pulse(112).map(f=>({...f,energy:((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)}));
  assert.equal(estimatePulse(noise),null);
});
test('slower recent music replaces historical tempo with bounded compute',()=>{
  const old=pulse(160,0.173,100,0),recent=pulse(80,0.173,16,100);
  const start=performance.now();
  const result=estimatePulse([...old,...recent]);
  assert.ok(result && Math.abs(result.bpm-80)<1);
  assert.ok(performance.now()-start<1000);
});
test('random groove preserves tempo/custom audio and never mutates input',()=>{
  const original={tempo:133,tracks:[{id:'custom',sample:'blob:uploaded',steps:[true],pitch:5,volume:1,muted:true}]};
  const saved=JSON.stringify(original), result=generateGroove(original,()=>0.7);
  assert.equal(result.tempo,133);assert.equal(result.tracks.length,4);assert.equal(result.tracks[0].sample,'blob:uploaded');
  for(const row of result.tracks){assert.equal(row.steps.length,16);assert.ok(row.steps.filter(Boolean).length<=4);assert.equal(row.pitch,0);}
  assert.equal(JSON.stringify(original),saved);
  assert.notDeepEqual(generateGroove(original,()=>0),generateGroove(original,()=>0.99));
});
test('trailing silence and a lone unrelated sound cannot sustain old tempo',()=>{
  const original=pulse(112);
  const silent=original.map(f=>({...f,energy:f.time>110 ? 0 : f.energy}));
  assert.equal(estimatePulse(silent),null);
  // The final blip is deliberately between old beats.
  const last=original.map(f=>({...f,energy:f.time>110 ? (Math.abs(f.time-111.7)<0.012 ? 0.7:0) : f.energy}));
  assert.equal(estimatePulse(last),null);
});
test('mic noise floor and constant sound do not count as music',()=>{
  assert.equal(estimatePulse(pulse(112).map(f=>({...f,energy:f.energy*0.006}))),null);
  assert.equal(estimatePulse(pulse(112).map(f=>({...f,energy:0.7}))),null);
});
function drumPattern(bpm,hat=0.08){
  const period=60/bpm,offset=0.173;
  return Array.from({length:480},(_,i)=>{
    const local=i*0.025-offset;
    let energy=0.01;
    for(let beat=0;beat<100;beat++){
      const elapsed=local-beat*period/2;
      if(elapsed>=0 && elapsed<0.12){
        // Kick on 1/3, snare on 2/4, light eighth-note hats.
        const amplitude=beat%2 ? hat : (beat%4 ? 0.4 : 0.7);
        energy+=amplitude*Math.exp(-elapsed/0.03);
      }
    }
    return {time:100+i*.025,energy};
  });
}
test('kick/snare rhythm with quieter eighth-note hats retains quarter tempo',()=>{
  const result=estimatePulse(drumPattern(112));
  assert.ok(result && Math.abs(result.bpm-112)<1,JSON.stringify(result));
});
test('prominent subdivisions can yield double time; result is still bounded',()=>{
  const result=estimatePulse(drumPattern(80,0.6));
  assert.ok(result && (Math.abs(result.bpm-80)<1 || Math.abs(result.bpm-160)<1),JSON.stringify(result));
});
