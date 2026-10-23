/* ==========================================================
   WHERE TO WATCH
   - Streaming / rent / buy / free-with-ads providers (TMDB watch-provider
     data, supplied by JustWatch) for the viewer's region
   - Tap a service -> a sheet with how it's available for this title, the
     service's plans and approximate prices, and a button that opens the
     service (the phone opens its app if installed - these are normal
     https links the OS routes to the app)
   - In cinemas -> "Find cinemas & showtimes": cinemas near you (OpenStreetMap)
     with a link to each cinema's own booking page
   Replaces renderWhereToWatch() from mvdata.js / search.js.
   Load AFTER mvdata.js / search.js (end of <body>).

   NOTE ON DATA: no free service publishes live ticket prices or showtimes, and
   subscription prices change. Plan prices below are typed in by hand
   (PRICES_AS_OF) - edit SERVICES when they change. Cinema showtimes/prices live
   on the cinema's booking page, which is where the buttons go.
========================================================== */

const WATCH_TMDB = "https://api.themoviedb.org/3";
const watchRegion = ((navigator.language || "en-US").split("-")[1] || "US").toUpperCase();
const PRICES_AS_OF = "2025";

const SERVICES = {
    8:   { name: "Netflix", url: q => `https://www.netflix.com/search?q=${q}`,
           plans: { US: [["Standard with ads", "$7.99"], ["Standard", "$17.99"], ["Premium", "$24.99"]],
                    GB: [["Standard with ads", "£5.99"], ["Standard", "£12.99"], ["Premium", "£18.99"]] } },
    9:   { name: "Amazon Prime Video", url: q => `https://www.primevideo.com/search/?phrase=${q}`,
           plans: { US: [["Prime Video only", "$8.99"], ["Amazon Prime (includes Prime Video)", "$14.99"]],
                    GB: [["Prime Video only", "£5.99"], ["Amazon Prime (includes Prime Video)", "£8.99"]] } },
    119: { name: "Amazon Prime Video", url: q => `https://www.primevideo.com/search/?phrase=${q}`,
           plans: { US: [["Prime Video only", "$8.99"], ["Amazon Prime (includes Prime Video)", "$14.99"]],
                    GB: [["Prime Video only", "£5.99"], ["Amazon Prime (includes Prime Video)", "£8.99"]] } },
    337: { name: "Disney+", url: q => `https://www.disneyplus.com/search?q=${q}`,
           plans: { US: [["Basic (with ads)", "$9.99"], ["Premium", "$15.99"]],
                    GB: [["Standard with ads", "£5.99"], ["Standard", "£9.99"], ["Premium", "£13.99"]] } },
    350: { name: "Apple TV+", url: q => `https://tv.apple.com/search?term=${q}`,
           plans: { US: [["Apple TV+", "$12.99"]], GB: [["Apple TV+", "£9.99"]] } },
    384: { name: "Max", url: q => `https://play.max.com/search?q=${q}`,
           plans: { US: [["Basic with ads", "$9.99"], ["Standard", "$16.99"], ["Premium", "$20.99"]] } },
    1899:{ name: "Max", url: q => `https://play.max.com/search?q=${q}`,
           plans: { US: [["Basic with ads", "$9.99"], ["Standard", "$16.99"], ["Premium", "$20.99"]] } },
    15:  { name: "Hulu", url: q => `https://www.hulu.com/search?q=${q}`,
           plans: { US: [["With ads", "$9.99"], ["No ads", "$18.99"]] } },
    531: { name: "Paramount+", url: q => `https://www.paramountplus.com/search/?q=${q}`,
           plans: { US: [["Essential", "$7.99"], ["Premium", "$12.99"]] } },
    386: { name: "Peacock", url: q => `https://www.peacocktv.com/search?q=${q}`,
           plans: { US: [["Premium", "$10.99"], ["Premium Plus", "$16.99"]] } },
    387: { name: "Peacock", url: q => `https://www.peacocktv.com/search?q=${q}`,
           plans: { US: [["Premium", "$10.99"], ["Premium Plus", "$16.99"]] } },
    38:  { name: "BBC iPlayer", url: q => `https://www.bbc.co.uk/iplayer/search?q=${q}`,
           note: "Free to watch with a UK TV Licence." },
    41:  { name: "ITVX", url: q => `https://www.itv.com/watch/search?q=${q}`,
           note: "Free with ads. ITVX Premium (ad-free) is an optional upgrade." },
    103: { name: "Channel 4", url: q => `https://www.channel4.com/search?q=${q}`,
           note: "Free with ads." },
    192: { name: "YouTube", url: q => `https://www.youtube.com/results?search_query=${q}`,
           note: "Rent or buy this title from the YouTube store; the price is set per title." },
    2:   { name: "Apple TV", url: q => `https://tv.apple.com/search?term=${q}`,
           note: "Rent or buy from the Apple TV store; the price is set per title." },
    3:   { name: "Google Play Movies", url: q => `https://play.google.com/store/search?q=${q}&c=movies`,
           note: "Rent or buy from the Google Play store; the price is set per title." },
    10:  { name: "Amazon Video", url: q => `https://www.amazon.com/s?k=${q}&i=instant-video`,
           note: "Rent or buy from the Amazon store; the price is set per title." }
};

