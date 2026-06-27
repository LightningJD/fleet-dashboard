import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const report = JSON.parse(await readFile(new URL('intelligence-report.json', root), 'utf8'));
const snapshots = JSON.parse(await readFile(new URL('market-snapshots.json', root), 'utf8'));

function median(values) {
  const nums = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function money(value) {
  return Number.isFinite(value) ? `$${Math.round(value)}` : 'unavailable';
}

function ageHours(dateString) {
  const time = new Date(dateString).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.round(((Date.now() - time) / (1000 * 60 * 60)) * 10) / 10;
}

const primarySegment = snapshots.segments?.find(segment => segment.id === 'tesla_model_3_las_vegas') || snapshots.segments?.[0];
const prices = (primarySegment?.listings || []).map(listing => listing.currentPrice).filter(Number.isFinite);
const snapshotMedian = median(prices);
const snapshotAge = ageHours(snapshots.generatedAt);

report.marketSnapshot = {
  status: snapshotMedian ? 'ok' : 'missing_valid_prices',
  generatedAt: snapshots.generatedAt,
  ageHours: snapshotAge,
  segmentId: primarySegment?.id || null,
  segmentLabel: primarySegment?.label || null,
  listingCount: primarySegment?.listings?.length || 0,
  successfulListings: prices.length,
  medianCurrentPrice: snapshotMedian,
  collector: snapshots.collector || null
};

if (snapshotMedian && report.marketAnalysis) {
  report.marketAnalysis.market = report.marketAnalysis.market || {};
  report.marketAnalysis.market.snapshotMedian = snapshotMedian;
  report.marketAnalysis.snapshot = report.marketSnapshot;
  report.marketAnalysis.caveat = `Uses latest market snapshot median: ${money(snapshotMedian)} from ${prices.length} verified entries.`;

  const currentWeekday = report.marketAnalysis.current?.weekday;
  const currentWeekend = report.marketAnalysis.current?.weekend;
  if (Number.isFinite(currentWeekday)) {
    report.marketAnalysis.gaps.weekdayGapPercent = Math.round(((snapshotMedian - currentWeekday) / snapshotMedian) * 100);
  }
  if (Number.isFinite(currentWeekend)) {
    report.marketAnalysis.gaps.weekendGapPercent = Math.round(((snapshotMedian - currentWeekend) / snapshotMedian) * 100);
  }

  const notes = report.marketAnalysis.recommendations?.summary || [];
  report.marketAnalysis.recommendations.summary = [
    `Market snapshot active: ${prices.length} entries, median current price ${money(snapshotMedian)}, age ${snapshotAge}h.`,
    ...notes.filter(note => !String(note).startsWith('Market snapshot'))
  ];
}

report.dashboardStatus = report.dashboardStatus || {};
report.dashboardStatus.marketSnapshot = report.marketSnapshot.status;
report.dashboardStatus.dataFreshness = 'data.json, events.json, and market-snapshots.json feed the dashboard report.';

await writeFile(new URL('intelligence-report.json', root), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Merged market snapshot status: ${report.marketSnapshot.status}`);
