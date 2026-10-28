import "server-only";
import * as claude from "./agent-claude";
import * as qwen from "./agent-qwen";

// LLM_PROVIDER=qwen (default) or claude. Both run the same two steps with the
// same prompts and the same Qloo tools, so they can be compared directly.
export type Provider = "qwen" | "claude";

export function provider(): Provider {
  return process.env.LLM_PROVIDER === "claude" ? "claude" : "qwen";
}

export function providerReady(): boolean {
  return provider() === "claude" ? Boolean(process.env.ANTHROPIC_API_KEY) : Boolean(process.env.HETZNER_API_KEY);
}

export const agent = () => (provider() === "claude" ? claude : qwen);
