import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const sources = JSON.parse(await readFile(new URL('market-sources.json', root), 'utf8'));

function parseMoney(text) {
  if (!text) return null;
  const match = String(text).replace(/,/g, '').match(/\$\s?(\d+(?:\.\d{1,2})?)/);
  return match ? Number(match[1]) : null;
}

function median(values) {
  const nums = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return null;
  const middle = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[middle] : (nums[middle - 1] + nums[middle]) / 2;
}

function normalizeManualSeed(segment) {
  const listings = (segment.manualListings || []).map((listing, index) => ({
    sourceUrl: listing.sourceUrl || null,
    observedAt: new Date().toISOString(),
    segmentId: segment.id,
    segmentLabel: segment.label,
    vehicleSegment: segment.vehicleSegment,
    title: listing.title || `${segment.label} competitor ${index + 1}`,
    year: Number.isFinite(listing.year) ? listing.year : null,
    currentPrice: Number.isFinite(listing.currentPrice) ? listing.currentPrice : parseMoney(listing.priceText),
    tripCount: Number.isFinite(listing.tripCount) ? listing.tripCount : null,
    reviewCount: Number.isFinite(listing.reviewCount) ? listing.reviewCount : null,
    rating: Number.isFinite(listing.rating) ? listing.rating : null,
    extractionConfidence: 'manual_verified',
    extractionNotes: 'Imported from manually verified public market research entry.'
  }));

  return {
    id: segment.id,
    label: segment.label,
    vehicleSegment: segment.vehicleSegment,
    sourceType: segment.sourceType || 'manual_verified_public_research',
    observedAt: new Date().toISOString(),
    listings,
    summary: {
      listingCount: listings.length,
      successfulListings: listings.filter(l => Number.isFinite(l.currentPrice)).length,
      medianCurrentPrice: median(listings.map(l => l.currentPrice))
    }
  };
}

const startedAt = new Date();
const segments = (sources.segments || [])
  .filter(segment => segment.enabled)
  .map(normalizeManualSeed);
const finishedAt = new Date();
const totalListings = segments.reduce((sum, segment) => sum + segment.listings.length, 0);
const successfulListings = segments.reduce((sum, segment) => sum + segment.summary.successfulListings, 0);

const output = {
  generatedAt: finishedAt.toISOString(),
  collector: {
    mode: sources.policy?.mode || 'semi_automated_public_research_import',
    status: successfulListings > 0 ? 'ok' : 'needs_manual_market_entries',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationSeconds: Math.round((finishedAt - startedAt) / 1000),
    totalListings,
    successfulListings,
    sourceConfigUpdatedAt: sources.lastUpdated,
    message: successfulListings > 0
      ? `Imported ${successfulListings}/${totalListings} manually verified public market listings.`
      : 'No valid manual market listings found. Add manualListings to market-sources.json.'
  },
  segments
};

await writeFile(new URL('market-snapshots.json', root), `${JSON.stringify(output, null, 2)}\n`);
console.log(output.collector.message);
