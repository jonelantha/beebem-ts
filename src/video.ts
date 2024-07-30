/****************************************************************
BeebEm - BBC Micro and Master 128 Emulator
Copyright (C) 1994  David Alan Gilbert
Copyright (C) 1994  Nigel Magnay
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

import { BeebMemPtrWithWrap, BeebMemPtrWithWrapMode7, getMem } from "./beebmem";
import {
  doHorizLine,
  GetLinePtr,
  getScreenBuffer,
  SixteenUChars,
  updateLines,
  writeSixteenUChars,
  tempUpdate,
  doInvHorizLine,
} from "./beebwin";

export const drawWidth = 800;
export const drawHeight = 512;

// from header

export const MAX_VIDEO_SCAN_LINES = 312;

// main

/* Bit assignments in control reg:
   0 - Flash colour (0=first colour, 1=second)
   1 - Teletext select (0=on chip serialiser, 1=teletext)
 2,3 - Bytes per line (2,3=1,1 is 80, 1,0=40, 0,1=20, 0,0=10)
   4 - CRTC Clock chip select (0 = low frequency, 1= high frequency)
 5,6 - Cursor width in bytes (0,0 = 1 byte, 0,1=not defined, 1,0=2, 1,1=4)
   7 - Master cursor width (if set causes large cursor)
  */

let FastTableDWidth: SixteenUChars[] = [];
let FastTable_Valid = false;

let LineRoutine: (() => void) | undefined;

// Translates middle bits of VideoULA_ControlReg to number of colours
const NColsLookup = [
  16,
  4,
  2,
  0 /* Not supported 16? */,
  0,
  16,
  4,
  2, // Based on AUG 379
] as const;

let VideoULA_ControlReg = 0x9c; // VidULA
const VideoULA_Palette = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

// let CRTCControlReg = 0; // unsigned char
let CRTC_HorizontalTotal = 127; /* R0 */
let CRTC_HorizontalDisplayed = 80; /* R1 */
let CRTC_HorizontalSyncPos = 98; /* R2 */
let CRTC_SyncWidth = 0x28; /* R3 - top 4 bits are Vertical (in scan lines) and bottom 4 are horizontal in characters */
let CRTC_VerticalTotal = 38; /* R4 */
let CRTC_VerticalTotalAdjust = 0; /* R5 */
let CRTC_VerticalDisplayed = 32; /* R6 */
let CRTC_VerticalSyncPos = 34; /* R7 */
let CRTC_InterlaceAndDelay = 0; /* R8 - 0,1 are interlace modes, 4,5 display blanking delay, 6,7 cursor blanking delay */
let CRTC_ScanLinesPerChar = 7; /* R9 */
let CRTC_CursorStart = 0; /* R10 */
let CRTC_CursorEnd = 0; /* R11 */
let CRTC_ScreenStartHigh = 6; /* R12 */
let CRTC_ScreenStartLow = 0; /* R13 */
let CRTC_CursorPosHigh = 0; /* R14 */
let CRTC_CursorPosLow = 0; /* R15 */
// let CRTC_LightPenHigh=0;          /* R16 */
// let CRTC_LightPenLow=0;           /* R17 */

let ActualScreenWidth = 640;
export const getActualScreenWidth = () => ActualScreenWidth;
let ScreenAdjust = 0; // Mode 7 Defaults.
export const getScreenAdjust = () => ScreenAdjust;
let VScreenAdjust = 0;
let HSyncModifier = 9;
let TeletextEnabled = false;
export const getTeletextEnabled = () => TeletextEnabled;
let TeletextStyle = 1; // Defines whether teletext will skip intermediate lines in order to speed up
export const getTeletextStyle = () => TeletextStyle;
let CurY = -1;

/* CharLine counts from the 'reference point' - i.e. the point at which we reset the address pointer - NOT
  the point of the sync. If it is -ve its actually in the adjust time */
type VideoState = {
  Addr: number /* Address of start of next visible character line in beeb memory  - raw */;
  StartAddr: number /* Address of start of first character line in beeb memory  - raw */;
  PixmapLine: number /* Current line in the pixmap */;
  FirstPixmapLine: number /* The first pixmap line where something is visible.  Used to eliminate the
                            blank vertical retrace lines at the top of the screen. */;
  PreviousFirstPixmapLine: number /* The first pixmap line on the previous frame */;
  LastPixmapLine: number /* The last pixmap line where something is visible.  Used to eliminate the
                            blank vertical retrace lines at the bottom of the screen. */;
  PreviousLastPixmapLine: number /* The last pixmap line on the previous frame */;
  IsTeletext: boolean /* This frame is a teletext frame - do things differently */;
  DataPtr: number /* Pointer into host memory of video data */;

  CharLine: number /* 6845 counts in characters vertically - 0 at the top , incs by 1 - -1 means we are in the bit before the actual display starts */;
  InCharLineUp: number /* Scanline within a character line - counts up*/;
  VSyncState: number; // Cannot =0 in MSVC $NRM; /* When >0 VSync is high */
  IsNewTVFrame: boolean; // Specifies the start of a new TV frame, following VSync (used so we only calibrate speed once per frame)
  InterlaceFrame: boolean;
  DoCA1Int: boolean;
};

let VideoState: VideoState = {
  Addr: 0,
  StartAddr: 0,
  PixmapLine: 0,
  FirstPixmapLine: 0,
  PreviousFirstPixmapLine: 0,
  LastPixmapLine: 0,
  PreviousLastPixmapLine: 0,
  IsTeletext: false,
  DataPtr: 0,
  CharLine: 0,
  InCharLineUp: 0,
  VSyncState: 0,
  IsNewTVFrame: false,
  InterlaceFrame: false,
  DoCA1Int: false,
};

//   int VideoTriggerCount=9999; /* Number of cycles before next scanline service */

// First subscript is graphics flag (1 for graphics, 2 for separated graphics),
// next is character, then scanline
// character is (value & 127) - 32
// There are 20 rows, to account for "half pixels"
const Mode7Font = new Uint16Array(3 * 96 * 20); //[3][96][20];
const Mode7FontIndex = (fontType: number, char: number, scanline: number) =>
  fontType * 96 * 20 + char * 20 + scanline;

