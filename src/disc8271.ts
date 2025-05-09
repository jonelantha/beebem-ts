/****************************************************************
BeebEm - BBC Micro and Master 128 Emulator
Copyright (C) 1994  David Alan Gilbert
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

/* 04/12/1994 David Alan Gilbert: 8271 disc emulation  */
/* 30/08/1997 Mike Wyatt: Added disc write and format support */
/* 27/12/2011 J.G.Harston: Double-sided SSD supported */

// #define DISC_ENABLED true
const DISC_SOUND_ENABLED = true;

import {
  ClearNMIStatus,
  ClearTrigger,
  getTotalCycles,
  nmi_floppy,
  SetNMIStatus,
  SetTrigger,
} from "./6502core";
import { get_m_ShiftBooted, set_m_ShiftBooted } from "./beebwin";
import { fetchDiscImage } from "./fetcher";
import { CycleCountTMax } from "./port";
import {
  SAMPLE_HEAD_LOAD_CYCLES,
  SAMPLE_HEAD_SEEK_CYCLES_PER_TRACK,
  SAMPLE_HEAD_STEP_CYCLES,
} from "./sound";
import { BeebKeyUp } from "./sysvia";

// header

export const Disc8271Poll = () =>
  Disc8271Trigger <= getTotalCycles() && Disc8271_poll_real();

export const AdjustTriggerDisc8271 = (max: number, wrap: number) => {
  if (Disc8271Trigger != max) Disc8271Trigger -= wrap;
};

// main

// #define ENABLE_LOG 0

// 8271 Status register
const STATUS_REG_COMMAND_BUSY = 0x80;
// const STATUS_REG_COMMAND_FULL = 0x40;
// const unsigned char STATUS_REG_PARAMETER_FULL     = 0x20;
const STATUS_REG_RESULT_FULL = 0x10;
const STATUS_REG_INTERRUPT_REQUEST = 0x08;
const STATUS_REG_NON_DMA_MODE = 0x04;

// 8271 Result register
const RESULT_REG_SUCCESS = 0x00;
// const unsigned char RESULT_REG_SCAN_NOT_MET       = 0x00;
// const unsigned char RESULT_REG_SCAN_MET_EQUAL     = 0x02;
// const unsigned char RESULT_REG_SCAN_MET_NOT_EQUAL = 0x04;
// const unsigned char RESULT_REG_CLOCK_ERROR        = 0x08;
// const unsigned char RESULT_REG_LATE_DMA           = 0x0A;
// const unsigned char RESULT_REG_ID_CRC_ERROR       = 0x0C;
// const unsigned char RESULT_REG_DATA_CRC_ERROR     = 0x0E;
const RESULT_REG_DRIVE_NOT_READY = 0x10;
// const unsigned char RESULT_REG_WRITE_PROTECT      = 0x12;
// const unsigned char RESULT_REG_TRACK_0_NOT_FOUND  = 0x14;
// const unsigned char RESULT_REG_WRITE_FAULT        = 0x16;
// const unsigned char RESULT_REG_SECTOR_NOT_FOUND   = 0x18;
const RESULT_REG_DRIVE_NOT_PRESENT = 0x1e; // Undocumented, see http://beebwiki.mdfs.net/OSWORD_%267F
// const unsigned char RESULT_REG_DELETED_DATA_FOUND = 0x20;

// 8271 special registers
const SPECIAL_REG_SCAN_SECTOR_NUMBER = 0x06;
const SPECIAL_REG_SCAN_COUNT_MSB = 0x14;
const SPECIAL_REG_SCAN_COUNT_LSB = 0x13;
const SPECIAL_REG_SURFACE_0_CURRENT_TRACK = 0x12;
const SPECIAL_REG_SURFACE_1_CURRENT_TRACK = 0x1a;
const SPECIAL_REG_MODE_REGISTER = 0x17;
const SPECIAL_REG_DRIVE_CONTROL_OUTPUT_PORT = 0x23;
const SPECIAL_REG_DRIVE_CONTROL_INPUT_PORT = 0x22;
const SPECIAL_REG_SURFACE_0_BAD_TRACK_1 = 0x10;
const SPECIAL_REG_SURFACE_0_BAD_TRACK_2 = 0x11;
const SPECIAL_REG_SURFACE_1_BAD_TRACK_1 = 0x18;
const SPECIAL_REG_SURFACE_1_BAD_TRACK_2 = 0x19;

let Disc8271Trigger = 0; /* int Cycle based time Disc8271Trigger */
let ResultReg = 0;
let StatusReg = 0; // unsigned char
let DataReg: number;
let Internal_Scan_SectorNum = 0;
// static unsigned int Internal_Scan_Count; /* Read as two bytes */
let Internal_ModeReg = 0;
const Internal_CurrentTrack = [0, 0]; /* unsigned char 0/1 for surface number */
let Internal_DriveControlOutputPort = 0; // unsigned char
let Internal_DriveControlInputPort = 0; // unsigned char
const Internal_BadTracks = Array.from({ length: 2 }, () => [0, 0]);
/* 1st subscript is surface 0/1 and second subscript is badtrack 0/1 */

// State set by the Specify (initialisation) command
// See Intel 8271 data sheet, page 15, ADUG page 39-40
// let StepRate = 0; // int In 2ms steps
// let HeadSettlingTime = 0; // int In 2ms steps
// let IndexCountBeforeHeadUnload = 0; // int Number of revolutions (0 to 14), or 15 to keep loaded
// let HeadLoadTime = 0; // int In 8ms steps

const DriveHeadPosition = [0, 0];
let DriveHeadLoaded = false;
let DriveHeadUnloadPending = false;

let ThisCommand: number; // int
let NParamsInThisCommand: number; // int
let PresentParam: number; /* int From 0 */
const Params = Array.from({ length: 16 }, () => 0);
/* Wildly more than we need */

// These bools indicate which drives the last command selected.
// They also act as "drive ready" bits which are reset when the motor stops.
const Selects = [false, false]; /* Drive selects */
const Writeable = [false, false]; /* True if the drives are writeable */

// static bool FirstWriteInt; // Indicates the start of a write operation

let NextInterruptIsErr = 0; // non-zero causes error and drops this value into result reg

const TRACKSPERDRIVE = 80;

// /* Note Head select is done from bit 5 of the drive output register */
const CURRENTHEAD = () => (Internal_DriveControlOutputPort >> 5) & 1;

// /* Note: reads/writes one byte every 80us */
const TIMEBETWEENBYTES = 160;

type IDField_Type = {
  CylinderNum: number; // :7;
  RecordNum: number; // 5;
  HeadNum: number; //1;
  PhysRecLength: number;
};

type SectorType = {
  IDField: IDField_Type;

  Deleted: boolean; // If true the sector is deleted
  Data: Uint8Array;
};

type TrackType = {
  LogicalSectors: number /* Number of sectors stated in format command */;
  NSectors: number /* i.e. the number of records we have - not anything physical */;
  Sectors: SectorType[];
  Gap1Size: number;
  Gap3Size: number;
  Gap5Size: number /* From format command */;
};

/* All data on the disc - first param is drive number, then head. then physical track id */
const DiscStore: TrackType[][][] = Array.from({ length: 2 }, () =>
  Array.from({ length: 2 }, () =>
    Array.from({ length: TRACKSPERDRIVE }, () => ({
      LogicalSectors: 0,
      NSectors: 0,
      Sectors: [],
      Gap1Size: 0,
      Gap3Size: 0,
      Gap5Size: 0,
    })),
  ),
);

/* File names of loaded disc images */
//static char FileNames[2][256];

/* Number of sides of loaded disc images */
const NumHeads = [0, 0];

// // static bool SaveTrackImage(int DriveNum, int HeadNum, int TrackNum);
// // static void DriveHeadScheduleUnload(void);

// typedef void (*CommandFunc)(void);

