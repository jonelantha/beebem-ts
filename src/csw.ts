/****************************************************************
BeebEm - BBC Micro and Master 128 Emulator
Copyright (C) 2006  Jon Welch

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

// Created by Jon Welch on 27/08/2006.

import { fetchTape } from "./fetcher";
import { getClk_Divide, setClk_Divide } from "./serial";
import { TapeMapEntry } from "./TapeMap";

// header

type CSWState = "WaitingForTone" | "Tone" | "Data" | "Undefined";

// main

let csw_buff: DataView | null = null;

let csw_tonecount = 0;

let csw_state: CSWState = "WaitingForTone";
export const setCSWState = (state: CSWState) => (csw_state = state);
export const getCSWState = () => csw_state;

type CSWDataState = "ReceivingData" | "StopBits" | "ToneOrStartBit";

let csw_datastate: CSWDataState = "ToneOrStartBit";
let csw_bit = 0;
let csw_pulselen = 0;
let csw_ptr = 0;
export const getCSWptr = () => getCSWptr;
export const setCSWptr = (ptr: number) => (csw_ptr = ptr);

let csw_byte = 0;
let csw_pulsecount = 0;
let bit_count = 0;
let CSWPollCycles = 0;
export const getCSWPollCycles = () => CSWPollCycles;

export async function CSWOpen(FileName: string): Promise<void> {
  CSWClose();

  const buffer = await fetchTape(FileName);

  // if (csw_file == nullptr)
  // {
  // 	return "OpenFailed";
  // }

  /* Read header */
  const headerString = new TextDecoder("ascii").decode(
    new Uint8Array(buffer, 0, 0x16),
  );

  if (headerString !== "Compressed Square Wave") {
    throw "InvalidCSWFile";
  }

  const headerData = new DataView(buffer, 0, 0x34);

  if (headerData.getUint8(0x16) !== 0x1a) {
    throw "InvalidCSWFile";
  }

  // WriteLog("CSW version: %d.%d\n", (int)file_buf[0x17], (int)file_buf[0x18]);

  const sample_rate = headerData.getUint32(0x19, true);
  //   const total_samples = headerData.getUint32(0x1d, true);
  //   const compression_type = headerData.getUint8(0x21);
  //   const flags = headerData.getUint8(0x22);
  const headerExt = headerData.getUint8(0x23);

  // WriteLog("Sample rate: %d\n", sample_rate);
  // WriteLog("Total Samples: %d\n", total_samples);
  // WriteLog("Compressing: %d\n", compression_type);
  // WriteLog("Flags: %x\n", flags);
  // WriteLog("Header ext: %d\n", header_ext);

  // file_buf[0x33] = 0;
  // WriteLog("Enc appl: %s\n", &file_buf[0x24]);

  // Read header extension bytes

  const sourceBuff = new Uint8Array(buffer, 0x34 + headerExt);

  const decodedStream = new Blob([sourceBuff])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"));

  csw_buff = new DataView(await new Response(decodedStream).arrayBuffer());

  // WriteLog("Source Size = %d\n", sourcesize);
  // WriteLog("Uncompressed Size = %d\n", csw_bufflen);

  CSWPollCycles = Math.floor(2000000 / sample_rate - 1);
  csw_state = "WaitingForTone";
  csw_bit = 0;
  csw_pulselen = 0;
  csw_ptr = 0;
  csw_pulsecount = -1;
  csw_tonecount = 0;
  bit_count = -1;
}

export function CSWClose() {
  csw_buff = null;
}

// /*
// void HexDump(const char *buff, int count)
// {
// 	char info[80];

// 	for (int a = 0; a < count; a += 16) {
// 		sprintf(info, "%04X  ", a);

// 		for (int b = 0; b < 16; ++b) {
// 			sprintf(info+strlen(info), "%02X ", buff[a+b]);
// 		}

// 		for (int b = 0; b < 16; ++b) {
// 			int v = buff[a+b];
// 			if (v < 32 || v > 127)
// 				v = '.';
// 			sprintf(info+strlen(info), "%c", v);
// 		}

// 		WriteLog("%s\n", info);
// 	}
// }
// */

