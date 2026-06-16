// background.js — Service Worker for Lightning Fleet Tracker
// Handles: capture storage, batch processing, GitHub API pushes

// ════════════════════════════════════════════════
// Constants
// ════════════════════════════════════════════════
const GITHUB_REPO = "LightningJD/fleet-dashboard";
const GITHUB_PATH = "data.json";
const GITHUB_BRANCH = "main";
const PUSH_INTERVAL_MINUTES = 5;
const ALARM_NAME = "lightning-push";

// ════════════════════════════════════════════════
// State
// ════════════════════════════════════════════════
let sessionStart = Date.now();
let captureCount = 0;
let lastCaptureUrl = null;
let lastCaptureTime = null;
let lastPushTime = null;
let lastPushStatus = null; // "success" | "error" | null

// ════════════════════════════════════════════════
// Helper: get today's date key
// ════════════════════════════════════════════════
function getDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ════════════════════════════════════════════════
// Helper: get accumulated captures from storage
// ════════════════════════════════════════════════
async function getCaptures(dateKey) {
  const key = `captures_${dateKey}`;
  const result = await chrome.storage.local.get(key);
  return result[key] || [];
}

// ════════════════════════════════════════════════
// Helper: save captures to storage
// ════════════════════════════════════════════════
async function saveCaptures(dateKey, captures) {
  const key = `captures_${dateKey}`;
  await chrome.storage.local.set({ [key]: captures });
}

// ════════════════════════════════════════════════
// Message handler from content script
// ════════════════════════════════════════════════
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "API_CAPTURE") {
    handleCapture(message)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => {
        console.warn("[Lightning Fleet BG] Capture error:", e);
        sendResponse({ ok: false, error: e.message });
      });
    return true; // async response
  }

  if (message.type === "PUSH_NOW") {
    pushToGitHub()
      .then((result) => sendResponse(result))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (message.type === "GET_STATUS") {
    sendResponse({
      active: captureCount > 0,
      captureCount,
      lastCaptureUrl,
      lastCaptureTime,
      lastPushTime,
      lastPushStatus,
      sessionStart,
    });
    return false;
  }
});

// ════════════════════════════════════════════════
// Handle incoming capture
// ════════════════════════════════════════════════
async function handleCapture(message) {
  const dateKey = getDateKey();
  const captures = await getCaptures(dateKey);

  const capture = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: message.timestamp || Date.now(),
    url: message.url,
    type: message.captureType,
    data: message.data,
  };

  captures.push(capture);

  // Keep max 1000 captures per day to avoid storage bloat
  if (captures.length > 1000) {
    captures.splice(0, captures.length - 1000);
  }

  await saveCaptures(dateKey, captures);

  captureCount++;
  lastCaptureUrl = message.url;
  lastCaptureTime = Date.now();

  // Update badge
  chrome.action.setBadgeText({ text: String(captureCount) });
  chrome.action.setBadgeBackgroundColor({ color: "#00ff88" });

  console.log(`[Lightning Fleet BG] Capture #${captureCount} stored [${message.captureType}]`);
}

// ════════════════════════════════════════════════
// GitHub API: get current file
// ════════════════════════════════════════════════
async function getGitHubFile(token) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}?ref=${GITHUB_BRANCH}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (resp.status === 404) {
    return { sha: null, content: null };
  }

  if (!resp.ok) {
    throw new Error(`GitHub GET failed: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  return { sha: data.sha, content: data.content };
}

// ════════════════════════════════════════════════
// GitHub API: put file
// ════════════════════════════════════════════════
async function putGitHubFile(token, sha, content) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}`;

  const body = {
    message: `chore: update fleet data ${new Date().toISOString()}`,
    content: content,
    branch: GITHUB_BRANCH,
  };

  if (sha) {
    body.sha = sha;
  }

  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`GitHub PUT failed: ${resp.status} ${errText}`);
  }

  return resp.json();
}

