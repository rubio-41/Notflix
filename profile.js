/* ==========================================================
   PROFILE PAGE
   - Rows (single scrollable rows, like Home): Liked, My List,
     Recently Viewed, Go Behind the Scenes
   - "See All" My List sheet: filter, sort, edit, swipe-to-delete
   - MiniPlayer: trailer only (no movie modal)
   - Behind the Scenes sheet: videos, cast, reviews, episodes/photos
   - Profile-switcher popup
   Relies on state.js, mvdata.js (openModal, API_KEY) and icons.js.
========================================================== */

const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";
const NO_IMAGE = "https://via.placeholder.com/342x513?text=No+Image";

const $ = id => document.getElementById(id);

function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
}

/* ---------- Shared helpers ---------- */

function posterImgFor(item) {
    // Prefer the real poster; `img` is only the wide trailer backdrop.
    return item.poster || item.img || NO_IMAGE;
}

function openItem(item) {
    if (typeof openModal !== "function") return;
    openModal({
        id: item.id,
        title: item.title,
        desc: item.desc || "",
        img: item.img,
        poster: item.poster,
        rating: item.rating,
        year: item.year,
        type: item.type || "movie"
    });
}

function buildCard(item, cardClass = "poster", onClick = () => openItem(item)) {
    const card = h("div", cardClass);

    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = item.title || "";
    img.src = posterImgFor(item);
    card.appendChild(img);

    // Titles saved before posters were stored: look the poster up (cached).
    if (!item.poster && item.id != null) {
        fetchPosterUrl(item.id, item.type || "movie").then(url => {
            if (url) img.src = url;
        });
    }

    card.addEventListener("click", onClick);
    return card;
}

async function shareItem(item) {
    const url = `https://www.themoviedb.org/${item.type || "movie"}/${item.id}`;
    try {
        if (navigator.share) {
            await navigator.share({ title: item.title, text: `Check out ${item.title}`, url });
            return "Shared";
        }
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(url);
            return "Link copied";
        }
    } catch {
        // share sheet dismissed
    }
    return null;
}

/* ---------- Sheets (My List / Behind the Scenes) ---------- */

function showSheet(el) {
    el.classList.remove("hidden");
    lockScroll();
}

function hideSheet(el) {
    el.classList.add("hidden");
    unlockScroll();
}

function anySheetOpen() {
    return [...document.querySelectorAll(".sheet")].some(s => !s.classList.contains("hidden"));
}

// The movie modal sits above the sheets; when it closes it unlocks the page
// scroll, so lock it again if a sheet is still open behind it.
(function keepScrollLocked() {
    const modal = $("modal");
    if (!modal) return;
    new MutationObserver(() => {
        if (modal.classList.contains("hidden") && anySheetOpen()) lockScroll();
    }).observe(modal, { attributes: true, attributeFilter: ["class"] });
})();

/* ==========================================================
   ROWS
========================================================== */

function renderRow(containerId, list, builder, emptyMessage) {
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = "";

    if (!list.length) {
        container.appendChild(h("p", "empty-row-message", emptyMessage));
        return;
    }

    const fragment = document.createDocumentFragment();
    list.forEach(item => fragment.appendChild(builder(item)));
    container.appendChild(fragment);
}

function buildLikedCard(item) {
    const wrap = h("div", "liked-card");
    wrap.appendChild(buildCard(item, "poster"));

    const share = h("button", "card-share");
    const label = h("span", null, "Share");
    share.append(makeIcon("actions", "send", false), label);
    share.addEventListener("click", async e => {
        e.stopPropagation();
        const result = await shareItem(item);
        if (result) {
            label.textContent = result;
            setTimeout(() => (label.textContent = "Share"), 1600);
        }
    });
    wrap.appendChild(share);
    return wrap;
}

/* ---- Behind the Scenes card: poster + separate "Discover More" button whose
   gradient is taken from the poster's own colours (like the old draft's
   .witch-btn / .wed-btn, but computed per title) ---- */

