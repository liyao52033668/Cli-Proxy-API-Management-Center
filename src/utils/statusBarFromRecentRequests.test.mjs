import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateStatusBarDataFromRecentRequests,
  extractRecentRequestBuckets,
  hasRecentRequestTraffic,
} from './statusBarFromRecentRequests.ts';

test('calculateStatusBarDataFromRecentRequests maps 20 buckets oldest-to-newest', () => {
  // mid of a 10-minute bucket
  const nowMs = Date.UTC(2026, 6, 18, 8, 25, 0);
  const buckets = Array.from({ length: 20 }, (_, i) => ({
    time: `b${i}`,
    success: i === 11 ? 31 : i === 12 ? 29 : 0,
    failed: 0,
  }));

  const result = calculateStatusBarDataFromRecentRequests(buckets, nowMs);

  assert.equal(result.blocks.length, 20);
  assert.equal(result.blockDetails.length, 20);
  assert.equal(result.totalSuccess, 60);
  assert.equal(result.totalFailure, 0);
  assert.equal(result.successRate, 100);
  assert.equal(result.blocks[11], 'success');
  assert.equal(result.blocks[12], 'success');
  assert.equal(result.blockDetails[11].success, 31);
  assert.equal(result.blockDetails[12].success, 29);
  assert.equal(result.blocks[0], 'idle');
  assert.equal(result.blockDetails[0].rate, -1);

  const blockDuration = 10 * 60 * 1000;
  const currentBucketStart = Math.floor(nowMs / blockDuration) * blockDuration;
  const windowStart = currentBucketStart - 19 * blockDuration;
  assert.equal(result.blockDetails[0].startTime, windowStart);
  assert.equal(result.blockDetails[19].startTime, currentBucketStart);
});

test('calculateStatusBarDataFromRecentRequests handles mixed success/failed fields', () => {
  const nowMs = 1_700_000_000_000;
  const buckets = [
    { time: 'a', success: 2, failed: 1 },
    { time: 'b', Success: 3, Failed: 0 },
    { time: 'c', success: 0, failure: 4 },
  ];

  const result = calculateStatusBarDataFromRecentRequests(buckets, nowMs);

  assert.equal(result.blocks.length, 20);
  // right-aligned: last 3 slots get the data
  assert.equal(result.blocks[17], 'mixed');
  assert.equal(result.blocks[18], 'success');
  assert.equal(result.blocks[19], 'failure');
  assert.equal(result.totalSuccess, 5);
  assert.equal(result.totalFailure, 5);
  assert.equal(result.successRate, 50);
});

test('extractRecentRequestBuckets prefers recent_requests on auth file item', () => {
  const file = {
    name: 'xai.json',
    recent_requests: [
      { time: '15:00-15:10', success: 1, failed: 0 },
      { time: '15:10-15:20', success: 2, failed: 1 },
    ],
  };

  const buckets = extractRecentRequestBuckets(file);
  assert.equal(buckets.length, 2);
  assert.equal(buckets[0].success, 1);
  assert.equal(buckets[1].failed, 1);
  assert.equal(hasRecentRequestTraffic(buckets), true);
});

test('extractRecentRequestBuckets returns empty when missing', () => {
  assert.deepEqual(extractRecentRequestBuckets({ name: 'a.json' }), []);
  assert.deepEqual(extractRecentRequestBuckets(null), []);
  assert.equal(hasRecentRequestTraffic([]), false);
});
