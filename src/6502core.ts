/****************************************************************
BeebEm - BBC Micro and Master 128 Emulator
Copyright (C) 1994  David Alan Gilbert
Copyright (C) 1997  Mike Wyatt
Copyright (C) 2001  Richard Gellman

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

import { AtoD_poll } from "./atodconv";
import {
  BeebReadMem,
  BEEBREADMEM_DIRECT,
  BeebWriteMem,
  BEEBWRITEMEM_DIRECT,
} from "./beebmem";
import { Disc8271Poll } from "./disc8271";
import { CycleCountTMax, CycleCountWrap } from "./port";
import { SerialPoll } from "./serial";
import { SysVIA_poll } from "./sysvia";
import { UserVIA_poll } from "./uservia";
import { VideoPoll } from "./video";

// header

export const IRQ_sysVia = 0;
export const IRQ_userVia = 1;
export const IRQ_serial = 2;
export const IRQ_tube = 3;
export const IRQ_teletext = 4;
export const IRQ_hdc = 5;

const FlagC = 1;
const FlagZ = 2;
const FlagI = 4;
const FlagD = 8;
const FlagB = 16;
const FlagV = 64;
const FlagN = 128;

export const NO_TIMER_INT_DUE = -1000000;

export const SetTrigger = (after: number) => TotalCycles + after;
export const IncTrigger = (after: number, trigger: number) => trigger + after;

export const ClearTrigger = () => CycleCountTMax;

// util

const charToSignedChar = (char: number) => (char & 0x80 ? char - 0x100 : char);
const intToUnsignedChar = (val: number) => {
  if (val > 127 || val < -128) throw `out of range ${val.toString(16)}`;
  return val >= 0 ? val : val + 0x100;
};
const charToUnsignedChar = (val: number) => {
  if (val > 0xff || val < -0xff) throw `out of range ${val.toString(16)}`;
  return val >= 0 ? val : val + 0xff;
};

// main

let tempInstCount = 0;
export const getInstCount = () => tempInstCount;

let CurrentInstruction = -1;

let TotalCycles = 0;
export const getTotalCycles = () => TotalCycles;

let ProgramCounter: number; // int
let Accumulator: number, XReg: number, YReg: number; // int
let StackReg: number, PSR: number; // unsigned char
let IRQCycles: number; // unsigned char

let intStatus = 0; /* unsigned char, bit set (nums in IRQ_Nums) if interrupt being caused */
export const setIntStatus = (val: number) => (intStatus = val);
export const getIntStatus = () => intStatus;

let NMILock = false; // Well I think NMI's are maskable - to stop repeated NMI's - the lock is released when an RTI is done

/* Note how GETCFLAG is special since being bit 0 we don't need to test it to get a clean 0/1 */
const GETCFLAG = () => (PSR & FlagC) > 0;
const GETZFLAG = () => (PSR & FlagZ) > 0;
const GETIFLAG = () => (PSR & FlagI) > 0;
const GETDFLAG = () => (PSR & FlagD) > 0;
const GETBFLAG = () => (PSR & FlagB) > 0;
const GETVFLAG = () => (PSR & FlagV) > 0;
const GETNFLAG = () => (PSR & FlagN) > 0;

// prettier-ignore
const CyclesTable = [
/*0  1  2  3  4  5  6  7  8  9  a  b  c  d  e  f */
  7, 6, 1, 8, 3, 3, 5, 5, 3, 2, 2, 2, 4, 4, 6, 6, /* 0 */
  2, 5, 1, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, /* 1 */
  6, 6, 1, 8, 3, 3, 5, 5, 4, 2, 2, 2, 4, 4, 6, 6, /* 2 */
  2, 5, 1, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, /* 3 */
  6, 6, 1, 8, 3, 3, 5, 5, 3, 2, 2, 2, 3, 4, 6, 6, /* 4 */
  2, 5, 1, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, /* 5 */
  6, 6, 1, 8, 3, 3, 5, 5, 4, 2, 2, 2, 5, 4, 6, 6, /* 6 */
  2, 5, 1, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, /* 7 */
  2, 6, 2, 6, 3, 3, 3, 3, 2, 2, 2, 2, 4, 4, 4, 7, /* 8 */
  2, 6, 1, 6, 4, 4, 4, 4, 2, 5, 2, 5, 5, 5, 5, 5, /* 9 */
  2, 6, 2, 6, 3, 3, 3, 3, 2, 2, 2, 2, 4, 4, 4, 4, /* a */
  2, 5, 1, 5, 4, 4, 4, 4, 2, 4, 2, 4, 4, 4, 4, 4, /* b */
  2, 6, 2, 8, 3, 3, 5, 5, 2, 2, 2, 2, 4, 4, 6, 6, /* c */
  2, 5, 1, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, /* d */
  2, 6, 2, 8, 3, 3, 5, 5, 2, 2, 2, 2, 4, 4, 6, 6, /* e */
  2, 5, 1, 8, 4, 4, 6, 6, 2, 4, 2, 7, 4, 4, 7, 7, /* f */
];

// Number of cycles to start of memory read cycle
// prettier-ignore
const CyclesToMemRead = [
/*0  1  2  3  4  5  6  7  8  9  a  b  c  d  e  f */
  0, 5, 0, 7, 0, 2, 2, 2, 0, 0, 0, 0, 3, 3, 3, 3,  /* 0 */
  0, 4, 0, 7, 0, 3, 3, 3, 0, 3, 0, 0, 3, 3, 4, 4,  /* 1 */
  0, 5, 0, 7, 0, 2, 2, 2, 0, 0, 0, 0, 3, 3, 3, 3,  /* 2 */
  0, 4, 0, 7, 0, 3, 3, 3, 0, 3, 0, 0, 3, 3, 4, 4,  /* 3 */
  0, 5, 0, 7, 0, 2, 2, 2, 0, 0, 0, 0, 0, 3, 3, 3,  /* 4 */
  0, 4, 0, 7, 0, 3, 3, 3, 0, 3, 0, 0, 3, 3, 4, 4,  /* 5 */
  0, 5, 0, 7, 0, 2, 2, 2, 0, 0, 0, 0, 0, 3, 3, 3,  /* 6 */
  0, 4, 0, 7, 0, 3, 3, 3, 0, 3, 0, 0, 3, 3, 4, 4,  /* 7 */
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,  /* 8 */
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,  /* 9 */
  0, 5, 0, 5, 2, 2, 2, 2, 0, 0, 0, 0, 3, 3, 3, 3,  /* a */
  0, 4, 0, 4, 3, 3, 3, 3, 0, 3, 0, 0, 3, 3, 4, 4,  /* b */
  0, 5, 0, 7, 2, 2, 2, 2, 0, 0, 0, 0, 3, 3, 3, 3,  /* c */
  0, 4, 0, 7, 0, 3, 3, 3, 0, 3, 0, 0, 3, 3, 4, 4,  /* d */
  0, 5, 0, 7, 2, 2, 2, 2, 0, 0, 0, 0, 3, 3, 3, 3,  /* e */
  0, 4, 0, 7, 0, 3, 3, 3, 0, 3, 0, 0, 3, 3, 4, 4,  /* f */
];

// Number of cycles to start of memory write cycle
// prettier-ignore
const CyclesToMemWrite = [
/*0  1  2  3  4  5  6  7  8  9  a  b  c  d  e  f */
  0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 2, 2,  /* 0 */
  0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 2, 2,  /* 1 */
  0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 2, 2,  /* 2 */
  0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 2, 2,  /* 3 */
  0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 2, 2,  /* 4 */
  0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 2, 2,  /* 5 */
  0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 2, 2,  /* 6 */
  0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 2, 2,  /* 7 */
  0, 5, 0, 5, 2, 2, 2, 2, 0, 0, 0, 0, 3, 3, 3, 3,  /* 8 */
  0, 5, 0, 5, 3, 3, 3, 3, 0, 4, 0, 0, 0, 0, 0, 4,  /* 9 */
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,  /* a */
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,  /* b */
  0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 2, 2,  /* c */
  0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 2, 2,  /* d */
  0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 2, 2,  /* e */
  0, 0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 2, 2,  /* f */
];

/* The number of cycles to be used by the current instruction - exported to
   allow fernangling by memory subsystem */
let Cycles: number; // unsigned int

/* Number of cycles VIAs advanced for mem read and writes */
let ViaCycles: number; // unsigned int

/* Number of additional cycles for IO read / writes */
let IOCycles = 0; // int

/* Flag indicating if an interrupt is due */
let IntDue = false;

/* When a timer interrupt is due this is the number of cycles
   to it (usually -ve) */
let CyclesToInt = NO_TIMER_INT_DUE; // int
export const getCyclesToInt = () => CyclesToInt;
export const setCyclesToInt = (value: number) => (CyclesToInt = value);

let Branched = false; // true if the instruction branched
// // 1 if first cycle happened

// Get a two byte address from the program counter, and then post inc
// the program counter
function GETTWOBYTEFROMPC() {
  return ReadPaged(ProgramCounter++) | (ReadPaged(ProgramCounter++) << 8);
}

const WritePaged = BeebWriteMem;
const ReadPaged = BeebReadMem;

/*----------------------------------------------------------------------------*/

// Correct cycle count for indirection across page boundary

function Carried() {
  if (
    ((CurrentInstruction & 0xf) == 0x1 ||
      (CurrentInstruction & 0xf) == 0x9 ||
      (CurrentInstruction & 0xf) == 0xd) &&
    (CurrentInstruction & 0xf0) != 0x90
  ) {
    Cycles++;
  } else if (
    CurrentInstruction == 0x1c ||
    CurrentInstruction == 0x3c ||
    CurrentInstruction == 0x5c ||
    CurrentInstruction == 0x7c ||
    CurrentInstruction == 0xb3 ||
    CurrentInstruction == 0xbb ||
    CurrentInstruction == 0xbc ||
    CurrentInstruction == 0xbe ||
    CurrentInstruction == 0xbf ||
    CurrentInstruction == 0xdc ||
    CurrentInstruction == 0xfc
  ) {
    Cycles++;
  }
}

/*----------------------------------------------------------------------------*/
function DoIntCheck() {
  if (!IntDue) {
    IntDue = intStatus != 0;
    if (!IntDue) {
      CyclesToInt = NO_TIMER_INT_DUE;
    } else if (CyclesToInt == NO_TIMER_INT_DUE) {
      // Non-timer interrupt has occurred
      CyclesToInt = 0;
    }
  }
}
/*----------------------------------------------------------------------------*/

