/****************************************************************
BeebEm - BBC Micro and Master 128 Emulator
Copyright (C) 1994  David Alan Gilbert
Copyright (C) 1997  Mike Wyatt
Copyright (C) 2001  Richard Gellman
Copyright (C) 2008  Rich Talbot-Watkins

This program is free software; you can redistribute it and/or
modify it under the terms of the GNU General Public License
as published by the Free Software Foundation; either version 2
of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public
License along with this program; if not, write to the Free
Software Foundation, Inc., 51 Franklin Street, Fifth Floor,
Boston, MA  02110-1301, USA.
****************************************************************/

/* Win32 port - Mike Wyatt 7/6/97 */
/* Conveted Win32 port to use DirectSound - Mike Wyatt 11/1/98 */

import { ClearTrigger, getTotalCycles } from "./6502core";
import { REAL_TIME_TARGET } from "./beebwinh";
import { CycleCountWrap } from "./port";

// header

export const SOUNDSUPPORT = true;

export const SAMPLE_HEAD_SEEK_CYCLES_PER_TRACK = 48333; // 0.02415s per track in the sound file
export const SAMPLE_HEAD_STEP_CYCLES = 100000; // 0.05s sound file
export const SAMPLE_HEAD_LOAD_CYCLES = 400000; // 0.2s sound file

type AudioType = {
  Signal: number; // Signal type: data, gap, or tone.
  BytePos: number; // Position in data byte
  Enabled: boolean; // Enable state of audio deooder
  Data: number; // The actual data itself
  Samples: number; // Samples counted in current pattern till changepoint
  CurrentBit: number; // Current bit in data being processed
  ByteCount: number; // Byte repeat counter
};

// main

const SOUND_SAMPLE_RATE = 44100;
const SOUND_EXPONENTIAL_VOLUME = true;
const PART_SAMPLES = true;
const SOUND_CHIP_ENABLED = true;

const MAXBUFSIZE = 32768;

const SoundBuf = new Uint8Array(MAXBUFSIZE);

let SoundAutoTriggerTime = 0;
let SoundBufferSize = SOUND_SAMPLE_RATE / 50; // int

const CSC = [0, 0, 0, 0]; // double
const CSA = [0, 0, 0, 0]; // double ChangeSamps Adjusts

/* Number of places to shift the volume */
const VOLMAG = 3;

const Speech = [0, 0, 0, 0]; // static int

const BeebState76489 = {
  ToneFreq: [0, 0, 0, 0], // unsigned int
  ChangeSamps: [
    0, 0, 0, 0,
  ] /* unsigned int How often this channel should flip its otuput */,
  ToneVolume: [0, 0, 0, 0] /* unsigned int In units of /dev/dsp */,
  Noise: {
    FB: 0, // unsigned int :1; /* =0 for periodic, =1 for white */
    Freq: 0, //unsigned int :2; /* 0=low, 1=medium, 2=high, 3=tone gen 1 freq */
    Vol: 0, // unsigned int :4;
  },
  LastToneFreqSet: 0 /* intthe tone generator last set - for writing the 2nd byte */,
};

let RealVolumes = [0, 0, 0, 0]; // int Holds the real volume values for state save use
let ActiveChannel = [false, false, false, false]; // Those channels with non-0 volume
// Set it to an array for more accurate sound generation

let OurTime = 0.0; /* double Time in sample periods */

let SoundTrigger = 0; /* Time to trigger a sound event */
export const AdjustTriggerSound = (max: number, wrap: number) => {
  if (SoundTrigger != max) SoundTrigger -= wrap;
};

const GenIndex = [0, 0, 0, 0]; /* unsigned int Used by the voice generators */
const GenState = [0, 0, 0, 0]; // int
let bufptr = 0; // int
let SoundTuning = 0.0; // double Tuning offset

const TapeAudio: AudioType = {
  Signal: 0,
  BytePos: 0,
  Enabled: false,
  Data: 0,
  Samples: 0,
  CurrentBit: 0,
  ByteCount: 0,
}; // Tape audio decoder stuff
export const getTapeAudio = () => TapeAudio;

/****************************************************************************/
/* Writes sound data to a sound buffer */
let bufferPlayTime = -1;

let audioCtx: AudioContext | undefined;

document.addEventListener("pointerdown", () => {
  startAudio();
});
document.addEventListener("keydown", () => {
  startAudio();
});

