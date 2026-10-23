/* ==========================================================
   PROFILES - shared by the login page and the Profile page
   - openProfileEditor({ mode: "add" | "edit", profile })  Add / Edit modal
   - requirePin(profile) -> Promise<boolean>              profile lock prompt
   - Display language: TMDB requests get &language=xx for the current profile
   Needs state.js (profile storage). Load it right after state.js so the
   language setting is in place before the page starts fetching.
========================================================== */

/* ---------- Styles (built in, so no separate CSS file has to be linked) ---------- */
const PROFILES_CSS = "/* =======================\n   PROFILES - Add / Edit modal, PIN prompt, login tiles\n   Shared by the login page and the Profile page.\n======================= */\n\n/* ---------- Add / Edit modal ---------- */\n.pe-modal,\n.pin-modal {\n\tposition: fixed;\n\tinset: 0;\n\tdisplay: flex;\n\talign-items: center;\n\tjustify-content: center;\n\tbackground: rgba(0, 0, 0, 0.74);\n\t-webkit-backdrop-filter: blur(6px);\n\tbackdrop-filter: blur(6px);\n\topacity: 1;\n\ttransition: opacity 0.28s ease, visibility 0s linear 0s;\n}\n\n.pe-modal { z-index: 6000; }\n.pin-modal { z-index: 6500; }\n\n.pe-modal.hidden,\n.pin-modal.hidden {\n\tdisplay: flex !important;\n\tvisibility: hidden;\n\topacity: 0;\n\tpointer-events: none;\n\ttransition: opacity 0.24s ease, visibility 0s linear 0.24s;\n}\n\n.pe-panel {\n\tposition: relative;\n\tdisplay: flex;\n\tflex-direction: column;\n\twidth: min(100%, 664px);\n\tmax-height: calc(100% - 64px);\n\tbackground: #1a1a1a;\n\tborder-radius: 16px;\n\toverflow: hidden;\n\ttransform: none;\n\ttransition: transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);\n}\n\n.pe-modal.hidden .pe-panel {\n\ttransform: translateY(40px) scale(0.97);\n}\n\n.pe-page {\n\tdisplay: flex;\n\tflex-direction: column;\n\tflex: 1;\n\tmin-height: 0;\n}\n\n.pe-page.hidden {\n\tdisplay: none !important;\n}\n\n.pe-header {\n\tdisplay: flex;\n\talign-items: center;\n\tjustify-content: space-between;\n\tgap: 8px;\n\tpadding: 18px 20px 10px;\n\tflex-shrink: 0;\n}\n\n.pe-title {\n\tflex: 1;\n\tmargin: 0;\n\ttext-align: center;\n\tfont-size: 22px;\n\tfont-weight: 700;\n}\n\n.pe-link {\n\tmin-width: 64px;\n\tpadding: 6px 4px;\n\tbackground: none;\n\tborder: none;\n\tcolor: white;\n\tfont-size: 17px;\n\tfont-family: inherit;\n\ttext-align: left;\n\tcursor: pointer;\n}\n\n.pe-link.strong {\n\tfont-weight: 700;\n\ttext-align: right;\n}\n\n.pe-link.disabled {\n\topacity: 0.4;\n\tpointer-events: none;\n}\n\n.pe-body {\n\tflex: 1;\n\toverflow-y: auto;\n\toverscroll-behavior: contain;\n\tpadding: 10px 24px 28px;\n}\n\n.pe-avatar-wrap {\n\tposition: relative;\n\twidth: 132px;\n\theight: 132px;\n\tmargin: 10px auto 30px;\n}\n\n.pe-avatar {\n\tdisplay: block;\n\twidth: 100%;\n\theight: 100%;\n\tborder-radius: 18px;\n\tobject-fit: cover;\n\tcursor: pointer;\n}\n\n.pe-pencil {\n\tposition: absolute;\n\tright: -18px;\n\tbottom: -18px;\n\tdisplay: flex;\n\talign-items: center;\n\tjustify-content: center;\n\twidth: 44px;\n\theight: 44px;\n\tbackground: white;\n\tborder: none;\n\tborder-radius: 50%;\n\tcursor: pointer;\n\tbox-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);\n}\n\n.pe-pencil svg {\n\twidth: 22px;\n\theight: 22px;\n\tfill: none;\n\tstroke: #111;\n\tstroke-width: 1.8;\n\tstroke-linecap: round;\n\tstroke-linejoin: round;\n}\n\n.pe-field {\n\tdisplay: block;\n\tmargin: 0 0 26px;\n\tpadding: 10px 18px 12px;\n\tborder: 2px solid rgba(255, 255, 255, 0.75);\n\tborder-radius: 14px;\n}\n\n.pe-field:focus-within {\n\tborder-color: white;\n}\n\n.pe-field-label {\n\tdisplay: block;\n\tmargin-bottom: 2px;\n\tfont-size: 14px;\n\tcolor: #a3a3a3;\n}\n\n.pe-field input {\n\twidth: 100%;\n\tpadding: 0;\n\tbackground: none;\n\tborder: none;\n\toutline: none;\n\tcolor: white;\n\tfont-size: 22px;\n\tfont-family: inherit;\n}\n\n.pe-kids {\n\ttext-align: center;\n}\n\n.pe-kids .pe-switch {\n\tmargin: 0 auto;\n}\n\n.pe-kids h4 {\n\tmargin: 18px 0 6px;\n\tfont-size: 18px;\n}\n\n.pe-kids p {\n\tmax-width: 300px;\n\tmargin: 0 auto;\n\tfont-size: 15px;\n\tline-height: 1.35;\n\tcolor: #c8c8c8;\n}\n\n.pe-switch {\n\tposition: relative;\n\tflex: 0 0 auto;\n\tdisplay: block;\n\twidth: 58px;\n\theight: 34px;\n\tbackground: #4a4a4c;\n\tborder: none;\n\tborder-radius: 17px;\n\tcursor: pointer;\n\ttransition: background 0.2s ease;\n}\n\n.pe-switch.on {\n\tbackground: #3d5afe;\n}\n\n.pe-knob {\n\tposition: absolute;\n\ttop: 3px;\n\tleft: 3px;\n\twidth: 28px;\n\theight: 28px;\n\tbackground: white;\n\tborder-radius: 50%;\n\ttransition: transform 0.2s ease;\n}\n\n.pe-switch.on .pe-knob {\n\ttransform: translateX(24px);\n}\n\n.pe-rows {\n\tdisplay: flex;\n\tflex-direction: column;\n\tgap: 12px;\n}\n\n.pe-row {\n\tdisplay: flex;\n\talign-items: center;\n\tgap: 16px;\n\twidth: 100%;\n\tpadding: 18px 16px;\n\tbackground: #262626;\n\tborder: none;\n\tborder-radius: 12px;\n\tcolor: white;\n\tfont-family: inherit;\n\ttext-align: left;\n\tcursor: pointer;\n}\n\n.pe-row.static {\n\tcursor: default;\n}\n\n.pe-row-icon {\n\tflex: 0 0 28px;\n\tdisplay: flex;\n}\n\n.pe-row-icon svg {\n\twidth: 28px;\n\theight: 28px;\n\tfill: none;\n\tstroke: white;\n\tstroke-width: 1.6;\n\tstroke-linecap: round;\n\tstroke-linejoin: round;\n}\n\n.pe-row-text {\n\tflex: 1;\n\tdisplay: flex;\n\tflex-direction: column;\n\tgap: 3px;\n\tmin-width: 0;\n}\n\n.pe-row-text strong {\n\tfont-size: 19px;\n\tfont-weight: 600;\n}\n\n.pe-row-text small {\n\tfont-size: 15px;\n\tcolor: #b3b3b3;\n}\n\n.pe-chevron {\n\tfont-size: 30px;\n\tline-height: 1;\n\tcolor: #c8c8c8;\n}\n\n.pe-tick {\n\twidth: 24px;\n\tfont-size: 20px;\n\tcolor: white;\n}\n\n.pe-footnote {\n\tmargin: 22px 0 4px;\n\ttext-align: center;\n\tfont-size: 15px;\n\tcolor: #9a9a9a;\n}\n\n.pe-delete {\n\tdisplay: block;\n\tmargin: 18px auto 0;\n\tbackground: none;\n\tborder: none;\n\tcolor: #ff5a5f;\n\tfont-size: 17px;\n\tfont-weight: 600;\n\tfont-family: inherit;\n\tcursor: pointer;\n}\n\n.pe-section {\n\tmargin: 18px 4px 8px;\n\tfont-size: 14px;\n\tfont-weight: 600;\n\tletter-spacing: 0.6px;\n\ttext-transform: uppercase;\n\tcolor: #a3a3a3;\n}\n\n.pe-help {\n\tmargin: 6px 4px 20px;\n\tfont-size: 15px;\n\tline-height: 1.4;\n\tcolor: #c8c8c8;\n}\n\n.pe-avatar-grid {\n\tdisplay: grid;\n\tgrid-template-columns: repeat(3, 1fr);\n\tgap: 18px;\n\tjustify-items: center;\n\tpadding-top: 10px;\n}\n\n.pe-avatar-option {\n\twidth: 96px;\n\theight: 96px;\n\tpadding: 0;\n\tbackground: none;\n\tborder: 3px solid transparent;\n\tborder-radius: 20px;\n\toverflow: hidden;\n\tcursor: pointer;\n}\n\n.pe-avatar-option.selected {\n\tborder-color: white;\n}\n\n.pe-avatar-option img {\n\tdisplay: block;\n\twidth: 100%;\n\theight: 100%;\n\tborder-radius: 15px;\n\tobject-fit: cover;\n}\n\n/* Phones: full screen, like the iPhone Add Profile screen */\n@media (max-width: 600px) {\n\t.pe-modal {\n\t\talign-items: stretch;\n\t}\n\n\t.pe-panel {\n\t\twidth: 100%;\n\t\tmax-height: none;\n\t\theight: 100%;\n\t\tborder-radius: 0;\n\t\tbackground: #141414;\n\t}\n\n\t.pe-header {\n\t\tpadding-top: max(env(safe-area-inset-top), 18px);\n\t}\n\n\t.pe-modal.hidden .pe-panel {\n\t\ttransform: translateY(60px);\n\t}\n}\n\n/* ---------- PIN prompt ---------- */\n.pin-panel {\n\twidth: min(86%, 360px);\n\tpadding: 26px 22px 14px;\n\tbackground: #1a1a1a;\n\tborder-radius: 16px;\n\ttext-align: center;\n\ttransform: none;\n\ttransition: transform 0.34s cubic-bezier(0.22, 1, 0.36, 1);\n}\n\n.pin-modal.hidden .pin-panel {\n\ttransform: scale(0.94);\n}\n\n.pin-title {\n\tmargin: 0 0 6px;\n\tfont-size: 22px;\n}\n\n.pin-sub {\n\tmargin: 0 0 20px;\n\tfont-size: 15px;\n\tcolor: #bdbdbd;\n}\n\n.pin-dots {\n\tdisplay: none;\n}\n\n.pin-input {\n\twidth: 100%;\n\tbox-sizing: border-box;\n\tpadding: 12px;\n\tbackground: #262626;\n\tborder: 2px solid transparent;\n\tborder-radius: 12px;\n\toutline: none;\n\tcolor: white;\n\tfont-size: 26px;\n\tletter-spacing: 14px;\n\ttext-align: center;\n\ttext-indent: 14px;\n}\n\n.pin-input:focus {\n\tborder-color: rgba(255, 255, 255, 0.7);\n}\n\n.pin-error {\n\tmin-height: 20px;\n\tmargin: 10px 0 6px;\n\tfont-size: 14px;\n\tcolor: #ff6b6b;\n}\n\n.pin-cancel {\n\tdisplay: block;\n\tmargin: 0 auto;\n\ttext-align: center;\n}\n\n.pin-panel.shake {\n\tanimation: pinShake 0.35s;\n}\n\n@keyframes pinShake {\n\t20%, 60% { transform: translateX(-8px); }\n\t40%, 80% { transform: translateX(8px); }\n}\n\n/* ---------- Login page tiles ---------- */\n.avatar.plus {\n\tdisplay: flex;\n\talign-items: center;\n\tjustify-content: center;\n\tbackground: #2f2f33;\n}\n\n.avatar.plus.has-img::before {\n\tdisplay: none;\n}\n\n.avatar.plus::before {\n\tcontent: \"+\";\n\tfont-size: 52px;\n\tline-height: 1;\n\tcolor: white;\n}\n\n.avatar.managing::after {\n\tcontent: \"\";\n\tposition: absolute;\n\tinset: 0;\n\tbackground: rgba(0, 0, 0, 0.5);\n}\n\n.avatar-pencil {\n\tposition: absolute;\n\tleft: 50%;\n\ttop: 50%;\n\tz-index: 2;\n\twidth: 34px;\n\theight: 34px;\n\tmargin: -17px 0 0 -17px;\n\tfill: none;\n\tstroke: white;\n\tstroke-width: 1.8;\n\tstroke-linecap: round;\n\tstroke-linejoin: round;\n}\n\n.profile-link {\n\tdisplay: flex;\n\tflex-direction: column;\n\talign-items: center;\n\ttext-decoration: none;\n}\n\n.kids-badge {\n\tposition: absolute;\n\tleft: 6px;\n\tbottom: 6px;\n\tz-index: 2;\n\tpadding: 2px 7px;\n\tfont-size: 11px;\n\tfont-weight: 800;\n\tletter-spacing: 0.5px;\n\tborder-radius: 6px;\n\tbackground: #ffd400;\n\tcolor: #111;\n}\n\n.lock-badge {\n\tposition: absolute;\n\tright: 6px;\n\tbottom: 6px;\n\tz-index: 2;\n\tpadding: 3px 6px;\n\tfont-size: 11px;\n\tborder-radius: 6px;\n\tbackground: rgba(0, 0, 0, 0.65);\n\tcolor: white;\n}\n\n@media (prefers-reduced-motion: reduce) {\n\t.pe-modal, .pin-modal, .pe-panel, .pin-panel {\n\t\ttransition-duration: 0.01s !important;\n\t\ttransition-delay: 0s !important;\n\t}\n}\n";

