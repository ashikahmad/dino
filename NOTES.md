# Notes

## Differences from Chromium's original dino game (deferred)

Checked against the original source (`components/neterror/resources/dino_game/` in Chromium) in October 2026.
Jump physics, speed ramp, scoring, obstacle spacing and all collision boxes match. Speed drop
(pressing down in mid-air) was fixed to match. These two differences are known and left alone for now:

1. **Phones.** The original is easier on phones in two ways:
   - Pterodactyls fly at only two heights on mobile (y = 100 and 50), never the middle one (75). We use all three everywhere.
   - On screens narrower than 600 px it slows the game: `speed * width / 600 * 1.2`, capped at normal speed. We run at full speed on every screen.
2. **Restart delay.** After a crash the original waits 1200 ms before a jump key restarts the game. We wait 750 ms.
   (Its dedicated restart keys and a click on the canvas restart at once; ours does not have those.)

Also noticed, and deliberately not copied: the original moves obstacles and ground in whole pixels per frame
(`Math.floor`), so it runs up to 1 px per frame slower than its nominal speed, and that depends on the display's refresh rate.
Ours moves smoothly at the nominal speed, so it is very slightly faster.
