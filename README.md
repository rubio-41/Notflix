# Proximity Messenger — working model (Phase 1)

People create a profile (username, display name, optional picture). Everyone who has the page open
appears in **Around You**; message them or join public conversations (Gaming, General, Sports, or
create your own). Everything updates live on every device.

## Files (all in one folder, no sub-folders)

    server.js  package.json  index.html  chat.html  styles.css  signup.js  app.js

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
- No voice, video, attachments, blocking. "Report" saves a report in data/db.json.
- No passwords: your device keeps a secret token. Clearing site data loses that username.
