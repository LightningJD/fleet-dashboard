// content.js — Monkey-patch fetch & XHR to intercept Turo API responses
// Core principle: NEVER break Turo's functionality. Only READ responses.

(function () {
  "use strict";

  const PREFIX = LIGHTNING_CONFIG.logPrefix;
  const PATTERNS = LIGHTNING_CONFIG.patterns;

  // ════════════════════════════════════════════════
  // Helper: classify a URL and determine capture type
  // ════════════════════════════════════════════════
  function classifyUrl(url) {
    if (PATTERNS.listing.test(url)) return "listing";
    if (PATTERNS.availability.test(url)) return "availability";
    if (PATTERNS.search.test(url)) return "search";
    return null;
  }

  // ════════════════════════════════════════════════
  // Helper: send capture to background script
  // ════════════════════════════════════════════════
  function sendCapture(url, type, data) {
    try {
      const payload = {
        type: "API_CAPTURE",
        url: url,
        captureType: type,
        data: data,
        timestamp: Date.now(),
      };
      console.log(`${PREFIX} Capture [${type}]`, url);
      chrome.runtime.sendMessage(payload).catch((e) => {
        console.warn(`${PREFIX} Failed to send capture to background:`, e);
      });
    } catch (e) {
      console.warn(`${PREFIX} sendCapture error:`, e);
    }
  }

  // ════════════════════════════════════════════════
  // Helper: extract relevant fields from listing data
  // ════════════════════════════════════════════════
  function extractListingData(raw) {
    if (!raw || typeof raw !== "object") return raw;

    try {
      // Turo listing responses vary in shape; grab what we can find
      const source = raw.listing || raw.result || raw.data || raw;
      return {
        vehicle: {
          make: source.vehicle?.make || source.make || undefined,
          model: source.vehicle?.model || source.model || undefined,
          year: source.vehicle?.year || source.year || undefined,
          trim: source.vehicle?.trim || source.trim || undefined,
        },
        price: source.price || source.dailyPrice || source.rate?.amount || undefined,
        rating: source.rating || source.ratingAverage || undefined,
        reviewsCount: source.reviewCount || source.numberOfReviews || undefined,
        tripsCount: source.tripsCount || undefined,
        delivery: source.deliveryAndReturn?.deliveryEnabled ?? source.isDeliveryAvailable ?? undefined,
        turoGo: source.turoGo ?? undefined,
        location: source.location || source.address || undefined,
        photos: (source.photos || source.images || []).map((p) => ({
          url: p.url || p.imageUrl || p.resizableUrl || p,
          type: p.type || undefined,
        })),
        host: {
          id: source.owner?.id || source.host?.id || undefined,
          name: source.owner?.name || source.host?.name || undefined,
          rating: source.owner?.rating || source.host?.rating || undefined,
        },
        rawType: raw.listing ? "root.listing" : raw.result ? "root.result" : "root",
      };
    } catch (e) {
      console.warn(`${PREFIX} extractListingData error:`, e);
      return raw;
    }
  }

  // ════════════════════════════════════════════════
  // Helper: extract availability/calendar data
  // ════════════════════════════════════════════════
  function extractAvailabilityData(raw) {
    if (!raw || typeof raw !== "object") return raw;

    try {
      const bookings = raw.calendar?.bookedDays || raw.bookedDays || raw.unavailableDays || [];
      const available = raw.calendar?.availableDays || raw.availableDays || [];

      return {
        bookedDates: Array.isArray(bookings)
          ? bookings.map((b) => (typeof b === "string" ? b : b.date || b.startDate))
          : [],
        availableDates: Array.isArray(available)
          ? available.map((a) => (typeof a === "string" ? a : a.date || a.startDate))
          : [],
        raw: raw,
      };
    } catch (e) {
      return raw;
    }
  }

  // ════════════════════════════════════════════════
  // Helper: extract search results (list of cars)
  // ════════════════════════════════════════════════
  function extractSearchData(raw) {
    if (!raw || typeof raw !== "object") return raw;

    try {
      const list =
        raw.listings || raw.results || raw.data?.listings || raw.data || [];

      if (!Array.isArray(list)) return raw;

      const cars = list.map((item) => ({
        id: item.id || undefined,
        make: item.vehicle?.make || item.make || undefined,
        model: item.vehicle?.model || item.model || undefined,
        year: item.vehicle?.year || item.year || undefined,
        price: item.price || item.dailyPrice || item.rate?.amount || undefined,
        rating: item.rating || item.ratingAverage || undefined,
        location: item.location || item.address || undefined,
        distance: item.distance || undefined,
      }));

      return {
        totalResults: raw.totalCount || raw.total || cars.length,
        cars: cars,
      };
    } catch (e) {
      return raw;
    }
  }

  // ════════════════════════════════════════════════
  // Helper: process parsed JSON response
  // ════════════════════════════════════════════════
  function processResponse(url, json) {
    const captureType = classifyUrl(url);
    if (!captureType) return;

    let extracted;
    switch (captureType) {
      case "listing":
        extracted = extractListingData(json);
        break;
      case "availability":
        extracted = extractAvailabilityData(json);
        break;
      case "search":
        extracted = extractSearchData(json);
        break;
      default:
        extracted = json;
    }

    sendCapture(url, captureType, extracted);
  }

  // ════════════════════════════════════════════════
  // ══ FETCH MONKEY-PATCH ══════════════════════════
  // ════════════════════════════════════════════════
  const originalFetch = window.fetch;

  window.fetch = function (...args) {
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";

    // Log ALL intercepted URLs
    console.log(`${PREFIX} fetch →`, url);

    // Call original fetch normally
    const fetchPromise = originalFetch.apply(this, args);

    // Only intercept if it's a Turo API call we care about
    if (url && classifyUrl(url)) {
      fetchPromise
        .then((response) => {
          // Clone the response so we don't consume the original stream
          const cloned = response.clone();
          cloned
            .json()
            .then((json) => {
              processResponse(url, json);
            })
            .catch(() => {
              // Not JSON or parse error — silently skip
            });
        })
        .catch(() => {
          // Network error — don't care
        });
    }

    // Return the ORIGINAL promise (not our chained one)
    return fetchPromise;
  };

  // ════════════════════════════════════════════════
  // ══ XMLHttpRequest MONKEY-PATCH ══════════════════
  // ════════════════════════════════════════════════
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    // Store the URL on the XHR instance for later use
    this.__lightningUrl = url || "";
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const url = this.__lightningUrl || "";

    // Log ALL intercepted URLs
    console.log(`${PREFIX} XHR →`, url);

    if (url && classifyUrl(url)) {
      // Listen for the response
      this.addEventListener(
        "load",
        function () {
          try {
            const contentType = this.getResponseHeader("content-type") || "";
            if (contentType.includes("application/json") || contentType.includes("text/plain")) {
              let json;
              try {
                json = JSON.parse(this.responseText);
              } catch {
                return; // Not valid JSON — skip
              }
              processResponse(url, json);
            }
          } catch (e) {
            console.warn(`${PREFIX} XHR processing error:`, e);
          }
        },
        { passive: true }
      );
    }

    // Call original send normally
    return originalSend.call(this, body);
  };

  console.log(`${PREFIX} Content script loaded — fetch/XHR interception active`);
})();