function UPDATENMISTATUS() {
  if (StatusReg & STATUS_REG_INTERRUPT_REQUEST) {
    SetNMIStatus(1 << nmi_floppy);
  } else {
    ClearNMIStatus(1 << nmi_floppy);
  }
}

/*--------------------------------------------------------------------------*/

type CommandStatusType = {
  TrackAddr: number;
  CurrentSector: number;
  SectorLength: number /* In bytes */;
  SectorsToGo: number;

  CurrentSectorPtr: SectorType | undefined;
  CurrentTrackPtr: TrackType | undefined;

  ByteWithinSector: number /* Next byte in sector or ID field */;
};

let CommandStatus: CommandStatusType = {
  TrackAddr: 0,
  CurrentSector: 0,
  SectorLength: 0 /* In bytes */,
  SectorsToGo: 0,

  CurrentTrackPtr: undefined,
  CurrentSectorPtr: undefined,

  // SectorType *CurrentSectorPtr;
  // TrackType *CurrentTrackPtr;

  ByteWithinSector: 0 /* Next byte in sector or ID field */,
};

/*--------------------------------------------------------------------------*/

type PrimaryCommandLookupType = {
  CommandNum: number; // unsigned char
  Mask: number /* unsigned char Mask command with this before comparing with CommandNum - allows drive ID to be removed */;
  NParams: number /* int Number of parameters to follow */;
  ToCall: () => void /* Called after all paameters have arrived */;
  IntHandler:
    | (() => void)
    | undefined /* Called when interrupt requested by command is about to happen */;
  Ident: string /* Mainly for debugging */;
};

/*--------------------------------------------------------------------------*/
/* For appropriate commands checks the select bits in the command code and  */
/* selects the appropriate drive.                                           */
function DoSelects() {
  Selects[0] = (ThisCommand & 0x40) != 0;
  Selects[1] = (ThisCommand & 0x80) != 0;
  Internal_DriveControlOutputPort &= 0x3f;
  if (Selects[0]) Internal_DriveControlOutputPort |= 0x40;
  if (Selects[1]) Internal_DriveControlOutputPort |= 0x80;
}

/*--------------------------------------------------------------------------*/
function NotImp(NotImpCom: string) {
  throw `Disc operation ${NotImpCom} not supported`;
}

/*--------------------------------------------------------------------------*/
/* Load the head - ignore for the moment                                    */
function DoLoadHead() {}

/*--------------------------------------------------------------------------*/
/* Initialise our disc structures                                           */
function InitDiscStore() {
  for (let drive = 0; drive < 2; drive++)
    for (let head = 0; head < 2; head++)
      for (let track = 0; track < TRACKSPERDRIVE; track++)
        DiscStore[drive][head][track] = {
          LogicalSectors: 0,
          NSectors: 0,
          Sectors: [],
          Gap1Size: 0,
          Gap3Size: 0,
          Gap5Size: 0,
        };
}

/*--------------------------------------------------------------------------*/
/* Given a logical track number accounts for bad tracks                     */
function SkipBadTracks(Unit: number, trackin: number) {
  let offset = 0;

  if (Internal_BadTracks[Unit][0] <= trackin) offset++;
  if (Internal_BadTracks[Unit][1] <= trackin) offset++;

  return trackin + offset;
}

/*--------------------------------------------------------------------------*/

function GetSelectedDrive() {
  if (Selects[0]) {
    return 0;
  }

  if (Selects[1]) {
    return 1;
  }

  return -1;
}

/*--------------------------------------------------------------------------*/
/* Returns a pointer to the data structure for a particular track.  You     */
/* pass the logical track number, it takes into account bad tracks and the  */
/* drive select and head select etc.  It always returns a valid ptr - if    */
/* there aren't that many tracks then it uses the last one.                 */
/* The one exception!!!! is that if no drives are selected it returns NULL  */
function GetTrackPtr(LogicalTrackID: number): TrackType | undefined {
  const Drive = GetSelectedDrive();

  if (Drive < 0) {
    return undefined;
  }

  LogicalTrackID = SkipBadTracks(Drive, LogicalTrackID);

  if (LogicalTrackID >= TRACKSPERDRIVE) LogicalTrackID = TRACKSPERDRIVE - 1;

  return DiscStore[Drive][CURRENTHEAD()][LogicalTrackID];
}

/*--------------------------------------------------------------------------*/
/* Returns a pointer to the data structure for a particular sector. Returns */
/* NULL for Sector not found. Doesn't check cylinder/head ID                */
function GetSectorPtr(
  Track: TrackType,
  LogicalSectorID: number,
  FindDeleted: boolean,
) {
  if (Track.Sectors.length === 0) return undefined;

  for (let CurrentSector = 0; CurrentSector < Track.NSectors; CurrentSector++)
    if (
      Track.Sectors[CurrentSector].IDField.RecordNum == LogicalSectorID &&
      (!Track.Sectors[CurrentSector].Deleted || !FindDeleted)
    )
      return Track.Sectors[CurrentSector];

  return undefined;
}

/*--------------------------------------------------------------------------*/

// Cause an error - pass err num

function DoErr(ErrNum: number) {
  Disc8271Trigger = SetTrigger(50); // Give it a bit of time
  NextInterruptIsErr = ErrNum;
  StatusReg = STATUS_REG_COMMAND_BUSY; // Command is busy - come back when I have an interrupt
  UPDATENMISTATUS();
}

/*--------------------------------------------------------------------------*/

// Checks a few things in the sector - returns true if OK

function ValidateSector(Sector: SectorType, Track: number, SecLength: number) {
  if (Sector.IDField.CylinderNum != Track) {
    return false;
  }

  if (Sector.IDField.PhysRecLength != SecLength) {
    return false;
  }

  return true;
}

/*--------------------------------------------------------------------------*/
// static void DoVarLength_ScanDataCommand(void) {
//   DoSelects();
//   NotImp("DoVarLength_ScanDataCommand");
// }

/*--------------------------------------------------------------------------*/
// static void DoVarLength_ScanDataAndDeldCommand(void) {
//   DoSelects();
//   NotImp("DoVarLength_ScanDataAndDeldCommand");
// }

/*--------------------------------------------------------------------------*/
// static void Do128ByteSR_WriteDataCommand(void) {
//   DoSelects();
//   NotImp("Do128ByteSR_WriteDataCommand");
// }

/*--------------------------------------------------------------------------*/
// static void DoVarLength_WriteDataCommand(void) {
//   DoSelects();
//   DoLoadHead();

//   const int Drive = GetSelectedDrive();

//   if (Drive < 0) {
//     DoErr(RESULT_REG_DRIVE_NOT_READY);
//     return;
//   }

//   if (!Writeable[Drive]) {
//     DoErr(RESULT_REG_WRITE_PROTECT);
//     return;
//   }

//   Internal_CurrentTrack[Drive]=Params[0];
//   CommandStatus.CurrentTrackPtr=GetTrackPtr(Params[0]);
//   if (CommandStatus.CurrentTrackPtr==NULL) {
//     DoErr(RESULT_REG_DRIVE_NOT_READY);
//     return;
//   }

//   CommandStatus.CurrentSectorPtr = GetSectorPtr(CommandStatus.CurrentTrackPtr, Params[1], false);
//   if (CommandStatus.CurrentSectorPtr==NULL) {
//     DoErr(RESULT_REG_DRIVE_NOT_PRESENT); // Sector not found
//     return;
//   }

//   CommandStatus.TrackAddr=Params[0];
//   CommandStatus.CurrentSector=Params[1];
//   CommandStatus.SectorsToGo=Params[2] & 31;
//   CommandStatus.SectorLength=1<<(7+((Params[2] >> 5) & 7));

//   if (ValidateSector(CommandStatus.CurrentSectorPtr,CommandStatus.TrackAddr,CommandStatus.SectorLength)) {
//     CommandStatus.ByteWithinSector=0;
//     SetTrigger(TIMEBETWEENBYTES,Disc8271Trigger);
//     StatusReg = STATUS_REG_COMMAND_BUSY;
//     UPDATENMISTATUS();
//     CommandStatus.ByteWithinSector=0;
//     FirstWriteInt = true;
//   } else {
//     DoErr(RESULT_REG_DRIVE_NOT_PRESENT); // Sector not found
//   }
// }

