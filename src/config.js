/*
 * ============================================================
 *  USER CONFIGURATION  -  edit this file, then run: npm run build
 *  and click the reload (circular arrow) button on chrome://extensions
 * ============================================================
 *
 * WHERE THE ERP URL GOES
 *   The pages the extension runs on are controlled by manifest.json:
 *   replace BOTH occurrences of  https://YOUR-ERP-DOMAIN.example/*
 *   ("host_permissions" and "content_scripts.matches") with your ERP,
 *   e.g.  https://erp.mycollege.edu/*
 *
 * WHERE THE SELECTORS GO
 *   captchaImageSelector / captchaInputSelector / captchaRefreshSelector below.
 *   Leave a selector as "" to use automatic detection for that element.
 */
const CONFIG = {
  // ---------- 1. ERP page guard (optional) ----------
  // Only run when the URL path contains one of these strings (case-insensitive).
  // [] = run on every page matched by manifest.json (it only shows UI if a CAPTCHA is found).
  onlyOnPathsContaining: [],

  // ---------- 2. SELECTORS (replace with selectors from YOUR ERP page) ----------
  captchaImageSelector: "",    // CSS selector of the CAPTCHA <img>
  captchaInputSelector: "",    // CSS selector of the box where the CAPTCHA text is typed
  captchaRefreshSelector: "",  // OPTIONAL: element that loads a new CAPTCHA (button/link/or the image itself)
  autoDetectFallback: true,    // if a selector above is empty or not found, try auto-detection

  // ---------- 3. Behaviour ----------
  autoRun: true,               // read automatically when a CAPTCHA appears (popup checkbox overrides this)
  autoRetries: 2,              // if unreadable AND a refresh control exists: refresh + retry this many times
  waitForCaptchaMs: 10000,     // how long to wait for the CAPTCHA to appear after page load

  // ---------- 4. What your CAPTCHA looks like (improves accuracy a lot) ----------
  expectedLength: 0,           // exact number of characters, e.g. 5. 0 = unknown
  minLength: 3,                // results shorter than this count as a failed read
  maxLength: 10,               // results longer than this count as a failed read
  whitelist: "",               // allowed characters, e.g. "0123456789". "" = letters+digits
  caseMode: "keep",            // "keep" | "upper" | "lower"
  substitutions: {},           // optional fix-ups applied after OCR, e.g. { "O": "0", "l": "1" }

  // ---------- 5. OCR + image pre-processing (tune these if reads are wrong) ----------
  ocr: {
    psm: "7",                  // Tesseract page-segmentation mode: "7" = single line, "8" = single word, "13" = raw line
    variantOrder: ["processed", "grayscale"], // pipelines below to try; the best valid result wins
    timeoutMs: 90000           // first OCR run loads the engine and can be slow
  },

  preprocess: {
    padding: 12,               // white border added around the image (px)
    scale: 3,                  // upscale factor
    contrastClip: 0.01,        // fraction of darkest/brightest pixels ignored when stretching contrast
    denoisePasses: 1,          // number of 3x3 median-filter passes (0 = off)
    threshold: "otsu"          // "otsu" (automatic) or a number 0-255
  },

  // Each pipeline is an ordered list of steps.
  // Available steps: pad, upscale, grayscale, contrast, denoise, threshold, invertIfDark
  pipelines: {
    processed: ["pad", "upscale", "grayscale", "contrast", "denoise", "threshold", "invertIfDark"],
    grayscale: ["pad", "upscale", "grayscale", "contrast"],
    raw: ["pad", "upscale"]
  },

  // ---------- 6. Debugging ----------
  debug: false                 // true = console logs + preview of the pre-processed image + panel shown even if nothing is found
};

self.ERPCAP = self.ERPCAP || {};
self.ERPCAP.CONFIG = CONFIG;
