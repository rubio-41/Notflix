const API_KEY = "49a985b7ac7bea35802cc034cbbe3655";

const trailerCache = {};
const detailsCache = {};
const watchProvidersCache = {};

// Tracks whatever title the main modal view currently has open (movie OR tv),
// so the "more" info page, the back button, the My List toggle, and Recently
// Watched tracking all know what they're working with.
let activeMovieId = null;
let activeMovieTitle = "";
let activeMediaType = "movie";
let activeMovieSummary = null;

function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(`${dateStr}T00:00:00`);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/* WHERE TO WATCH (streaming/rent/buy providers, US region) - works the
   same way for movie/{id} and tv/{id}. */
async function getWatchProviders(id, type) {
    const cacheKey = `${type}:${id}`;
    if (watchProvidersCache[cacheKey] !== undefined) return watchProvidersCache[cacheKey];

    try {
        const res = await fetch(
            `https://api.themoviedb.org/3/${type}/${id}/watch/providers?api_key=${API_KEY}`
        );
        const data = await res.json();
        const results = data.results || {};
        const region = results.US || results[Object.keys(results)[0]] || null;
        watchProvidersCache[cacheKey] = region;
        return region;
    } catch {
        watchProvidersCache[cacheKey] = null;
        return null;
    }
}

function renderWhereToWatch(id, type) {
    const container = document.getElementById("watch-providers");
    if (!container) return;
    container.innerHTML = `<p class="tab-loading">Loading…</p>`;

    getWatchProviders(id, type).then(providers => {
        container.innerHTML = "";

        const sections = [
            { key: "flatrate", label: "Stream" },
            { key: "rent", label: "Rent" },
            { key: "buy", label: "Buy" }
        ];

        let hasAny = false;

        sections.forEach(({ key, label }) => {
            const list = providers?.[key];
            if (!list || !list.length) return;
            hasAny = true;

            const section = document.createElement("div");
            section.className = "watch-section";

            const heading = document.createElement("h4");
            heading.className = "watch-heading";
            heading.textContent = label;
            section.appendChild(heading);

            const row = document.createElement("div");
            row.className = "watch-provider-row";

            [...list]
                .sort((a, b) => (a.display_priority || 0) - (b.display_priority || 0))
                .forEach(p => {
                    const item = document.createElement("div");
                    item.className = "watch-provider";

                    const img = document.createElement("img");
                    img.loading = "lazy";
                    img.alt = p.provider_name;
                    img.src = `https://image.tmdb.org/t/p/w92${p.logo_path}`;
                    item.appendChild(img);

                    const name = document.createElement("span");
                    name.textContent = p.provider_name;
                    item.appendChild(name);

                    row.appendChild(item);
                });

            section.appendChild(row);
            container.appendChild(section);
        });

        if (!hasAny) {
            container.innerHTML = `<p class="tab-empty">Not currently available to stream, rent, or buy.</p>`;
            return;
        }

        const attribution = document.createElement("p");
        attribution.className = "watch-attribution";
        attribution.textContent = "Streaming availability data provided by JustWatch.";
        container.appendChild(attribution);
    });
}

/* TRAILER - /movie/{id}/videos or /tv/{id}/videos */
async function getTrailer(id, type) {
    const cacheKey = `${type}:${id}`;
    if (trailerCache[cacheKey] !== undefined) return trailerCache[cacheKey];

    try {
        const res = await fetch(
            `https://api.themoviedb.org/3/${type}/${id}/videos?api_key=${API_KEY}`
        );

        const data = await res.json();

        const trailer =
            data.results.find(v => v.site === "YouTube" && v.type === "Trailer") ||
            data.results.find(v => v.site === "YouTube") ||
            null;

        trailerCache[cacheKey] = trailer ? trailer.key : null;
        return trailerCache[cacheKey];

    } catch {
        return null;
    }
}

/* DETAILS - unified shape for movies and TV shows.
   Movie: runtime, releaseDate, certification, genres, cast, director.
   TV: numberOfSeasons, lastAirYear, certification, genres, cast, creators,
       and the full season list (name, episode count, air date, overview). */
async function getDetails(id, type) {
    const cacheKey = `${type}:${id}`;
    if (detailsCache[cacheKey] !== undefined) return detailsCache[cacheKey];

    try {
        if (type === "tv") {
            const res = await fetch(
                `https://api.themoviedb.org/3/tv/${id}?api_key=${API_KEY}&append_to_response=credits,content_ratings`
            );
            const data = await res.json();

            const creators = (data.created_by || []).map(c => ({ id: c.id, name: c.name, photo: c.profile_path || null }));
            const fullCast = (data.credits?.cast || []).map(c => ({ id: c.id, name: c.name, character: c.character || "", photo: c.profile_path || null }));

            const usRating = (data.content_ratings?.results || []).find(r => r.iso_3166_1 === "US");
            const certification = usRating?.rating || null;

            // Skip "Specials" (season 0) when the show has real numbered
            // seasons too - keep it if it's genuinely all TMDB has on file.
            const numbered = (data.seasons || []).filter(s => s.season_number > 0);
            const seasonSource = numbered.length ? numbered : (data.seasons || []);

            const seasons = seasonSource.map(s => ({
                seasonNumber: s.season_number,
                name: s.name,
                episodeCount: s.episode_count,
                airDate: s.air_date,
                overview: s.overview,
                poster: s.poster_path ? `https://image.tmdb.org/t/p/w300${s.poster_path}` : null
            }));

            // "Production year" for a show is the year of its most recent
            // season, i.e. last_air_date - not when it first premiered.
            const lastAirYear = (data.last_air_date || "").split("-")[0] || null;

            const details = {
                type: "tv",
                numberOfSeasons: data.number_of_seasons || seasons.length || null,
                lastAirYear,
                genres: (data.genres || []).map(g => ({ id: g.id, name: g.name })),
                cast: fullCast,
                creators,
                certification,
                seasons
            };

            detailsCache[cacheKey] = details;
            return details;
        }

        const res = await fetch(
            `https://api.themoviedb.org/3/movie/${id}?api_key=${API_KEY}&append_to_response=credits,release_dates`
        );

        const data = await res.json();

        const directorRaw = (data.credits?.crew || []).find(c => c.job === "Director");
        // Full cast list (with TMDB person ids) so the "more" info page can
        // list everyone and make each name clickable, not just the top 4.
        const fullCast = (data.credits?.cast || []).map(c => ({ id: c.id, name: c.name, character: c.character || "", photo: c.profile_path || null }));

        const usRelease = (data.release_dates?.results || []).find(
            r => r.iso_3166_1 === "US"
        );
        const certification =
            (usRelease?.release_dates || []).find(rd => rd.certification)?.certification ||
            null;

        // /movie/upcoming is filtered by US release windows, but the plain
        // release_date field below is the movie's earliest release ANYWHERE
        // (often a festival premiere in another country) - which can already
        // be in the past even for a movie that hasn't opened in the US yet.
        // Prefer an actual US release date when TMDB has one on file.
        const usDates = (usRelease?.release_dates || [])
            .map(rd => rd.release_date)
            .filter(Boolean)
            .map(d => d.split("T")[0])
            .sort();
        const releaseDate = usDates.length ? usDates[0] : data.release_date || null;

        const details = {
            type: "movie",
            runtime: data.runtime || null,
            genres: (data.genres || []).map(g => ({ id: g.id, name: g.name })),
            cast: fullCast,
            director: directorRaw ? { id: directorRaw.id, name: directorRaw.name, photo: directorRaw.profile_path || null } : null,
            certification,
            releaseDate
        };

        detailsCache[cacheKey] = details;
        return details;

    } catch {
        detailsCache[cacheKey] = null;
        return null;
    }
}