/*--------------------------------------------------------------------------*/
// static void WriteInterrupt(void) {
//   bool LastByte = false;

//   if (CommandStatus.SectorsToGo < 0) {
//     StatusReg = STATUS_REG_RESULT_FULL | STATUS_REG_INTERRUPT_REQUEST;
//     UPDATENMISTATUS();
//     return;
//   }

//   if (!FirstWriteInt)
//     CommandStatus.CurrentSectorPtr->Data[CommandStatus.ByteWithinSector++]=DataReg;
//   else
//     FirstWriteInt = false;

//   ResultReg=0;
//   if (CommandStatus.ByteWithinSector>=CommandStatus.SectorLength) {
//     CommandStatus.ByteWithinSector=0;
//     if (--CommandStatus.SectorsToGo) {
//       CommandStatus.CurrentSector++;
//       CommandStatus.CurrentSectorPtr = GetSectorPtr(CommandStatus.CurrentTrackPtr,
//                                                     CommandStatus.CurrentSector,
//                                                     false);
//       if (CommandStatus.CurrentSectorPtr==NULL) {
//         DoErr(RESULT_REG_DRIVE_NOT_PRESENT); // Sector not found
//         return;
//       }
//     } else {
//       /* Last sector done, write the track back to disc */
//       if (SaveTrackImage(Selects[0] ? 0 : 1, CURRENTHEAD, CommandStatus.TrackAddr)) {
//         StatusReg = STATUS_REG_RESULT_FULL;
//         UPDATENMISTATUS();
//         LastByte = true;
//         CommandStatus.SectorsToGo=-1; /* To let us bail out */
//         SetTrigger(0,Disc8271Trigger); /* To pick up result */
//       }
//       else {
//         DoErr(RESULT_REG_WRITE_PROTECT);
//       }
//     }
//   }

//   if (!LastByte) {
//     StatusReg = STATUS_REG_COMMAND_BUSY |
//                 STATUS_REG_INTERRUPT_REQUEST |
//                 STATUS_REG_NON_DMA_MODE;
//     UPDATENMISTATUS();
//     SetTrigger(TIMEBETWEENBYTES,Disc8271Trigger);
//   }
// }

/*--------------------------------------------------------------------------*/
// static void Do128ByteSR_WriteDeletedDataCommand(void) {
//   DoSelects();
//   NotImp("Do128ByteSR_WriteDeletedDataCommand");
// }

/*--------------------------------------------------------------------------*/
// static void DoVarLength_WriteDeletedDataCommand(void) {
//   DoSelects();
//   NotImp("DoVarLength_WriteDeletedDataCommand");
// }

/*--------------------------------------------------------------------------*/
// static void Do128ByteSR_ReadDataCommand(void) {
//   DoSelects();
//   NotImp("Do128ByteSR_ReadDataCommand");
// }

/*--------------------------------------------------------------------------*/
function DoVarLength_ReadDataCommand() {
  DoSelects();
  DoLoadHead();

  const Drive = GetSelectedDrive();

  if (Drive < 0) {
    DoErr(RESULT_REG_DRIVE_NOT_READY);
    return;
  }

  // Reset shift state if it was set by Run Disc
  if (get_m_ShiftBooted()) {
    set_m_ShiftBooted(false);
    BeebKeyUp(0, 0);
  }

  Internal_CurrentTrack[Drive] = Params[0];
  CommandStatus.CurrentTrackPtr = GetTrackPtr(Params[0]);
  if (CommandStatus.CurrentTrackPtr === undefined) {
    DoErr(RESULT_REG_DRIVE_NOT_READY);
    return;
  }

  CommandStatus.CurrentSectorPtr = GetSectorPtr(
    CommandStatus.CurrentTrackPtr,
    Params[1],
    false,
  );
  if (CommandStatus.CurrentSectorPtr === undefined) {
    DoErr(RESULT_REG_DRIVE_NOT_PRESENT);
    return;
  }

  CommandStatus.TrackAddr = Params[0];
  CommandStatus.CurrentSector = Params[1];
  CommandStatus.SectorsToGo = Params[2] & 31;
  CommandStatus.SectorLength = 1 << (7 + ((Params[2] >> 5) & 7));

  if (
    ValidateSector(
      CommandStatus.CurrentSectorPtr,
      CommandStatus.TrackAddr,
      CommandStatus.SectorLength,
    )
  ) {
    CommandStatus.ByteWithinSector = 0;
    Disc8271Trigger = SetTrigger(TIMEBETWEENBYTES);
    StatusReg = STATUS_REG_COMMAND_BUSY;
    UPDATENMISTATUS();
  } else {
    DoErr(RESULT_REG_DRIVE_NOT_PRESENT);
  }
}

/*--------------------------------------------------------------------------*/
function ReadInterrupt() {
  let LastByte = false;

  if (CommandStatus.SectorsToGo < 0) {
    StatusReg = STATUS_REG_RESULT_FULL | STATUS_REG_INTERRUPT_REQUEST;
    UPDATENMISTATUS();
    return;
  }

  DataReg =
    CommandStatus.CurrentSectorPtr!.Data[CommandStatus.ByteWithinSector++];

  // #if ENABLE_LOG
  // WriteLog("ReadInterrupt called - DataReg=0x%02X ByteWithinSector=%d\n", DataReg, CommandStatus.ByteWithinSector);
  // #endif

  ResultReg = 0;
  if (CommandStatus.ByteWithinSector >= CommandStatus.SectorLength) {
    CommandStatus.ByteWithinSector = 0;

    /* I don't know if this can cause the thing to step - I presume not for the moment */
    if (--CommandStatus.SectorsToGo) {
      CommandStatus.CurrentSector++;
      CommandStatus.CurrentSectorPtr = GetSectorPtr(
        CommandStatus.CurrentTrackPtr!,
        CommandStatus.CurrentSector,
        false,
      );
      if (CommandStatus.CurrentSectorPtr === undefined) {
        DoErr(RESULT_REG_DRIVE_NOT_PRESENT); // Sector not found
        return;
      }
    } else {
      /* Last sector done */
      StatusReg =
        STATUS_REG_COMMAND_BUSY |
        STATUS_REG_RESULT_FULL |
        STATUS_REG_INTERRUPT_REQUEST |
        STATUS_REG_NON_DMA_MODE;
      UPDATENMISTATUS();
      LastByte = true;
      CommandStatus.SectorsToGo = -1; /* To let us bail out */
      Disc8271Trigger = SetTrigger(TIMEBETWEENBYTES); /* To pick up result */
    }
  }

  if (!LastByte) {
    StatusReg =
      STATUS_REG_COMMAND_BUSY |
      STATUS_REG_INTERRUPT_REQUEST |
      STATUS_REG_NON_DMA_MODE;
    UPDATENMISTATUS();
    Disc8271Trigger = SetTrigger(TIMEBETWEENBYTES);
  }
}

/*--------------------------------------------------------------------------*/
function Do128ByteSR_ReadDataAndDeldCommand() {
  DoSelects();
  NotImp("Do128ByteSR_ReadDataAndDeldCommand");
}

/*--------------------------------------------------------------------------*/
// function DoVarLength_ReadDataAndDeldCommand() {
//   /* Use normal read command for now - deleted data not supported */
//   DoVarLength_ReadDataCommand();
// }

/*--------------------------------------------------------------------------*/
// static void DoReadIDCommand(void) {
//   DoSelects();
//   DoLoadHead();

//   const int Drive = GetSelectedDrive();

//   if (Drive < 0) {
//     DoErr(RESULT_REG_DRIVE_NOT_READY);
//     return;
//   }

