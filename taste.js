/* ==========================================================
   TASTE PROFILE + "% MATCH"
   The match percentage used to be TMDB's average rating x 10 (the same
   number for everybody). It's now personal: it compares a title with what
   you've liked, put in My List and recently watched.

   Signals (weights in the final score):
     genres ............ 55%  how close the title's genres are to your favourites
     people ............ 15%  shared director/creator and top-billed cast
     language .......... 12%  original language you tend to watch
     movie vs series ...  8%  which format you lean towards
     quality ........... 10%  TMDB audience rating as a small tie-breaker
   Titles you LIKED count 3x, My List 2x, recently watched 1x.
   With very little history the score leans on the audience rating, and
   moves to your own taste as you like/save more titles.

   Needs state.js; API_KEY comes from mvdata.js / search.js.
   Load AFTER them (end of <body>).
========================================================== */

const TASTE_FEATURES_KEY = "notflix:taste-features";
const TASTE_SOURCE_WEIGHT = { liked: 3, list: 2, recent: 1 };
const TASTE_FULL_CONFIDENCE_AT = 4; // seeds with data before the score is fully personal

let tasteCache = (() => {
    try { return JSON.parse(localStorage.getItem(TASTE_FEATURES_KEY)) || {}; } catch { return {}; }
})();
const tasteInFlight = new Map();

function tasteKey(id, type) {
    return `${type || "movie"}:${id}`;
}

function saveTasteCache() {
    try { localStorage.setItem(TASTE_FEATURES_KEY, JSON.stringify(tasteCache)); } catch {}
}

/* ---------- Title features (cached, fetched once per title) ---------- */

async function ensureFeatures(id, type = "movie") {
    const key = tasteKey(id, type);
    if (tasteCache[key]) return tasteCache[key];
    if (tasteInFlight.has(key)) return tasteInFlight.get(key);
    if (typeof API_KEY === "undefined") return null;

    const job = (async () => {
        try {
            const res = await fetch(
                `https://api.themoviedb.org/3/${type}/${id}?api_key=${API_KEY}&append_to_response=credits`
            );
            if (!res.ok) return null;
            const data = await res.json();

            const directors = type === "tv"
                ? (data.created_by || []).map(p => p.id)
                : (data.credits?.crew || []).filter(p => p.job === "Director").map(p => p.id);

            const features = {
                g: (data.genres || []).map(g => g.id),
                l: data.original_language || null,
                c: (data.credits?.cast || []).slice(0, 5).map(p => p.id),
                d: directors.slice(0, 2),
                t: type,
                v: data.vote_average || 0
            };
            tasteCache[key] = features;
            saveTasteCache();
            return features;
        } catch {
            return null;
        } finally {
            tasteInFlight.delete(key);
        }
    })();

    tasteInFlight.set(key, job);
    return job;
}

/* ---------- What you like ---------- */

function tasteSeeds() {
    const seeds = new Map();
    const add = (list, weight) => (list || []).forEach(item => {
        if (!item || item.id == null) return;
        const type = item.type || "movie";
        const key = tasteKey(item.id, type);
        const seed = seeds.get(key) || { id: item.id, type, key, w: 0 };
        seed.w += weight;
        seeds.set(key, seed);
    });

    if (typeof getLiked === "function") add(getLiked(), TASTE_SOURCE_WEIGHT.liked);
    if (typeof getMyList === "function") add(getMyList(), TASTE_SOURCE_WEIGHT.list);
    if (typeof getRecentlyWatched === "function") add(getRecentlyWatched(), TASTE_SOURCE_WEIGHT.recent);
    return [...seeds.values()];
}

function buildTasteProfile() {
    const profile = { genre: {}, lang: {}, person: {}, type: {}, total: 0, n: 0 };

    tasteSeeds().forEach(seed => {
        const f = tasteCache[seed.key];
        if (!f) return;

        profile.n++;
        profile.total += seed.w;
        profile.type[f.t] = (profile.type[f.t] || 0) + seed.w;
        if (f.l) profile.lang[f.l] = (profile.lang[f.l] || 0) + seed.w;

        // a title with 4 genres shouldn't count 4x more than one with 1
        const share = f.g.length ? seed.w / f.g.length : 0;
        f.g.forEach(g => { profile.genre[g] = (profile.genre[g] || 0) + share; });

        f.d.forEach(p => { profile.person[p] = (profile.person[p] || 0) + seed.w * 1.5; });
        f.c.forEach(p => { profile.person[p] = (profile.person[p] || 0) + seed.w; });
    });
    return profile;
}

