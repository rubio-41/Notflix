/* ==========================================================
   MINIPLAYER - a small centred trailer player, no movie modal.
   Used by: the Play button on the Home hero, and Play in My List (Profile).
   - openMiniPlayer(item)   item = { id, title, type, ... } -> plays its trailer
   - playKey(key, title)    plays a specific YouTube video (extras, etc.)
   - closeMiniPlayer()
   The player builds its own markup, so pages only need this file + modal.css.
   Needs state.js; API_KEY comes from mvdata.js / search.js.
========================================================== */

/* ---------- Styles (built in, so no separate CSS file has to be linked) ---------- */
const MINIPLAYER_CSS = "/* =======================\n   MINIPLAYER (trailer only) - Home hero Play, My List Play\n======================= */\n.miniplayer {\n\tposition: fixed;\n\tinset: 0;\n\tz-index: 9000;\n\tdisplay: flex;\n\talign-items: center;\n\tjustify-content: center;\n\tpadding: 16px;\n\tbackground: rgba(0, 0, 0, 0.82);\n}\n\n.mp-panel {\n\tposition: relative;\n\twidth: min(100%, 720px);\n\tbackground: #141414;\n\tborder-radius: 12px;\n\toverflow: hidden;\n}\n\n.mp-frame {\n\tdisplay: block;\n\twidth: 100%;\n\taspect-ratio: 16 / 9;\n\tborder: 0;\n\tbackground: #000;\n}\n\n.mp-title {\n\tmargin: 0;\n\tpadding: 12px 16px 14px;\n\tfont-size: 15px;\n\tfont-weight: 600;\n}\n\n.mp-close {\n\tposition: absolute;\n\ttop: 10px;\n\tright: 10px;\n\tz-index: 2;\n\twidth: 36px;\n\theight: 36px;\n\tborder: none;\n\tborder-radius: 50%;\n\tbackground: rgba(30, 30, 30, 0.75);\n\tcursor: pointer;\n}\n\n/* CSS-drawn X - no icon file needed */\n.mp-close::before,\n.mp-close::after {\n\tcontent: \"\";\n\tposition: absolute;\n\tleft: 50%;\n\ttop: 50%;\n\twidth: 16px;\n\theight: 2px;\n\tmargin: -1px 0 0 -8px;\n\tborder-radius: 2px;\n\tbackground: white;\n\ttransform: rotate(45deg);\n}\n\n.mp-close::after {\n\ttransform: rotate(-45deg);\n}\n";

(function injectStyles() {
    if (document.getElementById("miniplayer-styles")) return;
    const style = document.createElement("style");
    style.id = "miniplayer-styles";
    style.textContent = MINIPLAYER_CSS;
    document.head.appendChild(style);
})();


const MINI_API = "https://api.themoviedb.org/3";
let miniToken = 0;

(function buildMiniPlayer() {
    if (document.getElementById("miniplayer")) return;

    const wrap = document.createElement("div");
    wrap.id = "miniplayer";
    wrap.className = "miniplayer hidden";
    wrap.innerHTML = `
        <div class="mp-panel" role="dialog" aria-modal="true" aria-label="Trailer">
            <button class="mp-close" id="mp-close" aria-label="Close"></button>
            <iframe id="mp-frame" class="mp-frame" title="Trailer"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>
            <p class="mp-title" id="mp-title"></p>
        </div>`;
    document.body.appendChild(wrap);

    wrap.querySelector("#mp-close").addEventListener("click", closeMiniPlayer);
    wrap.addEventListener("click", e => { if (e.target === wrap) closeMiniPlayer(); });
    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && !wrap.classList.contains("hidden")) closeMiniPlayer();
    });
})();

function videoRank(v) {
    const t = (v.type || "").toLowerCase();
    if (t === "trailer") return v.official ? 0 : 1;
    if (t === "teaser") return 2;
    return 3;
}

async function findTrailerKey(id, type) {
    try {
        const res = await fetch(`${MINI_API}/${type}/${id}/videos?api_key=${API_KEY}`);
        const data = await res.json();
        const vids = (data.results || [])
            .filter(v => v.site === "YouTube")
            .sort((a, b) => videoRank(a) - videoRank(b));
        return vids[0]?.key || null;
    } catch {
        return null;
    }
}

function playKey(key, title) {
    const mp = document.getElementById("miniplayer");
    const frame = document.getElementById("mp-frame");
    document.getElementById("mp-title").textContent = title || "";
    const cc = (() => { try { return localStorage.getItem("notflix:captions") === "1"; } catch { return false; } })();
    frame.src = `https://www.youtube.com/embed/${key}?autoplay=1&playsinline=1&rel=0&modestbranding=1&cc_load_policy=${cc ? 1 : 0}`;
    void mp.offsetHeight; // commit the hidden state first so the open animates
    mp.classList.remove("hidden");
}

async function openMiniPlayer(item) {
    const mp = document.getElementById("miniplayer");
    const token = ++miniToken;
    document.getElementById("mp-title").textContent = "Loading trailer…";
    document.getElementById("mp-frame").removeAttribute("src");
    void mp.offsetHeight;
    mp.classList.remove("hidden");

    const key = await findTrailerKey(item.id, item.type || "movie");
    if (token !== miniToken) return; // closed or replaced while loading

    if (!key) {
        document.getElementById("mp-title").textContent = "No trailer available for this title.";
        return;
    }
    playKey(key, item.title);
    if (typeof addRecentlyWatched === "function") addRecentlyWatched(item);
}

function closeMiniPlayer() {
    miniToken++;
    document.getElementById("mp-frame").removeAttribute("src"); // stops playback
    document.getElementById("miniplayer").classList.add("hidden");
}