//   Internal_CurrentTrack[Drive]=Params[0];
//   CommandStatus.CurrentTrackPtr=GetTrackPtr(Params[0]);
//   if (CommandStatus.CurrentTrackPtr==NULL) {
//     DoErr(RESULT_REG_DRIVE_NOT_READY);
//     return;
//   }

//   CommandStatus.CurrentSectorPtr = GetSectorPtr(CommandStatus.CurrentTrackPtr, 0, false);
//   if (CommandStatus.CurrentSectorPtr==NULL) {
//     DoErr(RESULT_REG_DRIVE_NOT_PRESENT); // Sector not found
//     return;
//   }

//   CommandStatus.TrackAddr=Params[0];
//   CommandStatus.CurrentSector=0;
//   CommandStatus.SectorsToGo=Params[2];

//   CommandStatus.ByteWithinSector=0;
//   SetTrigger(TIMEBETWEENBYTES,Disc8271Trigger);
//   StatusReg = STATUS_REG_COMMAND_BUSY;
//   UPDATENMISTATUS();
// }

/*--------------------------------------------------------------------------*/
// static void ReadIDInterrupt(void) {
//   bool LastByte = false;

//   if (CommandStatus.SectorsToGo<0) {
//     StatusReg = STATUS_REG_RESULT_FULL | STATUS_REG_INTERRUPT_REQUEST;
//     UPDATENMISTATUS();
//     return;
//   }

//   if (CommandStatus.ByteWithinSector==0)
//     DataReg=CommandStatus.CurrentSectorPtr->IDField.CylinderNum;
//   else if (CommandStatus.ByteWithinSector==1)
//     DataReg=CommandStatus.CurrentSectorPtr->IDField.HeadNum;
//   else if (CommandStatus.ByteWithinSector==2)
//     DataReg=CommandStatus.CurrentSectorPtr->IDField.RecordNum;
//   else
//     DataReg=1; /* 1=256 byte sector length */

//   CommandStatus.ByteWithinSector++;

//   ResultReg=0;
//   if (CommandStatus.ByteWithinSector>=4) {
//     CommandStatus.ByteWithinSector=0;
//     if (--CommandStatus.SectorsToGo) {
//       CommandStatus.CurrentSector++;
//       CommandStatus.CurrentSectorPtr = GetSectorPtr(CommandStatus.CurrentTrackPtr,
//                                                     CommandStatus.CurrentSector,
//                                                     false);
//       if (CommandStatus.CurrentSectorPtr==NULL) {
//         DoErr(RESULT_REG_DRIVE_NOT_PRESENT); // Sector not found
//         return;
//       }
//     } else {
//       /* Last sector done */
//       StatusReg = STATUS_REG_COMMAND_BUSY |
//                   STATUS_REG_INTERRUPT_REQUEST |
//                   STATUS_REG_NON_DMA_MODE;
//       UPDATENMISTATUS();
//       LastByte = true;
//       CommandStatus.SectorsToGo=-1; /* To let us bail out */
//       SetTrigger(TIMEBETWEENBYTES,Disc8271Trigger); /* To pick up result */
//     }
//   }

//   if (!LastByte) {
//     StatusReg = STATUS_REG_COMMAND_BUSY |
//                 STATUS_REG_INTERRUPT_REQUEST |
//                 STATUS_REG_NON_DMA_MODE;
//     UPDATENMISTATUS();
//     SetTrigger(TIMEBETWEENBYTES,Disc8271Trigger);
//   }
// }

/*--------------------------------------------------------------------------*/
// static void Do128ByteSR_VerifyDataAndDeldCommand(void) {
//   DoSelects();
//   NotImp("Do128ByteSR_VerifyDataAndDeldCommand");
// }

/*--------------------------------------------------------------------------*/
// static void DoVarLength_VerifyDataAndDeldCommand(void) {
//   DoSelects();

//   const int Drive = GetSelectedDrive();

//   if (Drive < 0) {
//     DoErr(RESULT_REG_DRIVE_NOT_READY);
//     return;
//   }

//   Internal_CurrentTrack[Drive]=Params[0];
//   CommandStatus.CurrentTrackPtr=GetTrackPtr(Params[0]);
//   if (CommandStatus.CurrentTrackPtr==NULL) {
//     DoErr(RESULT_REG_DRIVE_NOT_READY);
//     return;
//   }

//   CommandStatus.CurrentSectorPtr = GetSectorPtr(CommandStatus.CurrentTrackPtr, Params[1], false);
//   if (CommandStatus.CurrentSectorPtr==NULL) {
//     DoErr(RESULT_REG_DRIVE_NOT_PRESENT); // Sector not found
//     return;
//   }

//   StatusReg = STATUS_REG_COMMAND_BUSY;
//   UPDATENMISTATUS();
//   SetTrigger(100,Disc8271Trigger); /* A short delay to causing an interrupt */
// }

/*--------------------------------------------------------------------------*/
// static void VerifyInterrupt(void) {
//   StatusReg = STATUS_REG_RESULT_FULL | STATUS_REG_INTERRUPT_REQUEST;
//   UPDATENMISTATUS();
//   ResultReg = RESULT_REG_SUCCESS; // All OK
// }

/*--------------------------------------------------------------------------*/

// static void DoFormatCommand(void) {
//   DoSelects();

//   DoLoadHead();

//   const int Drive = GetSelectedDrive();

//   if (Drive < 0) {
//     DoErr(RESULT_REG_DRIVE_NOT_READY);
//     return;
//   }

//   if (!Writeable[Drive]) {
//     DoErr(RESULT_REG_WRITE_PROTECT);
//     return;
//   }

//   Internal_CurrentTrack[Drive]=Params[0];
//   CommandStatus.CurrentTrackPtr=GetTrackPtr(Params[0]);
//   if (CommandStatus.CurrentTrackPtr==NULL) {
//     DoErr(RESULT_REG_DRIVE_NOT_READY);
//     return;
//   }

//   CommandStatus.CurrentSectorPtr = GetSectorPtr(CommandStatus.CurrentTrackPtr, 0, false);
//   if (CommandStatus.CurrentSectorPtr==NULL) {
//     DoErr(RESULT_REG_DRIVE_NOT_PRESENT); // Sector not found
//     return;
//   }

//   CommandStatus.TrackAddr=Params[0];
//   CommandStatus.CurrentSector=0;
//   CommandStatus.SectorsToGo=Params[2] & 31;
//   CommandStatus.SectorLength=1<<(7+((Params[2] >> 5) & 7));

//   if (CommandStatus.SectorsToGo==10 && CommandStatus.SectorLength==256) {
//     CommandStatus.ByteWithinSector=0;
//     SetTrigger(TIMEBETWEENBYTES,Disc8271Trigger);
//     StatusReg = STATUS_REG_COMMAND_BUSY;
//     UPDATENMISTATUS();
//     FirstWriteInt = true;
//   } else {
//     DoErr(RESULT_REG_DRIVE_NOT_PRESENT); // Sector not found
//   }
// }

/*--------------------------------------------------------------------------*/
// static void FormatInterrupt(void) {
//   bool LastByte = false;

//   if (CommandStatus.SectorsToGo<0) {
//     StatusReg = STATUS_REG_RESULT_FULL | STATUS_REG_INTERRUPT_REQUEST;
//     UPDATENMISTATUS();
//     return;
//   }

//   if (!FirstWriteInt) {
//     /* Ignore the ID data for now - just count the bytes */
//     CommandStatus.ByteWithinSector++;
//   }
//   else
//     FirstWriteInt = false;

//   ResultReg=0;
//   if (CommandStatus.ByteWithinSector>=4) {
//     /* Fill sector with 0xe5 chars */
//     for (int i = 0; i < 256; ++i) {
//       CommandStatus.CurrentSectorPtr->Data[i]=(unsigned char)0xe5;
//     }

