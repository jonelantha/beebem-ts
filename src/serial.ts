/****************************************************************
BeebEm - BBC Micro and Master 128 Emulator
Copyright (C) 2001  Richard Gellman
Copyright (C) 2004  Mike Wyatt

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

// Serial/Cassette Support for BeebEm
// Written by Richard Gellman - March 2001
//
// P.S. If anybody knows how to emulate this, do tell me - 16/03/2001 - Richard Gellman
//
// See https://beebwiki.mdfs.net/Acorn_cassette_format
// and http://electrem.emuunlim.com/UEFSpecs.html

// MC6850 control register bits
const MC6850_CONTROL_COUNTER_DIVIDE = 0x03;
const MC6850_CONTROL_MASTER_RESET = 0x03;
const MC6850_CONTROL_WORD_SELECT = 0x1c;
const MC6850_CONTROL_TRANSMIT_CONTROL = 0x60;
const MC6850_CONTROL_RIE = 0x80;

// enum class SerialDevice : unsigned char {
// 	Cassette,
// 	RS423
// };

// static bool CassetteRelay = false; // Cassette Relay state
// static SerialDevice SerialChannel = SerialDevice::Cassette; // Device in use

// static unsigned char RDR, TDR; // Receive and Transmit Data Registers
// static unsigned char RDSR, TDSR; // Receive and Transmit Data Shift Registers (buffers)
// unsigned int Tx_Rate = 1200; // Transmit baud rate
// unsigned int Rx_Rate = 1200; // Recieve baud rate
// unsigned char Clk_Divide = 1; // Clock divide rate

// unsigned char ACIA_Status; // 6850 ACIA Status register
// unsigned char ACIA_Control; // 6850 ACIA Control register
// static unsigned char SerialULAControl; // Serial ULA / SERPROC control register

// static bool RTS;
// static bool FirstReset = true;
// static bool DCD = false;
// static bool DCDI = true;
// static bool ODCDI = true;
// static unsigned char DCDClear = 0; // count to clear DCD bit

// static unsigned char Parity, StopBits, DataBits;

// bool RIE; // Receive Interrupt Enable
// bool TIE; // Transmit Interrupt Enable

// unsigned char RxD; // Receive destination (data or shift register)

// static UEFFileWriter UEFWriter;
// static char TapeFileName[256]; // Filename of current tape file

// static UEFFileReader UEFReader;
// static bool UEFFileOpen = false;

// struct WordSelectBits
// {
// 	unsigned char DataBits;
// 	unsigned char Parity;
// 	unsigned char StopBits;
// };

// static const WordSelectBits WordSelect[8] =
// {
// 	{ 7, EVENPARITY, 2 },
// 	{ 7, ODDPARITY,  2 },
// 	{ 7, EVENPARITY, 1 },
// 	{ 7, ODDPARITY,  1 },
// 	{ 8, NOPARITY,   2 },
// 	{ 8, NOPARITY,   1 },
// 	{ 8, EVENPARITY, 1 },
// 	{ 8, ODDPARITY,  1 },
// };

// struct TransmitterControlBits
// {
// 	bool RTS;
// 	bool TIE;
// };

// static const TransmitterControlBits TransmitterControl[8] =
// {
// 	{ false, false },
// 	{ false, true  },
// 	{ true,  false },
// 	{ false, false },
// };

// static const unsigned int Baud_Rates[8] =
// {
// 	19200, 1200, 4800, 150, 9600, 300, 2400, 75
// };

// bool OldRelayState = false;
// CycleCountT TapeTrigger=CycleCountTMax;
// constexpr int TAPECYCLES = 2000000 / 5600; // 5600 is normal tape speed

// static int UEFBuf = 0;
// static int OldUEFBuf = 0;
// static int TapeClock = 0;
// static int OldClock = 0;
// int TapeClockSpeed = 5600;

/**
 * @param Value unsigned char
 */
