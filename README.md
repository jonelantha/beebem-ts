# beebem-ts

**beebem-ts**: a stripped down and very incomplete TypeScript port of the [beebem-windows](https://github.com/stardot/beebem-windows/tree/master) BBC Computer emulator

Are you looking for a fully fledged browser based BBC Computer emulator?

If so, please try https://github.com/mattgodbolt/jsbeeb

## ⚡️ See it live

- **Boot to BASIC:** https://jonelantha.github.io/beebem-ts/?keyMapping=logical
- **Snapper:** https://jonelantha.github.io/beebem-ts/?disc=https://www.stairwaytohell.com/bbc/archive/diskimages/Acornsoft/Snapper-v1.zip
- **Repton:** https://jonelantha.github.io/beebem-ts/?disc=https://www.stairwaytohell.com/bbc/archive/diskimages/Superior/Repton.zip
- **Elite:** https://jonelantha.github.io/beebem-ts/?disc=https://www.stairwaytohell.com/bbc/archive/diskimages/Acornsoft/Elite.zip
- **Revs:** https://jonelantha.github.io/beebem-ts/?disc=https://www.stairwaytohell.com/bbc/archive/diskimages/Acornsoft/Revs.zip

## 📄 URL params

- `disc` - url of **.ssd** (or a zip containing an **.ssd** file) to Shift Boot from
  - _hint: try using archive urls from https://www.stairwaytohell.com_
- `keyMapping` - **logical** or **default**
  - Want to type something in BASIC? Use **logical**
  - Want to play a game? Use **default**
- `mapAS` - Use **A** & **S** keys for **CAPS LOCK** & **CTRL**

## 👩‍💻 Running locally

Requires [node](https://nodejs.org/en), at least v20

```bash
npm install
npm run dev
```

And then visit http://localhost:5173/

## ⚠️ DISCLAIMER ⚠️

- 🅱️ Emulation is Model B only, hardware emulated is very much 'MVP'
- 🐛 Purposefully incomplete and probably quite buggy
- 💩 Messy and non-idiomatic code
- 🐌 Not optimised in any way

## 🔮 Future Development

Maybe? Not sure...🤔

## 🙌 Credits

Based on https://github.com/stardot/beebem-windows

### Credits from https://github.com/stardot/beebem-windows:

Thanks to Dave Gilbert for originally creating BeebEm. There's an interview with Dave about the early development of BeebEm [on YouTube](https://www.youtube.com/watch?v=7D5Msu4zn-Q).

Thanks to Mike Wyatt for his contributions to BeebEm and for hosting the [BeebEm homepage](http://www.mkw.me.uk/beebem).

Thanks to the maintainers and contributors for its continued development: Alistair Cree, Bill Carr, Charles Reilly, Chris Needham, David Sharp, Daniel Beardsmore, Dominic Beesley, Greg Cook, Jon Welch, Jonathan Harston, Ken Lowe, Kieran Mockford, Laurie Whiffen, Mark Usher, Martin Mather, Mauro Varischetti, Mike Wyatt, Nigel Magnay, pstnotpd, Rich Talbot-Watkins, Richard Broadhurst, Richard Gellman, Rob O'Donnell, Robert Schmidt, Steve Inglis, Steve Insley, Steve Pick, Tadek Kijkowski, Theo Lindebaum, Tom Seddon.

## Copyright

The original beebem-windows project is Copyright (C) 1994-2024 David Alan Gilbert and contributors.

## License

BeebEm is distributed under the terms of the GNU General Public License as described in [COPYRIGHT.txt](COPYRIGHT.txt).