const TICKET_ESTIMATE = {
    US: "about $12–$20 for an adult ticket",
    GB: "about £9–£17 for an adult ticket"
};

/* ---------- Styles ---------- */

const WATCH_CSS = `
.wp-section { margin: 0 0 18px; }
.wp-heading { margin: 0 0 10px; font-size: 13px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: #a3a3a3; }
.wp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.wp-tile { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #2a2a2a; border: none; border-radius: 12px;
	color: #fff; font-family: inherit; text-align: left; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.wp-tile:active { background: #343434; }
.wp-logo { flex: 0 0 44px; width: 44px; height: 44px; border-radius: 10px; object-fit: cover; background: #3a3a3a; }
.wp-name { flex: 1; font-size: 14px; font-weight: 600; line-height: 1.25; }
.wp-chev { font-size: 22px; line-height: 1; color: #bdbdbd; }
.wp-attrib { margin: 6px 0 0; font-size: 11px; color: #8c8c8c; }
.wp-attrib a { color: #a3a3a3; }
.wp-empty { margin: 0 0 14px; font-size: 14px; color: #a3a3a3; }

.wp-cinema { margin: 0 0 20px; padding: 14px; background: linear-gradient(135deg, #2f2323, #262626); border-radius: 14px; }
.wp-cinema h4 { margin: 0 0 4px; font-size: 17px; }
.wp-cinema p { margin: 0 0 12px; font-size: 14px; color: #d0d0d0; }

.wbtn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; box-sizing: border-box;
	padding: 13px 16px; border: none; border-radius: 10px; background: #fff; color: #000; font-family: inherit;
	font-size: 16px; font-weight: 700; text-decoration: none; cursor: pointer; }
.wbtn.secondary { background: #3a3a3c; color: #fff; }
.wbtn.small { width: auto; padding: 9px 14px; font-size: 14px; }
.wbtn:disabled { opacity: 0.5; }

/* sheets above the movie modal (z 9999) */
.wsheet { position: fixed; inset: 0; z-index: 10050; display: flex; align-items: flex-end; justify-content: center;
	background: rgba(0, 0, 0, 0.72); opacity: 1; transition: opacity 0.28s ease, visibility 0s linear 0s; }
.wsheet.hidden { display: flex !important; visibility: hidden; opacity: 0; pointer-events: none;
	transition: opacity 0.24s ease, visibility 0s linear 0.24s; }
.wsheet-panel { display: flex; flex-direction: column; width: 100%; max-width: 560px; max-height: 90vh; background: #1b1b1b;
	border-radius: 18px 18px 0 0; overflow: hidden; transform: none; transition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1); }
.wsheet.hidden .wsheet-panel { transform: translateY(100%); }
.wsheet-head { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 14px 10px; flex-shrink: 0; }
.wsheet-title { flex: 1; margin: 0; text-align: center; font-size: 18px; font-weight: 700; }
.wcircle { position: relative; flex: 0 0 36px; width: 36px; height: 36px; border: none; border-radius: 50%; background: rgba(70, 70, 70, 0.8); cursor: pointer; }
.wcircle.back::before { content: ""; position: absolute; left: 50%; top: 50%; width: 9px; height: 9px; margin: -5px 0 0 -3px;
	border-left: 2px solid #fff; border-bottom: 2px solid #fff; transform: rotate(45deg); }
.wcircle.close::before, .wcircle.close::after { content: ""; position: absolute; left: 50%; top: 50%; width: 15px; height: 2px;
	margin: -1px 0 0 -7.5px; border-radius: 2px; background: #fff; transform: rotate(45deg); }
.wcircle.close::after { transform: rotate(-45deg); }
.wsheet-body { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 6px 18px 26px; }

.svc-hero { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 6px 0 16px; }
.svc-hero img { width: 76px; height: 76px; border-radius: 18px; object-fit: cover; background: #333; }
.svc-hero h2 { margin: 12px 0 4px; font-size: 24px; }
.svc-hero p { margin: 0; font-size: 14px; color: #c8c8c8; }
.svc-plans { margin: 0 0 14px; background: #262626; border-radius: 12px; overflow: hidden; }
.svc-plan { display: flex; justify-content: space-between; gap: 12px; padding: 13px 14px; font-size: 15px; border-bottom: 1px solid #333; }
.svc-plan:last-child { border-bottom: none; }
.svc-plan b { white-space: nowrap; }
.svc-note { margin: 0 0 14px; font-size: 13px; line-height: 1.45; color: #a3a3a3; }
.svc-actions { display: flex; flex-direction: column; gap: 10px; }

.cin-input { display: flex; gap: 8px; margin: 10px 0 14px; }
.cin-input input { flex: 1; min-width: 0; padding: 12px 14px; background: #262626; border: 1px solid #444; border-radius: 10px;
	color: #fff; font-size: 16px; font-family: inherit; outline: none; }
.cin-input input:focus { border-color: #888; }
.cin-info { margin: 0 0 14px; padding: 12px 14px; background: #262626; border-radius: 12px; font-size: 13px; line-height: 1.5; color: #c8c8c8; }
.cin-info b { color: #fff; }
.cin-links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.cin-card { margin: 0 0 10px; padding: 14px; background: #262626; border-radius: 12px; }
.cin-name { margin: 0 0 2px; font-size: 16px; font-weight: 700; }
.cin-meta { margin: 0 0 10px; font-size: 13px; color: #a3a3a3; line-height: 1.4; }
.cin-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.cin-status { margin: 12px 0; font-size: 14px; color: #c8c8c8; }
`;

