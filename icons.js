/* ==========================================================
   ICONS - every icon has two states: <name>-on.png / <name>-off.png

   media/icons/trailer/volume-on.png   sound on        volume-off.png  muted
   media/icons/news/bell-on.png        reminder set    bell-off.png    no reminder
   media/icons/trailer/actions/add-on.png   in My List   add-off.png   not in list
   media/icons/trailer/actions/like-on.png  rated        like-off.png  not rated
   media/icons/trailer/actions/send-on.png  just shared  send-off.png  idle

   Load AFTER search.js / mvdata.js (end of <body>). It only reads the
   modal markup, so it works the same on Home, Search and Profile.
========================================================== */

const ICON_DIRS = {
    trailer: "media/icons/trailer",
    news: "media/icons/news",
    actions: "media/icons/trailer/actions",
    mylist: "media/icons/profile/my-list"
};

function iconSrc(dir, name, on) {
    return `${ICON_DIRS[dir]}/${name}-${on ? "on" : "off"}.png`;
}

// Other names a file might have been saved under; tried in order if the
// main name 404s, so a renamed file doesn't leave a blank icon.
const ICON_ALIASES = {
    "volume-on": ["volume-up", "unmute", "mute-off"],
    "volume-off": ["volume-mute", "mute", "mute-on"],
    "bell-on": ["bell"],
    "bell-off": ["bell_2", "bell-outline"],
    "like-on": ["thumb-on", "thumb-filled"],
    "like-off": ["thumb", "like"],
    "add-on": ["check", "added"],
    "add-off": ["add"],
    "send-on": ["share-on"],
    "send-off": ["send", "share"],

    // Profile > My List / sheets
    "edit-off": ["pencil", "edit-icon"],
    "edit-on": ["done", "check"],
    "close-off": ["x", "cancel"],
    "close-on": ["x", "cancel"],
    "play-off": ["play-circle"],
    "play-on": ["play-circle-fill"],
    "delete-off": ["trash", "bin", "remove"],
    "delete-on": ["trash", "bin", "remove"],
    "sort-off": ["chevron-down", "arrow-down", "down"],
    "sort-on": ["chevron-up", "arrow-up", "up"],
    "check-off": ["tick", "checkmark"],
    "check-on": ["tick", "checkmark"]
};

function setIcon(img, dir, name, on) {
    if (!img) return;
    const base = `${name}-${on ? "on" : "off"}`;
    const other = `${name}-${on ? "off" : "on"}`;

    // Names tried in order if a file is missing:
    //   1. <name>-on / <name>-off          (the standard)
    //   2. known alternates (ICON_ALIASES)
    //   3. <name>.png                       (no suffix)
    //   4. the opposite state's file        (icons that only have one image)
    const queue = [...new Set([base, ...(ICON_ALIASES[base] || []), name, other])];
    const tried = [];
    img.dataset.on = on ? "1" : "0";

    const tryNext = () => {
        const file = queue.shift();
        if (!file) {
            console.warn(`Icon not found. Tried:\n${tried.join("\n")}`);
            img.onerror = null;
            return;
        }
        const path = `${ICON_DIRS[dir]}/${file}.png`;
        tried.push(path);
        img.dataset.usedFile = file; // lets CSS adapt when a fallback file is used
        img.src = path;
    };
    img.onerror = tryNext;
    tryNext();
}

/* ---------- Mute button (trailer viewer) ---------- */

function renderMuteIcon(muted) {
    const btn = document.getElementById("trailer-mute-btn");
    if (!btn) return;
    let img = btn.querySelector("img");
    if (!img) {
        img = document.createElement("img");
        img.alt = "";
        btn.replaceChildren(img);
    }
    setIcon(img, "trailer", "volume", !muted);
    btn.setAttribute("aria-label", muted ? "Unmute" : "Mute");
}