function startAudio() {
  audioCtx ??= new AudioContext({ sampleRate: SOUND_SAMPLE_RATE });
}

function WriteToSoundBuffer(buf: Uint8Array) {
  if (!audioCtx) return;

  if (audioCtx.state !== "running") {
    audioCtx.resume();
    return;
  }

  const myArrayBuffer = audioCtx.createBuffer(
    2,
    SoundBufferSize,
    SOUND_SAMPLE_RATE,
  );

  for (let channel = 0; channel < myArrayBuffer.numberOfChannels; channel++) {
    const nowBuffering = myArrayBuffer.getChannelData(channel);
    for (let i = 0; i < buf.length; i++) {
      nowBuffering[i] = (buf[i] - 128) / 127;
    }
  }

  const source = audioCtx.createBufferSource();

  source.buffer = myArrayBuffer;

  source.connect(audioCtx.destination);

  if (bufferPlayTime === -1 || bufferPlayTime < audioCtx.currentTime) {
    bufferPlayTime = audioCtx.currentTime;
  }

  source.start(bufferPlayTime ?? audioCtx.currentTime);

  bufferPlayTime += 1 / 50;
}

/****************************************************************************/
/* DestTime is in samples */

let per = 0;

/**
 * @param DestTime double
 */
function PlayUpTil(DestTime: number) {
  while (DestTime > OurTime) {
    let bufinc = 0; // int

    for (
      bufinc = 0;
      bufptr < SoundBufferSize && OurTime + bufinc < DestTime;
      bufptr++, bufinc++
    ) {
      let tt = 0;
      let tmptotal = 0;
      if (SOUND_CHIP_ENABLED) {
        // Channels 1 to 3 are tone generators
        for (let channel = 1; channel <= 3; channel++) {
          if (ActiveChannel[channel]) {
            if (GenState[channel] && !Speech[channel])
              tmptotal += BeebState76489.ToneVolume[channel];
            if (!GenState[channel] && !Speech[channel])
              tmptotal -= BeebState76489.ToneVolume[channel];
            if (Speech[channel])
              tmptotal += BeebState76489.ToneVolume[channel] - GetVol(7);
            GenIndex[channel]++;
            tt = Math.trunc(CSC[channel]);
            if (!PART_SAMPLES) tt = 0;
            if (GenIndex[channel] >= BeebState76489.ChangeSamps[channel] + tt) {
              if (CSC[channel] >= 1.0) CSC[channel] -= 1.0;
              CSC[channel] += CSA[channel];
              GenIndex[channel] = 0;
              GenState[channel] ^= 1;
            }
          }
        }
        /* Now put in noise generator stuff */
        if (ActiveChannel[0]) {
          if (BeebState76489.Noise.FB) {
            /* White noise */
            if (GenState[0]) tmptotal += BeebState76489.ToneVolume[0];
            else tmptotal -= BeebState76489.ToneVolume[0];
            GenIndex[0]++;
            switch (BeebState76489.Noise.Freq) {
              case 0 /* Low */:
                if (GenIndex[0] >= SOUND_SAMPLE_RATE / 10000) {
                  GenIndex[0] = 0;
                  GenState[0] = Math.random() > 0.5 ? 1 : 0;
                }
                break;
              case 1 /* Med */:
                if (GenIndex[0] >= SOUND_SAMPLE_RATE / 5000) {
                  GenIndex[0] = 0;
                  GenState[0] = Math.random() > 0.5 ? 1 : 0;
                }
                break;
              case 2 /* High */:
                if (GenIndex[0] >= SOUND_SAMPLE_RATE / 2500) {
                  GenIndex[0] = 0;
                  GenState[0] = Math.random() > 0.5 ? 1 : 0;
                }
                break;
              case 3 /* as channel 1 */:
                if (GenIndex[0] >= BeebState76489.ChangeSamps[1]) {
                  GenIndex[0] = 0;
                  GenState[0] = Math.random() > 0.5 ? 1 : 0;
                }
                break;
            } /* Freq type switch */
          } else {
            /* Periodic */
            if (GenState[0]) tmptotal += BeebState76489.ToneVolume[0];
            else tmptotal -= BeebState76489.ToneVolume[0];
            GenIndex[0]++;
            switch (BeebState76489.Noise.Freq) {
              case 2 /* Low */:
                if (GenState[0]) {
                  if (GenIndex[0] >= SOUND_SAMPLE_RATE / 125) {
                    GenIndex[0] = 0;
                    GenState[0] = 0;
                  }
                } else {
                  if (GenIndex[0] >= SOUND_SAMPLE_RATE / 1250) {
                    GenIndex[0] = 0;
                    GenState[0] = 1;
                  }
                }
                break;
              case 1 /* Med */:
                if (GenState[0]) {
                  if (GenIndex[0] >= SOUND_SAMPLE_RATE / 250) {
                    GenIndex[0] = 0;
                    GenState[0] = 0;
                  }
                } else {
                  if (GenIndex[0] >= SOUND_SAMPLE_RATE / 2500) {
                    GenIndex[0] = 0;
                    GenState[0] = 1;
                  }
                }
                break;
              case 0 /* High */:
                if (GenState[0]) {
                  if (GenIndex[0] >= SOUND_SAMPLE_RATE / 500) {
                    GenIndex[0] = 0;
                    GenState[0] = 0;
                  }
                } else {
                  if (GenIndex[0] >= SOUND_SAMPLE_RATE / 5000) {
                    GenIndex[0] = 0;
                    GenState[0] = 1;
                  }
                }
                break;
              case 3 /* Tone gen 1 */:
                tt = Math.trunc(CSC[0]);
                if (GenIndex[0] >= BeebState76489.ChangeSamps[1] + tt) {
                  CSC[0] += CSA[1] - tt;
                  GenIndex[0] = 0;
                  GenState[0] = per == 0 ? 1 : 0;
                  if (++per == 30) {
                    per = 0;
                  }
                }
                break;
            } /* Freq type switch */
          }
        }
      }

      tmptotal = Math.trunc(tmptotal / 4);

      // 			// Mix in sound samples here
      // 			for (int i = 0; i < NUM_SOUND_SAMPLES; ++i) {
      // 				if (SoundSamples[i].playing) {
      // 					tmptotal+=(SoundSamples[i].pBuf[SoundSamples[i].pos]-128)*2;
      // 					SoundSamples[i].pos += 44100 / SOUND_SAMPLE_RATE;
      // 					if (SoundSamples[i].pos >= SoundSamples[i].len) {
      // 						if (SoundSamples[i].repeat)
      // 							SoundSamples[i].pos = 0;
      // 						else
      // 							SoundSamples[i].playing = false;
      // 					}
      // 				}
      // 			}

      // 			if (TAPE_SOUND_ENABLED) {
      // Mix in tape sound here
      let tapetotal = 0;

      if (TapeAudio.Enabled && TapeAudio.Signal == 2) {
        if (TapeAudio.Samples++ >= 36) TapeAudio.Samples = 0;
        tapetotal = Math.floor(
          Math.sin((TapeAudio.Samples * 20 * Math.PI) / 180) * 20,
        );
      }
      if (TapeAudio.Enabled && TapeAudio.Signal == 1) {
        tapetotal = Math.floor(
          Math.sin(
            (TapeAudio.Samples * (10 * (1 + TapeAudio.CurrentBit)) * Math.PI) /
              180,
          ) *
            (20 + 10 * (1 - TapeAudio.CurrentBit)),
        );
        // And if you can follow that equation, "ill give you the money meself" - Richard Gellman
        if (TapeAudio.Samples++ >= 36) {
          TapeAudio.Samples = 0;
          TapeAudio.BytePos++;
          if (TapeAudio.BytePos <= 10)
            TapeAudio.CurrentBit =
              TapeAudio.Data & (1 << (10 - TapeAudio.BytePos)) ? 1 : 0;
        }
        if (TapeAudio.BytePos > 10) {
          TapeAudio.ByteCount--;
          if (!TapeAudio.ByteCount) {
            TapeAudio.Signal = 2;
          } else {
            TapeAudio.BytePos = 1;
            TapeAudio.CurrentBit = 0;
          }
        }
      }
      tmptotal += tapetotal;
      // 			}

      // Reduce amplitude to reduce clipping
      tmptotal = Math.trunc(tmptotal / 2);

      // Range check
      if (tmptotal > 127) tmptotal = 127;
      if (tmptotal < -127) tmptotal = -127;

      SoundBuf[bufptr] = tmptotal + 128;
    } /* buffer loop */

    /* Only write data when buffer is full */
    if (bufptr == SoundBufferSize) {
      // #ifdef DEBUGSOUNDTOFILE
      // 			FILE *fd = fopen("/audio.dbg", "a+b");
      // 			if (fd != NULL)
      // 			{
      // 				fwrite(SoundBuf, 1, SoundBufferSize, fd);
      // 				fclose(fd);
      // 			}
      // 			else
      // 			{
      // 				mainWin->ReportError("Failed to open audio.dbg");
      // 				exit(1);
      // 			}
      // #else
      WriteToSoundBuffer(SoundBuf);
      // #endif
      // buffer swapping no longer needed
      bufptr = 0;
    }

    OurTime += bufinc;
  }
}