(function injectWatchStyles() {
    if (document.getElementById("watch-styles")) return;
    const style = document.createElement("style");
    style.id = "watch-styles";
    style.textContent = WATCH_CSS;
    document.head.appendChild(style);
})();

function wEl(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
}

/* ---------- Sheets (service + cinemas) ---------- */

function buildSheet(id, title) {
    const sheet = wEl("div", "wsheet hidden");
    sheet.id = id;
    sheet.innerHTML = `
        <div class="wsheet-panel" role="dialog" aria-modal="true">
            <div class="wsheet-head">
                <button class="wcircle back" aria-label="Back"></button>
                <h3 class="wsheet-title"></h3>
                <button class="wcircle close" aria-label="Close"></button>
            </div>
            <div class="wsheet-body"></div>
        </div>`;
    document.body.appendChild(sheet);

    const close = () => sheet.classList.add("hidden");
    sheet.addEventListener("click", e => { if (e.target === sheet) close(); });
    sheet.querySelector(".back").addEventListener("click", close);   // back to the movie
    sheet.querySelector(".close").addEventListener("click", close);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !sheet.classList.contains("hidden")) close(); });
    return sheet;
}

function showSheet(sheet, title) {
    sheet.querySelector(".wsheet-title").textContent = title;
    const body = sheet.querySelector(".wsheet-body");
    body.innerHTML = "";
    body.scrollTop = 0;
    void sheet.offsetHeight; // commit the hidden state so it animates in
    sheet.classList.remove("hidden");
    return body;
}

