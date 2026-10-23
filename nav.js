/* ==========================================================
   NAVIGATION INSIDE THE MOVIE MODAL
   Opening a title from a link inside the modal (a movie in an actor's page,
   "More like this", a genre page ...) remembers where you were, and a Back
   button appears beside the Close button to return there - including back
   to the actor/genre page you came from. A title opened straight from a
   row (Home, My List, notifications ...) has nothing to go back to, so it
   only has Close.
   Load AFTER mvdata.js / search.js (end of <body>).
========================================================== */

const navStack = [];      // [{ movie, sub }] most recent last
let navRestoring = false;
let lastSub = null;       // { id, name, kind, mediaType } of the person/genre page last opened

(function addBackButton() {
    if (document.getElementById("modal-back-btn")) return;

    const style = document.createElement("style");
    style.id = "nav-styles";
    style.textContent = `
.back-btn { position: relative; }
.back-btn.hidden { display: none !important; }
.back-btn::before { content: ""; position: absolute; left: 50%; top: 50%; width: 9px; height: 9px;
	margin: -5px 0 0 -3px; border-left: 2px solid #fff; border-bottom: 2px solid #fff; transform: rotate(45deg); }`;
    document.head.appendChild(style);

    const controls = document.querySelector(".top-controls");
    if (!controls) return;

    const btn = document.createElement("button");
    btn.id = "modal-back-btn";
    btn.className = "circle-btn back-btn hidden";
    btn.setAttribute("aria-label", "Back");
    btn.addEventListener("click", goBack);
    controls.prepend(btn);
})();

function updateBackButton() {
    document.getElementById("modal-back-btn")?.classList.toggle("hidden", navStack.length === 0);
}

function snapshotNow() {
    if (typeof activeMovieSummary === "undefined" || !activeMovieSummary) return null;
    const personView = document.getElementById("modal-person-view");
    const subOpen = personView && !personView.classList.contains("hidden") && lastSub;
    return { movie: { ...activeMovieSummary }, sub: subOpen ? { ...lastSub } : null };
}

// remember which person/genre page is showing
if (typeof openPersonView === "function") {
    const originalOpenPerson = openPersonView;
    openPersonView = function (id, name, kind, mediaType) {
        lastSub = { id, name, kind, mediaType };
        return originalOpenPerson.apply(this, arguments);
    };
}

// every title opened while the modal is already open is a "link" -> push where we were
if (typeof openModal === "function") {
    const originalOpenModal = openModal;
    openModal = function (args) {
        if (!navRestoring) {
            const modal = document.getElementById("modal");
            const alreadyOpen = modal && !modal.classList.contains("hidden");
            if (alreadyOpen) {
                const snap = snapshotNow();
                if (snap && String(snap.movie.id) !== String(args.id)) navStack.push(snap);
            } else {
                navStack.length = 0; // fresh open (Home row, My List, notification...)
            }
        }
        const result = originalOpenModal.apply(this, arguments);
        updateBackButton();
        return result;
    };
}

function goBack() {
    const snap = navStack.pop();
    if (!snap) return;

    navRestoring = true;
    try {
        if (typeof closeSubviews === "function") closeSubviews();
        openModal(snap.movie);
    } finally {
        navRestoring = false;
    }
    updateBackButton();

    // came from an actor's (or genre) page -> go back onto it
    if (snap.sub) {
        setTimeout(() => {
            const view = document.getElementById("modal-person-view");
            if (view) view.dataset.nextOrigin = "main";
            openPersonView(snap.sub.id, snap.sub.name, snap.sub.kind, snap.sub.mediaType);
        }, 150);
    }
}

// closing the modal ends the trail
(function resetOnClose() {
    const modal = document.getElementById("modal");
    if (!modal) return;
    new MutationObserver(() => {
        if (modal.classList.contains("hidden")) {
            navStack.length = 0;
            lastSub = null;
            updateBackButton();
        }
    }).observe(modal, { attributes: true, attributeFilter: ["class"] });
})();
