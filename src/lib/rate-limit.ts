import "server-only";

// In-memory limits for the public demo (one server process). They protect the
// Qloo and LLM quotas from casual abuse; they are not a security boundary.
const PER_IP = Number(process.env.RATE_LIMIT_PER_HOUR ?? 12);
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_PLANS ?? 4);
const HOUR = 60 * 60 * 1000;

const hits = new Map<string, number[]>();
let running = 0;

export function allow(ip: string): { ok: true; release: () => void } | { ok: false; reason: string } {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < HOUR);
  if (recent.length >= PER_IP) {
    return { ok: false, reason: "Too many session cards from this connection. Please try again later." };
  }
  if (running >= MAX_CONCURRENT) {
    return { ok: false, reason: "Encore is busy right now. Please try again in a minute." };
  }
  recent.push(now);
  hits.set(ip, recent);
  running++;
  let released = false;
  return {
    ok: true,
    release: () => {
      if (!released) {
        released = true;
        running--;
      }
    },
  };
}
