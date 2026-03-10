/**
 * Slide Presentation Engine
 * Reusable engine for HTML slide presentations.
 *
 * Contract:
 *   - Content HTML must contain <div class="slide-container" id="slideN"> elements
 *   - Engine auto-injects: controls bar, progress bar, laser pointer, help overlay
 *   - Requires: mermaid.js loaded before this script (if slides use Mermaid diagrams)
 *   - Requires: Font Awesome 6 loaded (for button icons)
 */

// ---------------------------------------------------------------------------
// 1. Mermaid initialisation (safe no-op if mermaid is not loaded)
// ---------------------------------------------------------------------------
if (typeof mermaid !== "undefined") {
    mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        themeVariables: {
            primaryColor: "#1e3a5f",
            primaryTextColor: "#f1f5f9",
            primaryBorderColor: "#3b82f6",
            lineColor: "#60a5fa",
            secondaryColor: "#2d1f3d",
            tertiaryColor: "#1a1a2e",
            mainBkg: "#1e293b",
            nodeBorder: "#3b82f6",
            clusterBkg: "rgba(30, 58, 95, 0.3)",
            clusterBorder: "rgba(59, 130, 246, 0.4)",
            edgeLabelBackground: "rgba(17, 24, 39, 0.95)",
            nodeTextColor: "#f1f5f9",
            fontFamily: '"Inter", sans-serif',
            fontSize: "14px",
        },
    });
}

// ---------------------------------------------------------------------------
// 2. Store original Mermaid source BEFORE anything hides slides
// ---------------------------------------------------------------------------
const mermaidSources = new Map();
document.querySelectorAll(".mermaid").forEach(function (el) {
    mermaidSources.set(el, el.textContent.trim());
});

function renderMermaidInSlide(slideNum) {
    if (typeof mermaid === "undefined") return;
    const slide = document.getElementById("slide" + slideNum);
    if (!slide) return;
    const mermaids = slide.querySelectorAll(".mermaid");
    if (mermaids.length === 0) return;
    mermaids.forEach(function (el) {
        if (el.getAttribute("data-mermaid-rendered") === "true") return;
        var src = mermaidSources.get(el);
        if (!src) return;
        el.removeAttribute("data-processed");
        el.innerHTML = src;
    });
    var toRender = Array.from(mermaids).filter(function (el) {
        return el.getAttribute("data-mermaid-rendered") !== "true";
    });
    if (toRender.length > 0) {
        mermaid.run({ nodes: toRender }).then(function () {
            toRender.forEach(function (el) {
                el.setAttribute("data-mermaid-rendered", "true");
            });
        });
    }
}

// ---------------------------------------------------------------------------
// 3. Auto-inject controls DOM
// ---------------------------------------------------------------------------
(function injectControls() {
    const controlsHTML = `
<div id="slide-controls">
    <div id="slide-counter">1 / 1</div>
    <div id="controls-bar">
        <button id="btn-prev" title="Previous (←)">
            <i class="fa-solid fa-chevron-left"></i>
        </button>
        <button id="btn-next" title="Next (→)">
            <i class="fa-solid fa-chevron-right"></i>
        </button>
        <button id="btn-laser" title="Laser (L)">
            <i class="fa-solid fa-circle-dot"></i>
        </button>
        <button id="btn-timer" title="Timer (T)">
            <i class="fa-solid fa-stopwatch"></i>
        </button>
        <span id="presenter-timer" style="display:none;">00:00</span>
        <button id="btn-fullscreen" title="Fullscreen (F)">
            <i class="fa-solid fa-expand"></i>
        </button>
    </div>
</div>
<div id="progress-bar"><div id="progress-fill"></div></div>
<canvas id="laser-canvas"></canvas>
<div id="laser-dot"></div>
<div id="help-overlay">
    <div id="help-content">
        <h3 style="color:#f9fafb;font-family:'Montserrat',sans-serif;font-size:28px;margin:0 0 25px 0;">
            Raccourcis Clavier
        </h3>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:12px 20px;font-family:'Inter',sans-serif;">
            <kbd>→</kbd><span>Slide suivante</span>
            <kbd>←</kbd><span>Slide précédente</span>
            <kbd>Space</kbd><span>Slide suivante</span>
            <kbd>F</kbd><span>Plein écran</span>
            <kbd>Esc</kbd><span>Quitter plein écran</span>
            <kbd>Home</kbd><span>Première slide</span>
            <kbd>End</kbd><span>Dernière slide</span>
            <kbd>?</kbd><span>Aide (ce panneau)</span>
            <kbd>L</kbd><span>Pointeur laser</span>
            <kbd>T</kbd><span>Chronomètre</span>
        </div>
        <p style="color:#6b7280;font-size:14px;margin-top:20px;font-family:'Inter',sans-serif;">
            Cliquez n'importe où pour fermer
        </p>
    </div>
</div>`;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = controlsHTML.trim();
    while (wrapper.firstChild) {
        document.body.appendChild(wrapper.firstChild);
    }
})();

