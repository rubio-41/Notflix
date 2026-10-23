/* ==========================================================
   REVIEWS + RATINGS
   - 10-star ratings (partial stars for decimals, e.g. 7.8 -> 7 full + 80%)
   - Audience score (TMDB) + critic scores: IMDb, Rotten Tomatoes (Tomatometer),
     Metacritic - these three come from OMDb and need a FREE key (below)
   - Viewer reviews from TMDB with "Show more reviews" and "Read more"
   - Used by the Behind the Scenes sheet and the "Reviews" tab of the movie modal

   OMDb key: free at https://www.omdbapi.com/apikey.aspx (1,000 requests/day).
   Put it here, or run  localStorage.setItem("notflix:omdb-key", "yourkey")
   once in the browser console. Without a key only the TMDB audience score
   and viewer reviews are shown.
   Needs state.js; API_KEY comes from mvdata.js / search.js.
========================================================== */

const OMDB_API_KEY = "134c7665";          // <- paste your free OMDb key here
const SHOW_CRITICS_HINT = true;   // set to false once the key is in

const REVIEWS_API = "https://api.themoviedb.org/3";
const CRITICS_CACHE_KEY = "notflix:critics";
const CRITICS_TTL = 7 * 24 * 3600 * 1000;

const REVIEWS_CSS = `
.stars { display: inline-flex; gap: 2px; vertical-align: middle; }
.star { font-size: 16px; line-height: 1; color: transparent; -webkit-text-fill-color: transparent;
	background: linear-gradient(90deg, #f5c518 var(--fill), #4b4b4d var(--fill));
	-webkit-background-clip: text; background-clip: text; }
.stars.big .star { font-size: 20px; }
.rating-num { margin-left: 8px; font-weight: 800; }

.ratings-block { margin: 6px 0 4px; }
.score-row { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 6px; scrollbar-width: none; }
.score-row::-webkit-scrollbar { display: none; }
.score-card { flex: 0 0 auto; min-width: 128px; padding: 12px 14px; background: #2a2a2a; border-radius: 10px; }
.score-card.wide { min-width: 210px; }
.score-label { font-size: 11px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: #a3a3a3; }
.score-value { display: flex; align-items: center; gap: 8px; margin: 6px 0 2px; font-size: 26px; font-weight: 800; }
.score-sub { font-size: 12px; color: #a3a3a3; }
.score-value .imdb-tag { padding: 2px 6px; border-radius: 4px; background: #f5c518; color: #000; font-size: 13px; font-weight: 900; }
.score-value .mc-box { min-width: 38px; padding: 3px 6px; border-radius: 6px; color: #fff; font-size: 20px; text-align: center; }
.mc-green { background: #4caf2a; } .mc-yellow { background: #e6b800; color: #111 !important; } .mc-red { background: #d63031; }
.rt-fresh { color: #fa5a3a; } .rt-rotten { color: #6ac238; }
.critics-links { margin: 8px 0 0; font-size: 12px; color: #8c8c8c; }
.critics-links a { color: #a3a3a3; margin-right: 12px; }
.critics-hint { margin: 8px 0 0; font-size: 12px; color: #8c8c8c; font-style: italic; }

.reviews-title { margin: 22px 0 12px; font-size: 20px; font-weight: 800; }
.review-card { margin-bottom: 12px; padding: 14px; background: #2a2a2a; border-radius: 10px; }
.review-top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.review-avatar { flex: 0 0 34px; width: 34px; height: 34px; border-radius: 50%; object-fit: cover; background: #3b3b3d;
	display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #ddd; }
.review-who { flex: 1; min-width: 0; }
.review-author { margin: 0; font-size: 14px; font-weight: 700; }
.review-date { margin: 1px 0 0; font-size: 12px; color: #8c8c8c; }
.review-rating { margin: 0 0 8px; font-size: 13px; }
.review-norating { color: #8c8c8c; }
.review-body { margin: 0; font-size: 14px; line-height: 1.55; color: #d6d6d6; white-space: pre-line; overflow-wrap: anywhere; }
.review-toggle, .reviews-more { background: none; border: none; color: #fff; font-family: inherit; cursor: pointer; }
.review-toggle { margin-top: 8px; padding: 0; font-size: 13px; font-weight: 700; text-decoration: underline; }
.reviews-more { display: block; width: 100%; margin: 6px 0 0; padding: 13px; border: 1px solid #5b5b5d; border-radius: 10px;
	font-size: 15px; font-weight: 700; }
.reviews-more:disabled { opacity: 0.5; }
.reviews-empty { margin: 0; color: #a3a3a3; font-size: 14px; }
`;