/* ---------- Scoring ---------- */

function cosineGenres(profileGenres, candidateGenres) {
    if (!candidateGenres.length) return 0;
    const norm = Math.sqrt(Object.values(profileGenres).reduce((s, v) => s + v * v, 0));
    if (!norm) return 0;

    const candidateWeight = 1 / Math.sqrt(candidateGenres.length);
    const dot = candidateGenres.reduce((s, g) => s + (profileGenres[g] || 0) * candidateWeight, 0);
    return Math.min(1, dot / norm);
}

function personalScore(profile, f) {
    const maxLang = Math.max(0, ...Object.values(profile.lang));
    const maxType = Math.max(0, ...Object.values(profile.type));

    const genre = Math.min(1, cosineGenres(profile.genre, f.g) * 1.25); // cosine rarely hits 1.0
    const lang = f.l && maxLang ? (profile.lang[f.l] || 0) / maxLang : 0;
    const type = maxType ? (profile.type[f.t] || 0) / maxType : 0;

    const sharedWeight = [...f.d, ...f.c].reduce((s, p) => s + (profile.person[p] || 0), 0);
    const people = Math.min(1, (sharedWeight / profile.total) * 2.5);

    const quality = Math.min(1, (f.v || 0) / 10);

    return 0.55 * genre + 0.15 * people + 0.12 * lang + 0.08 * type + 0.10 * quality;
}

// Percent match for { id, type, rating } using only cached data (instant).
function matchPercent(item) {
    const type = item.type || "movie";
    const baseline = Math.round((item.rating || 0) * 10);
    const f = tasteCache[tasteKey(item.id, type)];

    const profile = buildTasteProfile();
    if (!f || !profile.n) return clampPct(baseline);

    const personal = clampPct(Math.round(45 + 54 * personalScore(profile, f)));
    const confidence = Math.min(1, profile.n / TASTE_FULL_CONFIDENCE_AT);
    return clampPct(Math.round(confidence * personal + (1 - confidence) * baseline));
}

function clampPct(n) {
    return Math.max(1, Math.min(99, n));
}

/* ---------- Modal ---------- */

function renderMatch(id, type, rating) {
    const el = document.getElementById("modal-match");
    if (!el) return;

    // Nothing liked / listed / watched yet -> there is nothing to match against
    if (!tasteSeeds().length) {
        el.textContent = "Like or List a title to get your match";
        el.title = "Your % match is built from the titles you like, add to My List or watch";
        el.classList.add("no-match");
        return;
    }

    el.classList.remove("no-match");
    el.textContent = `${matchPercent({ id, type, rating })}% Match`;
    el.title = "Based on the titles you've liked, saved and watched";
}

// Called by openModal(): instant number now, refined when the title's
// details (genres, cast...) arrive.
function showMatch(id, type, rating) {
    renderMatch(id, type, rating);

    if (!tasteCache[tasteKey(id, type)]) {
        ensureFeatures(id, type).then(f => {
            const stillOpen = typeof activeMovieId !== "undefined" && String(activeMovieId) === String(id);
            if (f && stillOpen) renderMatch(id, type, rating);
        });
    }
}

/* ---------- Keep the profile up to date ---------- */

let tasteSyncing = false;

async function syncTasteSeeds() {
    if (tasteSyncing || typeof API_KEY === "undefined") return;
    tasteSyncing = true;
    try {
        const missing = tasteSeeds().filter(s => !tasteCache[s.key]).slice(0, 30);
        for (let i = 0; i < missing.length; i += 5) {
            await Promise.all(missing.slice(i, i + 5).map(s => ensureFeatures(s.id, s.type)));
        }
        if (missing.length) document.dispatchEvent(new CustomEvent("notflix:taste"));
    } finally {
        tasteSyncing = false;
    }
}

// New like / list / watch -> learn it, and refresh an open modal's number
let tasteTimer = null;
document.addEventListener("notflix:state", () => {
    clearTimeout(tasteTimer);
    tasteTimer = setTimeout(async () => {
        await syncTasteSeeds();
        if (typeof activeMovieSummary !== "undefined" && activeMovieSummary) {
            const s = activeMovieSummary;
            const modal = document.getElementById("modal");
            if (modal && !modal.classList.contains("hidden")) renderMatch(s.id, s.type || "movie", s.rating);
        }
    }, 300);
});

syncTasteSeeds();
