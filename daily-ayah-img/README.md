# Daily Ayah images

Background pictures for the "Ayah of the day" download/share cards (website and Android app).
Pick one in the app: Home > Ayah of the day > Download image / Share as image.

| File | Design name |
| --- | --- |
| sunset-arch.jpg | Sunset flight |
| moonlit-arch.jpg | Moonlit flight |
| clouds-arch.jpg | Above the clouds |
| runway-arch.jpg | Runway sunset |

The "Classic" design is drawn in code (no picture). Text zones for each picture are set in
`AYAH_DESIGNS` in `app.js`. To add a design: drop a JPG here, add an entry to `AYAH_DESIGNS`
and to `SHELL_ASSETS` in `sw.js`, then bump `SHELL_VERSION`.
