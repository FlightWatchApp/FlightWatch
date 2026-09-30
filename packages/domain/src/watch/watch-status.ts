export type WatchStatus = 'active' | 'paused' | 'completed' | 'expired' | 'cancelled';

export class InvalidWatchTransitionError extends Error {
  constructor(from: WatchStatus, to: WatchStatus) {
    super(`Cannot transition Watch from "${from}" to "${to}"`);
    this.name = 'InvalidWatchTransitionError';
  }
}

// Tabela de transições de DOMAIN.md §3.2. Estados terminais têm lista vazia (DR-016:
// estado terminal não retorna a ativo).
const ALLOWED_TRANSITIONS: Readonly<Record<WatchStatus, readonly WatchStatus[]>> = {
  active: ['paused', 'completed', 'expired', 'cancelled'],
  paused: ['active', 'expired', 'cancelled'],
  completed: [],
  expired: [],
  cancelled: [],
};

export function canTransitionWatchStatus(from: WatchStatus, to: WatchStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function transitionWatchStatus(from: WatchStatus, to: WatchStatus): WatchStatus {
  if (!canTransitionWatchStatus(from, to)) {
    throw new InvalidWatchTransitionError(from, to);
  }
  return to;
}

export function isTerminalWatchStatus(status: WatchStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}
