/* ==========================================================
   NOTIFICATIONS
   - Bell in the header gets a red badge (new since you last opened it)
   - Tapping the bell opens the Notifications sheet
   - Everything is generated on the device from TMDB + what you've done:
       * New arrival ........ movies / shows that just came out
       * Reminders .......... titles you tapped "Remind Me" on (New & Hot):
                              "coming soon" a few days before, "out now" on the day
       * New season/episode . shows you liked or put in My List
       * Don't miss out ..... "Experience more <something you watched/liked>"
       * Picked for you ..... recommendations based on your list/likes
   - Generated notifications are saved, so their dates stay put and a tapped
     one stops showing its red dot.
   Needs state.js (+ mvdata.js / search.js for the movie modal when present).
========================================================== */

/* ---------- Styles (built in, so no separate CSS file has to be linked) ---------- */
const NOTIFICATIONS_CSS = "/* =======================\n   NOTIFICATIONS (bell badge + sheet) - shared by every page\n======================= */\n\n.bell-badge {\n\tposition: absolute;\n\tz-index: 1100;\n\tmin-width: 20px;\n\theight: 20px;\n\tpadding: 0 5px;\n\tbox-sizing: border-box;\n\tborder-radius: 10px;\n\tbackground: #e50914;\n\tcolor: white;\n\tfont: 700 12px/20px Arial, sans-serif;\n\ttext-align: center;\n\tpointer-events: none;\n}\n\n.bell-badge.hidden {\n\tdisplay: none !important;\n}\n\n.notif-modal {\n\tposition: fixed;\n\tinset: 0;\n\tz-index: 5200;\n\tdisplay: flex;\n\tjustify-content: center;\n\talign-items: flex-end;\n\tbackground: rgba(0, 0, 0, 0.7);\n\topacity: 1;\n\ttransition: opacity 0.28s ease, visibility 0s linear 0s;\n}\n\n.notif-modal.hidden {\n\tdisplay: flex !important;\n\tvisibility: hidden;\n\topacity: 0;\n\tpointer-events: none;\n\ttransition: opacity 0.24s ease, visibility 0s linear 0.24s;\n}\n\n.notif-panel {\n\tdisplay: flex;\n\tflex-direction: column;\n\twidth: 100%;\n\tmax-width: 660px;\n\theight: calc(100% - 40px);\n\tbackground: #0a0a0a;\n\tborder-radius: 14px 14px 0 0;\n\toverflow: hidden;\n\ttransform: none;\n\ttransition: transform 0.38s cubic-bezier(0.22, 1, 0.36, 1);\n}\n\n.notif-modal.hidden .notif-panel {\n\ttransform: translateY(100%);\n}\n\n.notif-header {\n\tposition: relative;\n\tdisplay: flex;\n\talign-items: center;\n\tjustify-content: center;\n\tpadding: 18px 16px 14px;\n\tflex-shrink: 0;\n}\n\n.notif-title {\n\tmargin: 0;\n\tfont-size: 22px;\n\tfont-weight: 700;\n}\n\n.notif-close {\n\tposition: absolute;\n\tright: 16px;\n\ttop: 50%;\n\twidth: 36px;\n\theight: 36px;\n\tmargin-top: -18px;\n\tborder: none;\n\tborder-radius: 50%;\n\tbackground: rgba(60, 60, 60, 0.85);\n\tcursor: pointer;\n}\n\n/* CSS-drawn X: no image needed */\n.notif-close::before,\n.notif-close::after {\n\tcontent: \"\";\n\tposition: absolute;\n\tleft: 50%;\n\ttop: 50%;\n\twidth: 16px;\n\theight: 2px;\n\tmargin: -1px 0 0 -8px;\n\tborder-radius: 2px;\n\tbackground: white;\n\ttransform: rotate(45deg);\n}\n\n.notif-close::after {\n\ttransform: rotate(-45deg);\n}\n\n.notif-list {\n\tflex: 1;\n\toverflow-y: auto;\n\toverscroll-behavior: contain;\n\tpadding: 4px 0 40px;\n}\n\n.notif-item {\n\tposition: relative;\n\tdisplay: flex;\n\talign-items: center;\n\tgap: 16px;\n\tpadding: 12px 16px 12px 26px;\n\tcursor: pointer;\n\t-webkit-tap-highlight-color: transparent;\n}\n\n.notif-item:active {\n\tbackground: #151515;\n}\n\n.notif-dot {\n\tposition: absolute;\n\tleft: 9px;\n\ttop: 50%;\n\twidth: 8px;\n\theight: 8px;\n\tmargin-top: -4px;\n\tborder-radius: 50%;\n\tbackground: #e50914;\n}\n\n.notif-thumb {\n\tflex: 0 0 min(36%, 195px);\n\twidth: min(36%, 195px);\n\taspect-ratio: 16 / 9;\n\tobject-fit: cover;\n\tborder-radius: 4px;\n\tbackground: #1c1c1c;\n}\n\n.notif-text {\n\tflex: 1;\n\tmin-width: 0;\n}\n\n.notif-head {\n\tmargin: 0 0 5px;\n\tfont-size: 17px;\n\tfont-weight: 700;\n\tline-height: 1.25;\n}\n\n.notif-body {\n\tmargin: 0 0 5px;\n\tfont-size: 15px;\n\tcolor: #e5e5e5;\n\tline-height: 1.3;\n}\n\n.notif-date {\n\tmargin: 0;\n\tfont-size: 14px;\n\tcolor: #8c8c8c;\n}\n\n.notif-empty {\n\tpadding: 60px 24px;\n\ttext-align: center;\n\tcolor: #a3a3a3;\n\tfont-size: 16px;\n}\n";