const ACCENT_KEY = "notflix:accents";

function readAccents() {
    try { return JSON.parse(localStorage.getItem(ACCENT_KEY)) || {}; } catch { return {}; }
}

// Picks a vivid colour from the lower half of the poster (skips near-black / near-white)
function sampleAccent(url) {
    return new Promise(resolve => {
        const probe = new Image();
        probe.crossOrigin = "anonymous";
        probe.onload = () => {
            try {
                const w = 24, hgt = 36;
                const canvas = document.createElement("canvas");
                canvas.width = w;
                canvas.height = hgt;
                const ctx = canvas.getContext("2d", { willReadFrequently: true });
                ctx.drawImage(probe, 0, 0, w, hgt);
                const px = ctx.getImageData(0, hgt / 2, w, hgt / 2).data;

                let r = 0, g = 0, b = 0, weight = 0;
                for (let i = 0; i < px.length; i += 4) {
                    const max = Math.max(px[i], px[i + 1], px[i + 2]);
                    const min = Math.min(px[i], px[i + 1], px[i + 2]);
                    if (max < 40 || min > 215) continue;
                    const sat = (max - min) / (max || 1);
                    const wgt = sat * sat + 0.02;
                    r += px[i] * wgt; g += px[i + 1] * wgt; b += px[i + 2] * wgt;
                    weight += wgt;
                }
                if (!weight) return resolve(null);
                resolve([r / weight, g / weight, b / weight]);
            } catch {
                resolve(null); // canvas tainted (image host without CORS)
            }
        };
        probe.onerror = () => resolve(null);
        probe.src = url;
    });
}

function accentGradient(rgb) {
    if (!rgb) return "linear-gradient(to right, #161516 0%, #161516 40%, #4a4a4c 100%)";
    // Bring the accent to a mid brightness so it's never muddy or neon
    const peak = Math.max(...rgb);
    const k = peak ? Math.min(1.4, Math.max(0.6, 150 / peak)) : 1;
    const [r, g, b] = rgb.map(v => Math.min(255, Math.round(v * k)));
    const dark = `rgb(${Math.round(r * 0.13 + 8)}, ${Math.round(g * 0.13 + 8)}, ${Math.round(b * 0.13 + 8)})`;
    return `linear-gradient(to right, ${dark} 0%, ${dark} 40%, rgb(${r}, ${g}, ${b}) 100%)`;
}

async function applyAccent(button, item, url) {
    const key = String(item.id);
    const cache = readAccents();
    let rgb = cache[key];
    if (!rgb) {
        rgb = await sampleAccent(url);
        if (rgb) {
            cache[key] = rgb;
            try { localStorage.setItem(ACCENT_KEY, JSON.stringify(cache)); } catch {}
        }
    }
    button.style.background = accentGradient(rgb);
}

function buildBtsCard(item) {
    const card = h("div", "bonus-card");
    card.appendChild(buildCard(item, "poster", () => openBts(item)));

    const button = h("button", "bts-discover", "Discover More");
    button.style.background = accentGradient(null); // neutral until the colour is known
    button.addEventListener("click", () => openBts(item));
    card.appendChild(button);

    // Colour comes from the real poster (looked up if it wasn't saved)
    const known = item.poster
        ? Promise.resolve(item.poster)
        : fetchPosterUrl(item.id, item.type || "movie").then(url => url || item.img);
    known.then(url => { if (url) applyAccent(button, item, url); });
    return card;
}