(function injectStyles() {
    if (document.getElementById("profiles-styles")) return;
    const style = document.createElement("style");
    style.id = "profiles-styles";
    style.textContent = PROFILES_CSS;
    document.head.appendChild(style);
})();


/* ---------- Display language -> TMDB requests ---------- */

const LANGUAGES = [
    ["English", "en-US"], ["Español", "es-ES"], ["Français", "fr-FR"], ["Deutsch", "de-DE"],
    ["Português", "pt-BR"], ["Italiano", "it-IT"], ["日本語", "ja-JP"], ["한국어", "ko-KR"]
];

const SUBTITLE_LANGUAGES = [
    ["English", "en"], ["Spanish", "es"], ["French", "fr"], ["German", "de"],
    ["Portuguese", "pt"], ["Italian", "it"], ["Japanese", "ja"], ["Korean", "ko"]
];

const AUDIO_LANGUAGES = ["English", "Spanish", "French", "German", "Portuguese", "Italian", "Japanese", "Korean"];

const RESTRICTIONS = ["No restrictions", "PG-13 and under", "PG and under", "G and under"];

/* ==========================================================
   CONTENT LAYER - runs on every page, for the current profile
   Every request to the movie database (TMDB) goes through here, so a
   profile's settings change what that profile can see:
     - Display language ........ &language=xx on every request
     - Viewing restrictions ..... "G / PG / PG-13 and under": titles rated
                                  above the limit are removed from rows,
                                  categories, search, recommendations,
                                  notifications and the profile's own lists
     - Kids profile ............. PG and under, no horror/thriller/crime/war,
                                  adult titles always excluded
   US certifications are used (G, PG, PG-13, R / TV-Y ... TV-MA). They are
   looked up once per title and cached in the browser (notflix:certs).
   Unrated titles: kept for PG-13 limits, but only kept for G/PG/Kids when
   they're clearly family content (Animation / Family / Kids genres).
========================================================== */