/* SKELETON */
function showSkeleton(rowId, count = 10) {
    const row = document.getElementById(rowId);
    row.innerHTML = "";

    for (let i = 0; i < count; i++) {
        const skel = document.createElement("div");
        skel.className = "movie skeleton";
        row.appendChild(skel);
    }
}

/* LOAD MOVIES (or TV shows, when type is "tv") */
async function loadMovies(url, rowId, type = "movie") {
    const row = document.getElementById(rowId);
    if (!row) return;

    showSkeleton(rowId, 10);

    try {
        const res = await fetch(url);
        const data = await res.json();

        const items = (data.results || [])
            .filter(item => item.poster_path) // skip entries with no artwork at all
            .map(item => ({
                id: item.id,
                title: item.title || item.name,
                image: item.poster_path
                    ? "https://image.tmdb.org/t/p/w500" + item.poster_path
                    : "https://via.placeholder.com/500x750",
                overview: item.overview,
                rating: item.vote_average,
                year: (item.release_date || item.first_air_date || "").split("-")[0],
                type
            }));

        renderRow(rowId, items);

        // Trailers are no longer prefetched here - with 20+ rows now on the
        // page, prefetching every row's trailers up front would mean
        // hundreds of extra requests on load for previews nobody may ever
        // open. Trailers now load on demand when a card's modal opens.

        if (!items.length) {
            row.closest(".row")?.remove(); // hide rows that came back empty
        }

    } catch (err) {
        console.error(err);
        row.closest(".row")?.remove();
    }
}

/* CATEGORY ROWS: a handful of curated TMDB lists, plus one row per
   official movie genre TMDB has, so the home page fills out the way
   Netflix's own does instead of just 5 fixed shelves. */

// region for "available on Netflix" (en-GB -> GB); US when the browser doesn't say
const WATCH_REGION = ((navigator.language || "en-US").split("-")[1] || "US").toUpperCase();
const rowDate = days => typeof localDateString === "function"
    ? localDateString(days)
    : new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

const STANDARD_ROWS = [
    { title: "Trending Now", url: `https://api.themoviedb.org/3/trending/movie/day?api_key=${API_KEY}` },
    // Netflix availability comes from TMDB's watch-provider data (provider 8 = Netflix),
    // in the viewer's region - not from TMDB's global "popular" list.
    { title: "Popular on Netflix", url: `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&with_watch_providers=8&watch_region=${WATCH_REGION}&with_watch_monetization_types=flatrate&sort_by=popularity.desc&vote_count.gte=50` },
    { title: "Top Rated", url: `https://api.themoviedb.org/3/movie/top_rated?api_key=${API_KEY}` },
    { title: "New Releases", url: `https://api.themoviedb.org/3/movie/now_playing?api_key=${API_KEY}` },
    // Titles that really are still to come, most anticipated first (a year ahead at most)
    { title: "Coming Soon", url: `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}&sort_by=popularity.desc&primary_release_date.gte=${rowDate(1)}&primary_release_date.lte=${rowDate(365)}&with_release_type=2%7C3` },
    { title: "Trending This Week", url: `https://api.themoviedb.org/3/trending/movie/week?api_key=${API_KEY}` }
];

// A couple of genre names read awkwardly as "<Name> Movies" - override those
const GENRE_TITLE_OVERRIDES = {
    "Documentary": "Documentaries",
    "Science Fiction": "Sci-Fi Movies",
    "TV Movie": "TV Movies",
    "Music": "Musicals & Music Movies"
};

async function getMovieGenres() {
    try {
        const res = await fetch(`https://api.themoviedb.org/3/genre/movie/list?api_key=${API_KEY}`);
        const data = await res.json();
        return data.genres || [];
    } catch {
        return [];
    }
}

function createRowSection(rowId, title) {
    const section = document.createElement("section");
    section.className = "row";

    const heading = document.createElement("h3");
    heading.className = "rec";
    heading.textContent = title;
    section.appendChild(heading);

    const wrapper = document.createElement("div");
    wrapper.className = "movies-wrapper";

    const moviesDiv = document.createElement("div");
    moviesDiv.className = "movies";
    moviesDiv.id = rowId;

    wrapper.appendChild(moviesDiv);
    section.appendChild(wrapper);

    return section;
}

async function buildAllRows() {
    const container = document.getElementById("rows-container");
    if (!container) return;

    let rowCount = 0;

    // Curated lists first, same as Netflix leads with "Trending"/"Popular"
    STANDARD_ROWS.forEach(row => {
        const rowId = `row-${rowCount++}`;
        const section = createRowSection(rowId, row.title);
        container.appendChild(section);
        registerRowSection(row.title, section);
        registerCategoryDef(row.title, { type: "standard", url: row.url });
        loadMovies(row.url, rowId, "movie");
    });

    // Then a row for every genre TMDB has on file
    const genres = await getMovieGenres();

    genres.forEach(genre => {
        const title = GENRE_TITLE_OVERRIDES[genre.name] || `${genre.name} Movies`;
        const url =
            `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}` +
            `&with_genres=${genre.id}&sort_by=popularity.desc&include_adult=false`;
        const rowId = `row-${rowCount++}`;

        const section = createRowSection(rowId, title);
        container.appendChild(section);
        registerRowSection(title, section);
        registerCategoryDef(title, { type: "genre", genreId: genre.id, genreName: genre.name });
        loadMovies(url, rowId, "movie");
    });

    populateCategoriesDropdown();
}

/* ==========================================================
   CATEGORIES DROPDOWN (movies)
   Lists every category the page can actually back with real data -
   the curated lists plus every genre TMDB has - and jumps straight
   to that row when tapped. Nothing in here is decorative; every
   entry corresponds to a row that's actually on the page.
========================================================== */

const rowSections = {}; // title -> <section>, filled in as rows are built
const categoryDefs = {}; // title -> { type: "standard"|"genre", url or genreId/genreName }

function registerRowSection(title, section) {
    rowSections[title] = section;
}

function registerCategoryDef(title, def) {
    categoryDefs[title] = def;
}

function toggleCategoriesDropdown(forceOpen) {
    const dropdown = document.getElementById("categories-dropdown");
    const button = document.getElementById("header-button4");
    if (!dropdown || !button) return;

    const shouldOpen = forceOpen !== undefined ? forceOpen : dropdown.classList.contains("hidden");

    if (!shouldOpen) {
        dropdown.classList.add("hidden");
        return;
    }

    const rect = button.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 24);
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));

    dropdown.style.width = `${width}px`;
    dropdown.style.left = `${left}px`;
    dropdown.style.top = `${rect.bottom + 10}px`;
    dropdown.classList.remove("hidden");
}