//     CommandStatus.ByteWithinSector=0;
//     if (--CommandStatus.SectorsToGo) {
//       CommandStatus.CurrentSector++;
//       CommandStatus.CurrentSectorPtr = GetSectorPtr(CommandStatus.CurrentTrackPtr,
//                                                     CommandStatus.CurrentSector,
//                                                     false);
//       if (CommandStatus.CurrentSectorPtr==NULL) {
//         DoErr(RESULT_REG_DRIVE_NOT_PRESENT); // Sector not found
//         return;
//       }
//     } else {
//       /* Last sector done, write the track back to disc */
//       if (SaveTrackImage(Selects[0] ? 0 : 1, CURRENTHEAD, CommandStatus.TrackAddr)) {
//         StatusReg = STATUS_REG_RESULT_FULL;
//         UPDATENMISTATUS();
//         LastByte = true;
//         CommandStatus.SectorsToGo=-1; /* To let us bail out */
//         SetTrigger(0,Disc8271Trigger); /* To pick up result */
//       }
//       else {
//         DoErr(RESULT_REG_WRITE_PROTECT);
//       }
//     }
//   }

//   if (!LastByte) {
//     StatusReg = STATUS_REG_COMMAND_BUSY |
//                 STATUS_REG_INTERRUPT_REQUEST |
//                 STATUS_REG_NON_DMA_MODE;
//     UPDATENMISTATUS();
//     SetTrigger(TIMEBETWEENBYTES * 256,Disc8271Trigger);
//   }
// }

/*--------------------------------------------------------------------------*/

function SeekInterrupt() {
  StatusReg = STATUS_REG_RESULT_FULL | STATUS_REG_INTERRUPT_REQUEST;
  UPDATENMISTATUS();
  ResultReg = RESULT_REG_SUCCESS; // All OK
}

/*--------------------------------------------------------------------------*/
function DoSeekCommand() {
  DoSelects();

  DoLoadHead();

  const Drive = GetSelectedDrive();

  if (Drive < 0) {
    DoErr(RESULT_REG_DRIVE_NOT_READY);
    return;
  }

  Internal_CurrentTrack[Drive] = Params[0];

  StatusReg = STATUS_REG_COMMAND_BUSY;
  UPDATENMISTATUS();
  Disc8271Trigger = SetTrigger(100); /* A short delay to causing an interrupt */
}

/*--------------------------------------------------------------------------*/
function DoReadDriveStatusCommand() {
  let Track0 = false;
  let WriteProt = false;

  if (ThisCommand & 0x40) {
    Track0 = Internal_CurrentTrack[0] == 0;
    WriteProt = !Writeable[0];
  }

  if (ThisCommand & 0x80) {
    Track0 = Internal_CurrentTrack[1] == 0;
    WriteProt = !Writeable[1];
  }

  ResultReg =
    0x80 |
    (Selects[1] ? 0x40 : 0) |
    (Selects[0] ? 0x4 : 0) |
    (Track0 ? 2 : 0) |
    (WriteProt ? 8 : 0);
  StatusReg |= STATUS_REG_RESULT_FULL;
  UPDATENMISTATUS();
}

/*--------------------------------------------------------------------------*/

// See Intel 8271 data sheet, page 15, ADUG page 39-40

function DoSpecifyCommand() {
  switch (Params[0]) {
    case 0x0d: // Initialisation
      // StepRate = Params[1];
      // HeadSettlingTime = Params[2];
      // IndexCountBeforeHeadUnload = (Params[3] & 0xf0) >> 4;
      // HeadLoadTime = Params[3] & 0x0f;
      break;
    case 0x10: // Load bad tracks, surface 0
      Internal_BadTracks[0][0] = Params[1];
      Internal_BadTracks[0][1] = Params[2];
      Internal_CurrentTrack[0] = Params[3];
      break;
    case 0x18: // Load bad tracks, surface 1
      Internal_BadTracks[1][0] = Params[1];
      Internal_BadTracks[1][1] = Params[2];
      Internal_CurrentTrack[1] = Params[3];
      break;
  }
}

/*--------------------------------------------------------------------------*/
function DoWriteSpecialCommand() {
  DoSelects();

  switch (Params[0]) {
    case SPECIAL_REG_SCAN_SECTOR_NUMBER:
      throw "not impl";
      //Internal_Scan_SectorNum = Params[1];
      break;

    case SPECIAL_REG_SCAN_COUNT_MSB:
      throw "not impl";
      // Internal_Scan_Count &= 0xff;
      // Internal_Scan_Count |= Params[1] << 8;
      break;

    case SPECIAL_REG_SCAN_COUNT_LSB:
      throw "not impl";
      // Internal_Scan_Count &= 0xff00;
      // Internal_Scan_Count |= Params[1];
      break;

    case SPECIAL_REG_SURFACE_0_CURRENT_TRACK:
      throw "not impl";
      //Internal_CurrentTrack[0] = Params[1];
      break;

    case SPECIAL_REG_SURFACE_1_CURRENT_TRACK:
      throw "not impl";
      //Internal_CurrentTrack[1] = Params[1];
      break;

    case SPECIAL_REG_MODE_REGISTER:
      Internal_ModeReg = Params[1];
      break;

    case SPECIAL_REG_DRIVE_CONTROL_OUTPUT_PORT:
      Internal_DriveControlOutputPort = Params[1];
      Selects[0] = (Params[1] & 0x40) != 0;
      Selects[1] = (Params[1] & 0x80) != 0;
      break;

    case SPECIAL_REG_DRIVE_CONTROL_INPUT_PORT:
      throw "not impl";
      //Internal_DriveControlInputPort = Params[1];
      break;

    case SPECIAL_REG_SURFACE_0_BAD_TRACK_1:
      throw "not impl";
      //Internal_BadTracks[0][0] = Params[1];
      break;

    case SPECIAL_REG_SURFACE_0_BAD_TRACK_2:
      throw "not impl";
      //Internal_BadTracks[0][1] = Params[1];
      break;

    case SPECIAL_REG_SURFACE_1_BAD_TRACK_1:
      throw "not impl";
      //Internal_BadTracks[1][0] = Params[1];
      break;

    case SPECIAL_REG_SURFACE_1_BAD_TRACK_2:
      throw "not impl";
      //Internal_BadTracks[1][1] = Params[1];
      break;

    default:
      throw "not impl";
      // #if ENABLE_LOG
      // WriteLog("Write to bad special register\n");
      // #endif
      break;
  }
}

/*--------------------------------------------------------------------------*/
function DoReadSpecialCommand() {
  DoSelects();

  switch (Params[0]) {
    case SPECIAL_REG_SCAN_SECTOR_NUMBER:
      ResultReg = Internal_Scan_SectorNum;
      break;

    case SPECIAL_REG_SCAN_COUNT_MSB:
      throw "not impl";
      //ResultReg = (Internal_Scan_Count >> 8) & 0xff;
      break;

    case SPECIAL_REG_SCAN_COUNT_LSB:
      throw "not impl";
      //ResultReg = Internal_Scan_Count & 0xff;
      break;

    case SPECIAL_REG_SURFACE_0_CURRENT_TRACK:
      ResultReg = Internal_CurrentTrack[0];
      break;

    case SPECIAL_REG_SURFACE_1_CURRENT_TRACK:
      ResultReg = Internal_CurrentTrack[1];
      break;

    case SPECIAL_REG_MODE_REGISTER:
      ResultReg = Internal_ModeReg;
      break;

    case SPECIAL_REG_DRIVE_CONTROL_OUTPUT_PORT:
      ResultReg = Internal_DriveControlOutputPort;
      break;

    case SPECIAL_REG_DRIVE_CONTROL_INPUT_PORT:
      ResultReg = Internal_DriveControlInputPort;
      break;

    case SPECIAL_REG_SURFACE_0_BAD_TRACK_1:
      ResultReg = Internal_BadTracks[0][0];
      break;

    case SPECIAL_REG_SURFACE_0_BAD_TRACK_2:
      ResultReg = Internal_BadTracks[0][1];
      break;

    case SPECIAL_REG_SURFACE_1_BAD_TRACK_1:
      ResultReg = Internal_BadTracks[1][0];
      break;

    case SPECIAL_REG_SURFACE_1_BAD_TRACK_2:
      ResultReg = Internal_BadTracks[1][1];
      break;

    default:
      // #if ENABLE_LOG
      // WriteLog("Read of bad special register\n");
      // #endif
      return;
  }

  StatusReg |= STATUS_REG_RESULT_FULL;
  UPDATENMISTATUS();
}

