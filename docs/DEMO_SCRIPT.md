# 3-minute demo script (for an office owner)

**Setup (before the meeting):** `npm start`, open the chat (`/`) on the left of the screen and the dashboard (`/dashboard`,
PIN 1234) on the right. Click *Reset demo data*. Open the chat on your phone too if you can (same Wi-Fi: `http://<laptop-ip>:3270`).
Put the office's own name/colors in `offices/<id>.json` beforehand — the demo should look like *their* brand.

| Time | Do | Say |
|---|---|---|
| 0:00 | Show the chat, then the dashboard overview. | "This is your office's AI assistant. It answers in Arabic, Arabizi, English and French — day and night. Everything it does shows up here, live." |
| 0:20 | In the chat type: `baddi esta2jer sha2a bi Hadath, budget 600$` | "A customer writes the way Lebanese people really write. It answers in the same style, understands the area and budget, and shows *real* listings from your inventory — it never invents one." |
| 0:50 | Click **Book viewing** → pick a slot → type `Rima, 03 123 456`. Show the confirmation ticket, tap *Add to calendar*. | "It proposes real free slots from your agents' calendars, books it, and confirms. No double bookings, no WhatsApp ping-pong." |
| 1:20 | Switch to the dashboard: KPI row ticked up, lead card in **Viewing booked**, open it. | "The lead appeared instantly, scored hot, with an AI summary and the preferences it extracted. The viewing is in Karim's calendar." Open **Viewings**. |
| 1:50 | In the chat type: `This is unacceptable, nobody called me back!` | "If someone is angry, asks for a person, wants to negotiate or asks legal questions, it stops selling and flags a human." Dashboard toast + red 'Needs attention'. |
| 2:10 | Open that lead → **Take over chat** → type a reply. Switch to the chat: the human reply appears. | "You step in from the same thread — the customer sees you in the same chat (or on WhatsApp)." |
| 2:30 | Chat: `I want to list my apartment in Achrafieh` (follow the questions) → **Owners** tab. | "It also captures owners who want to sell or rent out — separate list, ready to call." |
| 2:45 | Show **Analytics** and **Listings** (toggle a listing off), then say the close. | "You see which areas and budgets people ask for. You control the inventory. Next step: we connect it to your WhatsApp number — customers keep using WhatsApp, you get this dashboard." |

**Wow extras (if time):** *Simulate returning customer* (demo controls), switch language to عربي/FR, dark mode, switch the
office theme to show it is white-label, *Run follow-up engine now* to show drafted follow-ups.

**Objection answers:** "Will it say wrong things?" → it only quotes tool results; anything unsure goes to a human.
"Does it replace my agents?" → no, it books viewings and filters tire-kickers; agents close deals.
"WhatsApp?" → same brain, plug-and-play adapter (WhatsApp Cloud API), live in about a day once Meta verification is done.
