import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildApiKeyUsageCompositeKey,
  lookupApiKeyUsageEntry,
  mergeApiKeyUsageEntries,
  resolveStatusBarPreferApiKeyUsage,
} from './apiKeyUsageLookup.ts';

const sampleBuckets = Array.from({ length: 20 }, (_, i) => ({
  time: `t${i}`,
  success: i === 18 ? 5 : 0,
  failed: 0,
}));

test('lookupApiKeyUsageEntry matches normalized base_url|api_key', () => {
  const map = {
    jellyfish: {
      'https://newapi.medu.chat/v1|sk-abc': {
        success: 10,
        failed: 1,
        recent_requests: sampleBuckets,
      },
    },
  };

  const entry = lookupApiKeyUsageEntry(
    map,
    'Jellyfish',
    'https://newapi.medu.chat/v1/',
    'sk-abc'
  );
  assert.ok(entry);
  assert.equal(entry.success, 10);
  assert.equal(entry.failed, 1);
});

test('lookupApiKeyUsageEntry falls back to unique api_key suffix', () => {
  const map = {
    claude: {
      'https://api.anthropic.com|sk-unique': {
        success: 3,
        failed: 0,
        recent_requests: sampleBuckets,
      },
    },
  };
  const entry = lookupApiKeyUsageEntry(map, 'claude', 'https://other.example', 'sk-unique');
  assert.ok(entry);
  assert.equal(entry.success, 3);
});

test('mergeApiKeyUsageEntries sums buckets right-aligned', () => {
  const a = {
    success: 2,
    failed: 0,
    recent_requests: [
      { time: 'a', success: 1, failed: 0 },
      { time: 'b', success: 1, failed: 0 },
    ],
  };
  const b = {
    success: 3,
    failed: 1,
    recent_requests: [
      { time: 'a', success: 2, failed: 0 },
      { time: 'b', success: 1, failed: 1 },
    ],
  };
  const merged = mergeApiKeyUsageEntries([a, b]);
  assert.equal(merged.success, 5);
  assert.equal(merged.failed, 1);
  assert.equal(merged.recent_requests[0].success, 3);
  assert.equal(merged.recent_requests[1].failed, 1);
});

test('resolveStatusBarPreferApiKeyUsage uses recent_requests', () => {
  const map = {
    jellyfish: {
      [buildApiKeyUsageCompositeKey('https://newapi.medu.chat/v1', 'sk-abc')]: {
        success: 344,
        failed: 1,
        recent_requests: sampleBuckets,
      },
    },
  };

  const status = resolveStatusBarPreferApiKeyUsage({
    usageMap: map,
    provider: 'jellyfish',
    baseUrl: 'https://newapi.medu.chat/v1',
    apiKey: 'sk-abc',
  });

  assert.ok(status);
  assert.equal(status.totalSuccess, 5);
  assert.equal(status.blocks[18], 'success');
  assert.equal(status.successRate, 100);
});

test('resolveStatusBarPreferApiKeyUsage merges multi-key entries', () => {
  const map = {
    jellyfish: {
      'https://api.example/v1|sk-1': {
        success: 2,
        failed: 0,
        recent_requests: sampleBuckets.map((b, i) =>
          i === 19 ? { ...b, success: 2 } : { ...b, success: 0 }
        ),
      },
      'https://api.example/v1|sk-2': {
        success: 3,
        failed: 1,
        recent_requests: sampleBuckets.map((b, i) =>
          i === 19 ? { ...b, success: 1, failed: 1 } : { ...b, success: 0 }
        ),
      },
    },
  };

  const status = resolveStatusBarPreferApiKeyUsage({
    usageMap: map,
    provider: 'jellyfish',
    baseUrl: 'https://api.example/v1',
    entries: [
      { apiKey: 'sk-1' },
      { apiKey: 'sk-2' },
    ],
  });

  assert.ok(status);
  assert.equal(status.totalSuccess, 3);
  assert.equal(status.totalFailure, 1);
  assert.equal(status.blocks[19], 'mixed');
});

test('resolveStatusBarPreferApiKeyUsage returns null when missing', () => {
  const status = resolveStatusBarPreferApiKeyUsage({
    usageMap: {},
    provider: 'claude',
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'missing',
  });
  assert.equal(status, null);
});
