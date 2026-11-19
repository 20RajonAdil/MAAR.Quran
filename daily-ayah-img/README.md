# Daily Ayah images

Background pictures for the "Ayah of the day" download/share cards (website and Android app).
Home > Ayah of the day > Download image / Share as image, then pick a collection and a design.

Collections: Classic (drawn in code), Airplanes, Desert, Night, Landscapes, Phone wallpaper.

"Phone wallpaper" holds tall, phone-shaped pictures (about 9:16 to 1:2). Their entries have `nobrand:true`, so the
"Quran Maar" name and site address are NOT drawn on them. Put any new phone-sized picture in that collection.

- `<id>.jpg` full-size background (1080 px wide; height follows the picture)
- `thumbs/<id>.jpg` small preview used in the picker

Every design is listed in `AYAH_DESIGNS` in `app.js`: its collection, name, and where the Arabic / English
text sits (fractions of the picture height) so the verse never covers the main subject.
To add one: drop `<id>.jpg` and `thumbs/<id>.jpg` here, add an entry in `AYAH_DESIGNS`, list both files in
`SHELL_ASSETS` in `sw.js`, then bump `SHELL_VERSION` (sw.js) and the `app.js?v=` number (index.html + sw.js).