function populateCategoriesDropdown() {
    const list = document.getElementById("categories-list");
    if (!list) return;

    const titles = Object.keys(rowSections).sort((a, b) => a.localeCompare(b));

    list.innerHTML = "";
    const fragment = document.createDocumentFragment();

    titles.forEach(title => {
        const item = document.createElement("div");
        item.className = "categories-item";
        item.textContent = title;

        item.addEventListener("click", () => {
            toggleCategoriesDropdown(false);
            openCategoryModal(title);
        });

        fragment.appendChild(item);
    });

    list.appendChild(fragment);
}

document.getElementById("header-button4")?.addEventListener("click", e => {
    e.stopPropagation();
    toggleCategoriesDropdown();
});

document.addEventListener("click", e => {
    const dropdown = document.getElementById("categories-dropdown");
    if (!dropdown || dropdown.classList.contains("hidden")) return;
    if (!dropdown.contains(e.target) && e.target.id !== "header-button4") {
        toggleCategoriesDropdown(false);
    }
});

document.addEventListener("keydown", e => {
    if (e.key === "Escape") toggleCategoriesDropdown(false);
});

// The header collapses/expands on scroll (see index.js), which would
// leave the dropdown's position stale - simplest fix is to just close it.
window.addEventListener("scroll", () => toggleCategoriesDropdown(false));

/* ==========================================================
   FULL-SCREEN CATEGORY BROWSER (movies)
   Opened from the dropdown above. Genre categories get a few curated
   sub-rows (Top Picks / New / Top Rated), the same trick Netflix's own
   genre pages use. The standard curated lists (Trending Now, etc.)
   don't really have meaningful sub-categories to split by, so those
   just fill the page with one big scrollable poster grid instead.
   This same "category-view" overlay is reused by the TV Shows browser
   below (see openShowsBrowser).
========================================================== */

let categoryRequestToken = 0;

function closeCategoryModal() {
    document.getElementById("category-view")?.classList.add("hidden");
    unlockScroll();
}

async function openCategoryModal(title) {
    const def = categoryDefs[title];
    const overlay = document.getElementById("category-view");
    const body = document.getElementById("category-view-body");
    const heading = document.getElementById("category-view-title");
    if (!def || !overlay || !body || !heading) return;

    const thisRequest = ++categoryRequestToken;

    heading.textContent = title;
    body.innerHTML = `<p class="tab-loading">Loading…</p>`;
    overlay.classList.remove("hidden");
    lockScroll();

    if (def.type === "genre") {
        body.innerHTML = "";

        const today = new Date().toISOString().split("T")[0];
        const subRows = [
            {
                label: "Today's Top Picks for You",
                url:
                    `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}` +
                    `&with_genres=${def.genreId}&sort_by=popularity.desc&include_adult=false`
            },
            {
                label: `New in ${def.genreName}`,
                url:
                    `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}` +
                    `&with_genres=${def.genreId}&sort_by=primary_release_date.desc` +
                    `&primary_release_date.lte=${today}&vote_count.gte=20&include_adult=false`
            },
            {
                label: `Top Rated ${def.genreName}`,
                url:
                    `https://api.themoviedb.org/3/discover/movie?api_key=${API_KEY}` +
                    `&with_genres=${def.genreId}&sort_by=vote_average.desc&vote_count.gte=200&include_adult=false`
            }
        ];

        subRows.forEach((sub, i) => {
            if (thisRequest !== categoryRequestToken) return;

            const rowId = `cat-row-${thisRequest}-${i}`;
            const section = createRowSection(rowId, sub.label);
            body.appendChild(section);
            loadMovies(sub.url, rowId, "movie");
        });
    } else {
        // Standard/curated category: one big scrollable poster grid,
        // several pages deep so there's actually something to scroll through.
        const grid = document.createElement("div");
        grid.className = "more-like-grid category-grid";
        body.innerHTML = "";
        body.appendChild(grid);

        const allMovies = [];

        for (let page = 1; page <= 5; page++) {
            if (thisRequest !== categoryRequestToken) return; // a newer category was opened

            try {
                const res = await fetch(`${def.url}&page=${page}`);
                const data = await res.json();
                allMovies.push(...(data.results || []));
                renderCategoryGrid(grid, allMovies, "movie");
            } catch (err) {
                console.error(err);
                break;
            }
        }

        if (thisRequest === categoryRequestToken && !allMovies.length) {
            body.innerHTML = `<p class="tab-empty">Nothing found for "${title}" right now.</p>`;
        }
    }
}

