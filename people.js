/* ==========================================================
   PEOPLE - cast strip, person page header, biographies
   - buildCastStrip(cast, onPick)  circle photo + name + role, scrolls sideways
   - renderCastScroller(details)   "Meet the cast" inside the movie modal
   - decoratePersonView(id, name)  big circular photo on a person's page;
                                   tap it to show / hide the biography
   - openBioCard(person)           stand-alone biography card (Behind the Scenes)
   Biography comes from TMDB; when TMDB has none, Wikipedia's free summary
   API is used (only if it clearly describes an actor/filmmaker).
   Needs state.js; API_KEY comes from mvdata.js / search.js.
========================================================== */

const PEOPLE_API = "https://api.themoviedb.org/3";
const PEOPLE_IMG = "https://image.tmdb.org/t/p";

const PEOPLE_CSS = `
.cast-block { margin: 18px 0 4px; }
.cast-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; }
.cast-head h3 { margin: 0; font-size: 20px; font-weight: 800; }
.cast-head .more-text { cursor: pointer; }

.cast-strip { display: flex; gap: 14px; overflow-x: auto; padding: 2px 2px 6px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.cast-strip::-webkit-scrollbar { display: none; }
.cast-card { flex: 0 0 88px; width: 88px; padding: 0; background: none; border: none; color: inherit;
	font-family: inherit; text-align: center; cursor: pointer; -webkit-tap-highlight-color: transparent;
	display: flex; flex-direction: column; align-items: center; justify-content: flex-start; align-self: flex-start; }
.cast-card .cast-photo { flex: 0 0 88px; }
.cast-name, .cast-role { width: 100%; overflow-wrap: anywhere; }
.cast-photo { display: flex; align-items: center; justify-content: center; width: 88px; height: 88px; border-radius: 50%;
	object-fit: cover; background: #2f2f31; color: #cfcfcf; font-size: 26px; font-weight: 700; overflow: hidden; }
.cast-name { margin: 8px 0 0; font-size: 13px; font-weight: 700; line-height: 1.25; }
.cast-role { margin: 3px 0 0; font-size: 12px; line-height: 1.25; color: #a3a3a3; }
.cast-empty { margin: 0; color: #a3a3a3; font-size: 14px; }

/* Person page (inside the movie modal) */
.person-hero { padding: 20px 16px 14px; text-align: center; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.person-photo { display: flex; align-items: center; justify-content: center; width: 150px; height: 150px; margin: 0 auto;
	border-radius: 50%; object-fit: cover; background: #2f2f31; color: #cfcfcf; font-size: 46px; font-weight: 700;
	box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5); }
.person-name { margin: 14px 0 4px; font-size: 26px; font-weight: 800; }
.person-dept { margin: 0; font-size: 14px; color: #a3a3a3; }
.person-hint { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 13px; color: #cfcfcf; }
.person-hint i { display: inline-block; width: 8px; height: 8px; border-right: 2px solid #cfcfcf; border-bottom: 2px solid #cfcfcf;
	transform: rotate(45deg) translateY(-2px); transition: transform 0.3s ease; }
.person-hero.open .person-hint i { transform: rotate(-135deg) translateY(-2px); }

.bio-panel { max-height: 0; overflow: hidden; text-align: left; transition: max-height 0.4s ease; }
.bio-panel-inner { padding: 16px 4px 4px; }
.bio-facts { margin: 0 0 10px; font-size: 13px; color: #a3a3a3; line-height: 1.4; }
.bio-text { margin: 0; font-size: 15px; line-height: 1.55; color: #e0e0e0; white-space: pre-line; }
.bio-source { margin: 12px 0 0; font-size: 12px; color: #8c8c8c; }
.bio-source a { color: #a3a3a3; }
.person-section-title { margin: 6px 16px 10px; font-size: 18px; font-weight: 800; }

/* Stand-alone biography card */
.bio-modal { position: fixed; inset: 0; z-index: 5800; display: flex; align-items: center; justify-content: center; padding: 16px;
	background: rgba(0, 0, 0, 0.78); opacity: 1; transition: opacity 0.28s ease, visibility 0s linear 0s; }
.bio-modal.hidden { display: flex !important; visibility: hidden; opacity: 0; pointer-events: none;
	transition: opacity 0.24s ease, visibility 0s linear 0.24s; }
.bio-card { position: relative; width: min(100%, 520px); max-height: 88vh; overflow-y: auto; overscroll-behavior: contain;
	padding: 26px 22px 20px; background: #1d1d1d; border-radius: 18px; text-align: center;
	transform: none; transition: transform 0.38s cubic-bezier(0.22, 1, 0.36, 1); }
.bio-modal.hidden .bio-card { transform: translateY(40px) scale(0.96); }
.bio-card .person-photo { width: 130px; height: 130px; }
.bio-card .bio-panel { max-height: none; overflow: visible; }
.bio-close { position: absolute; right: 12px; top: 12px; width: 34px; height: 34px; border: none; border-radius: 50%;
	background: rgba(60, 60, 60, 0.85); cursor: pointer; }
.bio-close::before, .bio-close::after { content: ""; position: absolute; left: 50%; top: 50%; width: 15px; height: 2px;
	margin: -1px 0 0 -7.5px; border-radius: 2px; background: #fff; transform: rotate(45deg); }
.bio-close::after { transform: rotate(-45deg); }
`;