/*--------------------------------------------------------------------------*/
// static void DoBadCommand(void) {
// }

/*--------------------------------------------------------------------------*/
/* The following table is used to parse commands from the command number written into
the command register - it can't distinguish between subcommands selected from the
first parameter */
const PrimaryCommandLookup: PrimaryCommandLookupType[] = [
  // {0x00, 0x3f, 3, DoVarLength_ScanDataCommand, NULL,  "Scan Data (Variable Length/Multi-Record)"},
  // {0x04, 0x3f, 3, DoVarLength_ScanDataAndDeldCommand, NULL,  "Scan Data & deleted data (Variable Length/Multi-Record)"},
  // {0x0a, 0x3f, 2, Do128ByteSR_WriteDataCommand, NULL, "Write Data (128 byte/single record)"},
  // {0x0b, 0x3f, 3, DoVarLength_WriteDataCommand, WriteInterrupt, "Write Data (Variable Length/Multi-Record)"},
  // {0x0e, 0x3f, 2, Do128ByteSR_WriteDeletedDataCommand, NULL, "Write Deleted Data (128 byte/single record)"},
  // {0x0f, 0x3f, 3, DoVarLength_WriteDeletedDataCommand, NULL, "Write Deleted Data (Variable Length/Multi-Record)"},
  // {0x12, 0x3f, 2, Do128ByteSR_ReadDataCommand, NULL, "Read Data (128 byte/single record)"},
  {
    CommandNum: 0x13,
    Mask: 0x3f,
    NParams: 3,
    ToCall: DoVarLength_ReadDataCommand,
    IntHandler: ReadInterrupt,
    Ident: "Read Data (Variable Length/Multi-Record)",
  },
  {
    CommandNum: 0x16,
    Mask: 0x3f,
    NParams: 2,
    ToCall: Do128ByteSR_ReadDataAndDeldCommand,
    IntHandler: undefined,
    Ident: "Read Data & deleted data (128 byte/single record)",
  },
  // {0x17, 0x3f, 3, DoVarLength_ReadDataAndDeldCommand, ReadInterrupt, "Read Data & deleted data (Variable Length/Multi-Record)"},
  // {0x1b, 0x3f, 3, DoReadIDCommand, ReadIDInterrupt, "ReadID" },
  // {0x1e, 0x3f, 2, Do128ByteSR_VerifyDataAndDeldCommand, NULL, "Verify Data and Deleted Data (128 byte/single record)"},
  // {0x1f, 0x3f, 3, DoVarLength_VerifyDataAndDeldCommand, VerifyInterrupt, "Verify Data and Deleted Data (Variable Length/Multi-Record)"},
  // {0x23, 0x3f, 5, DoFormatCommand, FormatInterrupt, "Format"},
  {
    CommandNum: 0x29,
    Mask: 0x3f,
    NParams: 1,
    ToCall: DoSeekCommand,
    IntHandler: SeekInterrupt,
    Ident: "Seek",
  },
  {
    CommandNum: 0x2c,
    Mask: 0x3f,
    NParams: 0,
    ToCall: DoReadDriveStatusCommand,
    IntHandler: undefined,
    Ident: "Read drive status",
  },
  {
    CommandNum: 0x35,
    Mask: 0xff,
    NParams: 4,
    ToCall: DoSpecifyCommand,
    IntHandler: undefined,
    Ident: "Specify",
  },
  {
    CommandNum: 0x3a,
    Mask: 0x3f,
    NParams: 2,
    ToCall: DoWriteSpecialCommand,
    IntHandler: undefined,
    Ident: "Write special registers",
  },
  {
    CommandNum: 0x3d,
    Mask: 0x3f,
    NParams: 1,
    ToCall: DoReadSpecialCommand,
    IntHandler: undefined,
    Ident: "Read special registers",
  },
  // {0,    0,    0, DoBadCommand, NULL, "Unknown command"} /* Terminator due to 0 mask matching all */
];

/*--------------------------------------------------------------------------*/
/* returns a pointer to the data structure for the given command            */
/* If no matching command is given, the pointer points to an entry with a 0 */
/* mask, with a sensible function to call.                                  */
function CommandPtrFromNumber(CommandNumber: number): PrimaryCommandLookupType {
  for (const PrimaryCommand of PrimaryCommandLookup) {
    if (PrimaryCommand.CommandNum === (PrimaryCommand.Mask & CommandNumber)) {
      return PrimaryCommand;
    }
  }
  throw `not supported ${CommandNumber.toString(16)}`;
}

/*--------------------------------------------------------------------------*/

// Address is in the range 0-7 - with the fe80 etc stripped out

/**
 * @param Address int
 * @returns
 */
export function Disc8271Read(Address: number) {
  let Value = 0;

  //   if (!DISC_ENABLED)
  //     return 0xFF;

  switch (Address) {
    case 0:
      //   #if ENABLE_LOG
      //   WriteLog("8271 Status register read (0x%0X)\n", StatusReg);
      //   #endif
      Value = StatusReg;
      break;

    case 1:
      //   #if ENABLE_LOG
      //   WriteLog("8271 Result register read (0x%02X)\n", ResultReg);
      //   #endif

      // Clear interrupt request and result reg full flag
      StatusReg &= ~(STATUS_REG_RESULT_FULL | STATUS_REG_INTERRUPT_REQUEST);
      UPDATENMISTATUS();
      Value = ResultReg;
      ResultReg = RESULT_REG_SUCCESS; // Register goes to 0 after its read
      break;

    case 4:
      //   #if ENABLE_LOG
      //   WriteLog("8271 data register read\n");
      //   #endif

      // Clear interrupt and non-dma request - not stated but DFS never looks at result reg!
      StatusReg &= ~(STATUS_REG_INTERRUPT_REQUEST | STATUS_REG_NON_DMA_MODE);
      UPDATENMISTATUS();
      Value = DataReg;
      break;

    default:
      //   #if ENABLE_LOG
      console.log(
        `8271: Read to unknown register address=${Address.toString(16)}`,
      );
      //   #endif
      break;
  }

  return Value;
}

/*--------------------------------------------------------------------------*/
/**
 * @param Value int
 */
function CommandRegWrite(Value: number) {
  const ptr = CommandPtrFromNumber(Value);

  // #if ENABLE_LOG
  // WriteLog("8271: Command register write value=0x%02X (Name=%s)\n", Value, ptr->Ident);
  // #endif

  ThisCommand = Value;
  NParamsInThisCommand = ptr.NParams;
  PresentParam = 0;

  StatusReg |= STATUS_REG_COMMAND_BUSY | STATUS_REG_RESULT_FULL; // Observed on beeb for read special
  UPDATENMISTATUS();

  // No parameters then call routine immediately
  if (NParamsInThisCommand == 0) {
    StatusReg &= 0x7e;
    UPDATENMISTATUS();
    ptr.ToCall();
  }
}

/*--------------------------------------------------------------------------*/

/**
 * @param Value unsigned char
 */
function ParamRegWrite(Value: number) {
  // Parameter wanted ?
  if (PresentParam >= NParamsInThisCommand) {
    // #if ENABLE_LOG
    // WriteLog("8271: Unwanted parameter register write value=0x%02X\n", Value);
    // #endif
  } else {
    Params[PresentParam++] = Value;

    StatusReg &= 0xfe; /* Observed on beeb */
    UPDATENMISTATUS();

    // Got all params yet?
    if (PresentParam >= NParamsInThisCommand) {
      StatusReg &= 0x7e; /* Observed on beeb */
      UPDATENMISTATUS();

      const ptr = CommandPtrFromNumber(ThisCommand);

      // #if ENABLE_LOG
      // WriteLog("<Disc access> 8271: All parameters arrived for '%s':", ptr->Ident);

      // for (int i = 0; i < PresentParam; i++) {
      //   WriteLog(" %02X", Params[i]);
      // }

      // WriteLog("\n");
      // #endif

      ptr.ToCall();
    }
  }
}