(function injectReviewStyles() {
    if (document.getElementById("reviews-styles")) return;
    const style = document.createElement("style");
    style.id = "reviews-styles";
    style.textContent = REVIEWS_CSS;
    document.head.appendChild(style);
})();

function rEl(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
}

/* ---------- Ten-star rating ---------- */

// value out of 10 -> ten stars, filled (partly, for decimals) according to the value
function starRating(value, big = false) {
    const wrap = rEl("span", `stars${big ? " big" : ""}`);
    const v = Math.max(0, Math.min(10, Number(value) || 0));
    wrap.setAttribute("role", "img");
    wrap.setAttribute("aria-label", `${v.toFixed(1).replace(/\.0$/, "")} out of 10`);
    for (let i = 0; i < 10; i++) {
        const star = rEl("span", "star", "★");
        star.style.setProperty("--fill", `${Math.round(Math.max(0, Math.min(1, v - i)) * 100)}%`);
        wrap.appendChild(star);
    }
    return wrap;
}

/* ---------- Data ---------- */

function omdbKey() {
    let stored = "";
    try { stored = (localStorage.getItem("notflix:omdb-key") || "").trim(); } catch {}
    return stored || OMDB_API_KEY;
}

async function fetchCritics(imdbId) {
    const key = omdbKey();
    if (!key || !imdbId) return null;

    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(CRITICS_CACHE_KEY)) || {}; } catch {}
    const hit = cache[imdbId];
    if (hit && Date.now() - hit.at < CRITICS_TTL) return hit.data;

    try {
        const res = await fetch(`https://www.omdbapi.com/?apikey=${key}&i=${imdbId}`);
        const d = await res.json();
        if (d.Response === "False") return null;

        const find = source => (d.Ratings || []).find(r => r.Source === source)?.Value || null;
        const data = {
            imdb: d.imdbRating && d.imdbRating !== "N/A" ? Number(d.imdbRating) : null,
            imdbVotes: d.imdbVotes && d.imdbVotes !== "N/A" ? d.imdbVotes : null,
            tomatometer: parseInt(find("Rotten Tomatoes"), 10) || null,
            metacritic: parseInt(find("Metacritic"), 10) || null
        };
        cache[imdbId] = { at: Date.now(), data };
        try { localStorage.setItem(CRITICS_CACHE_KEY, JSON.stringify(cache)); } catch {}
        return data;
    } catch {
        return null;
    }
}

