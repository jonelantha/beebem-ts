/****************************************************************
BeebEm - BBC Micro and Master 128 Emulator
Copyright (C) 1994  David Alan Gilbert
Copyright (C) 1997  Mike Wyatt
Copyright (C) 2001  Richard Gellman
Copyright (C) 2004  Ken Lowe
Copyright (C) 2004  Rob O'Donnell

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

// Beebemulator - memory subsystem - David Alan Gilbert 16/10/1994
// Econet emulation: Rob O'Donnell robert@irrelevant.com 28/12/2004
// IDE Interface: JGH jgh@mdfs.net 25/12/2011

import { getIC32State } from "./sysvia";

let mem: Uint8Array;

export async function initMem(file: string) {
  const res = await fetch(file);
  const buffer = await res.arrayBuffer();
  mem = new Uint8Array(buffer);
}

export const getMem = () => mem;

/*----------------------------------------------------------------------------*/
/* Perform hardware address wrap around */
function WrapAddr(Address: number) {
  const offsets = [0x4000, 0x6000, 0x3000, 0x5800]; // page 419 of AUG is wrong

  if (Address < 0x8000) {
    return Address;
  }

  Address += offsets[(getIC32State() & 0x30) >> 4];
  Address &= 0x7fff;

  return Address;
}

/*----------------------------------------------------------------------------*/
/* This is for the use of the video routines.  It returns a pointer to
   a continuous area of 'n' bytes containing the contents of the
   'n' bytes of beeb memory starting at address 'a', with wrap around
   at 0x8000.  Potentially this routine may return a pointer into  a static
   buffer - so use the contents before recalling it
   'n' must be less than 1K in length.
   See 'BeebMemPtrWithWrapMo7' for use in Mode 7 - it's a special case.
*/

export function BeebMemPtrWithWrap(Address: number, Length: number) {
  // static unsigned char tmpBuf[1024];
  // unsigned char *tmpBufPtr;

  Address = WrapAddr(Address);
  const EndAddress = WrapAddr(Address + Length - 1);

  if (Address <= EndAddress) {
    return Address;
  }

  throw "error";

  // int toCopy = 0x8000 - Address;

  // if (toCopy > Length) toCopy = Length;

  // if (toCopy > 0) {
  //   memcpy(tmpBuf, WholeRam + Address, toCopy);
  // }

  // tmpBufPtr = tmpBuf + toCopy;
  // toCopy = Length - toCopy;

  // if (toCopy > 0) {
  //   memcpy(tmpBufPtr, WholeRam + EndAddress - (toCopy - 1), toCopy);
  // }

  // // Tripling is for Shadow RAM handling
  // return tmpBuf;
}