function btsCandidates(liked, list) {
    const seen = new Set();
    return [...liked, ...list].filter(item => {
        const key = String(item.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, 12);
}

let renderToken = 0;

// Lists are filtered through the profile's viewing restrictions / Kids setting
// (profiles.js) before they're drawn.
async function renderAll() {
    const token = ++renderToken;
    const [liked, list, recent] = await Promise.all([
        allowedItems(getLiked()), allowedItems(getMyList()), allowedItems(getRecentlyWatched())
    ]);
    if (token !== renderToken) return; // a newer render superseded this one

    renderRow("liked-cards", liked, buildLikedCard,
        "Tap the thumb on any title to add it here.");
    renderRow("mylist-cards", list, item => buildCard(item, "poster"),
        "Your list is empty — tap \"Add to List\" on any title from Home or Search.");
    renderRow("recently-watched-cards", recent, item => buildCard(item, "poster"),
        "Play a trailer from Home or Search and it'll show up here.");
    const clear = $("recent-clear");
    if (clear) clear.style.visibility = getRecentlyWatched().length ? "visible" : "hidden";
    renderRow("bts-cards", btsCandidates(liked, list), buildBtsCard,
        "Like a title or add it to My List to unlock behind-the-scenes extras.");

    if (!$("mylist-modal").classList.contains("hidden")) renderMyListSheet();
}

/* ==========================================================
   MY LIST SHEET
========================================================== */

const SORTS = [
    { id: "top", label: "Top matches" },
    { id: "added", label: "Date added to list" },
    { id: "az", label: "A–Z" },
    { id: "release", label: "Release date" }
];

const ml = { type: null, sort: "top", editing: false };
const REVEAL = 100; // px of red delete button revealed by a swipe
let openRow = null;
let lastSwipeAt = 0;

function visibleMyList() {
    let list = getMyList().filter(isAllowedCached); // stored newest-first, restricted titles hidden
    if (ml.type) list = list.filter(item => (item.type || "movie") === ml.type);

    if (ml.sort === "top") {
        const score = item => typeof matchPercent === "function" ? matchPercent(item) : (item.rating || 0) * 10;
        list.sort((a, b) => score(b) - score(a));
    }
    if (ml.sort === "az") list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    if (ml.sort === "release") list.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
    return list; // "added" keeps stored order
}

function closeOpenRow() {
    if (openRow) openRow.style.transform = "";
    openRow = null;
}

function attachSwipe(slide) {
    let startX = 0, startY = 0, base = 0, x = 0;
    let decided = false, dragging = false;

    slide.style.touchAction = "pan-y";

    slide.addEventListener("pointerdown", e => {
        startX = e.clientX;
        startY = e.clientY;
        base = openRow === slide ? -REVEAL : 0;
        x = base;
        decided = false;
        dragging = false;
        if (openRow && openRow !== slide) closeOpenRow();
    });

    slide.addEventListener("pointermove", e => {
        if (e.pointerType === "mouse" && e.buttons === 0) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (!decided && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
            decided = true;
            dragging = Math.abs(dx) > Math.abs(dy);
            if (dragging) slide.setPointerCapture(e.pointerId);
        }
        if (!dragging) return;

        x = Math.max(-REVEAL, Math.min(0, base + dx));
        slide.style.transition = "none";
        slide.style.transform = `translateX(${x}px)`;
    });

    const end = () => {
        if (!dragging) return;
        dragging = false;
        lastSwipeAt = Date.now();
        slide.style.transition = "";
        if (x < -REVEAL / 2) {
            slide.style.transform = `translateX(-${REVEAL}px)`;
            openRow = slide;
        } else {
            slide.style.transform = "";
            if (openRow === slide) openRow = null;
        }
    };
    slide.addEventListener("pointerup", end);
    slide.addEventListener("pointercancel", end);
}

function removeFromMyList(item, row) {
    row.classList.add("removing");
    setTimeout(() => toggleMyList(item), 180); // state event re-renders the sheet
}

function buildMyListRow(item) {
    const row = h("div", "ml-row");
    const slide = h("div", "ml-slide");

    const thumb = document.createElement("img");
    thumb.className = "ml-thumb";
    thumb.alt = "";
    thumb.loading = "lazy";
    thumb.src = item.img || posterImgFor(item);

    const title = h("p", "ml-title", item.title || "");

    const open = () => {
        if (ml.editing) return;
        if (Date.now() - lastSwipeAt < 350) return; // that was a swipe, not a tap
        if (openRow) { closeOpenRow(); return; }     // first tap just closes the button
        openItem(item);
    };
    thumb.addEventListener("click", open);
    title.addEventListener("click", open);

    let action;
    if (ml.editing) {
        action = h("button", "ml-trash");
        action.setAttribute("aria-label", "Remove from My List");
        action.appendChild(makeIcon("mylist", "delete", true));
        action.addEventListener("click", () => removeFromMyList(item, row));
    } else {
        action = h("button", "ml-play");
        action.setAttribute("aria-label", `Play trailer for ${item.title}`);
        action.appendChild(makeIcon("mylist", "play", false));
        action.addEventListener("click", () => {
            if (openRow) { closeOpenRow(); return; }
            openMiniPlayer(item);
        });
    }

    slide.append(thumb, title, action);

    if (!ml.editing) {
        const del = h("button", "ml-delete");
        del.setAttribute("aria-label", "Remove from My List");
        const trashImg = makeIcon("mylist", "delete", false);
        // A red trash icon on the red button would vanish: use a dark button instead.
        trashImg.addEventListener("load", () => {
            if (!/delete-off|trash-off/.test(trashImg.dataset.usedFile || "")) del.classList.add("alt");
        });
        del.appendChild(trashImg);
        del.addEventListener("click", () => removeFromMyList(item, row));
        row.appendChild(del);
        attachSwipe(slide);
    }

    row.appendChild(slide);
    return row;
}

function renderFilters() {
    const box = $("ml-filters");
    box.innerHTML = "";

    const mk = (label, type) => {
        const chip = h("button", "chip", label);
        chip.addEventListener("click", () => { ml.type = type; renderMyListSheet(); });
        return chip;
    };

    if (ml.type) {
        const clear = h("button", "chip clear");
        clear.setAttribute("aria-label", "Clear filter");
        clear.appendChild(makeIcon("mylist", "close", false));
        clear.addEventListener("click", () => { ml.type = null; renderMyListSheet(); });

        const chosen = h("button", "chip selected", ml.type === "tv" ? "Series" : "Films");
        chosen.addEventListener("click", () => { ml.type = null; renderMyListSheet(); });
        box.append(clear, chosen);
    } else {
        box.append(mk("Series", "tv"), mk("Films", "movie"));
    }
}

function renderSortMenu() {
    const menu = $("ml-sort-menu");
    menu.innerHTML = "";
    SORTS.forEach(opt => {
        const item = h("button", "sort-item");
        const tick = h("span", "sort-tick");
        if (opt.id === ml.sort) tick.appendChild(makeIcon("mylist", "check", true));
        item.append(tick, h("span", null, opt.label));
        item.addEventListener("click", () => {
            ml.sort = opt.id;
            menu.classList.add("hidden");
            renderMyListSheet();
        });
        menu.appendChild(item);
    });
}

function renderMyListSheet() {
    closeOpenRow();
    renderFilters();
    renderSortMenu();
    $("ml-sort-label").textContent = SORTS.find(s => s.id === ml.sort).label;
    setIcon($("ml-sort").querySelector("img"), "mylist", "sort",
        !$("ml-sort-menu").classList.contains("hidden")); // chevron follows the menu
    $("ml-title").textContent = ml.editing ? "Edit" : "My List";

    // Pencil <-> "Done"
    const editBtn = $("ml-edit");
    editBtn.innerHTML = "";
    if (ml.editing) editBtn.appendChild(h("span", "edit-done", "Done"));
    else editBtn.appendChild(makeIcon("mylist", "edit", false));

    const rows = $("ml-rows");
    rows.innerHTML = "";
    const list = visibleMyList();
    if (!list.length) {
        rows.appendChild(h("p", "empty-row-message",
            getMyList().length ? "Nothing matches this filter." : "Your list is empty."));
        return;
    }
    list.forEach(item => rows.appendChild(buildMyListRow(item)));
}

function openMyListSheet() {
    ml.type = null;
    ml.sort = "top";
    ml.editing = false;
    $("ml-sort-menu").classList.add("hidden");
    renderMyListSheet();
    showSheet($("mylist-modal"));
}

function closeMyListSheet() {
    closeOpenRow();
    hideSheet($("mylist-modal"));
}

function wireMyListSheet() {
    $("mylist-see-all")?.addEventListener("click", openMyListSheet);
    $("ml-close")?.addEventListener("click", closeMyListSheet);

    $("ml-edit")?.addEventListener("click", () => {
        ml.editing = !ml.editing;
        renderMyListSheet();
    });

    $("ml-sort")?.addEventListener("click", e => {
        e.stopPropagation();
        const menu = $("ml-sort-menu");
        menu.classList.toggle("hidden");
        const img = $("ml-sort").querySelector("img");
        setIcon(img, "mylist", "sort", !menu.classList.contains("hidden"));
    });

    // tap anywhere else closes the sort menu / an open swipe button
    $("mylist-modal")?.addEventListener("click", e => {
        if (!e.target.closest("#ml-sort") && !e.target.closest("#ml-sort-menu")) {
            const menu = $("ml-sort-menu");
            if (!menu.classList.contains("hidden")) {
                menu.classList.add("hidden");
                setIcon($("ml-sort").querySelector("img"), "mylist", "sort", false);
            }
        }
        if (e.target === $("mylist-modal")) closeMyListSheet();
    });
}

/* ==========================================================
   BEHIND THE SCENES SHEET
   Built from TMDB: videos (teasers, featurettes, behind the scenes...),
   cast, viewer reviews, photos and - for series - episodes.
========================================================== */

let btsToken = 0;

function ytThumb(key) {
    return `https://i.ytimg.com/vi/${key}/hqdefault.jpg`;
}

function buildVideoCard(v) {
    const card = h("div", "bts-video");
    const thumb = h("div", "bts-thumb");
    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = "";
    img.src = ytThumb(v.key);
    thumb.append(img, h("span", "play-badge"));
    card.append(thumb, h("p", "bts-video-title", v.name || ""), h("p", "bts-video-type", v.type || ""));
    card.addEventListener("click", () => playKey(v.key, v.name));
    return card;
}

function ytVideos(data) {
    return (data.videos?.results || []).filter(v => v.site === "YouTube");
}

function facts(data, type) {
    const parts = [];
    const year = (data.release_date || data.first_air_date || "").split("-")[0];
    if (year) parts.push(year);
    if (type === "tv") {
        if (data.number_of_seasons) parts.push(`${data.number_of_seasons} Season${data.number_of_seasons > 1 ? "s" : ""}`);
    } else if (data.runtime) {
        parts.push(`${Math.floor(data.runtime / 60)}h ${data.runtime % 60}m`);
    }
    if (data.vote_average) parts.push(`★ ${data.vote_average.toFixed(1)}`);
    if (data.genres?.length) parts.push(data.genres.slice(0, 3).map(g => g.name).join(", "));
    return parts.join("  ·  ");
}

function renderFeatured(body, data, item, type) {
    const hero = h("div", "bts-hero");
    const img = document.createElement("img");
    img.alt = "";
    img.src = data.backdrop_path ? `${TMDB_IMG}/w780${data.backdrop_path}` : posterImgFor(item);
    hero.appendChild(img);

    const trailer = ytVideos(data).sort((a, b) => videoRank(a) - videoRank(b))[0];
    if (trailer) {
        const play = h("button", "bts-hero-play");
        play.append(h("span", "play-badge"), h("span", null, "Watch trailer"));
        play.addEventListener("click", () => playKey(trailer.key, data.title || data.name));
        hero.appendChild(play);
    }
    body.appendChild(hero);

    body.appendChild(h("h2", "bts-heading", data.title || data.name || item.title));
    if (data.tagline) body.appendChild(h("p", "bts-tagline", data.tagline));
    body.appendChild(h("p", "bts-facts", facts(data, type)));
    if (data.overview) body.appendChild(h("p", "bts-overview", data.overview));

    const cast = (data.credits?.cast || []).slice(0, 14)
        .map(c => ({ id: c.id, name: c.name, character: c.character || "", photo: c.profile_path }));
    if (cast.length) {
        body.appendChild(h("h3", "bts-subheading", "Meet the cast"));
        // tap an actor for their biography
        body.appendChild(buildCastStrip(cast, member => openBioCard(member)));
    }

    // ten-star ratings, critic scores (IMDb / Rotten Tomatoes / Metacritic with an OMDb key)
    // and viewer reviews with "Show more reviews"
    const reviewsHolder = h("div", "bts-reviews");
    body.appendChild(reviewsHolder);
    renderReviewsSection(reviewsHolder, {
        id: item.id,
        type,
        title: data.title || data.name || item.title,
        data
    });
}

function renderLatest(body, data) {
    const vids = ytVideos(data)
        .sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0))
        .slice(0, 8);
    if (!vids.length) {
        body.appendChild(h("p", "empty-row-message", "Nothing new for this title yet."));
        return;
    }
    body.appendChild(h("h2", "bts-heading", "Latest"));
    const grid = h("div", "bts-video-grid single");
    vids.forEach(v => grid.appendChild(buildVideoCard(v)));
    body.appendChild(grid);
}