async function fetchTitleRatings(type, id) {
    try {
        const res = await fetch(`${REVIEWS_API}/${type}/${id}?api_key=${API_KEY}&append_to_response=external_ids,reviews`);
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
}

async function fetchReviewPage(type, id, page) {
    try {
        const res = await fetch(`${REVIEWS_API}/${type}/${id}/reviews?api_key=${API_KEY}&page=${page}`);
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
}

/* ---------- Pieces ---------- */

function scoreCard(label, valueNode, sub, wide = false) {
    const card = rEl("div", `score-card${wide ? " wide" : ""}`);
    card.appendChild(rEl("div", "score-label", label));
    const value = rEl("div", "score-value");
    value.appendChild(valueNode);
    card.appendChild(value);
    if (sub) card.appendChild(rEl("div", "score-sub", sub));
    return card;
}

function formatVotes(n) {
    return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}K` : String(n);
}

function buildScores(data, critics, title) {
    const block = rEl("div", "ratings-block");
    const row = rEl("div", "score-row");

    // audience (TMDB): the ten stars are filled to the score
    const audience = Number(data?.vote_average) || 0;
    if (audience > 0) {
        const holder = rEl("span");
        holder.append(starRating(audience, true));
        const card = scoreCard("Audience · TMDB", rEl("span", null, audience.toFixed(1)), null, true);
        card.querySelector(".score-value").prepend(holder);
        card.querySelector(".score-value").style.flexWrap = "wrap";
        card.appendChild(rEl("div", "score-sub", `${formatVotes(data.vote_count || 0)} ratings`));
        row.appendChild(card);
    }

    if (critics?.imdb) {
        const v = rEl("span");
        v.append(rEl("span", "imdb-tag", "IMDb"), document.createTextNode(` ${critics.imdb.toFixed(1)}`));
        row.appendChild(scoreCard("IMDb rating", v, critics.imdbVotes ? `${critics.imdbVotes} votes · out of 10` : "out of 10"));
    }
    if (critics?.tomatometer != null) {
        const fresh = critics.tomatometer >= 60;
        const v = rEl("span", fresh ? "rt-fresh" : "rt-rotten", `${fresh ? "🍅" : "🤢"} ${critics.tomatometer}%`);
        row.appendChild(scoreCard("Tomatometer", v, fresh ? "Fresh · critics" : "Rotten · critics"));
    }
    if (critics?.metacritic != null) {
        const m = critics.metacritic;
        const v = rEl("span", `mc-box ${m >= 61 ? "mc-green" : m >= 40 ? "mc-yellow" : "mc-red"}`, String(m));
        row.appendChild(scoreCard("Metacritic", v, "Metascore · out of 100"));
    }
    block.appendChild(row);

    // outbound links to the full critic pages (no scraping)
    const q = encodeURIComponent(title || "");
    const links = rEl("p", "critics-links");
    const imdbId = data?.external_ids?.imdb_id;
    [
        ["IMDb reviews", imdbId ? `https://www.imdb.com/title/${imdbId}/reviews` : `https://www.imdb.com/find/?q=${q}`],
        ["Rotten Tomatoes", `https://www.rottentomatoes.com/search?search=${q}`],
        ["Metacritic", `https://www.metacritic.com/search/${q}/`]
    ].forEach(([label, href]) => {
        const a = document.createElement("a");
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = `${label} ›`;
        links.appendChild(a);
    });
    block.appendChild(links);

    if (!omdbKey() && SHOW_CRITICS_HINT) {
        block.appendChild(rEl("p", "critics-hint",
            "IMDb, Rotten Tomatoes and Metacritic scores appear once a free OMDb key is added in reviews.js."));
    }
    return block;
}

function buildReviewCard(review) {
    const card = rEl("div", "review-card");
    const details = review.author_details || {};

    const top = rEl("div", "review-top");
    const avatarPath = details.avatar_path || "";
    const src = avatarPath ? (avatarPath.startsWith("/http") ? avatarPath.slice(1) : `https://image.tmdb.org/t/p/w92${avatarPath}`) : null;
    const initials = (review.author || "?").slice(0, 2).toUpperCase();
    if (src) {
        const img = document.createElement("img");
        img.className = "review-avatar";
        img.alt = "";
        img.loading = "lazy";
        img.src = src;
        img.onerror = () => img.replaceWith(rEl("div", "review-avatar", initials));
        top.appendChild(img);
    } else {
        top.appendChild(rEl("div", "review-avatar", initials));
    }
    const who = rEl("div", "review-who");
    who.appendChild(rEl("p", "review-author", review.author || "Anonymous"));
    if (review.created_at) {
        who.appendChild(rEl("p", "review-date",
            new Date(review.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })));
    }
    top.appendChild(who);
    card.appendChild(top);

    const rating = rEl("p", "review-rating");
    if (typeof details.rating === "number") {
        rating.append(starRating(details.rating), rEl("span", "rating-num", `${details.rating}/10`));
    } else {
        rating.appendChild(rEl("span", "review-norating", "No rating given"));
    }
    card.appendChild(rating);

    const text = (review.content || "").replace(/\r?\n{3,}/g, "\n\n").trim();
    const LIMIT = 340;
    const body = rEl("p", "review-body", text.length > LIMIT ? `${text.slice(0, LIMIT).trimEnd()}…` : text);
    card.appendChild(body);

    if (text.length > LIMIT) {
        const toggle = rEl("button", "review-toggle", "Read more");
        let open = false;
        toggle.addEventListener("click", () => {
            open = !open;
            body.textContent = open ? text : `${text.slice(0, LIMIT).trimEnd()}…`;
            toggle.textContent = open ? "Show less" : "Read more";
        });
        card.appendChild(toggle);
    }
    return card;
}

