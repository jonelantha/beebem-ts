/****************************************************************
BeebEm - BBC Micro and Master 128 Emulator
Copyright (C) 1994  Nigel Magnay
Copyright (C) 1997  Mike Wyatt
Copyright (C) 1998  Robert Schmidt
Copyright (C) 2001  Richard Gellman
Copyright (C) 2004  Ken Lowe
Copyright (C) 2004  Rob O'Donnell
Copyright (C) 2005  Jon Welch

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

// 07/06/1997: Mike Wyatt and NRM's port to Win32
// 11/01/1998: Converted to use DirectX, Mike Wyatt
// 28/12/2004: Econet added Rob O'Donnell. robert@irrelevant.com.
// 26/12/2011: Added IDE Drive to Hardware options, JGH

import { getTotalCycles, Init6502core } from "./6502core";
import { AtoDInit } from "./atodconv";
import { BeebMemInit } from "./beebmem";
import { bufferHeight, bufferWidth, InitSurfaces } from "./beebwindx";
import { KeyMap, KeyMapping, REAL_TIME_TARGET } from "./beebwinh";
import { Disc8271Reset, FreeDiscImage } from "./disc8271";
import { defaultKeymapData, logicalKeymapData } from "./keymap";
import { BeebKeyDown, BeebKeyUp, SysVIAReset } from "./sysvia";
import { UserVIAReset } from "./uservia";
import { BuildMode7Font, VideoInit } from "./video";

export const primaryWidth = 640;
export const primaryHeight = 480;

let screen: Uint8Array;

export const getScreen = () => screen;

export const getPrimaryContext = () =>
  (document.getElementById("primaryCanvas") as HTMLCanvasElement).getContext(
    "2d",
  )!;

// header

let m_ShiftPressed = false;
const m_vkeyPressed = Array.from({ length: 256 }, () => ({
  row: -1,
  col: -1,
  rowShift: -1,
  colShift: -1,
}));

// main

// Keyboard mappings
let defaultMapping: KeyMap;
let logicalMapping: KeyMap;

/* Currently selected translation table */
let transTable: KeyMap;

/****************************************************************************/
export async function Initialise() {
  ResetTiming();

  CreateBeebWindow();
  CreateBitmap();

  await ApplyPrefs();

  await BuildMode7Font("/teletext.fnt");
}

/****************************************************************************/
async function ApplyPrefs() {
  defaultMapping = ReadKeyMap(defaultKeymapData);
  logicalMapping = ReadKeyMap(logicalKeymapData);
  transTable = defaultMapping;

  InitSurfaces();

  await ResetBeebSystem(true);
}

/****************************************************************************/

async function ResetBeebSystem(LoadRoms: boolean) {
  // SoundReset();
  // SoundInit();
  // SwitchOnSound();
  await BeebMemInit(LoadRoms);
  Init6502core();

  SysVIAReset();
  UserVIAReset();
  VideoInit();
  Disc8271Reset();
  AtoDInit();
  FreeDiscImage(0);
  // Keep the disc images loaded
  FreeDiscImage(1);
}

/****************************************************************************/
export function CreateBitmap() {
  screen = new Uint8Array(bufferWidth * bufferHeight);
}

/****************************************************************************/
export function CreateBeebWindow() {
  const primaryCanvas = document.getElementById(
    "primaryCanvas",
  ) as HTMLCanvasElement;
  primaryCanvas.width = primaryWidth;
  primaryCanvas.height = primaryHeight;
}

/****************************************************************************/
export function TranslateKey(vkey: number, keyUp: boolean) {
  //left 90, right 88
  // up shift 186 down 191
  // returns row
  if (vkey < 0 || vkey > 255) return -9;

  // Key track of shift state
  if (transTable[vkey][0].row == 0 && transTable[vkey][0].col == 0) {
    m_ShiftPressed = !keyUp;
  }

  if (keyUp) {
    // Key released, lookup beeb row + col that this vkey
    // mapped to when it was pressed.  Need to release
    // both shifted and non-shifted presses.
    let row = m_vkeyPressed[vkey].row;
    let col = m_vkeyPressed[vkey].col;
    m_vkeyPressed[vkey].row = -1;
    m_vkeyPressed[vkey].col = -1;
    if (row >= 0) BeebKeyUp(row, col);

    row = m_vkeyPressed[vkey].rowShift;
    col = m_vkeyPressed[vkey].colShift;
    m_vkeyPressed[vkey].rowShift = -1;
    m_vkeyPressed[vkey].colShift = -1;
    if (row >= 0) BeebKeyUp(row, col);
  } // New key press - convert to beeb row + col
  else {
    const keyMapping = transTable[vkey][m_ShiftPressed ? 1 : 0];
    const row = keyMapping.row;
    const col = keyMapping.col;
    const needShift = keyMapping.shift;
    // if (m_KeyMapAS)
    // {
    // 	// Map A & S to CAPS & CTRL - good for some games
    // 	if (vkey == 65)
    // 	{
    // 		row = 4;
    // 		col = 0;
    // 	}
    // 	else if (vkey == 83)
    // 	{
    // 		row = 0;
    // 		col = 1;
    // 	}
    // }
    // 	if (m_KeyMapFunc)
    // 	{
    // 		// Map F1-F10 to f0-f9
    // 		if (vkey >= 113 && vkey <= 121)
    // 		{
    // 			row = (*transTable)[vkey - 1][0].row;
    // 			col = (*transTable)[vkey - 1][0].col;
    // 		}
    // 		else if (vkey == 112)
    // 		{
    // 			row = 2;
    // 			col = 0;
    // 		}
    // 	}
    if (row >= 0) {
      // Make sure shift state is correct
      if (needShift) BeebKeyDown(0, 0);
      else BeebKeyUp(0, 0);

      BeebKeyDown(row, col);
      // Record beeb row + col for key release
      if (m_ShiftPressed) {
        m_vkeyPressed[vkey].rowShift = row;
        m_vkeyPressed[vkey].colShift = col;
      } else {
        m_vkeyPressed[vkey].row = row;
        m_vkeyPressed[vkey].col = col;
      }
    } else {
      // Special key!  Record so key up returns correct codes
      m_vkeyPressed[vkey].rowShift = row;
      m_vkeyPressed[vkey].colShift = col;
    }
  }
}

