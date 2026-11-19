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
- No voice, video, attachments, blocking (the Voice button in the mini bar is a placeholder). "Show me in Around You" in Profile hides you from others' list and map, but is not a security feature yet.
- "Report" saves a report in data/db.json.
- No passwords: your device keeps a secret token. Clearing site data loses that username.
