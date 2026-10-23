const API_KEY = "49a985b7ac7bea35802cc034cbbe3655";

const logoCache = {};

/* Real logo art for a title, when TMDB has any - falls back to a styled
   text title otherwise (most catalog/TV titles don't have logo art on file). */
async function getTitleLogo(mediaType, id) {
    const cacheKey = `${mediaType}-${id}`;
    if (logoCache[cacheKey] !== undefined) return logoCache[cacheKey];

    try {
        const res = await fetch(
            `https://api.themoviedb.org/3/${mediaType}/${id}/images?api_key=${API_KEY}&include_image_language=en,null`
        );
        const data = await res.json();
        const logo = (data.logos || [])[0];
        logoCache[cacheKey] = logo ? `https://image.tmdb.org/t/p/w500${logo.file_path}` : null;
        return logoCache[cacheKey];
    } catch {
        logoCache[cacheKey] = null;
        return null;
    }
}

function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(`${dateStr}T00:00:00`);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/* ==========================================================
   The four tabs across the top - each backed by a real TMDB endpoint.
========================================================== */
const CATEGORIES = {
    comingSoon: {
        buttonId: "header-button1",
        label: "Coming Soon",
        mediaType: "movie",
        fetch: async () => {
            const res = await fetch(`https://api.themoviedb.org/3/movie/upcoming?api_key=${API_KEY}`);
            const data = await res.json();
            return (data.results || []).slice(0, 10);
        },
        meta: item => (item.release_date ? `Coming ${formatDate(item.release_date)}` : "Coming Soon")
    },
    trending: {
        buttonId: "header-button2",
        label: "Everyone's Watching",
        mediaType: "movie",
        fetch: async () => {
            const res = await fetch(`https://api.themoviedb.org/3/trending/movie/day?api_key=${API_KEY}`);
            const data = await res.json();
            return (data.results || []).slice(0, 10);
        },
        meta: () => "Trending Today"
    },
    topTV: {
        buttonId: "header-button3",
        label: "Top 10 TV Shows",
        mediaType: "tv",
        fetch: async () => {
            const res = await fetch(`https://api.themoviedb.org/3/trending/tv/week?api_key=${API_KEY}`);
            const data = await res.json();
            return (data.results || []).slice(0, 10);
        },
        meta: (item, index) => `#${index + 1} in TV Shows Today`
    },
    topMovies: {
        buttonId: "header-button4",
        label: "Top 10 Movies",
        mediaType: "movie",
        fetch: async () => {
            const res = await fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${API_KEY}`);
            const data = await res.json();
            return (data.results || []).slice(0, 10);
        },
        meta: (item, index) => `#${index + 1} in Movies Today`
    }
};

function setActiveButton(key) {
    Object.entries(CATEGORIES).forEach(([k, cat]) => {
        document.getElementById(cat.buttonId)?.classList.toggle("active", k === key);
    });
}

function showLoading() {
    const list = document.getElementById("news-list");
    if (list) list.innerHTML = `<p class="news-loading">Loading…</p>`;
}

function showEmpty(label) {
    const list = document.getElementById("news-list");
    if (list) list.innerHTML = `<p class="news-empty">Nothing to show for "${label}" right now.</p>`;
}

function buildNewsCard(item, cat, index) {
    const title = item.title || item.name || "Untitled";

    const section = document.createElement("section");
    section.className = "news-card";

    const img = document.createElement("img");
    img.className = "news-image";
    img.loading = "lazy";
    img.alt = title;
    img.src = item.backdrop_path
        ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}`
        : `https://image.tmdb.org/t/p/w780${item.poster_path}`;
    section.appendChild(img);

    const info = document.createElement("div");
    info.className = "news-info";

    // Title area: swapped for real logo art if/when it loads, text until then
    const titleHolder = document.createElement("div");
    titleHolder.className = "news-title-holder";
    const textTitle = document.createElement("p");
    textTitle.className = "news-title-text";
    textTitle.textContent = title;
    titleHolder.appendChild(textTitle);
    info.appendChild(titleHolder);

    getTitleLogo(cat.mediaType, item.id).then(logoUrl => {
        if (!logoUrl) return;
        const logoImg = document.createElement("img");
        logoImg.className = "news-logo";
        logoImg.alt = title;
        logoImg.src = logoUrl;
        titleHolder.innerHTML = "";
        titleHolder.appendChild(logoImg);
    });

    const releaseDate = document.createElement("p");
    releaseDate.className = "release-date";
    releaseDate.textContent = cat.meta(item, index);
    info.appendChild(releaseDate);

    const description = document.createElement("p");
    description.className = "description";
    description.textContent = item.overview || "No description available.";
    info.appendChild(description);

    const remindBtn = document.createElement("button");
    remindBtn.className = "remind-btn";
    const bellHTML = on =>
        `<img class="remind-icons" src="media/icons/news/bell-${on ? "on" : "off"}.png" alt=""> ${on ? "Reminder Set" : "Remind Me"}`;
    // Reminders are saved (state.js) so they turn into notifications:
    // "Coming soon" a few days before release and "out now" on the day.
    const reminderItem = {
        id: item.id,
        title,
        desc: item.overview || "",
        img: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null,
        poster: item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null,
        rating: item.vote_average,
        year: (item.release_date || item.first_air_date || "").slice(0, 4),
        release: item.release_date || item.first_air_date || "",
        type: cat.mediaType
    };
    const alreadySet = typeof isReminded === "function" && isReminded(item.id);
    remindBtn.classList.toggle("set", alreadySet);
    remindBtn.innerHTML = bellHTML(alreadySet);
    remindBtn.addEventListener("click", () => {
        const on = typeof toggleReminder === "function"
            ? toggleReminder(reminderItem)
            : remindBtn.classList.toggle("set");
        remindBtn.classList.toggle("set", on);
        remindBtn.innerHTML = bellHTML(on);
    });
    info.appendChild(remindBtn);

    section.appendChild(info);
    return section;
}

async function loadCategory(key) {
    setActiveButton(key);
    showLoading();

    const cat = CATEGORIES[key];
    let items = [];

    try {
        items = await cat.fetch();
    } catch (err) {
        console.error(err);
    }

    items = items.filter(item => item.backdrop_path || item.poster_path);

    const list = document.getElementById("news-list");
    if (!list) return;

    if (!items.length) {
        showEmpty(cat.label);
        return;
    }

    list.innerHTML = "";
    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => fragment.appendChild(buildNewsCard(item, cat, index)));
    list.appendChild(fragment);
}

Object.entries(CATEGORIES).forEach(([key, cat]) => {
    document.getElementById(cat.buttonId)?.addEventListener("click", () => loadCategory(key));
});

/* INIT */
loadCategory("comingSoon");