(function injectStyles() {
    if (document.getElementById("notifications-styles")) return;
    const style = document.createElement("style");
    style.id = "notifications-styles";
    style.textContent = NOTIFICATIONS_CSS;
    document.head.appendChild(style);
})();


const NOTIF_KEY = "notflix:notifs";
const NOTIF_READ_KEY = "notflix:notifs-read";
const NOTIF_SEEN_KEY = "notflix:notifs-seen";
const NOTIF_CHECKED_KEY = "notflix:notifs-checked";
const NOTIF_MAX = 40;
const NOTIF_REFRESH_MS = 30 * 60 * 1000;
const NOTIF_API = "https://api.themoviedb.org/3";
const NOTIF_IMG = "https://image.tmdb.org/t/p";
const DAY_MS = 24 * 60 * 60 * 1000;

// notifications belong to the current profile (scopedKey comes from state.js)
const nKey = key => (typeof scopedKey === "function" ? scopedKey(key) : key);
const nGet = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(nKey(key))) ?? fallback; } catch { return fallback; }
};
const nSet = (key, value) => {
    try { localStorage.setItem(nKey(key), JSON.stringify(value)); } catch {}
};

function notifKey() {
    return typeof API_KEY !== "undefined" ? API_KEY : null;
}

async function tmdb(path, params = "") {
    const key = notifKey();
    if (!key) return null;
    try {
        const res = await fetch(`${NOTIF_API}${path}?api_key=${key}${params}`);
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
}

/* ---------- Helpers ---------- */

function toSummary(item, type) {
    return {
        id: item.id,
        title: item.title || item.name || "Untitled",
        desc: item.overview || "",
        img: item.backdrop_path ? `${NOTIF_IMG}/w780${item.backdrop_path}` : null,
        poster: item.poster_path ? `${NOTIF_IMG}/w342${item.poster_path}` : null,
        rating: item.vote_average,
        year: (item.release_date || item.first_air_date || "").slice(0, 4),
        type
    };
}

function dayStart(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function parseDay(str) {
    if (!str) return null;
    const d = new Date(`${str}T00:00:00`);
    return isNaN(d) ? null : d.getTime();
}

function daysFromToday(ms) {
    return Math.round((dayStart(ms) - dayStart(Date.now())) / DAY_MS);
}

function shortDate(ms) {
    return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function notifDate(ms) {
    const diff = daysFromToday(ms);
    if (diff >= 0) return diff === 0 ? "Today" : shortDate(ms);
    if (diff === -1) return "Yesterday";
    const d = new Date(ms);
    return d.getFullYear() === new Date().getFullYear()
        ? shortDate(ms)
        : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function userTitles() {
    const seen = new Set();
    const out = [];
    const sources = [
        typeof getRecentlyWatched === "function" ? getRecentlyWatched() : [],
        typeof getLiked === "function" ? getLiked() : [],
        typeof getMyList === "function" ? getMyList() : []
    ];
    sources.flat().forEach(item => {
        if (!item || item.id == null || seen.has(String(item.id))) return;
        seen.add(String(item.id));
        out.push(item);
    });
    return out;
}

/* ---------- Generators (each returns [{ id, head, body, ts, item }]) ---------- */

function remindersNotifs() {
    if (typeof getReminders !== "function") return [];
    const out = [];

    getReminders().forEach(r => {
        const release = parseDay(r.release);
        if (release == null) return;
        const diff = daysFromToday(release);
        const item = { id: r.id, title: r.title, desc: r.desc, img: r.img, poster: r.poster,
            rating: r.rating, year: r.year, type: r.type || "movie" };

        if (diff <= 0 && diff >= -60) {
            out.push({ id: `remind-${r.id}-out`, head: "Reminder", ts: release + 9 * 3600e3,
                body: `${r.title} is out now`, item });
        } else if (diff > 0 && diff <= 3) {
            out.push({ id: `remind-${r.id}-soon`, head: "Coming soon", ts: Date.now(),
                body: diff === 1 ? `${r.title} arrives tomorrow` : `${r.title} arrives in ${diff} days`, item });
        }
    });
    return out;
}

async function seasonNotifs() {
    const shows = userTitles().filter(t => t.type === "tv").slice(0, 10);
    const results = await Promise.all(shows.map(s => tmdb(`/tv/${s.id}`)));
    const out = [];

    results.forEach((data, i) => {
        if (!data) return;
        const item = toSummary(data, "tv");
        const title = item.title;

        const last = data.last_episode_to_air;
        const lastDay = last ? parseDay(last.air_date) : null;
        if (lastDay != null && daysFromToday(lastDay) <= 0 && daysFromToday(lastDay) >= -21) {
            if (last.episode_number === 1) {
                out.push({ id: `season-${data.id}-${last.season_number}`, head: "New season",
                    body: `${title} Season ${last.season_number} is now available`,
                    ts: lastDay + 8 * 3600e3, item });
            } else {
                out.push({ id: `ep-${data.id}-${last.season_number}-${last.episode_number}`, head: "New episode",
                    body: `${title} S${last.season_number}:E${last.episode_number} is now available`,
                    ts: lastDay + 8 * 3600e3, item });
            }
        }

        const next = data.next_episode_to_air;
        const nextDay = next ? parseDay(next.air_date) : null;
        if (next && next.episode_number === 1 && nextDay != null &&
            daysFromToday(nextDay) > 0 && daysFromToday(nextDay) <= 14) {
            out.push({ id: `season-soon-${data.id}-${next.season_number}`, head: "Season coming soon",
                body: `${title} Season ${next.season_number} premieres ${shortDate(nextDay)}`,
                ts: Date.now(), item });
        }
    });
    return out;
}

async function arrivalNotifs() {
    const [movies, shows] = await Promise.all([
        tmdb("/movie/now_playing", "&region=US"),
        tmdb("/tv/airing_today")
    ]);
    const out = [];
    const recent = str => {
        const d = parseDay(str);
        return d != null && daysFromToday(d) <= 0 && daysFromToday(d) >= -14 ? d : null;
    };

    (movies?.results || []).slice(0, 12).forEach(m => {
        const d = recent(m.release_date);
        if (d != null && (m.backdrop_path || m.poster_path)) {
            out.push({ id: `arrival-movie-${m.id}`, head: "New arrival", body: m.title,
                ts: Math.min(Date.now(), d + 12 * 3600e3), item: toSummary(m, "movie") });
        }
    });
    (shows?.results || []).slice(0, 12).forEach(s => {
        const d = recent(s.first_air_date);
        if (d != null && (s.backdrop_path || s.poster_path)) {
            out.push({ id: `arrival-tv-${s.id}`, head: "New arrival", body: s.name,
                ts: Math.min(Date.now(), d + 12 * 3600e3), item: toSummary(s, "tv") });
        }
    });

    return out.sort((a, b) => b.ts - a.ts).slice(0, 6);
}

async function personalNotifs(existing) {
    const seeds = userTitles();
    if (!seeds.length) return [];

    const out = [];
    const day = Math.floor(Date.now() / DAY_MS);
    const week = Math.floor(day / 7);

    // "Don't miss out - Experience more <title>": one per week
    const more = seeds[day % seeds.length];
    out.push({ id: `more-${more.id}-${week}`, head: "Don't miss out",
        body: `Experience more ${more.title}`, ts: Date.now(), item: more });

    // "Picked just for you": a couple of recommendations per day
    const pickedToday = existing.some(n => n.id.startsWith("pick-") && daysFromToday(n.addedAt || n.ts) === 0);
    if (!pickedToday) {
        const owned = new Set(seeds.map(s => String(s.id)));
        const known = new Set(existing.map(n => n.id));
        const chosen = [0, 1, 2].map(i => seeds[(day + i) % seeds.length])
            .filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i);

        for (const seed of chosen) {
            const type = seed.type || "movie";
            const data = await tmdb(`/${type}/${seed.id}/recommendations`);
            const rec = (data?.results || []).find(r =>
                !owned.has(String(r.id)) && !known.has(`pick-${r.id}`) && (r.backdrop_path || r.poster_path));
            if (!rec) continue;

            const anime = (rec.genre_ids || []).includes(16) && rec.original_language === "ja";
            out.push({ id: `pick-${rec.id}`,
                head: anime ? "A top anime title picked just for you" : "Picked just for you",
                body: `Check out ${rec.title || rec.name}`, ts: Date.now(),
                item: toSummary(rec, rec.media_type || type) });
            known.add(`pick-${rec.id}`);
            if (out.filter(n => n.id.startsWith("pick-")).length >= 2) break;
        }
    }
    return out;
}

/* ---------- Store ---------- */

let refreshing = null;

function mergeNotifs(fresh) {
    const stored = nGet(NOTIF_KEY, []);
    const byId = new Map(stored.map(n => [n.id, n]));
    const now = Date.now();

    fresh.forEach(n => {
        const old = byId.get(n.id);
        // keep the first-seen time/text so a notification doesn't change under you
        byId.set(n.id, old ? { ...n, addedAt: old.addedAt, ts: old.ts, body: old.body } : { ...n, addedAt: now });
    });

    const merged = [...byId.values()].sort((a, b) => b.ts - a.ts).slice(0, NOTIF_MAX);
    nSet(NOTIF_KEY, merged);
    return merged;
}

function refreshNotifications({ onlyReminders = false } = {}) {
    if (refreshing && !onlyReminders) return refreshing;

    const job = (async () => {
        const stored = nGet(NOTIF_KEY, []);
        let fresh = [];

        if (onlyReminders) {
            fresh = remindersNotifs();
        } else {
            const parts = await Promise.allSettled([
                Promise.resolve(remindersNotifs()),
                seasonNotifs(),
                arrivalNotifs(),
                personalNotifs(stored)
            ]);
            parts.forEach(p => { if (p.status === "fulfilled") fresh.push(...p.value); });
            nSet(NOTIF_CHECKED_KEY, Date.now());
        }

        mergeNotifs(fresh);
        updateBadge();
        if (isNotifOpen()) renderNotifs();
    })().finally(() => { if (!onlyReminders) refreshing = null; });

    if (!onlyReminders) refreshing = job;
    return job;
}

/* ---------- UI ---------- */

let notifModal = null;

function unreadSet() {
    return new Set(nGet(NOTIF_READ_KEY, []));
}

// notifications for titles this profile isn't allowed to see (viewing
// restrictions / Kids) are hidden
function visibleNotifs() {
    const all = nGet(NOTIF_KEY, []);
    return typeof isAllowedCached === "function" ? all.filter(n => isAllowedCached(n.item)) : all;
}

function badgeCount() {
    const read = unreadSet();
    const seen = nGet(NOTIF_SEEN_KEY, 0);
    return visibleNotifs().filter(n => !read.has(n.id) && (n.addedAt || 0) > seen).length;
}

function updateBadge() {
    const count = badgeCount();
    document.querySelectorAll(".bell-badge").forEach(badge => {
        badge.textContent = count > 99 ? "99+" : String(count);
        badge.classList.toggle("hidden", count === 0);
    });
}

function isNotifOpen() {
    return !!notifModal && !notifModal.classList.contains("hidden");
}

function buildNotifModal() {
    const modal = document.createElement("div");
    modal.className = "notif-modal hidden";
    modal.id = "notif-modal";
    modal.innerHTML = `
        <div class="notif-panel" role="dialog" aria-label="Notifications">
            <div class="notif-header">
                <h3 class="notif-title">Notifications</h3>
                <button class="notif-close" id="notif-close" aria-label="Close"></button>
            </div>
            <div class="notif-list" id="notif-list"></div>
        </div>`;
    document.body.appendChild(modal);

    modal.addEventListener("click", e => { if (e.target === modal) closeNotifs(); });
    modal.querySelector("#notif-close").addEventListener("click", closeNotifs);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && isNotifOpen()) closeNotifs(); });
    return modal;
}

