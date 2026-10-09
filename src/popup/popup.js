"use strict";
const $ = (id) => document.getElementById(id);

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ? tab.id : null;
}

async function send(type) {
  try {
    const id = await activeTabId();
    if (id == null) return null;
    return await chrome.tabs.sendMessage(id, { type });
  } catch (e) {
    return null; // no content script on this page
  }
}

function render(s) {
  if (!s) {
    $("dot").className = "dot err";
    $("status").textContent = "Not active on this page";
    $("detail").textContent = "Open your ERP login page (the domain in manifest.json), then reload it.";
    $("text").textContent = "";
    $("read").disabled = true;
    $("refresh").disabled = true;
    return;
  }
  $("dot").className = "dot " + s.kind;
  $("status").textContent = s.status;
  $("detail").textContent = s.detail || "";
  $("text").textContent = s.text || "";
  $("read").disabled = false;
  $("refresh").disabled = false;
  $("auto").checked = s.autoRun !== false;
}

async function action(type) {
  $("read").disabled = true;
  $("refresh").disabled = true;
  $("dot").className = "dot work";
  $("status").textContent = "Working...";
  render(await send(type));
}

$("read").addEventListener("click", () => action("READ_CAPTCHA"));
$("refresh").addEventListener("click", () => action("REFRESH_CAPTCHA"));
$("auto").addEventListener("change", (e) => chrome.storage.local.set({ autoRun: e.target.checked }));

send("GET_STATUS").then(render);