function renderVideos(body, data) {
    const vids = ytVideos(data);
    if (!vids.length) {
        body.appendChild(h("p", "empty-row-message", "No videos available for this title."));
        return;
    }
    body.appendChild(h("h2", "bts-heading", "Videos"));

    const groups = [
        ["All", () => true],
        ["Trailers", v => v.type === "Trailer"],
        ["Teasers", v => v.type === "Teaser"],
        ["Behind the Scenes", v => v.type === "Behind the Scenes"],
        ["Featurettes", v => v.type === "Featurette"],
        ["Clips", v => v.type === "Clip"],
        ["Bloopers", v => v.type === "Bloopers"]
    ].filter(([label, fn]) => label === "All" || vids.some(fn));

    let active = groups[0];
    const chips = h("div", "bts-chips");
    const grid = h("div", "bts-video-grid");

    const paint = () => {
        chips.querySelectorAll(".bts-chip").forEach((c, i) => c.classList.toggle("active", groups[i] === active));
        grid.innerHTML = "";
        vids.filter(active[1]).forEach(v => grid.appendChild(buildVideoCard(v)));
    };

    groups.forEach(g => {
        const chip = h("button", "bts-chip", g[0]);
        chip.addEventListener("click", () => { active = g; paint(); });
        chips.appendChild(chip);
    });

    body.append(chips, grid);
    paint();
}

