(function () {
  "use strict";
  const NS = (self.ERPCAP = self.ERPCAP || {});

  function clean(raw) {
    const c = NS.CONFIG;
    let t = String(raw || "").replace(/\s+/g, "");
    for (const [from, to] of Object.entries(c.substitutions || {})) t = t.split(from).join(to);
    const allowed = c.whitelist ? new Set(c.whitelist.split("")) : null;
    t = t.split("").filter((ch) => (allowed ? allowed.has(ch) : /[A-Za-z0-9]/.test(ch))).join("");
    if (c.caseMode === "upper") t = t.toUpperCase();
    if (c.caseMode === "lower") t = t.toLowerCase();
    return t;
  }

  function isValid(text) {
    const c = NS.CONFIG;
    if (c.expectedLength > 0) return text.length === c.expectedLength;
    return text.length >= c.minLength && text.length <= c.maxLength;
  }

  function withTimeout(promise, ms) {
    let t;
    const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error("OCR timed out")), ms); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }

  async function recognize(img) {
    const c = NS.CONFIG;
    const IP = NS.imageProcessing;
    const canvas = await IP.getImageCanvas(img);
    const variants = IP.buildVariants(canvas);

    let resp;
    try {
      resp = await withTimeout(
        chrome.runtime.sendMessage({
          type: "OCR_REQUEST",
          payload: {
            images: variants.map((v) => ({ name: v.name, dataUrl: v.dataUrl })),
            whitelist: c.whitelist || "",
            psm: c.ocr.psm
          }
        }),
        c.ocr.timeoutMs
      );
    } catch (e) {
      if (/context invalidated/i.test(String(e && e.message))) {
        throw new Error("Extension was reloaded - refresh this page.");
      }
      throw e;
    }
    if (!resp || !resp.ok) throw new Error((resp && resp.error) || "No response from the OCR engine");

    const candidates = resp.results.map((r) => {
      const text = clean(r.text);
      const valid = isValid(text);
      const conf = Number(r.confidence) || 0;
      return { name: r.name, raw: r.text, text, valid, confidence: conf, score: conf + (valid ? 100 : 0) };
    });
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0] || null;
    return { text: best && best.valid ? best.text : "", best, candidates, variants };
  }

  NS.ocr = { recognize, clean, isValid };
})();
