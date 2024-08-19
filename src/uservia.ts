/****************************************************************
BeebEm - BBC Micro and Master 128 Emulator
Copyright (C) 1994  David Alan Gilbert
Copyright (C) 1997  Mike Wyatt
Copyright (C) 2004  Ken Lowe

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

import {
  ClearTrigger,
  getCyclesToInt,
  getIntStatus,
  getTotalCycles,
  IRQ_userVia,
  NO_TIMER_INT_DUE,
  setCyclesToInt,
  setIntStatus,
  SetTrigger,
} from "./6502core";
import { CycleCountTMax } from "./port";
import { VIAReset, VIAState } from "./via";

// Shift Register
let SRTrigger = 0; // int

/* My raw VIA state */
const UserVIAState: VIAState = {
  ora: 0xff,
  orb: 0xff,
  ira: 0xff,
  irb: 0xff,
  ddra: 0,
  ddrb: 0,
  acr: 0,
  pcr: 0,
  ifr: 0,
  ier: 0x80,
  timer1c: 0xffff,
  timer2c: 0xffff,
  timer1l: 0xffff,
  timer2l: 0xffff,
  timer1hasshot: false,
  timer2hasshot: false,
  timer1adjust: 0,
  timer2adjust: 0,
  sr: 0,
  ca2: false,
  cb2: false,
};

/*--------------------------------------------------------------------------*/
function UpdateIFRTopBit() {
  /* Update top bit of IFR */
  if (UserVIAState.ifr & (UserVIAState.ier & 0x7f)) UserVIAState.ifr |= 0x80;
  else UserVIAState.ifr &= 0x7f;

  setIntStatus(getIntStatus() & ~(1 << IRQ_userVia));

  if (UserVIAState.ifr & 128) {
    setIntStatus(getIntStatus() | (1 << IRQ_userVia));
  }
}

/*--------------------------------------------------------------------------*/
/* Address is in the range 0-f - with the fe60 stripped out */
/**
 * @param Address int
 * @param Value unsigned char
 */
export function UserVIAWrite(Address: number, Value: number) {
  // DebugTrace("UserVIAWrite: Address=0x%02x Value=0x%02x\n", Address, Value);

  // if (DebugEnabled)
  // {
  // 	DebugDisplayTraceF(DebugType::UserVIA, "UserVia: Write address % X value % 02X",
  // 	                   Address & 0xf, Value);
  // }

  switch (Address) {
    case 0:
      throw "not impl";
      UserVIAState.orb = Value;

      if (UserVIAState.ifr & 8 && (UserVIAState.pcr & 0x20) == 0) {
        UserVIAState.ifr &= 0xf7;
        UpdateIFRTopBit();
      }

      break;

    case 1:
      UserVIAState.ora = Value;
      UserVIAState.ifr &= 0xfc;
      UpdateIFRTopBit();
      break;

    case 2:
      UserVIAState.ddrb = Value;
      break;

    case 3:
      UserVIAState.ddra = Value;
      break;

    case 4:
    case 6:
      // DebugTrace("UserVia Reg4 Timer1 lo Counter Write val=0x%02x at %d\n", Value, TotalCycles);
      UserVIAState.timer1l &= 0xff00;
      UserVIAState.timer1l |= Value & 0xff;
      break;

    case 5:
      // DebugTrace("UserVia Reg5 Timer1 hi Counter Write val=0x%02x at %d\n", Value, TotalCycles);
      UserVIAState.timer1l &= 0xff;
      UserVIAState.timer1l |= Value << 8;
      UserVIAState.timer1c = UserVIAState.timer1l * 2 + 1;
      UserVIAState.ifr &= 0xbf; /* clear timer 1 ifr */
      /* If PB7 toggling enabled, then lower PB7 now */
      if (UserVIAState.acr & 128) {
        UserVIAState.orb &= 0x7f;
        UserVIAState.irb &= 0x7f;
      }
      UpdateIFRTopBit();
      UserVIAState.timer1hasshot = false; // Added by K.Lowe 24/08/03
      break;

    case 7:
      // DebugTrace("UserVia Reg7 Timer1 hi latch Write val=0x%02x at %d\n", Value, TotalCycles);
      UserVIAState.timer1l &= 0xff;
      UserVIAState.timer1l |= Value << 8;
      UserVIAState.ifr &= 0xbf; /* clear timer 1 ifr (this is what Model-B does) */
      UpdateIFRTopBit();
      break;

    case 8:
      // DebugTrace("UserVia Reg8 Timer2 lo Counter Write val=0x%02x at %d\n", Value, TotalCycles);
      UserVIAState.timer2l &= 0xff00;
      UserVIAState.timer2l |= Value;
      break;

    case 9:
      // DebugTrace("UserVia Reg9 Timer2 hi Counter Write val=0x%02x at %d\n", Value, TotalCycles);
      UserVIAState.timer2l &= 0xff;
      UserVIAState.timer2l |= Value << 8;
      UserVIAState.timer2c = UserVIAState.timer2l * 2 + 1;
      UserVIAState.ifr &= 0xdf; /* clear timer 2 ifr */
      UpdateIFRTopBit();
      UserVIAState.timer2hasshot = false; // Added by K.Lowe 24/08/03
      break;

    case 10:
      throw "not impl";
      UserVIAState.sr = Value;
      UpdateSRState(true);
      break;

    case 11:
      UserVIAState.acr = Value;
      UpdateSRState(false);
      break;

    case 12:
      UserVIAState.pcr = Value;
      break;

    case 13:
      UserVIAState.ifr &= ~Value;
      UpdateIFRTopBit();
      break;

    case 14:
      // DebugTrace("User VIA Write ier Value=0x%02x\n", Value);
      if (Value & 0x80) UserVIAState.ier |= Value;
      else UserVIAState.ier &= ~Value;
      UserVIAState.ier &= 0x7f;
      UpdateIFRTopBit();
      break;

    case 15:
      throw "not impl";
      UserVIAState.ora = Value;
      break;
  }
}