/****************************************************************************/
/* Convert time in cycles to time in samples                                */
let LastBeebCycle = 0; /* static int Last parameter to this function */
let LastOurTime = 0; /* static double Last result of this function */

/**
 * @param BeebCycles int
 * @returns
 */
function CyclesToSamples(BeebCycles: number) {
  let tmp = 0;
  /* OK - beeb cycles are in 2MHz units, ours are in 1/samplerate */
  /* This is all done incrementally - find the number of ticks since the last call
       in both domains.  This does mean this should only be called once */
  /* Extract number of cycles since last call */
  if (BeebCycles < LastBeebCycle) {
    /* Wrap around in beebs time */
    tmp = CycleCountWrap - LastBeebCycle + BeebCycles;
  } else {
    tmp = BeebCycles - LastBeebCycle;
  }

  tmp /= REAL_TIME_TARGET ? REAL_TIME_TARGET : 1;
  /*fprintf(stderr,"Convert tmp=%f\n",tmp); */
  LastBeebCycle = BeebCycles;

  tmp *= SOUND_SAMPLE_RATE;
  tmp /= 2000000.0; /* Few - glad thats a double! */
  LastOurTime += tmp;
  return LastOurTime;
}

/****************************************************************************/
/* Called in sysvia.cpp when a write is made to the 76489 sound chip        */
/**
 * @param value int
 */
