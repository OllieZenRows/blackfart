#!/usr/bin/env python3
"""Build percussion kit from local CC0 recordings. Requires numpy, scipy and soundfile.
Usage: python3 scripts/build-efm-kit.py [source_directory] [output_directory]
The Squeak note uses the original squeaky.mp3 recording.
MP3 decoding requires SoundFile; add its install directory with EFM_AUDIO_DEPS.
No pitch shifting or additional recording download is used.
"""
import sys,json,pathlib,hashlib,wave,os
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter,sosfiltfilt,resample_poly
from math import gcd
SRC=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path(__file__).resolve().parents[1]/'public/audio'
OUT=pathlib.Path(sys.argv[2]) if len(sys.argv)>2 else SRC/'efm'
OUT.mkdir(parents=True,exist_ok=True)
metadata={s['key']:s for s in json.loads((SRC/'sources.json').read_text())}
# name, title, original WAV key, exact cut start/duration, lowpass, output RMS
notes=[('low-puff','Low puff','original',.035,.280,2800,.14),
 ('soft-pop','Soft pop','aftershock',.390,.230,2600,.14),
 ('dry-tap','Dry tap','cosmic',.110,.190,3200,.14),
 ('airy-tick','Airy tick','curry',.040,.140,2900,.12),
 ('warm-rumble','Warm rumble','loose',.525,.300,2600,.14),
 ('mellow-squeak','Mellow squeak','squeaky',1.065,.275,2500,.125)]
manifest=[]
for name,title,key,start,duration,lp,target in notes:
 p=SRC/(key+('.mp3' if key=='squeaky' else '.wav'))
 if key=='squeaky':
  if os.environ.get('EFM_AUDIO_DEPS'): sys.path.append(os.environ['EFM_AUDIO_DEPS'])
  import soundfile as sf
  x,sr=sf.read(str(p))
 else: sr,x=wavfile.read(str(p))
 if np.issubdtype(x.dtype,np.integer): x=x.astype(float)/max(abs(np.iinfo(x.dtype).min),np.iinfo(x.dtype).max)
 if x.ndim>1:x=x.mean(axis=1)
 x=x[int(round(start*sr)):int(round((start+duration)*sr))].copy()
 if sr!=44100: g=gcd(sr,44100);x=resample_poly(x,44100//g,sr//g);sr=44100
 x-=x.mean()
 x=sosfiltfilt(butter(3,45,fs=sr,btype='highpass',output='sos'),x)
 x=sosfiltfilt(butter(3,lp,fs=sr,btype='lowpass',output='sos'),x)
 # Broad lowpass and short cosine-squared edges retain natural flutter while preventing clicks.
 n=len(x); attack=round(.008*sr); tail=round(.055*sr)
 envelope=np.ones(n);envelope[:attack]=np.sin(np.linspace(0,np.pi/2,attack))**2;envelope[-tail:]=np.cos(np.linspace(0,np.pi/2,tail))**2
 x*=envelope
 rms=np.sqrt(np.mean(x*x)); gain=min(target/max(rms,1e-12),.69/max(abs(x)))
 x*=gain;pcm=np.rint(np.clip(x,-1,1)*32767).astype('<i2');wavfile.write(str(OUT/(name+'.wav')),sr,pcm)
 y=pcm.astype(float)/32768; peak=max(abs(y)); rms=np.sqrt(np.mean(y*y))
 m=metadata[key]
 manifest.append(dict(file=name+'.wav',title=title,source_file='../'+p.name,source_original_mp3='../'+key+'.mp3',source_sha256=hashlib.sha256(p.read_bytes()).hexdigest(),source_url=m['source'],creator=m['creator'],license=m['license'],license_url=m['license_url'],offset_seconds=start,length_seconds=duration,processing=dict(mono=True,sample_rate=sr,bit_depth=16,dc_removed=True,highpass_hz=45,lowpass_hz=lp,butterworth_order=3,filtering='zero-phase',attack_ms=8,tail_ms=55,envelope='cosine squared edges',gain=round(gain,6),pitch_semitones=0,time_stretch=False),metrics=dict(duration_seconds=len(y)/sr,peak=round(peak,6),peak_dbfs=round(20*np.log10(peak),2),rms=round(rms,6),rms_dbfs=round(20*np.log10(rms),2),clipped_samples=int(np.sum(abs(pcm.astype(int))>=32767)),first_sample=int(pcm[0]),last_sample=int(pcm[-1]))))
(OUT/'manifest.json').write_text(json.dumps(dict(kit='EFM',auditioned=False,notes=manifest),indent=2)+'\n')
for m in manifest: print(m['file'],m['metrics'])
