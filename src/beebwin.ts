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

import { getTotalCycles } from "./6502core";
import { BeebMemInit } from "./beebmem";
import { bufferHeight, bufferWidth, InitSurfaces } from "./beebwindx";
import { REAL_TIME_TARGET } from "./beebwinh";
import { SysVIAReset } from "./sysvia";
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
  InitSurfaces();

  await ResetBeebSystem(true);
}

/****************************************************************************/

async function ResetBeebSystem(LoadRoms: boolean) {
  await BeebMemInit(LoadRoms);
  Init6502core();

  SysVIAReset();
  UserVIAReset();
  VideoInit();
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
