describe('Billing AI credit limits (smoke)', () => {
  function currentAiCreditsPeriodKey(date = new Date()) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  function resolveAiCreditLimit(metadata: Record<string, string | undefined>) {
    const raw = metadata.ai_credits_monthly ?? metadata.aiCreditsMonthly;
    if (raw == null || raw === '') return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function canConsume(
    used: number,
    limit: number | null,
    amount: number,
  ): boolean {
    if (limit == null) return true;
    return used + amount <= limit;
  }

  it('builds a stable monthly period key', () => {
    expect(currentAiCreditsPeriodKey(new Date('2026-07-10T12:00:00Z'))).toBe(
      '2026-07',
    );
  });

  it('reads AI credit limits from product metadata', () => {
    expect(resolveAiCreditLimit({ ai_credits_monthly: '2000' })).toBe(2000);
    expect(resolveAiCreditLimit({})).toBeNull();
  });

  it('blocks consumption when the monthly AI credit cap is exceeded', () => {
    expect(canConsume(1999, 2000, 1)).toBe(true);
    expect(canConsume(2000, 2000, 1)).toBe(false);
    expect(canConsume(5000, null, 1)).toBe(true);
  });
});
