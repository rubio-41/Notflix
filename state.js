/* ==========================================================
   SHARED CLIENT-SIDE STATE
   Small localStorage-backed helpers reused across every page:
   - "My List": titles the user has explicitly added from a modal
   - "Recently Watched": titles whose trailer has actually played
   - scroll locking on the page behind an open modal/overlay
   Loaded before mvdata.js / search.js / profile.js on every page
   that needs any of this.
========================================================== */

const MYLIST_KEY = "notflix:mylist";
const RECENT_KEY = "notflix:recentlywatched";
const RECENT_LIMIT = 12;
const LIKED_KEY = "notflix:liked";

// Pages (e.g. Profile) listen for this to re-render when saved lists change.
function emitStateChange() {
    document.dispatchEvent(new CustomEvent("notflix:state"));
}

/* ---------- Profiles ----------
   Several people can use the site. The profile you pick on the login page is
   the "current profile" and gets its own My List, Liked, Recently Watched,
   reminders and notifications (keys get an "@<profile id>" suffix).
   The profile marked legacy:true keeps the original un-suffixed keys, so
   everything saved before profiles existed still belongs to it. */

const PROFILES_KEY = "notflix:profiles";
const CURRENT_PROFILE_KEY = "notflix:current-profile";

const AVATARS = [
    "media/icons/login/login-blue.jpeg",
    "media/icons/login/login-red.jpeg",
    "media/icons/login/login-yellow.jpeg",
    "media/icons/login/login-teal.jpeg",
    "media/icons/login/login-green.jpeg"
];

const PROFILE_DEFAULTS = {
    kids: false, handle: "", restriction: "No restrictions", lock: "",
    language: "en-US", audioLang: "English", subtitleLang: "en",
    autoplayNext: true, autoplayPreviews: true
};

const MAX_PROFILES = 5;

// First run: a single profile called "User" (add more from the login page)
function seedProfiles() {
    return [{ ...PROFILE_DEFAULTS, id: "user", name: "User", avatar: AVATARS[0], legacy: true }];
}

// Earlier builds seeded five demo profiles (Dennis, Eden, Apex, YumYum, Mama).
// If that untouched set is found, collapse it to one "User" profile that keeps
// the saved data of the old main profile (YumYum).
function collapseOldDemoProfiles(list) {
    const ids = list.map(p => p.id).join(",");
    const names = list.map(p => p.name).join(",");
    if (ids !== "dennis,eden,apex,yumyum,mama" || names !== "Dennis,Eden,Apex,YumYum,Mama") return null;
    if (list.some(p => p.lock)) return null;

    const main = list.find(p => p.id === "yumyum");
    return [{ ...PROFILE_DEFAULTS, ...main, name: "User", avatar: AVATARS[0], handle: "", legacy: true }];
}

function getProfiles() {
    try {
        const list = JSON.parse(localStorage.getItem(PROFILES_KEY));
        if (Array.isArray(list) && list.length) {
            const collapsed = collapseOldDemoProfiles(list);
            if (collapsed) {
                saveProfiles(collapsed);
                return collapsed;
            }
            return list;
        }
    } catch {}
    const seeded = seedProfiles();
    saveProfiles(seeded);
    return seeded;
}

function saveProfiles(list) {
    try { localStorage.setItem(PROFILES_KEY, JSON.stringify(list)); } catch {}
}

function currentProfile() {
    const list = getProfiles();
    let id = null;
    try { id = localStorage.getItem(CURRENT_PROFILE_KEY); } catch {}
    return list.find(p => p.id === id) || list.find(p => p.legacy) || list[0];
}

function setCurrentProfile(id) {
    try { localStorage.setItem(CURRENT_PROFILE_KEY, id); } catch {}
}

function profileSetting(name, fallback) {
    const p = currentProfile();
    return p && p[name] !== undefined ? p[name] : fallback;
}

// Storage key for data that belongs to the current profile
function scopedKey(key) {
    const p = currentProfile();
    return p && !p.legacy ? `${key}@${p.id}` : key;
}

