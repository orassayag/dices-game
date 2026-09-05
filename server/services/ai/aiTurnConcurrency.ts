// In-memory, per-instance only — a multi-instance deployment would need this keyed in a
// shared store (e.g. Redis) instead. Both the claim and the semaphore below must be
// released only when the underlying provider promise actually SETTLES, never when a
// deadline race ends (see resolveAiDecision's onProviderSettled hook), so a hung call
// can never let a second request slip through while it's still running.

const AI_PROVIDER_CONCURRENCY_LIMIT: number = 4;

export type AiTurnClaimResult = 'acquired' | 'alreadyInProgress';

const inFlightClaims = new Set<string>();

function claimKey(gameId: string, expectedVersion: number): string {
  return `${gameId}:${expectedVersion}`;
}

// Callers that get 'alreadyInProgress' must NOT call a provider — they should refetch
// state instead.
export function claimAiTurn(gameId: string, expectedVersion: number): AiTurnClaimResult {
  const key = claimKey(gameId, expectedVersion);
  if (inFlightClaims.has(key)) {
    return 'alreadyInProgress';
  }
  inFlightClaims.add(key);
  return 'acquired';
}

// Must be called from the SAME provider promise's real-settlement hook that was raced
// against the deadline — never from the deadline race's own resolution.
export function releaseAiTurnClaim(gameId: string, expectedVersion: number): void {
  inFlightClaims.delete(claimKey(gameId, expectedVersion));
}

export class AiProviderSemaphore {
  private activeCount: number = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit: number = AI_PROVIDER_CONCURRENCY_LIMIT) {}

  public async acquire(): Promise<void> {
    if (this.activeCount < this.limit) {
      this.activeCount += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.activeCount += 1;
  }

  public release(): void {
    this.activeCount -= 1;
    const next = this.waiters.shift();
    if (next) {
      next();
    }
  }

  public get inFlightCount(): number {
    return this.activeCount;
  }
}

export const aiProviderSemaphore = new AiProviderSemaphore();
