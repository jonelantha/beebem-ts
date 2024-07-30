/****************************************************************
BeebEm - BBC Micro and Master 128 Emulator
Copyright (C) 1994  David Alan Gilbert
Copyright (C) 1994  Nigel Magnay
Copyright (C) 1997  Mike Wyatt

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

import { initScreen } from "./beebwin";
import {
  BuildMode7Font,
  tempVideoOverride,
  VideoDoScanLine,
  VideoInit,
} from "./video";
import { initMem } from "./beebmem";

import "./style.css";

async function run() {
  const params = new URLSearchParams(window.location.search);

  tempVideoOverride({
    CRTC_HorizontalTotal: parseInt(params.get("CRTC_HorizontalTotal")!, 16),
    CRTC_HorizontalDisplayed: parseInt(
      params.get("CRTC_HorizontalDisplayed")!,
      16,
    ),
    CRTC_HorizontalSyncPos: parseInt(params.get("CRTC_HorizontalSyncPos")!, 16),
    CRTC_SyncWidth: parseInt(params.get("CRTC_SyncWidth")!, 16),
    CRTC_VerticalTotal: parseInt(params.get("CRTC_VerticalTotal")!, 16),
    CRTC_VerticalTotalAdjust: parseInt(
      params.get("CRTC_VerticalTotalAdjust")!,
      16,
    ),
    CRTC_VerticalDisplayed: parseInt(params.get("CRTC_VerticalDisplayed")!, 16),
    CRTC_VerticalSyncPos: parseInt(params.get("CRTC_VerticalSyncPos")!, 16),
    CRTC_InterlaceAndDelay: parseInt(params.get("CRTC_InterlaceAndDelay")!, 16),
    CRTC_ScanLinesPerChar: parseInt(params.get("CRTC_ScanLinesPerChar")!, 16),
    CRTC_CursorStart: parseInt(params.get("CRTC_CursorStart")!, 16),
    CRTC_CursorEnd: parseInt(params.get("CRTC_CursorEnd")!, 16),
    CRTC_ScreenStartHigh: parseInt(params.get("CRTC_ScreenStartHigh")!, 16),
    CRTC_ScreenStartLow: parseInt(params.get("CRTC_ScreenStartLow")!, 16),
    CRTC_CursorPosHigh: parseInt(params.get("CRTC_CursorPosHigh")!, 16),
    CRTC_CursorPosLow: parseInt(params.get("CRTC_CursorPosLow")!, 16),
    VideoULA_ControlReg: parseInt(params.get("VideoULA_ControlReg")!, 16),
    VideoULA_Palette: params
      .get("VideoULA_Palette")!
      .split(",")
      .map(val => parseInt(val, 10)),
  });

  const memFile = params.get("mem");
  if (!memFile) return;

  // reset
  initScreen();
  await initMem(memFile);

  VideoInit();
  // end reset

  await BuildMode7Font("/Teletext.fnt");

  function doFrame() {
    while (VideoDoScanLine()) {}
    requestAnimationFrame(doFrame);
  }
  doFrame();
}

run();