export function SerialACIAWriteControl(Value: number) {
  // if (DebugEnabled)
  // {
  // 	DebugDisplayTraceF(DebugType::Serial, "Serial: Write ACIA control %02X", (int)Value);
  // }

  //ACIA_Control = Value; // This is done for safe keeping

  // Master reset - clear all bits in the status register, except for
  // external conditions on CTS and DCD.
  if ((Value & MC6850_CONTROL_COUNTER_DIVIDE) == MC6850_CONTROL_MASTER_RESET) {
    // ACIA_Status &= MC6850_STATUS_CTS;
    // ACIA_Status |= MC6850_STATUS_DCD;
    // // Master reset clears IRQ
    // ACIA_Status &= ~MC6850_STATUS_IRQ;
    // intStatus &= ~(1 << serial);
    // if (FirstReset)
    // {
    // 	// RTS High on first Master reset.
    // 	ACIA_Status |= MC6850_STATUS_CTS;
    // 	FirstReset = false;
    // 	RTS = true;
    // }
    // ACIA_Status &= ~MC6850_STATUS_DCD;
    // DCD = false;
    // DCDI = false;
    // // DCDClear = 0;
    // ACIA_Status |= MC6850_STATUS_TDRE; // Transmit data register empty
    // SetTrigger(TAPECYCLES, TapeTrigger);
  }

  // Clock Divide
  // if ((Value & MC6850_CONTROL_COUNTER_DIVIDE) == 0x00) Clk_Divide = 1;
  // if ((Value & MC6850_CONTROL_COUNTER_DIVIDE) == 0x01) Clk_Divide = 16;
  // if ((Value & MC6850_CONTROL_COUNTER_DIVIDE) == 0x02) Clk_Divide = 64;

  // Word select
  // Parity   = WordSelect[(Value & MC6850_CONTROL_WORD_SELECT) >> 2].Parity;
  // StopBits = WordSelect[(Value & MC6850_CONTROL_WORD_SELECT) >> 2].StopBits;
  // DataBits = WordSelect[(Value & MC6850_CONTROL_WORD_SELECT) >> 2].DataBits;

  // Transmitter control
  // RTS = TransmitterControl[(Value & MC6850_CONTROL_TRANSMIT_CONTROL) >> 5].RTS;
  // TIE = TransmitterControl[(Value & MC6850_CONTROL_TRANSMIT_CONTROL) >> 5].TIE;
  // RIE = (Value & MC6850_CONTROL_RIE) != 0;

  // Seem to need an interrupt immediately for tape writing when TIE set
  // if (SerialChannel == SerialDevice::Cassette && TIE && CassetteRelay)
  // {
  // 	ACIA_Status |= MC6850_STATUS_IRQ;
  // 	intStatus |= 1 << serial;
  // }
}

// void SerialACIAWriteTxData(unsigned char Data)
// {
// 	if (DebugEnabled)
// 	{
// 		DebugDisplayTraceF(DebugType::Serial, "Serial: Write ACIA Tx %02X", (int)Data);
// 	}

// 	// WriteLog("Serial: Write ACIA Tx %02X, SerialChannel = %d\n", (int)Data, SerialChannel);

// 	ACIA_Status &= ~MC6850_STATUS_IRQ;
// 	intStatus &= ~(1 << serial);

// 	// 10/09/06
// 	// JW - A bug in swarm loader overwrites the rs423 output buffer counter
// 	// Unless we do something with the data, the loader hangs so just swallow it (see below)

// 	if (SerialChannel == SerialDevice::Cassette || (SerialChannel == SerialDevice::RS423))
// 	{
// 		TDR = Data;
// 		ACIA_Status &= ~MC6850_STATUS_TDRE;
// 		int baud = Tx_Rate * ((Clk_Divide == 1) ? 64 : (Clk_Divide==64) ? 1 : 4);

// 		SetTrigger(2000000 / (baud / 8) * TapeClockSpeed / 5600, TapeTrigger);
// 	}
// }

// The Serial ULA control register controls the cassette motor relay,
// transmit and receive baud rates, and RS423/cassette switch

// void SerialULAWrite(unsigned char Value)
// {
// 	if (DebugEnabled)
// 	{
// 		DebugDisplayTraceF(DebugType::Serial, "Serial: Write serial ULA %02X", (int)Value);
// 	}

// 	SerialULAControl = Value;

// 	// Slightly easier this time.
// 	// just the Rx and Tx baud rates, and the selectors.
// 	CassetteRelay = (Value & 0x80) != 0;
// 	TapeAudio.Enabled = CassetteRelay;
// 	LEDs.Motor = CassetteRelay;