export function CSWCreateTapeMap() {
  if (!csw_buff) throw "no csw_buff";

  let last_state: CSWState = "Undefined";
  const block = new Uint8Array(65535);
  let block_ptr = -1;

  let std_last_block = true;
  let last_tone = 0;

  setClk_Divide(16);

  const tapeMap: TapeMapEntry[] = [];

  let start_time = 0;
  let blk_num = 0;

  while (csw_ptr + 4 < csw_buff.byteLength) {
    last_state = csw_state;
    const data = CSWPoll();

    if (last_state == "Tone" && csw_state == "Data") {
      block_ptr = 0;
      block.fill(0, 0, 32);
      start_time = csw_ptr;
    }
    if (last_state != csw_state && csw_state == "Tone") {
      // Remember start position of last tone state
      last_tone = csw_ptr;
    }
    if (
      last_state == "Data" &&
      csw_state == "WaitingForTone" &&
      block_ptr > 0
    ) {
      // WriteLog("Decoded Block of length %d, starting at %d\n", block_ptr, start_time);
      // HexDump(block, block_ptr);
      if (block_ptr == 1 && block[0] == 0x80 && getClk_Divide() != 64) {
        // 300 baud block?
        setClk_Divide(64);
        csw_ptr = last_tone;
        csw_state = "Tone";
        // WriteLog("Detected 300 baud block, resetting ptr to %d\n", csw_ptr);
        continue;
      }
      if (block_ptr == 3 && getClk_Divide() != 16) {
        // 1200 baud block ?
        setClk_Divide(16);
        csw_ptr = last_tone;
        csw_state = "Tone";
        // WriteLog("Detected 1200 baud block, resetting ptr to %d\n", csw_ptr);
        continue;
      }
      // End of block, standard header?
      if (block_ptr > 20 && block[0] == 0x2a) {
        if (!std_last_block) {
          // Change of block type, must be first block
          blk_num = 0;
          if (tapeMap.length > 0 && tapeMap[tapeMap.length - 1].desc != "") {
            tapeMap.push({ desc: "", time: start_time });
          }
        }
        // Pull file name from block
        let n = 1;
        let name = "";
        while (block[n] != 0 && block[n] >= 32 && n <= 10) {
          name += String.fromCharCode(block[n]);
          n++;
        }
        const desc = `${(name != "" ? name : "<No name>").padEnd(13)} ${blk_num.toString(16)}  Length ${block_ptr.toString(16)}`;

        tapeMap.push({ desc, time: start_time });
        // Is this the last block for this file?
        if (block[name.length + 14] & 0x80) {
          blk_num = -1;
          tapeMap.push({ desc: "", time: csw_ptr });
        }
        std_last_block = true;
      } else {
        if (std_last_block) {
          // Change of block type, must be first block
          blk_num = 0;
          if (tapeMap.length > 0 && tapeMap[tapeMap.length - 1].desc != "") {
            tapeMap.push({ desc: "", time: csw_ptr });
          }
        }
        const desc = `Non-standard ${blk_num.toString(16)}  Length ${block_ptr.toString(16)}`;
        tapeMap.push({ desc, time: start_time });

        std_last_block = false;
      }
      // Data block recorded
      blk_num = (blk_num + 1) & 255;
      block_ptr = -1;
    }
    if (data != -1 && block_ptr >= 0) {
      block[block_ptr++] = data;
    }
  }

  //for (const line of TapeMap) console.log(line);

  csw_state = "WaitingForTone";
  csw_bit = 0;
  csw_pulselen = 0;
  csw_ptr = 0;
  csw_pulsecount = -1;
  csw_tonecount = 0;
  bit_count = -1;

  return tapeMap;
}

let last = -1;
function csw_data() {
  if (!csw_buff) throw "no csw_buff";

  let t = 0;
  let j = 1;

  const Clk_Divide = getClk_Divide();
  if (last != Clk_Divide) {
    // WriteLog("Baud Rate changed to %s\n", (Clk_Divide == 16) ? "1200" : "300");
    last = Clk_Divide;
  }

  if (Clk_Divide == 16) j = 1; // 1200 baud
  if (Clk_Divide == 64) j = 4; // 300 baud

  // JW 18/11/06
  // For 300 baud, just average 4 samples
  // Really need to adjust clock speed as well, as we are loading 300 baud 4 times too quick !
  // But it works

  if (csw_state == "WaitingForTone" || csw_state == "Tone") {
    // Only read 1 bit whilst looking for start bit
    j = 1;
  }

  for (let i = 0; i < j; ++i) {
    csw_pulsecount++;

    if (csw_ptr === csw_buff.byteLength || csw_buff.getUint8(csw_ptr) == 0) {
      if (csw_ptr + 4 < csw_buff.byteLength) {
        csw_ptr++;

        csw_pulselen = csw_buff.getUint32(csw_ptr, true);
        csw_ptr += 4;
      } else {
        csw_pulselen = -1;
        csw_state = "WaitingForTone";
        return csw_pulselen;
      }
    } else {
      csw_pulselen = csw_buff.getUint8(csw_ptr);
      csw_ptr++;
    }

    t += csw_pulselen;
  }

  // WriteLog("Pulse %d, duration %d\n", csw_pulsecount, csw_pulselen);

  return t / j;
}

