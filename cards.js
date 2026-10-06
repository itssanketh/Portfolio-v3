/**
 * Cards: Hairline's Riffle, a rounded tray of index cards, one per GitHub project, each with the project's
 * name and stack on its face. The card under the pointer stands up and lifts; the ones in front lean forward
 * and the ones behind lean back, staggered outwards from it. A click on it opens the repo. The projects are
 * read from the links in .java__list, which stay the page's real (screen-reader and keyboard) links:
 * focusing one pulls its card.
 *
 * Selection never reads the posed cards: it comes from static oblique bands along the resting top edges,
 * so a card moving out from under the pointer can't flip the choice back and forth.
 */
const { Cam, clamp, facing, fillet, fit, hull, open, poly, proj, rad, ringAt, rrect, run, seg,
  tdone, tset, tval, tween, disposer, mk, place, pointer, reflect, register } = HL;

const links = [...document.querySelectorAll(".java__list a")];
const N = links.length, W = 84, H = 54, G = 13, TW = 22, TH = 7, TABS = [6, 31, 56], TK = 1.4;
const REST = -12, BACK = -24, FWD = 20, LIFT = 16;
const X0 = -5, X1 = W + 5, Y0 = -9, Y1 = (N - 1) * G + 9, WH = 20, WR = 6, WT = 2.4;

const LR = (pts) => (pts[0][0] <= pts[pts.length - 1][0] ? pts : pts.slice().reverse());

