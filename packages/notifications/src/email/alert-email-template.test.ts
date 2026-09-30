import { describe, expect, it } from 'vitest';
import { type AlertEmailTemplateData, renderAlertEmail } from './alert-email-template.js';

const base: AlertEmailTemplateData = {
  origin: 'DOU',
  destination: 'GRU',
  departureDate: '2026-12-20',
  returnDate: null,
  currentAmountMinor: 97_000,
  currency: 'BRL',
  triggerType: 'PERCENTAGE_DROP',
  referenceAmountMinor: 120_000,
  observedAt: '2026-12-01T13:00:00Z',
  userTimezone: 'America/Sao_Paulo',
  unsubscribeUrl: 'https://example.com/watches/1/preferences',
};

describe('renderAlertEmail', () => {
  it('includes route, formatted price, and reference in the body', () => {
    const email = renderAlertEmail(base);
    expect(email.subject).toContain('DOU');
    expect(email.subject).toContain('GRU');
    expect(email.textBody).toContain('R$');
    expect(email.textBody).toContain('970,00');
    expect(email.textBody).toContain('1.200,00');
    expect(email.templateVersion).toBe(1);
  });

  it('omits the reference line when there is no reference amount', () => {
    const email = renderAlertEmail({ ...base, referenceAmountMinor: null });
    expect(email.textBody).not.toContain('Referência de comparação');
  });

  // SPEC-006 §4/AC-008: nunca afirmar "menor preço do mercado".
  it('never claims the lowest market price', () => {
    const email = renderAlertEmail({ ...base, triggerType: 'NEW_OBSERVED_LOW' });
    expect(email.textBody.toLowerCase()).not.toContain('mercado');
    expect(email.textBody).toContain(
      'novo menor preço observado desde o início deste monitoramento',
    );
  });

  it.each(['TARGET_PRICE', 'PERCENTAGE_DROP', 'ABSOLUTE_DROP', 'NEW_OBSERVED_LOW'] as const)(
    'renders a non-empty explanation for %s',
    (triggerType) => {
      const email = renderAlertEmail({ ...base, triggerType });
      expect(email.textBody.length).toBeGreaterThan(0);
    },
  );

  it('sanitizes newlines in route data instead of letting them break the layout', () => {
    const email = renderAlertEmail({ ...base, origin: 'DOU\nInjected' });
    expect(email.textBody).not.toContain('\nInjected');
  });

  it('includes the unsubscribe/preferences link', () => {
    const email = renderAlertEmail(base);
    expect(email.textBody).toContain(base.unsubscribeUrl);
  });
});