let Mode7FlashOn = true; // true if a flashing character in mode 7 is on
const Mode7DoubleHeightFlags: boolean[] = new Array(80).fill(false); // Pessimistic size for this flags - if true then corresponding character on NEXT line is top half
let CurrentLineBottom = false;
let NextLineBottom = false; // true if the next line of double height should be bottoms only

// /* Flash every half second(?) i.e. 25 x 50Hz fields */
// // No. On time is longer than off time. - according to my datasheet, its 0.75Hz with 3:1 ON:OFF ratio. - Richard Gellman
// // cant see that myself.. i think it means on for 0.75 secs, off for 0.25 secs
// #define MODE7FLASHFREQUENCY 25
const MODE7ONFIELDS = 37;
const MODE7OFFFIELDS = 13;

let CursorFieldCount = 32;
let CursorOnState = true;
let Mode7FlashTrigger = MODE7ONFIELDS;

// /* If 1 then refresh on every display, else refresh every n'th display */
// int Video_RefreshFrequency=1;

/* The number of the current frame - starts at Video_RefreshFrequency - at 0 actually refresh */
let FrameNum = 0;
/*-------------------------------------------------------------------------------------------------------------*/

// Build enhanced mode 7 font

function tempDrawChar(fontType: number, char: number, x: number, y: number) {
  const screenBuffer = getScreenBuffer();
  for (let charY = 0; charY < 20; charY++) {
    const scanline = Mode7Font[Mode7FontIndex(fontType, char, charY)];

    for (let charX = 0; charX < 16; charX++) {
      const bit = 1 << (16 - charX);
      screenBuffer[charX + x * 16 + drawWidth * (charY + y * 20)] =
        scanline & bit ? 0xff000000 : 0;
    }
  }
}

function tempPlotCharset(fontType: number) {
  let x = 0;
  let y = 0;
  for (let i = 0; i < 96; i++) {
    tempDrawChar(fontType, i, x, y);

    x++;
    if (x === 20) {
      x = 0;
      y++;
    }
  }
  tempUpdate();
}

export async function BuildMode7Font(filename: string) {
  const res = await fetch(filename);
  const buffer = await res.arrayBuffer();
  const fileContents = new Uint16Array(buffer);
  let filePointer = 0;

  for (let Character = 32; Character <= 127; Character++) {
    // The first two lines of each character are blank.
    Mode7Font[Mode7FontIndex(0, Character - 32, 0)] = 0;
    Mode7Font[Mode7FontIndex(0, Character - 32, 1)] = 0;
    Mode7Font[Mode7FontIndex(1, Character - 32, 0)] = 0;
    Mode7Font[Mode7FontIndex(1, Character - 32, 1)] = 0;
    Mode7Font[Mode7FontIndex(2, Character - 32, 0)] = 0;
    Mode7Font[Mode7FontIndex(2, Character - 32, 1)] = 0;

    // Read 18 lines of 16 pixels each from the file.
    for (let y = 2; y < 20; y++) {
      const Bitmap = fileContents[filePointer++];
      Mode7Font[Mode7FontIndex(0, Character - 32, y)] = Bitmap << 2; // Text bank
      Mode7Font[Mode7FontIndex(1, Character - 32, y)] = Bitmap << 2; // Contiguous graphics bank
      Mode7Font[Mode7FontIndex(2, Character - 32, y)] = Bitmap << 2; // Separated graphics bank
    }
  }

  // Now fill in the graphics - this is built from an algorithm, but has certain
  // lines/columns blanked for separated graphics.
  for (let Character = 0; Character < 96; Character++) {
    // Here's how it works:
    // - top two blocks: 1 & 2
    // - middle two blocks: 4 & 8
    // - bottom two blocks: 16 & 64
    // - its only a graphics character if bit 5 (32) is clear
    if ((Character & 32) == 0) {
      // Row builders for mode 7 sixel graphics
      let row1 = 0;
      let row2 = 0;
      let row3 = 0;
      // Left sixel has a value of 0xfc0, right 0x03f and both 0xfff
      if (Character & 0x01) row1 |= 0xfc0; // 1111 1100 0000
      if (Character & 0x02) row1 |= 0x03f; // 0000 0011 1111
      if (Character & 0x04) row2 |= 0xfc0;
      if (Character & 0x08) row2 |= 0x03f;
      if (Character & 0x10) row3 |= 0xfc0;
      if (Character & 0x40) row3 |= 0x03f;
      // Now input these values into the array
      // Top row of sixel - continuous
      Mode7Font[Mode7FontIndex(1, Character, 0)] = row1;
      Mode7Font[Mode7FontIndex(1, Character, 1)] = row1;
      Mode7Font[Mode7FontIndex(1, Character, 2)] = row1;
      Mode7Font[Mode7FontIndex(1, Character, 3)] = row1;
      Mode7Font[Mode7FontIndex(1, Character, 4)] = row1;
      Mode7Font[Mode7FontIndex(1, Character, 5)] = row1;
      // Middle row of sixel - continuous
      Mode7Font[Mode7FontIndex(1, Character, 6)] = row2;
      Mode7Font[Mode7FontIndex(1, Character, 7)] = row2;
      Mode7Font[Mode7FontIndex(1, Character, 8)] = row2;
      Mode7Font[Mode7FontIndex(1, Character, 9)] = row2;
      Mode7Font[Mode7FontIndex(1, Character, 10)] = row2;
      Mode7Font[Mode7FontIndex(1, Character, 11)] = row2;
      Mode7Font[Mode7FontIndex(1, Character, 12)] = row2;
      Mode7Font[Mode7FontIndex(1, Character, 13)] = row2;
      // Bottom row of sixel - continuous
      Mode7Font[Mode7FontIndex(1, Character, 14)] = row3;
      Mode7Font[Mode7FontIndex(1, Character, 15)] = row3;
      Mode7Font[Mode7FontIndex(1, Character, 16)] = row3;
      Mode7Font[Mode7FontIndex(1, Character, 17)] = row3;
      Mode7Font[Mode7FontIndex(1, Character, 18)] = row3;
      Mode7Font[Mode7FontIndex(1, Character, 19)] = row3;
      // Separated - insert gaps 0011 1100 1111
      row1 &= 0x3cf;
      row2 &= 0x3cf;
      row3 &= 0x3cf;
      // Top row of sixel - separated
      Mode7Font[Mode7FontIndex(2, Character, 0)] = row1;
      Mode7Font[Mode7FontIndex(2, Character, 1)] = row1;
      Mode7Font[Mode7FontIndex(2, Character, 2)] = row1;
      Mode7Font[Mode7FontIndex(2, Character, 3)] = row1;
      Mode7Font[Mode7FontIndex(2, Character, 4)] = 0;
      Mode7Font[Mode7FontIndex(2, Character, 5)] = 0;
      // Middle row of sixel - separated
      Mode7Font[Mode7FontIndex(2, Character, 6)] = row2;
      Mode7Font[Mode7FontIndex(2, Character, 7)] = row2;
      Mode7Font[Mode7FontIndex(2, Character, 8)] = row2;
      Mode7Font[Mode7FontIndex(2, Character, 9)] = row2;
      Mode7Font[Mode7FontIndex(2, Character, 10)] = row2;
      Mode7Font[Mode7FontIndex(2, Character, 11)] = row2;
      Mode7Font[Mode7FontIndex(2, Character, 12)] = 0;
      Mode7Font[Mode7FontIndex(2, Character, 13)] = 0;
      // Bottom row of sixel - separated
      Mode7Font[Mode7FontIndex(2, Character, 14)] = row3;
      Mode7Font[Mode7FontIndex(2, Character, 15)] = row3;
      Mode7Font[Mode7FontIndex(2, Character, 16)] = row3;
      Mode7Font[Mode7FontIndex(2, Character, 17)] = row3;
      Mode7Font[Mode7FontIndex(2, Character, 18)] = 0;
      Mode7Font[Mode7FontIndex(2, Character, 19)] = 0;
    }
  }

  //tempPlotCharset(0);
}