/*--------------------------------------------------------------------------*/

// Address is in the range 0-7 - with the fe80 etc stripped out

/**
 * @param Address int
 * @param Value unsigned char
 */
export function Disc8271Write(Address: number, Value: number) {
  // if (!DISC_ENABLED)
  //   return;

  // Clear a pending head unload
  if (DriveHeadUnloadPending) {
    DriveHeadUnloadPending = false;
    Disc8271Trigger = ClearTrigger();
  }

  switch (Address) {
    case 0:
      CommandRegWrite(Value);
      break;

    case 1:
      ParamRegWrite(Value);
      break;

    case 2:
      // DebugTrace("8271: Reset register write, value=0x%02X\n", Value);

      // The caller should write a 1 and then >11 cycles later a 0 - but I'm just going
      // to reset on both edges
      Disc8271Reset();
      break;

    case 4:
      throw "not impl";
      // DebugTrace("8271: Data register write, value=0x%02X\n", Value);

      // StatusReg &= ~(STATUS_REG_INTERRUPT_REQUEST | STATUS_REG_NON_DMA_MODE);
      // UPDATENMISTATUS();
      // DataReg = Value;
      break;

    default:
      throw "not impl";
      // DebugTrace("8271: Write to unknown register address=%04X, value=%02X\n", Address, Value);
      break;
  }

  DriveHeadScheduleUnload();
}

/*--------------------------------------------------------------------------*/
function DriveHeadScheduleUnload() {
  // Schedule head unload when nothing else is pending.
  // This is mainly for the sound effects, but it also marks the drives as
  // not ready when the motor stops.
  if (DriveHeadLoaded && Disc8271Trigger == CycleCountTMax) {
    Disc8271Trigger = SetTrigger(4000000); // 2s delay to unload
    DriveHeadUnloadPending = true;
  }
}

/*--------------------------------------------------------------------------*/
function DriveHeadMotorUpdate() {
  // This is mainly for the sound effects, but it also marks the drives as
  // not ready when the motor stops.
  let Drive = 0;
  let Tracks = 0;

  if (DriveHeadUnloadPending) {
    // Mark drives as not ready
    Selects[0] = false;
    Selects[1] = false;
    DriveHeadUnloadPending = false;
    if (DriveHeadLoaded && DISC_SOUND_ENABLED) {
      // 	PlaySoundSample(SAMPLE_HEAD_UNLOAD, false);
    }
    DriveHeadLoaded = false;
    // StopSoundSample(SAMPLE_DRIVE_MOTOR);
    // StopSoundSample(SAMPLE_HEAD_SEEK);

    // LEDs.Disc0 = false;
    // LEDs.Disc1 = false;
    return true;
  }

  if (!DISC_SOUND_ENABLED) {
    DriveHeadLoaded = true;
    return false;
  }

  if (!DriveHeadLoaded) {
    // if (Selects[0]) LEDs.Disc0 = true;
    // if (Selects[1]) LEDs.Disc1 = true;

    //PlaySoundSample(SAMPLE_DRIVE_MOTOR, true);
    DriveHeadLoaded = true;
    //PlaySoundSample(SAMPLE_HEAD_LOAD, false);
    Disc8271Trigger = SetTrigger(SAMPLE_HEAD_LOAD_CYCLES);
    return true;
  }

  if (Selects[0]) Drive = 0;
  if (Selects[1]) Drive = 1;

  // StopSoundSample(SAMPLE_HEAD_SEEK);

  if (DriveHeadPosition[Drive] != Internal_CurrentTrack[Drive]) {
    Tracks = Math.abs(DriveHeadPosition[Drive] - Internal_CurrentTrack[Drive]);
    if (Tracks > 1) {
      //PlaySoundSample(SAMPLE_HEAD_SEEK, true);
      Disc8271Trigger = SetTrigger(Tracks * SAMPLE_HEAD_SEEK_CYCLES_PER_TRACK);
    } else {
      //PlaySoundSample(SAMPLE_HEAD_STEP, false);
      Disc8271Trigger = SetTrigger(SAMPLE_HEAD_STEP_CYCLES);
    }
    if (DriveHeadPosition[Drive] < Internal_CurrentTrack[Drive])
      DriveHeadPosition[Drive] += Tracks;
    else DriveHeadPosition[Drive] -= Tracks;

    return true;
  }
  return false;
}

/*--------------------------------------------------------------------------*/

function Disc8271_poll_real() {
  Disc8271Trigger = ClearTrigger();

  if (DriveHeadMotorUpdate()) return;

  // Set the interrupt flag in the status register
  StatusReg |= STATUS_REG_INTERRUPT_REQUEST;
  UPDATENMISTATUS();

  if (NextInterruptIsErr != 0) {
    ResultReg = NextInterruptIsErr;
    StatusReg = STATUS_REG_RESULT_FULL | STATUS_REG_INTERRUPT_REQUEST;
    UPDATENMISTATUS();
    NextInterruptIsErr = 0;
  } else {
    /* Should only happen while a command is still active */
    const comptr = CommandPtrFromNumber(ThisCommand);
    if (comptr.IntHandler) comptr.IntHandler();
  }

  DriveHeadScheduleUnload();
}

/*--------------------------------------------------------------------------*/

export function FreeDiscImage(DriveNum: number) {
  for (let Track = 0; Track < TRACKSPERDRIVE; Track++) {
    for (let Head = 0; Head < 2; Head++) {
      DiscStore[DriveNum][Head][Track].Sectors = [];
    }
  }
}

/*--------------------------------------------------------------------------*/
export async function LoadSimpleDiscImage(
  FileName: string,
  DriveNum: number,
  HeadNum: number,
  Tracks: number,
) {
  const buffer = await fetchDiscImage(FileName);

  // mainWin->SetImageName(FileName, DriveNum, DiscType::SSD);
  // JGH, 26-Dec-2011
  NumHeads[DriveNum] = 1; // 1 = TRACKSPERDRIVE SSD image
  // 2 = 2 * TRACKSPERDRIVE DSD image
  let Heads = 1;

  if (buffer.byteLength > 0x40000) {
    Heads = 2; // Long sequential image continues onto side 1
    NumHeads[DriveNum] = 0; // 0 = 2 * TRACKSPERDRIVE SSD image
  }

  // JGH
  // strcpy(FileNames[DriveNum], FileName);
  FreeDiscImage(DriveNum);
  let sectorNum = 0;
  for (let Head = HeadNum; Head < Heads; Head++) {
    for (let CurrentTrack = 0; CurrentTrack < Tracks; CurrentTrack++) {
      DiscStore[DriveNum][Head][CurrentTrack].LogicalSectors = 10;
      DiscStore[DriveNum][Head][CurrentTrack].NSectors = 10;
      DiscStore[DriveNum][Head][CurrentTrack].Sectors = [];
      DiscStore[DriveNum][Head][CurrentTrack].Gap1Size =
        0; /* Don't bother for the mo */
      DiscStore[DriveNum][Head][CurrentTrack].Gap3Size = 0;
      DiscStore[DriveNum][Head][CurrentTrack].Gap5Size = 0;
      for (let CurrentSector = 0; CurrentSector < 10; CurrentSector++) {
        const startPtr = 256 * sectorNum;
        if (startPtr < buffer.byteLength) {
          const SecPtr: SectorType = {
            IDField: {
              CylinderNum: CurrentTrack,
              RecordNum: CurrentSector,
              HeadNum: HeadNum,
              PhysRecLength: 256,
            },
            Deleted: false,
            Data: new Uint8Array(buffer, startPtr, 256),
          };
          DiscStore[DriveNum][Head][CurrentTrack].Sectors.push(SecPtr);
          sectorNum++;
        }
      }
    }
  }
}

