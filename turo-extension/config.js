// config.js — Lightning Fleet Tracker configuration
// Loaded before content.js via manifest content_scripts ordering

const LIGHTNING_CONFIG = {
  githubRepo: "LightningJD/fleet-dashboard",
  githubPath: "data.json",
  githubBranch: "main",
  // Token is set via popup and stored in chrome.storage.local under "github_token"
  // Push interval in minutes
  pushIntervalMinutes: 5,
  // Console prefix for all logs
  logPrefix: "[Lightning Fleet]",
  // URL patterns we care about
  patterns: {
    listing: /listing/i,
    availability: /availability|calendar/i,
    search: /search/i,
  },
};