/*-------------------------------------------------------------------------------------------------------------*/
/* Some guess work and experimentation has determined that the left most pixel uses bits 7,5,3,1 for the       */
/* palette address, the next uses 6,4,2,0, the next uses 5,3,1,H (H=High), then 5,2,0,H                        */
function DoFastTable4XStep4() {
  for (let beebpixv = 0; beebpixv < 256; beebpixv++) {
    FastTableDWidth[beebpixv] = [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ];
    let pentry =
      (beebpixv & 128 ? 8 : 0) |
      (beebpixv & 32 ? 4 : 0) |
      (beebpixv & 8 ? 2 : 0) |
      (beebpixv & 2 ? 1 : 0);

    let tmp = VideoULA_Palette[pentry];

    if (tmp > 7) {
      tmp &= 7;
      if (VideoULA_ControlReg & 1) tmp ^= 7;
    }

    FastTableDWidth[beebpixv][0] =
      FastTableDWidth[beebpixv][1] =
      FastTableDWidth[beebpixv][2] =
      FastTableDWidth[beebpixv][3] =
        tmp;

    pentry =
      (beebpixv & 64 ? 8 : 0) |
      (beebpixv & 16 ? 4 : 0) |
      (beebpixv & 4 ? 2 : 0) |
      (beebpixv & 1 ? 1 : 0);

    tmp = VideoULA_Palette[pentry];

    if (tmp > 7) {
      tmp &= 7;
      if (VideoULA_ControlReg & 1) tmp ^= 7;
    }

    FastTableDWidth[beebpixv][4] =
      FastTableDWidth[beebpixv][5] =
      FastTableDWidth[beebpixv][6] =
      FastTableDWidth[beebpixv][7] =
        tmp;

    pentry =
      (beebpixv & 32 ? 8 : 0) |
      (beebpixv & 8 ? 4 : 0) |
      (beebpixv & 2 ? 2 : 0) |
      1;

    tmp = VideoULA_Palette[pentry];

    if (tmp > 7) {
      tmp &= 7;
      if (VideoULA_ControlReg & 1) tmp ^= 7;
    }

    FastTableDWidth[beebpixv][8] =
      FastTableDWidth[beebpixv][9] =
      FastTableDWidth[beebpixv][10] =
      FastTableDWidth[beebpixv][11] =
        tmp;

    pentry =
      (beebpixv & 16 ? 8 : 0) |
      (beebpixv & 4 ? 4 : 0) |
      (beebpixv & 1 ? 2 : 0) |
      1;

    tmp = VideoULA_Palette[pentry];

    if (tmp > 7) {
      tmp &= 7;
      if (VideoULA_ControlReg & 1) tmp ^= 7;
    }

    FastTableDWidth[beebpixv][12] =
      FastTableDWidth[beebpixv][13] =
      FastTableDWidth[beebpixv][14] =
      FastTableDWidth[beebpixv][15] =
        tmp;
  }
}

/*-------------------------------------------------------------------------------------------------------------*/
/* Some guess work and experimentation has determined that the left most pixel uses the same pattern as mode 1 */
/* all the way upto the 5th pixel which uses 31hh then 20hh and hten 1hhh then 0hhhh                           */
function DoFastTable2XStep2() {
  for (let beebpixv = 0; beebpixv < 256; beebpixv++) {
    FastTableDWidth[beebpixv] = [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ];
    let beebpixvt = beebpixv;

    for (let pix = 0; pix < 8; pix++) {
      const pentry =
        (beebpixvt & 128 ? 8 : 0) |
        (beebpixvt & 32 ? 4 : 0) |
        (beebpixvt & 8 ? 2 : 0) |
        (beebpixvt & 2 ? 1 : 0);
      beebpixvt <<= 1;
      beebpixvt |= 1;

      let tmp = VideoULA_Palette[pentry];

      if (tmp > 7) {
        tmp &= 7;
        if (VideoULA_ControlReg & 1) tmp ^= 7;
      }

      FastTableDWidth[beebpixv][pix * 2] = FastTableDWidth[beebpixv][
        pix * 2 + 1
      ] = tmp;
    }
  }
}

/*-------------------------------------------------------------------------------------------------------------*/

/* Rebuild fast table.
   The fast table accelerates the translation of beeb video memory
   values into X pixel values */

