import { describe, expect, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18n from '@/i18n';
import { LOBSTERAI_CONFIG } from '@/components/quota';
import { QuotaProgressBar } from '@/features/authFiles/components/QuotaProgressBar';
import { formatQuotaResetDate } from '@/utils/quota';
import type { LobsterAIQuotaState } from '@/types';

// useQuotaStore is not touched by renderQuotaItems, so a plain class stand-in is
// enough for the style slots the renderer reads.
const styles = new Proxy({} as Record<string, string>, {
  get: (_target, key: string) => key,
});

const render = (quota: LobsterAIQuotaState): string =>
  renderToStaticMarkup(
    createElement(
      'div',
      null,
      LOBSTERAI_CONFIG.renderQuotaItems(quota, i18n.t, {
        styles,
        QuotaProgressBar,
      }) as ReactNode
    )
  );

// A free account: the quota endpoint reports the free grant's own counter
// (freeCreditsTotal), which the ledger already shows as the "free" bucket. The
// meter must attach to that bucket and never print the grant total, because a
// separate row both duplicated the balance and labelled the free grant as a
// plan the account does not have.
const freeSnapshot = (): LobsterAIQuotaState => ({
  status: 'success',
  creditsRemaining: 5297.72,
  cycleCreditsLimit: 300,
  cycleCreditsUsed: 50,
  planName: '',
  subscriptionStatus: 'free',
  items: [
    { type: 'free', label: '免费额度', creditsRemaining: 250 },
    { type: 'campaign', label: '活动赠送', creditsRemaining: 5047.72 },
  ],
});

// A paid account: the counter describes the subscription bucket.
const paidSnapshot = (): LobsterAIQuotaState => ({
  status: 'success',
  creditsRemaining: 5297.72,
  cycleCreditsLimit: 5000,
  cycleCreditsUsed: 200,
  planName: 'Standard',
  subscriptionStatus: 'active',
  items: [
    { type: 'subscription', label: '订阅积分', creditsRemaining: 4800 },
    { type: 'campaign', label: '活动赠送', creditsRemaining: 497.72 },
  ],
});

describe('LobsterAI quota card', () => {
  test('registers the provider and filters disabled credentials', () => {
    const file = { name: 'lobsterai.json', provider: 'lobsterai' };
    expect(LOBSTERAI_CONFIG.filterFn(file)).toBe(true);
    expect(LOBSTERAI_CONFIG.filterFn({ ...file, disabled: true })).toBe(false);
  });

  test('renders the ledger total and its bucket rows', () => {
    const markup = render(paidSnapshot());
    expect(markup).toContain(i18n.t('lobsterai_quota.total_remaining', { credits: '5297.72' }));
    expect(markup).toContain('Standard');
    expect(markup).toContain('订阅积分');
    expect(markup).toContain('4800');
    expect(markup).toContain('活动赠送');
    expect(markup).toContain('497.72');
  });

  test('free account: meter rides the free bucket and never prints the grant total', () => {
    const markup = render(freeSnapshot());
    // One bar, drawn against the free grant's own remainder (50 used of 300).
    expect(markup.match(/width:\d+%/g)).toEqual(['width:83%']);
    // The grant total must not surface anywhere on the card.
    expect(markup).not.toContain('300');
    // The bucket keeps showing its own authoritative remainder.
    expect(markup).toContain('250');
    expect(markup).toContain('5297.72');
  });

  test('paid account: meter rides the subscription bucket', () => {
    const markup = render(paidSnapshot());
    expect(markup.match(/width:\d+%/g)).toEqual(['width:96%']);
    // The campaign bucket carries no meter of its own.
    expect(markup.match(/role="meter"/g) ?? []).toHaveLength(0);
  });

  test('omits the bar when the upstream reports no cycle counter', () => {
    const quota = paidSnapshot();
    delete quota.cycleCreditsLimit;
    delete quota.cycleCreditsUsed;
    const markup = render(quota);
    expect(markup).not.toContain('width:');
    expect(markup).toContain('5297.72');
  });

  test('clamps a counter that reports more used than its limit', () => {
    const markup = render({ ...paidSnapshot(), cycleCreditsUsed: 6000 });
    expect(markup).toContain('width:0%');
  });

  test('skips the bar when the bucket and the counter disagree', () => {
    // The bucket reports more credits than the counter's whole limit, so the two
    // sources cannot both be right: the row keeps its number and the bar is
    // dropped rather than drawn against a value it does not describe.
    const quota = freeSnapshot();
    quota.items[0] = { type: 'free', label: '免费额度', creditsRemaining: 999 };
    const markup = render(quota);
    expect(markup).not.toContain('width:');
    expect(markup).toContain('999');
  });

  test('collapses repeated grants of one bucket into a single row', () => {
    // A daily check-in campaign credits the account once per day, each grant
    // carrying its own expiry. Thirty days must not become thirty rows.
    const quota = freeSnapshot();
    const dailyGrants = Array.from({ length: 30 }, (_, day) => ({
      type: 'bonus',
      label: '每日签到奖励',
      creditsRemaining: 10,
      expiresAt: `2026-10-${String(day + 1).padStart(2, '0')}T00:00:00Z`,
    }));
    quota.items = [...quota.items, ...dailyGrants];

    const markup = render(quota);
    // One row for the bucket, holding the summed amount.
    expect(markup.match(/每日签到奖励/g)).toHaveLength(1);
    expect(markup).toContain('300');
    // The soonest expiry is the deadline worth surfacing, not the last grant's.
    expect(markup).toContain(formatQuotaResetDate('2026-10-01T00:00:00Z'));
    expect(markup).not.toContain(formatQuotaResetDate('2026-10-30T00:00:00Z'));
  });

  test('keeps distinct bucket types as separate rows', () => {
    const quota = freeSnapshot();
    quota.items = [
      { type: 'free', label: '免费额度', creditsRemaining: 250 },
      { type: 'bonus', label: '每日签到奖励', creditsRemaining: 30, expiresAt: '2026-10-01T00:00:00Z' },
      { type: 'invitation', label: '邀请奖励', creditsRemaining: 15 },
    ];
    const markup = render(quota);
    expect(markup).toContain('免费额度');
    expect(markup).toContain('每日签到奖励');
    expect(markup).toContain('邀请奖励');
  });

  test('falls back to the bucket type when no label is provided', () => {
    const quota = paidSnapshot();
    quota.items = [{ type: 'bonus', creditsRemaining: 12 }];
    const markup = render(quota);
    expect(markup).toContain(i18n.t('lobsterai_quota.item_bonus'));
  });
});