/* ---------- Providers ---------- */

const providerCache = {};

async function fetchProviders(id, type) {
    const key = `${type}:${id}`;
    if (providerCache[key] !== undefined) return providerCache[key];
    try {
        const res = await fetch(`${WATCH_TMDB}/${type}/${id}/watch/providers?api_key=${API_KEY}`);
        const data = await res.json();
        const results = data.results || {};
        const region = results[watchRegion] || results.US || results[Object.keys(results)[0]] || null;
        const regionCode = results[watchRegion] ? watchRegion : (results.US ? "US" : Object.keys(results)[0] || watchRegion);
        providerCache[key] = region ? { ...region, regionCode } : null;
    } catch {
        providerCache[key] = null;
    }
    return providerCache[key];
}

const AVAILABILITY = {
    flatrate: "Included with a subscription",
    ads: "Free to watch with ads",
    free: "Free to watch",
    rent: "Available to rent",
    buy: "Available to buy"
};

let serviceSheet = null;

function openServiceSheet(provider, availabilityKey, ctx, regionCode) {
    if (!serviceSheet) serviceSheet = buildSheet("svc-modal");
    const body = showSheet(serviceSheet, provider.provider_name);

    const info = SERVICES[provider.provider_id] || null;
    const q = encodeURIComponent(ctx.title);

    const hero = wEl("div", "svc-hero");
    if (provider.logo_path) {
        const img = document.createElement("img");
        img.src = `https://image.tmdb.org/t/p/w154${provider.logo_path}`;
        img.alt = "";
        hero.appendChild(img);
    }
    hero.appendChild(wEl("h2", null, provider.provider_name));
    hero.appendChild(wEl("p", null, `${ctx.title} · ${AVAILABILITY[availabilityKey] || "Available"}`));
    body.appendChild(hero);

    // plans + approximate prices
    const plans = info?.plans?.[regionCode] || info?.plans?.[watchRegion];
    if (plans?.length) {
        const list = wEl("div", "svc-plans");
        plans.forEach(([name, price]) => {
            const row = wEl("div", "svc-plan");
            row.append(wEl("span", null, name), wEl("b", null, `${price}/mo`));
            list.appendChild(row);
        });
        body.appendChild(list);
        body.appendChild(wEl("p", "svc-note",
            `Approximate monthly prices (as last checked, ${PRICES_AS_OF}). Plans and prices change - confirm on ${provider.provider_name} before subscribing.`));
    } else if (info?.note) {
        body.appendChild(wEl("p", "svc-note", info.note));
    } else {
        body.appendChild(wEl("p", "svc-note", `Pricing varies by plan and region - ${provider.provider_name} shows the current price before you pay.`));
    }

    // actions
    const actions = wEl("div", "svc-actions");
    const primary = document.createElement("a");
    primary.className = "wbtn";
    primary.target = "_blank";
    primary.rel = "noopener";
    if (info) {
        primary.href = info.url(q);
        primary.textContent = `Open ${provider.provider_name}`;
    } else {
        primary.href = ctx.justwatch || `https://www.justwatch.com/`;
        primary.textContent = `Find ${provider.provider_name} on JustWatch`;
    }
    actions.appendChild(primary);

    if (info && ctx.justwatch) {
        const alt = document.createElement("a");
        alt.className = "wbtn secondary";
        alt.href = ctx.justwatch;
        alt.target = "_blank";
        alt.rel = "noopener";
        alt.textContent = "See every way to watch";
        actions.appendChild(alt);
    }
    body.appendChild(actions);
    body.appendChild(wEl("p", "svc-note", "If the app is installed, your device opens it; otherwise the website opens."));
}