/****************************************************************************/
export function StartOfFrame() {
  let FrameNum = 1;

  const { sleepTime, UpdateScreen } = UpdateTiming();
  if (UpdateScreen) FrameNum = 0;

  return { FrameNum, sleepTime };
}

let m_LastTickCount = 0;
let m_LastTotalCycles: number;
let m_TickBase: number;
let m_CycleBase: number;
let m_LastFPSCount: number;
let m_MinFrameCount: number;

/****************************************************************************/
function ResetTiming() {
  m_LastTickCount = performance.now(); //GetTickCount();
  // m_LastStatsTickCount = m_LastTickCount;
  m_LastTotalCycles = getTotalCycles();
  // m_LastStatsTotalCycles = TotalCycles;
  m_TickBase = m_LastTickCount;
  m_CycleBase = getTotalCycles();
  m_MinFrameCount = 0;
  m_LastFPSCount = m_LastTickCount;
  // m_ScreenRefreshCount = 0;
}

/****************************************************************************/
function UpdateTiming(): { UpdateScreen: boolean; sleepTime?: number } {
  let UpdateScreen = false;
  let sleepTime: number | undefined;

  const TotalCycles = getTotalCycles();
  const TickCount = performance.now(); //GetTickCount();

  /* Don't do anything if this is the first call or there has
     been a long pause due to menu commands, or when something
     wraps. */
  if (
    m_LastTickCount == 0 ||
    TickCount < m_LastTickCount ||
    TickCount - m_LastTickCount > 1000 ||
    TotalCycles < m_LastTotalCycles
  ) {
    ResetTiming();
    return { UpdateScreen: true, sleepTime: undefined };
  }

  /* Update stats every second */
  // if (TickCount >= m_LastStatsTickCount + 1000)
  // {
  // 	m_FramesPerSecond = m_ScreenRefreshCount;
  // 	m_ScreenRefreshCount = 0;
  // 	m_RelativeSpeed = ((TotalCycles - m_LastStatsTotalCycles) / 2000.0) /
  // 							(TickCount - m_LastStatsTickCount);
  // 	m_LastStatsTotalCycles = TotalCycles;
  // 	m_LastStatsTickCount += 1000;
  // 	DisplayTiming();
  // }

  // Now we work out if BeebEm is running too fast or not
  const Ticks = TickCount - m_TickBase;
  const nCycles = Math.floor((TotalCycles - m_CycleBase) / REAL_TIME_TARGET);

  if (Ticks <= nCycles / 2000) {
    // Need to slow down, show frame (max 50fps though)
    // and sleep a bit
    if (TickCount >= m_LastFPSCount + 20) {
      UpdateScreen = true;
      m_LastFPSCount += 20;
    } else {
      UpdateScreen = false;
    }

    const SpareTicks = nCycles / 2000 - Ticks;
    sleepTime = SpareTicks;
    m_MinFrameCount = 0;
  } else {
    // Need to speed up, skip a frame
    UpdateScreen = false;
    // Make sure we show at least one in 100 frames
    ++m_MinFrameCount;
    if (m_MinFrameCount >= 100) {
      UpdateScreen = true;
      m_MinFrameCount = 0;
    }
  }

  // Check for anything time critical [x]

  /* Move counter bases forward */
  const CyclesPerSec = Math.floor(2_000_000.0 * REAL_TIME_TARGET);
  while (
    TickCount - m_TickBase > 1000 &&
    TotalCycles - m_CycleBase > CyclesPerSec
  ) {
    m_TickBase += 1000;
    m_CycleBase += CyclesPerSec;
  }

  m_LastTickCount = TickCount;
  m_LastTotalCycles = TotalCycles;

  return { UpdateScreen, sleepTime };
}

/****************************************************************************/
function ReadKeyMap(rawKeymap: number[][]): KeyMap {
  const keymap = Array.from({ length: 256 }, () => [] as KeyMapping[]);

  for (let i = 0; i < 256; ++i) {
    // int shift0 = 0, shift1 = 0;
    const [row0, col0, shift0, row1, col1, shift1] = rawKeymap[i];

    keymap[i][0] = { row: row0, col: col0, shift: shift0 != 0 };
    keymap[i][1] = { row: row1, col: col1, shift: shift1 != 0 };
  }

  return keymap;
}
