import "server-only";
import * as claude from "./agent-claude";
import * as qwen from "./agent-qwen";

// LLM_PROVIDER=claude or qwen picks the primary model; LLM_FALLBACK names a
// second one that takes over if the primary fails (an outage, a spend limit).
// Both run the same prompts and the same Qloo tools.
export type Provider = "qwen" | "claude";

const parse = (v: string | undefined): Provider | null => (v === "claude" ? "claude" : v === "qwen" ? "qwen" : null);

export function provider(): Provider {
  return parse(process.env.LLM_PROVIDER) ?? "qwen";
}

export function fallbackProvider(): Provider | null {
  const f = parse(process.env.LLM_FALLBACK);
  return f && f !== provider() && ready(f) ? f : null;
}

function ready(p: Provider): boolean {
  return p === "claude" ? Boolean(process.env.ANTHROPIC_API_KEY) : Boolean(process.env.HETZNER_API_KEY);
}

export function providerReady(): boolean {
  return ready(provider());
}

export const agentFor = (p: Provider) => (p === "claude" ? claude : qwen);
