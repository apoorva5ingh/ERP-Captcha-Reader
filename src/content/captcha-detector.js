(function () {
  "use strict";
  const NS = (self.ERPCAP = self.ERPCAP || {});

  const KEYWORDS = /captcha|capcha|verif|security[\s_-]*code|sec[\s_-]*code|vcode|checkcode|randcode|imgcode|code[\s_-]*img|img[\s_-]*code|human/i;
  const REFRESH_WORDS = /refresh|reload|regenerat|new[\s_-]*(code|captcha|image)|change[\s_-]*(code|captcha|image)|another|try[\s_-]*again|\u21BB|\u27F3|\u27F2|\uD83D\uDD04/i;
  const USERNAME_WORDS = /user|login|email|uid|passw|enroll|roll|regist|student/i;

  const cfg = () => NS.CONFIG;

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
  }

  function cls(el) {
    const c = el.className;
    return typeof c === "string" ? c : (c && c.baseVal) || "";
  }

  function attrText(el) {
    return [
      el.id, cls(el),
      el.getAttribute("name"), el.getAttribute("alt"), el.getAttribute("title"),
      el.getAttribute("placeholder"), el.getAttribute("aria-label"), el.getAttribute("autocomplete")
    ].filter(Boolean).join(" ");
  }

  function srcHint(img) {
    const s = img.getAttribute("src") || "";
    return s.startsWith("data:") ? "" : s.slice(0, 200);
  }

  function ancestorHint(el, levels) {
    let t = "";
    let p = el.parentElement;
    for (let i = 0; i < levels && p; i++, p = p.parentElement) t += " " + (p.id || "") + " " + cls(p);
    return t;
  }

  function safeQuery(sel) {
    if (!sel) return null;
    try { return document.querySelector(sel); } catch (e) { return null; }
  }

  function center(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function dist(a, b) {
    const p = center(a), q = center(b);
    return Math.hypot(p.x - q.x, p.y - q.y);
  }

  function labelText(input) {
    let t = "";
    if (input.labels) for (const l of input.labels) t += " " + l.textContent;
    const prev = input.previousElementSibling;
    if (prev && !/^(INPUT|SELECT|TEXTAREA|IMG)$/.test(prev.tagName)) t += " " + (prev.textContent || "").slice(0, 80);
    const p = input.parentElement;
    if (p) for (const n of p.childNodes) if (n.nodeType === 3) t += " " + n.textContent;
    const td = input.closest("td,th");
    if (td && td.previousElementSibling) t += " " + (td.previousElementSibling.textContent || "").slice(0, 80);
    return t;
  }

  function candidateInputs() {
    const ok = ["text", "tel", "number", "search", ""];
    return Array.from(document.querySelectorAll("input")).filter((i) => {
      const t = (i.getAttribute("type") || "text").toLowerCase();
      return ok.includes(t) && !i.disabled && !i.readOnly && isVisible(i);
    });
  }

  function inputKeywordScore(i) {
    let s = 0;
    if (KEYWORDS.test(attrText(i))) s += 10;
    if (KEYWORDS.test(labelText(i))) s += 8;
    return s;
  }

  function scoreInput(i, img) {
    let s = inputKeywordScore(i);
    const ml = parseInt(i.getAttribute("maxlength") || "0", 10);
    if (ml >= 3 && ml <= 8) s += 3;
    if (img) {
      const d = dist(i, img);
      if (d < 150) s += 4; else if (d < 300) s += 2;
      if (i.form && i.form === img.closest("form")) s += 1;
      const gp = img.parentElement && img.parentElement.parentElement;
      if (gp && gp.contains(i)) s += 2;
    }
    if (USERNAME_WORDS.test(attrText(i)) && !KEYWORDS.test(attrText(i))) s -= 8;
    return s;
  }

  function sizeLooksLikeCaptcha(r) {
    return r.width >= 30 && r.height >= 12 && r.width <= 500 && r.height <= 200;
  }

  function findImage(problems) {
    const c = cfg();
    if (c.captchaImageSelector) {
      let el = safeQuery(c.captchaImageSelector);
      if (el && el.tagName !== "IMG") el = el.querySelector("img");
      if (el && el.tagName === "IMG") return { el, source: "config" };
      problems.push("captchaImageSelector '" + c.captchaImageSelector + "' did not match an <img>.");
      if (!c.autoDetectFallback) return null;
    }
    if (!c.captchaImageSelector || c.autoDetectFallback) {
      let best = null, bestScore = 0;
      for (const img of document.images) {
        if (!isVisible(img)) continue;
        const r = img.getBoundingClientRect();
        if (!sizeLooksLikeCaptcha(r)) continue;
        const hint = attrText(img) + " " + srcHint(img) + " " + ancestorHint(img, 2);
        let s = 0;
        if (KEYWORDS.test(hint)) s += 10;
        if (s > bestScore) { best = img; bestScore = s; }
      }
      if (best) return { el: best, source: "auto (keyword match on image)" };

      // Fallback: an input that mentions captcha, plus the closest reasonably-sized image.
      for (const inp of candidateInputs().filter((i) => inputKeywordScore(i) > 0)) {
        let near = null, nd = 350;
        for (const img of document.images) {
          if (!isVisible(img) || !sizeLooksLikeCaptcha(img.getBoundingClientRect())) continue;
          const d = dist(inp, img);
          if (d < nd) { nd = d; near = img; }
        }
        if (near) return { el: near, source: "auto (image near captcha input)" };
      }
    }
    problems.push("No CAPTCHA image found.");
    return null;
  }

  function findInput(img, problems) {
    const c = cfg();
    if (c.captchaInputSelector) {
      const el = safeQuery(c.captchaInputSelector);
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return { el, source: "config" };
      problems.push("captchaInputSelector '" + c.captchaInputSelector + "' did not match an <input>.");
      if (!c.autoDetectFallback) return null;
    }
    let best = null, bestScore = -Infinity;
    for (const i of candidateInputs()) {
      const s = scoreInput(i, img);
      if (s > bestScore) { best = i; bestScore = s; }
    }
    if (best && bestScore >= 6) return { el: best, source: "auto (score " + bestScore + ")" };
    problems.push("No CAPTCHA input found.");
    return null;
  }

  function findRefresh(img) {
    const c = cfg();
    if (c.captchaRefreshSelector) {
      const el = safeQuery(c.captchaRefreshSelector);
      if (el) return { el, source: "config" };
    }
    if (!c.autoDetectFallback) return null;

    let p = img.parentElement;
    for (let level = 0; level < 4 && p; level++, p = p.parentElement) {
      const els = p.querySelectorAll("a,button,[role=button],input[type=button],input[type=image],span,i,img,svg,div");
      for (const el of els) {
        if (el === img || !isVisible(el)) continue;
        const own = (el.textContent || "").trim();
        if (own.length > 30) continue;
        const text = [own, attrText(el), el.getAttribute("onclick"), el.getAttribute("href"), el.getAttribute("value")]
          .filter(Boolean).join(" ");
        if (REFRESH_WORDS.test(text)) return { el, source: "auto (refresh keyword)" };
      }
    }
    if (img.getAttribute("onclick") || getComputedStyle(img).cursor === "pointer") {
      return { el: img, source: "auto (clicking the image)" };
    }
    return null;
  }

  function find() {
    const problems = [];
    const out = { img: null, input: null, refresh: null, sources: {}, problems };
    const img = findImage(problems);
    if (!img) return out;
    out.img = img.el;
    out.sources.img = img.source;
    const input = findInput(img.el, problems);
    if (input) { out.input = input.el; out.sources.input = input.source; }
    const refresh = findRefresh(img.el);
    if (refresh) { out.refresh = refresh.el; out.sources.refresh = refresh.source; }
    return out;
  }

  NS.detector = { find, isVisible };
})();