// 	if (CassetteRelay)
// 	{
// 		SetTrigger(TAPECYCLES, TapeTrigger);
// 	}

// 	if (CassetteRelay != OldRelayState)
// 	{
// 		OldRelayState = CassetteRelay;
// 		ClickRelay(CassetteRelay);
// 	}

// 	SerialChannel = (Value & 0x40) != 0 ? SerialDevice::RS423 : SerialDevice::Cassette;
// 	Tx_Rate = Baud_Rates[(Value & 0x07)];
// 	Rx_Rate = Baud_Rates[(Value & 0x38) >> 3];
// }

// unsigned char SerialULARead()
// {
// 	if (DebugEnabled)
// 	{
// 		DebugDisplayTraceF(DebugType::Serial, "Serial: Read serial ULA %02X", (int)SerialULAControl);
// 	}

// 	return SerialULAControl;
// }

// unsigned char SerialACIAReadStatus()
// {
// //	if (!DCDI && DCD)
// //	{
// //		DCDClear++;
// //		if (DCDClear > 1) {
// //			DCD = false;
// //			ACIA_Status &= ~(1 << MC6850_STATUS_DCS);
// //			DCDClear = 0;
// //		}
// //	}

// 	if (DebugEnabled)
// 	{
// 		DebugDisplayTraceF(DebugType::Serial, "Serial: Read ACIA status %02X", (int)ACIA_Status);
// 	}

// 	// WriteLog("Serial: Read ACIA status %02X\n", (int)ACIA_Status);

// 	// See https://github.com/stardot/beebem-windows/issues/47
// 	return ACIA_Status;
// }

// static void HandleData(unsigned char Data)
// {
// 	// This proc has to dump data into the serial chip's registers

// 	ACIA_Status &= ~MC6850_STATUS_OVRN;

// 	if (RxD == 0)
// 	{
// 		RDR = Data;
// 		ACIA_Status |= MC6850_STATUS_RDRF; // Rx Reg full
// 		RxD++;
// 	}
// 	else if (RxD == 1)
// 	{
// 		RDSR = Data;
// 		ACIA_Status |= MC6850_STATUS_RDRF;
// 		RxD++;
// 	}
// 	else if (RxD == 2)
// 	{
// 		RDR = RDSR;
// 		RDSR = Data;
// 		ACIA_Status |= MC6850_STATUS_OVRN;
// 	}

// 	if (RIE)
// 	{
// 		// interrupt on receive/overun
// 		ACIA_Status |= MC6850_STATUS_IRQ;
// 		intStatus |= 1 << serial;
// 	}
// }

// unsigned char SerialACIAReadRxData()
// {
// //	if (!DCDI && DCD)
// //	{
// //		DCDClear++;
// //		if (DCDClear > 1) {
// //			DCD = false;
// //			ACIA_Status &= ~(1 << MC6850_STATUS_DCS);
// //			DCDClear = 0;
// //		}
// //	}

// 	ACIA_Status &= ~MC6850_STATUS_IRQ;
// 	intStatus &= ~(1 << serial);

// 	unsigned char Data = RDR;
// 	RDR = RDSR;
// 	RDSR = 0;

// 	if (RxD > 0)
// 	{
// 		RxD--;
// 	}

// 	if (RxD == 0)
// 	{
// 		ACIA_Status &= ~MC6850_STATUS_RDRF;
// 	}

// 	if (RxD > 0 && RIE)
// 	{
// 		ACIA_Status |= MC6850_STATUS_IRQ;
// 		intStatus |= 1 << serial;
// 	}

// 	if (DataBits == 7)
// 	{
// 		Data &= 127;
// 	}

// 	if (DebugEnabled)
// 	{
// 		DebugDisplayTraceF(DebugType::Serial, "Serial: Read ACIA Rx %02X", (int)Data);
// 	}

// 	// WriteLog("Serial: Read ACIA Rx %02X, ACIA_Status = %02x\n", (int)Data, (int)ACIA_Status);

// 	return Data;
// }

// void SerialPoll()
// {
// 	if (SerialChannel == SerialDevice::Cassette)
// 	{
// 		if (CassetteRelay)
// 		{
// 			if (UEFFileOpen)
// 			{
// 				if (TapeClock != OldClock)
// 				{
// 					UEFBuf = UEFReader.GetData(TapeClock);
// 					OldClock = TapeClock;
// 				}

