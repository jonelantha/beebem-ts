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

import { VideoPoll } from "./video";

// header
export const SetTrigger = (after: number) => TotalCycles + after;
export const IncTrigger = (after: number, trigger: number) => trigger + after;

// main

let CurrentInstruction = -1;

let TotalCycles = 0;
export const getTotalCycles = () => TotalCycles;

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

/*-------------------------------------------------------------------------*/
/* Execute one 6502 instruction, move program counter on                   */
export function Exec6502Instruction() {
  // static unsigned char OldNMIStatus;
  // int OldPC;
  // bool iFlagJustCleared;
  // bool iFlagJustSet;

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

    // 	Branched = false;
    // 	iFlagJustCleared = false;
    // 	iFlagJustSet = false;
    Cycles = 0;
    // 	IOCycles = 0;
    // 	IntDue = false;
    CurrentInstruction = -1;

    // 	OldPC = ProgramCounter;
    // 	PrePC = ProgramCounter;

    if (CurrentInstruction == -1) {
      // Read an instruction and post inc program counter
      CurrentInstruction = 0x1a; //ReadPaged(ProgramCounter++);
    }

    // 	// Advance VIAs to point where mem read happens
    // 	ViaCycles=0;
    // 	AdvanceCyclesForMemRead();

    switch (CurrentInstruction) {
      // 		case 0x00:
      // 			// BRK
      // 			BRKInstrHandler();
      // 			break;
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
      // 		case 0x05:
      // 			// ORA zp
      // 			ORAInstrHandler(WholeRam[ZeroPgAddrModeHandler_Address()]);
      // 			break;
      // 		case 0x06:
      // 			// ASL zp
      // 			ASLInstrHandler(ZeroPgAddrModeHandler_Address());
      // 			break;
      // 		case 0x07: {
      // 				// Undocumented instruction: SLO zp
      // 				int ZeroPageAddress = ZeroPgAddrModeHandler_Address();
      // 				ASLInstrHandler(ZeroPageAddress);
      // 				ORAInstrHandler(WholeRam[ZeroPageAddress]);
      // 			}
      // 			break;
      // 		case 0x08:
      // 			// PHP
      // 			Push(PSR | 48);
      // 			break;
      // 		case 0x09:
      // 			// ORA imm
      // 			ORAInstrHandler(ReadPaged(ProgramCounter++));
      // 			break;
      // 		case 0x0a:
      // 			// ASL A
      // 			ASLInstrHandler_Acc();
      // 			break;
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
      // 		case 0x0d:
      // 			// ORA abs
      // 			ORAInstrHandler(AbsAddrModeHandler_Data());
      // 			break;
      // 		case 0x0e:
      // 			// ASL abs
      // 			ASLInstrHandler(AbsAddrModeHandler_Address());
      // 			break;
      // 		case 0x0f: {
      // 				// Undocumented instruction: SLO abs
      // 				int Address = AbsAddrModeHandler_Address();
      // 				ASLInstrHandler(Address);
      // 				ORAInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0x10:
      // 			// BPL rel
      // 			BPLInstrHandler();
      // 			break;
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
      // 		case 0x18:
      // 			// CLC
      // 			PSR &= 255 - FlagC;
      // 			break;
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
      // 		case 0x1d:
      // 			// ORA abs,X
      // 			ORAInstrHandler(AbsXAddrModeHandler_Data());
      // 			break;
      // 		case 0x1e:
      // 			// ASL abs,X
      // 			ASLInstrHandler(AbsXAddrModeHandler_Address());
      // 			break;
      // 		case 0x1f: {
      // 				// Undocumented instruction: SLO abs,X
      // 				int Address = AbsXAddrModeHandler_Address();
      // 				ASLInstrHandler(Address);
      // 				ORAInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0x20:
      // 			// JSR abs
      // 			JSRInstrHandler(AbsAddrModeHandler_Address());
      // 			break;
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
      // 		case 0x24:
      // 			// BIT zp
      // 			BITInstrHandler(WholeRam[ReadPaged(ProgramCounter++)]);
      // 			break;
      // 		case 0x25:
      // 			// AND zp
      // 			ANDInstrHandler(WholeRam[ReadPaged(ProgramCounter++)]);
      // 			break;
      // 		case 0x26:
      // 			// ROL zp
      // 			ROLInstrHandler(ZeroPgAddrModeHandler_Address());
      // 			break;
      // 		case 0x27: {
      // 				// Undocumented instruction: RLA zp
      // 				int ZeroPageAddress = ZeroPgAddrModeHandler_Address();
      // 				ROLInstrHandler(ZeroPageAddress);
      // 				ANDInstrHandler(WholeRam[ZeroPageAddress]);
      // 			}
      // 			break;
      // 		case 0x28: {
      // 				// PLP
      // 				unsigned char oldPSR = PSR;
      // 				PSR = Pop();

      // 				if ((oldPSR ^ PSR) & FlagI) {
      // 					if (PSR & FlagI) {
      // 						iFlagJustSet = true;
      // 					}
      // 					else {
      // 						iFlagJustCleared = true;
      // 					}
      // 				}
      // 			}
      // 			break;
      // 		case 0x29:
      // 			// AND imm
      // 			ANDInstrHandler(ReadPaged(ProgramCounter++));
      // 			break;
      // 		case 0x2a:
      // 			// ROL A
      // 			ROLInstrHandler_Acc();
      // 			break;
      // 		case 0x2c:
      // 			// BIT abs
      // 			BITInstrHandler(AbsAddrModeHandler_Data());
      // 			break;
      // 		case 0x2d:
      // 			// AND abs
      // 			ANDInstrHandler(AbsAddrModeHandler_Data());
      // 			break;
      // 		case 0x2e:
      // 			// ROL abs
      // 			ROLInstrHandler(AbsAddrModeHandler_Address());
      // 			break;
      // 		case 0x2f: {
      // 				// Undocumented instruction: RLA abs
      // 				int Address = AbsAddrModeHandler_Address();
      // 				ROLInstrHandler(Address);
      // 				ANDInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0x30:
      // 			// BMI rel
      // 			BMIInstrHandler();
      // 			break;
      // 		case 0x31:
      // 			// AND (zp),Y
      // 			ANDInstrHandler(IndYAddrModeHandler_Data());
      // 			break;
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
      // 		case 0x38:
      // 			// SEC
      // 			PSR |= FlagC;
      // 			break;
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
      // 		case 0x3e:
      // 			// ROL abs,X
      // 			ROLInstrHandler(AbsXAddrModeHandler_Address());
      // 			break;
      // 		case 0x3f: {
      // 				// Undocumented instruction: RLA abs.X
      // 				int Address = AbsXAddrModeHandler_Address();
      // 				ROLInstrHandler(Address);
      // 				ANDInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0x40:
      // 			// RTI
      // 			PSR = Pop();
      // 			ProgramCounter = PopWord();
      // 			NMILock = false;
      // 			break;
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
      // 		case 0x45:
      // 			// EOR zp
      // 			EORInstrHandler(WholeRam[ReadPaged(ProgramCounter++)]);
      // 			break;
      // 		case 0x46:
      // 			// LSR zp
      // 			LSRInstrHandler(ZeroPgAddrModeHandler_Address());
      // 			break;
      // 		case 0x47: {
      // 				// Undocumented instruction: SRE zp
      // 				int ZeroPageAddress = ZeroPgAddrModeHandler_Address();
      // 				LSRInstrHandler(ZeroPageAddress);
      // 				EORInstrHandler(WholeRam[ZeroPageAddress]);
      // 			}
      // 			break;
      // 		case 0x48:
      // 			// PHA
      // 			Push(Accumulator);
      // 			break;
      // 		case 0x49:
      // 			// EOR imm
      // 			EORInstrHandler(ReadPaged(ProgramCounter++));
      // 			break;
      // 		case 0x4a:
      // 			// LSR A
      // 			LSRInstrHandler_Acc();
      // 			break;
      // 		case 0x4b:
      // 			// Undocumented instruction: ALR imm
      // 			ANDInstrHandler(ReadPaged(ProgramCounter++));
      // 			LSRInstrHandler_Acc();
      // 			break;
      // 		case 0x4c:
      // 			// JMP abs
      // 			ProgramCounter = AbsAddrModeHandler_Address();
      // 			break;
      // 		case 0x4d:
      // 			// EOR abs
      // 			EORInstrHandler(AbsAddrModeHandler_Data());
      // 			break;
      // 		case 0x4e:
      // 			// LSR abs
      // 			LSRInstrHandler(AbsAddrModeHandler_Address());
      // 			break;
      // 		case 0x4f: {
      // 				// Undocumented instruction: SRE abs
      // 				int Address = AbsAddrModeHandler_Address();
      // 				LSRInstrHandler(Address);
      // 				EORInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0x50:
      // 			// BVC rel
      // 			BVCInstrHandler();
      // 			break;
      // 		case 0x51:
      // 			// EOR (zp),Y
      // 			EORInstrHandler(IndYAddrModeHandler_Data());
      // 			break;
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
      // 		case 0x58:
      // 			// CLI
      // 			if (PSR & FlagI) {
      // 				iFlagJustCleared = true;
      // 			}
      // 			PSR &= 255 - FlagI;
      // 			break;
      // 		case 0x59:
      // 			// EOR abs,Y
      // 			EORInstrHandler(AbsYAddrModeHandler_Data());
      // 			break;
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
      // 		case 0x60:
      // 			// RTS
      // 			ProgramCounter = PopWord() + 1;
      // 			break;
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
      // 		case 0x65:
      // 			// ADC zp
      // 			ADCInstrHandler(WholeRam[ReadPaged(ProgramCounter++)]);
      // 			break;
      // 		case 0x66:
      // 			// ROR zp
      // 			RORInstrHandler(ZeroPgAddrModeHandler_Address());
      // 			break;
      // 		case 0x67: {
      // 				// Undocumented instruction: RRA zp
      // 				int ZeroPageAddress = ZeroPgAddrModeHandler_Address();
      // 				RORInstrHandler(ZeroPageAddress);
      // 				ADCInstrHandler(WholeRam[ZeroPageAddress]);
      // 			}
      // 			break;
      // 		case 0x68:
      // 			// PLA
      // 			Accumulator = Pop();
      // 			SetPSRZN(Accumulator);
      // 			break;
      // 		case 0x69:
      // 			// ADC imm
      // 			ADCInstrHandler(ReadPaged(ProgramCounter++));
      // 			break;
      // 		case 0x6a:
      // 			// ROR A
      // 			RORInstrHandler_Acc();
      // 			break;
      // 		case 0x6b:
      // 			// Undocumented instruction: ARR imm
      // 			ARRInstrHandler(ReadPaged(ProgramCounter++));
      // 			break;
      // 		case 0x6c:
      // 			// JMP (abs)
      // 			ProgramCounter = IndAddrModeHandler_Address();
      // 			break;
      // 		case 0x6d:
      // 			// ADC abs
      // 			ADCInstrHandler(AbsAddrModeHandler_Data());
      // 			break;
      // 		case 0x6e:
      // 			// ROR abs
      // 			RORInstrHandler(AbsAddrModeHandler_Address());
      // 			break;
      // 		case 0x6f: {
      // 				// Undocumented instruction: RRA abs
      // 				int Address = AbsAddrModeHandler_Address();
      // 				RORInstrHandler(Address);
      // 				ADCInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0x70:
      // 			// BVS rel
      // 			BVSInstrHandler();
      // 			break;
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
      // 		case 0x78:
      // 			// SEI
      // 			if (!(PSR & FlagI)) {
      // 				iFlagJustSet = true;
      // 			}
      // 			PSR |= FlagI;
      // 			break;
      // 		case 0x79:
      // 			// ADC abs,Y
      // 			ADCInstrHandler(AbsYAddrModeHandler_Data());
      // 			break;
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
      // 		case 0x7d:
      // 			// ADC abs,X
      // 			ADCInstrHandler(AbsXAddrModeHandler_Data());
      // 			break;
      // 		case 0x7e:
      // 			// ROR abs,X
      // 			RORInstrHandler(AbsXAddrModeHandler_Address());
      // 			break;
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
      // 		case 0x81:
      // 			// STA (zp,X)
      // 			AdvanceCyclesForMemWrite();
      // 			WritePaged(IndXAddrModeHandler_Address(), Accumulator);
      // 			break;
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
      // 		case 0x84:
      // 			// STY zp
      // 			AdvanceCyclesForMemWrite();
      // 			BEEBWRITEMEM_DIRECT(ZeroPgAddrModeHandler_Address(), YReg);
      // 			break;
      // 		case 0x85:
      // 			// STA zp
      // 			AdvanceCyclesForMemWrite();
      // 			BEEBWRITEMEM_DIRECT(ZeroPgAddrModeHandler_Address(), Accumulator);
      // 			break;
      // 		case 0x86:
      // 			// STX zp
      // 			AdvanceCyclesForMemWrite();
      // 			BEEBWRITEMEM_DIRECT(ZeroPgAddrModeHandler_Address(), XReg);
      // 			break;
      // 		case 0x87:
      // 			// Undocumented instruction: SAX zp
      // 			// This one does not seem to change the processor flags
      // 			AdvanceCyclesForMemWrite();
      // 			WholeRam[ZeroPgAddrModeHandler_Address()] = Accumulator & XReg;
      // 			break;
      // 		case 0x88:
      // 			// DEY
      // 			YReg = (YReg - 1) & 255;
      // 			SetPSRZN(YReg);
      // 			break;
      // 		case 0x89:
      // 			// Undocumented instruction: NOP imm
      // 			ReadPaged(ProgramCounter++);
      // 			break;
      // 		case 0x8a:
      // 			// TXA
      // 			Accumulator = XReg;
      // 			SetPSRZN(Accumulator);
      // 			break;
      // 		case 0x8b:
      // 			// Undocumented instruction: XAA imm
      // 			// See http://visual6502.org/wiki/index.php?title=6502_Opcode_8B_(XAA,_ANE)_explained
      // 			Accumulator &= XReg & ReadPaged(ProgramCounter++);
      // 			SetPSRZN(Accumulator);
      // 			break;
      // 		case 0x8c:
      // 			// STY abs
      // 			AdvanceCyclesForMemWrite();
      // 			STYInstrHandler(AbsAddrModeHandler_Address());
      // 			break;
      // 		case 0x8d:
      // 			// STA abs
      // 			AdvanceCyclesForMemWrite();
      // 			WritePaged(AbsAddrModeHandler_Address(), Accumulator);
      // 			break;
      // 		case 0x8e:
      // 			// STX abs
      // 			AdvanceCyclesForMemWrite();
      // 			STXInstrHandler(AbsAddrModeHandler_Address());
      // 			break;
      // 		case 0x8f:
      // 			// Undocumented instruction: SAX abs
      // 			WritePaged(AbsAddrModeHandler_Address(), Accumulator & XReg);
      // 			break;
      // 		case 0x90:
      // 			// BCC rel
      // 			BCCInstrHandler();
      // 			break;
      // 		case 0x91:
      // 			// STA (zp),Y
      // 			AdvanceCyclesForMemWrite();
      // 			WritePaged(IndYAddrModeHandler_Address(), Accumulator);
      // 			break;
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
      // 		case 0x95:
      // 			// STA zp,X
      // 			AdvanceCyclesForMemWrite();
      // 			WritePaged(ZeroPgXAddrModeHandler_Address(), Accumulator);
      // 			break;
      // 		case 0x96:
      // 			// STX zp,X
      // 			AdvanceCyclesForMemWrite();
      // 			STXInstrHandler(ZeroPgYAddrModeHandler_Address());
      // 			break;
      // 		case 0x97:
      // 			// Undocumented instruction: SAX zp,Y
      // 			AdvanceCyclesForMemWrite();
      // 			WholeRam[ZeroPgYAddrModeHandler_Address()] = Accumulator & XReg;
      // 			break;
      // 		case 0x98:
      // 			// TYA
      // 			Accumulator = YReg;
      // 			SetPSRZN(Accumulator);
      // 			break;
      // 		case 0x99:
      // 			// STA abs,Y
      // 			AdvanceCyclesForMemWrite();
      // 			WritePaged(AbsYAddrModeHandler_Address(), Accumulator);
      // 			break;
      // 		case 0x9a:
      // 			// TXS
      // 			StackReg = XReg;
      // 			break;
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
      // 		case 0x9d:
      // 			// STA abs,X
      // 			AdvanceCyclesForMemWrite();
      // 			WritePaged(AbsXAddrModeHandler_Address(), Accumulator);
      // 			break;
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
      // 		case 0xa0:
      // 			// LDY imm
      // 			LDYInstrHandler(ReadPaged(ProgramCounter++));
      // 			break;
      // 		case 0xa1:
      // 			// LDA (zp,X)
      // 			LDAInstrHandler(IndXAddrModeHandler_Data());
      // 			break;
      // 		case 0xa2:
      // 			// LDX imm
      // 			LDXInstrHandler(ReadPaged(ProgramCounter++));
      // 			break;
      // 		case 0xa3:
      // 			// Undocumented instruction: LAX (zp,X)
      // 			LDAInstrHandler(IndXAddrModeHandler_Data());
      // 			XReg = Accumulator;
      // 			break;
      // 		case 0xa4:
      // 			// LDY zp
      // 			LDYInstrHandler(WholeRam[ReadPaged(ProgramCounter++)]);
      // 			break;
      // 		case 0xa5:
      // 			// LDA zp
      // 			LDAInstrHandler(WholeRam[ReadPaged(ProgramCounter++)]);
      // 			break;
      // 		case 0xa6:
      // 			// LDX zp
      // 			LDXInstrHandler(WholeRam[ReadPaged(ProgramCounter++)]);
      // 			break;
      // 		case 0xa7: {
      // 				// Undocumented instruction: LAX zp
      // 				int ZeroPageAddress = ReadPaged(ProgramCounter++);
      // 				LDAInstrHandler(WholeRam[ZeroPageAddress]);
      // 				XReg = Accumulator;
      // 			}
      // 			break;
      // 		case 0xa8:
      // 			// TAY
      // 			YReg = Accumulator;
      // 			SetPSRZN(Accumulator);
      // 			break;
      // 		case 0xa9:
      // 			// LDA imm
      // 			LDAInstrHandler(ReadPaged(ProgramCounter++));
      // 			break;
      // 		case 0xaa:
      // 			// TXA
      // 			XReg = Accumulator;
      // 			SetPSRZN(Accumulator);
      // 			break;
      // 		case 0xab:
      // 			// Undocumented instruction: LAX imm
      // 			LDAInstrHandler(Accumulator & ReadPaged(ProgramCounter++));
      // 			XReg = Accumulator;
      // 			break;
      // 		case 0xac:
      // 			// LDY abs
      // 			LDYInstrHandler(AbsAddrModeHandler_Data());
      // 			break;
      // 		case 0xad:
      // 			// LDA abs
      // 			LDAInstrHandler(AbsAddrModeHandler_Data());
      // 			break;
      // 		case 0xae:
      // 			// LDX abs
      // 			LDXInstrHandler(AbsAddrModeHandler_Data());
      // 			break;
      // 		case 0xaf:
      // 			// Undocumented instruction: LAX abs
      // 			LDAInstrHandler(AbsAddrModeHandler_Data());
      // 			XReg = Accumulator;
      // 			break;
      // 		case 0xb0:
      // 			// BCS rel
      // 			BCSInstrHandler();
      // 			break;
      // 		case 0xb1:
      // 			// LDA (zp),Y
      // 			LDAInstrHandler(IndYAddrModeHandler_Data());
      // 			break;
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
      // 		case 0xb8:
      // 			// CLV
      // 			PSR &= 255 - FlagV;
      // 			break;
      // 		case 0xb9:
      // 			// LDA abs,Y
      // 			LDAInstrHandler(AbsYAddrModeHandler_Data());
      // 			break;
      // 		case 0xba:
      // 			// TSX
      // 			XReg = StackReg;
      // 			SetPSRZN(XReg);
      // 			break;
      // 		case 0xbb:
      // 			// Undocumented instruction: LAS abs,Y
      // 			LDAInstrHandler(StackReg & AbsYAddrModeHandler_Data());
      // 			XReg = Accumulator;
      // 			StackReg = Accumulator;
      // 			break;
      // 		case 0xbc:
      // 			// LDY abs,X
      // 			LDYInstrHandler(AbsXAddrModeHandler_Data());
      // 			break;
      // 		case 0xbd:
      // 			// LDA abs,X
      // 			LDAInstrHandler(AbsXAddrModeHandler_Data());
      // 			break;
      // 		case 0xbe:
      // 			// LDX abs,Y
      // 			LDXInstrHandler(AbsYAddrModeHandler_Data());
      // 			break;
      // 		case 0xbf:
      // 			// Undocumented instruction: LAX abs,Y
      // 			LDAInstrHandler(AbsYAddrModeHandler_Data());
      // 			XReg = Accumulator;
      // 			break;
      // 		case 0xc0:
      // 			// CPY imm
      // 			CPYInstrHandler(ReadPaged(ProgramCounter++));
      // 			break;
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
      // 		case 0xc4:
      // 			// CPY zp
      // 			CPYInstrHandler(WholeRam[ReadPaged(ProgramCounter++)]);
      // 			break;
      // 		case 0xc5:
      // 			// CMP zp
      // 			CMPInstrHandler(WholeRam[ReadPaged(ProgramCounter++)]);
      // 			break;
      // 		case 0xc6:
      // 			// DEC zp
      // 			DECInstrHandler(ZeroPgAddrModeHandler_Address());
      // 			break;
      // 		case 0xc7: {
      // 				// Undocumented instruction: DCP zp
      // 				int ZeroPageAddress = ZeroPgAddrModeHandler_Address();
      // 				DECInstrHandler(ZeroPageAddress);
      // 				CMPInstrHandler(WholeRam[ZeroPageAddress]);
      // 			}
      // 			break;
      // 		case 0xc8:
      // 			// INY
      // 			YReg += 1;
      // 			YReg &= 255;
      // 			SetPSRZN(YReg);
      // 			break;
      // 		case 0xc9:
      // 			// CMP imm
      // 			CMPInstrHandler(ReadPaged(ProgramCounter++));
      // 			break;
      // 		case 0xca:
      // 			// DEX
      // 			DEXInstrHandler();
      // 			break;
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
      // 		case 0xcc:
      // 			// CPY abs
      // 			CPYInstrHandler(AbsAddrModeHandler_Data());
      // 			break;
      // 		case 0xcd:
      // 			// CMP abs
      // 			CMPInstrHandler(AbsAddrModeHandler_Data());
      // 			break;
      // 		case 0xce:
      // 			// DEC abs
      // 			DECInstrHandler(AbsAddrModeHandler_Address());
      // 			break;
      // 		case 0xcf: {
      // 				// Undocumented instruction: DCP abs
      // 				int Address = AbsAddrModeHandler_Address();
      // 				DECInstrHandler(Address);
      // 				CMPInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0xd0:
      // 			// BNE rel
      // 			BNEInstrHandler();
      // 			break;
      // 		case 0xd1:
      // 			// CMP (zp),Y
      // 			CMPInstrHandler(IndYAddrModeHandler_Data());
      // 			break;
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
      // 		case 0xd8:
      // 			// CLD
      // 			PSR &= 255 - FlagD;
      // 			break;
      // 		case 0xd9:
      // 			// CMP abs,Y
      // 			CMPInstrHandler(AbsYAddrModeHandler_Data());
      // 			break;
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
      // 		case 0xdd:
      // 			// CMP abs,X
      // 			CMPInstrHandler(AbsXAddrModeHandler_Data());
      // 			break;
      // 		case 0xde:
      // 			// DEC abs,X
      // 			DECInstrHandler(AbsXAddrModeHandler_Address());
      // 			break;
      // 		case 0xdf: {
      // 				// Undocumented instruction: DCP abs,X
      // 				int Address = AbsXAddrModeHandler_Address();
      // 				DECInstrHandler(Address);
      // 				CMPInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0xe0:
      // 			// CPX imm
      // 			CPXInstrHandler(ReadPaged(ProgramCounter++));
      // 			break;
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
      // 		case 0xe4:
      // 			// CPX zp
      // 			CPXInstrHandler(WholeRam[ReadPaged(ProgramCounter++)]);
      // 			break;
      // 		case 0xe5:
      // 			// SBC zp
      // 			SBCInstrHandler(WholeRam[ReadPaged(ProgramCounter++)]);
      // 			break;
      // 		case 0xe6:
      // 			// INC zp
      // 			INCInstrHandler(ZeroPgAddrModeHandler_Address());
      // 			break;
      // 		case 0xe7: {
      // 				// Undocumented instruction: ISC zp
      // 				int ZeroPageAddress = ZeroPgAddrModeHandler_Address();
      // 				INCInstrHandler(ZeroPageAddress);
      // 				SBCInstrHandler(WholeRam[ZeroPageAddress]);
      // 			}
      // 			break;
      // 		case 0xe8:
      // 			// INX
      // 			INXInstrHandler();
      // 			break;
      // 		case 0xe9:
      // 			// SBC imm
      // 			SBCInstrHandler(ReadPaged(ProgramCounter++));
      // 			break;
      // 		case 0xea:
      // 			// NOP
      // 			break;
      // 		case 0xeb:
      // 			// SBC imm
      // 			SBCInstrHandler(ReadPaged(ProgramCounter++));
      // 			break;
      // 		case 0xec:
      // 			// CPX abs
      // 			CPXInstrHandler(AbsAddrModeHandler_Data());
      // 			break;
      // 		case 0xed:
      // 			// SBC abs
      // 			SBCInstrHandler(AbsAddrModeHandler_Data());
      // 			break;
      // 		case 0xee:
      // 			// INC abs
      // 			INCInstrHandler(AbsAddrModeHandler_Address());
      // 			break;
      // 		case 0xef: {
      // 				// Undocumented instruction: ISC abs
      // 				int Address = AbsAddrModeHandler_Address();
      // 				INCInstrHandler(Address);
      // 				SBCInstrHandler(ReadPaged(Address));
      // 			}
      // 			break;
      // 		case 0xf0:
      // 			// BEQ rel
      // 			BEQInstrHandler();
      // 			break;
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
      // 		case 0xf9:
      // 			// SBC abs,Y
      // 			SBCInstrHandler(AbsYAddrModeHandler_Data());
      // 			break;
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
      // 		case 0xfd:
      // 			// SBC abs,X
      // 			SBCInstrHandler(AbsXAddrModeHandler_Data());
      // 			break;
      // 		case 0xfe:
      // 			// INC abs,X
      // 			INCInstrHandler(AbsXAddrModeHandler_Address());
      // 			break;
      // 		case 0xff: {
      // 			// Undocumented instruction: ISC abs,X
      // 			int Address = AbsXAddrModeHandler_Address();
      // 			INCInstrHandler(Address);
      // 			SBCInstrHandler(ReadPaged(Address));
      // 		}
      // 		break;
    }

    // 	// This block corrects the cycle count for the branch instructions
    // 	if ((CurrentInstruction == 0x10) ||
    // 	    (CurrentInstruction == 0x30) ||
    // 	    (CurrentInstruction == 0x50) ||
    // 	    (CurrentInstruction == 0x70) ||
    // 	    (CurrentInstruction == 0x90) ||
    // 	    (CurrentInstruction == 0xb0) ||
    // 	    (CurrentInstruction == 0xd0) ||
    // 	    (CurrentInstruction == 0xf0))
    // 	{
    // 		if (Branched)
    // 		{
    // 			Cycles++;
    // 			if ((ProgramCounter & 0xff00) != ((OldPC+2) & 0xff00)) {
    // 				Cycles++;
    // 			}
    // 		}
    // 	}

    Cycles +=
      CyclesTable[CurrentInstruction] -
      CyclesToMemRead[CurrentInstruction] -
      CyclesToMemWrite[CurrentInstruction];

    //PollVIAs(Cycles - ViaCycles);
    const sleepTime = PollHardware(Cycles);

    // Check for anything time critical [ ]

    // Check for IRQ
    // DoIntCheck();
    // if (IntDue && (!GETIFLAG || iFlagJustSet) &&
    // 	(CyclesToInt <= (-2-IOCycles) && !iFlagJustCleared))
    // {
    // 	// Int noticed 2 cycles before end of instruction - interrupt now
    // 	CyclesToInt = NO_TIMER_INT_DUE;
    // 	DoInterrupt();
    // 	PollHardware(IRQCycles);
    // 	PollVIAs(IRQCycles);
    // 	IRQCycles=0;
    // }

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

const CycleCountWrap = Number.MAX_SAFE_INTEGER / 2;

/**
 * @param nCycles unsigned int
 */
function PollHardware(nCycles: number) {
  TotalCycles += nCycles;

  if (TotalCycles > CycleCountWrap) {
    TotalCycles -= CycleCountWrap;
    //     AdjustTrigger(AtoDTrigger);
    //     AdjustTrigger(SoundTrigger);
    //     AdjustTrigger(Disc8271Trigger);
    //     AdjustTrigger(VideoTriggerCount);
    //     AdjustTrigger(TapeTrigger);
  }

  const sleepTime = VideoPoll(nCycles);

  // Check for anything time critical

  //if (!BasicHardwareOnly) {
  //   AtoD_poll(nCycles);
  //   SerialPoll();
  //   //}
  //   Disc8271Poll();
  //   SoundPoll();

  //   if (DisplayCycles > 0) DisplayCycles -= nCycles; // Countdown time till end of display of info.
  return sleepTime;
}