const CERT_CACHE_KEY = "notflix:certs";
const CERT_LEVELS = {
    "G": 1, "TV-Y": 1, "TV-Y7": 1, "TV-G": 1,
    "PG": 2, "TV-PG": 2,
    "PG-13": 3, "TV-14": 3,
    "R": 4, "NC-17": 5, "TV-MA": 5
};
const KID_GENRES = [16, 10751, 10762];          // Animation, Family, Kids
const KIDS_BLOCKED_GENRES = [27, 53, 80, 10752]; // Horror, Thriller, Crime, War

let certCache = {};
try { certCache = JSON.parse(localStorage.getItem(CERT_CACHE_KEY)) || {}; } catch {}
let certSaveTimer = null;

function saveCerts() {
    clearTimeout(certSaveTimer);
    certSaveTimer = setTimeout(() => {
        try { localStorage.setItem(CERT_CACHE_KEY, JSON.stringify(certCache)); } catch {}
    }, 400);
}

function profileMaxLevel(profile) {
    const byRestriction = { "G and under": 1, "PG and under": 2, "PG-13 and under": 3 }[profile?.restriction] || 99;
    return profile?.kids ? Math.min(byRestriction, 2) : byRestriction;
}

const contentProfile = currentProfile();
const contentLang = contentProfile.language;
const maxLevel = profileMaxLevel(contentProfile);
const filterActive = maxLevel < 99;