function DoFastTable() {
  if ((CRTC_HorizontalDisplayed & 3) == 0) {
    if (VideoULA_ControlReg & 0x10) {
      throw "not impl";
      //LineRoutine = LowLevelDoScanLineNarrow;
    }
    LineRoutine = LowLevelDoScanLineWide;
  } else {
    throw "not impl";
    // LineRoutine =
    //   VideoULA_ControlReg & 0x10
    //     ? LowLevelDoScanLineNarrowNot4Bytes
    //     : LowLevelDoScanLineWideNot4Bytes;
  }

  //What happens next depends on the number of colours
  switch (NColsLookup[(VideoULA_ControlReg & 0x1c) >> 2]) {
    case 2:
      if (VideoULA_ControlReg & 0x10) {
        throw "not impl";
        //DoFastTable2();
      } else {
        DoFastTable2XStep2();
      }
      FastTable_Valid = true;
      break;

    case 4:
      if (VideoULA_ControlReg & 0x10) {
        throw "not impl";
        //DoFastTable4();
      } else {
        //throw "not impl";
        DoFastTable4XStep4();
      }
      FastTable_Valid = true;
      break;

    case 16:
      if (VideoULA_ControlReg & 0x10) {
        throw "not impl";
        //DoFastTable16();
      } else {
        throw "not impl";
        //DoFastTable16XStep8();
      }
      FastTable_Valid = true;
      break;

    default:
      break;
  }
}

/*-------------------------------------------------------------------------------------------------------------*/
//#define BEEB_DOTIME_SAMPLESIZE 50

function VideoStartOfFrame() {
  /* FrameNum is determined by the window handler */
  if (VideoState.IsNewTVFrame) {
    // RTW - only calibrate timing once per frame
    VideoState.IsNewTVFrame = false;
    //FrameNum = mainWin->StartOfFrame();

    CursorFieldCount--;
    Mode7FlashTrigger--;
    VideoState.InterlaceFrame = !VideoState.InterlaceFrame;
  }

  // Cursor update for blink. I thought I'd put it here, as this is where the mode 7 flash field thingy is too
  // - Richard Gellman
  if (CursorFieldCount < 0) {
    const CurStart = CRTC_CursorStart & 0x60;

    if (CurStart == 0) {
      // 0 is cursor displays, but does not blink
      CursorFieldCount = 0;
      CursorOnState = true;
    } else if (CurStart == 0x20) {
      // 32 is no cursor
      CursorFieldCount = 0;
      CursorOnState = false;
    } else if (CurStart == 0x40) {
      // 64 is 1/16 fast blink
      CursorFieldCount = 8;
      CursorOnState = !CursorOnState;
    } else if (CurStart == 0x60) {
      // 96 is 1/32 slow blink
      CursorFieldCount = 16;
      CursorOnState = !CursorOnState;
    }
  }

  // RTW - The meaning of CharLine has changed: -1 no longer means that we are in the vertical
  // total adjust period, and this is no longer handled as if it were at the beginning of a new CRTC cycle.
  // Hence, here we always set CharLine to 0.
  VideoState.CharLine = 0;
  VideoState.InCharLineUp = 0;

  VideoState.Addr = VideoState.StartAddr =
    CRTC_ScreenStartLow + (CRTC_ScreenStartHigh << 8);

  VideoState.IsTeletext = (VideoULA_ControlReg & 2) != 0;

  if (VideoState.IsTeletext) {
    // O aye. this is the mode 7 flash section is it? Modified for corrected flash settings - Richard Gellman
    if (Mode7FlashTrigger < 0) {
      Mode7FlashTrigger = Mode7FlashOn ? MODE7OFFFIELDS : MODE7ONFIELDS;
      Mode7FlashOn = !Mode7FlashOn; // toggle flash state
    }
  }

  // const int IL_Multiplier = (CRTC_InterlaceAndDelay & 1) ? 2 : 1;

  // if (VideoState.InterlaceFrame) {
  //   IncTrigger((IL_Multiplier*(CRTC_HorizontalTotal+1)*((VideoULA_ControlReg & 16)?1:2)),VideoTriggerCount); /* Number of 2MHz cycles until another scanline needs doing */
  // } else {
  //   IncTrigger(((CRTC_HorizontalTotal+1)*((VideoULA_ControlReg & 16)?1:2)),VideoTriggerCount); /* Number of 2MHz cycles until another scanline needs doing */
  // }
}

/*-----------------------------------------------------------------------------*/
/* Scanline processing for the low clock rate modes                            */
function LowLevelDoScanLineWide() {
  const mem = getMem();
  let BytesToGo = CRTC_HorizontalDisplayed;

  let vidPtr = GetLinePtr(VideoState.PixmapLine);

  /* If the step is 4 then each byte corresponds to one entry in the fasttable
     and thus we can copy it really easily (and fast!) */
  let CurrentPtr = VideoState.DataPtr + VideoState.InCharLineUp;

  /* This should help the compiler - it doesn't need to test for end of loop
     except every 4 entries */
  BytesToGo /= 4;

  for (; BytesToGo; CurrentPtr += 32, BytesToGo--) {
    vidPtr = writeSixteenUChars(vidPtr, FastTableDWidth[mem[CurrentPtr]]);
    vidPtr = writeSixteenUChars(vidPtr, FastTableDWidth[mem[CurrentPtr + 8]]);
    vidPtr = writeSixteenUChars(vidPtr, FastTableDWidth[mem[CurrentPtr + 16]]);
    vidPtr = writeSixteenUChars(vidPtr, FastTableDWidth[mem[CurrentPtr + 24]]);
  }
}