// IO read + write take extra cycle & require sync with 1MHz clock (taken
// from Model-b - have not seen this documented anywhere)

export function SyncIO() {
  if ((TotalCycles + Cycles) & 1) {
    Cycles++;
    IOCycles = 1;
    PollVIAs(1);
  } else {
    IOCycles = 0;
  }
}

export function AdjustForIORead() {
  Cycles++;
  IOCycles += 1;
  PollVIAs(1);
}

export function AdjustForIOWrite() {
  Cycles++;
  IOCycles += 1;
  PollVIAs(1);
  DoIntCheck();
}

/*----------------------------------------------------------------------------*/

function AdvanceCyclesForMemRead() {
  // Advance VIAs to point where mem read happens
  Cycles += CyclesToMemRead[CurrentInstruction];
  PollVIAs(CyclesToMemRead[CurrentInstruction]);

  // Check if interrupt should be taken if instruction does
  // a read but not a write (write instructions checked below).
  if (
    CyclesToMemRead[CurrentInstruction] != 0 &&
    CyclesToMemWrite[CurrentInstruction] == 0
  ) {
    DoIntCheck();
  }
}

function AdvanceCyclesForMemWrite() {
  // Advance VIAs to point where mem write happens
  Cycles += CyclesToMemWrite[CurrentInstruction];
  PollVIAs(CyclesToMemWrite[CurrentInstruction]);

  DoIntCheck();
}

/*----------------------------------------------------------------------------*/
/* Set the Z flag if 'in' is 0, and N if bit 7 is set - leave all other bits  */
/* untouched.                                                                 */
function SetPSRZN(inOperand: number) {
  PSR &= ~(FlagZ | FlagN);
  PSR |= (inOperand === 0 ? FlagZ : 0) | (inOperand & FlagN);
}

/*----------------------------------------------------------------------------*/
/* Note: n is 128 for true - not 1                                            */
function SetPSR(
  mask: number,
  c: 0 | 1,
  z: 0 | 1,
  i: 0 | 1,
  d: 0 | 1,
  b: 0 | 1,
  v: 0 | 1,
  n: 0 | 128,
) {
  PSR &= ~mask;
  PSR |= c | (z << 1) | (i << 2) | (d << 3) | (b << 4) | (v << 6) | n;
} /* SetPSR */

/*----------------------------------------------------------------------------*/
/* NOTE!!!!! n is 128 or 0 - not 1 or 0                                       */
function SetPSRCZN(c: 1 | 0, z: 1 | 0, n: 128 | 0) {
  PSR &= ~(FlagC | FlagZ | FlagN);
  PSR |= c | (z << 1) | n;
} /* SetPSRCZN */

/*----------------------------------------------------------------------------*/
/**
 * @param ToPush // unsigned char
 */
function Push(ToPush: number) {
  BEEBWRITEMEM_DIRECT(0x100 + StackReg, ToPush);
  StackReg--;
} /* Push */

/*----------------------------------------------------------------------------*/
function Pop() {
  StackReg++;
  return BEEBREADMEM_DIRECT(0x100 + StackReg);
} /* Pop */

/*----------------------------------------------------------------------------*/
/**
 * @param topush int
 */
function PushWord(topush: number) {
  Push((topush >> 8) & 255);
  Push(topush & 255);
}

/*----------------------------------------------------------------------------*/
function PopWord() {
  let RetValue = Pop();
  RetValue |= Pop() << 8;
  return RetValue;
}

/*-------------------------------------------------------------------------*/

// Relative addressing mode handler

function RelAddrModeHandler_Data() {
  // For branches - is this correct - i.e. is the program counter incremented
  // at the correct time?
  let EffectiveAddress = charToSignedChar(ReadPaged(ProgramCounter++));
  EffectiveAddress += ProgramCounter;

  return EffectiveAddress;
}

/*----------------------------------------------------------------------------*/

/**
 * @param operand int
 */
function ADCInstrHandler(operand: number) {
  /* NOTE! Not sure about C and V flags */
  if (!GETDFLAG()) {
    const TmpResultC = Accumulator + operand + (GETCFLAG() ? 1 : 0);
    const TmpResultV =
      charToSignedChar(Accumulator) +
      charToSignedChar(operand) +
      (GETCFLAG() ? 1 : 0);
    Accumulator = TmpResultC & 255;
    SetPSR(
      FlagC | FlagZ | FlagV | FlagN,
      (TmpResultC & 256) > 0 ? 1 : 0,
      Accumulator == 0 ? 1 : 0,
      0,
      0,
      0,
      ((Accumulator & 128) > 0 ? 1 : 0) ^ (TmpResultV < 0 ? 1 : 0) ? 1 : 0,
      Accumulator & 128 ? 128 : 0,
    );
  } else {
    throw "not impl 2";
    /* Z flag determined from 2's compl result, not BCD result! */
    // int TmpResult = Accumulator + operand + GETCFLAG;
    // int ZFlag = (TmpResult & 0xff) == 0;
    // int ln = (Accumulator & 0xf) + (operand & 0xf) + GETCFLAG;
    // int TmpCarry = 0;
    // if (ln > 9) {
    //   ln += 6;
    //   ln &= 0xf;
    //   TmpCarry = 0x10;
    // }
    // int hn = (Accumulator & 0xf0) + (operand & 0xf0) + TmpCarry;
    // /* N and V flags are determined before high nibble is adjusted.
    //    NOTE: V is not always correct */
    // int NFlag = hn & 128;
    // int VFlag = (hn ^ Accumulator) & 128 && !((Accumulator ^ operand) & 128);
    // int CFlag = 0;
    // if (hn > 0x90) {
    //   hn += 0x60;
    //   hn &= 0xf0;
    //   CFlag = 1;
    // }
    // Accumulator = hn | ln;
    // SetPSR(FlagC | FlagZ | FlagV | FlagN, CFlag, ZFlag, 0, 0, 0, VFlag, NFlag);
  }
} /* ADCInstrHandler */

/*----------------------------------------------------------------------------*/

/**
 * @param operand int
 */
function ANDInstrHandler(operand: number) {
  Accumulator &= operand;
  PSR &= ~(FlagZ | FlagN);
  PSR |= ((Accumulator == 0 ? 1 : 0) << 1) | (Accumulator & 128);
}

/**
 * @param address int
 */
function ASLInstrHandler(address: number) {
  const oldVal = ReadPaged(address);
  Cycles += 1;
  PollVIAs(1);
  WritePaged(address, oldVal);
  const newVal = /*(unsigned int)*/ (oldVal << 1) & 254;
  Cycles += CyclesToMemWrite[CurrentInstruction] - 1;
  PollVIAs(CyclesToMemWrite[CurrentInstruction] - 1);
  WritePaged(address, newVal);
  SetPSRCZN(
    (oldVal & 128) > 0 ? 1 : 0,
    newVal == 0 ? 1 : 0,
    newVal & 128 ? 128 : 0,
  );
} /* ASLInstrHandler */

function ASLInstrHandler_Acc() {
  let oldVal: number; // unsigned char
  let newVal: number; // unsigned char
  /* Accumulator */
  oldVal = Accumulator;
  Accumulator = newVal = /*(unsigned int)*/ (Accumulator << 1) & 254;
  SetPSRCZN(
    (oldVal & 128) > 0 ? 1 : 0,
    newVal == 0 ? 1 : 0,
    newVal & 128 ? 128 : 0,
  );
} /* ASLInstrHandler_Acc */

function BCCInstrHandler() {
  if (!GETCFLAG()) {
    ProgramCounter = RelAddrModeHandler_Data();
    Branched = true;
  } else ProgramCounter++;
} /* BCCInstrHandler */

function BCSInstrHandler() {
  if (GETCFLAG()) {
    ProgramCounter = RelAddrModeHandler_Data();
    Branched = true;
  } else ProgramCounter++;
} /* BCSInstrHandler */

function BEQInstrHandler() {
  if (GETZFLAG()) {
    ProgramCounter = RelAddrModeHandler_Data();
    Branched = true;
  } else ProgramCounter++;
} /* BEQInstrHandler */

/**
 * @param operand int
 */
function BITInstrHandler(operand: number) {
  PSR &= ~(FlagZ | FlagN | FlagV);
  /* z if result 0, and NV to top bits of operand */
  PSR |= (((Accumulator & operand) == 0 ? 1 : 0) << 1) | (operand & 192);
}

function BMIInstrHandler() {
  if (GETNFLAG()) {
    ProgramCounter = RelAddrModeHandler_Data();
    Branched = true;
  } else ProgramCounter++;
} /* BMIInstrHandler */

function BNEInstrHandler() {
  if (!GETZFLAG()) {
    ProgramCounter = RelAddrModeHandler_Data();
    Branched = true;
  } else ProgramCounter++;
} /* BNEInstrHandler */

function BPLInstrHandler() {
  if (!GETNFLAG()) {
    ProgramCounter = RelAddrModeHandler_Data();
    Branched = true;
  } else ProgramCounter++;
}

function BRKInstrHandler() {
  PushWord(ProgramCounter + 1);
  SetPSR(FlagB, 0, 0, 0, 0, 1, 0, 0); /* Set B before pushing */
  Push(PSR);
  SetPSR(FlagI, 0, 0, 1, 0, 0, 0, 0); /* Set I after pushing - see Birnbaum */
  ProgramCounter = BeebReadMem(0xfffe) | (BeebReadMem(0xffff) << 8);
} /* BRKInstrHandler */

function BVCInstrHandler() {
  if (!GETVFLAG()) {
    ProgramCounter = RelAddrModeHandler_Data();
    Branched = true;
  } else ProgramCounter++;
} /* BVCInstrHandler */

function BVSInstrHandler() {
  if (GETVFLAG()) {
    ProgramCounter = RelAddrModeHandler_Data();
    Branched = true;
  } else ProgramCounter++;
} /* BVSInstrHandler */

/**
 * @param operand int
 */
function CMPInstrHandler(operand: number) {
  /* NOTE! Should we consult D flag ? */
  const result = Accumulator - operand;
  let CFlag: 0 | 1 = 0;
  if (Accumulator >= operand) CFlag = FlagC;
  SetPSRCZN(CFlag, Accumulator == operand ? 1 : 0, result & 128 ? 128 : 0);
}

/**
 * @param operand int
 */
function CPXInstrHandler(operand: number) {
  const result = charToUnsignedChar(XReg - operand);
  SetPSRCZN(
    XReg >= operand ? 1 : 0,
    XReg == operand ? 1 : 0,
    result & 128 ? 128 : 0,
  );
}

/**
 * @param operand int
 */
