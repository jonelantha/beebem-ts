/****************************************************************
BeebEm - BBC Micro and Master 128 Emulator
Copyright (C) 1994  David Alan Gilbert
Copyright (C) 1994  Nigel Magnay
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

import {
  DoShiftBreak,
  Initialise,
  set_m_KeyMapAS,
  TranslateKey,
} from "./beebwin";
import { Exec6502Instruction } from "./6502core";
import { BeebReleaseAllKeys } from "./sysvia";
import { LoadCSWTape } from "./serial";

(async function run() {
  document.addEventListener("keydown", evt => {
    if (evt.metaKey) return;

    evt.preventDefault();
    TranslateKey(evt.keyCode, false);
  });

  document.addEventListener("keyup", evt => {
    if (evt.metaKey) return;

    evt.preventDefault();
    TranslateKey(evt.keyCode, true);
  });

  window.removeEventListener("blur", () => BeebReleaseAllKeys());

  const params = new URLSearchParams(window.location.search);

  set_m_KeyMapAS(Boolean(params.get("mapAS")));

  const keyMapping =
    params.get("keyMapping") === "logical" ? "logical" : "default";

  await Initialise(keyMapping);

  const discImage = params.get("disc") ?? "";

  discImage && (await DoShiftBreak(discImage));

  const tape = params.get("tape") ?? "";

  try {
    tape && (await LoadCSWTape(tape));
  } catch (error) {
    console.error(error);
  }

  while (true) {
    const sleepTime = Exec6502Instruction();
    if (sleepTime) await new Promise<void>(res => setTimeout(res, sleepTime));

    document.hasFocus() || (await focusPromise());
  }
})(); // needed for safari to pick up top level throws

function focusPromise() {
  return new Promise<void>(res => {
    window.addEventListener("focus", () => res(), { once: true });
  });
}