function renderPhotos(body, data) {
    const pics = (data.images?.backdrops || []).slice(0, 12);
    if (!pics.length) {
        body.appendChild(h("p", "empty-row-message", "No photos available for this title."));
        return;
    }
    body.appendChild(h("h2", "bts-heading", "Photos"));
    const grid = h("div", "bts-video-grid");
    pics.forEach(p => {
        const img = document.createElement("img");
        img.className = "bts-photo";
        img.loading = "lazy";
        img.alt = "";
        img.src = `${TMDB_IMG}/w500${p.file_path}`;
        grid.appendChild(img);
    });
    body.appendChild(grid);
}

function renderEpisodes(body, data, item) {
    const seasons = (data.seasons || []).filter(s => s.season_number > 0);
    if (!seasons.length) {
        body.appendChild(h("p", "empty-row-message", "No episode information available."));
        return;
    }
    body.appendChild(h("h2", "bts-heading", "Episodes"));

    const chips = h("div", "bts-chips");
    const list = h("div", "episode-list");
    body.append(chips, list);

    const load = async season => {
        chips.querySelectorAll(".bts-chip").forEach((c, i) => c.classList.toggle("active", seasons[i] === season));
        list.innerHTML = "";
        list.appendChild(h("p", "empty-row-message", "Loading…"));
        try {
            const res = await fetch(`${TMDB_API}/tv/${item.id}/season/${season.season_number}?api_key=${API_KEY}`);
            const sdata = await res.json();
            list.innerHTML = "";
            (sdata.episodes || []).forEach(ep => {
                const card = h("div", "episode");
                const img = document.createElement("img");
                img.loading = "lazy";
                img.alt = "";
                img.src = ep.still_path ? `${TMDB_IMG}/w300${ep.still_path}` : posterImgFor(item);
                card.append(img, h("p", "episode-title", `${ep.episode_number}. ${ep.name}`),
                    h("p", "episode-overview", ep.overview || ""));
                list.appendChild(card);
            });
        } catch {
            list.innerHTML = "";
            list.appendChild(h("p", "empty-row-message", "Couldn't load episodes."));
        }
    };

    seasons.forEach(s => {
        const chip = h("button", "bts-chip", s.name || `Season ${s.season_number}`);
        chip.addEventListener("click", () => load(s));
        chips.appendChild(chip);
    });
    load(seasons[0]);
}