/*--------------------------------------------------------------------------*/

// Address is in the range 0-f - with the fe60 stripped out

/**
 * @param Address int
 */
export function UserVIARead(Address: number) {
  let tmp = 0xff; // unsigned char

  // DebugTrace("UserVIARead: Address=0x%02x at %d\n", Address, TotalCycles);

  switch (Address) {
    case 0 /* IRB read */:
      tmp =
        (UserVIAState.orb & UserVIAState.ddrb) |
        (UserVIAState.irb & ~UserVIAState.ddrb);
      break;

    case 2:
      tmp = UserVIAState.ddrb;
      break;

    case 3:
      tmp = UserVIAState.ddra;
      break;

    case 4 /* Timer 1 lo counter */:
      if (UserVIAState.timer1c < 0) tmp = 0xff;
      else tmp = (UserVIAState.timer1c / 2) & 0xff;
      UserVIAState.ifr &= 0xbf; /* Clear bit 6 - timer 1 */
      UpdateIFRTopBit();
      break;

    case 5 /* Timer 1 hi counter */:
      tmp = (UserVIAState.timer1c >> 9) & 0xff;
      break;

    case 6 /* Timer 1 lo latch */:
      tmp = UserVIAState.timer1l & 0xff;
      break;

    case 7 /* Timer 1 hi latch */:
      tmp = (UserVIAState.timer1l >> 8) & 0xff;
      break;

    case 8 /* Timer 2 lo counter */:
      if (UserVIAState.timer2c < 0)
        /* Adjust for dividing -ve count by 2 */
        tmp = ((UserVIAState.timer2c - 1) / 2) & 0xff;
      else tmp = (UserVIAState.timer2c / 2) & 0xff;
      UserVIAState.ifr &= 0xdf; /* Clear bit 5 - timer 2 */
      UpdateIFRTopBit();
      break;

    case 9 /* Timer 2 hi counter */:
      tmp = (UserVIAState.timer2c >> 9) & 0xff;
      break;

    case 10:
      tmp = UserVIAState.sr;
      UpdateSRState(true);
      break;

    case 11:
      tmp = UserVIAState.acr;
      break;

    case 12:
      tmp = UserVIAState.pcr;
      break;

    case 13:
      UpdateIFRTopBit();
      tmp = UserVIAState.ifr;
      break;

    case 14:
      tmp = UserVIAState.ier | 0x80;
      break;

    case 1:
      throw "not impl";
      UserVIAState.ifr &= 0xfc;
      UpdateIFRTopBit();
    case 15:
      tmp = 255;
      break;
  }

  // if (DebugEnabled)
  // {
  //   DebugDisplayTraceF(DebugType::UserVIA, "UserVia: Read address %X value %02X",
  //                      Address & 0xf, tmp & 0xff);
  // }

  return tmp;
}

