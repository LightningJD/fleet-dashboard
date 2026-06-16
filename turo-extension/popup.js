// popup.js — Lightning Fleet Tracker popup logic

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const els = {
    statusDot: $("statusDot"),
    statusText: $("statusText"),
    captureCount: $("captureCount"),
    lastCapture: $("lastCapture"),
    githubDot: $("githubDot"),
    githubStatus: $("githubStatus"),
    tokenInput: $("tokenInput"),
    saveToken: $("saveToken"),
    pushNow: $("pushNow"),
    toast: $("toast"),
  };

  // ════════════════════════════════════════════════
  // Helper: time ago
  // ════════════════════════════════════════════════
  function timeAgo(ts) {
    if (!ts) return "—";
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  // ════════════════════════════════════════════════
  // Helper: show toast
  // ════════════════════════════════════════════════
  function showToast(msg, type = "success") {
    els.toast.textContent = msg;
    els.toast.className = `toast show ${type}`;
    setTimeout(() => {
      els.toast.className = "toast";
    }, 3000);
  }

  // ════════════════════════════════════════════════
  // Refresh status display
  // ════════════════════════════════════════════════
  async function refreshStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_STATUS" });
      if (!response) return;

      // Active indicator
      if (response.active) {
        els.statusDot.className = "status-dot active";
        els.statusText.textContent = "Active";
      } else {
        els.statusDot.className = "status-dot idle";
        els.statusText.textContent = "Idle";
      }

      // Capture count
      els.captureCount.textContent = String(response.captureCount || 0);

      // Last capture
      if (response.lastCaptureUrl) {
        const shortUrl = response.lastCaptureUrl.length > 35
          ? response.lastCaptureUrl.substring(0, 35) + "…"
          : response.lastCaptureUrl;
        els.lastCapture.textContent = shortUrl;
        els.lastCapture.title = response.lastCaptureUrl + "\n" + timeAgo(response.lastCaptureTime);
      } else {
        els.lastCapture.textContent = "—";
      }

      // GitHub status
      const tokenSet = await chrome.storage.local.get("github_token");
      if (!tokenSet.github_token) {
        els.githubDot.className = "status-dot idle";
        els.githubStatus.textContent = "Not configured";
      } else if (response.lastPushStatus === "success") {
        els.githubDot.className = "status-dot connected";
        els.githubStatus.textContent = `Pushed ${timeAgo(response.lastPushTime)}`;
      } else if (response.lastPushStatus === "error") {
        els.githubDot.className = "status-dot error";
        els.githubStatus.textContent = "Error — check console";
      } else {
        els.githubDot.className = "status-dot idle";
        els.githubStatus.textContent = "Connected";
      }
    } catch (e) {
      // Service worker might be starting up
      console.warn("Could not get status:", e);
    }
  }

  // ════════════════════════════════════════════════
  // Save token
  // ════════════════════════════════════════════════
  els.saveToken.addEventListener("click", async () => {
    const token = els.tokenInput.value.trim();
    if (!token) {
      showToast("Enter a token first", "error");
      return;
    }
    await chrome.storage.local.set({ github_token: token });
    els.tokenInput.value = "";
    showToast("Token saved ✓");
    refreshStatus();
  });

  // ════════════════════════════════════════════════
  // Push now
  // ════════════════════════════════════════════════
  els.pushNow.addEventListener("click", async () => {
    els.pushNow.disabled = true;
    els.pushNow.textContent = "Pushing…";

    try {
      const result = await chrome.runtime.sendMessage({ type: "PUSH_NOW" });
      if (result && result.ok) {
        showToast("Pushed to GitHub ✓");
      } else {
        showToast(result?.error || "Push failed", "error");
      }
    } catch (e) {
      showToast("Push failed: " + e.message, "error");
    } finally {
      els.pushNow.disabled = false;
      els.pushNow.textContent = "Push Now";
      refreshStatus();
    }
  });

  // ════════════════════════════════════════════════
  // Init
  // ════════════════════════════════════════════════
  refreshStatus();

  // Refresh every 5 seconds while popup is open
  setInterval(refreshStatus, 5000);
})();
