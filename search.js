const API_KEY = "49a985b7ac7bea35802cc034cbbe3655";

const trailerCache = {};
const detailsCache = {};
const watchProvidersCache = {};

// Tracks whatever title the main modal view currently has open (movie OR tv).
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

/* WHERE TO WATCH (streaming/rent/buy providers, US region) */
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

/* ==========================================================
   SHARED MODAL LOGIC (same approach as the home page's mvdata.js)
========================================================== */

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
        const fullCast = (data.credits?.cast || []).map(c => ({ id: c.id, name: c.name, character: c.character || "", photo: c.profile_path || null }));

        const usRelease = (data.release_dates?.results || []).find(
            r => r.iso_3166_1 === "US"
        );
        const certification =
            (usRelease?.release_dates || []).find(rd => rd.certification)?.certification ||
            null;

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

/* TRAILERS & MORE (every YouTube video TMDB has for this title) */
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
                    type
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

// Wire up the modal tab switcher once
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
        if (!item.poster_path && !item.backdrop_path) return;
        const itemType = item.media_type === "tv" ? "tv" : "movie";

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

function getYtPlayer() {
    if (ytPlayerPromise) return ytPlayerPromise;

    ytPlayerPromise = loadYouTubeAPI().then(YT => new Promise(resolve => {
        ytPlayer = new YT.Player("modal-trailer", {
            width: "100%",
            height: "100%",
            playerVars: {
                autoplay: 1,
                mute: 1,
                controls: 0,
                modestbranding: 1,
                rel: 0,
                iv_load_policy: 3,
                fs: 0,
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

function playTrailer(key) {
    showTrailerFrame();
    clearTimeout(controlsHideTimer);
    document.getElementById("trailer-controls")?.classList.remove("faded");
    document.getElementById("trailer-shield")?.classList.remove("playing");

    getYtPlayer().then(player => {
        player.loadVideoById(key);
        player.mute();
        setTrailerMuted(true);
        updatePlayPauseIcon(true);
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
    showControlsOverlay();
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

    const releaseInfo = document.getElementById("modal-release-info");
    releaseInfo?.classList.add("hidden");
    if (releaseInfo) releaseInfo.textContent = "";

    hideTrailerFrame();
    setTrailerMuted(true);
    setText("modal-duration", "…");
    setText("modal-cast", "…");
    if (typeof renderCastScroller === "function") renderCastScroller(null);
    setText("modal-director", "…");
    setText("modal-genres", "…");
    setText("modal-age", "…");

    document.querySelectorAll(".modal-tabs .tab").forEach((t, i) => t.classList.toggle("active", i === 0));
    document.getElementById("tab-content-more")?.classList.remove("hidden");
    document.getElementById("tab-content-trailers")?.classList.add("hidden");
    document.getElementById("tab-content-watch")?.classList.add("hidden");
    document.getElementById("tab-content-seasons")?.classList.add("hidden");

    renderMoreLikeThis(id, type);
    renderTrailersAndMore(id, type);
    renderWhereToWatch(id, type);

    getTrailer(id, type).then(key => {
        // profile setting "Autoplay previews" (Edit Profile) - off = no trailer until you pick one
        const autoplay = typeof profileSetting === "function" ? profileSetting("autoplayPreviews", true) : true;
        if (key && autoplay) {
            playTrailer(key);
            if (activeMovieSummary) addRecentlyWatched(activeMovieSummary);
        } else {
            hideTrailerFrame();
        }
    }).catch(() => {});

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

            if (details.lastAirYear) setText("modal-year", details.lastAirYear);

            renderSeasons(details.seasons);
            releaseInfo?.classList.add("hidden");
            if (releaseInfo) releaseInfo.textContent = "";
        } else {
            setText(
                "modal-duration",
                details.runtime
                    ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m`
                    : "—"
            );
            setText("modal-director", details.director ? details.director.name : "Unknown");

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

/* ==========================================================
   RECOMMENDED LIST (default state, shown when the search box is empty)
   Now mixes popular/top-rated MOVIES and TV SHOWS, matching the
   "Recommended series & films" heading.
========================================================== */

const recommendedList = document.getElementById("recommended-list");
const searchResults = document.getElementById("search-results");
const sectionHeading = document.getElementById("section-heading");
const searchInput = document.getElementById("search-input");
const searchClear = document.getElementById("search-clear");

function movieThumb(item) {
    const path = item.backdrop_path || item.poster_path;
    return path
        ? `https://image.tmdb.org/t/p/w300${path}`
        : "https://via.placeholder.com/300x170?text=No+Image";
}

function moviePoster(item) {
    return item.poster_path
        ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
        : "https://via.placeholder.com/500x750?text=No+Image";
}

function movieYear(item) {
    return (item.release_date || item.first_air_date || "").split("-")[0] || "";
}

function itemType(item) {
    return item.media_type === "tv" || item.type === "tv" ? "tv" : "movie";
}

function attachOpenModalRow(row, item) {
    row.addEventListener("click", () => {
        openModal({
            id: item.id,
            title: item.title || item.name,
            desc: item.overview,
            img: movieThumb(item),
            rating: item.vote_average,
            year: movieYear(item),
            type: itemType(item)
        });
    });
}

function renderRecommended(items) {
    recommendedList.innerHTML = "";
    recommendedList.classList.remove("rec-skeleton");

    const fragment = document.createDocumentFragment();

    items.forEach(item => {
        const row = document.createElement("div");
        row.className = "movies";

        row.innerHTML = `
            <div class="left">
                <div class="movie"><img src="${movieThumb(item)}" alt=""></div>
                <p></p>
            </div>
            <img class="play-img" src="media/icons/search/play.png">
        `;
        row.querySelector("p").textContent = item.title || item.name;

        attachOpenModalRow(row, item);
        fragment.appendChild(row);
    });

    recommendedList.appendChild(fragment);
}

function showRecommendedSkeleton(count = 8) {
    recommendedList.innerHTML = "";
    recommendedList.classList.add("rec-skeleton");

    for (let i = 0; i < count; i++) {
        const row = document.createElement("div");
        row.className = "movies";
        row.innerHTML = `
            <div class="left">
                <div class="movie"></div>
                <p>&nbsp;</p>
            </div>
        `;
        recommendedList.appendChild(row);
    }
}

async function loadRecommended() {
    showRecommendedSkeleton();

    try {
        const [popMovieRes, topMovieRes, popTvRes, topTvRes] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${API_KEY}`),
            fetch(`https://api.themoviedb.org/3/movie/top_rated?api_key=${API_KEY}`),
            fetch(`https://api.themoviedb.org/3/tv/popular?api_key=${API_KEY}`),
            fetch(`https://api.themoviedb.org/3/tv/top_rated?api_key=${API_KEY}`)
        ]);

        const [popMovie, topMovie, popTv, topTv] = await Promise.all([
            popMovieRes.json(), topMovieRes.json(), popTvRes.json(), topTvRes.json()
        ]);

        const tag = (list, type) => (list || []).map(item => ({ ...item, media_type: type }));

        const seen = new Set();
        const combined = [
            ...tag(popMovie.results, "movie"),
            ...tag(popTv.results, "tv"),
            ...tag(topMovie.results, "movie"),
            ...tag(topTv.results, "tv")
        ].filter(item => {
            const key = `${item.media_type}-${item.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 24);

        renderRecommended(combined);
    } catch (err) {
        console.error(err);
        recommendedList.innerHTML = "";
        recommendedList.classList.remove("rec-skeleton");
    }
}

/* ==========================================================
   LIVE SEARCH (typing state)
   Uses TMDB's multi-search so a query returns both movies and TV
   shows (person results are filtered out - this is a title search).
========================================================== */

function showRecommendedSection() {
    sectionHeading.textContent = "Recommended series & films";
    recommendedList.classList.remove("hidden");
    searchResults.classList.add("hidden");
    searchResults.innerHTML = "";
}

function showResultsSection() {
    sectionHeading.textContent = "Films & Series";
    recommendedList.classList.add("hidden");
    searchResults.classList.remove("hidden");
}

function renderResults(items, query) {
    searchResults.innerHTML = "";

    if (!items.length) {
        const empty = document.createElement("p");
        empty.className = "no-results";
        empty.textContent = `No matches found for "${query}"`;
        searchResults.appendChild(empty);
        return;
    }

    const fragment = document.createDocumentFragment();

    items.forEach(item => {
        const card = document.createElement("div");
        card.className = "poster-card";

        const img = document.createElement("img");
        img.src = moviePoster(item);
        img.alt = item.title || item.name;
        img.loading = "lazy";
        card.appendChild(img);

        card.addEventListener("click", () => {
            openModal({
                id: item.id,
                title: item.title || item.name,
                desc: item.overview,
                img: movieThumb(item),
                rating: item.vote_average,
                year: movieYear(item),
                type: itemType(item)
            });
        });

        fragment.appendChild(card);
    });

    searchResults.appendChild(fragment);
}

function rankByRelevance(items, query) {
    const q = query.toLowerCase();

    return items
        .map((item, idx) => {
            const title = (item.title || item.name || "").toLowerCase();
            let score;
            if (title === q) score = 0;
            else if (title.startsWith(q)) score = 1;
            else if (title.includes(q)) score = 2;
            else score = 3;
            return { item, score, idx };
        })
        .sort((a, b) => a.score - b.score || a.idx - b.idx)
        .map(entry => entry.item);
}

let searchAbortToken = 0;

async function runSearch(query) {
    showResultsSection();

    const thisSearch = ++searchAbortToken;

    try {
        const res = await fetch(
            `https://api.themoviedb.org/3/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&include_adult=false`
        );
        const data = await res.json();

        // If the user kept typing, a newer search is already in flight -
        // don't let this stale response overwrite it.
        if (thisSearch !== searchAbortToken) return;

        // Multi-search also returns "person" hits (actors/directors) -
        // this is a title search, so only keep movies and TV shows.
        const filtered = (data.results || []).filter(
            r => r.media_type === "movie" || r.media_type === "tv"
        );

        const ranked = rankByRelevance(filtered, query).slice(0, 30);
        renderResults(ranked, query);
    } catch (err) {
        console.error(err);
        if (thisSearch === searchAbortToken) {
            renderResults([], query);
        }
    }
}

let debounceTimer = null;

searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim();
    searchClear.classList.toggle("hidden", query.length === 0);

    clearTimeout(debounceTimer);

    if (!query) {
        showRecommendedSection();
        return;
    }

    debounceTimer = setTimeout(() => runSearch(query), 300);
});

searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchClear.classList.add("hidden");
    showRecommendedSection();
    searchInput.focus();
});

/* INIT */
loadRecommended();