// 				if (UEFBuf != OldUEFBuf ||
// 					UEFRES_TYPE(UEFBuf) == UEF_CARRIER_TONE ||
// 					UEFRES_TYPE(UEFBuf) == UEF_GAP)
// 				{
// 					OldUEFBuf = UEFBuf;

// 					// New data read in, so do something about it
// 					switch (UEFRES_TYPE(UEFBuf))
// 					{
// 						case UEF_CARRIER_TONE:
// 							DCDI = true;
// 							TapeAudio.Signal = 2;
// 							// TapeAudio.Samples = 0;
// 							TapeAudio.BytePos = 11;
// 							break;

// 						case UEF_GAP:
// 							DCDI = true;
// 							TapeAudio.Signal = 0;
// 							break;

// 						case UEF_DATA: {
// 							DCDI = false;
// 							unsigned char Data = UEFRES_BYTE(UEFBuf);
// 							HandleData(Data);

// 							TapeAudio.Data       = (Data << 1) | 1;
// 							TapeAudio.BytePos    = 1;
// 							TapeAudio.CurrentBit = 0;
// 							TapeAudio.Signal     = 1;
// 							TapeAudio.ByteCount  = 3;
// 							break;
// 						}
// 					}
// 				}

// 				if (RxD < 2)
// 				{
// 					if (TotalCycles >= TapeTrigger)
// 					{
// 						TapeClock++;

// 						SetTrigger(TAPECYCLES, TapeTrigger);
// 					}
// 				}
// 			}

// 			if (DCDI != ODCDI)
// 			{
// 				if (DCDI)
// 				{
// 					// Low to high transition on the DCD line

// 					if (RIE)
// 					{
// 						ACIA_Status |= MC6850_STATUS_IRQ;
// 						intStatus |= 1 << serial;
// 					}

// 					DCD = true;
// 					ACIA_Status |= MC6850_STATUS_DCD; // ACIA_Status &= ~MC6850_STATUS_RDRF;
// 					// DCDClear = 0;
// 				}
// 				else // !DCDI
// 				{
// 					DCD = false;
// 					ACIA_Status &= ~MC6850_STATUS_DCD;
// 					// DCDClear = 0;
// 				}

// 				ODCDI = DCDI;
// 			}
// 		}
// 	}

// }

// static void CloseUEFFile()
// {
// 	if (UEFFileOpen)
// 	{
// 		UEFReader.Close();
// 		UEFFileOpen = false;
// 	}
// }

// void SerialClose()
// {
// 	CloseTape();
// }

// UEFResult LoadUEFTape(const char *FileName)
// {
// 	CloseTape();

// 	// Clock values:
// 	// 5600 - Normal speed - anything higher is a bit slow
// 	// 750 - Recommended minium settings, fastest reliable load
// 	UEFReader.SetClock(TapeClockSpeed);

// 	UEFResult Result = UEFReader.Open(FileName);

// 	if (Result == UEFResult::Success)
// 	{
// 		UEFFileOpen = true;
// 		strcpy(TapeFileName, FileName);

// 		UEFBuf = 0;
// 		OldUEFBuf = 0;
// 		RxD = 0;
// 		TapeClock = 0;
// 		OldClock = 0;
// 		SetTrigger(TAPECYCLES, TapeTrigger);
// 	}

// 	return Result;
// }

// void CloseTape()
// {
// 	CloseUEFFile();

// 	RxD = 0;

// 	TapeFileName[0] = '\0';
// }

// void RewindTape()
// {
// 	UEFBuf = 0;
// 	OldUEFBuf = 0;
// 	TapeClock = 0;
// 	OldClock = 0;
// 	SetTrigger(TAPECYCLES, TapeTrigger);
// }

// void SetTapeSpeed(int Speed)
// {
// 	int NewClock = (int)((double)TapeClock * ((double)Speed / TapeClockSpeed));
// 	TapeClockSpeed = Speed;

// 	if (UEFFileOpen)
// 	{
// 		std::string FileName = TapeFileName;

// 		LoadUEFTape(FileName.c_str());
// 	}

// 	TapeClock = NewClock;
// }
