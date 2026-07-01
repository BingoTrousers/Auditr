// Simple in-memory, per-IP fixed-window rate limiter.
//
// NOTE: This store is a module-level Map, which lives only in the memory of
// a single running server process. On serverless platforms it will reset on
// cold starts, redeploys, or when requests land on a different instance.
// That's an acceptable tradeoff for this low-traffic, no-database tool —
// it's a best-effort throttle, not a strict security boundary.

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;

const requestLog = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const timestamps = (requestLog.get(ip) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldestInWindow = timestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldestInWindow + WINDOW_MS - now) / 1000));
    requestLog.set(ip, timestamps);
    return { allowed: false, retryAfterSeconds };
  }

  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return { allowed: true };
}