function CPYInstrHandler(operand: number) {
  const result = charToUnsignedChar(YReg - operand);
  SetPSRCZN(
    YReg >= operand ? 1 : 0,
    YReg == operand ? 1 : 0,
    result & 128 ? 128 : 0,
  );
}

/**
 * @param address int
 */
function DECInstrHandler(address: number) {
  let val = ReadPaged(address); // unsigned char
  Cycles += 1;
  PollVIAs(1);
  WritePaged(address, val);
  val = charToUnsignedChar(val - 1);
  Cycles += CyclesToMemWrite[CurrentInstruction] - 1;
  PollVIAs(CyclesToMemWrite[CurrentInstruction] - 1);
  WritePaged(address, val);
  SetPSRZN(val);
}

function DEXInstrHandler() {
  XReg = (XReg - 1) & 255;
  SetPSRZN(XReg);
} /* DEXInstrHandler */

/**
 * @param operand int
 */
function EORInstrHandler(operand: number) {
  Accumulator ^= operand;
  SetPSRZN(Accumulator);
} /* EORInstrHandler */

/**
 * @param address int
 */
function INCInstrHandler(address: number) {
  let val = ReadPaged(address);
  Cycles += 1;
  PollVIAs(1);
  WritePaged(address, val);
  val = (val + 1) & 255;
  Cycles += CyclesToMemWrite[CurrentInstruction] - 1;
  PollVIAs(CyclesToMemWrite[CurrentInstruction] - 1);
  WritePaged(address, val);
  SetPSRZN(val);
} /* INCInstrHandler */

function INXInstrHandler() {
  XReg += 1;
  XReg &= 255;
  SetPSRZN(XReg);
} /* INXInstrHandler */

/**
 * @param address int
 */
function JSRInstrHandler(address: number) {
  PushWord(ProgramCounter - 1);
  ProgramCounter = address;
} /* JSRInstrHandler */

function LDAInstrHandler(operand: number) {
  Accumulator = operand;
  SetPSRZN(Accumulator);
}

/**
 * @param operand int
 */
function LDXInstrHandler(operand: number) {
  XReg = operand;
  SetPSRZN(XReg);
}

/**
 * @param operand int
 */
function LDYInstrHandler(operand: number) {
  YReg = operand;
  SetPSRZN(YReg);
}

/**
 * @param address int
 */
function LSRInstrHandler(address: number) {
  const oldVal = ReadPaged(address); // unsigned char
  Cycles += 1;
  PollVIAs(1);
  WritePaged(address, oldVal);
  const newVal = /*(unsigned int)*/ (oldVal >> 1) & 127;
  Cycles += CyclesToMemWrite[CurrentInstruction] - 1;
  PollVIAs(CyclesToMemWrite[CurrentInstruction] - 1);
  WritePaged(address, newVal);
  SetPSRCZN((oldVal & 1) > 0 ? 1 : 0, newVal == 0 ? 1 : 0, 0);
} /* LSRInstrHandler */

function LSRInstrHandler_Acc() {
  /* Accumulator */
  const oldVal = Accumulator;
  let newVal: number;
  Accumulator = newVal = /*(unsigned int)*/ (Accumulator >> 1) & 127;
  SetPSRCZN((oldVal & 1) > 0 ? 1 : 0, newVal == 0 ? 1 : 0, 0);
} /* LSRInstrHandler_Acc */

/**
 * @param operand int
 */
function ORAInstrHandler(operand: number) {
  Accumulator = Accumulator | operand;
  SetPSRZN(Accumulator);
}

/**
 * @param address int
 */
function ROLInstrHandler(address: number) {
  let oldVal = ReadPaged(address);
  Cycles += 1;
  PollVIAs(1);
  WritePaged(address, oldVal);
  let newVal = /*(unsigned int)*/ (oldVal << 1) & 254;
  newVal += GETCFLAG() ? 1 : 0;
  Cycles += CyclesToMemWrite[CurrentInstruction] - 1;
  PollVIAs(CyclesToMemWrite[CurrentInstruction] - 1);
  WritePaged(address, newVal);
  SetPSRCZN(
    (oldVal & 128) > 0 ? 1 : 0,
    newVal == 0 ? 1 : 0,
    newVal & 128 ? 128 : 0,
  );
}

function ROLInstrHandler_Acc() {
  const oldVal = Accumulator;
  let newVal = /*(unsigned int)*/ (oldVal << 1) & 254;
  newVal += GETCFLAG() ? 1 : 0;
  Accumulator = newVal;
  SetPSRCZN(
    (oldVal & 128) > 0 ? 1 : 0,
    newVal == 0 ? 1 : 0,
    newVal & 128 ? 128 : 0,
  );
} /* ROLInstrHandler_Acc */

/**
 * @param address int
 */
function RORInstrHandler(address: number) {
  const oldVal = ReadPaged(address);
  Cycles += 1;
  PollVIAs(1);
  WritePaged(address, oldVal);
  let newVal = /*(unsigned int)*/ (oldVal >> 1) & 127;
  newVal += (GETCFLAG() ? 1 : 0) * 128;
  Cycles += CyclesToMemWrite[CurrentInstruction] - 1;
  PollVIAs(CyclesToMemWrite[CurrentInstruction] - 1);
  WritePaged(address, newVal);
  SetPSRCZN(oldVal & 1 ? 1 : 0, newVal == 0 ? 1 : 0, newVal & 128 ? 128 : 0);
}

function RORInstrHandler_Acc() {
  const oldVal = Accumulator;
  let newVal = /*(unsigned int)*/ (oldVal >> 1) & 127;
  newVal += (GETCFLAG() ? 1 : 0) * 128;
  Accumulator = newVal;
  SetPSRCZN(oldVal & 1 ? 1 : 0, newVal == 0 ? 1 : 0, newVal & 128 ? 128 : 0);
}

/**
 * @param operand int
 */
function SBCInstrHandler(operand: number) {
  /* NOTE! Not sure about C and V flags */
  if (!GETDFLAG()) {
    const TmpResultV =
      charToSignedChar(Accumulator) -
      charToSignedChar(operand) -
      (1 - (GETCFLAG() ? 1 : 0));
    const TmpResultC = Accumulator - operand - (1 - (GETCFLAG() ? 1 : 0));
    Accumulator = TmpResultC & 255;
    SetPSR(
      FlagC | FlagZ | FlagV | FlagN,
      TmpResultC >= 0 ? 1 : 0,
      Accumulator == 0 ? 1 : 0,
      0,
      0,
      0,
      ((Accumulator & 128) > 0 ? 1 : 0) ^ ((TmpResultV & 256) != 0 ? 1 : 0)
        ? 1
        : 0,
      Accumulator & 128 ? 128 : 0,
    );
  } else {
    /* Z flag determined from 2's compl result, not BCD result! */
    // int TmpResult = Accumulator - operand - (1 - GETCFLAG);
    // int ZFlag = ((TmpResult & 0xff) == 0);
    // int ohn = operand & 0xf0;
    // int oln = operand & 0xf;
    // int ln = (Accumulator & 0xf) - oln - (1 - GETCFLAG);
    // if (ln & 0x10) {
    // ln -= 6;
    // }
    // int TmpCarry = 0;
    // if (ln & 0x20) {
    // TmpCarry = 0x10;
    // }
    // ln &= 0xf;
    // int hn = (Accumulator & 0xf0) - ohn - TmpCarry;
    // /* N and V flags are determined before high nibble is adjusted.
    //     NOTE: V is not always correct */
    // int NFlag = hn & 128;
    // int TmpResultV = (signed char)Accumulator - (signed char)operand - (1 - GETCFLAG);
    // int VFlag = ((TmpResultV < -128) || (TmpResultV > 127));
    // int CFlag = 1;
    // if (hn & 0x100) {
    // hn -= 0x60;
    // hn &= 0xf0;
    // CFlag = 0;
    // }
    // Accumulator = hn | ln;
    // SetPSR(FlagC | FlagZ | FlagV | FlagN, CFlag, ZFlag, 0, 0, 0, VFlag, NFlag);
  }
} /* SBCInstrHandler */

/**
 * @param address int
 */
function STXInstrHandler(address: number) {
  WritePaged(address, XReg);
}

/**
 * @param address int
 */
function STYInstrHandler(address: number) {
  WritePaged(address, YReg);
}

// ARR instruction hander.
// See http://www.zimmers.net/anonftp/pub/cbm/documents/chipdata/64doc

// INLINE static void ARRInstrHandler(int Operand)
// {
// 	if (GETDFLAG)
// 	{
// 		const int Temp = Accumulator & Operand;
// 		const int HighBits = Temp >> 4;
// 		const int LowBits  = Temp & 0x0f;

// 		Accumulator = (Temp >> 1) | (GETCFLAG << 7); // ROR
// 		SetPSRZN(Accumulator);

// 		PSR &= ~(FlagC | FlagV);

// 		PSR |= (((Accumulator ^ Temp) & 0x40) != 0) << 6; // VFlag

// 		if (LowBits + (LowBits & 1) > 5)
// 		{
// 			Accumulator = (Accumulator & 0xf0) | ((Accumulator + 6) & 0x0f);
// 		}

// 		// Update carry flag
// 		PSR |= (HighBits + (HighBits & 1)) > 5;

// 		if (GETCFLAG)
// 		{
// 			Accumulator = (Accumulator + 0x60) & 0xff;
// 		}
// 	}
// 	else
// 	{
// 		Accumulator &= Operand;
// 		RORInstrHandler_Acc();

// 		const int Bit6 = (Accumulator & 0x40) != 0;
// 		const int Bit5 = (Accumulator & 0x20) != 0;

// 		PSR &= ~(FlagC | FlagV);
// 		PSR |= Bit6; // FlagC
// 		PSR |= (Bit6 ^ Bit5) << 6; // FlagV
// 	}
// }

// KIL (Halt) instruction handler.

// INLINE static void KILInstrHandler() {
// 	// Just repeat the instruction indefinitely.
// 	ProgramCounter--;
// }

/*-------------------------------------------------------------------------*/
/* Absolute  addressing mode handler                                       */
function AbsAddrModeHandler_Data() {
  /* Get the address from after the instruction */
  const FullAddress = GETTWOBYTEFROMPC();

  /* And then read it */
  return ReadPaged(FullAddress);
}

/*-------------------------------------------------------------------------*/
/* Absolute  addressing mode handler                                       */
function AbsAddrModeHandler_Address() {
  /* Get the address from after the instruction */
  const FullAddress = GETTWOBYTEFROMPC();

  /* And then read it */
  return FullAddress;
}

