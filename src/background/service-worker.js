"use strict";
/*
 * Service worker. Two jobs, both purely local:
 *  1. CAPTURE_TAB : take a screenshot of the visible tab (fallback when the CAPTCHA <img>
 *                   cannot be read directly from a canvas because of cross-origin rules).
 *  2. OCR_REQUEST : forward the CAPTCHA image to the offscreen document, which runs
 *                   Tesseract.js (WebAssembly) inside the browser. Nothing leaves your machine.
 */
const OFFSCREEN_PATH = "src/offscreen/offscreen.html";
let creating = null;

async function ensureOffscreen() {
  const url = chrome.runtime.getURL(OFFSCREEN_PATH);
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [url]
  });
  if (existing.length > 0) return;
  if (!creating) {
    creating = chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["WORKERS"],
      justification: "Run local OCR (Tesseract.js) in a Web Worker to read the login CAPTCHA."
    });
  }
  try { await creating; } finally { creating = null; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendToOffscreen(payload) {
  let lastErr = null;
  for (let i = 0; i < 8; i++) {
    try {
      const resp = await chrome.runtime.sendMessage({ target: "offscreen", type: "OCR_RUN", payload });
      if (resp) return resp;
      lastErr = new Error("Empty response from offscreen document");
    } catch (e) {
      lastErr = e; // offscreen page may not have registered its listener yet
    }
    await sleep(250);
  }
  throw lastErr || new Error("Offscreen document did not respond");
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target === "offscreen") return false;      // not for us
  if (sender.id !== chrome.runtime.id) return false;          // only our own extension

  if (msg.type === "CAPTURE_TAB") {
    if (!sender.tab) { sendResponse({ ok: false, error: "No tab" }); return false; }
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" })
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }

  if (msg.type === "OCR_REQUEST") {
    (async () => {
      try {
        await ensureOffscreen();
        sendResponse(await sendToOffscreen(msg.payload));
      } catch (e) {
        sendResponse({ ok: false, error: String((e && e.message) || e) });
      }
    })();
    return true;
  }
  return false;
});
