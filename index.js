const subHead = document.querySelector(".sub-head");
const header = document.querySelector(".header");
const headTop = document.getElementById("header-top");

// Only wire this up on pages that actually have the collapsing sub-header
// (home.html). Other pages that happen to include this script (e.g. via a
// shared script tag) would otherwise throw on every scroll event.
if (subHead && header && headTop) {
    let lastScrollY = window.scrollY;

    window.addEventListener("scroll", () => {
        const currentScrollY = window.scrollY;

        // only hide AFTER scrolling a bit (prevents flicker)
        if (currentScrollY > lastScrollY && currentScrollY > 85) {
            subHead.classList.add("hide");
				header.style.height= "50px";
            headTop.classList.add("hide");
        } else {
            subHead.classList.remove("hide");
				header.style.height= "110px";
            headTop.classList.remove("hide");
        }

        lastScrollY = currentScrollY;
    });
}