// ════════════════════════════════════════════════
// Main: push accumulated data to GitHub
// ════════════════════════════════════════════════
async function pushToGitHub() {
  const tokenResult = await chrome.storage.local.get("github_token");
  const token = tokenResult.github_token;

  if (!token) {
    lastPushStatus = "error";
    return { ok: false, error: "No GitHub token configured" };
  }

  // Gather all capture dates
  const all = await chrome.storage.local.get(null);
  const captureKeys = Object.keys(all).filter((k) => k.startsWith("captures_"));

  const allCaptures = {};
  for (const key of captureKeys) {
    allCaptures[key.replace("captures_", "")] = all[key];
  }

  if (Object.keys(allCaptures).length === 0) {
    return { ok: false, error: "No captures to push" };
  }

  // Get current file
  const { sha, content: existingB64 } = await getGitHubFile(token);

  // Merge with existing data if present
  let existingData = {};
  if (existingB64) {
    try {
      existingData = JSON.parse(atob(existingB64.replace(/\n/g, "")));
    } catch (e) {
      console.warn("[Lightning Fleet BG] Could not parse existing file, overwriting");
    }
  }

  // Merge: update captures by date, keeping latest
  const merged = { ...existingData, lastUpdated: new Date().toISOString() };

  for (const [date, captures] of Object.entries(allCaptures)) {
    if (!merged[date]) {
      merged[date] = [];
    }
    // Append new captures (dedupe by id)
    const existingIds = new Set(merged[date].map((c) => c.id));
    for (const c of captures) {
      if (!existingIds.has(c.id)) {
        merged[date].push(c);
      }
    }
  }

  // Encode and push
  const jsonStr = JSON.stringify(merged, null, 2);
  const newB64 = btoa(unescape(encodeURIComponent(jsonStr)));

  await putGitHubFile(token, sha, newB64);

  lastPushTime = Date.now();
  lastPushStatus = "success";

  console.log(`[Lightning Fleet BG] Pushed to GitHub at ${new Date().toISOString()}`);

  // Clear today's captures after successful push (keep raw data in merged file)
  const todayKey = `captures_${getDateKey()}`;
  await chrome.storage.local.set({ [todayKey]: [] });

  return { ok: true, pushedAt: lastPushTime };
}

// ════════════════════════════════════════════════
// Alarm: periodic push every 5 minutes
// ════════════════════════════════════════════════
chrome.alarms.create(ALARM_NAME, {
  periodInMinutes: PUSH_INTERVAL_MINUTES,
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  if (captureCount === 0) {
    console.log("[Lightning Fleet BG] Alarm fired — no captures to push");
    return;
  }

  pushToGitHub()
    .then((result) => {
      if (result.ok) {
        console.log("[Lightning Fleet BG] Scheduled push succeeded");
      } else {
        console.warn("[Lightning Fleet BG] Scheduled push skipped:", result.error);
      }
    })
    .catch((e) => {
      console.error("[Lightning Fleet BG] Scheduled push failed:", e);
      lastPushStatus = "error";
    });
});

// ════════════════════════════════════════════════
// Lifecycle
// ════════════════════════════════════════════════
chrome.runtime.onInstalled.addListener(() => {
  console.log("[Lightning Fleet BG] Extension installed/updated");
  chrome.action.setBadgeText({ text: "" });
});

// Restore state from storage on startup
chrome.runtime.onStartup.addListener(async () => {
  const state = await chrome.storage.local.get("session_state");
  if (state.session_state) {
    captureCount = state.session_state.captureCount || 0;
    lastCaptureUrl = state.session_state.lastCaptureUrl || null;
    lastCaptureTime = state.session_state.lastCaptureTime || null;
    lastPushTime = state.session_state.lastPushTime || null;
    lastPushStatus = state.session_state.lastPushStatus || null;
  }
  sessionStart = Date.now();
  console.log("[Lightning Fleet BG] Service worker started");
});

console.log("[Lightning Fleet BG] Service worker loaded");