/*-------------------------------------------------------------------------------------------------------------*/
/* Do all the pixel rows for one row of teletext characters                                                    */
function DoMode7Row() {
  const mem = getMem();
  const CurrentPtr = VideoState.DataPtr;
  let CurrentChar: number;
  let byte: number;
  let Foreground = 7;
  /* The foreground colour changes after the current character; only relevant for hold graphics */
  let ForegroundPending = Foreground;
  let ActualForeground: number;
  let Background = 0;
  let Flash = false; // i.e. steady
  let DoubleHeight = false; // Normal
  let Graphics = false;
  let NextGraphics = false; // i.e. alpha
  let Separated = false; // i.e. continuous graphics
  let HoldGraph = false;
  let NextHoldGraph = false; // i.e. don't hold graphics
  let HoldGraphChar: number;
  let NextHoldGraphChar = 32; // the character to "hold" during control codes
  let HoldSeparated = false;
  let NextHoldSeparated = false; // Separated graphics mode in force when grapics held
  const CurrentCol = [
    0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff,
    0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff,
    0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff, 0xffffff,
  ]; // 20
  const CurrentLen = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]; // 20
  const CurrentStartX = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]; //20
  let CurrentScanLine: number;
  let CurrentX = 0;
  let CurrentPixel: number;
  let FontTypeIndex = 0; /* 0=alpha, 1=contiguous graphics, 2=separated graphics */
  if (CRTC_HorizontalDisplayed > 80)
    return; /* Not possible on beeb - and would break the double height lookup array */
  // Reset double-height state for the first character row of the screen.
  if (VideoState.CharLine == 0) {
    CurrentLineBottom = false;
    NextLineBottom = false;
  }
  for (CurrentChar = 0; CurrentChar < CRTC_HorizontalDisplayed; CurrentChar++) {
    HoldGraph = NextHoldGraph;
    HoldGraphChar = NextHoldGraphChar;
    HoldSeparated = NextHoldSeparated;
    Graphics = NextGraphics;
    byte = mem[CurrentPtr + CurrentChar];
    if (byte < 32) byte += 128; // fix for naughty programs that use 7-bit control codes - Richard Gellman
    if (byte & 32 && Graphics) {
      NextHoldGraphChar = byte;
      NextHoldSeparated = Separated;
    }
    if (byte >= 128 && byte <= 159) {
      if (!HoldGraph && byte != 158) NextHoldGraphChar = 32; // SAA5050 teletext rendering bug
      switch (byte) {
        case 129: // Alphanumeric red
        case 130: // Alphanumeric green
        case 131: // Alphanumeric yellow
        case 132: // Alphanumeric blue
        case 133: // Alphanumeric magenta
        case 134: // Alphanumeric cyan
        case 135: // Alphanumeric white
          ForegroundPending = byte - 128;
          NextGraphics = false;
          NextHoldGraphChar = 32;
          break;
        case 136: // Flash
          Flash = true;
          break;
        case 137: // Steady
          Flash = false;
          break;
        case 140: // Normal height
          DoubleHeight = false;
          break;
        case 141: // Double height
          if (!CurrentLineBottom) NextLineBottom = true;
          DoubleHeight = true;
          break;
        case 145: // Graphics red
        case 146: // Graphics green
        case 147: // Graphics yellow
        case 148: // Graphics blue
        case 149: // Graphics magenta
        case 150: // Graphics cyan
        case 151: // Graphics white
          ForegroundPending = byte - 144;
          NextGraphics = true;
          break;
        case 152: // Conceal display - not sure about this
          Foreground = Background;
          ForegroundPending = Background;
          break;
        case 153: // Contiguous graphics
          Separated = false;
          break;
        case 154: // Separated graphics
          Separated = true;
          break;
        case 156: // Black background
          Background = 0;
          break;
        case 157: // New background
          Background = Foreground;
          break;
        case 158: // Hold graphics
          NextHoldGraph = true;
          HoldGraph = true;
          break;
        case 159: // Release graphics
          NextHoldGraph = false;
          break;
      }
      // This next line hides any non double height characters on the bottom line
      // Fudge so that the special character is just displayed in background
      if (HoldGraph && Graphics) {
        byte = HoldGraphChar;
        FontTypeIndex = HoldSeparated ? 2 : 1;
      } else {
        byte = 32;
        FontTypeIndex = Graphics ? (Separated ? 2 : 1) : 0;
      }
    } /* test for special character */ else {
      FontTypeIndex = Graphics ? (Separated ? 2 : 1) : 0;
    }
    if (CurrentLineBottom && (byte & 127) > 31 && !DoubleHeight) byte = 32;
    TeletextStyle = CRTC_ScanLinesPerChar <= 9 ? 2 : 1;
    /* Top bit never reaches character generator */
    byte &= 127;
    /* Our font table goes from character 32 up */
    if (byte < 32) byte = 0;
    else byte -= 32;
    /* Conceal flashed text if necessary */
    ActualForeground = Flash && !Mode7FlashOn ? Background : Foreground;
    if (!DoubleHeight) {
      // Loop through each scanline in this character row
      for (
        CurrentScanLine = 0 + (TeletextStyle - 1);
        CurrentScanLine < 20;
        CurrentScanLine += TeletextStyle
      ) {
        const Bitmap =
          Mode7Font[Mode7FontIndex(FontTypeIndex, byte, CurrentScanLine)];
        if (Bitmap == 0 || Bitmap == 0xfff) {
          const col = Bitmap == 0 ? Background : ActualForeground;
          if (col == CurrentCol[CurrentScanLine]) {
            // Same colour, so increment run length
            CurrentLen[CurrentScanLine] += 12;
          } else {
            if (CurrentLen[CurrentScanLine] != 0) {
              doHorizLine(
                CurrentCol[CurrentScanLine], // Colour
                VideoState.PixmapLine + CurrentScanLine, // y
                CurrentStartX[CurrentScanLine], // sx
                CurrentLen[CurrentScanLine], // width
              );
            }
            CurrentCol[CurrentScanLine] = col;
            CurrentStartX[CurrentScanLine] = CurrentX;
            CurrentLen[CurrentScanLine] = 12;
          }
        } else {
          // Loop through 12 pixels horizontally
          for (CurrentPixel = 0x800; CurrentPixel != 0; CurrentPixel >>= 1) {
            // Background or foreground ?
            const col = Bitmap & CurrentPixel ? ActualForeground : Background;
            // Do we need to draw ?
            if (col == CurrentCol[CurrentScanLine]) {
              // Same colour, so increment run length
              CurrentLen[CurrentScanLine]++;
            } else {
              if (CurrentLen[CurrentScanLine] != 0) {
                doHorizLine(
                  CurrentCol[CurrentScanLine], // Colour
                  VideoState.PixmapLine + CurrentScanLine, // y
                  CurrentStartX[CurrentScanLine], // sx
                  CurrentLen[CurrentScanLine], // width
                );
              }
              CurrentCol[CurrentScanLine] = col;
              CurrentStartX[CurrentScanLine] = CurrentX;
              CurrentLen[CurrentScanLine] = 1;
            }
            CurrentX++;
          }
          CurrentX -= 12;
        }
      }
      CurrentX += 12;
      Mode7DoubleHeightFlags[CurrentChar] = true; // Not double height - so if the next line is double height it will be top half
    } else {
      // Double height!
      // Loop through 12 pixels horizontally
      for (CurrentPixel = 0x800; CurrentPixel != 0; CurrentPixel >>= 1) {
        // Loop through each scanline in this character row
        for (
          CurrentScanLine = 0 + (TeletextStyle - 1);
          CurrentScanLine < 20;
          CurrentScanLine += TeletextStyle
        ) {
          const ActualScanLine = Math.floor(
            CurrentLineBottom ? 10 + CurrentScanLine / 2 : CurrentScanLine / 2,
          );

          // Background or foreground ?
          const col =
            Mode7Font[Mode7FontIndex(FontTypeIndex, byte, ActualScanLine)] &
            CurrentPixel
              ? ActualForeground
              : Background;
          // Do we need to draw ?
          if (col == CurrentCol[CurrentScanLine]) {
            // Same colour, so increment run length
            CurrentLen[CurrentScanLine]++;
          } else {
            if (CurrentLen[CurrentScanLine] != 0) {
              doHorizLine(
                CurrentCol[CurrentScanLine], // Colour
                VideoState.PixmapLine + CurrentScanLine, // y
                CurrentStartX[CurrentScanLine], // sx
                CurrentLen[CurrentScanLine], // width
              );
            }
            CurrentCol[CurrentScanLine] = col;
            CurrentStartX[CurrentScanLine] = CurrentX;
            CurrentLen[CurrentScanLine] = 1;
          }
        }
        CurrentX++;
      }
      Mode7DoubleHeightFlags[CurrentChar] =
        !Mode7DoubleHeightFlags[CurrentChar]; // Not double height - so if the next line is double height it will be top half
    }
    Foreground = ForegroundPending;
  }
  // Finish off right bits of scan line
  for (
    CurrentScanLine = 0 + (TeletextStyle - 1);
    CurrentScanLine < 20;
    CurrentScanLine += TeletextStyle
  ) {
    if (CurrentLen[CurrentScanLine] != 0) {
      doHorizLine(
        CurrentCol[CurrentScanLine], // Colour
        VideoState.PixmapLine + CurrentScanLine, // y
        CurrentStartX[CurrentScanLine], // sx
        CurrentLen[CurrentScanLine], // width
      );
    }
  }
  CurrentLineBottom = NextLineBottom;
  NextLineBottom = false;
}