/* ---------- In cinemas ---------- */

async function fetchTheatrical(id) {
    try {
        const res = await fetch(`${WATCH_TMDB}/movie/${id}/release_dates?api_key=${API_KEY}`);
        const data = await res.json();
        const region = (data.results || []).find(r => r.iso_3166_1 === watchRegion)
            || (data.results || []).find(r => r.iso_3166_1 === "US");
        const dates = (region?.release_dates || []).filter(r => r.type === 2 || r.type === 3)
            .map(r => (r.release_date || "").slice(0, 10)).filter(Boolean).sort();
        const certification = (region?.release_dates || []).map(r => r.certification).find(Boolean) || "";
        return dates.length ? { date: dates[0], certification } : null;
    } catch {
        return null;
    }
}

function longDate(str) {
    return new Date(`${str}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function theatricalState(info) {
    if (!info) return null;
    const today = typeof localDateString === "function" ? localDateString() : new Date().toISOString().slice(0, 10);
    const ageDays = (new Date(`${today}T00:00:00`) - new Date(`${info.date}T00:00:00`)) / 864e5;
    if (ageDays < 0) return { state: "soon", text: `Coming to cinemas on ${longDate(info.date)}` };
    if (ageDays <= 100) return { state: "now", text: `In cinemas since ${longDate(info.date)}` };
    return null;
}

const miles = watchRegion === "US" || watchRegion === "GB";

function distanceLabel(km) {
    return miles ? `${(km * 0.621371).toFixed(1)} mi` : `${km.toFixed(1)} km`;
}

function haversineKm(lat1, lon1, lat2, lon2) {
    const toRad = d => d * Math.PI / 180;
    const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(a));
}

async function findCinemas(lat, lon) {
    const query = `[out:json][timeout:25];(node["amenity"="cinema"](around:20000,${lat},${lon});way["amenity"="cinema"](around:20000,${lat},${lon}););out center tags 60;`;
    const endpoints = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

    for (const endpoint of endpoints) {
        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: `data=${encodeURIComponent(query)}`
            });
            if (!res.ok) continue;
            const data = await res.json();
            const seen = new Set();
            return (data.elements || [])
                .map(el => {
                    const t = el.tags || {};
                    const clat = el.lat ?? el.center?.lat;
                    const clon = el.lon ?? el.center?.lon;
                    if (!t.name || clat == null) return null;
                    let site = t.website || t["contact:website"] || "";
                    if (site && !/^https?:/i.test(site)) site = `https://${site}`;
                    const address = [t["addr:housenumber"], t["addr:street"], t["addr:city"] || t["addr:town"], t["addr:postcode"]]
                        .filter(Boolean).join(" ");
                    return {
                        name: t.name, site, address,
                        phone: t.phone || t["contact:phone"] || "",
                        km: haversineKm(lat, lon, clat, clon),
                        lat: clat, lon: clon
                    };
                })
                .filter(Boolean)
                .filter(c => !seen.has(c.name.toLowerCase()) && seen.add(c.name.toLowerCase()))
                .sort((a, b) => a.km - b.km)
                .slice(0, 20);
        } catch {
            // try the next server
        }
    }
    return null;
}