// ---------------------------------------------------------------------------
// 4. Main presentation engine
// ---------------------------------------------------------------------------
(function () {
    "use strict";

    const slides = Array.from(document.querySelectorAll(".slide-container"));
    const totalSlides = slides.length;
    let currentSlide = 0;
    let isPresentationMode = false;
    let cursorTimer = null;

    const counter = document.getElementById("slide-counter");
    const controls = document.getElementById("slide-controls");
    const progressBar = document.getElementById("progress-bar");
    const progressFill = document.getElementById("progress-fill");
    const btnPrev = document.getElementById("btn-prev");
    const btnNext = document.getElementById("btn-next");
    const btnLaser = document.getElementById("btn-laser");
    const btnTimer = document.getElementById("btn-timer");
    const btnFullscreen = document.getElementById("btn-fullscreen");
    const helpOverlay = document.getElementById("help-overlay");
    const presenterTimer = document.getElementById("presenter-timer");
    const laserDot = document.getElementById("laser-dot");
    const laserCanvas = document.getElementById("laser-canvas");
    const laserCtx = laserCanvas.getContext("2d");
    let laserActive = false;
    let laserTrail = [];
    let laserRAF = null;

    // --- Laser ---
    function resizeLaserCanvas() {
        laserCanvas.width = window.innerWidth;
        laserCanvas.height = window.innerHeight;
    }

    function drawLaserTrail() {
        if (!laserActive) return;
        laserCtx.clearRect(0, 0, laserCanvas.width, laserCanvas.height);

        var now = Date.now();
        while (laserTrail.length > 0 && now - laserTrail[0].t > 400) {
            laserTrail.shift();
        }

        if (laserTrail.length > 1) {
            for (var i = 1; i < laserTrail.length; i++) {
                var age = (now - laserTrail[i].t) / 400;
                var alpha = (1 - age) * 0.6;
                var width = (1 - age) * 6 + 1;

                laserCtx.beginPath();
                laserCtx.moveTo(laserTrail[i - 1].x, laserTrail[i - 1].y);
                laserCtx.lineTo(laserTrail[i].x, laserTrail[i].y);
                laserCtx.strokeStyle =
                    "rgba(255, 50, 50, " + alpha + ")";
                laserCtx.lineWidth = width;
                laserCtx.lineCap = "round";
                laserCtx.shadowColor =
                    "rgba(255, 40, 40, " + alpha * 0.8 + ")";
                laserCtx.shadowBlur = 8;
                laserCtx.stroke();
            }
        }

        laserRAF = requestAnimationFrame(drawLaserTrail);
    }

    function startLaserTrail() {
        resizeLaserCanvas();
        laserTrail = [];
        laserRAF = requestAnimationFrame(drawLaserTrail);
    }

    function stopLaserTrail() {
        if (laserRAF) {
            cancelAnimationFrame(laserRAF);
            laserRAF = null;
        }
        laserTrail = [];
        laserCtx.clearRect(0, 0, laserCanvas.width, laserCanvas.height);
    }

    // --- Timer ---
    let timerActive = false;
    let timerStart = null;
    let timerInterval = null;

    function startTimer() {
        timerStart = Date.now();
        presenterTimer.style.display = "";
        presenterTimer.textContent = "00:00";
        timerInterval = setInterval(function () {
            var elapsed = Math.floor((Date.now() - timerStart) / 1000);
            var m = String(Math.floor(elapsed / 60)).padStart(2, "0");
            var s = String(elapsed % 60).padStart(2, "0");
            presenterTimer.textContent = m + ":" + s;
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
        timerInterval = null;
        presenterTimer.style.display = "none";
    }

    function toggleLaser() {
        laserActive = !laserActive;
        document.body.classList.toggle("laser-active", laserActive);
        btnLaser.classList.toggle("btn-active", laserActive);
        if (laserActive) {
            startLaserTrail();
        } else {
            stopLaserTrail();
        }
    }

    function toggleTimerFn() {
        timerActive = !timerActive;
        btnTimer.classList.toggle("btn-active", timerActive);
        if (timerActive) {
            startTimer();
        } else {
            stopTimer();
        }
    }

    // --- Slide navigation ---
    function updateSlide() {
        const prev = document.querySelector(".slide-container.active-slide");
        if (prev && prev !== slides[currentSlide]) {
            prev.classList.remove("active-slide");
            prev.classList.add("slide-exit");
            prev.addEventListener("animationend", function handler() {
                prev.classList.remove("slide-exit");
                prev.removeEventListener("animationend", handler);
            });
        }

        slides.forEach((s, i) => {
            if (i === currentSlide) {
                s.classList.remove("slide-exit");
                s.classList.add("active-slide");
            } else if (!s.classList.contains("slide-exit")) {
                s.classList.remove("active-slide");
            }
        });

        counter.textContent = currentSlide + 1 + " / " + totalSlides;
        renderMermaidInSlide(currentSlide + 1);
        scaleSlide();

        const pct = ((currentSlide + 1) / totalSlides) * 100;
        progressFill.style.width = pct + "%";

        controls.classList.add("visible");
        progressBar.classList.add("visible");
        clearTimeout(controls._hideTimer);
        controls._hideTimer = setTimeout(() => {
            controls.classList.remove("visible");
            progressBar.classList.remove("visible");
        }, 1500);
    }

    function goTo(index) {
        if (index < 0) index = 0;
        if (index >= totalSlides) index = totalSlides - 1;
        currentSlide = index;
        updateSlide();
    }

    function next() {
        goTo(currentSlide + 1);
    }
    function prev() {
        goTo(currentSlide - 1);
    }

    // --- Scaling ---
    function scaleSlide() {
        if (!isPresentationMode) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const sw = 1280;
        const sh = 720;
        const scale = Math.min(vw / sw, vh / sh);
        slides.forEach((s) => {
            s.style.transform =
                "translate(-50%, -50%) scale(" + scale + ")";
        });
    }

    // --- Presentation mode ---
    function enterPresentation() {
        isPresentationMode = true;
        document.body.classList.add("presentation-mode");
        updateSlide();
        window.addEventListener("resize", scaleSlide);
        window.addEventListener("resize", resizeLaserCanvas);
        resetCursorTimer();
    }

    function exitPresentation() {
        isPresentationMode = false;
        document.body.classList.remove("presentation-mode", "cursor-hidden");
        slides.forEach((s) => {
            s.classList.remove("active-slide");
            s.style.transform = "";
        });
        window.removeEventListener("resize", scaleSlide);
        window.removeEventListener("resize", resizeLaserCanvas);
        clearTimeout(cursorTimer);
        if (timerActive) {
            timerActive = false;
            stopTimer();
            btnTimer.classList.remove("btn-active");
        }
        if (laserActive) {
            laserActive = false;
            stopLaserTrail();
            document.body.classList.remove("laser-active");
            btnLaser.classList.remove("btn-active");
        }
    }

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement
                .requestFullscreen()
                .then(() => {
                    enterPresentation();
                    btnFullscreen.innerHTML =
                        '<i class="fa-solid fa-compress"></i>';
                })
                .catch(() => {
                    enterPresentation();
                });
        } else {
            document.exitFullscreen().then(() => {
                exitPresentation();
                btnFullscreen.innerHTML =
                    '<i class="fa-solid fa-expand"></i>';
            });
        }
    }

    function resetCursorTimer() {
        document.body.classList.remove("cursor-hidden");
        clearTimeout(cursorTimer);
        cursorTimer = setTimeout(() => {
            if (isPresentationMode)
                document.body.classList.add("cursor-hidden");
        }, 3000);
    }

    // --- Auto-enter presentation mode on load ---
    enterPresentation();

    // --- Keyboard ---
    document.addEventListener("keydown", function (e) {
        if (helpOverlay.classList.contains("visible")) {
            helpOverlay.classList.remove("visible");
            e.preventDefault();
            return;
        }

        switch (e.key) {
            case "ArrowRight":
            case " ":
            case "PageDown":
                e.preventDefault();
                next();
                break;
            case "ArrowLeft":
            case "PageUp":
                e.preventDefault();
                prev();
                break;
            case "Home":
                e.preventDefault();
                goTo(0);
                break;
            case "End":
                e.preventDefault();
                goTo(totalSlides - 1);
                break;
            case "f":
            case "F":
                e.preventDefault();
                toggleFullscreen();
                break;
            case "Escape":
                if (document.fullscreenElement) {
                    // Browser handles ESC for fullscreen
                } else if (isPresentationMode) {
                    exitPresentation();
                }
                break;
            case "?":
                e.preventDefault();
                helpOverlay.classList.toggle("visible");
                break;
            case "l":
            case "L":
                e.preventDefault();
                toggleLaser();
                break;
            case "t":
            case "T":
                e.preventDefault();
                toggleTimerFn();
                break;
        }
        if (isPresentationMode) resetCursorTimer();
    });

    // --- Mouse movement ---
    document.addEventListener("mousemove", function (e) {
        if (isPresentationMode) {
            document.body.classList.remove("cursor-hidden");
            clearTimeout(cursorTimer);
            cursorTimer = setTimeout(() => {
                if (isPresentationMode && !laserActive)
                    document.body.classList.add("cursor-hidden");
            }, 3000);

            if (laserActive) {
                laserDot.style.left = e.clientX + "px";
                laserDot.style.top = e.clientY + "px";
                laserTrail.push({
                    x: e.clientX,
                    y: e.clientY,
                    t: Date.now(),
                });
            }
        }
    });

    // --- Help overlay click to close ---
    helpOverlay.addEventListener("click", function () {
        helpOverlay.classList.remove("visible");
    });

    // --- Button handlers ---
    btnPrev.addEventListener("click", function (e) {
        e.stopPropagation();
        prev();
    });
    btnNext.addEventListener("click", function (e) {
        e.stopPropagation();
        next();
    });
    btnFullscreen.addEventListener("click", function (e) {
        e.stopPropagation();
        toggleFullscreen();
    });
    btnLaser.addEventListener("click", function (e) {
        e.stopPropagation();
        toggleLaser();
    });
    btnTimer.addEventListener("click", function (e) {
        e.stopPropagation();
        toggleTimerFn();
    });

    // --- Progress bar click to jump ---
    progressBar.addEventListener("click", function (e) {
        e.stopPropagation();
        var rect = progressBar.getBoundingClientRect();
        var pct = (e.clientX - rect.left) / rect.width;
        var target = Math.round(pct * (totalSlides - 1));
        goTo(target);
    });

    // --- Fullscreen change event (handle ESC exiting fullscreen) ---
    document.addEventListener("fullscreenchange", function () {
        if (!document.fullscreenElement) {
            btnFullscreen.innerHTML =
                '<i class="fa-solid fa-expand"></i>';
        }
    });

    // --- URL hash support: #slide5 ---
    function readHash() {
        const match = window.location.hash.match(/^#slide(\d+)$/);
        if (match) goTo(parseInt(match[1], 10) - 1);
    }
    readHash();
    window.addEventListener("hashchange", readHash);

    // --- Touch support ---
    let touchStartX = 0;
    document.addEventListener(
        "touchstart",
        function (e) {
            touchStartX = e.changedTouches[0].screenX;
        },
        { passive: true },
    );

    document.addEventListener(
        "touchend",
        function (e) {
            const diff = e.changedTouches[0].screenX - touchStartX;
            if (Math.abs(diff) > 60) {
                if (diff < 0) next();
                else prev();
            }
        },
        { passive: true },
    );
})();