/*--------------------------------------------------------------------------*/
// void LoadSimpleDSDiscImage(const char *FileName, int DriveNum, int Tracks) {
//   FILE *infile=fopen(FileName,"rb");

//   if (!infile) {
//     mainWin->Report(MessageType::Error,
//                     "Could not open disc file:\n  %s", FileName);

//     return;
//   }

//   mainWin->SetImageName(FileName, DriveNum, DiscType::DSD);

//   strcpy(FileNames[DriveNum], FileName);
//   NumHeads[DriveNum] = 2;		/* 2 = 2*TRACKSPERDRIVE DSD image */

//   FreeDiscImage(DriveNum);

//   for (int CurrentTrack = 0; CurrentTrack < Tracks; CurrentTrack++) {
//     for (int HeadNum = 0; HeadNum < 2; HeadNum++) {
//       DiscStore[DriveNum][HeadNum][CurrentTrack].LogicalSectors=10;
//       DiscStore[DriveNum][HeadNum][CurrentTrack].NSectors=10;
//       SectorType *SecPtr = DiscStore[DriveNum][HeadNum][CurrentTrack].Sectors = (SectorType *)calloc(10,sizeof(SectorType));
//       DiscStore[DriveNum][HeadNum][CurrentTrack].Gap1Size=0; /* Don't bother for the mo */
//       DiscStore[DriveNum][HeadNum][CurrentTrack].Gap3Size=0;
//       DiscStore[DriveNum][HeadNum][CurrentTrack].Gap5Size=0;

//       for (int CurrentSector = 0; CurrentSector < 10; CurrentSector++) {
//         SecPtr[CurrentSector].IDField.CylinderNum=CurrentTrack;
//         SecPtr[CurrentSector].IDField.RecordNum=CurrentSector;
//         SecPtr[CurrentSector].IDField.HeadNum=HeadNum;
//         SecPtr[CurrentSector].IDField.PhysRecLength=256;
//         SecPtr[CurrentSector].Deleted = false;
//         SecPtr[CurrentSector].Data=(unsigned char *)calloc(1,256);
//         fread(SecPtr[CurrentSector].Data,1,256,infile);
//       }
//     }
//   }

//   fclose(infile);
// }

/*--------------------------------------------------------------------------*/
// void Eject8271DiscImage(int DriveNum) {
//   strcpy(FileNames[DriveNum], "");
//   FreeDiscImage(DriveNum);
// }

/*--------------------------------------------------------------------------*/

// static bool SaveTrackImage(int DriveNum, int HeadNum, int TrackNum) {
//   bool Success = true;

//   FILE *outfile=fopen(FileNames[DriveNum],"r+b");

//   if (!outfile) {
//     mainWin->Report(MessageType::Error,
//                     "Could not open disc file for write:\n  %s", FileNames[DriveNum]);

//     return false;
//   }

//   long FileOffset;

//   if(NumHeads[DriveNum]) {
//     FileOffset = (NumHeads[DriveNum] * TrackNum + HeadNum) * 2560; /* 1=SSD, 2=DSD */
//   }
//   else {
//     FileOffset = (TrackNum + HeadNum * TRACKSPERDRIVE) * 2560; /* 0=2-sided SSD */
//   }

//   /* Get the file length to check if the file needs extending */
//   long FileLength = 0;

//   Success = fseek(outfile, 0L, SEEK_END) == 0;
//   if (Success)
//   {
//     FileLength=ftell(outfile);
//     if (FileLength == -1L) {
//       Success = false;
//     }
//   }

//   while (Success && FileOffset > FileLength)
//   {
//     if (fputc(0, outfile) == EOF)
//       Success = false;
//     FileLength++;
//   }

//   if (Success)
//   {
//     Success = fseek(outfile, FileOffset, SEEK_SET) == 0;

//     SectorType *SecPtr = DiscStore[DriveNum][HeadNum][TrackNum].Sectors;

//     for (int CurrentSector = 0; Success && CurrentSector < 10; CurrentSector++) {
//       if (fwrite(SecPtr[CurrentSector].Data,1,256,outfile) != 256) {
//         Success = false;
//       }
//     }
//   }

//   if (fclose(outfile) != 0) {
//     Success = false;
//   }

//   if (!Success) {
//     mainWin->Report(MessageType::Error,
//                     "Failed writing to disc file:\n  %s", FileNames[DriveNum]);
//   }

//   return Success;
// }

/*--------------------------------------------------------------------------*/

let InitialInit = true;
export function Disc8271Reset() {
  ResultReg = 0;
  StatusReg = 0;

  UPDATENMISTATUS();

  Internal_Scan_SectorNum = 0;
  //   Internal_Scan_Count=0; /* Read as two bytes */
  Internal_ModeReg = 0;
  //   Internal_CurrentTrack[0]=Internal_CurrentTrack[1]=0; /* 0/1 for surface number */
  Internal_DriveControlOutputPort = 0;
  Internal_DriveControlInputPort = 0;
  //   Internal_BadTracks[0][0]=Internal_BadTracks[0][1]=Internal_BadTracks[1][0]=Internal_BadTracks[1][1]=0xff; /* 1st subscript is surface 0/1 and second subscript is badtrack 0/1 */

  // Default values set by Acorn DFS:
  // StepRate = 12;
  // HeadSettlingTime = 10;
  // IndexCountBeforeHeadUnload = 12;
  // HeadLoadTime = 8;

  if (DriveHeadLoaded) {
    DriveHeadUnloadPending = true;
    DriveHeadMotorUpdate();
  }

  Disc8271Trigger = ClearTrigger(); /* No Disc8271Triggered events yet */

  ThisCommand = -1;
  NParamsInThisCommand = 0;
  PresentParam = 0;
  Selects[0] = Selects[1] = false;

  if (InitialInit) {
    InitialInit = false;
    InitDiscStore();
  }
}

/*--------------------------------------------------------------------------*/

// void disc8271_dumpstate()
// {
// 	WriteLog("8271:\n");
// 	WriteLog("  ResultReg=%02X\n", ResultReg);
// 	WriteLog("  StatusReg=%02X\n", StatusReg);
// 	WriteLog("  DataReg=%02X\n", DataReg);
// 	WriteLog("  Internal_Scan_SectorNum=%d\n", Internal_Scan_SectorNum);
// 	WriteLog("  Internal_Scan_Count=%u\n", Internal_Scan_Count);
// 	WriteLog("  Internal_ModeReg=%02X\n", Internal_ModeReg);
// 	WriteLog("  Internal_CurrentTrack=%d, %d\n", Internal_CurrentTrack[0],
// 	                                             Internal_CurrentTrack[1]);
// 	WriteLog("  Internal_DriveControlOutputPort=%02X\n", Internal_DriveControlOutputPort);
// 	WriteLog("  Internal_DriveControlInputPort=%02X\n", Internal_DriveControlInputPort);
// 	WriteLog("  Internal_BadTracks=(%d, %d) (%d, %d)\n", Internal_BadTracks[0][0],
// 	                                                     Internal_BadTracks[0][1],
// 	                                                     Internal_BadTracks[1][0],
// 	                                                     Internal_BadTracks[1][1]);
// 	WriteLog("  Disc8271Trigger=%d\n", Disc8271Trigger);
// 	WriteLog("  ThisCommand=%d\n", ThisCommand);
// 	WriteLog("  NParamsInThisCommand=%d\n", NParamsInThisCommand);
// 	WriteLog("  PresentParam=%d\n", PresentParam);
// 	WriteLog("  Selects=%d, %d\n", Selects[0], Selects[1]);
// 	WriteLog("  NextInterruptIsErr=%02X\n", NextInterruptIsErr);
// }
