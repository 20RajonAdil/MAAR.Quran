# MAAR Quran 🌙

**MAAR Quran** is a modern Islamic learning website designed to help users read and explore the Holy Qur’an with clarity, simplicity, and respect. The project focuses on accessibility, accurate information, and a clean user experience.

🔗 **Live Website:**  
Old site: https://20rajonadil.github.io/MAAR.Quran/old.Adil.MAAR.html

New site: https://20rajonadil.github.io/MAAR.Quran/

## ✨ Features

- 📖 Qur’an reading support in **Arabic, English, and Bangla**
- ⏰ **Accurate prayer times** with live countdown
- 🗓️ **Hijri (Islamic) calendar**
- 🎨 Clean, modern, and responsive design
- 🧭 Simple navigation for learners of all ages
- 🌐 Fully static website hosted on :contentReference[oaicite:0]{index=0} Pages

---

## 👤 About the Creator

I am **Md Adil Ahmed Rajon**, the creator and developer of this website.  
I built MAAR Quran to make Islamic learning easier and more accessible through modern web technology while maintaining respect for Islamic values.

📞 **Contact**  
- Phone: +44 07440445929  
- Email: 20rajona@gmail.com

---

## 🤝 Special Thanks

**Adil Hassan**  
A special thanks to my friend **Adil Hassan**, who helped in building this website by taking and providing the images that were needed for the project. His support and contribution played an important role in shaping the final look of the website.

---

## 🛠️ Technologies Used

- HTML5  
- CSS3  
- JavaScript  
- Google Fonts  
- Public Qur’an & prayer time APIs  

---

## 📜 License

### Code License
This project’s **source code** is licensed under the **MIT License**.  
You are free to use, modify, and distribute the code with proper credit.

### Content Notice
- Qur’an text, translations, and Islamic content are provided for **educational purposes only**
- All religious content should be used with respect
- Images and media may not be reused without permission

---

## ⚠️ Disclaimer

This website is intended for educational and learning purposes.  
While every effort is made to ensure accuracy, prayer times and calendar data may vary slightly depending on location and calculation method.

---

## 🌱 Future Improvements

- Bookmarking verses
- Audio recitation support
- User theme customization
- Offline-friendly reading mode

---

© 2026 Md Adil Ahmed Rajon  
All rights reserved.

## Offline support

This app works fully offline as a PWA — it caches itself for offline use automatically, no manual download step required.

## YouTube videos (Videos tab)

The Videos tab and the "Latest on YouTube" strip on Home read `/api/videos`
(`api/videos.js`, a Vercel serverless function) for the channels
`@MAAR-NASHID` and `@MAARGOJOL`.

- **All uploads + exact view counts:** add `YOUTUBE_API_KEY` in Vercel →
  Project Settings → Environment Variables (YouTube Data API v3, free), then redeploy.
- **Without a key:** it falls back to each channel's public RSS feed
  (latest ~15 uploads per channel, with view counts).
- Responses are cached at the edge for 30 minutes; the page re-checks every
  10 minutes while open, so new uploads and view counts appear on their own.

### Offline videos, screen-awake and lock-screen audio

Videos can be saved inside the site (browser storage, never the phone gallery)
only if you host the file yourself. Export your own uploads from YouTube Studio
(Content → ⋯ → Download), put them in `media/`, and list them in `media.json`:

```json
{ "VIDEO_ID": { "src": "media/my-nasheed.mp3", "type": "audio" } }
```

`type` is `audio` or `video`. Audio files keep playing with the screen locked
(lock-screen controls included); video files and YouTube embeds keep the
screen awake while open.
