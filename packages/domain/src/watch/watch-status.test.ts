import { describe, expect, it } from 'vitest';
import {
  InvalidWatchTransitionError,
  type WatchStatus,
  canTransitionWatchStatus,
  isTerminalWatchStatus,
  transitionWatchStatus,
} from './watch-status.js';

const ALL_STATUSES: WatchStatus[] = ['active', 'paused', 'completed', 'expired', 'cancelled'];

// Espelha exatamente a tabela de DOMAIN.md §3.2.
const EXPECTED_TRANSITIONS: Record<WatchStatus, WatchStatus[]> = {
  active: ['paused', 'completed', 'expired', 'cancelled'],
  paused: ['active', 'expired', 'cancelled'],
  completed: [],
  expired: [],
  cancelled: [],
};

describe('canTransitionWatchStatus', () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const expected = EXPECTED_TRANSITIONS[from].includes(to);
      it(`${from} -> ${to} is ${expected ? 'allowed' : 'denied'}`, () => {
        expect(canTransitionWatchStatus(from, to)).toBe(expected);
      });
    }
  }
});

describe('transitionWatchStatus', () => {
  it('returns the destination status when the transition is allowed', () => {
    expect(transitionWatchStatus('active', 'paused')).toBe('paused');
  });

  it('throws InvalidWatchTransitionError when the transition is denied', () => {
    expect(() => transitionWatchStatus('completed', 'active')).toThrow(InvalidWatchTransitionError);
  });

  // DR-016: estado terminal de Watch não pode retornar a ativo.
  it.each(['completed', 'expired', 'cancelled'] as const)(
    'never allows %s to become active again',
    (terminalStatus) => {
      expect(() => transitionWatchStatus(terminalStatus, 'active')).toThrow(
        InvalidWatchTransitionError,
      );
    },
  );
});

describe('isTerminalWatchStatus', () => {
  it.each(['completed', 'expired', 'cancelled'] as const)('%s is terminal', (status) => {
    expect(isTerminalWatchStatus(status)).toBe(true);
  });

  it.each(['active', 'paused'] as const)('%s is not terminal', (status) => {
    expect(isTerminalWatchStatus(status)).toBe(false);
  });
});