/** The tray's paths, which never move: `far` is painted before the cards, `near` after them. */
function tray(P, front, outer, inner) {
  const far = [
    [poly(hull(ringAt(P, outer, 0).concat(ringAt(P, outer, WH)))), "sil"],
    [poly(ringAt(P, inner, WH)), "nf"],
    [open(ringAt(P, run(inner, (q) => !front(q)), 2.5)), "nf lo"],
  ];
  const iF = LR(ringAt(P, run(inner, front), WH)), oT = LR(ringAt(P, run(outer, front), WH)), oB = LR(ringAt(P, run(outer, front), 0));
  const hx = (X0 + X1) / 2, onFront = (ring) => ring.map((q) => P(q.u, Y1, q.v));
  const near = [
    [poly([...iF, oT[oT.length - 1], ...oB.slice().reverse(), oT[0]]), "fo"],
    [open(oT), "nf lo"],
    [open(iF), "nf"],
    [open([oT[0], ...oB, oT[oT.length - 1]]), "nf sil"],
    [poly(onFront(rrect(hx - 11, 6.5, hx + 11, 12.5, 3, 5))), "nf"],
    [poly(onFront(rrect(hx - 9.4, 8, hx + 9.4, 11, 1.5, 5))), "nf lo"],
  ];
  return { far, near };
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let stag = value;

  const C = Cam(45, 0.5, 1.5);
  fit(C, [[X0, Y0, 0], [X1, Y1, -8], [X1, Y0, 0], [X0, Y1, 0], [X0, Y0, H + TH], [X1, Y0, H + TH + LIFT]], 200, 166);
  const P = proj(C), front = facing(C);
  const outer = rrect(X0, Y0, X1, Y1, WR, 6), inner = rrect(X0 + WT, Y0 + WT, X1 - WT, Y1 - WT, WR - WT, 6);
  const paths = tray(P, front, outer, inner);

  const g = mk("g", {}, svg);
  reflect(svg, g, P, front, outer, 0, 14);
  for (const [d, cls] of paths.far) mk("path", { d, class: cls }, g);

  // Back to front; the list's first link is the front card. Its number is punched on the tab, one hole of N.
  const cards = [];
  for (let i = 0; i < N; i++) {
    const n = N - i, t0 = TABS[(N - 1 - i) % 3], a = links[n - 1];
    const shape = fillet([[0, 0], [W, 0], [W, H], [t0 + TW, H], [t0 + TW, H + TH], [t0, H + TH], [t0, H], [0, H]],
      [1, 1, 3.2, 1.8, 2.4, 2.4, 1.8, 3.2]);
    const grp = mk("g", {}, g);
    const back = mk("path", { class: "lo" }, grp), face = mk("path", { class: "sil" }, grp);
    const head = mk("path", { class: "nf" }, grp), rules = mk("path", { class: "nf lo" }, grp);
    const name = mk("text", { class: "cards__name" }, grp), tag = mk("text", { class: "cards__tag" }, grp);
    name.textContent = a.querySelector("span").textContent;
    tag.textContent = a.querySelector("em").textContent;
    // Long names shrink to fit the card (a sans letter is about half an em).
    name.style.fontSize = Math.min(6.5, (W - 12) / (name.textContent.length * 0.52)) + "px";
    const punch = [];
    for (let k = 0; k < N; k++) punch.push(mk("circle", { r: 0.95, class: "dot " + (k === n - 1 ? "m" : "off") }, grp));
    cards.push({ n, t0, shape, a, back, face, head, rules, name, tag, punch, th: tween(REST), z: tween(0) });
  }

  for (const [d, cls] of paths.near) mk("path", { d, class: cls }, g);

  // Hit bands: oblique strips along the RESTING top edges. They never move.
  const top = (i) => P(W / 2, i * G + H * Math.sin(rad(REST)), H * Math.cos(rad(REST)));
  const c0 = top(0), c1 = top(1), d = [c1[0] - c0[0], c1[1] - c0[1]];
  const px0 = P(0, 0, 0), px1 = P(1, 0, 0), ex = [px1[0] - px0[0], px1[1] - px0[1]];
  const HALF = W / 2 + 6, det = d[0] * ex[1] - d[1] * ex[0];
  function hit([x, y]) {
    const qx = x - c0[0], qy = y - c0[1];
    const s = (qx * ex[1] - qy * ex[0]) / det, r = (d[0] * qy - d[1] * qx) / det;
    if (Math.abs(r) > HALF || s < -0.5 || s > N + 1) return -1;
    return clamp(Math.round(s), 0, N - 1);
  }

  /** Card i leaning th degrees and lifted by `lift`, drawn upright in its own plane; text is printed flat on its face. */
  function draw(i, th, lift) {
    const cd = cards[i], yb = i * G, s = Math.sin(rad(th)), c = Math.cos(rad(th));
    const w = (u, v) => P(u, yb + v * s, v * c + lift);
    const wb = (u, v) => P(u, yb + v * s - TK * c, v * c + TK * s + lift);
    const print = (el, u, v) => {
      const o = w(u, v), e1 = w(u + 1, v), e2 = w(u, v - 1);
      el.setAttribute("transform", `matrix(${e1[0] - o[0]} ${e1[1] - o[1]} ${e2[0] - o[0]} ${e2[1] - o[1]} ${o[0]} ${o[1]})`);
    };
    cd.back.setAttribute("d", poly(cd.shape.map((p) => wb(p[0], p[1]))));
    cd.face.setAttribute("d", poly(cd.shape.map((p) => w(p[0], p[1]))));
    cd.head.setAttribute("d", seg(w(6, H - 14), w(W - 6, H - 14)));
    cd.rules.setAttribute("d", [H - 25, H - 32, H - 39].map((v) => seg(w(6, v), w(W - 6, v))).join(""));
    print(cd.name, 6, H - 8);
    print(cd.tag, 6, H - 19);
    const cols = Math.ceil(N / 2);
    cd.punch.forEach((el, k) => place(el, w(cd.t0 + TW / 2 + ((k % cols) - (cols - 1) / 2) * 3.4, H + TH / 2 + (0.5 - Math.floor(k / cols)) * 2.8)));
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    cards.forEach((cd, i) => { draw(i, tval(cd.th, now), tval(cd.z, now)); if (!tdone(cd.th, now) || !tdone(cd.z, now)) moving = true; });
    return moving;
  });
  bag.add(B.unregister);

  let act = -1;
  /** Pulls card a (-1 puts them all back). The stagger spreads out from the card pulled, or the one let go. */
  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : act;
    act = a;
    cards.forEach((cd, i) => {
      const delay = Math.abs(i - from) * stag;
      tset(cd.th, a < 0 ? REST : i < a ? BACK : i > a ? FWD : 0, now, delay);
      tset(cd.z, a === i ? LIFT : 0, now, delay);
      cd.face.classList.toggle("hi", i === a); cd.head.classList.toggle("hi", i === a);
      // Only the card standing up (the front one at rest) shows its text; the rest would peek out cut off.
      cd.name.classList.toggle("on", i === a); cd.tag.classList.toggle("on", i === (a < 0 ? N - 1 : a));
      cd.name.classList.toggle("shown", i === (a < 0 ? N - 1 : a));
      cd.punch[cd.n - 1].classList.toggle("m", i !== a);
    });
    stage.style.cursor = a < 0 ? "" : "pointer";
    read.textContent = a < 0 ? "rest" : cards[a].name.textContent + " · open on GitHub ↗";
    B.wake();
  }

  cards[N - 1].name.classList.add("shown"); cards[N - 1].tag.classList.add("on");

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  // A click on a card follows that project's real link (new tab, noopener, as the link says).
  bag.on(stage, "click", (e) => {
    const r = stage.getBoundingClientRect(), i = hit([(e.clientX - r.left) / r.width * 400, (e.clientY - r.top) / r.height * 320]);
    if (i >= 0) cards[i].a.click();
  });
  // Keyboard: tabbing through the hidden links pulls each one's card, so focus shows in the tray.
  cards.forEach((cd, i) => {
    bag.on(cd.a, "focus", () => setActive(i));
    bag.on(cd.a, "blur", () => setActive(-1));
  });
  bag.add(() => svg.replaceChildren());

  return { set: (v) => { stag = v; }, destroy: bag.dispose };
}

hairline({
  name: "cards",
  means: "A tray of index cards, one per Java project: the card under the pointer stands up, and clicking it opens the repo on GitHub.",
  range: [0, 40, 90],
  mount,
});