/*-------------------------------------------------------------------------*/
/* Zero page addressing mode handler                                       */
function ZeroPgAddrModeHandler_Address() {
  return ReadPaged(ProgramCounter++);
}

/*-------------------------------------------------------------------------*/
/* Indexed with X preinc addressing mode handler                           */
// INLINE static int IndXAddrModeHandler_Data()
// {
// 	unsigned char ZeroPageAddress = (ReadPaged(ProgramCounter++) + XReg) & 255;
// 	int EffectiveAddress=WholeRam[ZeroPageAddress] | (WholeRam[ZeroPageAddress + 1] << 8);
// 	return ReadPaged(EffectiveAddress);
// }

/*-------------------------------------------------------------------------*/
/* Indexed with X preinc addressing mode handler                           */
function IndXAddrModeHandler_Address() {
  const ZeroPageAddress = (ReadPaged(ProgramCounter++) + XReg) & 0xff;
  const EffectiveAddress =
    BEEBREADMEM_DIRECT(ZeroPageAddress) |
    (BEEBREADMEM_DIRECT(ZeroPageAddress + 1) << 8);
  return EffectiveAddress;
}

/*-------------------------------------------------------------------------*/
/* Indexed with Y postinc addressing mode handler                          */
function IndYAddrModeHandler_Data() {
  const ZPAddr = ReadPaged(ProgramCounter++);
  let EffectiveAddress = BeebReadMem(ZPAddr) + YReg;
  if (EffectiveAddress > 0xff) Carried();
  EffectiveAddress += BeebReadMem(ZPAddr + 1) << 8;

  return ReadPaged(EffectiveAddress);
}

/*-------------------------------------------------------------------------*/
/* Indexed with Y postinc addressing mode handler                          */
function IndYAddrModeHandler_Address() {
  const ZPAddr = ReadPaged(ProgramCounter++);
  let EffectiveAddress = BEEBREADMEM_DIRECT(ZPAddr) + YReg;
  if (EffectiveAddress > 0xff) Carried();
  EffectiveAddress += BEEBREADMEM_DIRECT(ZPAddr + 1) << 8;

  return EffectiveAddress;
}

/*-------------------------------------------------------------------------*/
/* Zero page wih X offset addressing mode handler                          */
// INLINE static int ZeroPgXAddrModeHandler_Data()
// {
// 	int EffectiveAddress = (ReadPaged(ProgramCounter++) + XReg) & 255;
// 	return WholeRam[EffectiveAddress];
// }

/*-------------------------------------------------------------------------*/
/* Zero page wih X offset addressing mode handler                          */
function ZeroPgXAddrModeHandler_Address() {
  const EffectiveAddress = (ReadPaged(ProgramCounter++) + XReg) & 255;
  return EffectiveAddress;
}

/*-------------------------------------------------------------------------*/
/* Absolute with X offset addressing mode handler                          */
function AbsXAddrModeHandler_Data() {
  let EffectiveAddress = GETTWOBYTEFROMPC();
  if ((EffectiveAddress & 0xff00) != ((EffectiveAddress + XReg) & 0xff00))
    Carried();
  EffectiveAddress += XReg;
  EffectiveAddress &= 0xffff;

  return ReadPaged(EffectiveAddress);
}

/*-------------------------------------------------------------------------*/
/* Absolute with X offset addressing mode handler                          */
function AbsXAddrModeHandler_Address() {
  let EffectiveAddress = GETTWOBYTEFROMPC();
  if ((EffectiveAddress & 0xff00) != ((EffectiveAddress + XReg) & 0xff00))
    Carried();
  EffectiveAddress += XReg;
  EffectiveAddress &= 0xffff;

  return EffectiveAddress;
}

/*-------------------------------------------------------------------------*/
/* Absolute with Y offset addressing mode handler                          */
function AbsYAddrModeHandler_Data() {
  let EffectiveAddress = GETTWOBYTEFROMPC();
  if ((EffectiveAddress & 0xff00) != ((EffectiveAddress + YReg) & 0xff00))
    Carried();
  EffectiveAddress += YReg;
  EffectiveAddress &= 0xffff;

  return ReadPaged(EffectiveAddress);
}

/*-------------------------------------------------------------------------*/
/* Absolute with Y offset addressing mode handler                          */
function AbsYAddrModeHandler_Address() {
  let EffectiveAddress = GETTWOBYTEFROMPC();
  if ((EffectiveAddress & 0xff00) != ((EffectiveAddress + YReg) & 0xff00))
    Carried();
  EffectiveAddress += YReg;
  EffectiveAddress &= 0xffff;

  return EffectiveAddress;
}

/*-------------------------------------------------------------------------*/
/* Indirect addressing mode handler                                        */
function IndAddrModeHandler_Address() {
  /* For jump indirect only */
  let EffectiveAddress: number;

  const VectorLocation = GETTWOBYTEFROMPC();

  /* Ok kiddies, deliberate bug time.
  According to my BBC Master Reference Manual Part 2
  the 6502 has a bug concerning this addressing mode and VectorLocation==xxFF
  so, we're going to emulate that bug -- Richard Gellman */
  if ((VectorLocation & 0xff) != 0xff) {
    EffectiveAddress = ReadPaged(VectorLocation);
    EffectiveAddress |= ReadPaged(VectorLocation + 1) << 8;
  } else {
    EffectiveAddress = ReadPaged(VectorLocation);
    EffectiveAddress |= ReadPaged(VectorLocation - 255) << 8;
  }
  return EffectiveAddress;
}

/*-------------------------------------------------------------------------*/
/* Zero page with Y offset addressing mode handler                         */
// INLINE static int ZeroPgYAddrModeHandler_Data()
// {
// 	int EffectiveAddress = (ReadPaged(ProgramCounter++) + YReg) & 255;
// 	return WholeRam[EffectiveAddress];
// }

/*-------------------------------------------------------------------------*/
/* Zero page with Y offset addressing mode handler                         */
// INLINE static int ZeroPgYAddrModeHandler_Address()
// {
//   int EffectiveAddress = (ReadPaged(ProgramCounter++) + YReg) & 255;
//   return EffectiveAddress;
// }

/*-------------------------------------------------------------------------*/

// Initialise 6502core

export function Init6502core() {
  ProgramCounter = BeebReadMem(0xfffc) | (BeebReadMem(0xfffd) << 8);

  // For consistancy of execution
  Accumulator = 0;
  XReg = 0;
  YReg = 0;
  StackReg = 0xff; // Initial value?
  PSR = FlagI; // Interrupts off for starters

  intStatus = 0;
  // NMIStatus = 0;
  NMILock = false;
}

/*-------------------------------------------------------------------------*/
function DoInterrupt() {
  PushWord(ProgramCounter);
  Push(PSR & ~FlagB);
  ProgramCounter = BeebReadMem(0xfffe) | (BeebReadMem(0xffff) << 8);
  SetPSR(FlagI, 0, 0, 1, 0, 0, 0, 0);
  IRQCycles = 7;
} /* DoInterrupt */

/*-------------------------------------------------------------------------*/
// void DoNMI(void) {
//   NMILock = true;
//   PushWord(ProgramCounter);
//   Push(PSR);
//   ProgramCounter=BeebReadMem(0xfffa) | (BeebReadMem(0xfffb)<<8);
//   SetPSR(FlagI,0,0,1,0,0,0,0); /* Normal interrupts should be disabled during NMI ? */
//   IRQCycles=7;
// } /* DoNMI */