const nativeFetch = window.fetch.bind(window);

// at most 8 certification lookups at a time
let certActive = 0;
const certQueue = [];
function limited(task) {
    return new Promise((resolve, reject) => {
        const run = () => {
            certActive++;
            task().then(resolve, reject).finally(() => {
                certActive--;
                const next = certQueue.shift();
                if (next) next();
            });
        };
        certActive < 8 ? run() : certQueue.push(run);
    });
}

const certInflight = new Map();

function getCertification(type, id, apiKey) {
    const key = `${type}:${id}`;
    if (key in certCache) return Promise.resolve(certCache[key]);
    if (certInflight.has(key)) return certInflight.get(key);

    const job = limited(async () => {
        try {
            const path = type === "tv" ? `tv/${id}/content_ratings` : `movie/${id}/release_dates`;
            const res = await nativeFetch(`https://api.themoviedb.org/3/${path}?api_key=${apiKey}`);
            if (!res.ok) return null;
            const data = await res.json();
            const us = (data.results || []).find(r => r.iso_3166_1 === "US");
            const cert = type === "tv"
                ? (us?.rating || "")
                : ((us?.release_dates || []).map(r => r.certification).find(Boolean) || "");
            certCache[key] = cert;
            saveCerts();
            return cert;
        } catch {
            return null;
        }
    }).finally(() => certInflight.delete(key));

    certInflight.set(key, job);
    return job;
}

function certAllows(item, cert) {
    const genres = item.genre_ids || (item.genres || []).map(g => g.id) || [];
    if (item.adult) return false;
    if (maxLevel <= 2 && genres.some(g => KIDS_BLOCKED_GENRES.includes(g))) return false;

    const level = CERT_LEVELS[(cert || "").toUpperCase()];
    if (level) return level <= maxLevel;

    // unrated / unknown
    if (maxLevel >= 3) return true;
    return genres.some(g => KID_GENRES.includes(g));
}

function itemType(item, fallback) {
    return item.media_type || item.type || fallback || "movie";
}

// Keep only what this profile may see. `fallbackType` is used when items carry no type.
async function filterTitles(items, fallbackType, apiKey) {
    if (!filterActive || !apiKey) return items;

    const titles = items.filter(i => itemType(i, fallbackType) !== "person");
    await Promise.all(titles.map(i => {
        const type = itemType(i, fallbackType);
        if (i.adult || (`${type}:${i.id}` in certCache)) return null;
        return getCertification(type, i.id, apiKey);
    }));

    return items.filter(i => {
        const type = itemType(i, fallbackType);
        if (type === "person") return true;
        return certAllows(i, certCache[`${type}:${i.id}`]);
    });
}

// For the profile's own saved lists (My List, Liked, Recently Watched...)
async function allowedItems(list) {
    const key = typeof API_KEY !== "undefined" ? API_KEY : null;
    return filterTitles(list, "movie", key);
}

// Instant check using only what's already cached
function isAllowedCached(item) {
    if (!filterActive || !item) return true;
    const type = itemType(item, "movie");
    return certAllows(item, certCache[`${type}:${item.id}`]);
}

