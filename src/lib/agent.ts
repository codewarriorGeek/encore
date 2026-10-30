import "server-only";
import { claudeAgent } from "./agent-claude";
import * as qwen from "./agent-qwen";

// The models a card build tries, in order: if one fails (an outage, a spend
// limit, an error), the next takes over. Set LLM_CHAIN as a comma-separated
// list of Claude model ids and/or "qwen". All run the same prompts and Qloo tools.
export type Provider = string;

const DEFAULT_CHAIN = "claude-sonnet-5-5,claude-opus-5-5,qwen";

function ready(p: Provider): boolean {
  if (p === "qwen") return Boolean(process.env.HETZNER_API_KEY);
  return p.startsWith("claude-") && Boolean(process.env.ANTHROPIC_API_KEY);
}

export function chain(): Provider[] {
  const list = (process.env.LLM_CHAIN || DEFAULT_CHAIN)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return [...new Set(list)].filter(ready);
}

export function provider(): Provider {
  return chain()[0] ?? "none";
}

export function providerReady(): boolean {
  return chain().length > 0;
}

export const agentFor = (p: Provider) => (p === "qwen" ? qwen : claudeAgent(p));