async function openBts(item) {
    const sheet = $("bts-modal");
    const tabs = $("bts-tabs");
    const body = $("bts-body");
    const type = item.type || "movie";
    const token = ++btsToken;

    $("bts-title").textContent = item.title || "";
    tabs.innerHTML = "";
    body.innerHTML = "";
    body.appendChild(h("p", "empty-row-message", "Loading extras…"));
    showSheet(sheet);

    let data;
    try {
        const url = `${TMDB_API}/${type}/${item.id}?api_key=${API_KEY}` +
            `&append_to_response=videos,images,credits,reviews,external_ids` +
            `&include_video_language=en,null&include_image_language=en,null`;
        data = await (await fetch(url)).json();
    } catch {
        body.innerHTML = "";
        body.appendChild(h("p", "empty-row-message", "Couldn't load extras right now."));
        return;
    }
    if (token !== btsToken) return;

    const sections = [
        ["Featured", b => renderFeatured(b, data, item, type)],
        ["Latest", b => renderLatest(b, data)],
        ["Videos", b => renderVideos(b, data)],
        type === "tv"
            ? ["Episodes", b => renderEpisodes(b, data, item)]
            : ["Photos", b => renderPhotos(b, data)]
    ];

    const show = idx => {
        tabs.querySelectorAll(".bts-tab").forEach((t, i) => t.classList.toggle("active", i === idx));
        body.innerHTML = "";
        body.scrollTop = 0;
        sections[idx][1](body);
    };

    sections.forEach(([label], i) => {
        const tab = h("button", "bts-tab", label);
        tab.addEventListener("click", () => show(i));
        tabs.appendChild(tab);
    });
    show(0);
}

