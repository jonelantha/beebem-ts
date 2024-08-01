/****************************************************************
BeebEm - BBC Micro and Master 128 Emulator
Copyright (C) 1998  Mike Wyatt

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

// BeebWin display rendering support

import {
  getPrimaryContext,
  getScreen,
  primaryHeight,
  primaryWidth,
} from "./beebwin";
import {
  getActualScreenWidth,
  getTeletextEnabled,
  getTeletextStyle,
} from "./video";

export const bufferWidth = 800;
export const bufferHeight = 512;

const colPalette = [
  0xff000000, 0xff0000ff, 0xff00ff00, 0xff00ffff, 0xffff0000, 0xffff00ff,
  0xffffff00, 0xffffffff,
];

let bufferCanvas: HTMLCanvasElement;
let bufferData32: Uint32Array;
let bufferImageData: ImageData;
let bufferContext: CanvasRenderingContext2D;

/****************************************************************************/
export function InitSurfaces() {
  bufferCanvas = document.getElementById("bufferCanvas") as HTMLCanvasElement;
  bufferCanvas.width = bufferWidth;
  bufferCanvas.height = bufferHeight;

  bufferContext = bufferCanvas.getContext("2d")!;
  bufferImageData = new ImageData(bufferWidth, bufferHeight);
  bufferData32 = new Uint32Array(bufferImageData.data.buffer);
}

let m_LastStartY = 0;
let m_LastNLines = 256;

/****************************************************************************/
export function updateLines(starty: number, nlines: number) {
  // Use last stored params?
  if (starty == 0 && nlines == 0) {
    starty = m_LastStartY;
    nlines = m_LastNLines;
  } else {
    m_LastStartY = starty;
    m_LastNLines = nlines;
  }

  //++m_ScreenRefreshCount;

  const TeletextLines = 500 / getTeletextStyle();

  // Blit the beeb bitmap onto the secondary buffer
  const screen = getScreen();
  for (let y = 0; y < nlines; y++) {
    for (let x = 0; x < 800; x++) {
      bufferData32[y * 800 + x] = colPalette[screen[(y + starty) * 800 + x]];
    }
  }
  bufferContext.putImageData(bufferImageData, 0, 0);

  const primaryContext = getPrimaryContext();

  const srcRect = {
    left: 0,
    top: 0,
    width: getTeletextEnabled() ? 552 : getActualScreenWidth(),
    height: getTeletextEnabled() ? TeletextLines : nlines,
  };

  const destRect = {
    left: 0,
    top: 0,
    width: primaryWidth,
    height: primaryHeight,
  };

  primaryContext.drawImage(
    bufferCanvas,
    srcRect.left,
    srcRect.top,
    srcRect.width,
    srcRect.height,
    destRect.left,
    destRect.top,
    destRect.width,
    destRect.height,
  );
}