export function Sound_RegWrite(value: number) {
  let reg = 0,
    tone = 0,
    channel = 0; // may not be tone, why not index volume and tone with the same index?

  if (value & 0x80) {
    reg = (value >> 4) & 7;
    BeebState76489.LastToneFreqSet = (2 - (reg >> 1)) & 3; // use 3 for noise (0,1->2, 2,3->1, 4,5->0, 6,7->3)
    tone =
      (BeebState76489.ToneFreq[BeebState76489.LastToneFreqSet] & ~15) |
      (value & 15);
  } else {
    reg = ((2 - BeebState76489.LastToneFreqSet) & 3) << 1; // (0->4, 1->2, 2->0, 3->6)
    tone =
      (BeebState76489.ToneFreq[BeebState76489.LastToneFreqSet] & 15) |
      ((value & 0x3f) << 4);
  }

  channel = (1 + BeebState76489.LastToneFreqSet) & 3; // (0->1, 1->2, 2->3, 3->0)

  switch (reg) {
    case 0: // Tone 3 freq
    case 2: // Tone 2 freq
    case 4: // Tone 1 freq
      BeebState76489.ToneFreq[BeebState76489.LastToneFreqSet] = tone;
      SetFreq(channel, tone);
      break;

    case 6: // Noise control
      BeebState76489.Noise.Freq = value & 3;
      BeebState76489.Noise.FB = (value >> 2) & 1;
      break;

    case 1: // Tone 3 vol
    case 3: // Tone 2 vol
    case 5: // Tone 1 vol
    case 7: // Tone 0 vol
      RealVolumes[channel] = value & 15;
      if (BeebState76489.ToneVolume[channel] == 0 && (value & 15) != 15)
        ActiveChannel[channel] = true;
      if (BeebState76489.ToneVolume[channel] != 0 && (value & 15) == 15)
        ActiveChannel[channel] = false;
      BeebState76489.ToneVolume[channel] = GetVol(15 - (value & 15));
      break;
  }

  UpdateSound();
}

/****************************************************************************/

// The 'freqval' variable is the value as seen by the 76489

/**
 *
 * @param Channel int
 * @param freqval int
 */
