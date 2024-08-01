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

/* Mike Wyatt and NRM's port to win32 - 07/06/1997 */

import { getScreen } from "./beebwin";
import {
  getTeletextEnabled,
  getScreenAdjust,
  MAX_VIDEO_SCAN_LINES,
  getTeletextStyle,
} from "./video";

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

export function doHorizLine(
  Colour: number,
  y: number,
  sx: number,
  width: number,
) {
  const screen = getScreen();

  if (getTeletextEnabled()) y /= getTeletextStyle();
  const d = y * 800 + sx + getScreenAdjust() + (getTeletextEnabled() ? 36 : 0);
  if (d + width > 500 * 800) return;
  if (d < 0) return;
  screen.fill(Colour, d, d + width);
}

export function doInvHorizLine(
  Colour: number,
  y: number,
  sx: number,
  width: number,
) {
  const screen = getScreen();

  if (getTeletextEnabled()) y /= getTeletextStyle();
  const d = y * 800 + sx + getScreenAdjust() + (getTeletextEnabled() ? 36 : 0);
  if (d + width > 500 * 800) return;
  if (d < 0) return;
  for (let n = 0; n < width; n++) {
    screen[d + n] ^= Colour;
  }
}

export function GetLinePtr(y: number) {
  return Math.min(y * 800 + getScreenAdjust(), MAX_VIDEO_SCAN_LINES * 800);
}

// video helper

export function writeEightUChars(vidPtr: number, eightUChars: EightUChars) {
  const screen = getScreen();

  for (let i = 0; i < 8; i++) {
    screen[vidPtr++] = eightUChars[i];
  }
  return vidPtr;
}

export function writeSixteenUChars(
  vidPtr: number,
  sixteenUChars: SixteenUChars,
) {
  const screen = getScreen();

  for (let i = 0; i < 16; i++) {
    screen[vidPtr++] = sixteenUChars[i];
  }
  return vidPtr;
}