/* ---------- The whole section ---------- */

// options: { id, type, title, data? }   data = TMDB details already fetched (optional)
async function renderReviewsSection(container, { id, type = "movie", title = "", data = null }) {
    container.innerHTML = "";
    const loading = rEl("p", "reviews-empty", "Loading ratings and reviews…");
    container.appendChild(loading);

    // one request gets score, vote count, imdb id and the first page of reviews
    if (!data || !data.external_ids || !data.reviews) {
        const fetched = await fetchTitleRatings(type, id);
        data = { ...(data || {}), ...(fetched || {}) };
    }
    const critics = await fetchCritics(data?.external_ids?.imdb_id);

    container.innerHTML = "";
    container.appendChild(buildScores(data, critics, title));

    container.appendChild(rEl("h3", "reviews-title", "What viewers are saying"));
    const list = rEl("div", "reviews-list");
    container.appendChild(list);

    const items = [...(data?.reviews?.results || [])];
    let nextPage = 2;
    const totalPages = data?.reviews?.total_pages || 1;
    const totalCount = data?.reviews?.total_results || items.length;
    let shown = 0;

    if (!items.length) {
        list.appendChild(rEl("p", "reviews-empty", "There are no viewer reviews for this title yet."));
        return;
    }

    const more = rEl("button", "reviews-more");
    container.appendChild(more);

    const showNext = async count => {
        // top up from the next TMDB page when we've shown everything loaded so far
        while (shown + count > items.length && nextPage <= totalPages) {
            more.disabled = true;
            more.textContent = "Loading…";
            const page = await fetchReviewPage(type, id, nextPage++);
            if (!page?.results?.length) break;
            items.push(...page.results);
        }
        items.slice(shown, shown + count).forEach(r => list.appendChild(buildReviewCard(r)));
        shown = Math.min(items.length, shown + count);

        const remaining = Math.max(totalCount - shown, 0);
        more.disabled = false;
        if (shown >= items.length && nextPage > totalPages) more.remove();
        else more.textContent = `Show more reviews${remaining ? ` (${remaining} more)` : ""}`;
    };

    more.addEventListener("click", () => showNext(5));
    await showNext(4);
}

/* ---------- "Reviews" tab in the movie modal ---------- */

(function addReviewsTab() {
    const tabs = document.querySelector(".modal-tabs");
    const anchor = document.getElementById("tab-content-watch");
    if (!tabs || !anchor || document.getElementById("tab-reviews")) return;

    const tab = rEl("div", "tab", "Reviews");
    tab.id = "tab-reviews";
    tabs.appendChild(tab);

    const content = rEl("div", "tab-content hidden");
    content.id = "tab-content-reviews";
    anchor.parentElement.appendChild(content);

    const allTabs = () => [...tabs.querySelectorAll(".tab")];

    tab.addEventListener("click", () => {
        allTabs().forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
        content.classList.remove("hidden");

        const type = typeof activeMediaType !== "undefined" ? activeMediaType : "movie";
        const id = typeof activeMovieId !== "undefined" ? activeMovieId : null;
        const key = `${type}:${id}`;
        if (id != null && content.dataset.key !== key) {
            content.dataset.key = key;
            renderReviewsSection(content, { id, type, title: document.getElementById("modal-title")?.textContent || "" });
        }
    });

    // the other tabs just need to hide this one
    allTabs().filter(t => t !== tab).forEach(t => t.addEventListener("click", () => {
        content.classList.add("hidden");
    }));

    // a freshly opened movie starts on its first tab with no stale reviews
    if (typeof openModal === "function") {
        const originalOpen = openModal;
        openModal = function (...args) {
            content.classList.add("hidden");
            tab.classList.remove("active");
            delete content.dataset.key;
            content.innerHTML = "";
            return originalOpen.apply(this, args);
        };
    }
})();