function closeBts() {
    btsToken++;
    hideSheet($("bts-modal"));
}

/* ==========================================================
   PROFILE SWITCHER POPUP
========================================================== */

let ppManaging = false; // "Manage Profiles" mode inside the popup

async function editProfileFromPopup(profile) {
    const result = await openProfileEditor({ mode: "edit", profile });
    if (result?.deleted) {
        const wasCurrent = result.deleted === currentProfile().id;
        deleteProfile(result.deleted);
        if (wasCurrent) { location.reload(); return; }
    }
    renderProfilePopup();
}

function renderProfilePopup() {
    const cur = currentProfile();
    const panel = document.querySelector(".profiles-panel");
    panel?.classList.toggle("managing", ppManaging);

    // header chip
    const logo = document.querySelector(".switch-logo");
    const label = document.querySelector(".switch-div .foryou");
    if (logo) logo.src = cur.avatar;
    if (label) label.textContent = cur.name;

    // current profile card
    $("pp-avatar").src = cur.avatar;
    $("pp-name").textContent = cur.name;
    $("pp-handle").textContent = cur.kids ? "Kids profile" : "";
    $("pp-edit").innerHTML = PE_ICONS.pencil;

    // everyone else (+ an Add tile while managing, until the 5-profile limit)
    const others = $("pp-others");
    others.innerHTML = "";
    getProfiles().filter(p => p.id !== cur.id).forEach(p => {
        const btn = h("button", "pp-other");
        const thumb = h("div", "pp-thumb");
        const img = document.createElement("img");
        img.alt = "";
        img.src = p.avatar;
        thumb.appendChild(img);
        if (ppManaging) {
            const pencil = h("span", "pp-pencil");
            pencil.innerHTML = PE_ICONS.pencil;
            thumb.appendChild(pencil);
        }
        btn.append(thumb, h("span", null, p.name));
        btn.addEventListener("click", async () => {
            if (ppManaging) { editProfileFromPopup(p); return; }
            if (!(await requirePin(p))) return;
            setCurrentProfile(p.id);
            location.reload(); // every row reads the new profile's own data
        });
        others.appendChild(btn);
    });

    if (ppManaging && getProfiles().length < MAX_PROFILES) {
        const add = h("button", "pp-other");
        add.appendChild(h("div", "pp-thumb plus"));
        add.appendChild(h("span", null, "Add"));
        add.addEventListener("click", async () => {
            await openProfileEditor({ mode: "add" });
            renderProfilePopup();
        });
        others.appendChild(add);
    }

    const manage = $("pp-manage");
    manage.textContent = ppManaging ? "Done" : "Manage Profiles";
    manage.classList.toggle("done", ppManaging);
}

