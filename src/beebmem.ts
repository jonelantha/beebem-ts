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

const WholeRam = new Uint8Array(65536);
export const getWholeRam = () => WholeRam;

export async function tempLoadMemSnapshot(file: string) {
  const res = await fetch(file);
  const buffer = await res.arrayBuffer();
  WholeRam.set(new Uint8Array(buffer));
}

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

/*----------------------------------------------------------------------------*/

// Perform hardware address wrap around for mode 7.
//
// The beeb uses the 14-bit address generated by the 6845 in one of two
// different ways. If the top bit of the address (value 0x2000) is set then
// the beeb treats it as a mode 7 address, otherwise it treats it as a mode 0-6
// address. Note that this is independent of the teletext select bit in the
// video ULA.
//
// In mode 7 the 6845 is programmed with a start address between 0x2000 and
// 0x23ff to display data from 0x3C00 to 0x3fff or with a start address
// between 0x2800 and 0x2bff to display data from 0x7C00 to 0x7fff.
//
// This code handles wrapping at 1K by ignoring the 0x400 bit.
//
// If the 6845 is programmed with a start address of 0x2400 it accesses
// memory from 0x3c00 to 0x3fff then 0x7c00 to 0x7fff giving a 2K linear
// buffer.

function WrapAddrMode7(Address: number) {
  return ((Address & 0x800) << 3) | 0x3c00 | (Address & 0x3ff);
}

/*----------------------------------------------------------------------------*/

// Special case of BeebMemPtrWithWrap for use in mode 7

export function BeebMemPtrWithWrapMode7(Address: number, Length: number) {
  return WrapAddrMode7(Address);
  // static unsigned char tmpBuf[1024];

  // const unsigned char *Memory = WholeRam;

  // for (int i = 0; i < Length; i++, Address++) {
  // 	tmpBuf[i] = Memory[WrapAddrMode7(Address)];
  // }

  // return tmpBuf;
}

/*----------------------------------------------------------------------------*/
export function BeebMemInit(_LoadRoms: boolean) {
  // Reset everything
  // memset(WholeRam,0,0x8000);
  // if (LoadRoms) {
  //   // This shouldn't be required for sideways RAM.
  //   DebugInitMemoryMaps();
  //   BeebReadRoms(); // Only load roms on start
  // }
  // /* Put first ROM in */
  // memcpy(WholeRam+0x8000,Roms[0xf],0x4000);
  // PagedRomReg=0xf;
}