(function wireMuteIcon() {
    const btn = document.getElementById("trailer-mute-btn");
    if (!btn) return;
    renderMuteIcon(true); // trailers always start muted
    // The player code writes an emoji into the button when the state changes;
    // swap it for the matching icon image.
    new MutationObserver(() => {
        if (btn.querySelector("img")) return;
        renderMuteIcon(btn.textContent.includes("🔇"));
    }).observe(btn, { childList: true });
})();

/* ---------- My List (add) ---------- */

(function wireMyListIcon() {
    const action = document.getElementById("modal-mylist-action");
    const img = action?.querySelector("img");
    if (!action || !img) return;
    const sync = () => setIcon(img, "actions", "add", action.classList.contains("added"));
    sync();
    new MutationObserver(sync).observe(action, { attributes: true, attributeFilter: ["class"] });
})();

/* ---------- Rate (thumb) ---------- */

function currentTitleKey() {
    if (typeof activeMovieId !== "undefined" && activeMovieId != null) return String(activeMovieId);
    return document.getElementById("modal-title")?.textContent || "";
}

// Rating a title = "liking" it; liked titles are stored in state.js so the
// Profile page can list them under "Series & Films You've Liked".
function isRated(key) {
    return typeof isLiked === "function" && isLiked(key);
}

function toggleRated() {
    if (typeof toggleLiked !== "function") return;
    if (typeof activeMovieSummary === "undefined" || !activeMovieSummary) return;
    toggleLiked(activeMovieSummary);
}

function syncRateIcon() {
    const action = document.getElementById("modal-rate-action");
    if (!action) return;
    const rated = isRated(currentTitleKey());
    setIcon(action.querySelector("img"), "actions", "like", rated);
    const label = document.getElementById("modal-rate-label");
    if (label) label.textContent = rated ? "Rated" : "Rate";
}

/* ---------- Share (send) ---------- */

let shareTimer = null;

function flashShared(text) {
    const action = document.getElementById("modal-share-action");
    const label = document.getElementById("modal-share-label");
    if (!action) return;
    setIcon(action.querySelector("img"), "actions", "send", true);
    if (label) label.textContent = text;
    clearTimeout(shareTimer);
    shareTimer = setTimeout(() => {
        setIcon(action.querySelector("img"), "actions", "send", false);
        if (label) label.textContent = "Share";
    }, 1800);
}

async function shareCurrentTitle() {
    const title = document.getElementById("modal-title")?.textContent || "this title";
    const id = currentTitleKey();
    const type = typeof activeMediaType !== "undefined" ? activeMediaType : "movie";
    const url = /^\d+$/.test(id) ? `https://www.themoviedb.org/${type}/${id}` : location.href;

    try {
        if (navigator.share) {
            await navigator.share({ title, text: `Check out ${title}`, url });
            flashShared("Shared");
        } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(url);
            flashShared("Link copied");
        }
    } catch {
        // share sheet dismissed - leave the icon as it was
    }
}

(function wireRateAndShare() {
    const rate = document.getElementById("modal-rate-action");
    const share = document.getElementById("modal-share-action");
    [rate, share].forEach(el => { if (el) el.style.cursor = "pointer"; });

    rate?.addEventListener("click", () => {
        toggleRated();
        syncRateIcon();
    });
    share?.addEventListener("click", shareCurrentTitle);
    setIcon(share?.querySelector("img"), "actions", "send", false); // initial state

    // Each openModal() writes the title, so re-sync the thumb for that title.
    const title = document.getElementById("modal-title");
    if (title) {
        new MutationObserver(syncRateIcon).observe(title, { childList: true, characterData: true, subtree: true });
    }
    syncRateIcon();
})();


/* ---------- Helpers for pages that build icons themselves ---------- */

// <img data-icon-dir="mylist" data-icon-name="close"> -> off-state icon
function applyDataIcons(root = document) {
    root.querySelectorAll("img[data-icon-name]").forEach(img => {
        setIcon(img, img.dataset.iconDir, img.dataset.iconName, img.dataset.iconOn === "1");
    });
}