function decorateUrl(url) {
    let u = url;
    const add = (name, value) => {
        if (!new RegExp(`[?&]${name.replace(".", "\\.")}=`).test(u)) {
            u += `${u.includes("?") ? "&" : "?"}${name}=${value}`;
        }
    };

    if (contentLang && contentLang !== "en-US") add("language", contentLang);

    if (filterActive) {
        add("include_adult", "false");
        if (/\/discover\/movie/.test(u)) {
            add("certification_country", "US");
            add("certification.lte", maxLevel <= 1 ? "G" : maxLevel === 2 ? "PG" : "PG-13");
        }
        if (/\/discover\//.test(u) && maxLevel <= 2) add("without_genres", KIDS_BLOCKED_GENRES.join(","));
    }
    return u;
}

const LIST_URL = /\/3\/(trending\/|discover\/|search\/|movie\/(popular|top_rated|now_playing|upcoming)|tv\/(popular|top_rated|on_the_air|airing_today)|(movie|tv)\/\d+\/(recommendations|similar))/;

/* ---------- Release dates: rows only show what's actually out ----------
   TMDB's popular / trending / discover lists include titles that haven't been
   released yet (e.g. next year's blockbusters), and /movie/upcoming includes
   ones that came out weeks ago. So:
     - normal rows ........ unreleased titles are dropped
     - "upcoming" rows .... only titles releasing AFTER today are kept
   (search results are left alone - you may well be looking for an unreleased title) */

function localDateString(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function applyDateRules(items, url) {
    const wantsFuture = /\/movie\/upcoming|release_date\.gte|first_air_date\.gte/.test(url);
    const today = localDateString();
    return items.filter(item => {
        const date = item.release_date || item.first_air_date || "";
        if (!date) return true; // no date on file - can't tell, keep it
        return wantsFuture ? date > today : date <= today;
    });
}

const PERSON_CREDITS = /\/person\/\d+\/combined_credits/;

window.fetch = async (input, init) => {
    if (typeof input !== "string" || !input.includes("api.themoviedb.org")) return nativeFetch(input, init);

    const url = decorateUrl(input);
    const res = await nativeFetch(url, init);
    if (!res.ok) return res;

    const isList = LIST_URL.test(url);
    const isCredits = PERSON_CREDITS.test(url);
    const datesApply = isList && !/\/search\//.test(url);
    if (!(isList || isCredits) || (!filterActive && !datesApply)) return res;

    try {
        const data = await res.clone().json();
        const apiKey = new URL(url).searchParams.get("api_key");
        const reply = () => new Response(JSON.stringify(data), {
            status: res.status, headers: { "Content-Type": "application/json" }
        });

        // a person's filmography (cast / crew lists) - keep the 40 best-known, then filter
        if (isCredits) {
            if (!filterActive) return res;
            const top = list => (list || [])
                .sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, 40);
            data.cast = await filterTitles(top(data.cast), "movie", apiKey);
            data.crew = await filterTitles(top(data.crew), "movie", apiKey);
            return reply();
        }

        if (!Array.isArray(data.results)) return res;

        if (datesApply) data.results = applyDateRules(data.results, url);
        if (filterActive) {
            const fallbackType = /\/tv(\/|\?|$)/.test(url.split("?")[0]) ? "tv" : "movie";
            data.results = await filterTitles(data.results, fallbackType, apiKey);
        }
        return reply();
    } catch {
        return res;
    }
};

/* ---------- Small helpers ---------- */

function peEl(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
}

const PE_ICONS = {
    game: '<svg viewBox="0 0 24 24"><rect x="2.5" y="6.5" width="19" height="11" rx="4"/><path d="M7 10v4M5 12h4"/><circle cx="15.5" cy="11" r=".8"/><circle cx="17.5" cy="13" r=".8"/></svg>',
    kids: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.2"/><path d="M5.500 20c.6-3.800 3-6 6.500-6s5.900 2.200 6.500 6"/><path d="M9 5.500c.8-1.400 2-2 3-2s2.200.6 3 2"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M12 8v5"/><circle cx="12" cy="16.2" r=".6"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/><circle cx="12" cy="16" r=".8"/></svg>',
    language: '<svg viewBox="0 0 24 24"><path d="M3 6h9M7.5 4v2M5 6c.5 3 2.5 5.500 5 7M10 6c-.5 3-3 6-6.500 7.500"/><path d="M12.500 20l4-10 4 10M14 17h5"/></svg>',
    subs: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6 10h5M13 10h5M6 14h3M11 14h7"/></svg>',
    autoplay: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="15" height="14" rx="2"/><path d="M9 9.500v5l4-2.500z"/><path d="M18 5V3h3M21 3l-3 3"/></svg>',
    previews: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 10-2.400 5.700"/><path d="M20 5v5h-5"/><path d="M10 9v6l5-3z"/></svg>',
    pencil: '<svg viewBox="0 0 24 24"><path d="M4 20l1-4L16.500 4.500a2.100 2.100 0 013 3L8 19z"/><path d="M14 7l3 3"/></svg>'
};

/* ==========================================================
   ADD / EDIT MODAL
========================================================== */

let peModal = null;
let peState = null; // { mode, draft, original, resolve }

function buildEditor() {
    const modal = peEl("div", "pe-modal hidden");
    modal.id = "pe-modal";
    modal.innerHTML = `
        <div class="pe-panel" role="dialog" aria-modal="true">
            <div class="pe-page" id="pe-main">
                <div class="pe-header">
                    <button class="pe-link" id="pe-cancel">Cancel</button>
                    <h3 class="pe-title" id="pe-title"></h3>
                    <button class="pe-link strong" id="pe-save">Save</button>
                </div>
                <div class="pe-body" id="pe-body"></div>
            </div>
            <div class="pe-page pe-sub hidden" id="pe-sub">
                <div class="pe-header">
                    <button class="pe-link" id="pe-back">Back</button>
                    <h3 class="pe-title" id="pe-sub-title"></h3>
                    <button class="pe-link strong" id="pe-sub-done">Done</button>
                </div>
                <div class="pe-body" id="pe-sub-body"></div>
            </div>
        </div>`;
    document.body.appendChild(modal);

    modal.addEventListener("click", e => { if (e.target === modal) closeEditor(null); });
    modal.querySelector("#pe-cancel").addEventListener("click", () => closeEditor(null));
    modal.querySelector("#pe-save").addEventListener("click", saveEditor);
    modal.querySelector("#pe-back").addEventListener("click", closeSub);
    modal.querySelector("#pe-sub-done").addEventListener("click", closeSub);
    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && !modal.classList.contains("hidden")) closeEditor(null);
    });
    return modal;
}