/*-------------------------------------------------------------------------*/
/* Execute one 6502 instruction, move program counter on                   */
export function Exec6502Instruction() {
  // static unsigned char OldNMIStatus;
  // int OldPC;
  let iFlagJustCleared = false;
  let iFlagJustSet = false;

  const Count = 1024; //DebugEnabled ? 1 : 1024; // Makes debug window more responsive

  for (let i = 0; i < Count; i++) {
    // 	// Output debug info
    // 	if (DebugEnabled && !DebugDisassembler(ProgramCounter, PrePC, Accumulator, XReg, YReg, PSR, StackReg))
    // 	{
    // 		Sleep(10);  // Ease up on CPU when halted
    // 		continue;
    // 	}

    // 	if (trace)
    // 	{
    // 		Dis6502();
    // 	}

    Branched = false;
    iFlagJustCleared = false;
    iFlagJustSet = false;
    Cycles = 0;
    IOCycles = 0;
    IntDue = false;
    CurrentInstruction = -1;

    const OldPC = ProgramCounter;
    // 	PrePC = ProgramCounter;

    if (CurrentInstruction == -1) {
      // Read an instruction and post inc program counter
      CurrentInstruction = ReadPaged(ProgramCounter++);
    }

    // 	// Advance VIAs to point where mem read happens
    ViaCycles = 0;
    AdvanceCyclesForMemRead();

    // if (165040 < tempInstCount && tempInstCount <= 165050) {
    //   console.log(
    //     tempInstCount,
    //     ProgramCounter.toString(16),
    //     CurrentInstruction.toString(16),
    //   );
    // }

    tempInstCount++;

    switch (CurrentInstruction) {
      case 0x00:
        // BRK
        BRKInstrHandler();
        break;
      // 		case 0x01:
      // 			// ORA (zp,X)
      // 			ORAInstrHandler(IndXAddrModeHandler_Data());
      // 			break;
      // 		case 0x02:
      // 		case 0x22:
      // 		case 0x42:
      // 		case 0x62:
      // 			// Undocumented instruction: KIL
      // 			KILInstrHandler();
      // 			break;
      // 		case 0x03: {
      // 				// Undocumented instruction: SLO (zp,X)
      // 				int Address = IndXAddrModeHandler_Address();
      // 				ASLInstrHandler(Address);
      // 				ORAInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0x04:
      // 			// Undocumented instruction: NOP zp
      // 			ZeroPgAddrModeHandler_Address();
      // 			break;
      case 0x05:
        // ORA zp
        ORAInstrHandler(BeebReadMem(ZeroPgAddrModeHandler_Address()));
        break;
      case 0x06:
        // ASL zp
        ASLInstrHandler(ZeroPgAddrModeHandler_Address());
        break;
      // 		case 0x07: {
      // 				// Undocumented instruction: SLO zp
      // 				int ZeroPageAddress = ZeroPgAddrModeHandler_Address();
      // 				ASLInstrHandler(ZeroPageAddress);
      // 				ORAInstrHandler(WholeRam[ZeroPageAddress]);
      // 			}
      // 			break;
      case 0x08:
        // PHP
        Push(PSR | 48);
        break;
      case 0x09:
        // ORA imm
        ORAInstrHandler(ReadPaged(ProgramCounter++));
        break;
      case 0x0a:
        // ASL A
        ASLInstrHandler_Acc();
        break;
      // 		case 0x0b:
      // 		case 0x2b:
      // 			// Undocumented instruction: ANC imm
      // 			ANDInstrHandler(ReadPaged(ProgramCounter++));
      // 			PSR &= ~FlagC;
      // 			PSR |= ((Accumulator & 128) >> 7);
      // 			break;
      // 		case 0x0c:
      // 			// Undocumented instruction: NOP abs
      // 			AbsAddrModeHandler_Address();
      // 			break;
      case 0x0d:
        // ORA abs
        ORAInstrHandler(AbsAddrModeHandler_Data());
        break;
      case 0x0e:
        // ASL abs
        ASLInstrHandler(AbsAddrModeHandler_Address());
        break;
      // 		case 0x0f: {
      // 				// Undocumented instruction: SLO abs
      // 				int Address = AbsAddrModeHandler_Address();
      // 				ASLInstrHandler(Address);
      // 				ORAInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      case 0x10:
        // BPL rel
        BPLInstrHandler();
        break;
      // 		case 0x11:
      // 			// ORA (zp),Y
      // 			ORAInstrHandler(IndYAddrModeHandler_Data());
      // 			break;
      // 		case 0x12:
      // 			// Undocumented instruction: KIL
      // 			KILInstrHandler();
      // 			break;
      // 		case 0x13: {
      // 				// Undocumented instruction: SLO (zp),Y
      // 				int Address = IndYAddrModeHandler_Address();
      // 				ASLInstrHandler(Address);
      // 				ORAInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0x14:
      // 			// Undocumented instruction: NOP zp,X
      // 			ZeroPgXAddrModeHandler_Address();
      // 			break;
      // 		case 0x15:
      // 			// ORA zp,X
      // 			ORAInstrHandler(ZeroPgXAddrModeHandler_Data());
      // 			break;
      // 		case 0x16:
      // 			// ASL zp,X
      // 			ASLInstrHandler(ZeroPgXAddrModeHandler_Address());
      // 			break;
      // 		case 0x17: {
      // 				// Undocumented instruction: SLO zp,X
      // 				int ZeroPageAddress = ZeroPgXAddrModeHandler_Address();
      // 				ASLInstrHandler(ZeroPageAddress);
      // 				ORAInstrHandler(WholeRam[ZeroPageAddress]);
      // 			}
      // 			break;
      case 0x18:
        // CLC
        PSR &= 255 - FlagC;
        break;
      // 		case 0x19:
      // 			// ORA abs,Y
      // 			ORAInstrHandler(AbsYAddrModeHandler_Data());
      // 			break;
      case 0x1a:
        // Undocumented instruction: NOP
        break;
      // 		case 0x1b: {
      // 				// Undocumented instruction: SLO abs,Y
      // 				int Address = AbsYAddrModeHandler_Address();
      // 				ASLInstrHandler(Address);
      // 				ORAInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0x1c:
      // 			// Undocumented instruction: NOP abs,X
      // 			AbsXAddrModeHandler_Data();
      // 			break;
      case 0x1d:
        // ORA abs,X
        ORAInstrHandler(AbsXAddrModeHandler_Data());
        break;
      case 0x1e:
        // ASL abs,X
        ASLInstrHandler(AbsXAddrModeHandler_Address());
        break;
      // 		case 0x1f: {
      // 				// Undocumented instruction: SLO abs,X
      // 				int Address = AbsXAddrModeHandler_Address();
      // 				ASLInstrHandler(Address);
      // 				ORAInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      case 0x20:
        // JSR abs
        JSRInstrHandler(AbsAddrModeHandler_Address());
        break;
      // 		case 0x21:
      // 			// AND (zp,X)
      // 			ANDInstrHandler(IndXAddrModeHandler_Data());
      // 			break;
      // 		case 0x23: {
      // 				// Undocumented instruction: RLA (zp,X)
      // 				int Address = IndXAddrModeHandler_Address();
      // 				ROLInstrHandler(Address);
      // 				ANDInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      case 0x24:
        // BIT zp
        BITInstrHandler(BEEBREADMEM_DIRECT(ReadPaged(ProgramCounter++)));
        break;
      case 0x25:
        // AND zp
        ANDInstrHandler(BEEBREADMEM_DIRECT(ReadPaged(ProgramCounter++)));
        break;
      case 0x26:
        // ROL zp
        ROLInstrHandler(ZeroPgAddrModeHandler_Address());
        break;
      // 		case 0x27: {
      // 				// Undocumented instruction: RLA zp
      // 				int ZeroPageAddress = ZeroPgAddrModeHandler_Address();
      // 				ROLInstrHandler(ZeroPageAddress);
      // 				ANDInstrHandler(WholeRam[ZeroPageAddress]);
      // 			}
      // 			break;
      case 0x28:
        {
          // PLP
          const oldPSR = PSR;
          PSR = Pop();

          if ((oldPSR ^ PSR) & FlagI) {
            if (PSR & FlagI) {
              iFlagJustSet = true;
            } else {
              iFlagJustCleared = true;
            }
          }
        }
        break;
      case 0x29:
        // AND imm
        ANDInstrHandler(ReadPaged(ProgramCounter++));
        break;
      case 0x2a:
        // ROL A
        ROLInstrHandler_Acc();
        break;
      case 0x2c:
        // BIT abs
        BITInstrHandler(AbsAddrModeHandler_Data());
        break;
      case 0x2d:
        // AND abs
        ANDInstrHandler(AbsAddrModeHandler_Data());
        break;
      case 0x2e:
        // ROL abs
        ROLInstrHandler(AbsAddrModeHandler_Address());
        break;
      // 		case 0x2f: {
      // 				// Undocumented instruction: RLA abs
      // 				int Address = AbsAddrModeHandler_Address();
      // 				ROLInstrHandler(Address);
      // 				ANDInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      case 0x30:
        // BMI rel
        BMIInstrHandler();
        break;
      case 0x31:
        // AND (zp),Y
        ANDInstrHandler(IndYAddrModeHandler_Data());
        break;
      // 		case 0x32:
      // 			// Undocumented instruction: KIL
      // 			KILInstrHandler();
      // 			break;
      // 		case 0x33: {
      // 				// Undocumented instruction: RLA (zp),Y
      // 				int Address = IndYAddrModeHandler_Address();
      // 				ROLInstrHandler(Address);
      // 				ANDInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0x34:
      // 			// Undocumented instruction: NOP zp,X
      // 			ZeroPgXAddrModeHandler_Address();
      // 			break;
      // 		case 0x35:
      // 			// AND zp,X
      // 			ANDInstrHandler(ZeroPgXAddrModeHandler_Data());
      // 			break;
      // 		case 0x36:
      // 			// ROL zp,X
      // 			ROLInstrHandler(ZeroPgXAddrModeHandler_Address());
      // 			break;
      // 		case 0x37: {
      // 				// Undocumented instruction: RLA zp,X
      // 				int ZeroPageAddress = ZeroPgXAddrModeHandler_Address();
      // 				ROLInstrHandler(ZeroPageAddress);
      // 				ANDInstrHandler(WholeRam[ZeroPageAddress]);
      // 			}
      // 			break;
      case 0x38:
        // SEC
        PSR |= FlagC;
        break;
      // 		case 0x39:
      // 			// AND abs,Y
      // 			ANDInstrHandler(AbsYAddrModeHandler_Data());
      // 			break;
      // 		case 0x3a:
      // 			// Undocumented instruction: NOP
      // 			break;
      // 		case 0x3b: {
      // 				// Undocumented instruction: RLA abs.Y
      // 				int Address = AbsYAddrModeHandler_Address();
      // 				ROLInstrHandler(Address);
      // 				ANDInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0x3c:
      // 			// Undocumented instruction: NOP abs,x
      // 			AbsXAddrModeHandler_Data();
      // 			break;
      // 		case 0x3d:
      // 			// AND abs,X
      // 			ANDInstrHandler(AbsXAddrModeHandler_Data());
      // 			break;
      case 0x3e:
        // ROL abs,X
        ROLInstrHandler(AbsXAddrModeHandler_Address());
        break;
      // 		case 0x3f: {
      // 				// Undocumented instruction: RLA abs.X
      // 				int Address = AbsXAddrModeHandler_Address();
      // 				ROLInstrHandler(Address);
      // 				ANDInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      case 0x40:
        // RTI
        PSR = Pop();
        ProgramCounter = PopWord();
        NMILock = false;
        break;
      // 		case 0x41:
      // 			// EOR (zp,X)
      // 			EORInstrHandler(IndXAddrModeHandler_Data());
      // 			break;
      // 		case 0x43: {
      // 				// Undocumented instruction: SRE (zp,X)
      // 				int Address = IndXAddrModeHandler_Address();
      // 				LSRInstrHandler(Address);
      // 				EORInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0x44:
      // 			// NOP zp
      // 			ReadPaged(ZeroPgAddrModeHandler_Address());
      // 			break;
      case 0x45:
        // EOR zp
        EORInstrHandler(BEEBREADMEM_DIRECT(ReadPaged(ProgramCounter++)));
        break;
      case 0x46:
        // LSR zp
        LSRInstrHandler(ZeroPgAddrModeHandler_Address());
        break;
      // 		case 0x47: {
      // 				// Undocumented instruction: SRE zp
      // 				int ZeroPageAddress = ZeroPgAddrModeHandler_Address();
      // 				LSRInstrHandler(ZeroPageAddress);
      // 				EORInstrHandler(WholeRam[ZeroPageAddress]);
      // 			}
      // 			break;
      case 0x48:
        // PHA
        Push(Accumulator);
        break;
      case 0x49:
        // EOR imm
        EORInstrHandler(ReadPaged(ProgramCounter++));
        break;
      case 0x4a:
        // LSR A
        LSRInstrHandler_Acc();
        break;
      // 		case 0x4b:
      // 			// Undocumented instruction: ALR imm
      // 			ANDInstrHandler(ReadPaged(ProgramCounter++));
      // 			LSRInstrHandler_Acc();
      // 			break;
      case 0x4c:
        // JMP abs
        ProgramCounter = AbsAddrModeHandler_Address();
        break;
      case 0x4d:
        // EOR abs
        EORInstrHandler(AbsAddrModeHandler_Data());
        break;
      case 0x4e:
        // LSR abs
        LSRInstrHandler(AbsAddrModeHandler_Address());
        break;
      // 		case 0x4f: {
      // 				// Undocumented instruction: SRE abs
      // 				int Address = AbsAddrModeHandler_Address();
      // 				LSRInstrHandler(Address);
      // 				EORInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      case 0x50:
        // BVC rel
        BVCInstrHandler();
        break;
      case 0x51:
        // EOR (zp),Y
        EORInstrHandler(IndYAddrModeHandler_Data());
        break;
      // 		case 0x52:
      // 			// Undocumented instruction: KIL
      // 			KILInstrHandler();
      // 			break;
      // 		case 0x53: {
      // 				// Undocumented instruction: SRE (zp),Y
      // 				int Address = IndYAddrModeHandler_Address();
      // 				LSRInstrHandler(Address);
      // 				EORInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0x54:
      // 		case 0xd4:
      // 		case 0xf4:
      // 			// Undocumented instruction: NOP zp,X
      // 			ZeroPgXAddrModeHandler_Address();
      // 			break;
      // 		case 0x55:
      // 			// EOR zp,X
      // 			EORInstrHandler(ZeroPgXAddrModeHandler_Data());
      // 			break;
      // 		case 0x56:
      // 			// LSR zp,X
      // 			LSRInstrHandler(ZeroPgXAddrModeHandler_Address());
      // 			break;
      // 		case 0x57: {
      // 				// Undocumented instruction: SRE zp,X
      // 				int ZeroPageAddress = ZeroPgXAddrModeHandler_Address();
      // 				LSRInstrHandler(ZeroPageAddress);
      // 				EORInstrHandler(WholeRam[ZeroPageAddress]);
      // 			}
      // 			break;
      case 0x58:
        // CLI
        if (PSR & FlagI) {
          iFlagJustCleared = true;
        }
        PSR &= 255 - FlagI;
        break;
      case 0x59:
        // EOR abs,Y
        EORInstrHandler(AbsYAddrModeHandler_Data());
        break;
      // 		case 0x5a:

      // 			// Undocumented instruction: NOP
      // 			break;
      // 		case 0x5b: {
      // 				// Undocumented instruction: SRE abs,Y
      // 				int Address = AbsYAddrModeHandler_Address();
      // 				LSRInstrHandler(Address);
      // 				EORInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0x5c:

      // 			// Undocumented instruction: NOP abs,x
      // 			AbsXAddrModeHandler_Data();
      // 			break;
      // 		case 0x5d:
      // 			// EOR abs,X
      // 			EORInstrHandler(AbsXAddrModeHandler_Data());
      // 			break;
      // 		case 0x5e:
      // 			// LSR abs,X
      // 			LSRInstrHandler(AbsXAddrModeHandler_Address());
      // 			break;
      // 		case 0x5f: {
      // 				// Undocumented instruction: SRE abs,X
      // 				int Address = AbsXAddrModeHandler_Address();
      // 				LSRInstrHandler(Address);
      // 				EORInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      case 0x60:
        // RTS
        ProgramCounter = PopWord() + 1;
        break;
      // 		case 0x61:
      // 			// ADC (zp,X)
      // 			ADCInstrHandler(IndXAddrModeHandler_Data());
      // 			break;
      // 		case 0x63: {
      // 				// Undocumented instruction: RRA (zp,X)
      // 				int Address = IndXAddrModeHandler_Address();
      // 				RORInstrHandler(Address);
      // 				ADCInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0x64:
      // 			// Undocumented instruction: NOP zp
      // 			ZeroPgAddrModeHandler_Address();
      // 			break;
      case 0x65:
        // ADC zp
        ADCInstrHandler(BEEBREADMEM_DIRECT(ReadPaged(ProgramCounter++)));
        break;
      case 0x66:
        // ROR zp
        RORInstrHandler(ZeroPgAddrModeHandler_Address());
        break;
      // 		case 0x67: {
      // 				// Undocumented instruction: RRA zp
      // 				int ZeroPageAddress = ZeroPgAddrModeHandler_Address();
      // 				RORInstrHandler(ZeroPageAddress);
      // 				ADCInstrHandler(WholeRam[ZeroPageAddress]);
      // 			}
      // 			break;
      case 0x68:
        // PLA
        Accumulator = Pop();
        SetPSRZN(Accumulator);
        break;
      case 0x69:
        // ADC imm
        ADCInstrHandler(ReadPaged(ProgramCounter++));
        break;
      case 0x6a:
        // ROR A
        RORInstrHandler_Acc();
        break;
      // 		case 0x6b:
      // 			// Undocumented instruction: ARR imm
      // 			ARRInstrHandler(ReadPaged(ProgramCounter++));
      // 			break;
      case 0x6c:
        // JMP (abs)
        ProgramCounter = IndAddrModeHandler_Address();
        break;
      case 0x6d:
        // ADC abs
        ADCInstrHandler(AbsAddrModeHandler_Data());
        break;
      case 0x6e:
        // ROR abs
        RORInstrHandler(AbsAddrModeHandler_Address());
        break;
      // 		case 0x6f: {
      // 				// Undocumented instruction: RRA abs
      // 				int Address = AbsAddrModeHandler_Address();
      // 				RORInstrHandler(Address);
      // 				ADCInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      case 0x70:
        // BVS rel
        BVSInstrHandler();
        break;
      // 		case 0x71:
      // 			// ADC (zp),Y
      // 			ADCInstrHandler(IndYAddrModeHandler_Data());
      // 			break;
      // 		case 0x72:
      // 			// Undocumented instruction: KIL
      // 			KILInstrHandler();
      // 			break;
      // 		case 0x73: {
      // 				// Undocumented instruction: RRA (zp),Y
      // 				int Address = IndYAddrModeHandler_Address();
      // 				RORInstrHandler(Address);
      // 				ADCInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0x74:
      // 			// Undocumented instruction: NOP zp,x
      // 			ZeroPgXAddrModeHandler_Address();
      // 			break;
      // 		case 0x75:
      // 			// ADC zp,X
      // 			ADCInstrHandler(ZeroPgXAddrModeHandler_Data());
      // 			break;
      // 		case 0x76:
      // 			// ROR zp,X
      // 			RORInstrHandler(ZeroPgXAddrModeHandler_Address());
      // 			break;
      // 		case 0x77: {
      // 				// Undocumented instruction: RRA zp,X
      // 				int ZeroPageAddress = ZeroPgXAddrModeHandler_Address();
      // 				RORInstrHandler(ZeroPageAddress);
      // 				ADCInstrHandler(WholeRam[ZeroPageAddress]);
      // 			}
      // 			break;
      case 0x78:
        // SEI
        if (!(PSR & FlagI)) {
          iFlagJustSet = true;
        }
        PSR |= FlagI;
        break;
      case 0x79:
        // ADC abs,Y
        ADCInstrHandler(AbsYAddrModeHandler_Data());
        break;
      // 		case 0x7a:
      // 			// Undocumented instruction: NOP
      // 			break;
      // 		case 0x7b: {
      // 				// Undocumented instruction: RRA abs,Y
      // 				int Address = AbsYAddrModeHandler_Address();
      // 				RORInstrHandler(Address);
      // 				ADCInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0x7c:
      // 			// Undocumented instruction: NOP abs,X
      // 			AbsXAddrModeHandler_Data();
      // 			break;
      case 0x7d:
        // ADC abs,X
        ADCInstrHandler(AbsXAddrModeHandler_Data());
        break;
      case 0x7e:
        // ROR abs,X
        RORInstrHandler(AbsXAddrModeHandler_Address());
        break;
      // 		case 0x7f: {
      // 				// Undocumented instruction: RRA abs,X
      // 				int Address = AbsXAddrModeHandler_Address();
      // 				RORInstrHandler(Address);
      // 				ADCInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0x80:
      // 			// Undocumented instruction: NOP imm
      // 			ReadPaged(ProgramCounter++);
      // 			break;
      case 0x81:
        // STA (zp,X)
        AdvanceCyclesForMemWrite();
        WritePaged(IndXAddrModeHandler_Address(), Accumulator);
        break;
      // 		case 0x82:
      // 		case 0xc2:
      // 		case 0xe2:
      // 			// Undocumented instruction: NOP imm
      // 			ReadPaged(ProgramCounter++);
      // 			break;
      // 		case 0x83:
      // 			// Undocumented instruction: SAX (zp,X)
      // 			AdvanceCyclesForMemWrite();
      // 			WritePaged(IndXAddrModeHandler_Address(), Accumulator & XReg);
      // 			break;
      case 0x84:
        // STY zp
        AdvanceCyclesForMemWrite();
        BEEBWRITEMEM_DIRECT(ZeroPgAddrModeHandler_Address(), YReg);
        break;
      case 0x85:
        // STA zp
        AdvanceCyclesForMemWrite();
        BEEBWRITEMEM_DIRECT(ZeroPgAddrModeHandler_Address(), Accumulator);
        break;
      case 0x86:
        // STX zp
        AdvanceCyclesForMemWrite();
        BEEBWRITEMEM_DIRECT(ZeroPgAddrModeHandler_Address(), XReg);
        break;
      // 		case 0x87:
      // 			// Undocumented instruction: SAX zp
      // 			// This one does not seem to change the processor flags
      // 			AdvanceCyclesForMemWrite();
      // 			WholeRam[ZeroPgAddrModeHandler_Address()] = Accumulator & XReg;
      // 			break;
      case 0x88:
        // DEY
        YReg = (YReg - 1) & 255;
        SetPSRZN(YReg);
        break;
      // 		case 0x89:
      // 			// Undocumented instruction: NOP imm
      // 			ReadPaged(ProgramCounter++);
      // 			break;
      case 0x8a:
        // TXA
        Accumulator = XReg;
        SetPSRZN(Accumulator);
        break;
      // 		case 0x8b:
      // 			// Undocumented instruction: XAA imm
      // 			// See http://visual6502.org/wiki/index.php?title=6502_Opcode_8B_(XAA,_ANE)_explained
      // 			Accumulator &= XReg & ReadPaged(ProgramCounter++);
      // 			SetPSRZN(Accumulator);
      // 			break;
      case 0x8c:
        // STY abs
        AdvanceCyclesForMemWrite();
        STYInstrHandler(AbsAddrModeHandler_Address());
        break;
      case 0x8d:
        // STA abs
        AdvanceCyclesForMemWrite();
        WritePaged(AbsAddrModeHandler_Address(), Accumulator);
        break;
      case 0x8e:
        // STX abs
        AdvanceCyclesForMemWrite();
        STXInstrHandler(AbsAddrModeHandler_Address());
        break;
      // 		case 0x8f:
      // 			// Undocumented instruction: SAX abs
      // 			WritePaged(AbsAddrModeHandler_Address(), Accumulator & XReg);
      // 			break;
      case 0x90:
        // BCC rel
        BCCInstrHandler();
        break;
      case 0x91:
        // STA (zp),Y
        AdvanceCyclesForMemWrite();
        WritePaged(IndYAddrModeHandler_Address(), Accumulator);
        break;
      // 		case 0x92:
      // 			// Undocumented instruction: KIL
      // 			KILInstrHandler();
      // 			break;
      // 		case 0x93: {
      // 				// Undocumented instruction: AHX (zp),Y
      // 				AdvanceCyclesForMemWrite();
      // 				int Address = IndYAddrModeHandler_Address();
      // 				WritePaged(Address, Accumulator & XReg & ((Address >> 8) + 1));
      // 			}
      // 			break;
      // 		case 0x94:
      // 			// STY zp,X
      // 			AdvanceCyclesForMemWrite();
      // 			STYInstrHandler(ZeroPgXAddrModeHandler_Address());
      // 			break;
      case 0x95:
        // STA zp,X
        AdvanceCyclesForMemWrite();
        WritePaged(ZeroPgXAddrModeHandler_Address(), Accumulator);
        break;
      case 0x96:
      // STX zp,X
      // console.log(getInstCount());
      // throw "not impl";
      // AdvanceCyclesForMemWrite();
      // STXInstrHandler(ZeroPgYAddrModeHandler_Address());
      //break;
      // 		case 0x97:
      // 			// Undocumented instruction: SAX zp,Y
      // 			AdvanceCyclesForMemWrite();
      // 			WholeRam[ZeroPgYAddrModeHandler_Address()] = Accumulator & XReg;
      // 			break;
      case 0x98:
        // TYA
        Accumulator = YReg;
        SetPSRZN(Accumulator);
        break;
      case 0x99:
        // STA abs,Y
        AdvanceCyclesForMemWrite();
        WritePaged(AbsYAddrModeHandler_Address(), Accumulator);
        break;
      case 0x9a:
        // TXS
        StackReg = XReg;
        break;
      // 		case 0x9b:
      // 			// Undocumented instruction: TAS abs,Y
      // 			WritePaged(AbsYAddrModeHandler_Address(), Accumulator & XReg);
      // 			break;
      // 		case 0x9c: {
      // 				// Undocumented instruction: SHY abs,X
      // 				int Address = AbsXAddrModeHandler_Address();
      // 				WritePaged(Address, YReg & (unsigned char)((Address >> 8) + 1));
      // 			}
      // 			break;
      case 0x9d:
        // STA abs,X
        AdvanceCyclesForMemWrite();
        WritePaged(AbsXAddrModeHandler_Address(), Accumulator);
        break;
      // 		case 0x9e:
      // 			// Undocumented instruction: SHX abs,Y
      // 			AdvanceCyclesForMemWrite();
      // 			WritePaged(AbsXAddrModeHandler_Address(), Accumulator & XReg);
      // 			break;
      // 		case 0x9f: {
      // 				// Undocumented instruction: AHX abs,Y
      // 				AdvanceCyclesForMemWrite();
      // 				int Address = AbsYAddrModeHandler_Address();
      // 				WritePaged(Address, Accumulator & XReg & ((Address >> 8) + 1));
      // 			}
      // 			break;
      case 0xa0:
        // LDY imm
        LDYInstrHandler(ReadPaged(ProgramCounter++));
        break;
      // 		case 0xa1:
      // 			// LDA (zp,X)
      // 			LDAInstrHandler(IndXAddrModeHandler_Data());
      // 			break;
      case 0xa2:
        // LDX imm
        LDXInstrHandler(ReadPaged(ProgramCounter++));
        break;
      // 		case 0xa3:
      // 			// Undocumented instruction: LAX (zp,X)
      // 			LDAInstrHandler(IndXAddrModeHandler_Data());
      // 			XReg = Accumulator;
      // 			break;
      case 0xa4:
        // LDY zp
        LDYInstrHandler(BEEBREADMEM_DIRECT(ReadPaged(ProgramCounter++)));
        break;
      case 0xa5:
        // LDA zp
        LDAInstrHandler(BEEBREADMEM_DIRECT(ReadPaged(ProgramCounter++)));
        break;
      case 0xa6:
        // LDX zp
        LDXInstrHandler(BEEBREADMEM_DIRECT(ReadPaged(ProgramCounter++)));
        break;
      // 		case 0xa7: {
      // 				// Undocumented instruction: LAX zp
      // 				int ZeroPageAddress = ReadPaged(ProgramCounter++);
      // 				LDAInstrHandler(WholeRam[ZeroPageAddress]);
      // 				XReg = Accumulator;
      // 			}
      // 			break;
      case 0xa8:
        // TAY
        YReg = Accumulator;
        SetPSRZN(Accumulator);
        break;
      case 0xa9:
        // LDA imm
        LDAInstrHandler(ReadPaged(ProgramCounter++));
        break;
      case 0xaa:
        // TXA
        XReg = Accumulator;
        SetPSRZN(Accumulator);
        break;
      // 		case 0xab:
      // 			// Undocumented instruction: LAX imm
      // 			LDAInstrHandler(Accumulator & ReadPaged(ProgramCounter++));
      // 			XReg = Accumulator;
      // 			break;
      case 0xac:
        // LDY abs
        LDYInstrHandler(AbsAddrModeHandler_Data());
        break;
      case 0xad:
        // LDA abs
        LDAInstrHandler(AbsAddrModeHandler_Data());
        break;
      case 0xae:
        // LDX abs
        LDXInstrHandler(AbsAddrModeHandler_Data());
        break;
      // 		case 0xaf:
      // 			// Undocumented instruction: LAX abs
      // 			LDAInstrHandler(AbsAddrModeHandler_Data());
      // 			XReg = Accumulator;
      // 			break;
      case 0xb0:
        // BCS rel
        BCSInstrHandler();
        break;
      case 0xb1:
        // LDA (zp),Y
        LDAInstrHandler(IndYAddrModeHandler_Data());
        break;
      // 		case 0xb2:
      // 			// Undocumented instruction: KIL
      // 			KILInstrHandler();
      // 			break;
      // 		case 0xb3:
      // 			// Undocumented instruction: LAX (zp),Y
      // 			LDAInstrHandler(IndYAddrModeHandler_Data());
      // 			XReg = Accumulator;
      // 			break;
      // 		case 0xb4:
      // 			// LDY zp,X
      // 			LDYInstrHandler(ZeroPgXAddrModeHandler_Data());
      // 			break;
      // 		case 0xb5:
      // 			// LDA zp,X
      // 			LDAInstrHandler(ZeroPgXAddrModeHandler_Data());
      // 			break;
      // 		case 0xb6:
      // 			// LDX zp,Y
      // 			LDXInstrHandler(ZeroPgYAddrModeHandler_Data());
      // 			break;
      // 		case 0xb7:
      // 			// Undocumented instruction: LAX zp,Y
      // 			LDXInstrHandler(ZeroPgYAddrModeHandler_Data());
      // 			Accumulator = XReg;
      // 			break;
      case 0xb8:
        // CLV
        PSR &= 255 - FlagV;
        break;
      case 0xb9:
        // LDA abs,Y
        LDAInstrHandler(AbsYAddrModeHandler_Data());
        break;
      case 0xba:
        XReg = StackReg;
        SetPSRZN(XReg);
        break;
      // 		case 0xbb:
      // 			// Undocumented instruction: LAS abs,Y
      // 			LDAInstrHandler(StackReg & AbsYAddrModeHandler_Data());
      // 			XReg = Accumulator;
      // 			StackReg = Accumulator;
      // 			break;
      case 0xbc:
        // LDY abs,X
        LDYInstrHandler(AbsXAddrModeHandler_Data());
        break;
      case 0xbd:
        LDAInstrHandler(AbsXAddrModeHandler_Data());
        break;
      case 0xbe:
        // LDX abs,Y
        LDXInstrHandler(AbsYAddrModeHandler_Data());
        break;
      // 		case 0xbf:
      // 			// Undocumented instruction: LAX abs,Y
      // 			LDAInstrHandler(AbsYAddrModeHandler_Data());
      // 			XReg = Accumulator;
      // 			break;
      case 0xc0:
        // CPY imm
        CPYInstrHandler(ReadPaged(ProgramCounter++));
        break;
      // 		case 0xc1:
      // 			// CMP (zp,X)
      // 			CMPInstrHandler(IndXAddrModeHandler_Data());
      // 			break;
      // 		case 0xc3: {
      // 				// Undocument instruction: DCP (zp,X)
      // 				int Address = IndXAddrModeHandler_Address();
      // 				DECInstrHandler(Address);
      // 				CMPInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      case 0xc4:
        // CPY zp
        CPYInstrHandler(BEEBREADMEM_DIRECT(ReadPaged(ProgramCounter++)));
        break;
      case 0xc5:
        // CMP zp
        CMPInstrHandler(BEEBREADMEM_DIRECT(ReadPaged(ProgramCounter++)));
        break;
      case 0xc6:
        // DEC zp
        DECInstrHandler(ZeroPgAddrModeHandler_Address());
        break;
      // 		case 0xc7: {
      // 				// Undocumented instruction: DCP zp
      // 				int ZeroPageAddress = ZeroPgAddrModeHandler_Address();
      // 				DECInstrHandler(ZeroPageAddress);
      // 				CMPInstrHandler(WholeRam[ZeroPageAddress]);
      // 			}
      // 			break;
      case 0xc8:
        // INY
        YReg += 1;
        YReg &= 255;
        SetPSRZN(YReg);
        break;
      case 0xc9:
        // CMP imm
        CMPInstrHandler(ReadPaged(ProgramCounter++));
        break;
      case 0xca:
        // DEX
        DEXInstrHandler();
        break;
      // 		case 0xcb: {
      // 				// Undocumented instruction: ASX imm
      // 				//
      // 				// Subtract #n from (A & X) and store result in X
      // 				unsigned char Operand = ReadPaged(ProgramCounter++);
      // 				unsigned char Result = (unsigned char)((Accumulator & XReg) - Operand);
      // 				SetPSRCZN((Accumulator & XReg) >= Operand, Result == 0, Result & 128);
      // 				XReg = Result;
      // 			}
      // 			break;
      case 0xcc:
        // CPY abs
        CPYInstrHandler(AbsAddrModeHandler_Data());
        break;
      case 0xcd:
        // CMP abs
        CMPInstrHandler(AbsAddrModeHandler_Data());
        break;
      case 0xce:
        // DEC abs
        DECInstrHandler(AbsAddrModeHandler_Address());
        break;
      // 		case 0xcf: {
      // 				// Undocumented instruction: DCP abs
      // 				int Address = AbsAddrModeHandler_Address();
      // 				DECInstrHandler(Address);
      // 				CMPInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      case 0xd0:
        // BNE rel
        BNEInstrHandler();
        break;
      case 0xd1:
        // CMP (zp),Y
        CMPInstrHandler(IndYAddrModeHandler_Data());
        break;
      // 		case 0xd2:
      // 			// Undocumented instruction: KIL
      // 			KILInstrHandler();
      // 			break;
      // 		case 0xd3: {
      // 				// Undocumented instruction: DCP (zp),Y
      // 				int Address = IndYAddrModeHandler_Address();
      // 				DECInstrHandler(Address);
      // 				CMPInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0xd5:
      // 			// CMP zp,X
      // 			CMPInstrHandler(ZeroPgXAddrModeHandler_Data());
      // 			break;
      // 		case 0xd6:
      // 			// DEC zp,X
      // 			DECInstrHandler(ZeroPgXAddrModeHandler_Address());
      // 			break;
      // 		case 0xd7: {
      // 				// Undocumented instruction: DCP zp,X
      // 				int ZeroPageAddress = ZeroPgXAddrModeHandler_Address();
      // 				DECInstrHandler(ZeroPageAddress);
      // 				CMPInstrHandler(WholeRam[ZeroPageAddress]);
      // 			}
      // 			break;
      case 0xd8:
        // CLD
        PSR &= 255 - FlagD;
        break;
      case 0xd9:
        // CMP abs,Y
        CMPInstrHandler(AbsYAddrModeHandler_Data());
        break;
      // 		case 0xda:
      // 			// Undocumented instruction: NOP
      // 			break;
      // 		case 0xdb: {
      // 				// Undocumented instruction: DCP abs,Y
      // 				int Address = AbsYAddrModeHandler_Address();
      // 				DECInstrHandler(Address);
      // 				CMPInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0xdc:
      // 		case 0xfc:
      // 			// Undocumented instruction: NOP abs,X
      // 			AbsXAddrModeHandler_Data();
      // 			break;
      case 0xdd:
        // CMP abs,X
        CMPInstrHandler(AbsXAddrModeHandler_Data());
        break;
      case 0xde:
        // DEC abs,X
        DECInstrHandler(AbsXAddrModeHandler_Address());
        break;
      // 		case 0xdf: {
      // 				// Undocumented instruction: DCP abs,X
      // 				int Address = AbsXAddrModeHandler_Address();
      // 				DECInstrHandler(Address);
      // 				CMPInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      case 0xe0:
        // CPX imm
        CPXInstrHandler(ReadPaged(ProgramCounter++));
        break;
      // 		case 0xe1:
      // 			// SBC (zp,X)
      // 			SBCInstrHandler(IndXAddrModeHandler_Data());
      // 			break;
      // 		case 0xe3: {
      // 				// Undocumented instruction: ISC (zp,X)
      // 				int Address = IndXAddrModeHandler_Address();
      // 				INCInstrHandler(Address);
      // 				SBCInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      case 0xe4:
        // CPX zp
        CPXInstrHandler(BeebReadMem(ReadPaged(ProgramCounter++)));
        break;
      case 0xe5:
        // SBC zp
        SBCInstrHandler(BeebReadMem(ReadPaged(ProgramCounter++)));
        break;
      case 0xe6:
        // INC zp
        INCInstrHandler(ZeroPgAddrModeHandler_Address());
        break;
      // 		case 0xe7: {
      // 				// Undocumented instruction: ISC zp
      // 				int ZeroPageAddress = ZeroPgAddrModeHandler_Address();
      // 				INCInstrHandler(ZeroPageAddress);
      // 				SBCInstrHandler(WholeRam[ZeroPageAddress]);
      // 			}
      // 			break;
      case 0xe8:
        // INX
        INXInstrHandler();
        break;
      case 0xe9:
        // SBC imm
        SBCInstrHandler(ReadPaged(ProgramCounter++));
        break;
      // 		case 0xea:
      // 			// NOP
      // 			break;
      // 		case 0xeb:
      // 			// SBC imm
      // 			SBCInstrHandler(ReadPaged(ProgramCounter++));
      // 			break;
      case 0xec:
        // CPX abs
        CPXInstrHandler(AbsAddrModeHandler_Data());
        break;
      case 0xed:
        // SBC abs
        SBCInstrHandler(AbsAddrModeHandler_Data());
        break;
      case 0xee:
        // INC abs
        INCInstrHandler(AbsAddrModeHandler_Address());
        break;
      // 		case 0xef: {
      // 				// Undocumented instruction: ISC abs
      // 				int Address = AbsAddrModeHandler_Address();
      // 				INCInstrHandler(Address);
      // 				SBCInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      case 0xf0:
        // BEQ rel
        BEQInstrHandler();
        break;
      // 		case 0xf1:
      // 			// SBC (zp),Y
      // 			SBCInstrHandler(IndYAddrModeHandler_Data());
      // 			break;
      // 		case 0xf2:
      // 			// Undocumented instruction: KIL
      // 			KILInstrHandler();
      // 			break;
      // 		case 0xf3: {
      // 				// Undocumented instruction: ISC (zp),Y
      // 				int Address = IndYAddrModeHandler_Address();
      // 				INCInstrHandler(Address);
      // 				SBCInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0xf5:
      // 			// SBC zp,X
      // 			SBCInstrHandler(ZeroPgXAddrModeHandler_Data());
      // 			break;
      // 		case 0xf6:
      // 			// INC zp,X
      // 			INCInstrHandler(ZeroPgXAddrModeHandler_Address());
      // 			break;
      // 		case 0xf7: {
      // 				// Undocumented instruction: ISC zp,X
      // 				int ZeroPageAddress = ZeroPgXAddrModeHandler_Address();
      // 				INCInstrHandler(ZeroPageAddress);
      // 				SBCInstrHandler(WholeRam[ZeroPageAddress]);
      // 			}
      // 			break;
      // 		case 0xf8:
      // 			// SED
      // 			PSR |= FlagD;
      // 			break;
      case 0xf9:
        // SBC abs,Y
        SBCInstrHandler(AbsYAddrModeHandler_Data());
        break;
      // 		case 0xfa:
      // 			// Undocumented instruction: NOP
      // 			break;
      // 		case 0xfb: {
      // 				// Undocumented instruction: ISC abs,Y
      // 				int Address = AbsYAddrModeHandler_Address();
      // 				INCInstrHandler(Address);
      // 				SBCInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      case 0xfd:
        // SBC abs,X
        SBCInstrHandler(AbsXAddrModeHandler_Data());
        break;
      case 0xfe:
        // INC abs,X
        INCInstrHandler(AbsXAddrModeHandler_Address());
        break;
      // 		case 0xff: {
      // 			// Undocumented instruction: ISC abs,X
      // 			int Address = AbsXAddrModeHandler_Address();
      // 			INCInstrHandler(Address);
      // 			SBCInstrHandler(ReadPaged(Address));
      // 		}
      // 		break;
      default:
        throw `not impl: ${CurrentInstruction.toString(16)}`;
    }

    // This block corrects the cycle count for the branch instructions
    if (
      CurrentInstruction == 0x10 ||
      CurrentInstruction == 0x30 ||
      CurrentInstruction == 0x50 ||
      CurrentInstruction == 0x70 ||
      CurrentInstruction == 0x90 ||
      CurrentInstruction == 0xb0 ||
      CurrentInstruction == 0xd0 ||
      CurrentInstruction == 0xf0
    ) {
      if (Branched) {
        Cycles++;
        if ((ProgramCounter & 0xff00) != ((OldPC + 2) & 0xff00)) {
          Cycles++;
        }
      }
    }

    Cycles +=
      CyclesTable[CurrentInstruction] -
      CyclesToMemRead[CurrentInstruction] -
      CyclesToMemWrite[CurrentInstruction];

    PollVIAs(Cycles - ViaCycles);
    const sleepTime = PollHardware(Cycles);

    // Check for anything time critical [ ]

    // Check for IRQ
    DoIntCheck();
    if (
      IntDue &&
      (!GETIFLAG() || iFlagJustSet) &&
      CyclesToInt <= -2 - IOCycles &&
      !iFlagJustCleared
    ) {
      // Int noticed 2 cycles before end of instruction - interrupt now
      CyclesToInt = NO_TIMER_INT_DUE;
      DoInterrupt();
      PollHardware(IRQCycles);
      PollVIAs(IRQCycles);
      IRQCycles = 0;
    }

    // Check for NMI
    // if ((NMIStatus && !OldNMIStatus) || (NMIStatus & 1<<nmi_econet))
    // {
    // 	NMIStatus &= ~(1<<nmi_econet);
    // 	DoNMI();
    // 	PollHardware(IRQCycles);
    // 	PollVIAs(IRQCycles);
    // 	IRQCycles=0;
    // }
    // OldNMIStatus=NMIStatus;

    if (sleepTime) return sleepTime;
  }
}

/**
 * @param nCycles unsigned int
 */
function PollHardware(nCycles: number) {
  TotalCycles += nCycles;

  if (TotalCycles > CycleCountWrap) {
    TotalCycles -= CycleCountWrap;
    throw "not impl";
    //     AdjustTrigger(AtoDTrigger);
    //     AdjustTrigger(SoundTrigger);
    //     AdjustTrigger(Disc8271Trigger);
    //     AdjustTrigger(VideoTriggerCount);
    //     AdjustTrigger(TapeTrigger);
  }

  const sleepTime = VideoPoll(nCycles);

  // Check for anything time critical

  //if (!BasicHardwareOnly) {
  AtoD_poll(nCycles);
  SerialPoll();
  //   //}
  Disc8271Poll();
  //   SoundPoll();

  //   if (DisplayCycles > 0) DisplayCycles -= nCycles; // Countdown time till end of display of info.
  return sleepTime;
}

/**
 * @param nCycles unsigned int
 */
function PollVIAs(nCycles: number) {
  if (nCycles != 0) {
    if (CyclesToInt != NO_TIMER_INT_DUE) CyclesToInt -= nCycles;

    SysVIA_poll(nCycles);
    UserVIA_poll(nCycles);

    ViaCycles += nCycles;
  }
}