const PROFILE_SCOPED_KEYS = new Set(["notflix:mylist", "notflix:recentlywatched", "notflix:liked", "notflix:reminders"]);

function readList(key) {
    try {
        const raw = localStorage.getItem(PROFILE_SCOPED_KEYS.has(key) ? scopedKey(key) : key);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function writeList(key, list) {
    try {
        localStorage.setItem(PROFILE_SCOPED_KEYS.has(key) ? scopedKey(key) : key, JSON.stringify(list));
    } catch {
        // storage unavailable/full - fail quietly, nothing else depends on it
    }
}

/* ---------- My List ---------- */

function getMyList() {
    return readList(MYLIST_KEY);
}

function isInMyList(id) {
    return getMyList().some(item => String(item.id) === String(id));
}

// Adds/removes the given movie summary ({id, title, img, rating, year}).
// Returns true if it's now in the list, false if it was just removed.
function toggleMyList(movie) {
    const list = getMyList();
    const idx = list.findIndex(item => String(item.id) === String(movie.id));

    if (idx === -1) {
        list.unshift({ ...movie, addedAt: Date.now() });
        writeList(MYLIST_KEY, list);
        emitStateChange();
        return true;
    }

    list.splice(idx, 1);
    writeList(MYLIST_KEY, list);
    emitStateChange();
    return false;
}

/* ---------- Liked (the "Rate" thumb in the modal) ---------- */

function getLiked() {
    return readList(LIKED_KEY);
}

function isLiked(id) {
    return getLiked().some(item => String(item.id) === String(id));
}

// Likes/unlikes the given movie summary. Returns true if it's now liked.
function toggleLiked(movie) {
    const list = getLiked();
    const idx = list.findIndex(item => String(item.id) === String(movie.id));

    if (idx === -1) {
        list.unshift({ ...movie, likedAt: Date.now() });
        writeList(LIKED_KEY, list);
        emitStateChange();
        return true;
    }

    list.splice(idx, 1);
    writeList(LIKED_KEY, list);
    emitStateChange();
    return false;
}

/* ---------- Recently Watched (trailer actually played) ---------- */

// "Clear" on the Profile page: empties Recently Viewed for the current profile
function clearRecentlyWatched() {
    writeList(RECENT_KEY, []);
    emitStateChange();
}

function getRecentlyWatched() {
    return readList(RECENT_KEY);
}

function addRecentlyWatched(movie) {
    if (!movie || movie.id == null) return;

    let list = getRecentlyWatched().filter(item => String(item.id) !== String(movie.id));
    list.unshift({ ...movie, watchedAt: Date.now() });
    if (list.length > RECENT_LIMIT) list = list.slice(0, RECENT_LIMIT);

    writeList(RECENT_KEY, list);
    emitStateChange();
}

/* ---------- Scroll locking while a modal/overlay is open ---------- */
/* Toggle a class rather than writing inline styles so pages can adjust
   the exact behaviour (see .modal-open in css/general.css) in one place. */

/* The page behind an overlay must never move. Instead of relying on
   callers to pair lockScroll()/unlockScroll() correctly, the lock is derived
   from the DOM: while ANY overlay is visible the body is pinned
   (position: fixed) and restored to the same scroll offset afterwards.
   lockScroll()/unlockScroll() still exist (existing code calls them) - they
   just ask for a re-check. */

const OVERLAY_SELECTOR = [
    ".modal", ".modal-subview", ".fullscreen-view", ".sheet",
    ".miniplayer", ".modal-overlay", ".notif-modal", ".pe-modal", ".pin-modal", ".bio-modal", ".wsheet"
].map(sel => `${sel}:not(.hidden)`).join(",");

let pinnedScrollY = null;

function syncScrollLock() {
    const shouldLock = !!document.querySelector(OVERLAY_SELECTOR);
    const body = document.body;

    if (shouldLock && pinnedScrollY === null) {
        pinnedScrollY = window.scrollY;
        body.style.position = "fixed";
        body.style.top = `-${pinnedScrollY}px`;
        body.style.left = "0";
        body.style.right = "0";
        body.classList.add("modal-open");
    } else if (!shouldLock && pinnedScrollY !== null) {
        const y = pinnedScrollY;
        pinnedScrollY = null;
        body.classList.remove("modal-open");
        body.style.position = "";
        body.style.top = "";
        body.style.left = "";
        body.style.right = "";
        window.scrollTo({ top: y, left: 0, behavior: "instant" });
    }
}

let scrollSyncQueued = false;
function queueScrollSync() {
    if (scrollSyncQueued) return;
    scrollSyncQueued = true;
    requestAnimationFrame(() => {
        scrollSyncQueued = false;
        syncScrollLock();
    });
}

function lockScroll() { queueScrollSync(); }
function unlockScroll() { queueScrollSync(); }

// Overlays are never display:none any more (so they can animate), which
// means a closed one keeps its old scroll position - reset it on open.
const SCROLLERS = ".expanded-modal, .subview-body, .ml-list, .bts-body, .notif-list, .sheet-panel, .pe-body";

new MutationObserver(mutations => {
    for (const m of mutations) {
        const el = m.target;
        if (!(el instanceof Element)) continue;
        const wasHidden = (m.oldValue || "").split(/\s+/).includes("hidden");
        if (wasHidden && !el.classList.contains("hidden") && el.matches(OVERLAY_SELECTOR)) {
            el.scrollTop = 0;
            el.querySelectorAll(SCROLLERS).forEach(sc => { sc.scrollTop = 0; });
        }
    }
    queueScrollSync();
}).observe(document.documentElement, {
    attributes: true, attributeFilter: ["class"], attributeOldValue: true, subtree: true
});

// iOS still lets a drag on the dimmed backdrop (or a non-scrolling panel)
// nudge the page. While an overlay is open, only allow a touch to move if it
// starts inside something that can actually scroll.
document.addEventListener("touchmove", e => {
    if (pinnedScrollY === null) return;

    for (let node = e.target; node && node !== document.body; node = node.parentElement) {
        if (!(node instanceof Element)) continue;
        const style = getComputedStyle(node);
        const scrollsY = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight;
        const scrollsX = /(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth;
        if (scrollsY || scrollsX) return;
    }
    e.preventDefault();
}, { passive: false });

syncScrollLock();


/* ---------- Reminders ("Remind Me" on the New & Hot page) ---------- */

const REMINDERS_KEY = "notflix:reminders";

function getReminders() {
    return readList(REMINDERS_KEY);
}

function isReminded(id) {
    return getReminders().some(r => String(r.id) === String(id));
}

// Sets/clears a reminder. Returns true if one is now set.
function toggleReminder(item) {
    const list = getReminders();
    const idx = list.findIndex(r => String(r.id) === String(item.id));

    if (idx === -1) {
        list.unshift({ ...item, remindedAt: Date.now() });
        writeList(REMINDERS_KEY, list);
        emitStateChange();
        return true;
    }

    list.splice(idx, 1);
    writeList(REMINDERS_KEY, list);
    emitStateChange();
    return false;
}


/* ---------- Poster lookup ----------
   Rows on Home use TMDB's poster (the one with the title logo on it), but
   the modal only receives the wide backdrop. Saved titles (My List /
   Recently Watched) therefore keep a separate `poster`, looked up here
   once per title and cached so profile cards match the Home rows. */

const POSTER_CACHE_KEY = "notflix:posters";

function readPosterCache() {
    try { return JSON.parse(localStorage.getItem(POSTER_CACHE_KEY)) || {}; } catch { return {}; }
}

async function fetchPosterUrl(id, type = "movie") {
    if (id == null) return null;
    const key = `${type}:${id}`;
    const cache = readPosterCache();
    if (cache[key]) return cache[key];
    if (typeof API_KEY === "undefined") return null;

    try {
        const res = await fetch(`https://api.themoviedb.org/3/${type}/${id}?api_key=${API_KEY}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.poster_path) return null;
        const url = `https://image.tmdb.org/t/p/w342${data.poster_path}`;
        cache[key] = url;
        try { localStorage.setItem(POSTER_CACHE_KEY, JSON.stringify(cache)); } catch {}
        return url;
    } catch {
        return null;
    }
}
