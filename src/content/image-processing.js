(function () {
  "use strict";
  const NS = (self.ERPCAP = self.ERPCAP || {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function newCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }
  function ctxOf(c) { return c.getContext("2d", { willReadFrequently: true }); }
  function whiteFill(c) { const x = ctxOf(c); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); return x; }
  function cloneCanvas(c) { const o = newCanvas(c.width, c.height); whiteFill(o).drawImage(c, 0, 0); return o; }

  /* ---------------- getting the pixels ---------------- */

  async function ensureLoaded(img, timeoutMs) {
    if (img.complete && img.naturalWidth > 0) return;
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => { cleanup(); reject(new Error("CAPTCHA image did not finish loading")); }, timeoutMs || 4000);
      const ok = () => { cleanup(); resolve(); };
      const bad = () => { cleanup(); reject(new Error("CAPTCHA image failed to load")); };
      function cleanup() { clearTimeout(t); img.removeEventListener("load", ok); img.removeEventListener("error", bad); }
      img.addEventListener("load", ok);
      img.addEventListener("error", bad);
    });
  }

  // Strategy 1: draw the already-displayed <img> to a canvas (exact pixels the page shows).
  async function fromElement(img) {
    await ensureLoaded(img);
    const c = newCanvas(img.naturalWidth, img.naturalHeight);
    const x = whiteFill(c);
    x.drawImage(img, 0, 0);
    x.getImageData(0, 0, 1, 1); // throws SecurityError if the canvas is tainted (cross-origin image)
    return c;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("Could not decode screenshot"));
      im.src = src;
    });
  }

  // Strategy 2: screenshot the visible tab and crop the CAPTCHA out of it (still 100% local).
  async function fromScreenshot(img) {
    img.scrollIntoView({ block: "center", inline: "center" });
    await sleep(250);
    const hooks = NS.hooks || {};
    if (hooks.beforeCapture) await hooks.beforeCapture();
    let resp;
    try {
      resp = await chrome.runtime.sendMessage({ type: "CAPTURE_TAB" });
    } finally {
      if (hooks.afterCapture) hooks.afterCapture();
    }
    if (!resp || !resp.ok) throw new Error("Screenshot fallback failed: " + ((resp && resp.error) || "no response"));
    const shot = await loadImage(resp.dataUrl);
    const r = img.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const sx = Math.max(0, Math.round(r.left * dpr));
    const sy = Math.max(0, Math.round(r.top * dpr));
    const sw = Math.min(shot.width - sx, Math.round(r.width * dpr));
    const sh = Math.min(shot.height - sy, Math.round(r.height * dpr));
    if (sw <= 0 || sh <= 0) throw new Error("CAPTCHA is outside the visible part of the page");
    const c = newCanvas(sw, sh);
    whiteFill(c).drawImage(shot, sx, sy, sw, sh, 0, 0, sw, sh);
    return c;
  }

  async function getImageCanvas(img) {
    try {
      return await fromElement(img);
    } catch (e) {
      if (!e || e.name !== "SecurityError") throw e;
      if (NS.CONFIG.debug) console.warn("[ERP-CAPTCHA] image is cross-origin; using screenshot fallback");
      return fromScreenshot(img);
    }
  }

  /* ---------------- pipeline steps ---------------- */

  function otsu(hist, total) {
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, thr = 127;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; thr = t; }
    }
    return thr;
  }

  const STEPS = {
    pad(c, p) {
      const n = p.padding | 0;
      if (n <= 0) return c;
      const o = newCanvas(c.width + 2 * n, c.height + 2 * n);
      whiteFill(o).drawImage(c, n, n);
      return o;
    },
    upscale(c, p) {
      const s = Number(p.scale) || 1;
      if (s === 1) return c;
      const o = newCanvas(c.width * s, c.height * s);
      const x = ctxOf(o);
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = "high";
      x.drawImage(c, 0, 0, o.width, o.height);
      return o;
    },
    grayscale(c) {
      const x = ctxOf(c), im = x.getImageData(0, 0, c.width, c.height), d = im.data;
      for (let i = 0; i < d.length; i += 4) {
        const g = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
        d[i] = d[i + 1] = d[i + 2] = g;
        d[i + 3] = 255;
      }
      x.putImageData(im, 0, 0);
      return c;
    },
    contrast(c, p) {
      const x = ctxOf(c), im = x.getImageData(0, 0, c.width, c.height), d = im.data;
      const hist = new Uint32Array(256);
      for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
      const total = c.width * c.height, cut = total * (Number(p.contrastClip) || 0);
      let lo = 0, hi = 255, acc = 0;
      for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > cut) { lo = v; break; } }
      acc = 0;
      for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > cut) { hi = v; break; } }
      if (hi - lo < 10) return c;
      const k = 255 / (hi - lo);
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.max(0, Math.min(255, ((d[i] - lo) * k) | 0));
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      x.putImageData(im, 0, 0);
      return c;
    },
    denoise(c, p) {
      const passes = p.denoisePasses | 0;
      if (passes <= 0) return c;
      const w = c.width, h = c.height, x = ctxOf(c), im = x.getImageData(0, 0, w, h), d = im.data;
      let src = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) src[i] = d[i * 4];
      const win = new Uint8Array(9);
      for (let pass = 0; pass < passes; pass++) {
        const out = new Uint8Array(w * h);
        for (let yy = 0; yy < h; yy++) {
          for (let xx = 0; xx < w; xx++) {
            let n = 0;
            for (let dy = -1; dy <= 1; dy++) {
              const ry = Math.min(h - 1, Math.max(0, yy + dy));
              for (let dx = -1; dx <= 1; dx++) {
                const rx = Math.min(w - 1, Math.max(0, xx + dx));
                win[n++] = src[ry * w + rx];
              }
            }
            for (let a = 1; a < 9; a++) { // insertion sort of 9 values
              const v = win[a]; let b = a - 1;
              while (b >= 0 && win[b] > v) { win[b + 1] = win[b]; b--; }
              win[b + 1] = v;
            }
            out[yy * w + xx] = win[4];
          }
        }
        src = out;
      }
      for (let i = 0; i < w * h; i++) { const v = src[i]; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; }
      x.putImageData(im, 0, 0);
      return c;
    },
    threshold(c, p) {
      const x = ctxOf(c), im = x.getImageData(0, 0, c.width, c.height), d = im.data;
      const hist = new Uint32Array(256);
      for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
      const t = p.threshold === "otsu" ? otsu(hist, c.width * c.height) : Number(p.threshold);
      for (let i = 0; i < d.length; i += 4) { const v = d[i] > t ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; }
      x.putImageData(im, 0, 0);
      return c;
    },
    invertIfDark(c) {
      const x = ctxOf(c), im = x.getImageData(0, 0, c.width, c.height), d = im.data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += d[i];
      if (sum / (d.length / 4) >= 127) return c;
      for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = 255 - d[i]; }
      x.putImageData(im, 0, 0);
      return c;
    }
  };

  function runPipeline(source, steps, params) {
    let cur = cloneCanvas(source); // never modify the original
    for (const name of steps) {
      const fn = STEPS[name];
      if (!fn) throw new Error("Unknown pre-processing step '" + name + "' in config.js");
      cur = fn(cur, params);
    }
    return cur;
  }

  function buildVariants(sourceCanvas) {
    const cfg = NS.CONFIG;
    const out = [];
    for (const name of cfg.ocr.variantOrder) {
      const steps = cfg.pipelines[name];
      if (!steps) throw new Error("Pipeline '" + name + "' (ocr.variantOrder) is not defined in config.pipelines");
      out.push({ name, dataUrl: runPipeline(sourceCanvas, steps, cfg.preprocess).toDataURL("image/png") });
    }
    return out;
  }

  NS.imageProcessing = { getImageCanvas, buildVariants, sleep };
})();