function toggleSwitch(on, onChange) {
    const sw = peEl("button", `pe-switch${on ? " on" : ""}`);
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-checked", String(on));
    sw.appendChild(peEl("span", "pe-knob"));
    sw.addEventListener("click", e => {
        e.stopPropagation();
        const next = !sw.classList.contains("on");
        sw.classList.toggle("on", next);
        sw.setAttribute("aria-checked", String(next));
        onChange(next);
    });
    return sw;
}

function languageLabel(code) {
    return (LANGUAGES.find(l => l[1] === code) || LANGUAGES[0])[0];
}

function subtitleLabel(code) {
    return (SUBTITLE_LANGUAGES.find(l => l[1] === code) || SUBTITLE_LANGUAGES[0])[0];
}

function updateSaveState() {
    const save = peModal.querySelector("#pe-save");
    const ok = peState.draft.name.trim().length > 0;
    save.disabled = !ok;
    save.classList.toggle("disabled", !ok);
}

function renderEditor() {
    const { mode, draft } = peState;
    const body = peModal.querySelector("#pe-body");
    body.innerHTML = "";

    peModal.querySelector("#pe-title").textContent = mode === "add" ? "Add Profile" : "Edit Profile";
    peModal.querySelector("#pe-save").textContent = mode === "add" ? "Save" : "Done";

    // avatar + pencil badge
    const wrap = peEl("div", "pe-avatar-wrap");
    const img = document.createElement("img");
    img.className = "pe-avatar";
    img.alt = "";
    img.src = draft.avatar;
    const pencil = peEl("button", "pe-pencil");
    pencil.setAttribute("aria-label", "Change picture");
    pencil.innerHTML = PE_ICONS.pencil;
    pencil.addEventListener("click", openAvatarPicker);
    img.addEventListener("click", openAvatarPicker);
    wrap.append(img, pencil);
    body.appendChild(wrap);

    // name
    const field = peEl("label", "pe-field");
    field.appendChild(peEl("span", "pe-field-label", mode === "add" ? "Profile Name" : "Profile name"));
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 20;
    input.value = draft.name;
    input.autocomplete = "off";
    input.addEventListener("input", () => { draft.name = input.value; updateSaveState(); });
    field.appendChild(input);
    body.appendChild(field);

    if (mode === "add") {
        const kids = peEl("div", "pe-kids");
        kids.appendChild(toggleSwitch(draft.kids, v => { draft.kids = v; }));
        kids.appendChild(peEl("h4", null, "Kids Profile"));
        kids.appendChild(peEl("p", null, "Made for kids 12 and under, but parents have all the control."));
        body.appendChild(kids);
    } else {
        renderEditRows(body);
    }

    updateSaveState();
    if (mode === "add") setTimeout(() => input.focus(), 350);
}

function infoRow(icon, title, value, onClick) {
    const row = peEl("button", "pe-row");
    const ic = peEl("span", "pe-row-icon");
    ic.innerHTML = PE_ICONS[icon];
    const text = peEl("span", "pe-row-text");
    text.appendChild(peEl("strong", null, title));
    if (value) text.appendChild(peEl("small", null, value));
    row.append(ic, text, peEl("span", "pe-chevron", "›"));
    row.addEventListener("click", onClick);
    return row;
}

function toggleRow(icon, title, key, subtitle) {
    const row = peEl("div", "pe-row static");
    const ic = peEl("span", "pe-row-icon");
    ic.innerHTML = PE_ICONS[icon];
    const text = peEl("span", "pe-row-text");
    text.appendChild(peEl("strong", null, title));
    if (subtitle) text.appendChild(peEl("small", null, subtitle));
    row.append(ic, text, toggleSwitch(!!peState.draft[key], v => { peState.draft[key] = v; }));
    return row;
}

function renderEditRows(body) {
    const d = peState.draft;
    const rows = peEl("div", "pe-rows");

    rows.appendChild(toggleRow("kids", "Kids profile", "kids", "PG and under, no mature genres"));
    rows.appendChild(infoRow("alert", "Viewing restrictions",
        d.kids ? `${d.restriction} (Kids profile: PG and under)` : d.restriction,
        () => openListPicker("Viewing restrictions", RESTRICTIONS.map(r => [r, r]), "restriction")));
    rows.appendChild(infoRow("lock", "Profile lock", d.lock ? "PIN on - tap to change" : "Add a 4-digit PIN to this profile", openPinPicker));
    rows.appendChild(infoRow("language", "Display language", languageLabel(d.language), () => openListPicker("Display language", LANGUAGES, "language")));
    rows.appendChild(infoRow("subs", "Audio & Subtitles", `${d.audioLang} and ${subtitleLabel(d.subtitleLang)}`, openAudioSubs));
    rows.appendChild(toggleRow("previews", "Autoplay previews", "autoplayPreviews"));
    body.appendChild(rows);

    body.appendChild(peEl("p", "pe-footnote", "Viewing restrictions filter everything shown on this profile."));

    if (getProfiles().length > 1) {
        // two taps instead of a native confirm() (some in-app browsers block those)
        const del = peEl("button", "pe-delete", "Delete Profile");
        let armed = null;
        del.addEventListener("click", () => {
            if (armed) {
                clearTimeout(armed);
                closeEditor({ deleted: peState.original.id });
                return;
            }
            del.textContent = `Tap again to delete ${peState.original.name}`;
            armed = setTimeout(() => { armed = null; del.textContent = "Delete Profile"; }, 3500);
        });
        body.appendChild(del);
    }
}