function openFromNotification(item) {
    if (typeof openModal === "function") {
        openModal({ id: item.id, title: item.title, desc: item.desc || "", img: item.img,
            poster: item.poster, rating: item.rating, year: item.year, type: item.type || "movie" });
    } else {
        // pages without the movie modal (New & Hot) hand off to Home
        window.location.href = `home.html?open=${item.type || "movie"}-${item.id}`;
    }
}

function renderNotifs() {
    const list = document.getElementById("notif-list");
    if (!list) return;
    list.innerHTML = "";

    const items = visibleNotifs();
    if (!items.length) {
        const msg = document.createElement("p");
        msg.className = "notif-empty";
        msg.textContent = refreshing ? "Checking for updates…" : "You're all caught up.";
        list.appendChild(msg);
        return;
    }

    const read = unreadSet();
    items.forEach(n => {
        const row = document.createElement("div");
        row.className = "notif-item";

        if (!read.has(n.id)) {
            const dot = document.createElement("span");
            dot.className = "notif-dot";
            row.appendChild(dot);
        }

        const thumb = document.createElement("img");
        thumb.className = "notif-thumb";
        thumb.alt = "";
        thumb.loading = "lazy";
        thumb.src = n.item.img || n.item.poster || "";
        row.appendChild(thumb);

        const text = document.createElement("div");
        text.className = "notif-text";
        [["notif-head", n.head], ["notif-body", n.body], ["notif-date", notifDate(n.ts)]].forEach(([cls, value]) => {
            const p = document.createElement("p");
            p.className = cls;
            p.textContent = value;
            text.appendChild(p);
        });
        row.appendChild(text);

        row.addEventListener("click", () => {
            const r = unreadSet();
            r.add(n.id);
            nSet(NOTIF_READ_KEY, [...r]);
            updateBadge();
            closeNotifs();
            openFromNotification(n.item);
        });
        list.appendChild(row);
    });
}

