const API_KEY = "49a985b7ac7bea35802cc034cbbe3655";

const bgImage = document.querySelector('.bg-image');
const showLogo = document.querySelector('.show-logo-placeholder');
const showWrapper = document.getElementById('show-logo-wrapper');
const netflixWrapper = document.getElementById('netflix-wrapper');
const studioLogo = document.querySelector('.netflix-logo-placeholder');

const STUDIO_LOGO_HEIGHT = 28; // px - the studio/service badge is sized by height, not a fixed width

let sequence = [];
let currentIndex = 0;
let rotationStarted = false;

/* Whoever actually made or streams the title - checked in this order:
   1. A production company literally named on the movie (an Original,
      Netflix included - TMDB has Netflix itself as a company with its
      own logo, so no special-casing is needed for it).
   2. Failing that, whichever streaming service it's actually available
      on (US region), picked by TMDB's own display priority.
   3. Failing that, the first production company TMDB has a logo for.
   Returns null when none of the above turned up a usable logo, in which
   case the badge is just hidden rather than shown with a placeholder. */
async function getStudioOrServiceLogo(movieId) {
    try {
        const res = await fetch(
            `https://api.themoviedb.org/3/movie/${movieId}?api_key=${API_KEY}&append_to_response=watch/providers`
        );
        const data = await res.json();

        const companies = (data.production_companies || []).filter(c => c.logo_path);

        const originCompany = companies.find(c => c.name === "Netflix") || companies[0];
        if (originCompany) {
            return {
                name: originCompany.name,
                logo: `https://image.tmdb.org/t/p/w300${originCompany.logo_path}`
            };
        }

        const flatrate = data["watch/providers"]?.results?.US?.flatrate;
        if (flatrate && flatrate.length) {
            const top = [...flatrate].sort(
                (a, b) => (a.display_priority || 0) - (b.display_priority || 0)
            )[0];
            if (top?.logo_path) {
                return {
                    name: top.provider_name,
                    logo: `https://image.tmdb.org/t/p/w92${top.logo_path}`
                };
            }
        }

        return null;
    } catch {
        return null;
    }
}

/* Builds the rotation pool from TMDB's trending list - a backdrop, real
   title-logo art, and whichever studio/service badge applies, for each.
   Titles with no title-logo art on file are skipped, since this page has
   no room for a text title to stand in for one. */
async function buildPreviewPool() {
    try {
        const res = await fetch(
            `https://api.themoviedb.org/3/trending/movie/week?api_key=${API_KEY}`
        );
        const data = await res.json();
        const candidates = (data.results || []).slice(0, 10);

        const pool = await Promise.all(
            candidates.map(async movie => {
                if (!movie.backdrop_path) return null;
                try {
                    const [imgRes, studio] = await Promise.all([
                        fetch(
                            `https://api.themoviedb.org/3/movie/${movie.id}/images?api_key=${API_KEY}&include_image_language=en,null`
                        ).then(r => r.json()),
                        getStudioOrServiceLogo(movie.id)
                    ]);

                    const logo = (imgRes.logos || [])[0];
                    if (!logo) return null;

                    const aspect = logo.width && logo.height ? logo.width / logo.height : 2.5;
                    const logoSize = Math.max(180, Math.min(320, Math.round(140 * aspect)));

                    return {
                        bg: `https://image.tmdb.org/t/p/original${movie.backdrop_path}`,
                        logo: `https://image.tmdb.org/t/p/w500${logo.file_path}`,
                        logoSize: `${logoSize}px`,
                        studio
                    };
                } catch {
                    return null;
                }
            })
        );

        sequence = pool.filter(Boolean);
    } catch (err) {
        console.error(err);
        sequence = [];
    }
}

function applyStudioLogo(studio) {
    if (!netflixWrapper || !studioLogo) return;

    if (!studio) {
        netflixWrapper.style.display = 'none';
        return;
    }

    studioLogo.onload = () => {
        const ratio = studioLogo.naturalWidth && studioLogo.naturalHeight
            ? studioLogo.naturalWidth / studioLogo.naturalHeight
            : 2.5;
        netflixWrapper.style.width = `${Math.round(STUDIO_LOGO_HEIGHT * ratio)}px`;
    };

    studioLogo.style.height = `${STUDIO_LOGO_HEIGHT}px`;
    studioLogo.style.width = 'auto';
    studioLogo.alt = studio.name;
    studioLogo.src = studio.logo;
    netflixWrapper.style.display = 'flex';
}

function updateSlide(index) {
    const slide = sequence[index];
    if (!slide || !bgImage || !showLogo) return;

    bgImage.src = slide.bg;
    showLogo.src = slide.logo;
    if (showWrapper) showWrapper.style.width = slide.logoSize;
    applyStudioLogo(slide.studio);
}

function runAnimation() {
    if (!sequence.length || !bgImage) return;

    // 1. Reset animation class
    bgImage.classList.remove('zoom-in');
    void bgImage.offsetWidth;
    bgImage.classList.add('zoom-in');

    // 2. Set the hold duration
    setTimeout(() => {
        const nextIndex = (currentIndex + 1) % sequence.length;

        // PRE-LOAD the next image before fading
        const img = new Image();
        img.src = sequence[nextIndex].bg;

        img.onload = () => {
            bgImage.classList.add('fade-out');

            setTimeout(() => {
                currentIndex = nextIndex;
                bgImage.src = sequence[currentIndex].bg;
                updateSlide(currentIndex);

                bgImage.classList.remove('fade-out');

                runAnimation();
            }, 800);
        };
    }, 5200);
}