function makeIcon(dir, name, on = false) {
    const img = document.createElement("img");
    img.alt = "";
    setIcon(img, dir, name, on);
    return img;
}

applyDataIcons();

/* ==========================================================
   WHITE TRAILER ICONS - JS only
   Every image from media/icons/trailer (incl. /actions) and
   media/icons/profile/my-list is shown white,
   whatever colour the file is: black files are recoloured on the fly,
   white ones are left alone. Inline styles also cancel any CSS
   `filter: invert(1)` that was written for black files, so the CSS
   doesn't need to change.
   Exception: icons inside the white "Add to List" button (.btn-list)
   are shown black so they stay visible.
========================================================== */

const WHITE_ICON_DIRS = ["media/icons/trailer", "media/icons/profile/my-list"];
// In the my-list folder every icon is forced to pure white (even light-grey
// ones), except the trash icons, which keep their own colours.
const FORCE_WHITE_DIR = "media/icons/profile/my-list";
const whitened = new Map(); // src -> Promise<dataURL | same src>

function whitenSrc(src, force = false) {
    const cacheKey = `${force ? "f" : "d"}|${src}`;
    if (whitened.has(cacheKey)) return whitened.get(cacheKey);

    const job = new Promise(resolve => {
        const probe = new Image();
        probe.onload = () => {
            try {
                const c = document.createElement("canvas");
                c.width = probe.naturalWidth;
                c.height = probe.naturalHeight;
                const ctx = c.getContext("2d", { willReadFrequently: true });
                ctx.drawImage(probe, 0, 0);
                const data = ctx.getImageData(0, 0, c.width, c.height);
                const px = data.data;

                // average brightness of the visible pixels
                let sum = 0, n = 0;
                for (let i = 0; i < px.length; i += 4) {
                    if (px[i + 3] > 40) { sum += (px[i] + px[i + 1] + px[i + 2]) / 3; n++; }
                }
                if (!n || (!force && sum / n >= 128)) return resolve(src); // already light

                for (let i = 0; i < px.length; i += 4) {
                    px[i] = px[i + 1] = px[i + 2] = 255; // keep alpha, force white
                }
                ctx.putImageData(data, 0, 0);
                resolve(c.toDataURL("image/png"));
            } catch {
                resolve(src); // canvas blocked (e.g. opened via file://)
            }
        };
        probe.onerror = () => resolve(src);
        probe.src = src;
    });

    whitened.set(cacheKey, job);
    return job;
}

async function whitenIcon(img) {
    const src = img.getAttribute("src");
    if (!src || src.startsWith("data:") || !WHITE_ICON_DIRS.some(d => src.includes(d))) return;

    // trash icons keep their own colours
    if (src.includes(FORCE_WHITE_DIR) && /\/(delete|trash|bin|remove)[^/]*$/.test(src)) {
        img.style.filter = "none";
        return;
    }

    // white icon on a white button must be dark; everywhere else stay white
    img.style.filter = img.closest(".btn-list") ? "invert(1)" : "none";

    const out = await whitenSrc(src, src.includes(FORCE_WHITE_DIR));
    if (out !== src && img.getAttribute("src") === src) img.src = out;
}

function whitenAllIcons(root = document) {
    root.querySelectorAll("img").forEach(whitenIcon);
}

whitenAllIcons();

new MutationObserver(mutations => {
    for (const m of mutations) {
        if (m.type === "attributes" && m.target.tagName === "IMG") {
            whitenIcon(m.target);
        } else if (m.type === "childList") {
            m.addedNodes.forEach(node => {
                if (node.nodeType !== 1) return;
                if (node.tagName === "IMG") whitenIcon(node);
                else whitenAllIcons(node);
            });
        }
    }
}).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });
