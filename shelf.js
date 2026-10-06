/**
 * Shelf: eight hardbacks on a wall shelf, one per tool I work with, each with a
 * rounded spine, head and tail bands across it, and the page block set inside
 * its boards. The book under the pointer slides forward; the books beside it
 * lean away from it, less the farther they are, staggered outwards. At rest
 * the last book leans on its neighbour and one sits proud with bright bands.
 * The slider is how far the chosen book comes forward, in world units.
 *
 * The pattern: discrete items. Tweens, a stagger by distance, and a hit test on
 * the books' rest centres, which never move.
 */
const {
  Cam, clamp, fit, open, poly, prism, proj, facing, put, rad, rings, run, hull,
  tdone, tset, tval, tween, disposer, mk, pointer, register, solid,
} = HL;

const TOOLS = [["java", "language"], ["mysql", "database"], ["php", "language"], ["linux", "os"],
  ["html", "markup"], ["css", "styling"], ["javascript", "language"], ["git", "tooling"]];
const TH = [7, 9, 6, 8, 10, 7, 8, 6];            // thickness
const HT = [46, 52, 40, 48, 44, 50, 38, 34];     // height
const DP = [30, 34, 28, 32, 30, 34, 28, 26];     // depth
const REST_P = [0, 0, 4, 0, 0, 0, 0, 0], REST_L = [0, 0, 0, 0, 0, 0, 0, -12];
const MARK = 2, LEAN = [0, 7, 4, 2, 1, 0.5, 0, 0], GAP = 3, DS = 38, PK = 5, STEP = 45, PMAX = 24;

// Book positions along the shelf; the last one sits far enough off to lean on its neighbour.
const X = [];
let x = 4;
for (let i = 0; i < 8; i++) {
  if (i === 7) x += HT[7] * Math.sin(rad(12)) + 0.4 - GAP;
  X[i] = x; x += TH[i] + GAP;
}
const XE = x + 4;

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let pull = value;

  const C = Cam(30, 0.5, 3.3);
  fit(C, [[-4, 0, -PK], [XE, 0, -PK], [XE, DS + 2, -PK], [-4, DS + 2, -PK], [X[1], 0, HT[1]], [X[5], 0, HT[5]],
    [X[0], DS - 2 + PMAX, 0], [X[0], DS - 2 + PMAX, HT[0]]], 200, 166);
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [sr, si] = rings(-4, 0, XE, DS + 2, 2, 1);
  put(solid(g), prism(P, front, sr, si, -PK, 0));

  // Left to right is back to front for a row along x, whatever each book's pull.
  const books = TH.map((t, i) => {
    const y0 = DS - 2 - DP[i];
    const [ring, inner] = rings(0, y0, t, y0 + DP[i], t * 0.45, 1);
    const grp = mk("g", {}, g), el = solid(grp), bands = mk("path", { class: "nf lo" }, grp);
    const label = mk("text", { class: "spine" }, grp), cover = mk("text", { class: "cover" }, grp);
    label.textContent = cover.textContent = TOOLS[i][0];
    // The cover's title runs across the cover, which shows once the book is out and its neighbours lean away.
    cover.style.fontSize = Math.min(6, DP[i] * 0.78 / (TOOLS[i][0].length * 0.72)) + "px";
    // Long names shrink to fit between the bands (mono advance plus tracking is about 0.75em a letter).
    label.style.fontSize = Math.min(4.2, (HT[i] - 12) / (TOOLS[i][0].length * 0.75)) + "px";
    return { t, ring, inner, spine: run(ring, (q) => q.nv > 0.35), el, bands, label, cover,
      p: tween(REST_P[i]), l: tween(REST_L[i]), last: "" };
  });

  /** Book i's ring at height w along its own spine, leaning th degrees (it pivots on the edge it leans toward) and pulled by p. */
  function at(i, ring, w, th, p) {
    const b = books[i], s = Math.sin(rad(th)), c = Math.cos(rad(th)), piv = th > 0 ? b.t : 0;
    return ring.map((q) => P(X[i] + piv + (q.u - piv) * c + w * s, q.v + p, -(q.u - piv) * s + w * c));
  }
  function draw(i, th, p) {
    const b = books[i], h = HT[i];
    b.el.sil.setAttribute("d", poly(hull(at(i, b.ring, 0, th, p).concat(at(i, b.ring, h, th, p)))));
    b.el.cr.setAttribute("d", poly(at(i, b.inner, h, th, p)));
    b.bands.setAttribute("d", open(at(i, b.spine, 4, th, p)) + open(at(i, b.spine, h - 4, th, p)));
    // The tool's name is printed on the spine: its baseline runs down the book, its up points along the thickness,
    // so the type lies in the spine's plane and leans with the book.
    const mid = (u) => [{ u, v: DS - 2 }];
    const [o] = at(i, mid(b.t / 2), h / 2, th, p), [dn] = at(i, mid(b.t / 2), h / 2 - 1, th, p), [lf] = at(i, mid(b.t / 2 - 1), h / 2, th, p);
    b.label.setAttribute("transform", `matrix(${dn[0] - o[0]} ${dn[1] - o[1]} ${lf[0] - o[0]} ${lf[1] - o[1]} ${o[0]} ${o[1]})`);
    // On the cover (the face at u = t) the baseline runs away from the spine and up is up the book, near its head.
    const cv = DS - 2 - DP[i] / 2, ch = h * 0.7;
    const [c0] = at(i, [{ u: b.t, v: cv }], ch, th, p), [cx] = at(i, [{ u: b.t, v: cv - 1 }], ch, th, p), [cz] = at(i, [{ u: b.t, v: cv }], ch - 1, th, p);
    b.cover.setAttribute("transform", `matrix(${cx[0] - c0[0]} ${cx[1] - c0[1]} ${cz[0] - c0[0]} ${cz[1] - c0[1]} ${c0[0]} ${c0[1]})`);
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    books.forEach((b, i) => {
      const th = tval(b.l, now), p = tval(b.p, now), key = th + "," + p;
      if (key !== b.last) { b.last = key; draw(i, th, p); }
      if (!tdone(b.l, now) || !tdone(b.p, now)) moving = true;
    });
    return moving;
  });
  bag.add(B.unregister);

  // Hit test on rest centres: the book whose spine at rest is nearest the pointer's screen x, inside its height.
  const rest = books.map((b, i) => {
    const y = DS - 2;
    return { x: P(X[i] + b.t / 2, y, HT[i] / 2)[0], top: P(X[i] + b.t / 2, y, HT[i])[1], bot: P(X[i] + b.t / 2, y, -PK)[1] };
  });
  function hit([sx, sy]) {
    let best = -1, d = 1e9;
    rest.forEach((r, i) => { const e = Math.abs(sx - r.x); if (e < d) { d = e; best = i; } });
    const r = rest[best];
    return d > 22 || sy < r.top - 14 || sy > r.bot + 30 ? -1 : best;
  }

  let act = -1;
  function aim(from) {
    const now = performance.now();
    books.forEach((b, i) => {
      const k = Math.abs(i - from), delay = k * STEP;
      tset(b.p, act < 0 ? REST_P[i] : i === act ? pull : 0, now, delay);
      tset(b.l, act < 0 ? REST_L[i] : Math.sign(i - act) * LEAN[Math.abs(i - act)], now, delay);
    });
    B.wake();
  }
  function setActive(n) {
    if (n === act) return;
    const from = n >= 0 ? n : act;
    act = n;
    aim(from);
    books.forEach((b, i) => {
      b.el.sil.classList.toggle("hi", i === n);
      b.label.classList.toggle("on", i === n);
      b.cover.classList.toggle("on", i === n);
      b.bands.classList.toggle("hi", n < 0 && i === MARK);
      b.bands.classList.toggle("lo", !(n < 0 && i === MARK));
    });
    read.textContent = n < 0 ? "rest" : TOOLS[n].join(" · ");
  }

  books.forEach((b, i) => draw(i, REST_L[i], REST_P[i]));
  books[MARK].bands.classList.replace("lo", "hi");
  read.textContent = "rest";

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { pull = clamp(v, 0, PMAX); if (act >= 0) aim(act); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "shelf",
  means: "Eight books on a shelf, one per tool: the one under the pointer slides forward, and its neighbours lean away.",
  rules: [1, 2, 5, 10],
  range: [10, 18, 24],
  mount,
});
