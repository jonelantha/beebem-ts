/****************************************************************
BeebEm - BBC Micro and Master 128 Emulator
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

/* Analogue to digital converter support file for the beeb emulator -
   Mike Wyatt 7/6/97 */

import { ClearTrigger, getTotalCycles, SetTrigger } from "./6502core";
import { PulseSysViaCB1 } from "./sysvia";

// header

export const AtoD_poll = (_ncycles: number) =>
  AtoDTrigger <= getTotalCycles() && AtoD_poll_real();

// main

/* A to D state */
type AtoDStateT = {
  datalatch: number; // unsigned char
  status: number; // unsigned char
  high: number; // unsigned char
  low: number; // unsigned char
};

const AtoDState: AtoDStateT = {
  datalatch: 0,
  status: 0,
  high: 0,
  low: 0,
};

let AtoDTrigger = 0; /* For next A to D conversion completion */

/*--------------------------------------------------------------------------*/
/* Address is in the range 0-f - with the fec0 stripped out */
/**
 * @param Address int
 * @param Value unsigned char
 */
export function AtoDWrite(Address: number, Value: number) {
  if (Address == 0) {
    AtoDState.datalatch = Value;

    const TimeToConvert =
      AtoDState.datalatch & 8
        ? 20000 // 10 bit conversion, 10 ms
        : 8000; // 8 bit conversion, 4 ms

    AtoDTrigger = SetTrigger(TimeToConvert);

    AtoDState.status = (AtoDState.datalatch & 0xf) | 0x80; // busy, not complete
  }
}

/*--------------------------------------------------------------------------*/

// Address is in the range 0-f - with the fec0 stripped out

//    unsigned char AtoDRead(int Address)
//    {
//        unsigned char Value = 0xff;

//        switch (Address)
//        {
//        case 0:
//            Value = AtoDState.status;
//            break;

//        case 1:
//            Value = AtoDState.high;
//            break;

//        case 2:
//            Value = AtoDState.low;
//            break;
//        }

//        return Value;
//    }

/*--------------------------------------------------------------------------*/
function AtoD_poll_real() {
  let value: number;

  AtoDTrigger = ClearTrigger();
  AtoDState.status &= 0xf;
  AtoDState.status |= 0x40; /* not busy */
  PulseSysViaCB1();

  switch (AtoDState.status & 3) {
    case 0:
      value = 32767; // JoystickX - middle
      break;
    case 1:
      value = 32767; // JoystickY - middle
      break;
    default:
      value = 0;
      break;
  }

  AtoDState.status |= (value & 0xc000) >> 10;
  AtoDState.high = /*(unsigned char)*/ value >> 8;
  AtoDState.low = value & 0xf0;
}

/*--------------------------------------------------------------------------*/
export function AtoDInit() {
  AtoDState.datalatch = 0;
  AtoDState.high = 0;
  AtoDState.low = 0;
  AtoDTrigger = ClearTrigger();

  /* Not busy, conversion complete (OS1.2 will then request another conversion) */
  AtoDState.status = 0x40;
  PulseSysViaCB1();
}