async function geocode(text) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(text)}`);
        const data = await res.json();
        return data[0] ? { lat: Number(data[0].lat), lon: Number(data[0].lon), label: data[0].display_name.split(",").slice(0, 2).join(",") } : null;
    } catch {
        return null;
    }
}

function readSavedLocation() {
    try { return JSON.parse(localStorage.getItem("notflix:cinema-loc")); } catch { return null; }
}

let cinemaSheet = null;

function openCinemaSheet(ctx, status) {
    if (!cinemaSheet) cinemaSheet = buildSheet("cinema-modal");
    const body = showSheet(cinemaSheet, "Cinemas");
    const q = encodeURIComponent(ctx.title);

    body.appendChild(wEl("h2", "svc-hero-title", ctx.title)).style.cssText = "margin:4px 0 4px;font-size:22px;text-align:center";
    body.appendChild(wEl("p", "svc-note", status.text)).style.textAlign = "center";

    // honest about what's published where
    const info = wEl("div", "cin-info");
    const price = TICKET_ESTIMATE[watchRegion];
    info.innerHTML = `<b>Showtimes and ticket prices</b> are set by each cinema and shown on its booking page${
        price ? ` (typically ${price}; varies by cinema, time and format)` : ""}. Pick a cinema below to book.`;
    const links = wEl("div", "cin-links");
    [["Showtimes near me", `https://www.google.com/search?q=${q}+showtimes+near+me`],
     ...(watchRegion === "US" ? [["Fandango", `https://www.fandango.com/search?q=${q}`]] : [])]
        .forEach(([label, href]) => {
            const a = wEl("a", "wbtn secondary small", label);
            a.href = href; a.target = "_blank"; a.rel = "noopener";
            links.appendChild(a);
        });
    info.appendChild(links);
    body.appendChild(info);

    // location
    const results = wEl("div", "cin-results");
    const statusLine = wEl("p", "cin-status");

    const loadFor = async (loc, label) => {
        try { localStorage.setItem("notflix:cinema-loc", JSON.stringify({ ...loc, label })); } catch {}
        results.innerHTML = "";
        statusLine.textContent = "Looking for cinemas…";
        const cinemas = await findCinemas(loc.lat, loc.lon);
        if (!cinemas) { statusLine.textContent = "Couldn't load cinemas right now. Try again in a moment."; return; }
        if (!cinemas.length) { statusLine.textContent = "No cinemas found within about 20 km. Try a different town."; return; }
        statusLine.textContent = `${cinemas.length} cinemas near ${label || "you"}`;

        cinemas.forEach(c => {
            const card = wEl("div", "cin-card");
            card.appendChild(wEl("p", "cin-name", c.name));
            card.appendChild(wEl("p", "cin-meta", [distanceLabel(c.km), c.address].filter(Boolean).join(" · ")));
            const actions = wEl("div", "cin-actions");

            const book = wEl("a", "wbtn small", c.site ? "Book tickets" : "Find tickets");
            book.href = c.site || `https://www.google.com/search?q=${encodeURIComponent(`${c.name} ${ctx.title} tickets`)}`;
            book.target = "_blank"; book.rel = "noopener";
            actions.appendChild(book);

            const map = wEl("a", "wbtn secondary small", "Directions");
            map.href = `https://www.openstreetmap.org/directions?to=${c.lat}%2C${c.lon}`;
            map.target = "_blank"; map.rel = "noopener";
            actions.appendChild(map);

            if (c.phone) {
                const call = wEl("a", "wbtn secondary small", "Call");
                call.href = `tel:${c.phone.replace(/[^+\d]/g, "")}`;
                actions.appendChild(call);
            }
            card.appendChild(actions);
            results.appendChild(card);
        });
    };

    const useMine = wEl("button", "wbtn", "Use my location");
    useMine.addEventListener("click", () => {
        if (!navigator.geolocation) { statusLine.textContent = "Location isn't available here - enter a town instead."; return; }
        statusLine.textContent = "Getting your location…";
        navigator.geolocation.getCurrentPosition(
            pos => loadFor({ lat: pos.coords.latitude, lon: pos.coords.longitude }, "you"),
            () => { statusLine.textContent = "Location was blocked - enter a town or postcode instead."; },
            { timeout: 12000 }
        );
    });
    body.appendChild(useMine);

    const row = wEl("div", "cin-input");
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Or enter a town / postcode";
    const go = wEl("button", "wbtn secondary small", "Search");
    const search = async () => {
        const text = input.value.trim();
        if (!text) return;
        statusLine.textContent = "Finding that place…";
        const loc = await geocode(text);
        if (!loc) { statusLine.textContent = "Couldn't find that place."; return; }
        loadFor(loc, loc.label);
    };
    go.addEventListener("click", search);
    input.addEventListener("keydown", e => { if (e.key === "Enter") search(); });
    row.append(input, go);
    body.appendChild(row);

    body.appendChild(statusLine);
    body.appendChild(results);

    // remembered place -> straight to the list
    const saved = readSavedLocation();
    if (saved?.lat != null) loadFor(saved, saved.label);
}

