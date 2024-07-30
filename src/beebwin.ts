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

import {
  drawHeight,
  drawWidth,
  getActualScreenWidth,
  getTeletextEnabled,
  getScreenAdjust,
  MAX_VIDEO_SCAN_LINES,
  getTeletextStyle,
} from "./video";

// from header

export type EightUChars = [
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
  h: number,
];

export type SixteenUChars = [
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
  h: number,
  i: number,
  j: number,
  k: number,
  l: number,
  m: number,
  n: number,
  o: number,
  p: number,
];

export function GetLinePtr(y: number) {
  return Math.min(y * 800 + getScreenAdjust(), MAX_VIDEO_SCAN_LINES * 800);
}

export function doHorizLine(
  Colour: number,
  y: number,
  sx: number,
  width: number,
) {
  if (getTeletextEnabled()) y /= getTeletextStyle();
  const d = y * 800 + sx + getScreenAdjust() + (getTeletextEnabled() ? 36 : 0);
  if (d + width > 500 * 800) return;
  if (d < 0) return;
  screenBuffer.fill(colPalette[Colour], d, d + width);
}

export function doInvHorizLine(
  Colour: number,
  y: number,
  sx: number,
  width: number,
) {
  if (getTeletextEnabled()) y /= getTeletextStyle();
  const d = y * 800 + sx + getScreenAdjust() + (getTeletextEnabled() ? 36 : 0);
  if (d + width > 500 * 800) return;
  if (d < 0) return;
  for (let n = 0; n < width; n++) {
    const current = screenBuffer[d + n];
    const col = colPalette.indexOf(current);
    screenBuffer[d + n] = colPalette[col ^ Colour];
  }
}

// video helper

export function writeEightUChars(vidPtr: number, eightUChars: EightUChars) {
  for (let i = 0; i < 8; i++) {
    screenBuffer[vidPtr++] = colPalette[eightUChars[i]];
  }
  return vidPtr;
}

export function writeSixteenUChars(
  vidPtr: number,
  sixteenUChars: SixteenUChars,
) {
  for (let i = 0; i < 16; i++) {
    screenBuffer[vidPtr++] = colPalette[sixteenUChars[i]];
  }
  return vidPtr;
}

// main

let imageData: ImageData;
let screenBuffer: Uint32Array;

export function initScreen() {
  const drawCanvas = document.getElementById("drawCanvas") as HTMLCanvasElement;
  drawCanvas.width = drawWidth;
  drawCanvas.height = drawHeight;

  imageData = new ImageData(drawWidth, drawHeight);
  screenBuffer = new Uint32Array(imageData.data.buffer);
}

export const colPalette = [
  0xff000000, 0xff0000ff, 0xff00ff00, 0xff00ffff, 0xffff0000, 0xffff00ff,
  0xffffff00, 0xffffffff,
];

export const getScreenBuffer = () => screenBuffer;

export function tempUpdate() {
  const drawCanvas = document.getElementById("drawCanvas") as HTMLCanvasElement;

  const context = drawCanvas.getContext("2d")!;
  context.putImageData(imageData, 0, 0, 0, 0, drawWidth, drawHeight);
}

export function updateLines(startLine: number, nlines: number) {
  const drawCanvas = document.getElementById("drawCanvas") as HTMLCanvasElement;

  const context = drawCanvas.getContext("2d")!;
  context.putImageData(imageData, 0, 0, 0, 0, drawWidth, drawHeight);

  const finalWidth = 640;
  const finalHeight = 512;

  const finalCanvas = document.getElementById("canvas") as HTMLCanvasElement;
  finalCanvas.width = finalWidth;
  finalCanvas.height = finalHeight;

  const TeletextLines = 500 / getTeletextStyle();

  const finalContext = finalCanvas.getContext("2d")!;

  finalContext.drawImage(
    drawCanvas,
    0,
    startLine,
    getTeletextEnabled() ? 552 : getActualScreenWidth(),
    getTeletextEnabled() ? TeletextLines : nlines,
    0,
    0,
    finalWidth,
    finalHeight,
  );
}
