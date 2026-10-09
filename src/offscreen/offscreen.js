"use strict";
/*
 * Runs Tesseract.js entirely from files bundled inside the extension
 * (vendor/tesseract, vendor/tesseract-core, vendor/lang). No network access.
 */
let workerPromise = null;
let queue = Promise.resolve();

function getWorker() {
  if (typeof Tesseract === "undefined") {
    return Promise.reject(new Error(
      "OCR engine files are missing (vendor/tesseract/tesseract.min.js did not load). " +
      "Run 'npm install' then 'npm run build' and load the dist folder (not the project folder) in chrome://extensions."
    ));
  }
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker("eng", 1, {
      workerPath: chrome.runtime.getURL("vendor/tesseract/worker.min.js"),
      corePath: chrome.runtime.getURL("vendor/tesseract-core"),
      langPath: chrome.runtime.getURL("vendor/lang"),
      workerBlobURL: false,
      gzip: true,
      cacheMethod: "none"
    }).catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

async function runOcr(payload) {
  const worker = await getWorker();
  await worker.setParameters({
    tessedit_char_whitelist: payload.whitelist || "",
    tessedit_pageseg_mode: String(payload.psm || "7"),
    preserve_interword_spaces: "0",
    user_defined_dpi: "300"
  });
  const results = [];
  for (const img of payload.images) {
    const { data } = await worker.recognize(img.dataUrl);
    results.push({ name: img.name, text: data.text || "", confidence: data.confidence });
  }
  return { ok: true, results };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== "offscreen" || msg.type !== "OCR_RUN") return false;
  queue = queue
    .then(() => runOcr(msg.payload))
    .then((r) => sendResponse(r))
    .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
  return true;
});