/* Called every sample rate 44,100 Hz */

export function CSWPoll() {
  let ret = -1;
  if (bit_count == -1) {
    bit_count = csw_data();
    if (bit_count == -1) {
      CSWClose();
      return ret;
    }
  }
  if (bit_count > 0) {
    bit_count--;
    return ret;
  }
  // WriteLog("csw_pulsecount %d, csw_bit %d\n", csw_pulsecount, csw_bit);
  switch (csw_state) {
    case "WaitingForTone":
      if (csw_pulselen < 0x0d) {
        // Count tone pulses
        csw_tonecount++;
        if (csw_tonecount > 20) {
          // Arbitary figure
          // WriteLog("Detected tone at %d\n", csw_pulsecount);
          csw_state = "Tone";
        }
      } else {
        csw_tonecount = 0;
      }
      break;
    case "Tone":
      if (csw_pulselen > 0x14) {
        // Noise so reset back to wait for tone again
        csw_state = "WaitingForTone";
        csw_tonecount = 0;
      } else if (csw_pulselen > 0x0d && csw_pulselen < 0x14) {
        // Not in tone any more - data start bit
        // WriteLog("Entered data at %d\n", csw_pulsecount);
        if (getClk_Divide() == 64) {
          // Skip 300 baud data
          csw_data();
          csw_data();
          csw_data();
        }
        bit_count = csw_data(); // Skip next half of wave
        if (getClk_Divide() == 64) {
          // Skip 300 baud data
          csw_data();
          csw_data();
          csw_data();
        }
        csw_state = "Data";
        csw_bit = 0;
        csw_byte = 0;
        csw_datastate = "ReceivingData";
      }
      break;
    case "Data":
      switch (csw_datastate) {
        case "ReceivingData":
          bit_count = csw_data(); // Skip next half of wave
          csw_byte >>= 1;
          if (csw_pulselen > 0x14) {
            // Noisy pulse so reset to tone
            csw_state = "WaitingForTone";
            csw_tonecount = 0;
            break;
          }
          if (csw_pulselen <= 0x0d) {
            bit_count += csw_data();
            bit_count += csw_data();
            csw_byte |= 0x80;
          }
          if (++csw_bit == 8) {
            ret = csw_byte;
            // WriteLog("Returned data byte of %02x at %d\n", ret, csw_pulsecount);
            csw_datastate = "StopBits";
          }
          break;
        case "StopBits":
          bit_count = csw_data();
          if (csw_pulselen > 0x14) {
            // Noisy pulse so reset to tone
            csw_state = "WaitingForTone";
            csw_tonecount = 0;
            break;
          }
          if (csw_pulselen <= 0x0d) {
            bit_count += csw_data();
            bit_count += csw_data();
          }
          csw_datastate = "ToneOrStartBit"; // tone/start bit
          break;
        case "ToneOrStartBit":
          if (csw_pulselen > 0x14) {
            // Noisy pulse so reset to tone
            csw_state = "WaitingForTone";
            csw_tonecount = 0;
            break;
          }
          if (csw_pulselen <= 0x0d) {
            // Back in tone again
            // WriteLog("Back in tone again at %d\n", csw_pulsecount);
            csw_state = "WaitingForTone";
            csw_tonecount = 0;
            csw_bit = 0;
          } else {
            // Start bit
            bit_count = csw_data(); // Skip next half of wave
            csw_bit = 0;
            csw_byte = 0;
            csw_datastate = "ReceivingData";
          }
          break;
      }
      break;
  }
  bit_count += csw_data(); // Get next bit
  return ret;
}