function openNotifs() {
    if (!notifModal) notifModal = buildNotifModal();
    renderNotifs();
    void notifModal.offsetHeight; // commit the hidden state first so the open animates
    notifModal.classList.remove("hidden");

    nSet(NOTIF_SEEN_KEY, Date.now()); // clears the badge, red dots stay until tapped
    updateBadge();

    if (Date.now() - nGet(NOTIF_CHECKED_KEY, 0) > 5 * 60 * 1000) refreshNotifications();
}

function closeNotifs() {
    notifModal?.classList.add("hidden");
}

function setupBell() {
    document.querySelectorAll('img[src*="header/notifications.png"]').forEach(img => {
        if (img.dataset.bell) return;
        img.dataset.bell = "1";

        // The icon stays exactly where the page's own header CSS put it (no
        // wrapper), only the red badge is added next to it.
        img.style.cursor = "pointer";
        img.setAttribute("role", "button");
        img.setAttribute("tabindex", "0");
        img.setAttribute("aria-label", "Notifications");
        img.addEventListener("click", openNotifs);
        img.addEventListener("keydown", e => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openNotifs(); }
        });

        const badge = document.createElement("span");
        badge.className = "bell-badge hidden";

        // anchor the badge to the nearest positioned ancestor (the fixed header)
        let anchor = img.parentElement;
        while (anchor && anchor !== document.body && getComputedStyle(anchor).position === "static") {
            anchor = anchor.parentElement;
        }
        const onBody = !anchor || anchor === document.body;
        if (onBody) badge.style.position = "fixed";
        (onBody ? document.body : anchor).appendChild(badge);

        const place = () => {
            const a = onBody ? { left: 0, top: 0 } : anchor.getBoundingClientRect();
            const r = img.getBoundingClientRect();
            badge.style.left = `${Math.round(r.right - a.left - 12)}px`;
            badge.style.top = `${Math.round(r.top - a.top - 8)}px`;
        };

        place();
        let frames = 0;
        const settle = () => { place(); if (++frames < 40) requestAnimationFrame(settle); };
        requestAnimationFrame(settle); // layout/fonts/images are still settling at load

        window.addEventListener("resize", place);
        window.addEventListener("orientationchange", () => setTimeout(place, 250));
        window.addEventListener("load", place);
        img.addEventListener("load", place);
        document.addEventListener("transitionend", place, true);
        if (typeof ResizeObserver === "function") {
            const ro = new ResizeObserver(place);
            ro.observe(img);
            if (!onBody) ro.observe(anchor);
        }
    });
    updateBadge();
}

// ?open=movie-123 (from a notification tapped on a page without the modal)
async function openFromQuery() {
    const match = /[?&]open=(movie|tv)-(\d+)/.exec(location.search);
    if (!match || typeof openModal !== "function") return;

    history.replaceState(null, "", location.pathname);
    const data = await tmdb(`/${match[1]}/${match[2]}`);
    if (data) openFromNotification(toSummary(data, match[1]));
}

(function initNotifications() {
    setupBell();
    notifModal = buildNotifModal(); // built up-front (hidden) so the first open animates too

    if (Date.now() - nGet(NOTIF_CHECKED_KEY, 0) > NOTIF_REFRESH_MS || !nGet(NOTIF_KEY, []).length) {
        refreshNotifications();
    }

    // Setting / clearing a reminder updates its notification straight away
    let reminderTimer = null;
    document.addEventListener("notflix:state", () => {
        clearTimeout(reminderTimer);
        reminderTimer = setTimeout(() => refreshNotifications({ onlyReminders: true }), 400);
    });

    openFromQuery();
})();