/* ---------- Sub pages ---------- */

function openSub(title, builder) {
    const sub = peModal.querySelector("#pe-sub");
    const body = peModal.querySelector("#pe-sub-body");
    peModal.querySelector("#pe-sub-title").textContent = title;
    body.innerHTML = "";
    builder(body);

    peModal.querySelector("#pe-main").classList.add("hidden");
    sub.classList.remove("hidden");
}

function closeSub() {
    peModal.querySelector("#pe-sub").classList.add("hidden");
    peModal.querySelector("#pe-main").classList.remove("hidden");
    renderEditor();
}

function openAvatarPicker() {
    openSub("Choose a profile picture", body => {
        const grid = peEl("div", "pe-avatar-grid");
        AVATARS.forEach(src => {
            const b = peEl("button", `pe-avatar-option${src === peState.draft.avatar ? " selected" : ""}`);
            const i = document.createElement("img");
            i.src = src;
            i.alt = "";
            b.appendChild(i);
            b.addEventListener("click", () => {
                peState.draft.avatar = src;
                grid.querySelectorAll(".pe-avatar-option").forEach(o => o.classList.toggle("selected", o === b));
            });
            grid.appendChild(b);
        });
        body.appendChild(grid);
    });
}

function openListPicker(title, options, key) {
    openSub(title, body => {
        const list = peEl("div", "pe-rows");
        options.forEach(([label, value]) => {
            const row = peEl("button", "pe-row pick");
            row.appendChild(peEl("span", "pe-row-text")).appendChild(peEl("strong", null, label));
            const tick = peEl("span", "pe-tick", peState.draft[key] === value ? "✓" : "");
            row.appendChild(tick);
            row.addEventListener("click", () => {
                peState.draft[key] = value;
                list.querySelectorAll(".pe-tick").forEach(t => { t.textContent = ""; });
                tick.textContent = "✓";
            });
            list.appendChild(row);
        });
        body.appendChild(list);
    });
}

function openTextPicker(title, key, placeholder) {
    openSub(title, body => {
        const field = peEl("label", "pe-field");
        field.appendChild(peEl("span", "pe-field-label", title));
        const input = document.createElement("input");
        input.type = "text";
        input.maxLength = 24;
        input.value = peState.draft[key] || "";
        input.placeholder = placeholder;
        input.addEventListener("input", () => { peState.draft[key] = input.value.trim(); });
        field.appendChild(input);
        body.appendChild(field);
        setTimeout(() => input.focus(), 350);
    });
}

function openAudioSubs() {
    openSub("Audio & Subtitles", body => {
        const d = peState.draft;
        body.appendChild(peEl("h4", "pe-section", "Audio"));
        const audio = peEl("div", "pe-rows");
        AUDIO_LANGUAGES.forEach(label => {
            const row = peEl("button", "pe-row pick");
            row.appendChild(peEl("span", "pe-row-text")).appendChild(peEl("strong", null, label));
            const tick = peEl("span", "pe-tick", d.audioLang === label ? "✓" : "");
            row.appendChild(tick);
            row.addEventListener("click", () => {
                d.audioLang = label;
                audio.querySelectorAll(".pe-tick").forEach(t => { t.textContent = ""; });
                tick.textContent = "✓";
            });
            audio.appendChild(row);
        });
        body.appendChild(audio);

        body.appendChild(peEl("h4", "pe-section", "Subtitles"));
        const subs = peEl("div", "pe-rows");
        SUBTITLE_LANGUAGES.forEach(([label, code]) => {
            const row = peEl("button", "pe-row pick");
            row.appendChild(peEl("span", "pe-row-text")).appendChild(peEl("strong", null, label));
            const tick = peEl("span", "pe-tick", d.subtitleLang === code ? "✓" : "");
            row.appendChild(tick);
            row.addEventListener("click", () => {
                d.subtitleLang = code;
                subs.querySelectorAll(".pe-tick").forEach(t => { t.textContent = ""; });
                tick.textContent = "✓";
            });
            subs.appendChild(row);
        });
        body.appendChild(subs);
    });
}

function openPinPicker() {
    openSub("Profile lock", body => {
        body.appendChild(peEl("p", "pe-help",
            "Choose a 4-digit PIN. It will be asked for whenever this profile is opened."));
        const field = peEl("label", "pe-field");
        field.appendChild(peEl("span", "pe-field-label", "4-digit PIN"));
        const input = document.createElement("input");
        input.type = "password";
        input.inputMode = "numeric";
        input.maxLength = 4;
        input.autocomplete = "off";
        input.value = peState.draft.lock || "";
        input.addEventListener("input", () => {
            input.value = input.value.replace(/\D/g, "").slice(0, 4);
            // only a complete 4-digit PIN replaces the current one
            if (input.value.length === 4) peState.draft.lock = input.value;
            if (input.value.length === 0) peState.draft.lock = "";
        });
        field.appendChild(input);
        body.appendChild(field);

        if (peState.draft.lock) {
            const remove = peEl("button", "pe-delete", "Remove PIN");
            remove.addEventListener("click", () => { peState.draft.lock = ""; closeSub(); });
            body.appendChild(remove);
        }
    });
}

