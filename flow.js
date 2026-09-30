// Animated topographic line field, drawn after the Pinterest reference
// (teal / forest / sage / cream / copper contour lines). One WebGL2 canvas per [data-flow].
// Renders only while on screen; draws a single still frame for reduced motion.
(() => {
  const FRAG = (oct) => `#version 300 es
precision highp float;
#define OCT ${oct}
uniform vec2 R; uniform float T; uniform vec2 M; uniform float SEED;
out vec4 o;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+1.), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < OCT; i++){ v += a*n(p); p = p*1.9 + 17.; a *= .45; } return v; }
vec3 pal(float x){ // line colours: deep green -> sage -> cream -> copper
  vec3 c0 = vec3(.20,.36,.31), c1 = vec3(.36,.52,.43), c2 = vec3(.56,.70,.58), c3 = vec3(.92,.88,.76), c4 = vec3(.79,.54,.40);
  x = clamp(x, 0., 1.) * 4.;
  if (x < 1.) return mix(c0, c1, x);
  if (x < 2.) return mix(c1, c2, x-1.);
  if (x < 3.) return mix(c2, c3, x-2.);
  return mix(c3, c4, x-3.);
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*R) / R.y;
  vec2 p = uv*vec2(.75, 1.05) + SEED + (M - .5)*.12;
  float t = T*.035;
  vec2 q = vec2(fbm(p + vec2(0., t)), fbm(p + vec2(5.2, 1.3) - t*.8));
  vec2 r = vec2(fbm(p + 3.*q + vec2(1.7, 9.2) + t*.5), fbm(p + 3.*q + vec2(8.3, 2.8)));
  float v = fbm(p + 2.8*r);
  v = (v - .2) / .6;
  // contour lines
  float b = v * 120.;
  float d = abs(fract(b) - .5);
  float w = fwidth(b);
  float line = 1. - smoothstep(w*.4, w*1.4, d);
  // region tone: mostly greens, cream rivers, rare copper
  float tone = smoothstep(.35, .95, .5 + .5*sin(v*7. + r.y*5. - t*.6));
  vec3 lc = pal(tone);
  vec3 base = mix(vec3(.045,.095,.11), lc, .12 + .3*tone*tone);
  // where lines crowd below a pixel apart, blend to their average instead of aliasing
  float crowd = smoothstep(.25, .6, w);
  float cov = mix(line, .45, crowd);
  vec3 col = mix(base, lc, cov * (.75 + .25*tone));
  col *= 1. - .35*length(uv*vec2(.7, 1.));        // vignette
  o = vec4(col, 1.);
}`;
  const VERT = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }`;

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = matchMedia("(pointer: coarse)").matches; // phones / tablets
  const mouse = { x: .5, y: .5, tx: .5, ty: .5 };
  addEventListener("pointermove", (e) => { mouse.tx = e.clientX / innerWidth; mouse.ty = 1 - e.clientY / innerHeight; });

  document.querySelectorAll("[data-flow]").forEach((canvas, k) => {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!gl) { canvas.classList.add("flow--fallback"); return; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG(coarse ? 3 : 4))); // phones: one less noise octave
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.classList.add("flow--fallback"); return; }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const U = (n) => gl.getUniformLocation(prog, n);
    const uR = U("R"), uT = U("T"), uM = U("M");
    gl.uniform1f(U("SEED"), k * 7.3);

    // Pixel budget instead of a flat DPR: phones, 4K monitors and ultrawides all render about
    // the same number of shaded pixels, so the lines stay crisp without melting a phone GPU.
    const budget = coarse ? 0.55e6 : 2.2e6;
    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const scale = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(budget / Math.max(1, w * h)));
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uR, canvas.width, canvas.height);
    };
    new ResizeObserver(() => { resize(); if (still) draw(8); }).observe(canvas);

    const draw = (t) => {
      mouse.x += (mouse.tx - mouse.x) * .04;
      mouse.y += (mouse.ty - mouse.y) * .04;
      gl.uniform1f(uT, t);
      gl.uniform2f(uM, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    if (still) return;

    let on = false, raf = 0;
    // The lines drift slowly, so 30fps on touch devices looks identical and halves the GPU work.
    let lastMs = 0;
    const frameGap = coarse ? 1000 / 31 : 0;
    const loop = (ms) => {
      raf = requestAnimationFrame(loop);
      if (ms - lastMs < frameGap) return;
      lastMs = ms;
      draw(ms / 1000);
    };
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !on) { on = true; raf = requestAnimationFrame(loop); }
      else if (!e.isIntersecting && on) { on = false; cancelAnimationFrame(raf); }
    }).observe(canvas);
  });
})();
