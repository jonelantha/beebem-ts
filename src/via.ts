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

// header

export type VIAState = {
  ora: number; // unsigned char
  orb: number; // unsigned char
  ira: number; // unsigned char
  irb: number; // unsigned char
  ddra: number; // unsigned char
  ddrb: number; // unsigned char
  acr: number; // unsigned char
  pcr: number; // unsigned char
  ifr: number; // unsigned char
  ier: number; // unsigned char
  timer1c: number; // int
  timer2c: number /* int, NOTE: Timers descrement at 2MHz and values are */;
  timer1l: number; // int
  timer2l: number /* int,  fixed up on read/write - latches hold 1MHz values*/;
  timer1hasshot: boolean; // True if we have already caused an interrupt for one shot mode
  timer2hasshot: boolean; // True if we have already caused an interrupt for one shot mode
  timer1adjust: number; // int,  Adjustment for 1.5 cycle counts, every other interrupt, it becomes 2 cycles instead of one
  timer2adjust: number; //int, Adjustment for 1.5 cycle counts, every other interrupt, it becomes 2 cycles instead of one
  sr: number; // unsigned char
  ca2: boolean;
  cb2: boolean;
};

// 6522 Peripheral Control Register
export const PCR_CB2_CONTROL = 0xe0;
export const PCR_CB1_INTERRUPT_CONTROL = 0x10;
export const PCR_CA2_CONTROL = 0x0e;
export const PCR_CA1_INTERRUPT_CONTROL = 0x01;

// PCR CB2 control bits
export const PCR_CB2_OUTPUT_PULSE = 0xa0;
export const PCR_CB2_OUTPUT_LOW = 0xc0;
export const PCR_CB2_OUTPUT_HIGH = 0xe0;

// PCR CB1 interrupt control bit
export const PCB_CB1_POSITIVE_INT = 0x10;

// PCR CA2 control bits
export const PCR_CA2_OUTPUT_PULSE = 0x0a;
export const PCR_CA2_OUTPUT_LOW = 0x0c;
export const PCR_CA2_OUTPUT_HIGH = 0x0e;

// PCR CA1 interrupt control bit
export const PCB_CA1_POSITIVE_INT = 0x01;

// main

export function VIAReset(ToReset: VIAState) {
  ToReset.ora = ToReset.orb = 0xff;
  ToReset.ira = ToReset.irb = 0xff;
  ToReset.ddra = ToReset.ddrb = 0; /* All inputs */
  ToReset.acr = 0; /* Timed ints on t1, t2, no pb7 hacking, no latching, no shifting */
  ToReset.pcr = 0; /* Neg edge inputs for cb2,ca2 and CA1 and CB1 */
  ToReset.ifr = 0; /* No interrupts presently interrupting */
  ToReset.ier = 0x80; /* No interrupts enabled */
  ToReset.timer1l = ToReset.timer2l = 0xffff; /*0xffff; */
  ToReset.timer1c = ToReset.timer2c = 0xffff; /*0x1ffff; */
  ToReset.timer1hasshot = false;
  ToReset.timer2hasshot = false;
  ToReset.timer1adjust = 0; //Added by Ken Lowe 24/08/03
  ToReset.timer2adjust = 0;
  ToReset.ca2 = false;
  ToReset.cb2 = false;
}
