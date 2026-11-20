# Proximity Messenger — working model (Phase 1)

People create a profile (username, display name, optional picture). Everyone who has the page open
appears in **Around You**; message them or join public conversations (there are none at first — people create them). Everything updates live on every device.

## Files (all in one folder, no sub-folders)

    server.js  package.json  index.html  chat.html  styles.css  signup.js  app.js

Friends: open someone's profile (tap their picture in a list, or their pin on the map), add them as a friend, and once they accept you can give them your own name. Friends stay in your Friends list and you can chat whether or not they are nearby.

## Nearby and the map

"Around You" and the map use your device's location (GPS). Each device sends its position to the server while
the page is open; the server keeps it in memory only (never saved) and tells each person who is within
500 m (change with `NEARBY_RADIUS_M=200 node server.js`). Other people only get positions rounded to about
11 m. Phones and browsers only share location on HTTPS (or localhost), so use an https:// address. If nobody
has shared a location (for example testing over plain http), everyone online is shown so you can still test.
The map needs internet (map library from cdnjs, tiles from the web).

### Map tiles and the CARTO API key

CARTO now requires a free API key for its dark map tiles (get one in a minute, no account, at
https://carto.com/basemaps/apikey — free up to 5M tile requests/month non-commercial, 1M commercial).
Do NOT put the key in the code. Set it as an environment variable named `CARTO_API_KEY`:

- On Render: your service → Environment → Add Environment Variable → `CARTO_API_KEY` = your key → Save (it redeploys).
- On a computer:  `CARTO_API_KEY=your_key node server.js`

In CARTO's key settings, restrict the key to your site's address (the key is visible to the browser).
With no key set, the map falls back to OpenStreetMap tiles darkened with CSS.

## Accounts, calls, voice messages, voice rooms

- **Log in:** accounts now have a password (8+ characters). Log in from any device with username + password.
  Accounts made before passwords existed can set one in Profile (on the device where they were created).
- **Calls:** open a chat and tap the phone button. Audio goes straight between the two devices (WebRTC); the
  server only introduces them. **Voice rooms:** every public conversation has one (mini bar → microphone icon,
  or the microphone button in a conversation). Up to 8 people. Mute, leave, and a green ring shows who is talking.
- **Voice messages:** tap the waveform button in the message box, speak, tap send (up to 3 minutes). Recordings are
  stored on the server in `data/voice/`.
- Microphone access needs HTTPS (or localhost). Calls use Google's public STUN servers; some networks (strict
  Wi-Fi, some mobile carriers) also need a TURN relay: set `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`.
- Voice messages recorded in Chrome are WebM; older iPhones/Safari versions may not play those.

## Run on a computer

Needs Node.js 18+. No install step:  `node server.js`  then open the address it prints.
Other devices on the same Wi-Fi can use the "On your network" address.

## Run online (works from an iPad)

Put the files in a GitHub repository, then create a Web Service from it on a Node host such as Render:
Runtime Node, Start command `node server.js`, no build step needed. Open the URL it gives you on any device.
Free tiers usually sleep when idle and may reset saved data on restart; set `DATA_DIR` to a persistent disk to keep it.

## What this is and is not (yet)

- A normal client–server app. NOT Bluetooth/Wi-Fi peer-to-peer; it needs a connection to the server.
- "Around You" = online right now. No real distance yet; the map layout is illustrative.
- No video, attachments, blocking, push-to-talk. "Show me in Around You" in Profile hides you from others' list and map, but is not a security feature yet.
- "Report" saves a report in data/db.json.