function SetFreq(Channel: number, freqval: number) {
  //fprintf(sndlog,"Channel %d - Value %d\n",Channel,freqval);

  if (freqval == 0) {
    freqval = 1024;
  }

  if (freqval < 5) {
    Speech[Channel] = 1;
  } else {
    Speech[Channel] = 0;
  }

  const freq = 4000000 / (32 * freqval);

  const t = SOUND_SAMPLE_RATE / freq / 2.0 + SoundTuning;
  const ChangeSamps = /*(int)*/ Math.trunc(t); // Number of samples after which to change

  CSA[Channel] = t - ChangeSamps;
  CSC[Channel] = CSA[Channel]; // We look ahead, so should already include the fraction on the first update

  if (Channel == 1) {
    CSC[0] = CSC[1];
  }

  BeebState76489.ChangeSamps[Channel] = ChangeSamps;
}

/****************************************************************************/

function UpdateSound() {
  const CurrentTimeInSamples = CyclesToSamples(getTotalCycles());
  PlayUpTil(CurrentTimeInSamples);

  SoundTrigger = getTotalCycles() + SoundAutoTriggerTime;
}

export function SoundPoll() {
  if (SoundTrigger <= getTotalCycles()) {
    UpdateSound();
  }
}

// void SoundChipReset() {
//   BeebState76489.LastToneFreqSet=0;
//   BeebState76489.ToneVolume[0]=0;
//   BeebState76489.ToneVolume[1]=BeebState76489.ToneVolume[2]=BeebState76489.ToneVolume[3]=GetVol(15);
//   BeebState76489.ToneFreq[0]=BeebState76489.ToneFreq[1]=BeebState76489.ToneFreq[2]=1000;
//   BeebState76489.ToneFreq[3]=1000;
//   BeebState76489.Noise.FB=0;
//   BeebState76489.Noise.Freq=0;
//   ActiveChannel[0] = false;
//   ActiveChannel[1] = false;
//   ActiveChannel[2] = false;
//   ActiveChannel[3] = false;
// }

/****************************************************************************/
/* Called to enable sound output                                            */
export function SoundInit() {
  SoundTrigger = ClearTrigger();
  LastBeebCycle = getTotalCycles();
  LastOurTime = (LastBeebCycle * SOUND_SAMPLE_RATE) / 2000000.0;
  OurTime = LastOurTime;
  bufptr = 0;
  //InitAudioDev();
  SoundAutoTriggerTime = 5000;
  /*if (SOUND_SAMPLE_RATE == 44100) SoundAutoTriggerTime = 5000;
  if (SOUND_SAMPLE_RATE == 22050) SoundAutoTriggerTime = 10000;
  if (SOUND_SAMPLE_RATE == 11025) SoundAutoTriggerTime = 20000;*/
  SoundBufferSize =
    /*pSoundStreamer ? pSoundStreamer->BufferSize() :*/ SOUND_SAMPLE_RATE / 50;
  //LoadSoundSamples();
  SoundTrigger = getTotalCycles() + SoundAutoTriggerTime;
}

export function SwitchOnSound() {
  SetFreq(3, 1000);
  ActiveChannel[3] = true;
  BeebState76489.ToneVolume[3] = GetVol(15);
}

// void SetSound(SoundState state)
// {
// 	switch (state)
// 	{
// 	case SoundState::Muted:
// 		SoundStreamer::PauseAll();
// 		break;
// 	case SoundState::Unmuted:
// 		SoundStreamer::PlayAll();
// 		break;
// 	}
// }

/****************************************************************************/
/* Called to disable sound output                                           */
export function SoundReset() {
  //   if (pSoundStreamer != nullptr) {
  //     delete pSoundStreamer;
  //     pSoundStreamer = nullptr;
  //   }

  SoundTrigger = ClearTrigger();
}

/**
 * @param vol int
 * @returns
 */
function GetVol(vol: number) {
  if (SOUND_EXPONENTIAL_VOLUME) {
    //		static int expVol[] = { 0,  2,  4,  6,  9, 12, 15, 19, 24, 30, 38, 48, 60, 76,  95, 120 };
    const expVol = [
      0, 11, 14, 17, 20, 24, 28, 33, 39, 46, 54, 63, 74, 87, 102, 120,
    ]; // static const int
    if (vol >= 0 && vol <= 15) return expVol[vol];
    else return 0;
  } else {
    return vol << VOLMAG;
  }
}