/*--------------------------------------------------------------------------*/
// void UserVIATriggerCA1Int()
// {
// 	/* We should be concerned with active edges etc. */
// 	UserVIAState.ifr |= 2; /* CA1 */
// 	UpdateIFRTopBit();
// }

/*--------------------------------------------------------------------------*/
let t1int = false;
function UserVIA_poll_real() {
  if (UserVIAState.timer1c < -2 && !t1int) {
    t1int = true;
    if (!UserVIAState.timer1hasshot || UserVIAState.acr & 0x40) {
      // DebugTrace("UserVIA timer1c - int at %d\n", TotalCycles);
      UserVIAState.ifr |= 0x40; /* Timer 1 interrupt */
      UpdateIFRTopBit();

      if (UserVIAState.acr & 0x80) {
        UserVIAState.orb ^= 0x80; /* Toggle PB7 */
        UserVIAState.irb ^= 0x80; /* Toggle PB7 */
      }

      if (UserVIAState.ier & 0x40 && getCyclesToInt() == NO_TIMER_INT_DUE) {
        setCyclesToInt(3 + UserVIAState.timer1c);
      }

      UserVIAState.timer1hasshot = true;
    }
  }

  if (UserVIAState.timer1c < -3) {
    // DebugTrace("UserVIA timer1c\n");
    UserVIAState.timer1c += UserVIAState.timer1l * 2 + 4;
    t1int = false;
  }

  if (UserVIAState.timer2c < -2) {
    if (!UserVIAState.timer2hasshot) {
      // DebugTrace("UserVIA timer2c - int\n");
      UserVIAState.ifr |= 0x20; /* Timer 2 interrupt */
      UpdateIFRTopBit();

      if (UserVIAState.ier & 0x20 && getCyclesToInt() == NO_TIMER_INT_DUE) {
        setCyclesToInt(3 + UserVIAState.timer2c);
      }

      UserVIAState.timer2hasshot = true; // Added by K.Lowe 24/08/03
    }
  }

  if (UserVIAState.timer2c < -3) {
    // DebugTrace("UserVIA timer2c\n");
    UserVIAState.timer2c += 0x20000; // Do not reload latches for T2
  }
}

/**
 * @param ncycles // unsigned int
 */
export function UserVIA_poll(ncycles: number) {
  // Converted to a proc to allow shift register functions

  UserVIAState.timer1c -= ncycles;

  if (!(UserVIAState.acr & 0x20)) UserVIAState.timer2c -= ncycles;

  if (UserVIAState.timer1c < 0 || UserVIAState.timer2c < 0) {
    UserVIA_poll_real();
  }

  if (SRTrigger <= getTotalCycles()) SRPoll();
}

/*--------------------------------------------------------------------------*/
export function UserVIAReset() {
  VIAReset(UserVIAState);
  SRTrigger = 0;
}

// int sgn(int number)
// {
// 	if (number > 0) return 1;
// 	if (number < 0) return -1;
// 	return 0;
// }

/*--------------------------------------------------------------------------*/
let SRMode = 0; // int

function SRPoll() {
  if (SRTrigger == 0) {
    SRTrigger = ClearTrigger();
    UpdateSRState(false);
  } else if (SRMode == 6) {
    if (!(UserVIAState.ifr & 0x04)) {
      // Shift complete
      UserVIAState.ifr |= 0x04;
      UpdateIFRTopBit();
    }
    SRTrigger = ClearTrigger();
  }
}

function UpdateSRState(SRrw: boolean) {
  SRMode = (UserVIAState.acr >> 2) & 7;

  if (SRMode == 6 && SRTrigger == CycleCountTMax) {
    SRTrigger = SetTrigger(16);
  }

  if (SRrw) {
    if (UserVIAState.ifr & 0x04) {
      UserVIAState.ifr &= 0xfb;
      UpdateIFRTopBit();
    }
  }
}

/*--------------------------------------------------------------------------*/
// void DebugUserViaState()
// {
// 	DebugViaState("UserVia", &UserVIAState);
// }