(function injectPeopleStyles() {
    if (document.getElementById("people-styles")) return;
    const style = document.createElement("style");
    style.id = "people-styles";
    style.textContent = PEOPLE_CSS;
    document.head.appendChild(style);
})();

/* ---------- Helpers ---------- */

function pEl(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
}

function photoUrl(photo, size = "w185") {
    if (!photo) return null;
    return /^https?:/.test(photo) ? photo : `${PEOPLE_IMG}/${size}${photo}`;
}

function initials(name) {
    return (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

// <img> with a circle of initials as the fallback
function avatarNode(cls, name, photo) {
    const src = photoUrl(photo, cls === "person-photo" ? "w342" : "w185");
    if (!src) return pEl("div", cls, initials(name));

    const img = document.createElement("img");
    img.className = cls;
    img.alt = name || "";
    img.loading = "lazy";
    img.src = src;
    img.onerror = () => img.replaceWith(pEl("div", cls, initials(name)));
    return img;
}

/* ---------- Cast strip ---------- */

function buildCastStrip(cast, onPick) {
    const strip = pEl("div", "cast-strip");
    cast.forEach(member => {
        const card = pEl("button", "cast-card");
        card.type = "button";
        card.appendChild(avatarNode("cast-photo", member.name, member.photo));
        card.appendChild(pEl("p", "cast-name", member.name));
        if (member.character) card.appendChild(pEl("p", "cast-role", member.character));
        card.addEventListener("click", () => onPick(member));
        strip.appendChild(card);
    });
    return strip;
}

/* ---------- Movie modal: "Meet the cast" ---------- */

function ensureCastBlock() {
    let block = document.getElementById("modal-cast-block");
    if (block) return block;

    const oldRow = document.getElementById("modal-cast")?.closest("p");
    if (!oldRow) return null;

    block = pEl("div", "cast-block");
    block.id = "modal-cast-block";

    const head = pEl("div", "cast-head");
    head.appendChild(pEl("h3", null, "Meet the cast"));
    const more = document.getElementById("modal-more-btn"); // keeps its click handler
    if (more) head.appendChild(more);
    block.appendChild(head);

    const body = pEl("div", "cast-body");
    body.id = "modal-cast-body";
    block.appendChild(body);

    oldRow.replaceWith(block);
    return block;
}

// details = null -> loading; details.cast = [] -> nothing to show
function renderCastScroller(details) {
    const block = ensureCastBlock();
    const body = block?.querySelector("#modal-cast-body");
    if (!body) return;

    body.innerHTML = "";
    if (!details) {
        body.appendChild(pEl("p", "cast-empty", "Loading cast…"));
        return;
    }

    const cast = (details.cast || []).slice(0, 18);
    if (!cast.length) {
        body.appendChild(pEl("p", "cast-empty", "Cast information isn't available."));
        return;
    }

    body.appendChild(buildCastStrip(cast, member => {
        const view = document.getElementById("modal-person-view");
        if (view) view.dataset.nextOrigin = "main"; // Back returns to the movie, not the info page
        const type = typeof activeMediaType !== "undefined" ? activeMediaType : "movie";
        openPersonView(member.id, member.name, "person", type);
    }));
}

/* ---------- Biography data ---------- */

const bioCache = {};
const ROLE_WORDS = /actor|actress|filmmaker|director|producer|comedian|singer|screenwriter|performer|model|voice|presenter|rapper|musician|personality|writer|stuntman/i;

async function wikipediaSummary(name) {
    try {
        const title = encodeURIComponent(name.trim().replace(/\s+/g, "_"));
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}?redirect=true`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.type !== "standard" || !data.extract) return null;
        if (!ROLE_WORDS.test(`${data.description || ""} ${data.extract.slice(0, 200)}`)) return null; // wrong person
        return { text: data.extract, url: data.content_urls?.desktop?.page || null };
    } catch {
        return null;
    }
}

async function fetchPerson(id, fallbackName) {
    if (bioCache[id]) return bioCache[id];

    let data = null;
    try {
        const res = await fetch(`${PEOPLE_API}/person/${id}?api_key=${API_KEY}`);
        data = res.ok ? await res.json() : null;
        // a translated profile may have no biography - ask for the English one
        if (data && !(data.biography || "").trim()) {
            const en = await fetch(`${PEOPLE_API}/person/${id}?api_key=${API_KEY}&language=en-US`);
            if (en.ok) data = { ...data, ...(await en.json()) };
        }
    } catch {}

    const name = data?.name || fallbackName || "";
    let text = (data?.biography || "").trim();
    let source = "TMDB";
    let url = `https://www.themoviedb.org/person/${id}`;

    if (!text && name) {
        const wiki = await wikipediaSummary(name);
        if (wiki) { text = wiki.text; source = "Wikipedia"; url = wiki.url || url; }
    }

    const person = {
        id, name,
        photo: data?.profile_path || null,
        dept: data?.known_for_department || "",
        birthday: data?.birthday || "",
        deathday: data?.deathday || "",
        place: data?.place_of_birth || "",
        text, source, url
    };
    bioCache[id] = person;
    return person;
}

function factsLine(p) {
    const parts = [];
    const fmt = s => new Date(`${s}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    if (p.birthday) {
        let born = `Born ${fmt(p.birthday)}`;
        if (!p.deathday) {
            const age = Math.floor((Date.now() - new Date(p.birthday)) / (365.25 * 24 * 3600 * 1000));
            if (age > 0 && age < 120) born += ` (age ${age})`;
        }
        parts.push(born);
    }
    if (p.deathday) parts.push(`Died ${fmt(p.deathday)}`);
    if (p.place) parts.push(p.place);
    return parts.join(" · ");
}

function fillBio(container, person) {
    container.innerHTML = "";
    const inner = pEl("div", "bio-panel-inner");

    const facts = factsLine(person);
    if (facts) inner.appendChild(pEl("p", "bio-facts", facts));

    if (person.text) {
        inner.appendChild(pEl("p", "bio-text", person.text));
        const src = pEl("p", "bio-source");
        src.append("Source: ");
        const link = document.createElement("a");
        link.href = person.url;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = person.source;
        src.appendChild(link);
        inner.appendChild(src);
    } else {
        inner.appendChild(pEl("p", "bio-text", "No biography is available for this person yet."));
    }
    container.appendChild(inner);
}

/* ---------- Person page header (movie modal) ---------- */

function decoratePersonView(id, name) {
    const grid = document.getElementById("person-view-grid");
    if (!grid) return;

    document.getElementById("person-hero")?.remove();
    document.getElementById("person-section-title")?.remove();

    const hero = pEl("div", "person-hero");
    hero.id = "person-hero";

    const photoHolder = pEl("div");
    photoHolder.appendChild(avatarNode("person-photo", name, null));
    hero.appendChild(photoHolder);
    hero.appendChild(pEl("h2", "person-name", name));
    const dept = pEl("p", "person-dept", "");
    hero.appendChild(dept);

    const hint = pEl("span", "person-hint");
    hint.append("Tap for biography ", document.createElement("i"));
    hero.appendChild(hint);

    const panel = pEl("div", "bio-panel");
    hero.appendChild(panel);

    const sectionTitle = pEl("h3", "person-section-title", "Known for");
    sectionTitle.id = "person-section-title";

    grid.parentElement.insertBefore(hero, grid);
    grid.parentElement.insertBefore(sectionTitle, grid);

    let person = null;
    let open = false;

    const loaded = fetchPerson(id, name).then(p => {
        person = p;
        photoHolder.replaceChildren(avatarNode("person-photo", p.name || name, p.photo));
        dept.textContent = p.dept || "";
        fillBio(panel, p);
        if (open) panel.style.maxHeight = `${panel.scrollHeight}px`;
    });

    hero.addEventListener("click", async () => {
        open = !open;
        hero.classList.toggle("open", open);
        hint.firstChild.textContent = open ? "Hide biography " : "Tap for biography ";

        if (!person) {
            panel.innerHTML = `<div class="bio-panel-inner"><p class="bio-text">Loading biography…</p></div>`;
            panel.style.maxHeight = `${panel.scrollHeight}px`;
            await loaded;
        }
        panel.style.maxHeight = open ? `${panel.scrollHeight}px` : "0px";
    });
}

/* ---------- Stand-alone biography card (Behind the Scenes) ---------- */

let bioModal = null;

function buildBioModal() {
    const modal = pEl("div", "bio-modal hidden");
    modal.id = "bio-modal";
    modal.innerHTML = `
        <div class="bio-card" role="dialog" aria-modal="true">
            <button class="bio-close" aria-label="Close"></button>
            <div class="bio-photo-holder"></div>
            <h2 class="person-name"></h2>
            <p class="person-dept"></p>
            <div class="bio-panel"></div>
        </div>`;
    document.body.appendChild(modal);

    modal.addEventListener("click", e => { if (e.target === modal) closeBioCard(); });
    modal.querySelector(".bio-close").addEventListener("click", closeBioCard);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !modal.classList.contains("hidden")) closeBioCard(); });
    return modal;
}

async function openBioCard(member) {
    if (!bioModal) bioModal = buildBioModal();

    const holder = bioModal.querySelector(".bio-photo-holder");
    holder.replaceChildren(avatarNode("person-photo", member.name, member.photo));
    bioModal.querySelector(".person-name").textContent = member.name;
    bioModal.querySelector(".person-dept").textContent = member.character ? `as ${member.character}` : "";
    const panel = bioModal.querySelector(".bio-panel");
    panel.innerHTML = `<div class="bio-panel-inner"><p class="bio-text">Loading biography…</p></div>`;

    void bioModal.offsetHeight;
    bioModal.classList.remove("hidden");

    const person = await fetchPerson(member.id, member.name);
    if (bioModal.classList.contains("hidden")) return;
    holder.replaceChildren(avatarNode("person-photo", person.name || member.name, person.photo || member.photo));
    if (!member.character && person.dept) bioModal.querySelector(".person-dept").textContent = person.dept;
    fillBio(panel, person);
}

function closeBioCard() {
    bioModal?.classList.add("hidden");
}