function wireProfileSwitcher() {
    const modal = $("profile-modal");
    const trigger = document.querySelector(".switch-div");
    const closeBtn = $("close-modal");
    if (!modal) return;

    const open = () => {
        ppManaging = false;
        renderProfilePopup();
        void modal.offsetHeight; // commit the hidden state first so the open animates
        modal.classList.remove("hidden");
        lockScroll();
    };
    const close = () => {
        modal.classList.add("hidden");
        unlockScroll();
    };

    trigger?.addEventListener("click", open);
    closeBtn?.addEventListener("click", close);

    // Click on the dimmed backdrop (anywhere outside the panel) closes it
    modal.addEventListener("click", e => {
        if (e.target === modal) close();
    });

    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && !modal.classList.contains("hidden") && !document.querySelector(".pe-modal:not(.hidden)")) close();
    });

    // Manage Profiles <-> Done, right here in the popup
    $("pp-manage")?.addEventListener("click", () => {
        ppManaging = !ppManaging;
        renderProfilePopup();
    });

    // the pencil on the main card, or its picture while managing, edits the current profile
    $("pp-edit")?.addEventListener("click", () => editProfileFromPopup(currentProfile()));
    $("pp-avatar")?.addEventListener("click", () => { if (ppManaging) editProfileFromPopup(currentProfile()); });

    // saved edits show up straight away (name, avatar)
    document.addEventListener("notflix:profiles", renderProfilePopup);
    renderProfilePopup();
}

// "Clear" for Recently Viewed: two taps (no native confirm popup)
function wireClearRecent() {
    const btn = $("recent-clear");
    if (!btn) return;
    let armed = null;

    btn.addEventListener("click", () => {
        if (armed) {
            clearTimeout(armed);
            armed = null;
            btn.textContent = "Clear";
            clearRecentlyWatched(); // emits notflix:state -> the row redraws
            return;
        }
        btn.textContent = "Tap again to clear";
        armed = setTimeout(() => { armed = null; btn.textContent = "Clear"; }, 3000);
    });
}

function init() {
    wireClearRecent();
    renderAll();
    wireMyListSheet();
    wireProfileSwitcher();

    $("bts-close")?.addEventListener("click", closeBts);
    $("bts-modal")?.addEventListener("click", e => { if (e.target === $("bts-modal")) closeBts(); });

    // Re-render whenever My List / Liked / Recently Watched change
    document.addEventListener("notflix:state", renderAll);
    // taste data arrived -> "Top matches" order can change
    document.addEventListener("notflix:taste", () => {
        if (!$("mylist-modal").classList.contains("hidden")) renderMyListSheet();
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