function renderCategoryGrid(grid, items, type) {
    grid.innerHTML = "";
    const fragment = document.createDocumentFragment();

    items
        .filter(item => item.poster_path)
        .forEach(item => {
            const card = document.createElement("div");
            card.className = "more-like-card";

            const img = document.createElement("img");
            img.loading = "lazy";
            img.alt = item.title || item.name;
            img.src = `https://image.tmdb.org/t/p/w342${item.poster_path}`;
            card.appendChild(img);

            card.addEventListener("click", () => {
                openModal({
                    id: item.id,
                    title: item.title || item.name,
                    desc: item.overview,
                    img: item.backdrop_path
                        ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}`
                        : img.src,
                    rating: item.vote_average,
                    year: (item.release_date || item.first_air_date || "").split("-")[0],
                    type
                });
            });

            fragment.appendChild(card);
        });

    grid.appendChild(fragment);
}

document.getElementById("category-close-btn")?.addEventListener("click", closeCategoryModal);

/* ==========================================================
   TV SHOWS BROWSER
   Opened from the "Shows" button. Reuses the same full-screen
   "category-view" overlay the movie Categories dropdown uses above,
   just populated with TMDB's TV endpoints and TV genres instead.
========================================================== */

const TV_STANDARD_ROWS = [
    { title: "Trending TV Shows", url: `https://api.themoviedb.org/3/trending/tv/day?api_key=${API_KEY}` },
    { title: "Popular TV Shows", url: `https://api.themoviedb.org/3/tv/popular?api_key=${API_KEY}` },
    { title: "Top Rated TV Shows", url: `https://api.themoviedb.org/3/tv/top_rated?api_key=${API_KEY}` },
    { title: "On The Air", url: `https://api.themoviedb.org/3/tv/on_the_air?api_key=${API_KEY}` },
    { title: "Airing Today", url: `https://api.themoviedb.org/3/tv/airing_today?api_key=${API_KEY}` }
];

async function getTvGenres() {
    try {
        const res = await fetch(`https://api.themoviedb.org/3/genre/tv/list?api_key=${API_KEY}`);
        const data = await res.json();
        return data.genres || [];
    } catch {
        return [];
    }
}

async function openShowsBrowser() {
    const overlay = document.getElementById("category-view");
    const body = document.getElementById("category-view-body");
    const heading = document.getElementById("category-view-title");
    if (!overlay || !body || !heading) return;

    heading.textContent = "TV Shows";
    body.innerHTML = `<p class="tab-loading">Loading…</p>`;
    overlay.classList.remove("hidden");
    lockScroll();

    body.innerHTML = "";
    let rowCount = 0;

    TV_STANDARD_ROWS.forEach(row => {
        const rowId = `tv-row-${rowCount++}`;
        const section = createRowSection(rowId, row.title);
        body.appendChild(section);
        loadMovies(row.url, rowId, "tv");
    });

    const genres = await getTvGenres();

    genres.forEach(genre => {
        const url =
            `https://api.themoviedb.org/3/discover/tv?api_key=${API_KEY}` +
            `&with_genres=${genre.id}&sort_by=popularity.desc`;
        const rowId = `tv-row-${rowCount++}`;

        const section = createRowSection(rowId, genre.name);
        body.appendChild(section);
        loadMovies(url, rowId, "tv");
    });
}

document.getElementById("header-button1")?.addEventListener("click", openShowsBrowser);

/* RENDER ROW (NO HOVER VIDEO) */
function renderRow(rowId, items) {
    const row = document.getElementById(rowId);
    row.innerHTML = "";

    const fragment = document.createDocumentFragment();

    items.forEach(item => {

        const div = document.createElement("div");
        div.className = "movie";

        div.dataset.id = item.id;
        div.dataset.title = item.title;
        div.dataset.img = item.image;
        div.dataset.desc = item.overview;
        div.dataset.rating = item.rating;
        div.dataset.year = item.year;
        div.dataset.type = item.type || "movie";

        const img = document.createElement("img");
        img.className = "movie-img";
        img.src = item.image;

        div.appendChild(img);
        fragment.appendChild(div);
    });

    row.appendChild(fragment);
}

/* MORE LIKE THIS (titles TMDB considers similar to the one open) */
async function getRecommendations(id, type) {
    try {
        const res = await fetch(
            `https://api.themoviedb.org/3/${type}/${id}/recommendations?api_key=${API_KEY}`
        );
        const data = await res.json();
        return (data.results || []).slice(0, 9);
    } catch {
        return [];
    }
}

/* TRAILERS & MORE (every YouTube video TMDB has for this title - teasers,
   featurettes, behind-the-scenes, clips, bloopers, not just the main trailer) */
async function getAllVideos(id, type) {
    try {
        const res = await fetch(
            `https://api.themoviedb.org/3/${type}/${id}/videos?api_key=${API_KEY}`
        );
        const data = await res.json();
        return (data.results || []).filter(v => v.site === "YouTube");
    } catch {
        return [];
    }
}

function renderMoreLikeThis(id, type) {
    const grid = document.getElementById("more-like-grid");
    if (!grid) return;
    grid.innerHTML = `<p class="tab-loading">Loading…</p>`;

    getRecommendations(id, type).then(items => {
        grid.innerHTML = "";

        if (!items.length) {
            grid.innerHTML = `<p class="tab-empty">No recommendations found.</p>`;
            return;
        }

        const fragment = document.createDocumentFragment();

        items.forEach(item => {
            const card = document.createElement("div");
            card.className = "more-like-card";

            // Netflix's "More Like This" uses the normal portrait poster art,
            // not a landscape backdrop - so this uses poster_path here.
            const img = document.createElement("img");
            img.loading = "lazy";
            img.alt = item.title || item.name;
            img.src = item.poster_path
                ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
                : item.backdrop_path
                ? `https://image.tmdb.org/t/p/w342${item.backdrop_path}`
                : "https://via.placeholder.com/342x513?text=No+Image";
            card.appendChild(img);

            card.addEventListener("click", () => {
                openModal({
                    id: item.id,
                    title: item.title || item.name,
                    desc: item.overview,
                    img: item.backdrop_path
                        ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}`
                        : img.src,
                    rating: item.vote_average,
                    year: (item.release_date || item.first_air_date || "").split("-")[0],
                    type // recommendations for a show are shows, for a movie are movies
                });
            });

            fragment.appendChild(card);
        });

        grid.appendChild(fragment);
    });
}

function renderTrailersAndMore(id, type) {
    const list = document.getElementById("trailer-list");
    if (!list) return;
    list.innerHTML = `<p class="tab-loading">Loading…</p>`;

    getAllVideos(id, type).then(videos => {
        list.innerHTML = "";

        if (!videos.length) {
            list.innerHTML = `<p class="tab-empty">No extra videos found.</p>`;
            return;
        }

        // Show trailers/teasers first, then behind-the-scenes/featurette content
        const order = ["Trailer", "Teaser", "Clip", "Featurette", "Behind the Scenes", "Bloopers"];
        const sorted = [...videos].sort((a, b) => {
            const ai = order.indexOf(a.type);
            const bi = order.indexOf(b.type);
            return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
        });

        const fragment = document.createDocumentFragment();

        sorted.slice(0, 12).forEach(video => {
            const item = document.createElement("div");
            item.className = "trailer-item";
            item.innerHTML = `
                <div class="trailer-thumb">
                    <img src="https://img.youtube.com/vi/${video.key}/mqdefault.jpg" alt="">
                    <div class="trailer-play-badge">▶</div>
                </div>
                <div class="trailer-info">
                    <span class="trailer-title"></span>
                    <span class="trailer-type"></span>
                </div>
            `;
            item.querySelector(".trailer-title").textContent = video.name;
            item.querySelector(".trailer-type").textContent = video.type;

            item.addEventListener("click", () => {
                playTrailer(video.key);
                if (activeMovieSummary) addRecentlyWatched(activeMovieSummary);
                document.querySelector(".expanded-modal")?.scrollTo({ top: 0, behavior: "smooth" });
            });

            fragment.appendChild(item);
        });

        list.appendChild(fragment);
    });
}

/* SEASONS (TV shows only) */
function renderSeasons(seasons) {
    const container = document.getElementById("season-list");
    if (!container) return;
    container.innerHTML = "";

    if (!seasons || !seasons.length) {
        container.innerHTML = `<p class="tab-empty">No season information found.</p>`;
        return;
    }

    const fragment = document.createDocumentFragment();

    seasons.forEach(s => {
        const item = document.createElement("div");
        item.className = "season-item";
        item.innerHTML = `
            <img class="season-poster" alt="">
            <div class="season-info">
                <p class="season-title"></p>
                <p class="season-meta"></p>
                <p class="season-overview"></p>
            </div>
        `;

        const img = item.querySelector(".season-poster");
        img.src = s.poster || "https://via.placeholder.com/120x180?text=No+Image";
        img.alt = s.name || "";

        item.querySelector(".season-title").textContent = s.name || `Season ${s.seasonNumber}`;

        const year = s.airDate ? s.airDate.split("-")[0] : "";
        const epCount = s.episodeCount || 0;
        item.querySelector(".season-meta").textContent =
            `${epCount} Episode${epCount === 1 ? "" : "s"}` + (year ? ` · ${year}` : "");

        item.querySelector(".season-overview").textContent = s.overview || "";

        fragment.appendChild(item);
    });

    container.appendChild(fragment);
}

// Wire up the modal tab switcher once (More Like This / Trailers & More /
// Where to Watch / Seasons - the last one only visible for TV shows).
document.querySelectorAll(".modal-tabs .tab").forEach((tabEl, idx) => {
    tabEl.addEventListener("click", () => {
        document.querySelectorAll(".modal-tabs .tab").forEach(t => t.classList.remove("active"));
        tabEl.classList.add("active");

        document.getElementById("tab-content-more")?.classList.toggle("hidden", idx !== 0);
        document.getElementById("tab-content-trailers")?.classList.toggle("hidden", idx !== 1);
        document.getElementById("tab-content-watch")?.classList.toggle("hidden", idx !== 2);
        document.getElementById("tab-content-seasons")?.classList.toggle("hidden", idx !== 3);
    });
});

/* ==========================================================
   MY LIST (add/remove the currently open title - see state.js)
========================================================== */

function updateMyListButton() {
    const action = document.getElementById("modal-mylist-action");
    const label = document.getElementById("modal-mylist-label");
    if (!action || !label || !activeMovieSummary) return;

    const added = isInMyList(activeMovieSummary.id);
    action.classList.toggle("added", added);
    label.textContent = added ? "In My List" : "Add to List";
}

document.getElementById("modal-mylist-action")?.addEventListener("click", () => {
    if (!activeMovieSummary) return;
    toggleMyList(activeMovieSummary);
    updateMyListButton();
});

/* ==========================================================
   "MORE" INFO PAGE + PERSON/GENRE FILMOGRAPHY
   Tapping "more" under the cast line opens a full-screen page listing
   every cast member, the director/creator(s), age rating and genres
   (whatever TMDB actually has data for). Tapping any of those opens
   another page listing every title that person/genre is linked to -
   for a person that's a mix of movies AND shows (combined_credits);
   for a genre it stays within the title's own media type.
========================================================== */

function closeSubviews() {
    document.getElementById("modal-info-view")?.classList.add("hidden");
    document.getElementById("modal-person-view")?.classList.add("hidden");
    document.getElementById("modal-main-view")?.classList.remove("hidden");
}

function buildInfoSection(heading, items) {
    const section = document.createElement("div");
    section.className = "info-section";

    const h = document.createElement("h3");
    h.className = "info-heading";
    h.textContent = heading;
    section.appendChild(h);

    items.forEach(item => {
        const p = document.createElement("p");
        p.className = "info-line";
        p.textContent = item.label;
        if (item.onClick) {
            p.classList.add("info-line-clickable");
            p.addEventListener("click", item.onClick);
        }
        section.appendChild(p);
    });

    return section;
}

async function openInfoView(id, title, type) {
    document.getElementById("modal-main-view")?.classList.add("hidden");
    document.getElementById("modal-person-view")?.classList.add("hidden");
    document.getElementById("modal-info-view")?.classList.remove("hidden");
    setText("info-view-title", title);

    const body = document.getElementById("info-view-body");
    if (body) body.innerHTML = `<p class="tab-loading">Loading…</p>`;

    const details = await getDetails(id, type);
    if (!body) return;

    if (!details) {
        body.innerHTML = `<p class="tab-empty">No details found.</p>`;
        return;
    }

    body.innerHTML = "";

    // Director / creators and the whole cast use the same circular slider as "Meet the cast"
    const pickPerson = person => openPersonView(person.id, person.name, "person", type);
    const addStrip = (heading, people) => {
        if (!people.length) return;
        const section = document.createElement("div");
        section.className = "info-section";
        const h = document.createElement("h3");
        h.className = "info-heading";
        h.textContent = heading;
        section.appendChild(h);
        section.appendChild(buildCastStrip(people, pickPerson));
        body.appendChild(section);
    };

    if (typeof buildCastStrip === "function") {
        const makers = type === "tv" ? details.creators : (details.director ? [details.director] : []);
        addStrip(type === "tv" ? (makers.length > 1 ? "Creators" : "Creator") : "Director",
            makers.map(p => ({ id: p.id, name: p.name, photo: p.photo, character: type === "tv" ? "Creator" : "Director" })));
        addStrip("Cast", details.cast.slice(0, 60));
    } else {
        if (details.cast.length) {
            body.appendChild(buildInfoSection("Cast", details.cast.map(c => ({
                label: c.name, onClick: () => openPersonView(c.id, c.name, "person", type)
            }))));
        }
    }

    if (details.certification) {
        const section = document.createElement("div");
        section.className = "info-section";

        const heading = document.createElement("h3");
        heading.className = "info-heading";
        heading.textContent = "Age Rating";
        section.appendChild(heading);

        const badge = document.createElement("span");
        badge.className = "age-badge";
        badge.textContent = details.certification;
        section.appendChild(badge);

        body.appendChild(section);
    }

    if (details.genres.length) {
        body.appendChild(
            buildInfoSection(
                "Genres",
                details.genres.map(g => ({
                    label: g.name,
                    onClick: () => openPersonView(g.id, g.name, "genre", type)
                }))
            )
        );
    }

    if (!body.children.length) {
        body.innerHTML = `<p class="tab-empty">No details found.</p>`;
    }
}

// A person's combined filmography - movies AND TV shows together, each
// tagged with its own media_type so clicking one opens the right modal.
async function getCreditsByPerson(personId) {
    try {
        const res = await fetch(
            `https://api.themoviedb.org/3/person/${personId}/combined_credits?api_key=${API_KEY}`
        );
        const data = await res.json();
        const combined = [...(data.cast || []), ...(data.crew || [])];

        const seen = new Set();
        return combined
            .filter(m => {
                const key = `${m.media_type}-${m.id}`;
                if (!m.id || seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    } catch {
        return [];
    }
}

// A genre's filmography stays within one media type (movie genre ids and
// TV genre ids are different namespaces in TMDB), matching whichever type
// the title being viewed belongs to.
async function getByGenre(genreId, mediaType) {
    try {
        const res = await fetch(
            `https://api.themoviedb.org/3/discover/${mediaType}?api_key=${API_KEY}&with_genres=${genreId}&sort_by=popularity.desc`
        );
        const data = await res.json();
        return (data.results || []).map(item => ({ ...item, media_type: mediaType }));
    } catch {
        return [];
    }
}

async function openPersonView(id, name, kind, mediaType) {
    document.getElementById("modal-info-view")?.classList.add("hidden");
    const personView = document.getElementById("modal-person-view");
    if (personView) {
        // opened from the "Meet the cast" strip -> Back returns to the movie; from the info page -> back to it
        personView.dataset.origin = personView.dataset.nextOrigin || "info";
        delete personView.dataset.nextOrigin;
        personView.classList.remove("hidden");
    }
    setText("person-view-title", name);

    // a person gets a big circular photo (tap it for the biography); genres don't
    if (kind === "person" && typeof decoratePersonView === "function") decoratePersonView(id, name);
    else {
        document.getElementById("person-hero")?.remove();
        document.getElementById("person-section-title")?.remove();
    }

    const grid = document.getElementById("person-view-grid");
    if (grid) grid.innerHTML = `<p class="tab-loading">Loading…</p>`;

    const items = kind === "genre" ? await getByGenre(id, mediaType) : await getCreditsByPerson(id);
    if (!grid) return;

    grid.innerHTML = "";

    if (!items.length) {
        grid.innerHTML = `<p class="tab-empty">No titles found.</p>`;
        return;
    }

    const fragment = document.createDocumentFragment();

    items.forEach(item => {
        if (!item.poster_path && !item.backdrop_path) return; // skip posterless junk entries
        const itemType = item.media_type === "tv" ? "tv" : "movie"; // combined_credits can include "person" media_type junk

        const card = document.createElement("div");
        card.className = "more-like-card";

        const img = document.createElement("img");
        img.loading = "lazy";
        img.alt = item.title || item.name || "";
        img.src = item.poster_path
            ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
            : `https://image.tmdb.org/t/p/w342${item.backdrop_path}`;
        card.appendChild(img);

        card.addEventListener("click", () => {
            openModal({
                id: item.id,
                title: item.title || item.name,
                desc: item.overview,
                img: item.backdrop_path
                    ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}`
                    : img.src,
                rating: item.vote_average,
                year: (item.release_date || item.first_air_date || "").split("-")[0],
                type: itemType
            });
        });

        fragment.appendChild(card);
    });

    grid.appendChild(fragment);
}

document.getElementById("modal-more-btn")?.addEventListener("click", () => {
    if (activeMovieId) openInfoView(activeMovieId, activeMovieTitle, activeMediaType);
});

document.getElementById("info-back-btn")?.addEventListener("click", () => {
    document.getElementById("modal-info-view")?.classList.add("hidden");
    document.getElementById("modal-main-view")?.classList.remove("hidden");
});

document.getElementById("person-back-btn")?.addEventListener("click", () => {
    const personView = document.getElementById("modal-person-view");
    personView?.classList.add("hidden");
    if (personView?.dataset.origin !== "main") {
        document.getElementById("modal-info-view")?.classList.remove("hidden");
    }
});

function setText(elId, value) {
    const el = document.getElementById(elId);
    if (el) el.textContent = value;
}

/* ==========================================================
   CUSTOM TRAILER PLAYER
   Uses the real YouTube IFrame Player API (not just URL params) so the
   modal can show its own play/pause/±10s controls instead of YouTube's
   native control bar. The API is loaded once and the player instance is
   reused for every trailer that plays - loadVideoById() just swaps the
   video rather than tearing down and recreating the player each time.

   Note: YouTube's small logo watermark can't be removed by any
   parameter - that's part of YouTube's own embed terms - but the
   control bar, video title, and end-screen suggestions are all
   suppressed below.
========================================================== */

let ytApiPromise = null;
function loadYouTubeAPI() {
    if (ytApiPromise) return ytApiPromise;

    ytApiPromise = new Promise(resolve => {
        if (window.YT && window.YT.Player) {
            resolve(window.YT);
            return;
        }
        // The API calls this global by name once it's finished loading -
        // chain onto it rather than overwrite it, in case something else
        // on the page ever sets it too.
        const previousCallback = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            if (typeof previousCallback === "function") previousCallback();
            resolve(window.YT);
        };
        if (!document.getElementById("youtube-iframe-api")) {
            const tag = document.createElement("script");
            tag.id = "youtube-iframe-api";
            tag.src = "https://www.youtube.com/iframe_api";
            document.head.appendChild(tag);
        }
    });

    return ytApiPromise;
}

let ytPlayer = null;
let ytPlayerPromise = null;

// Creates the player once, bound to the #modal-trailer placeholder (the
// API replaces it with its own iframe). Every later call just resolves
// with the same instance.
function getYtPlayer() {
    if (ytPlayerPromise) return ytPlayerPromise;

    ytPlayerPromise = loadYouTubeAPI().then(YT => new Promise(resolve => {
        ytPlayer = new YT.Player("modal-trailer", {
            width: "100%",
            height: "100%",
            playerVars: {
                autoplay: 1,
                mute: 1,           // autoplay only works muted
                controls: 0,       // no native control bar
                modestbranding: 1,
                rel: 0,            // no related-videos end screen
                iv_load_policy: 3, // no video annotations
                fs: 0,             // no native fullscreen button
                playsinline: 1,
                origin: window.location.origin
            },
            events: {
                onReady: () => resolve(ytPlayer),
                onStateChange: onPlayerStateChange
            }
        });
    }));

    return ytPlayerPromise;
}

const PLAY_ICON = "media/icons/trailer/play.png";
const PAUSE_ICON = "media/icons/trailer/pause.png";

let controlsHideTimer = null;

function onPlayerStateChange(e) {
    if (!window.YT) return;
    const isPlaying = e.data === YT.PlayerState.PLAYING;
    updatePlayPauseIcon(isPlaying);
    updateTrailerShield(isPlaying);
    showControlsOverlay(); // reveal now; re-arms the auto-hide timer only if playing
}

function updatePlayPauseIcon(isPlaying) {
    const icon = document.getElementById("trailer-playpause-icon");
    if (icon) icon.src = isPlaying ? PAUSE_ICON : PLAY_ICON;
    const btn = document.getElementById("trailer-playpause");
    if (btn) btn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
}

// The shield covers the video whenever it isn't actively playing - that's
// the only way to fully hide YouTube's own paused/title overlay, since no
// player parameter can turn it off. It's transparent while playing.
function updateTrailerShield(isPlaying) {
    document.getElementById("trailer-shield")?.classList.toggle("playing", isPlaying);
}

// Reveals the control row and, if the video is currently playing, arms a
// timer to fade it back out after a few seconds of inactivity - same
// behavior as any normal video player. Controls stay visible whenever the
// video isn't playing (nothing to fade toward).
function showControlsOverlay() {
    const controls = document.getElementById("trailer-controls");
    controls?.classList.remove("faded");
    clearTimeout(controlsHideTimer);

    const isPlaying = ytPlayer && typeof ytPlayer.getPlayerState === "function" &&
        ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;

    if (isPlaying) {
        controlsHideTimer = setTimeout(() => controls?.classList.add("faded"), 2500);
    }
}

// Tapping the video (the shield, since the cross-origin iframe's own
// clicks aren't visible to this page) toggles the control row rather than
// just always revealing it - a second tap while playing hides them again.
document.getElementById("trailer-shield")?.addEventListener("click", () => {
    const controls = document.getElementById("trailer-controls");
    if (!controls) return;

    const isPlaying = ytPlayer && typeof ytPlayer.getPlayerState === "function" &&
        ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;

    if (isPlaying && !controls.classList.contains("faded")) {
        clearTimeout(controlsHideTimer);
        controls.classList.add("faded");
    } else {
        showControlsOverlay();
    }
});

// Shows the trailer frame (hiding the backdrop image) and loads/plays
// the given YouTube video id in the shared player.
function playTrailer(key) {
    showTrailerFrame();
    clearTimeout(controlsHideTimer);
    document.getElementById("trailer-controls")?.classList.remove("faded");
    document.getElementById("trailer-shield")?.classList.remove("playing");

    getYtPlayer().then(player => {
        player.loadVideoById(key);
        player.mute();
        setTrailerMuted(true);
        updatePlayPauseIcon(true); // optimistic - loadVideoById autoplays
    });
}

function showTrailerFrame() {
    document.getElementById("trailer-frame")?.classList.remove("hidden");
    const backdrop = document.getElementById("modal-backdrop");
    if (backdrop) backdrop.style.display = "none";
}

function hideTrailerFrame() {
    document.getElementById("trailer-frame")?.classList.add("hidden");
    const backdrop = document.getElementById("modal-backdrop");
    if (backdrop) backdrop.style.display = "block";
    if (ytPlayer && typeof ytPlayer.stopVideo === "function") ytPlayer.stopVideo();
    clearTimeout(controlsHideTimer);
}

/* MUTE TOGGLE */
let trailerMuted = true;

function updateMuteButtonIcon() {
    const btn = document.getElementById("trailer-mute-btn");
    if (btn) btn.textContent = trailerMuted ? "🔇" : "🔊";
}

function setTrailerMuted(muted) {
    trailerMuted = muted;
    updateMuteButtonIcon();
}

document.getElementById("trailer-mute-btn")?.addEventListener("click", () => {
    if (!ytPlayer) return;
    if (trailerMuted) {
        ytPlayer.unMute();
        setTrailerMuted(false);
    } else {
        ytPlayer.mute();
        setTrailerMuted(true);
    }
});

/* PLAY / PAUSE / ±10s - the custom control overlay over the trailer */
document.getElementById("trailer-playpause")?.addEventListener("click", () => {
    if (!ytPlayer || typeof ytPlayer.getPlayerState !== "function") return;
    if (ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) {
        ytPlayer.pauseVideo();
    } else {
        ytPlayer.playVideo();
    }
    showControlsOverlay(); // reset the auto-hide timer on every interaction
});

document.getElementById("trailer-back10")?.addEventListener("click", () => {
    if (!ytPlayer || typeof ytPlayer.getCurrentTime !== "function") return;
    ytPlayer.seekTo(Math.max(0, ytPlayer.getCurrentTime() - 10), true);
    showControlsOverlay();
});

document.getElementById("trailer-fwd10")?.addEventListener("click", () => {
    if (!ytPlayer || typeof ytPlayer.getCurrentTime !== "function") return;
    const duration = typeof ytPlayer.getDuration === "function" ? ytPlayer.getDuration() : Infinity;
    ytPlayer.seekTo(Math.min(duration, ytPlayer.getCurrentTime() + 10), true);
    showControlsOverlay();
});

// Shared modal-opening logic. Accepts a plain object so it can be called
// from a poster card's dataset OR from whatever movie is currently showing
// in the hero banner. `type` is "movie" (default) or "tv".
function openModal({ id, title, desc, img, poster, rating, year, type = "movie" }) {
    const modal = document.getElementById("modal");
    if (modal) modal.classList.remove("hidden");
    lockScroll(); // keep the page behind the modal from scrolling too

    activeMovieId = id;
    activeMovieTitle = title;
    activeMediaType = type;
    activeMovieSummary = { id, title, desc, img, poster: poster || null, rating, year, type };
    if (!poster) {
        // Fill in the real poster so My List / Recently Watched match the Home rows.
        fetchPosterUrl(id, type).then(url => {
            if (url && activeMovieSummary && String(activeMovieSummary.id) === String(id)) {
                activeMovieSummary.poster = url;
            }
        });
    }
    closeSubviews(); // always land back on the main view for a freshly opened title
    updateMyListButton();

    // The Seasons tab only makes sense for TV shows.
    document.getElementById("tab-seasons")?.classList.toggle("hidden-tab", type !== "tv");
    document.getElementById("modal-director-label")?.replaceChildren(
        document.createTextNode(type === "tv" ? "Creator:" : "Director:")
    );

    const modalBackdrop = document.getElementById("modal-backdrop");

    setText("modal-title", title);
    setText("modal-desc", desc);
    if (modalBackdrop) {
        modalBackdrop.src = img;
        modalBackdrop.style.display = "block";
    }

    setText("modal-year", year || "—");
    if (typeof showMatch === "function") showMatch(id, type, rating);
    else setText("modal-match", `${Math.round((rating || 0) * 10)}% Match`);

    // Hide the "coming soon" line until we know whether this title is
    // actually unreleased - most movies won't show it at all.
    const releaseInfo = document.getElementById("modal-release-info");
    releaseInfo?.classList.add("hidden");
    if (releaseInfo) releaseInfo.textContent = "";

    // Reset trailer/details placeholders while we fetch
    hideTrailerFrame();
    setTrailerMuted(true);
    setText("modal-duration", "…");
    setText("modal-cast", "…");
    if (typeof renderCastScroller === "function") renderCastScroller(null);
    setText("modal-director", "…");
    setText("modal-genres", "…");
    setText("modal-age", "…");

    // Reset to the "More Like This" tab every time a new title opens
    document.querySelectorAll(".modal-tabs .tab").forEach((t, i) => t.classList.toggle("active", i === 0));
    document.getElementById("tab-content-more")?.classList.remove("hidden");
    document.getElementById("tab-content-trailers")?.classList.add("hidden");
    document.getElementById("tab-content-watch")?.classList.add("hidden");
    document.getElementById("tab-content-seasons")?.classList.add("hidden");

    renderMoreLikeThis(id, type);
    renderTrailersAndMore(id, type);
    renderWhereToWatch(id, type);

    // Trailer: played through the YouTube IFrame Player API (see
    // playTrailer/getYtPlayer above) so the modal shows its own
    // play/pause/±10s controls instead of YouTube's native bar.
    getTrailer(id, type).then(key => {
        // profile setting "Autoplay previews" (Edit Profile) - off = no trailer until you pick one
        const autoplay = typeof profileSetting === "function" ? profileSetting("autoplayPreviews", true) : true;
        if (key && autoplay) {
            playTrailer(key);
            // The trailer is actually playing now - log it for "Recently Watched".
            if (activeMovieSummary) addRecentlyWatched(activeMovieSummary);
        } else {
            hideTrailerFrame();
        }
    }).catch(() => {});

    // Details: runtime/seasons, genres, cast, director/creators, certification
    getDetails(id, type).then(details => {
        if (!details) {
            setText("modal-duration", "—");
            setText("modal-cast", "N/A");
            if (typeof renderCastScroller === "function") renderCastScroller({ cast: [] });
            setText("modal-director", "N/A");
            setText("modal-genres", "N/A");
            setText("modal-age", "NR");
            return;
        }

        setText(
            "modal-cast",
            details.cast.length ? details.cast.slice(0, 4).map(c => c.name).join(", ") : "N/A"
        );
        if (typeof renderCastScroller === "function") renderCastScroller(details);
        setText(
            "modal-genres",
            details.genres.length ? details.genres.map(g => g.name).join(", ") : "N/A"
        );
        setText("modal-age", details.certification || "NR");

        const releaseInfo = document.getElementById("modal-release-info");

        if (details.type === "tv") {
            setText(
                "modal-duration",
                details.numberOfSeasons
                    ? `${details.numberOfSeasons} Season${details.numberOfSeasons === 1 ? "" : "s"}`
                    : "—"
            );
            setText("modal-director", details.creators.length ? details.creators.map(c => c.name).join(", ") : "Unknown");

            // "Production year" for a show is its most recent season's year.
            if (details.lastAirYear) setText("modal-year", details.lastAirYear);

            renderSeasons(details.seasons);
            releaseInfo?.classList.add("hidden"); // "coming soon" framing doesn't apply to shows
            if (releaseInfo) releaseInfo.textContent = "";
        } else {
            setText(
                "modal-duration",
                details.runtime
                    ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m`
                    : "—"
            );
            setText("modal-director", details.director ? details.director.name : "Unknown");

            // If this title hasn't released yet, show "Coming <date>" above
            // the match rating - matches the same treatment used in News & Hot.
            if (releaseInfo) {
                const releaseDate = details.releaseDate ? new Date(`${details.releaseDate}T00:00:00`) : null;
                const isUpcoming = releaseDate && releaseDate.getTime() > Date.now();

                if (isUpcoming) {
                    releaseInfo.textContent = `Coming ${formatDate(details.releaseDate)}`;
                    releaseInfo.classList.remove("hidden");
                } else {
                    releaseInfo.textContent = "";
                    releaseInfo.classList.add("hidden");
                }
            }
        }
    }).catch(() => {});
}

document.addEventListener("click", (e) => {
    const card = e.target.closest(".movie");
    if (!card) return;

    openModal({
        id: card.dataset.id,
        title: card.dataset.title,
        desc: card.dataset.desc,
        img: card.dataset.img,
        rating: card.dataset.rating,
        year: card.dataset.year,
        type: card.dataset.type || "movie"
    });
});

/* CLOSE MODAL WITH FADE OUT */
const closeFn = () => {
    const modal = document.getElementById("modal");

    // The fade + slide-out is pure CSS now (see css/modal.css): just mark it hidden.
    modal.classList.add("hidden");
    if (typeof ytPlayer !== "undefined" && ytPlayer && typeof ytPlayer.pauseVideo === "function") {
        try { ytPlayer.pauseVideo(); } catch {} // sound stops straight away
    }

    // Tidy up once the slide-out has finished (unless it was reopened meanwhile)
    setTimeout(() => {
        if (!modal.classList.contains("hidden")) return;
        hideTrailerFrame(); // stop playback
        closeSubviews(); // land back on the main view for next time
    }, 450);
};

document.getElementById("closeModal").onclick = closeFn;
document.getElementById("closeBackdrop").onclick = closeFn;
document.getElementById("info-close-btn")?.addEventListener("click", closeFn);
document.getElementById("person-close-btn")?.addEventListener("click", closeFn);

/* HERO (big-content) ROTATION */
let heroPool = [];
let heroIndex = 0;
let heroTimer = null;
let currentHero = null; // whichever hero item is on screen right now

async function buildHeroPool() {
    const bigPreview = document.querySelector(".big-preview");
    const bigTitle = document.querySelector(".big-title");
    if (!bigPreview || !bigTitle) return; // markup not present, skip quietly

    try {
        const res = await fetch(
            `https://api.themoviedb.org/3/trending/movie/week?api_key=${API_KEY}`
        );
        const data = await res.json();
        const candidates = (data.results || []).slice(0, 8);

        const pool = await Promise.all(
            candidates.map(async movie => {
                if (!movie.backdrop_path) return null;
                try {
                    const imgRes = await fetch(
                        `https://api.themoviedb.org/3/movie/${movie.id}/images?api_key=${API_KEY}&include_image_language=en,null`
                    );
                    const imgData = await imgRes.json();
                    const logo = (imgData.logos || [])[0];
                    if (!logo) return null; // skip titles with no logo art

                    return {
                        id: movie.id,
                        title: movie.title,
                        desc: movie.overview,
                        rating: movie.vote_average,
                        year: (movie.release_date || "").split("-")[0],
                        backdrop: `https://image.tmdb.org/t/p/original${movie.backdrop_path}`,
                        logo: `https://image.tmdb.org/t/p/w500${logo.file_path}`,
                        type: "movie"
                    };
                } catch {
                    return null;
                }
            })
        );

        heroPool = pool.filter(Boolean);

        if (heroPool.length) {
            showHero(0);
            startHeroRotation();
        }
    } catch (err) {
        console.error(err);
    }
}

/* AMBIENT COLOR (samples the hero backdrop and tints #ambient-glow) */
function updateAmbientColor(imageUrl) {
    const probe = new Image();
    probe.crossOrigin = "anonymous"; // TMDB's CDN allows this
    probe.src = imageUrl;

    probe.onload = () => {
        try {
            const size = 16;
            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;

            const ctx = canvas.getContext("2d");
            ctx.drawImage(probe, 0, 0, size, size);
            const { data } = ctx.getImageData(0, 0, size, size);

            let r = 0, g = 0, b = 0, n = 0;
            for (let i = 0; i < data.length; i += 4) {
                r += data[i];
                g += data[i + 1];
                b += data[i + 2];
                n++;
            }
            r = Math.round(r / n);
            g = Math.round(g / n);
            b = Math.round(b / n);

            document.documentElement.style.setProperty(
                "--ambient-color",
                `rgba(${r}, ${g}, ${b}, 0.55)`
            );
        } catch {
            // Canvas got tainted (no CORS header on this particular image) -
            // just keep whatever ambient color is already set.
        }
    };
}

function showHero(index) {
    const item = heroPool[index];
    if (!item) return;

    const bigPreview = document.querySelector(".big-preview");
    const bigTitle = document.querySelector(".big-title");
    if (!bigPreview || !bigTitle) return;

    // Preload before swapping so we never flash a blank/broken image
    const preload = new Image();
    preload.src = item.backdrop;
    preload.onload = () => {
        bigPreview.style.transition = "opacity 0.6s ease";
        bigTitle.style.transition = "opacity 0.6s ease";
        bigPreview.style.opacity = "0";
        bigTitle.style.opacity = "0";

        setTimeout(() => {
            bigPreview.src = item.backdrop;
            bigTitle.src = item.logo;
            bigTitle.alt = item.title;
            bigPreview.style.opacity = "1";
            bigTitle.style.opacity = "1";
            currentHero = item; // this is now the "on screen" movie
            updateAmbientColor(item.backdrop);
        }, 600);
    };
}

function startHeroRotation() {
    if (heroTimer) clearInterval(heroTimer);
    heroTimer = setInterval(() => {
        heroIndex = (heroIndex + 1) % heroPool.length;
        showHero(heroIndex);
    }, 8000); // matches the pace of Netflix's own homepage rotation
}

// Clicking the hero opens the modal for WHICHEVER movie is currently
// displayed — since currentHero is updated every rotation, tapping
// again later (after it's changed) opens the new one, not the old one.
const heroContent = document.querySelector(".big-content");
if (heroContent) {
    heroContent.style.cursor = "pointer";
    heroContent.addEventListener("click", (e) => {
        // Don't hijack the Play / My List buttons if they get their own behavior later
        if (e.target.closest(".hero-buttons")) return;
        if (!currentHero) return;

        openModal({
            id: currentHero.id,
            title: currentHero.title,
            desc: currentHero.desc,
            img: currentHero.backdrop,
            rating: currentHero.rating,
            year: currentHero.year,
            type: "movie"
        });
    });
}

// Play on the hero: the small trailer player only - no movie modal
document.querySelector(".hero-buttons .play-btn")?.addEventListener("click", e => {
    e.stopPropagation();
    if (!currentHero || typeof openMiniPlayer !== "function") return;

    openMiniPlayer({
        id: currentHero.id,
        title: currentHero.title,
        desc: currentHero.desc,
        img: currentHero.backdrop,
        rating: currentHero.rating,
        year: currentHero.year,
        type: "movie"
    });
});

/* INIT */
buildHeroPool();
buildAllRows();