/* ---------- The tab ---------- */

function renderWhereToWatch(id, type) {
    const container = document.getElementById("watch-providers");
    if (!container) return;
    container.innerHTML = `<p class="tab-loading">Loading…</p>`;

    const title = (typeof activeMovieSummary !== "undefined" && activeMovieSummary?.title)
        || document.getElementById("modal-title")?.textContent || "";

    Promise.all([
        fetchProviders(id, type),
        type === "movie" ? fetchTheatrical(id) : Promise.resolve(null)
    ]).then(([providers, theatrical]) => {
        // the tab may have been re-rendered for another title meanwhile
        if (typeof activeMovieId !== "undefined" && String(activeMovieId) !== String(id)) return;
        container.innerHTML = "";

        const ctx = { id, type, title, justwatch: providers?.link || null };

        const cinema = theatricalState(theatrical);
        if (cinema) {
            const card = wEl("div", "wp-cinema");
            card.appendChild(wEl("h4", null, cinema.state === "now" ? "In cinemas" : "Coming to cinemas"));
            card.appendChild(wEl("p", null, cinema.text));
            const btn = wEl("button", "wbtn", "Find cinemas & showtimes");
            btn.addEventListener("click", () => openCinemaSheet(ctx, cinema));
            card.appendChild(btn);
            container.appendChild(card);
        }

        const sections = [
            ["flatrate", "Stream"], ["ads", "Free with ads"], ["free", "Free"], ["rent", "Rent"], ["buy", "Buy"]
        ];
        let any = false;

        sections.forEach(([key, label]) => {
            const list = providers?.[key];
            if (!list?.length) return;
            any = true;

            const section = wEl("div", "wp-section");
            section.appendChild(wEl("h4", "wp-heading", label));
            const grid = wEl("div", "wp-grid");

            [...list].sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99)).forEach(p => {
                const tile = wEl("button", "wp-tile");
                tile.type = "button";
                if (p.logo_path) {
                    const img = document.createElement("img");
                    img.className = "wp-logo";
                    img.alt = "";
                    img.loading = "lazy";
                    img.src = `https://image.tmdb.org/t/p/w92${p.logo_path}`;
                    tile.appendChild(img);
                }
                tile.appendChild(wEl("span", "wp-name", p.provider_name));
                tile.appendChild(wEl("span", "wp-chev", "›"));
                tile.addEventListener("click", () => openServiceSheet(p, key, ctx, providers.regionCode));
                grid.appendChild(tile);
            });
            section.appendChild(grid);
            container.appendChild(section);
        });

        if (!any && !cinema) {
            container.appendChild(wEl("p", "wp-empty",
                "Not available on any streaming service we know of in your region yet."));
        }

        const attrib = wEl("p", "wp-attrib");
        attrib.append("Availability data provided by ");
        const jw = document.createElement("a");
        jw.href = ctx.justwatch || "https://www.justwatch.com/";
        jw.target = "_blank";
        jw.rel = "noopener";
        jw.textContent = "JustWatch";
        attrib.appendChild(jw);
        attrib.append(providers?.regionCode ? ` · region ${providers.regionCode}` : "");
        container.appendChild(attrib);
    });
}
