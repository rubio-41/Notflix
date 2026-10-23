/* ==========================================================
   TRAILER CAPTIONS (button beside the close button)
   Uses YouTube's own caption module through the IFrame API, so it works
   for any trailer that has captions. The choice is remembered and applied
   to every trailer you open afterwards.

   Note: YouTube does not hand caption TEXT to the page, so the line under
   the trailer can't show subtitles itself. It is empty (invisible) and only
   flashes a short status ("Captions on" / "No captions for this trailer").
   The language follows the profile's Subtitles setting.

   Icons: media/icons/trailer/captions-on.png / captions-off.png
   Load AFTER mvdata.js / search.js and icons.js.
========================================================== */

const CC_PREF_KEY = "notflix:captions";

let captionsWanted = (() => {
    try { return localStorage.getItem(CC_PREF_KEY) === "1"; } catch { return false; }
})();

const ccBtn = document.getElementById("captions-btn");
const ccNote = document.querySelector(".subtitle-preview");
const ccDefaultNote = ccNote ? ccNote.textContent : "";
let ccNoteTimer = null;
let ccAppliedFor = null; // video id the captions were last applied to

const ccWait = ms => new Promise(r => setTimeout(r, ms));

function ccPlayer() {
    return (typeof ytPlayer !== "undefined" && ytPlayer && typeof ytPlayer.loadModule === "function")
        ? ytPlayer : null;
}

function renderCaptionsButton(on) {
    if (!ccBtn) return;
    setIcon(ccBtn.querySelector("img"), "trailer", "captions", on);
    ccBtn.setAttribute("aria-pressed", String(on));
    ccBtn.setAttribute("aria-label", on ? "Turn captions off" : "Turn captions on");
}

function noteCaptions(text) {
    if (!ccNote) return;
    ccNote.textContent = text;
    clearTimeout(ccNoteTimer);
    ccNoteTimer = setTimeout(() => { ccNote.textContent = ccDefaultNote; }, 2200);
}

async function applyCaptions(announce) {
    const player = ccPlayer();
    if (!player) return;

    if (!captionsWanted) {
        try { player.unloadModule("captions"); } catch {}
        renderCaptionsButton(false);
        return;
    }

    try { player.loadModule("captions"); } catch {}
    await ccWait(700); // the module needs a moment before it lists tracks

    let tracks = [];
    try { tracks = player.getOption("captions", "tracklist") || []; } catch {}

    if (!tracks.length) {
        renderCaptionsButton(false);
        if (announce) noteCaptions("No captions for this trailer");
        return;
    }

    const wanted = (typeof profileSetting === "function" ? profileSetting("subtitleLang", "en") : "en").toLowerCase();
    const pick = tracks.find(t => (t.languageCode || "").toLowerCase().startsWith(wanted)) || tracks[0];
    try { player.setOption("captions", "track", { languageCode: pick.languageCode }); } catch {}
    renderCaptionsButton(true);
    if (announce) noteCaptions("Captions on");
}

ccBtn?.addEventListener("click", () => {
    captionsWanted = !captionsWanted;
    try { localStorage.setItem(CC_PREF_KEY, captionsWanted ? "1" : "0"); } catch {}

    if (!captionsWanted) noteCaptions("Captions off");
    ccAppliedFor = null;
    applyCaptions(captionsWanted);
});

// Re-apply when a new trailer starts playing (captions reset per video)
function ccOnPlayerState(e) {
    if (!captionsWanted || typeof YT === "undefined" || e.data !== YT.PlayerState.PLAYING) return;
    const player = ccPlayer();
    let id = null;
    try { id = player.getVideoData().video_id; } catch {}
    if (id && id === ccAppliedFor) return;
    ccAppliedFor = id;
    applyCaptions(false);
}

if (typeof onPlayerStateChange === "function") {
    const originalStateHandler = onPlayerStateChange;
    onPlayerStateChange = function (e) {
        originalStateHandler(e);
        ccOnPlayerState(e);
    };
}

renderCaptionsButton(captionsWanted);