/*-------------------------------------------------------------------------------------------------------------*/
/* Actually does the work of decoding beeb memory and plotting the line to X */
function LowLevelDoScanLine() {
  if (!FastTable_Valid) {
    // Update acceleration tables
    DoFastTable();
  }

  if (FastTable_Valid) {
    LineRoutine?.();
  }
}

///

export function VideoDoScanLine() {
  const screenBuffer = getScreenBuffer();
  if (VideoState.IsTeletext) {
    if (VideoState.DoCA1Int) {
      //SysVIATriggerCA1Int(0);
      VideoState.DoCA1Int = false;
    }

    /* Clear the next 20 scan lines */
    if (!FrameNum) {
      if (VScreenAdjust > 0 && VideoState.PixmapLine == 0) {
        for (let l = -VScreenAdjust; l < 0; ++l) {
          doHorizLine(0, l, -36, 800);
        }
      }

      for (let l = 0; l < 20 && VideoState.PixmapLine + l < 512; ++l) {
        doHorizLine(0, VideoState.PixmapLine + l, -36, 800);
      }
    }

    // RTW - Mode 7 emulation is rather broken, as we should be plotting it line-by-line instead
    // of character block at a time.
    // For now though, I leave it as it is, and plot an entire block when InCharLineUp is 0.
    // The infrastructure now exists though to make DoMode7Row plot just a single scanline (from InCharLineUp 0..9).
    if (
      VideoState.CharLine < CRTC_VerticalDisplayed &&
      VideoState.InCharLineUp == 0
    ) {
      VideoState.DataPtr = BeebMemPtrWithWrapMode7(
        VideoState.Addr,
        CRTC_HorizontalDisplayed,
      );
      VideoState.Addr += CRTC_HorizontalDisplayed;
      if (!FrameNum) DoMode7Row();
      VideoState.PixmapLine += 20;
    }

    /* Move onto next physical scanline as far as timing is concerned */
    VideoState.InCharLineUp++;

    // RTW - Mode 7 hardwired for now. Assume 10 scanlines per character regardless (actually 9.5 but god knows how that works)
    if (
      VideoState.CharLine <= CRTC_VerticalTotal &&
      VideoState.InCharLineUp > 9
    ) {
      VideoState.CharLine++;
      VideoState.InCharLineUp = 0;
    }

    // RTW - check if we have reached the end of the PAL frame.
    // This whole thing is a bit hardwired and kludged. Should really be emulating VSync position 'properly' like Modes 0-6.
    if (
      VideoState.CharLine > CRTC_VerticalTotal &&
      VideoState.InCharLineUp >= CRTC_VerticalTotalAdjust
    ) {
      // Changed so that whole screen is still visible after *TV255
      VScreenAdjust =
        -100 +
        (CRTC_VerticalTotal + 1 - (CRTC_VerticalSyncPos - 1)) *
          (20 / TeletextStyle);
      AdjustVideo();
      if (!FrameNum) {
        VideoAddCursor();
        // VideoAddLEDs();
        // Clear rest of screen below virtical total
        for (let l = VideoState.PixmapLine; l < 500 / TeletextStyle; ++l)
          doHorizLine(0, l, -36, 800);
        updateLines(0, 500 / TeletextStyle);
      }
      VideoState.IsNewTVFrame = true;
      VideoStartOfFrame();
      VideoState.PreviousLastPixmapLine = VideoState.PixmapLine;
      VideoState.PixmapLine = 0;
      //SysVIATriggerCA1Int(1);
      VideoState.DoCA1Int = true;

      return false; //
    } else {
      // RTW- set timer till the next scanline update (this is now nice and simple)
      //IncTrigger((CRTC_HorizontalTotal+1)*((VideoULA_ControlReg & 16)?1:2),VideoTriggerCount);
    }
  } else {
    /* Non teletext. */

    // Handle VSync
    // RTW - this was moved to the top so that we can correctly set R7=0,
    // i.e. we can catch it before the line counters are incremented
    if (VideoState.VSyncState) {
      if (!--VideoState.VSyncState) {
        //SysVIATriggerCA1Int(0);
      }
    }

    if (
      VideoState.VSyncState == 0 &&
      VideoState.CharLine == CRTC_VerticalSyncPos &&
      VideoState.InCharLineUp == 0
    ) {
      // Nothing displayed?
      if (VideoState.FirstPixmapLine < 0) VideoState.FirstPixmapLine = 0;

      VideoState.PreviousFirstPixmapLine = VideoState.FirstPixmapLine;
      VideoState.FirstPixmapLine = -1;
      VideoState.PreviousLastPixmapLine = VideoState.LastPixmapLine;
      VideoState.LastPixmapLine = 0;
      VideoState.PixmapLine = 0;
      VideoState.IsNewTVFrame = true;

      //SysVIATriggerCA1Int(1);
      VideoState.VSyncState = CRTC_SyncWidth >> 4;
    }

    /* Clear the scan line */
    if (!FrameNum) {
      screenBuffer.fill(
        0xff000000,
        GetLinePtr(VideoState.PixmapLine),
        GetLinePtr(VideoState.PixmapLine) + 800,
      );
    }

    if (VideoState.CharLine < CRTC_VerticalDisplayed) {
      // Visible char line, record first line
      if (VideoState.FirstPixmapLine == -1)
        VideoState.FirstPixmapLine = VideoState.PixmapLine;
      // Always record the last line
      VideoState.LastPixmapLine = VideoState.PixmapLine;

      /* If first row of character then get the data pointer from memory */
      if (VideoState.InCharLineUp == 0) {
        VideoState.DataPtr = BeebMemPtrWithWrap(
          VideoState.Addr * 8,
          CRTC_HorizontalDisplayed * 8,
        );

        VideoState.Addr += CRTC_HorizontalDisplayed;
      }

      if (
        VideoState.InCharLineUp < 8 &&
        (CRTC_InterlaceAndDelay & 0x30) != 0x30
      ) {
        if (!FrameNum) LowLevelDoScanLine();
      }
    }

    // See if we are at the cursor line
    if (
      CurY == -1 &&
      VideoState.Addr > CRTC_CursorPosLow + (CRTC_CursorPosHigh << 8)
    ) {
      CurY = VideoState.PixmapLine;
    }

    // Screen line increment and wraparound
    if (++VideoState.PixmapLine == MAX_VIDEO_SCAN_LINES) {
      VideoState.PixmapLine = 0;
    }

    /* Move onto next physical scanline as far as timing is concerned */
    VideoState.InCharLineUp += 1;

    // RTW - check whether we have reached a new character row.
    // if CharLine>CRTC_VerticalTotal, we are in the vertical total adjust region so we don't wrap to a new row.
    if (
      VideoState.CharLine <= CRTC_VerticalTotal &&
      VideoState.InCharLineUp > CRTC_ScanLinesPerChar
    ) {
      VideoState.CharLine++;
      VideoState.InCharLineUp = 0;
    }

    // RTW - neater way of detecting the end of the PAL frame, which doesn't require making a special case
    // of the vertical total adjust period.
    if (
      VideoState.CharLine > CRTC_VerticalTotal &&
      VideoState.InCharLineUp >= CRTC_VerticalTotalAdjust
    ) {
      VScreenAdjust = 0;
      if (!FrameNum && VideoState.IsNewTVFrame) {
        VideoAddCursor();
        // VideoAddLEDs();
        CurY = -1;
        let n =
          VideoState.PreviousLastPixmapLine -
          VideoState.PreviousFirstPixmapLine +
          1;
        if (n < 0) {
          n += MAX_VIDEO_SCAN_LINES;
        }

        let startLine = 32;
        if (n > 248 && VideoState.PreviousFirstPixmapLine >= 40) {
          // RTW -
          // This is a little hack which ensures that a fullscreen mode with *TV255 will always
          // fit unclipped in the window in Modes 0-6
          startLine = 40;
        }

        updateLines(startLine, 256);
      }
      VideoStartOfFrame();
      AdjustVideo();
      return false; //
    } else {
      // IncTrigger(
      //   (CRTC_HorizontalTotal + 1) * (VideoULA_ControlReg & 16 ? 1 : 2),
      //   VideoTriggerCount,
      // );
    }
  }
  return true; //
}

