(function () {
  "use strict";
  const NS = (self.ERPCAP = self.ERPCAP || {});
  if (NS.started) return;
  NS.started = true;

  const CONFIG = NS.CONFIG;
  const Detector = NS.detector;
  const OCR = NS.ocr;
  const sleep = NS.imageProcessing.sleep;
  const log = (...a) => { if (CONFIG.debug) console.log("[ERP-CAPTCHA]", ...a); };

  if (CONFIG.onlyOnPathsContaining.length) {
    const path = location.pathname.toLowerCase();
    if (!CONFIG.onlyOnPathsContaining.some((s) => path.includes(String(s).toLowerCase()))) return;
  }

  const state = { kind: "info", status: "Starting...", detail: "", text: "" };
  let ui = null;
  let busy = false;
  let autoRun = CONFIG.autoRun !== false;
  let lastFilled = "";
  let lastSig = "";
  const tracked = new WeakSet();

  /* ---------------- UI (Shadow DOM so the ERP's CSS cannot affect it) ---------------- */

  function createUI() {
    const host = document.createElement("div");
    host.setAttribute("data-erp-captcha-autofill", "");
    host.style.cssText = "all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;display:none;";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        .panel{font:13px/1.4 system-ui,"Segoe UI",Arial,sans-serif;background:#fff;color:#111827;border:1px solid #d1d5db;
          border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.18);width:250px;padding:10px 12px}
        .head{display:flex;align-items:center;gap:8px;font-weight:600}
        .dot{width:10px;height:10px;border-radius:50%;background:#9ca3af;flex:none}
        .dot.info{background:#3b82f6}.dot.work{background:#f59e0b}.dot.ok{background:#16a34a}.dot.err{background:#dc2626}
        .title{flex:1}
        .min{border:0;background:none;cursor:pointer;font-size:16px;line-height:1;color:#6b7280;padding:0 2px}
        .body{margin-top:8px}
        .collapsed .body{display:none}
        .status{font-weight:600}
        .detail{color:#4b5563;margin-top:2px;word-break:break-word}
        .text{font:600 15px ui-monospace,Consolas,monospace;letter-spacing:1px;margin-top:4px}
        .row{display:flex;gap:6px;margin-top:8px}
        button.act{flex:1;padding:6px 8px;border:1px solid #2563eb;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer;font:inherit}
        button.act.alt{background:#fff;color:#2563eb}
        button.act:disabled{opacity:.5;cursor:default}
        .preview{display:none;margin-top:8px;max-width:100%;border:1px dashed #9ca3af}
      </style>
      <div class="panel" id="panel">
        <div class="head"><span class="dot info" id="dot"></span><span class="title">ERP CAPTCHA</span><button class="min" id="min" title="Minimise">&ndash;</button></div>
        <div class="body">
          <div class="status" id="status"></div>
          <div class="detail" id="detail"></div>
          <div class="text" id="text"></div>
          <div class="row">
            <button class="act" id="read">Read CAPTCHA</button>
            <button class="act alt" id="refresh">Refresh</button>
          </div>
          <img class="preview" id="preview" alt="pre-processed CAPTCHA (debug)">
        </div>
      </div>`;
    document.documentElement.appendChild(host);
    const $ = (id) => root.getElementById(id);
    const api = {
      show() { host.style.display = "block"; },
      hide() { host.style.display = "none"; },
      set(kind, status, detail, text) {
        $("dot").className = "dot " + kind;
        $("status").textContent = status;
        $("detail").textContent = detail || "";
        $("text").textContent = text || "";
      },
      setBusy(b) { $("read").disabled = b; $("refresh").disabled = b; },
      setPreview(url) {
        const im = $("preview");
        if (url && CONFIG.debug) { im.src = url; im.style.display = "block"; } else { im.style.display = "none"; }
      }
    };
    $("read").addEventListener("click", () => readCaptcha({}));
    $("refresh").addEventListener("click", () => refreshAndRead());
    $("min").addEventListener("click", () => $("panel").classList.toggle("collapsed"));
    NS.hooks = {
      async beforeCapture() {
        host.style.visibility = "hidden";
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      },
      afterCapture() { host.style.visibility = "visible"; }
    };
    return api;
  }

  function setStatus(kind, status, detail, text) {
    state.kind = kind; state.status = status; state.detail = detail || ""; state.text = text || "";
    log("status:", status, detail || "");
    if (ui) ui.set(kind, status, detail, text);
  }

  /* ---------------- helpers ---------------- */

  function signature(img) {
    const s = img.currentSrc || img.src || "";
    return s.length + ":" + s.slice(-60) + "|" + img.naturalWidth + "x" + img.naturalHeight;
  }

  // Sets the value the way a user typing would, so React/Angular/Vue/jQuery pages notice it.
  function fillInput(input, value) {
    const proto = Object.getPrototypeOf(input);
    const desc = Object.getOwnPropertyDescriptor(proto, "value") ||
                 Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    if (desc && desc.set) desc.set.call(input, value); else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    lastFilled = value;
  }

  function friendlyError(e) {
    const m = String((e && e.message) || e);
    if (/context invalidated/i.test(m)) return "Extension was reloaded - refresh this page.";
    return m;
  }

  async function doRefresh(found) {
    if (!found.refresh) return false;
    const prevImg = found.img;
    const prevSig = signature(prevImg);
    let loaded = false;
    const onLoad = () => { loaded = true; };
    prevImg.addEventListener("load", onLoad);
    try { found.refresh.click(); } catch (e) { prevImg.removeEventListener("load", onLoad); return false; }
    const start = Date.now();
    while (Date.now() - start < 4000) {
      await sleep(120);
      const cur = Detector.find();
      if (loaded || !prevImg.isConnected || (cur.img && cur.img !== prevImg) || (cur.img && signature(cur.img) !== prevSig)) break;
    }
    prevImg.removeEventListener("load", onLoad);
    await sleep(300);
    return true;
  }

  /* ---------------- main actions ---------------- */

  async function readCaptcha(opts) {
    const auto = !!(opts && opts.auto);
    if (busy) return;
    busy = true;
    if (ui) ui.setBusy(true);
    try {
      let found = Detector.find();
      if (!found.img || !found.input) {
        setStatus("err", "Could not read CAPTCHA", (found.problems.join(" ") || "CAPTCHA not found.") + " See README: configure selectors in src/config.js.");
        return;
      }
      if (auto && found.input.value && found.input.value !== lastFilled) {
        setStatus("info", "CAPTCHA detected", "The box already has text, so I left it alone. Click Read CAPTCHA to overwrite.");
        return;
      }
      log("found:", found.sources, found);

      const attempts = Math.max(0, CONFIG.autoRetries | 0) + 1;
      let lastDetail = "";
      for (let n = 0; n < attempts; n++) {
        setStatus("work", "Reading CAPTCHA...", n ? "Retry " + n + " of " + (attempts - 1) : "");
        try {
          const res = await OCR.recognize(found.img);
          if (ui) ui.setPreview(res.variants && res.variants[0] && res.variants[0].dataUrl);
          log("OCR candidates:", res.candidates);
          if (res.text) {
            fillInput(found.input, res.text);
            setStatus("ok", "CAPTCHA filled", "Check it, then click Login yourself.", res.text);
            return;
          }
          const b = res.best;
          const need = CONFIG.expectedLength > 0 ? CONFIG.expectedLength + " characters" : CONFIG.minLength + "-" + CONFIG.maxLength + " characters";
          lastDetail = b ? 'OCR saw "' + b.raw.trim() + '" -> "' + b.text + '" (need ' + need + ").": "OCR returned nothing.";
        } catch (e) {
          console.error("[ERP-CAPTCHA] OCR error:", e);
          lastDetail = friendlyError(e);
          if (/reloaded/i.test(lastDetail)) break;
        }
        if (n < attempts - 1) {
          if (!found.refresh) { lastDetail += " (No refresh control known, so not retrying.)"; break; }
          await doRefresh(found);
          found = Detector.find();
          if (!found.img || !found.input) { lastDetail += " CAPTCHA disappeared after refresh."; break; }
        }
      }
      setStatus("err", "Could not read CAPTCHA", lastDetail + " Use Refresh or type it manually.");
    } finally {
      busy = false;
      if (ui) ui.setBusy(false);
      const f = Detector.find();
      if (f.img) lastSig = signature(f.img);
    }
  }

  async function refreshAndRead() {
    if (busy) return;
    const found = Detector.find();
    if (!found.img || !found.input) {
      setStatus("err", "Could not read CAPTCHA", found.problems.join(" ") || "CAPTCHA not found.");
      return;
    }
    if (!found.refresh) {
      setStatus("err", "No refresh control found", "Set captchaRefreshSelector in src/config.js, or reload the page.");
      return;
    }
    busy = true;
    if (ui) ui.setBusy(true);
    setStatus("work", "Refreshing CAPTCHA...");
    try { await doRefresh(found); } finally { busy = false; if (ui) ui.setBusy(false); }
    await readCaptcha({});
  }

  /* ---------------- detection / watching ---------------- */

  let checkTimer = null;
  function scheduleCheck(force) {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => check(force), 400);
  }

  function trackImg(img) {
    if (tracked.has(img)) return;
    tracked.add(img);
    img.addEventListener("load", () => scheduleCheck(true));
  }

  function check(force) {
    const f = Detector.find();
    if (!f.img || !f.input) return;
    trackImg(f.img);
    if (ui) ui.show();
    if (busy) return;
    if (!(f.img.complete && f.img.naturalWidth > 0)) return;
    const sig = signature(f.img);
    if (!force && sig === lastSig) return;
    lastSig = sig;
    if (autoRun) {
      setStatus("info", "CAPTCHA detected");
      readCaptcha({ auto: true });
    } else {
      setStatus("info", "CAPTCHA detected", "Auto-read is off. Click Read CAPTCHA.");
    }
  }

  function waitForCaptcha(timeoutMs) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        const f = Detector.find();
        if (f.img && f.input) return resolve(f);
        if (Date.now() - start >= timeoutMs) return resolve(null);
        setTimeout(tick, 500);
      };
      tick();
    });
  }

  function startWatcher() {
    new MutationObserver(() => scheduleCheck(false)).observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ["src"]
    });
  }

  /* ---------------- messages from popup ---------------- */

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return false;
    if (msg.type === "GET_STATUS") { sendResponse(Object.assign({ autoRun }, state)); return false; }
    if (msg.type === "READ_CAPTCHA") {
      readCaptcha({}).then(() => sendResponse(Object.assign({ autoRun }, state)));
      return true;
    }
    if (msg.type === "REFRESH_CAPTCHA") {
      refreshAndRead().then(() => sendResponse(Object.assign({ autoRun }, state)));
      return true;
    }
    return false;
  });

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.autoRun) autoRun = changes.autoRun.newValue !== false;
    });
  } catch (e) { /* storage unavailable: use config default */ }

  /* ---------------- start ---------------- */

  async function init() {
    ui = createUI();
    try {
      const stored = await chrome.storage.local.get({ autoRun: CONFIG.autoRun !== false });
      autoRun = stored.autoRun !== false;
    } catch (e) { /* keep config default */ }

    setStatus("info", "Looking for CAPTCHA...");
    startWatcher();
    const found = await waitForCaptcha(CONFIG.waitForCaptchaMs);
    if (found) {
      check(true);
    } else {
      const probe = Detector.find();
      setStatus("err", "CAPTCHA not detected", (probe.problems.join(" ") || "Nothing found.") + " Configure selectors in src/config.js.");
      if (CONFIG.debug && ui) ui.show();
    }
  }

  init();
})();