async function init() {
    await buildPreviewPool();
    if (!sequence.length) return; // nothing fetched - leave the page blank rather than break it

    updateSlide(0);
    if (!rotationStarted) {
        rotationStarted = true;
        runAnimation();
    }
}

init();


/* ==========================================================
   PROFILE CHOOSER
   - Shows only what's in storage: the default "User" (until you add more),
     everyone created on the Profile page, then Add and Edit.
   - Tap a profile to enter (asks for the PIN if it has one)
   - "Add" opens the Add Profile modal (max 5 profiles)
   - "Edit" switches to manage mode: tap a profile to edit it
   - Stays in sync: profiles added/edited/deleted on the Profile page show up
     here (and vice versa), even if this page is open in another tab.
   Works with the page's existing markup - the old placeholder tiles are
   replaced - and loads state.js / profiles.js itself if the page doesn't.
========================================================== */

(function profileChooser() {
    const row = document.getElementById("profiles-row") || document.querySelector(".profiles-row");
    const title = document.getElementById("chooser-title") || document.querySelector(".title");
    if (!row) return;

    // hide the placeholder tiles until the real ones are drawn (no flash)
    row.style.visibility = "hidden";

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = src;
            s.onload = resolve;
            s.onerror = () => reject(new Error(`Could not load ${src}`));
            document.body.appendChild(s);
        });
    }

    async function ensureDependencies() {
        if (typeof getProfiles !== "function") await loadScript("state.js");
        if (typeof openProfileEditor !== "function") await loadScript("profiles.js");
    }

    let manageMode = new URLSearchParams(location.search).has("manage");

    const PENCIL_SVG = '<svg class="avatar-pencil" viewBox="0 0 24 24"><path d="M4 20l1-4L16.500 4.500a2.100 2.100 0 013 3L8 19z"/><path d="M14 7l3 3"/></svg>';

    function tileAvatar(src, extraClass = "") {
        const wrap = document.createElement("div");
        wrap.className = `avatar ${extraClass}`.trim();
        if (src) {
            const img = document.createElement("img");
            img.className = "avatar";
            img.alt = "";
            img.src = src;
            wrap.appendChild(img);
        }
        return wrap;
    }

    function buildTile(label, avatar, onClick) {
        const tile = document.createElement("div");
        tile.className = "profile";
        const link = document.createElement("div");
        link.className = "profile-link";
        const name = document.createElement("span");
        name.className = "name";
        name.textContent = label;
        link.append(avatar, name);
        tile.appendChild(link);
        tile.addEventListener("click", onClick);
        return tile;
    }

    async function enterProfile(profile) {
        if (!(await requirePin(profile))) return;
        setCurrentProfile(profile.id);
        location.href = "home.html";
    }

    async function editProfile(profile) {
        const result = await openProfileEditor({ mode: "edit", profile });
        if (result?.deleted) deleteProfile(result.deleted);
    }

    function render() {
        row.innerHTML = "";
        if (title) title.textContent = manageMode ? "Manage Profiles" : "Choose Your Profile";

        const profiles = getProfiles();

        profiles.forEach(profile => {
            const avatar = tileAvatar(profile.avatar, manageMode ? "managing" : "");
            if (manageMode) {
                avatar.insertAdjacentHTML("beforeend", PENCIL_SVG);
            } else if (profile.kids) {
                const kids = document.createElement("span");
                kids.className = "kids-badge";
                kids.textContent = "KIDS";
                avatar.appendChild(kids);
            } else if (profile.lock) {
                const lock = document.createElement("span");
                lock.className = "lock-badge";
                lock.textContent = "🔒";
                avatar.appendChild(lock);
            }
            row.appendChild(buildTile(profile.name, avatar, () =>
                manageMode ? editProfile(profile) : enterProfile(profile)));
        });

        if (profiles.length < MAX_PROFILES) {
            // media/icons/login/add.png is used when present; otherwise a CSS "+" shows
            const plusAvatar = tileAvatar(null, "plus");
            const plusImg = document.createElement("img");
            plusImg.className = "avatar";
            plusImg.alt = "";
            plusImg.onload = () => plusAvatar.classList.add("has-img");
            plusImg.onerror = () => plusImg.remove();
            plusImg.src = "media/icons/login/add.png";
            plusAvatar.appendChild(plusImg);

            row.appendChild(buildTile("Add", plusAvatar, async () => {
                await openProfileEditor({ mode: "add" });
            }));
        }

        row.appendChild(buildTile(manageMode ? "Done" : "Edit",
            tileAvatar("media/icons/login/edit.jpeg"), () => {
                manageMode = !manageMode;
                render();
            }));

        row.style.visibility = "visible";
    }

    ensureDependencies().then(() => {
        render();

        // same tab: profile editor saved/deleted something
        document.addEventListener("notflix:profiles", render);

        // other tab (e.g. Profile page open elsewhere) changed the profile list
        window.addEventListener("storage", e => {
            if (e.key === null || e.key === PROFILES_KEY) render();
        });

        // coming back to this page (back button / bfcache) -> redraw from storage
        window.addEventListener("pageshow", e => { if (e.persisted) render(); });
    }).catch(err => {
        console.error(err);
        row.style.visibility = "visible"; // fall back to whatever the page has
    });
})();