/*-------------------------------------------------------------------------------------------------------------*/
function AdjustVideo() {
  ActualScreenWidth = CRTC_HorizontalDisplayed * HSyncModifier;

  if (ActualScreenWidth > 800) {
    ActualScreenWidth = 800;
  } else if (ActualScreenWidth < 640) {
    ActualScreenWidth = 640;
  }

  let InitialOffset =
    0 - ((CRTC_HorizontalTotal + 1) / 2 - (HSyncModifier == 8 ? 40 : 20));
  let HStart =
    InitialOffset +
    (CRTC_HorizontalTotal +
      1 -
      (CRTC_HorizontalSyncPos + (CRTC_SyncWidth & 0x0f))) +
    (HSyncModifier == 8 ? 2 : 1);
  if (TeletextEnabled) HStart += 2;
  if (HStart < 0) HStart = 0;
  ScreenAdjust =
    HStart * HSyncModifier + (VScreenAdjust > 0 ? VScreenAdjust * 800 : 0);
}

/*-------------------------------------------------------------------------------------------------------------*/
export function VideoInit() {
  VideoStartOfFrame();

  VideoState.DataPtr = BeebMemPtrWithWrap(0x3000, 640);
  //SetTrigger(99,VideoTriggerCount); /* Give time for OS to set mode up before doing anything silly */
  FastTable_Valid = false;

  //FrameNum=Video_RefreshFrequency;
  VideoState.PixmapLine = 0;
  VideoState.FirstPixmapLine = -1;
  VideoState.PreviousFirstPixmapLine = 0;
  VideoState.LastPixmapLine = 0;
  VideoState.PreviousLastPixmapLine = 256;
  VideoState.IsNewTVFrame = false;
  CurY = -1;
  AdjustVideo(); // !!! temp
  //  crtclog=fopen("/crtc.log","wb");
}