/* ---------- Open / save / close ---------- */

function openProfileEditor({ mode = "add", profile = null } = {}) {
    if (mode === "add" && getProfiles().length >= MAX_PROFILES) return Promise.resolve(null);
    if (!peModal) peModal = buildEditor();

    return new Promise(resolve => {
        const base = mode === "add"
            ? { ...PROFILE_DEFAULTS, id: null, name: "", avatar: AVATARS[0] }
            : { ...PROFILE_DEFAULTS, ...profile };

        peState = { mode, draft: { ...base }, original: base, resolve };

        peModal.querySelector("#pe-sub").classList.add("hidden");
        peModal.querySelector("#pe-main").classList.remove("hidden");
        renderEditor();
        void peModal.offsetHeight; // commit hidden state so the open animates
        peModal.classList.remove("hidden");
    });
}

function closeEditor(result) {
    if (!peState) return;
    const { resolve } = peState;
    peState = null;
    peModal.classList.add("hidden");
    resolve(result);
}

function saveEditor() {
    const { mode, draft } = peState;
    const name = draft.name.trim();
    if (!name) return;

    const list = getProfiles();
    let saved;

    if (mode === "add") {
        saved = { ...draft, name, id: `p${Date.now().toString(36)}`, legacy: false };
        list.push(saved);
    } else {
        const idx = list.findIndex(p => p.id === draft.id);
        saved = { ...list[idx], ...draft, name };
        list[idx] = saved;
    }

    saveProfiles(list);
    document.dispatchEvent(new CustomEvent("notflix:profiles"));

    // content settings of the profile being used right now -> reload so every row re-filters
    const original = peState.original;
    const contentChanged = mode === "edit" && saved.id === contentProfile.id &&
        (saved.kids !== !!original.kids || saved.restriction !== original.restriction || saved.language !== original.language);
    const onLoginPage = !!document.querySelector(".profiles-row");
    closeEditor({ saved });
    if (contentChanged && !onLoginPage) setTimeout(() => location.reload(), 350);
}

function deleteProfile(id) {
    const all = getProfiles();
    const target = all.find(p => p.id === id);
    const list = all.filter(p => p.id !== id);
    if (!target || !list.length) return;
    saveProfiles(list);

    // remove that profile's own saved data (the legacy profile owns the plain keys)
    const KEYS = ["notflix:mylist", "notflix:recentlywatched", "notflix:liked", "notflix:reminders",
        "notflix:notifs", "notflix:notifs-read", "notflix:notifs-seen", "notflix:notifs-checked"];
    KEYS.forEach(k => {
        try { localStorage.removeItem(target.legacy ? k : `${k}@${id}`); } catch {}
    });

    try {
        if (localStorage.getItem(CURRENT_PROFILE_KEY) === id) localStorage.removeItem(CURRENT_PROFILE_KEY);
    } catch {}
    document.dispatchEvent(new CustomEvent("notflix:profiles"));
}

/* ==========================================================
   PIN PROMPT
========================================================== */

let pinModal = null;

function requirePin(profile) {
    if (!profile || !profile.lock) return Promise.resolve(true);

    if (!pinModal) {
        pinModal = peEl("div", "pin-modal hidden");
        pinModal.innerHTML = `
            <div class="pin-panel" role="dialog" aria-modal="true">
                <h3 class="pin-title">Profile Lock</h3>
                <p class="pin-sub"></p>
                <div class="pin-dots"><i></i><i></i><i></i><i></i></div>
                <input class="pin-input" type="password" inputmode="numeric" maxlength="4" autocomplete="off">
                <p class="pin-error"></p>
                <button class="pe-link pin-cancel">Cancel</button>
            </div>`;
        document.body.appendChild(pinModal);
    }

    return new Promise(resolve => {
        const input = pinModal.querySelector(".pin-input");
        const dots = [...pinModal.querySelectorAll(".pin-dots i")];
        const error = pinModal.querySelector(".pin-error");
        const cancel = pinModal.querySelector(".pin-cancel");

        pinModal.querySelector(".pin-sub").textContent = `Enter your PIN to open ${profile.name}`;
        input.value = "";
        error.textContent = "";
        dots.forEach(d => d.classList.remove("filled"));

        const finish = ok => {
            input.oninput = null;
            cancel.onclick = null;
            pinModal.onclick = null;
            pinModal.classList.add("hidden");
            resolve(ok);
        };

        input.oninput = () => {
            input.value = input.value.replace(/\D/g, "").slice(0, 4);
            dots.forEach((d, i) => d.classList.toggle("filled", i < input.value.length));
            error.textContent = "";

            if (input.value.length === 4) {
                if (input.value === profile.lock) {
                    setTimeout(() => finish(true), 120);
                } else {
                    error.textContent = "Incorrect PIN. Try again.";
                    pinModal.querySelector(".pin-panel").classList.add("shake");
                    setTimeout(() => pinModal.querySelector(".pin-panel").classList.remove("shake"), 400);
                    input.value = "";
                    dots.forEach(d => d.classList.remove("filled"));
                }
            }
        };
        cancel.onclick = () => finish(false);
        pinModal.onclick = e => { if (e.target === pinModal) finish(false); };

        void pinModal.offsetHeight;
        pinModal.classList.remove("hidden");
        setTimeout(() => input.focus(), 300);
    });
}
