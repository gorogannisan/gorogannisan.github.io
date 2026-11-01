/* ASCII halftone plate renderer.

   Ported from src/AsciiPlate.tsx so the variant pages run the real thing with
   no React and no build step: same glyph atlas, same coverage LUT measured in
   the browser that draws it, same motion.

   What changed from the first port: the drawing buffer is no longer nailed to
   cols*5 x rows*8. That coupling meant the browser downscaled a 1715px canvas
   into a 600px box by an arbitrary 2.79, which sampled the 5px glyph stems at
   1.79 device pixels each and beat them into vertical corduroy across the whole
   plate. Now the buffer is sized to the element's own device pixels and each
   output pixel box-filters a 3x3 grid of glyph samples, so density can go as
   high as it likes and still resolve as tone instead of moire. */
(function (global) {
  'use strict';

  const NGLYPH = 16;
  const POOL = " .':\"()+rcs*oueadSOQ8#0B";
  const MOTIONS = {
    still: 0, wave: 1, ascent: 2, birds: 3, shimmer: 4,
    shelf: 10, bubbles: 11, pulse: 12,
  };
  const BAND = ['shelf', 'bubbles', 'pulse'];
  const MAX_BUF = 4096;      /* keep a huge retina hero from eating the GPU */
  const SS = 3;              /* box filter taps per axis, 9 samples per pixel */

  const VERT = 'attribute vec2 aPos;void main(){gl_Position=vec4(aPos,0.,1.);}';

  const FRAG = `
  precision highp float;
  uniform sampler2D uData, uAtlas, uLut;
  uniform vec2 uGrid, uCell, uOut, uPlate, uOrigin, uTiles;
  uniform float uDissolve;   /* 0 = off. Width of the edge dissolve band. */
  uniform float uDissolveDir; /* 0 = all edges; 1 = bottom and the lower sides,
                                 for a subject that should stay solid on top */
  uniform float uShoulderTaper; /* hero-only lower-right inset; 0 = off */
  uniform float uN, uT, uClock, uMotion, uFade, uFrame, uChurn;
  uniform vec3 uInk;
  const float TAU = 6.28318530718;
  const int SS = ${SS};

  float hash21(vec2 p){
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }

  /* Ink density for one cell, including whatever the motion mode warps. */
  float levelAt(vec2 cell){
    vec2 n = cell / uGrid;
    float t = uClock;
    vec2 s = cell;
    float extra = 0.0;

    if (uMotion > 0.5 && uMotion < 1.5) {           // wave rolls
      float d = smoothstep(0.05, 0.95, n.y);
      s.x += sin(n.y * 9.0 + t * 1.15) * (1.6 + 5.5 * d);
      s.x += sin(n.y * 21.0 - t * 0.62) * (0.8 + 2.4 * d);
      s.y += sin(n.x * 7.0 + t * 0.85) * (0.7 + 1.8 * d);
    } else if (uMotion > 1.5 && uMotion < 2.5) {    // rocket climbs
      float sky = smoothstep(0.72, 0.34, n.y);
      s.y += 2.2 * sin(t * 0.5) * sky;
      float plume = smoothstep(0.42, 1.0, n.y);
      s.y += plume * (t * 13.0);
      s.x += plume * sin(n.y * 12.0 + t * 2.6) * 3.4;
    } else if (uMotion > 2.5 && uMotion < 3.5) {    // birds cross
      for (int b = 0; b < 5; b++) {
        float fb = float(b);
        float bx = fract(t * (0.055 + fb * 0.012) + fb * 0.23) * 1.25 - 0.12;
        float by = 0.13 + 0.11 * fb * 0.5 + 0.02 * sin(t * 1.6 + fb);
        vec2 d = (n - vec2(bx, by)) * vec2(1.0, 2.4);
        float flap = 0.5 + 0.5 * sin(t * 7.0 + fb * 1.9);
        float wing = abs(d.y + abs(d.x) * (0.35 + 0.30 * flap));
        extra += smoothstep(0.016, 0.0, wing) * smoothstep(0.055, 0.0, abs(d.x)) * 0.95;
      }
    }

    if (uMotion > 9.5) {                            // procedural bands, no plate
      if (uMotion < 10.5) {
        float row = floor(n.y * 9.0);
        float sp = 0.10 + 0.16 * fract(sin(row * 12.9898) * 43758.5453);
        float len = 0.18 + 0.55 * fract(sin(row * 78.233) * 43758.5453);
        float x = fract(n.x + t * sp + row * 0.37);
        return step(x, len) * (0.34 + 0.30 * fract(sin(floor(x * 60.0) + row * 7.0) * 24634.6345));
      } else if (uMotion < 11.5) {
        float v = 0.0;
        for (int b = 0; b < 9; b++) {
          float fb = float(b);
          float bx = fract(sin(fb * 45.233) * 43758.5453);
          float by = fract(1.0 - (t * (0.06 + 0.10 * fract(sin(fb * 12.9898) * 43758.5453)) + fb * 0.17));
          v += smoothstep(0.055, 0.0, length((n - vec2(bx, by)) * vec2(1.0, 0.55))) * 0.85;
        }
        return v;
      }
      float y = 0.5 + 0.26 * sin(n.x * 7.0 - t * 2.1)
              * exp(-pow((fract(n.x - t * 0.16) - 0.5) * 3.2, 2.0));
      float v = smoothstep(0.055, 0.0, abs(n.y - y)) * 0.9;
      v += step(0.997, hash21(cell + floor(t * 30.0) * vec2(13.0, 7.0))) * 0.5;
      return v;
    }

    /* A video plate stores every frame tiled into one texture, so the sample
       is offset into the current frame's tile. A still plate is just the
       degenerate case: uTiles is (1,1) and uFrame is 0, which collapses this
       back to the plain lookup it replaced. */
    vec2 c = clamp(s, vec2(0.0), uGrid - 1.0);
    vec2 tile = vec2(mod(uFrame, uTiles.x), floor(uFrame / uTiles.x));
    vec4 d = texture2D(uData, (tile * uGrid + c + 0.5) / (uTiles * uGrid));

    float ink = d.r, edge = d.g;
    float ph = hash21(cell);
    float churn = sin(TAU * (3.0 * uT + ph))
                + 0.62 * sin(TAU * (5.0 * uT + ph * 1.73 + 0.31))
                + 0.41 * sin(TAU * (8.0 * uT + ph * 2.91 + 0.77));
    churn *= 0.49 * uChurn;
    float spark = step(0.985, hash21(cell + floor(uT * 90.0) * vec2(37.0, 17.0)));
    float onSub = 0.18 + 0.82 * smoothstep(0.0, 0.06, ink);
    return ink + churn * (0.030 + 0.105 * edge)
               + spark * (0.05 + 0.30 * edge) * uChurn * onSub + extra;
  }

  void main(){
    /* uPlate is the plate's drawn size in output pixels and uOrigin its top
       left, so a grid whose aspect differs from the element cover-crops the
       way object-fit would instead of stretching. */
    vec2 cellPx = uPlate / uGrid;               // output pixels per cell
    vec2 px = vec2(gl_FragCoord.x - 0.5, uOut.y - gl_FragCoord.y - 0.5) - uOrigin;
    float acc = 0.0;

    for (int j = 0; j < SS; j++) {
      for (int i = 0; i < SS; i++) {
        vec2 sub = px + (vec2(float(i), float(j)) + 0.5) / float(SS);
        vec2 cf = sub / cellPx;

        /* OUTSIDE THE PLATE CONTRIBUTES NOTHING. The clamp below pins an out
           of range coordinate to the edge row or column, which is right for a
           cover fit, where nothing is ever outside, and catastrophic for a
           contain fit, where it smears the border cells across the whole
           canvas as horizontal streaks. Gate the sample instead of trusting
           the clamp. */
        vec2 inb = step(vec2(0.0), cf) * step(cf, uGrid - vec2(0.001));
        float inside = inb.x * inb.y;

        vec2 cell = clamp(floor(cf), vec2(0.0), uGrid - 1.0);
        vec2 local = clamp(cf - cell, 0.0, 0.999);

        /* THE DISSOLVE THINS THE GRID, IT DOES NOT DIM THE IMAGE. Fading a
           plate with an alpha mask makes every glyph translucent at once, so
           it reads as a faded photograph. An ASCII drawing should come apart
           the way it is built: whole CHARACTERS drop out, sparsely at first
           and then completely, so the pattern thins into the paper. Each cell
           gets a stable hash and is kept only while that hash sits under the
           local threshold, which means a cell either draws fully or not at
           all, and it never flickers between frames. */
        float keep = 1.0;
        if (uDissolve > 0.0) {
          vec2 n = cell / max(uGrid - 1.0, vec2(1.0));
          float d;
          if (uDissolveDir > 0.5) {
            /* the solid mass TAPERS: lowest at the horizontal centre, lifting
               toward the sides on a curve like the grow plate's mound. The
               sides and corners therefore dissolve earlier the further they
               sit from centre, and nothing ever meets the frame squarely. */
            float t = abs(n.x - 0.5) * 2.0;
            float lift = 0.105 * pow(t, 1.6);
            d = (1.0 - n.y) - lift;
          } else {
            vec2 dEdge = min(n, 1.0 - n);
            d = min(dEdge.x, dEdge.y);
          }
          float t = smoothstep(0.0, uDissolve, d);
          float h = fract(sin(dot(cell, vec2(41.317, 289.107))) * 43758.5453);
          keep = step(h, t);

          if (uShoulderTaper > 0.0) {
            /* Gor's right shoulder reaches the plate edge below the face. A
               second, directional dissolve turns that short vertical wall
               into a rising wedge: it still meets the frame near the top,
               then recedes farther inward as the shoulder falls. Keep this
               probabilistic so the taper remains made of whole ASCII cells. */
            float shoulder = smoothstep(0.66, 0.91, n.y);
            float inset = uShoulderTaper * shoulder;
            float sideD = (1.0 - n.x) - inset;
            float sideT = smoothstep(-uDissolve * 0.15, uDissolve * 0.85, sideD);
            float sideKeep = mix(1.0, sideT, shoulder);
            float sideHash = fract(sin(dot(cell, vec2(173.17, 61.73))) * 43758.5453);
            keep *= step(sideHash, sideKeep);
          }
        }

        float lvl = levelAt(cell);
        float idx = floor(texture2D(uLut, vec2(clamp(lvl, 0.0, 1.0), 0.5)).r * 255.0 + 0.5);
        vec2 auv = (vec2(idx * uCell.x + local.x * uCell.x, local.y * uCell.y) + 0.5)
                 / vec2(uN * uCell.x, uCell.y);
        acc += texture2D(uAtlas, auv).r * inside * keep;
      }
    }

    float cov = (acc / float(SS * SS)) * uFade;
    gl_FragColor = vec4(uInk * cov, cov);
  }`;

  function unb64(s) {
    const b = atob(s), o = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i);
    return o;
  }

  /* Coverage measured in the browser that will draw it, never assumed. Plain
     8px type caps around 0.50 coverage, which leaves no true blacks, so the
     glyphs are set bold and 2px oversize and clipped back to the cell. */
  function buildAtlas(cw, ch) {
    const font = 'bold ' + (ch + 2) + 'px ui-monospace, "SF Mono", Menlo, monospace';
    const base = ch - 0.5;
    const m = document.createElement('canvas');
    m.width = cw; m.height = ch;
    const mc = m.getContext('2d', {willReadFrequently: true});
    const meas = [];
    for (const c of POOL) {
      mc.fillStyle = '#000'; mc.fillRect(0, 0, cw, ch);
      mc.fillStyle = '#fff'; mc.font = font; mc.textBaseline = 'alphabetic';
      mc.save(); mc.beginPath(); mc.rect(0, 0, cw, ch); mc.clip();
      mc.fillText(c, 0, base); mc.restore();
      const d = mc.getImageData(0, 0, cw, ch).data;
      let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i];
      meas.push([s / (cw * ch * 255), c]);
    }
    meas.sort((a, b) => a[0] - b[0]);
    const lo = meas[0][0], hi = meas[meas.length - 1][0];
    const used = new Set(), ramp = [];
    for (let k = 0; k < NGLYPH; k++) {
      const target = lo + (hi - lo) * (k / (NGLYPH - 1));
      let best = ' ', bd = Infinity;
      for (const [cov, c] of meas) {
        if (used.has(c)) continue;
        const dd = Math.abs(cov - target);
        if (dd < bd) { bd = dd; best = c; }
      }
      used.add(best); ramp.push(best);
    }
    const a = document.createElement('canvas');
    a.width = NGLYPH * cw; a.height = ch;
    const ac = a.getContext('2d', {willReadFrequently: true});
    ac.fillStyle = '#000'; ac.fillRect(0, 0, a.width, a.height);
    ac.fillStyle = '#fff'; ac.font = font; ac.textBaseline = 'alphabetic';
    ramp.forEach((c, i) => {
      ac.save(); ac.beginPath(); ac.rect(i * cw, 0, cw, ch); ac.clip();
      ac.fillText(c, i * cw, base); ac.restore();
    });
    const px = ac.getImageData(0, 0, a.width, a.height).data;
    const cov = [];
    for (let i = 0; i < NGLYPH; i++) {
      let s = 0;
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) s += px[(y * a.width + i * cw + x) * 4];
      cov.push(s / (cw * ch * 255));
    }
    const lut = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      const want = (i / 255) * cov[NGLYPH - 1];
      let best = 0, bd = Infinity;
      for (let s = 0; s < NGLYPH; s++) {
        const dd = Math.abs(cov[s] - want);
        if (dd < bd) { bd = dd; best = s; }
      }
      lut[i * 4] = best; lut[i * 4 + 3] = 255;
    }
    return {canvas: a, lut, ramp: ramp.join('')};
  }

  const inkOf = (el) => {
    const m = getComputedStyle(el).color.match(/[\d.]+/g);
    return m ? [m[0] / 255, m[1] / 255, m[2] / 255] : [0.18, 0.17, 0.15];
  };

  /**
   * mount(canvas, {src, motion, fade})
   *   src     plate json, defaults to the portrait
   *   motion  a key of MOTIONS, or a function returning one per frame so a page
   *           can morph the plate as the reader scrolls
   *   fade    0..1, or a function returning one per frame
   * Returns a dispose function.
   */
  function mount(canvas, opts) {
    opts = opts || {};
    const src = opts.src || canvas.dataset.src || '/portrait-grid.json';
    const getMotion = typeof opts.motion === 'function'
      ? opts.motion
      : () => opts.motion || canvas.dataset.motion || 'shimmer';
    const getFade = typeof opts.fade === 'function'
      ? opts.fade
      : () => (opts.fade == null ? 1 : opts.fade);

    let raf = 0, ro = null, gl = null, disposed = false;

    (async function () {
      const isBand = BAND.indexOf(getMotion()) >= 0 && !opts.src && !canvas.dataset.src;
      let C, R, CW, CH, ink, edge;
      /* video plate state. A still plate is one frame in a 1x1 atlas. */
      let atlasImg = null, tiles = [1, 1], nFrames = 1, fps = 12;
      if (isBand) {
        C = 150; R = 22; CW = 5; CH = 8;
        ink = new Uint8Array(C * R); edge = new Uint8Array(C * R);
      } else {
        let g;
        const normSrc = src.startsWith('/') ? src.slice(1) : src;
        if (window.OJAsciiFallback && (window.OJAsciiFallback[src] || window.OJAsciiFallback[normSrc])) {
          g = window.OJAsciiFallback[src] || window.OJAsciiFallback[normSrc];
        } else {
          try {
            g = await fetch(src).then((r) => r.json());
          } catch (e) {
            if (window.OJAsciiFallback && (window.OJAsciiFallback[src] || window.OJAsciiFallback[normSrc])) {
              g = window.OJAsciiFallback[src] || window.OJAsciiFallback[normSrc];
            } else {
              throw e;
            }
          }
        }
        C = g.cols; R = g.rows; CW = g.cellW; CH = g.cellH;
        if (g.png) {
          /* Video plate: every frame is tiled into one PNG, ink in R and edge
             in G. Decoding an image beats parsing megabytes of base64, and it
             uploads as a single texture with no per-frame work. */
          atlasImg = new Image();
          var pngSrc = g.png;
          if (pngSrc && !pngSrc.startsWith('data:') && pngSrc.startsWith('/plates/')) {
            pngSrc = 'plates/' + pngSrc.slice(8);
          }
          atlasImg.src = pngSrc;
          try {
            await (atlasImg.decode ? atlasImg.decode()
              : new Promise((res, rej) => { atlasImg.onload = res; atlasImg.onerror = rej; }));
          } catch (e) {
            console.warn('Atlas image load error', pngSrc, e);
          }
          tiles = g.atlas || [1, 1];
          nFrames = g.frames || 1;
          fps = g.fps || 12;
        } else {
          ink = unb64(g.ink); edge = unb64(g.edge);
        }
      }
      if (disposed) return;

      /* Size the buffer to the element, not to the grid. If the element has no
         layout yet, fall back to the natural grid size so nothing renders at 0. */
      const sizeBuffer = () => {
        const r = canvas.getBoundingClientRect();
        const dpr = Math.min(global.devicePixelRatio || 1, 2);
        let w = Math.round((r.width || C * CW / dpr) * dpr);
        let h = Math.round((r.height || R * CH / dpr) * dpr);
        const over = Math.max(w / MAX_BUF, h / MAX_BUF, 1);
        w = Math.max(1, Math.round(w / over));
        h = Math.max(1, Math.round(h / over));
        if (canvas.width === w && canvas.height === h) return false;
        canvas.width = w; canvas.height = h;
        return true;
      };
      sizeBuffer();

      gl = canvas.getContext('webgl', {antialias: false, premultipliedAlpha: true});
      if (!gl) {
        canvas.setAttribute('data-webgl', 'unavailable');
        paintStill();
        return;
      }

      /* No WebGL (a blocked GPU, some power-saving modes, headless browsers):
         paint the ink grid once with a 2D context, so the plate is a still
         image rather than an empty box. A canvas whose webgl request returned
         null has no context yet, so it can still take a 2d one. Motion plates
         show their last frame, the arrived state. The fit, anchor and zoom
         are the same arithmetic applySize() uses below. */
      function paintStill() {
        try {
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          const off = document.createElement('canvas');
          off.width = C; off.height = R;
          const octx = off.getContext('2d');
          let vals = ink;
          if (atlasImg) {
            const f = nFrames - 1;
            octx.drawImage(atlasImg, (f % tiles[0]) * C, Math.floor(f / tiles[0]) * R, C, R, 0, 0, C, R);
            const src = octx.getImageData(0, 0, C, R).data;
            vals = new Uint8Array(C * R);
            for (let i = 0; i < C * R; i++) vals[i] = src[i * 4];
          }
          const rgb = inkOf(canvas).map((v) => Math.round(v * 255));
          const img = octx.createImageData(C, R);
          for (let i = 0; i < C * R; i++) {
            img.data[i * 4] = rgb[0]; img.data[i * 4 + 1] = rgb[1]; img.data[i * 4 + 2] = rgb[2];
            img.data[i * 4 + 3] = Math.round(vals[i] * 0.8);
          }
          octx.putImageData(img, 0, 0);
          const w = canvas.width, h = canvas.height;
          const fit = opts.fit || canvas.dataset.fit || 'cover';
          const fx = parseFloat(opts.focusX ?? canvas.dataset.focusX ?? 0.5);
          const fy = parseFloat(opts.focusY ?? canvas.dataset.focusY ?? 0.5);
          const zoom = Math.max(1, parseFloat(opts.zoom ?? canvas.dataset.zoom ?? 1) || 1);
          const pick = fit === 'contain' ? Math.min : Math.max;
          const s = fit === 'fill' ? null : pick(w / (C * CW), h / (R * CH));
          const pw = s === null ? w * zoom : C * CW * s * zoom;
          const ph = s === null ? h * zoom : R * CH * s * zoom;
          ctx.clearRect(0, 0, w, h);
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(off, (w - pw) * fx, (h - ph) * fy, pw, ph);
          canvas.setAttribute('data-still', '1');
        } catch (e) { /* a still is a nicety; an empty box is the old state */ }
      }

      /* iOS composites an UNINITIALISED WebGL backing store as solid black,
         and nothing below draws until the grid JSON (214KB) has arrived, so
         on a slow connection the canvas sat on the page as a black rectangle
         for the whole download. Clear to transparent before anything async. */
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const atlas = buildAtlas(CW, CH);
      const sh = (t, s) => {
        const o = gl.createShader(t);
        gl.shaderSource(o, s); gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) {
          console.error('OJAscii shader:', gl.getShaderInfoLog(o));
        }
        return o;
      };
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(p); gl.useProgram(p);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(p, 'aPos');
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      const tex = (u) => {
        gl.activeTexture(gl.TEXTURE0 + u);
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      };
      tex(0);
      if (atlasImg) {
        /* flipY off, because the atlas was packed with frame row 0 at the top
           and the shader addresses tiles top down to match */
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasImg);
      } else {
        const rgba = new Uint8Array(C * R * 4);
        for (let i = 0; i < C * R; i++) {
          rgba[i * 4] = ink[i]; rgba[i * 4 + 1] = edge[i]; rgba[i * 4 + 3] = 255;
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, C, R, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      }
      tex(1); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
      tex(2); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, atlas.lut);

      const u = (n) => gl.getUniformLocation(p, n);
      gl.uniform1i(u('uData'), 0); gl.uniform1i(u('uAtlas'), 1); gl.uniform1i(u('uLut'), 2);
      gl.uniform2f(u('uGrid'), C, R); gl.uniform2f(u('uCell'), CW, CH);
      gl.uniform1f(u('uN'), NGLYPH);
      gl.uniform2f(u('uTiles'), tiles[0], tiles[1]);
      /* On a video plate the motion IS the life, so the per cell churn that
         keeps a still plate alive becomes noise fighting the subject. Damp it
         rather than removing it, so the grain still breathes. */
      gl.uniform1f(u('uChurn'), atlasImg ? 0.28 : 1.0);
      gl.uniform3fv(u('uInk'), inkOf(canvas));

      const uOut = u('uOut'), uPlate = u('uPlate'), uOrigin = u('uOrigin');
      /* Opt in per canvas with data-dissolve. Absent or 0 means the plate
         renders exactly as it always has, so nothing already on the site
         changes because this uniform now exists. */
      const uDissolve = u('uDissolve');
      gl.uniform1f(uDissolve,
        Math.max(0, parseFloat(opts.dissolve ?? canvas.dataset.dissolve ?? 0) || 0));
      gl.uniform1f(u('uDissolveDir'),
        (opts.dissolveDir ?? canvas.dataset.dissolveDir) === 'bottom' ? 1 : 0);
      gl.uniform1f(u('uShoulderTaper'),
        Math.max(0, parseFloat(opts.shoulderTaper ?? canvas.dataset.shoulderTaper ?? 0) || 0));
      const fit = opts.fit || canvas.dataset.fit || 'cover';
      /* Where the crop is anchored when the plate overflows its box. 0.5 is
         dead centre; lower values keep more of the top. A portrait framed by
         its subject rather than by its bounding box needs this, otherwise a
         cover crop eats the head and keeps the shoulders. */
      const fx = parseFloat(opts.focusX ?? canvas.dataset.focusX ?? 0.5);
      const fy = parseFloat(opts.focusY ?? canvas.dataset.focusY ?? 0.5);
      /* Scale past cover. Anchoring alone cannot reframe a plate whose box is
         the same shape as its content: cover leaves no overflow on the axis
         that already fits, so the anchor has nothing to slide. Zoom creates
         that overflow, which is what lets a portrait be cropped to its head
         rather than to its bounding box. */
      const zoom = Math.max(1, parseFloat(opts.zoom ?? canvas.dataset.zoom ?? 1) || 1);
      const applySize = () => {
        const w = canvas.width, h = canvas.height;
        const pick = fit === 'contain' ? Math.min : Math.max;
        const s = fit === 'fill'
          ? null
          : pick(w / (C * CW), h / (R * CH));
        const pw = s === null ? w * zoom : C * CW * s * zoom;
        const ph = s === null ? h * zoom : R * CH * s * zoom;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(uOut, w, h);
        gl.uniform2f(uPlate, pw, ph);
        gl.uniform2f(uOrigin, (w - pw) * fx, (h - ph) * fy);
      };
      applySize();

      if (global.ResizeObserver) {
        ro = new ResizeObserver(() => { if (sizeBuffer()) applySize(); });
        ro.observe(canvas);
      }

      const uT = u('uT'), uClock = u('uClock'), uMotion = u('uMotion'),
            uFade = u('uFade'), uFrame = u('uFrame');
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const start = performance.now();
      canvas.setAttribute('data-plate', C + 'x' + R);
      if (atlasImg) canvas.setAttribute('data-frames', nFrames + '@' + fps);

      (function frame(now) {
        raf = requestAnimationFrame(frame);
        const secs = reduce ? 0 : (now - start) / 1000;
        gl.uniform1f(uT, (secs % 6) / 6);
        gl.uniform1f(uClock, secs);
        const key = getMotion();
        gl.uniform1f(uMotion, MOTIONS[key] != null ? MOTIONS[key] : 4);
        gl.uniform1f(uFade, Math.max(0, Math.min(1, getFade())));
        /* reduced motion holds the clip on its first frame rather than
           freezing mid action, which would read as a broken image */
        gl.uniform1f(uFrame, reduce ? 0 : Math.floor((secs * fps) % nFrames));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      })(performance.now());
    })();

    return function dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      if (gl) {
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      }
    };
  }

  /* Mount every canvas carrying data-src or data-motion, so a page can be pure
     markup with no per-canvas wiring. */
  function auto(root) {
    const els = (root || document).querySelectorAll('canvas[data-src], canvas[data-motion]');
    return [...els].map((c) => mount(c, {}));
  }

  global.OJAscii = {mount, auto, MOTIONS};
})(window);