/*-------------------------------------------------------------------------------------------------------------*/
function VideoULAWrite(Address: number, Value: number) {
  if (Address & 1) {
    VideoULA_Palette[(Value & 0xf0) >> 4] = (Value & 0xf) ^ 7;
    FastTable_Valid = false;
    //fprintf(crtclog,"Pallette written to at line %d\n",VideoState.PixmapLine);
  } else {
    const oldValue = VideoULA_ControlReg;
    VideoULA_ControlReg = Value;
    FastTable_Valid = false;
    /* Could be more selective and only do it if no.of.cols bit changes */
    // DebugTrace("Palette reg %d now has value %02X\n", (Value & 0xf0) >> 4, (Value & 0xf) ^ 7);
    /* cerr << "VidULA Ctrl reg write " << hex << Value << "\n"; */
    // Adjust HSyncModifier
    if (VideoULA_ControlReg & 16) HSyncModifier = 8;
    else HSyncModifier = 16;
    if (VideoULA_ControlReg & 2) HSyncModifier = 12;
    // number of pixels per CRTC character (on our screen)
    TeletextEnabled = (Value & 2) != 0;
    if ((Value & 2) ^ (oldValue & 2)) {
      ScreenAdjust = 0;
    }
    AdjustVideo();
  }
}

/*-------------------------------------------------------------------------------------------------------------*/

function VideoAddCursor() {
  const CurSizes = [2, 1, 0, 0, 4, 2, 0, 4];
  let ScrAddr: number, CurAddr: number, RelAddr: number;
  let CurX: number;
  let CurSize: number;
  let CurStart: number, CurEnd: number;

  /* Check if cursor has been hidden */
  if (
    (VideoULA_ControlReg & 0xe0) == 0 ||
    (CRTC_CursorStart & 0x60) == 0x20 ||
    (CRTC_InterlaceAndDelay & 0xc0) == 0xc0 ||
    !CursorOnState
  ) {
    return;
  }

  /* Use clock bit and cursor bits to work out size */
  if (VideoULA_ControlReg & 0x80)
    CurSize = CurSizes[(VideoULA_ControlReg & 0x70) >> 4] * 8;
  else CurSize = 2 * 8; /* Mode 7 */

  if (VideoState.IsTeletext) {
    ScrAddr =
      CRTC_ScreenStartLow +
      ((((CRTC_ScreenStartHigh ^ 0x20) + 0x74) & 0xff) << 8);
    CurAddr =
      CRTC_CursorPosLow + ((((CRTC_CursorPosHigh ^ 0x20) + 0x74) & 0xff) << 8);

    CurStart = Math.floor((CRTC_CursorStart & 0x1f) / 2);
    CurEnd = CRTC_CursorEnd;
    CurSize -= 4;
  } else {
    ScrAddr = CRTC_ScreenStartLow + (CRTC_ScreenStartHigh << 8);
    CurAddr = CRTC_CursorPosLow + (CRTC_CursorPosHigh << 8);

    CurStart = CRTC_CursorStart & 0x1f;
    CurEnd = CRTC_CursorEnd;
  }

  RelAddr = CurAddr - ScrAddr;
  if (RelAddr < 0 || CRTC_HorizontalDisplayed == 0) return;

  /* Work out char positions */
  CurX = RelAddr % CRTC_HorizontalDisplayed;

  /* Convert to pixel positions */
  if (VideoState.IsTeletext) {
    CurX = CurX * 12;
    CurY = Math.floor(RelAddr / CRTC_HorizontalDisplayed) * 20 + 9;
  } else {
    CurX = CurX * HSyncModifier;
  }

  /* Limit cursor size */ // This should be 11, not 9 - Richard Gellman
  if (CurEnd > 11) CurEnd = 11;

  if (CurX + CurSize >= 640) CurSize = 640 - CurX;

  CurX += ((CRTC_InterlaceAndDelay & 0xc0) >> 6) * HSyncModifier;

  if (VideoState.IsTeletext) {
    CurX -= 2 * HSyncModifier;
  }

  if (CurSize > 0) {
    for (
      let y = CurStart;
      y <= CurEnd && y <= CRTC_ScanLinesPerChar && CurY + y < 500;
      ++y
    ) {
      if (CurY + y >= 0) {
        doInvHorizLine(7, CurY + y, CurX, CurSize);
      }
    }
  }
}

type VideoOverrides = {
  CRTC_HorizontalTotal: number;
  CRTC_HorizontalDisplayed: number;
  CRTC_HorizontalSyncPos: number;
  CRTC_SyncWidth: number;
  CRTC_VerticalTotal: number;
  CRTC_VerticalTotalAdjust: number;
  CRTC_VerticalDisplayed: number;
  CRTC_VerticalSyncPos: number;
  CRTC_InterlaceAndDelay: number;
  CRTC_ScanLinesPerChar: number;
  CRTC_CursorStart: number;
  CRTC_CursorEnd: number;
  CRTC_ScreenStartHigh: number;
  CRTC_ScreenStartLow: number;
  CRTC_CursorPosHigh: number;
  CRTC_CursorPosLow: number;
  VideoULA_ControlReg: number;
  VideoULA_Palette: number[];
};
export function tempVideoOverride(videoOverrides: VideoOverrides) {
  ({
    CRTC_HorizontalTotal,
    CRTC_HorizontalDisplayed,
    CRTC_HorizontalSyncPos,
    CRTC_SyncWidth,
    CRTC_VerticalTotal,
    CRTC_VerticalTotalAdjust,
    CRTC_VerticalDisplayed,
    CRTC_VerticalSyncPos,
    CRTC_InterlaceAndDelay,
    CRTC_ScanLinesPerChar,
    CRTC_CursorStart,
    CRTC_CursorEnd,
    CRTC_ScreenStartHigh,
    CRTC_ScreenStartLow,
    CRTC_CursorPosHigh,
    CRTC_CursorPosLow,
  } = videoOverrides);

  VideoULAWrite(0, videoOverrides.VideoULA_ControlReg);

  for (let i = 0; i < 16; i++) {
    VideoULA_Palette[i] = videoOverrides.VideoULA_Palette[i];
  }
}
