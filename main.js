const root = document.documentElement;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;

const year = $("[data-year]");
if (year) year.textContent = new Date().getFullYear();

// Static fallback (no GSAP, or reduced motion): plain list, previews play while visible.
const playWhileVisible = (videos) => {
  const io = new IntersectionObserver((entries) => entries.forEach(({ target: v, isIntersecting }) => {
    if (isIntersecting) { v.preload = "auto"; v.play().catch(() => {}); } else v.pause();
  }), { rootMargin: "200px 0px" });
  videos.forEach((v) => io.observe(v));
};

if (!window.gsap || !root.classList.contains("js")) {
  root.classList.remove("js");
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) playWhileVisible($$(".wk video"));
} else {
  gsap.registerPlugin(ScrollTrigger);
  // phones: the URL bar sliding in and out must not re-lay the pinned wheel mid-scroll
  ScrollTrigger.config({ ignoreMobileResize: true });
  const fine = matchMedia("(pointer: fine)").matches;

  // Smooth scroll on GSAP's ticker so ScrollTrigger stays in sync.
  let lenis;
  if (window.Lenis) {
    lenis = new Lenis({ lerp: 0.09 });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  const scrollTo = (y, duration = 1.6) => (lenis ? lenis.scrollTo(y, { duration }) : window.scrollTo({ top: y, behavior: "smooth" }));
  $$('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    e.preventDefault();
    scrollTo(id === "#top" ? 0 : $(id).getBoundingClientRect().top + scrollY);
  }));

  // Nav tucks away going down, returns going up.
  const nav = $(".nav");
  ScrollTrigger.create({
    start: 160,
    onUpdate: (s) => nav.classList.toggle("is-hidden", s.direction === 1),
    onLeaveBack: () => nav.classList.remove("is-hidden"),
  });

  /* ---------- Hero intro ---------- */
  gsap.timeline({ defaults: { ease: "expo.out" }, delay: 0.15 })
    .from(".hero .flow", { opacity: 0, scale: 1.08, duration: 2.4, ease: "power2.out" }, 0)
    .to(".hero .btn", { opacity: 1, y: 0, duration: 1 }, 0.95)
    .fromTo(".portrait", { opacity: 0, x: 120, rotate: 4, clipPath: "inset(100% 0 0 0)" },
      { opacity: 1, x: 0, rotate: 0, clipPath: "inset(0% 0 0 0)", duration: 1.8, clearProps: "clipPath" }, 0.5)
    .from(".portrait img", { scale: 1.35, duration: 2.2 }, 0.5);

  const heroST = { trigger: ".hero", start: "top top", end: "bottom top", scrub: true };
  gsap.to(".hero__text", { yPercent: -18, opacity: 0.1, ease: "none", scrollTrigger: heroST });
  gsap.to(".portrait", { yPercent: -35, ease: "none", scrollTrigger: heroST });
  gsap.to(".hero .flow", { yPercent: 20, ease: "none", scrollTrigger: heroST });

  if (fine) {
    const frame = $(".portrait__frame");
    const rx = gsap.quickTo(frame, "rotationX", { duration: 1, ease: "power3" });
    const ry = gsap.quickTo(frame, "rotationY", { duration: 1, ease: "power3" });
    gsap.set(frame, { transformPerspective: 900 });
    $(".hero").addEventListener("pointermove", (e) => {
      ry((e.clientX / innerWidth - 0.5) * 10);
      rx((e.clientY / innerHeight - 0.5) * -8);
    });
  }

  /* ---------- Text that assembles as you scroll (VigneshArts language) ----------
     Scrubbed, not played once: it comes together on the way down and apart on the way up. */
  const split = (el, mode) => {
    const bits = [];
    // flex containers drop the plain spaces between word pieces ("Say hello" -> "Sayhello"),
    // so their text is moved into one ordinary inline wrapper first
    if (getComputedStyle(el).display.includes("flex")) {
      const inner = document.createElement("span");
      inner.append(...el.childNodes);
      el.append(inner);
    }
    const walk = (node) => [...node.childNodes].forEach((n) => {
      if (n.nodeType === 1) return walk(n);
      if (n.nodeType !== 3 || !n.textContent.trim()) return;
      const frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) return frag.append(part);
        const word = document.createElement("span");
        word.className = mode === "letters" ? "word" : "word bit";
        if (mode === "letters") [...part].forEach((ch) => {
          const b = document.createElement("span");
          b.className = "bit"; b.textContent = ch; word.append(b); bits.push(b);
        });
        else { word.textContent = part; bits.push(word); }
        frag.append(word);
      });
      n.replaceWith(frag);
    });
    const plain = el.textContent.trim().replace(/\s+/g, " ");
    walk(el);
    el.querySelectorAll(".word").forEach((w) => w.setAttribute("aria-hidden", "true"));
    const sr = document.createElement("span");
    sr.className = "sr-only"; sr.textContent = plain;
    el.append(sr);
    return bits;
  };
  const LETTER_DIRS = [[-60, 0, -25], [0, 70, 18], [60, 0, 25], [0, -70, -18]];
  const LETTERS_FROM = { opacity: 0, x: (i) => LETTER_DIRS[i % 4][0], y: (i) => LETTER_DIRS[i % 4][1], rotate: (i) => LETTER_DIRS[i % 4][2], scale: 2 };
  const LETTERS_TO = { opacity: 1, x: 0, y: 0, rotate: 0, scale: 1, ease: "power3.out" };
  const WORDS_FROM = { opacity: 0, y: "0.9em", rotate: 6 };
  const WORDS_TO = { opacity: 1, y: 0, rotate: 0, ease: "power3.out" };
  /* One engine for every scroll-assembled text block (the VigneshArts approach).
     64 separate scrubbed GSAP tweens over ~1000 pieces made phones drop to ~20fps, because every
     scroll frame re-rendered all of them. Here positions are measured once (and on resize /
     ScrollTrigger refresh), each frame only touches blocks whose progress moved, only rewrites
     pieces whose own value moved, and a finished piece is handed back to plain layout (no
     transform, no opacity), so assembled text costs nothing while you keep scrolling. */
  const easeOut = (t) => 1 - (1 - t) ** 3;
  const docTop = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };
  const groups = [];
  // start/end: [edge of the trigger ("top"|"bottom"), viewport fraction] like ScrollTrigger's "top 95%"
  const addGroup = (box, bits, words, trigger, start, end) => groups.push({
    box, bits, words, trigger, start, end, spread: words ? 0.6 : 0.45,
    last: new Float32Array(bits.length).fill(-1), p: -1, s: 0, e: 1 });
  let vh = innerHeight;
  const measure = () => {
    vh = innerHeight;
    const maxY = document.documentElement.scrollHeight - vh;
    for (const g of groups) {
      const t = typeof g.trigger === "function" ? g.trigger() : g.trigger;
      const top = docTop(t), h = t.offsetHeight;
      const at = ([edge, f]) => (edge === "bottom" ? top + h : top) - f * vh;
      g.s = at(g.start); g.e = Math.max(g.s + 1, at(g.end));
      // text near the bottom can't scroll far enough to reach its end point (the footer, the
      // social buttons): squeeze its range into the scroll that exists so it always finishes
      if (g.e > maxY) { g.s = Math.min(g.s, maxY - (g.e - g.s) * 0.5); g.e = maxY; }
      if (g.e <= g.s) g.s = g.e - 1;
    }
  };
  // Blocks that haven't started are hidden whole, and settled blocks are plain text: only blocks
  // mid-assembly carry per-piece transforms. Otherwise ~1000 waiting pieces each keep a transform
  // and opacity node alive, and the browser re-layerises all of them every frame (the phone lag).
  const clear = (g, hidden) => {
    g.box.style.visibility = hidden ? "hidden" : "";
    // hidden pieces get no styles at all, so they're marked unknown (-1), not "at 0": otherwise
    // render() would skip pieces still at 0 on the first reveal and they'd flash in fully visible
    const v = hidden ? -1 : 1;
    for (let i = 0; i < g.bits.length; i++) {
      if (g.last[i] === v) continue;
      g.last[i] = v;
      g.bits[i].style.transform = ""; g.bits[i].style.opacity = "";
    }
  };
  const render = (g) => {
    if (g.p <= 0) return clear(g, true);
    if (g.p >= 1) return clear(g, false);
    if (g.box.style.visibility) g.box.style.visibility = "";
    const n = g.bits.length;
    for (let i = 0; i < n; i++) {
      // each piece gets its own slice of the progress, so the block ripples instead of moving as one
      const t = n < 2 ? g.p : clamp((g.p - (i / (n - 1)) * g.spread) / (1 - g.spread), 0, 1);
      const q = t >= 1 ? 1 : easeOut(t);
      if (Math.abs(q - g.last[i]) < 0.004 && !((q === 1 || q === 0) && g.last[i] !== q)) continue;
      g.last[i] = q;
      const st = g.bits[i].style;
      if (q === 1) { st.transform = ""; st.opacity = ""; continue; }
      if (q === 0) { st.transform = ""; st.opacity = "0"; continue; } // waiting in a moving block: invisible, no transform
      const k = 1 - q;
      st.opacity = q;
      if (g.words) st.transform = `translate(0,${0.9 * k}em) rotate(${6 * k}deg)`;
      else {
        const [dx, dy, r] = LETTER_DIRS[i % 4];
        st.transform = `translate(${dx * k}px,${dy * k}px) rotate(${r * k}deg) scale(${1 + k})`; // 2D: 3D would give every letter its own GPU layer
      }
    }
  };
  const textTick = (time, dtMs) => {
    const y = scrollY;
    // time-based easing: settles in the same ~0.3s at 120fps or on a struggling 15fps device
    const ease = 1 - Math.exp(-(dtMs || 16) / 70);
    for (const g of groups) {
      const target = clamp((y - g.s) / (g.e - g.s), 0, 1);
      if (g.p < 0) g.p = target; // first frame: jump straight to where the page is
      else if (g.p === target) continue;
      else g.p = Math.abs(target - g.p) < 0.002 ? target : g.p + (target - g.p) * ease;
      render(g);
    }
  };
  $$('[data-scrub="letters"]').forEach((el) => {
    // the ring title lives in the pinned wheel: key it off the wheel's pin spacer arriving
    const wheelEl = el.closest(".wheel");
    const trigger = wheelEl ? () => (wheelEl.parentElement.classList.contains("pin-spacer") ? wheelEl.parentElement : wheelEl) : el;
    addGroup(el, split(el, "letters"), false, trigger, wheelEl ? ["top", 0.85] : ["top", 0.95], wheelEl ? ["top", 0.15] : ["top", 0.45]);
  });
  $$('[data-scrub="words"]').forEach((el) => addGroup(el, split(el, "words"), true, el, ["top", 0.92], ["bottom", 0.55]));
  // the hero is already on screen at load, so it plays the same assembly once instead of scrubbing
  $$('[data-scrub^="intro-"]').forEach((el) => {
    const words = el.dataset.scrub === "intro-words";
    const bits = split(el, words ? "words" : "letters");
    gsap.set(el, { visibility: "visible" });
    gsap.fromTo(bits, words ? WORDS_FROM : LETTERS_FROM,
      { ...(words ? WORDS_TO : LETTERS_TO), duration: 1.3, delay: +el.dataset.delay || 0.35, stagger: { amount: words ? 0.5 : 0.4 } });
  });
  // wheel details: same assembly each time a new site comes to the front
  const assemble = (el) => {
    if (!el._bits) el._bits = $$(".bit", el);
    const letters = el._bits.filter((b) => !b.classList.contains("word")), words = el._bits.filter((b) => b.classList.contains("word"));
    gsap.fromTo(letters, LETTERS_FROM, { ...LETTERS_TO, duration: 0.9, stagger: { amount: 0.3 }, overwrite: true });
    gsap.fromTo(words, WORDS_FROM, { ...WORDS_TO, duration: 0.8, delay: 0.1, stagger: { amount: 0.35 }, overwrite: true });
  };

  // Blocks glide in from their own side, tilted in 3D, and settle as you scroll.
  const TILE_DIRS = [[-80, 0, -6], [0, 90, 4], [80, 0, 6], [0, -90, -4]];
  const fly = (els, start = "top 98%", end = "top 60%") => els.forEach((el, i) => {
    const [dx, dy, r] = TILE_DIRS[i % 4];
    gsap.fromTo(el,
      { opacity: 0, x: dx, y: dy, rotationX: (dy / 90) * -22, rotationY: (dx / 80) * 22, rotate: r, scale: 0.82, transformPerspective: 1000 },
      { opacity: 1, x: 0, y: 0, rotationX: 0, rotationY: 0, rotate: 0, scale: 1, ease: "power2.out",
        scrollTrigger: { trigger: el, start, end, scrub: 0.6 } });
  });
  fly([$(".shelf"), $(".cards")]);
  fly($$(".socials li"), "top 102%", "top 75%");

  /* ---------- Education timeline: the line draws itself, steps light up ---------- */
  const tl = $(".timeline");
  const fill = document.createElement("span");
  fill.className = "tl__fill"; fill.setAttribute("aria-hidden", "true");
  tl.prepend(fill);
  gsap.fromTo(fill, { scaleY: 0 }, { scaleY: 1, ease: "none",
    scrollTrigger: { trigger: tl, start: "top 70%", end: "bottom 60%", scrub: 0.4 } });
  $$(".tl").forEach((item) => {
    ScrollTrigger.create({ trigger: item, start: "top 68%",
      onEnter: () => item.classList.add("is-lit"), onLeaveBack: () => item.classList.remove("is-lit") });
    gsap.fromTo([...item.children].filter((c) => !c.classList.contains("tl__dot")), { opacity: 0, x: -100 }, { opacity: 1, x: 0, ease: "power2.out", stagger: 0.1,
      scrollTrigger: { trigger: item, start: "top 95%", end: "top 62%", scrub: 0.6 } });
    gsap.fromTo($(".tl__dot", item), { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, ease: "back.out(2)",
      scrollTrigger: { trigger: item, start: "top 95%", end: "top 62%", scrub: 0.6 } });
  });

  /* ---------- Works wheel (vanilla port of the WorksWheel component) ----------
     `turn` is the whole state: 0 is the ring, 1 is the drum with item 0 at the front, every whole
     number after that is one more item turned past, and the last unit straightens the drum into a
     flat row (`L`, 0..1). Once flat, the row runs on its own like a gallery conveyor: one site
     rests at the front, then the line shifts to the next, forever. Scroll drives everything up to
     the row; the row drives itself. */
  const wheel = $("[data-wheel]");
  if (wheel) {
    const CARD_H = 0.44, CARD_MAX_W = 0.4, CARD_RATIO = 1.45, STEP = 40, DRUM = 2.22, LENS = 2.7,
      RING_R = 1.14, BOW = 1.82, CULL = 1.6, EASE = 0.14;
    const HOLD = 5;            // seconds each site rests at the front of the row
    const SLIDE = 0.075;       // conveyor easing per frame
    const items = $$(".wk", wheel);
    const count = items.length, last = count - 1, steps = last + 2; // ring..drum..row
    const stage = $(".wheel__stage", wheel), drum = $(".wheel__drum", wheel);
    const label = $(".wheel__label", wheel), infoBox = $(".wheel__info", wheel), index = $(".wheel__index", wheel);
    const cards = items.map((it) => $(".wk__card", it));
    const videos = items.map((it) => $("video", it));
    wheel.classList.add("is-wheel");

    // the front card's details live beside the wheel; the originals stay in the cards for no-JS
    const infos = items.map((it) => {
      const c = $(".wk__info", it).cloneNode(true);
      infoBox.append(c);
      split($("h3", c), "letters"); // only the project name assembles; the rest fades with the panel
      return c;
    });

    // Row state: `c` is the (unwrapped) item at the front of the row, `cTo` where it is heading.
    let c = last, cTo = last, L = 0, hold = 0, drag = null, dragged = false;
    const nearest = (i) => i + count * Math.round((c - i) / count); // same item, closest lap
    const go = (next) => { cTo = next; hold = 0; };

    const buttons = items.map((it, i) => {
      const li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.textContent = $("h3", it).textContent;
      b.addEventListener("click", () => {
        if (L > 0.99) return go(nearest(i));
        scrollTo(st.start + ((i + 1) / steps) * (st.end - st.start), 1.2);
      });
      li.append(b); index.append(li); return b;
    });

    // prev / next for the row
    const nav = document.createElement("div");
    nav.className = "wheel__nav";
    nav.innerHTML = '<button type="button" aria-label="Previous website"><svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5"/></svg></button>' +
      '<span class="wheel__dots">' + items.map(() => "<i></i>").join("") + "</span>" +
      '<button type="button" aria-label="Next website"><svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg></button>';
    wheel.append(nav);
    const [prevB, nextB] = $$("button", nav), dots = $$(".wheel__dots i", nav);
    prevB.addEventListener("click", () => go(Math.round(cTo) - 1));
    nextB.addEventListener("click", () => go(Math.round(cTo) + 1));

    let M = {}, dirty = true;
    const rad = (d) => (d * Math.PI) / 180;
    const measure = () => {
      const w = wheel.clientWidth, h = wheel.clientHeight;
      // phones and tablets held upright; phones on their side keep the side-by-side layout
      const narrow = h > w * 1.1 && w < 1100;
      wheel.classList.toggle("is-narrow", narrow);
      dirty = true;
      const cardW = Math.min(h * CARD_H * CARD_RATIO, w * (narrow ? 0.86 : CARD_MAX_W));
      const cardH = cardW / CARD_RATIO;
      const ringR = Math.min(cardH * RING_R, h * 0.36, w * 0.34);
      M = { cardW, cardH, ringR, drumR: cardH * DRUM, bow: cardH * BOW * (narrow ? 0.45 : 1),
        ringScale: clamp((((2 * Math.PI * ringR) / count) * 0.82) / cardW, 0.16, 0.46),
        // the row: front card nudged right of centre so the details keep the left side
        rowX: narrow ? 0 : w * 0.1, gap: cardW * (narrow ? 0.9 : 0.94) };
      stage.style.perspective = `${cardH * LENS}px`;
      // row controls sit just under the front card (narrow layout centres the card at 36%)
      wheel.style.setProperty("--row-under", `${h * (narrow ? 0.36 : 0.5) + cardH / 2 + 18}px`);
      items.forEach((it) => Object.assign(it.style, {
        width: `${cardW}px`, height: `${cardH}px`, marginLeft: `${-cardW / 2}px`, marginTop: `${-cardH / 2}px` }));
      cards.forEach((el) => (el.style.fontSize = `${Math.max(7, cardH * 0.036)}px`));
      // the title sits inside the ring, so it can never be wider than the ring's hole
      label.style.fontSize = `${Math.max(22, Math.min(cardH * 0.2, ringR * 0.24))}px`;
    };
    measure();
    new ResizeObserver(measure).observe(wheel);

    let turn = 0, target = 0, shown = -2;
    const show = (i) => { // i = -1: ring (nothing at the front)
      if (i === shown) return;
      shown = i;
      infos.forEach((el, k) => el.classList.toggle("is-on", k === i));
      if (i >= 0) assemble(infos[i]);
      buttons.forEach((b, k) => b.classList.toggle("is-on", k === i));
      dots.forEach((d, k) => d.classList.toggle("is-on", k === i));
      videos.forEach((v, k) => {
        if (k === i) { v.preload = "auto"; v.play().catch(() => {}); } else v.pause();
      });
    };

    const draw = (dt) => {
      const gap = target - turn;
      turn = Math.abs(gap) < 0.0005 ? target : turn + gap * EASE;
      const m = clamp(turn, 0, 1), pos = clamp(turn - 1, 0, last);
      L = clamp((turn - (last + 1)) / 0.96, 0, 1); // reaches 1 just before the pin ends
      const flat = L > 0.99;
      wheel.classList.toggle("is-line", flat);

      if (flat) {
        // conveyor: rest, then shift one along (only a drag in progress holds it)
        if (!drag && Math.abs(cTo - c) < 0.02) {
          hold += dt;
          if (hold > HOLD) go(Math.round(cTo) + 1);
        }
      } else if (!drag) {
        cTo = nearest(last); // leaving the row: come back round to the drum's front card
      }
      if (!drag) c = Math.abs(cTo - c) < 1e-4 ? cTo : c + (cTo - c) * SLIDE;
      // nothing moving: skip the style writes entirely (the conveyor clock above still ticks)
      const still = turn === target && c === cTo && !drag;
      if (still && !dirty) return;
      dirty = !still;

      drum.style.transform = `translateZ(${-m * (1 - L) * M.drumR}px)`;
      for (let i = 0; i < count; i++) {
        const d = i - pos, dd = d * STEP;
        // row position, wrapped so the line loops: whatever leaves on the left rejoins on the right
        let r = i - c; r -= count * Math.round(r / count);
        const rowScale = lerp(1, 0.8, Math.min(Math.abs(r), 1));
        const x = L * (M.rowX + r * M.gap) + (1 - L) * m * M.bow * (1 - Math.cos(rad(dd)));
        items[i].style.transform =
          `translateX(${x}px) rotateZ(${(1 - m) * d * (360 / count)}deg) translateY(${-(1 - m) * M.ringR}px)` +
          ` rotateX(${(1 - L) * m * dd}deg) translateZ(${(1 - L) * m * M.drumR}px) scale(${lerp(1, rowScale, L)})`;
        const drumOp = m > 0.5 && Math.abs(d) > CULL ? 0 : 1;
        const rowOp = r < 0 ? clamp(1 + r * 1.5, 0, 1) : r > 2.2 ? 0 : 1; // leaving cards fade off to the left
        items[i].style.opacity = L > 0.5 ? rowOp : drumOp;
        items[i].style.zIndex = Math.round(100 - Math.abs(L > 0.5 ? r : d) * 2);
        cards[i].style.transform = `scale(${lerp(M.ringScale, 1, m)})`;
      }
      label.style.opacity = 1 - m;
      const front = L > 0.5 ? ((Math.round(c) % count) + count) % count : clamp(Math.round(pos), 0, last);
      show(m > 0.5 ? front : -1);
    };

    // Drag / swipe the row; a real drag must not also open the site under the pointer.
    stage.addEventListener("pointerdown", (e) => {
      if (L < 0.99) return;
      drag = { x: e.clientX, c }; dragged = false;
    });
    addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 6) dragged = true;
      c = drag.c - dx / M.gap;
    });
    // pointercancel matters on phones: a vertical swipe hands the gesture to the browser's scroll,
    // no pointerup ever comes, and a stale drag would freeze the conveyor for good
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      go(Math.round(c));
    };
    addEventListener("pointerup", endDrag);
    addEventListener("pointercancel", endDrag);
    stage.addEventListener("click", (e) => { if (dragged) { e.preventDefault(); dragged = false; } }, true);
    stage.addEventListener("dragstart", (e) => e.preventDefault());
    // trackpads: a sideways swipe moves the row one site
    let swiped = 0;
    stage.addEventListener("wheel", (e) => {
      if (L < 0.99 || Math.abs(e.deltaX) < Math.abs(e.deltaY) || Math.abs(e.deltaX) < 20) return;
      e.preventDefault();
      const now = performance.now();
      if (now - swiped > 450) { swiped = now; go(Math.round(cTo) + Math.sign(e.deltaX)); }
    }, { passive: false });

    // Pinned while it turns and straightens: one screen-ish of scroll per step, then the page carries on.
    let settle = 0;
    const st = ScrollTrigger.create({
      trigger: wheel, start: "top top", pin: true, anticipatePin: 1,
      end: () => `+=${innerHeight * 0.8 * (steps + 1)}`,
      onUpdate: (s) => {
        target = s.progress * steps;
        // land on an item rather than between two, once the scrolling pauses
        clearTimeout(settle);
        settle = setTimeout(() => {
          if (!s.isActive) return;
          const snap = Math.round(target);
          if (Math.abs(snap - target) > 0.02) scrollTo(s.start + (snap / steps) * (s.end - s.start), 0.7);
        }, 180);
      },
    });
    let running = false;
    const tick = (time, dt) => draw(dt / 1000);
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !running) { running = true; gsap.ticker.add(tick); }
      else if (!e.isIntersecting && running) { running = false; gsap.ticker.remove(tick); show(-2); shown = -2; }
    }).observe(wheel);
  }

  ScrollTrigger.addEventListener("refresh", measure);
  addEventListener("resize", measure);
  new ResizeObserver(measure).observe(document.body); // page height changes (images, pin spacer)
  measure();
  gsap.ticker.add(textTick);
  addEventListener("load", () => ScrollTrigger.refresh());
}
