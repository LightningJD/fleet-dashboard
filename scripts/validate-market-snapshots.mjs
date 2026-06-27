import { readFile } from 'node:fs/promises';

const errors = [];
const warnings = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function warn(condition, message) {
  if (!condition) warnings.push(message);
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function ageHours(dateString) {
  const time = new Date(dateString).getTime();
  if (!Number.isFinite(time)) return Infinity;
  return (Date.now() - time) / (1000 * 60 * 60);
}

const snapshots = JSON.parse(await readFile(new URL('../market-snapshots.json', import.meta.url), 'utf8'));

assert(snapshots.generatedAt, 'market-snapshots.generatedAt is required');
assert(snapshots.collector, 'market-snapshots.collector is required');
assert(Array.isArray(snapshots.segments), 'market-snapshots.segments must be an array');
warn(ageHours(snapshots.generatedAt) <= 72, 'market-snapshots.json is older than 72 hours');

for (const segment of snapshots.segments || []) {
  assert(segment.id, 'market segment missing id');
  assert(segment.label, `market segment ${segment.id || '(unknown)'} missing label`);
  assert(Array.isArray(segment.listings), `market segment ${segment.id || '(unknown)'} listings must be an array`);

  for (const listing of segment.listings || []) {
    assert(listing.title, `listing in ${segment.id} missing title`);
    assert(listing.observedAt, `listing ${listing.title || '(unknown)'} missing observedAt`);
    assert(isNumber(listing.currentPrice), `listing ${listing.title || '(unknown)'} currentPrice must be numeric`);
    assert(listing.currentPrice > 0 && listing.currentPrice < 1000, `listing ${listing.title || '(unknown)'} currentPrice is outside expected range`);
    warn(ageHours(listing.observedAt) <= 72, `listing ${listing.title || '(unknown)'} snapshot is older than 72 hours`);
    if (listing.rating !== null && listing.rating !== undefined) {
      assert(isNumber(listing.rating) && listing.rating >= 1 && listing.rating <= 5, `listing ${listing.title || '(unknown)'} rating must be 1-5`);
    }
  }
}

if (warnings.length) {
  console.log('\nMarket snapshot warnings:');
  for (const item of warnings) console.log(`- ${item}`);
}

if (errors.length) {
  console.error('\nMarket snapshot validation failed:');
  for (const item of errors) console.error(`- ${item}`);
  process.exit(1);
}

console.log('Market snapshot validation passed.');
