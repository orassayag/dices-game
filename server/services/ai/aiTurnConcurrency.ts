// In-memory per-instance concurrency guards for AI turns (plan_v6.md §9, I2). Single-
// flight claim prevents two concurrent ai-turn requests for the SAME (gameId,
// expectedVersion) from both billing a live provider call; the bounded semaphore caps
// how many provider calls can be in flight across ALL games at once. Both must be
// released only when the underlying provider promise actually SETTLES — never when a
// deadline race ends — via `resolveAiDecision`'s `onProviderSettled` hook, so a hung call
// can never let a second request slip through while it's still running.
//
// Documented single-instance assumption: a multi-instance deployment would need this
// keyed in a shared store (e.g. Redis) instead — out of scope here (plan_v6.md §Scope).

const AI_PROVIDER_CONCURRENCY_LIMIT: number = 4;

export type AiTurnClaimResult = 'acquired' | 'alreadyInProgress';

const inFlightClaims = new Set<string>();

function claimKey(gameId: string, expectedVersion: number): string {
  return `${gameId}:${expectedVersion}`;
}

// Callers that get 'alreadyInProgress' must NOT call a provider — they should refetch
// state instead (the loser path described in §9).
export function claimAiTurn(gameId: string, expectedVersion: number): AiTurnClaimResult {
  const key = claimKey(gameId, expectedVersion);
  if (inFlightClaims.has(key)) {
    return 'alreadyInProgress';
  }
  inFlightClaims.add(key);
  return 'acquired';
}

// Releases a claim taken by `claimAiTurn`. Must be called from the SAME provider
// promise's real-settlement hook that was raced against the deadline — never from the
// deadline race's own resolution (I2).
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

// Production singleton — stage 10's ai-turn route wires resolveAiDecision's
// onProviderSettled hook to release both this and a claim taken via claimAiTurn above.
export const aiProviderSemaphore = new AiProviderSemaphore();
