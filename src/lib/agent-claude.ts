import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { callQloo, qlooTools } from "./qloo";
import { SessionCard, type Language, type MemorySlot, type PublicProfile } from "./profile";
import {
  CARD_SYSTEM,
  MIN_QLOO_CALLS,
  REPEATED_CALL,
  ResearchBudget,
  RESEARCH_SYSTEM,
  WRAP_UP,
  cardInput,
  researchInput,
  type OnQlooCall,
  type Research,
} from "./prompts";

const MAX_TOOL_ROUNDS = 12;

let client: Anthropic | null = null;
const claude = () => (client ??= new Anthropic());

// Research: Claude + Qloo tools, seeing only the public profile.
async function research(
  model: string,
  profile: PublicProfile,
  onCall?: OnQlooCall,
  signal?: AbortSignal,
): Promise<Research> {
  const trace: string[] = [];
  const tools: Anthropic.Beta.BetaTool[] = (await qlooTools()).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
  }));
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: researchInput(profile) }];
  const evidence: string[] = [];
  const budget = new ResearchBudget();

  for (let round = 0; round < MAX_TOOL_ROUNDS && !budget.exhausted; round++) {
    signal?.throwIfAborted();
    const response = await claude().beta.messages.create({
      model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: RESEARCH_SYSTEM,
      tools,
      messages,
    }, { signal });

    if (response.stop_reason === "refusal") throw new Error("research step was declined");
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );
    if (toolUses.length === 0) {
      const notes = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const nudge = budget.beforeFinish();
      if (!nudge) return { notes, trace, evidence };
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: nudge });
      continue;
    }

    messages.push({ role: "assistant", content: response.content });
    const results = await Promise.all(
      toolUses.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        const key = `${t.name} ${JSON.stringify(t.input)}`;
        // Repeats still count toward the budget (so a loop ends) but do not hit Qloo again.
        const repeat = trace.includes(key);
        trace.push(key);
        budget.record(t.name);
        if (repeat) return { type: "tool_result", tool_use_id: t.id, content: REPEATED_CALL, is_error: true };
        onCall?.(t.name, t.input, evidence);
        try {
          const { text, isError } = await callQloo(t.name, t.input);
          if (!isError) evidence.push(text);
          return { type: "tool_result", tool_use_id: t.id, content: text, is_error: isError };
        } catch (err) {
          return { type: "tool_result", tool_use_id: t.id, content: String(err), is_error: true };
        }
      }),
    );
    const nudge = budget.afterRound();
    messages.push({ role: "user", content: nudge ? [...results, { type: "text", text: nudge }] : results });
  }

  // Call budget (or round limit) reached: one last request with tools switched
  // off (they stay declared because the history uses them), so it must write the
  // notes from what Qloo has returned so far.
  if (budget.calls < MIN_QLOO_CALLS) throw new Error(`research made only ${budget.calls} Qloo calls`);
  const last = messages[messages.length - 1];
  if (last.role === "user" && Array.isArray(last.content)) {
    last.content = [...last.content, { type: "text", text: WRAP_UP }];
  }
  const final = await claude().beta.messages.create({
    model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system: RESEARCH_SYSTEM,
    tools,
    tool_choice: { type: "none" },
    messages,
  }, { signal });
  if (final.stop_reason === "refusal") throw new Error("research step was declined");
  const notes = final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return { notes, trace, evidence };
}

// Session card: no tools, no memory book contents (placeholders only).
async function composeCard(
  model: string,
  profile: PublicProfile,
  notes: string,
  slots: MemorySlot[],
  language: Language = "en",
  signal?: AbortSignal,
): Promise<SessionCard> {
  const response = await claude().messages.parse({
    model,
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(SessionCard) },
    system: CARD_SYSTEM,
    messages: [{ role: "user", content: cardInput(profile, notes, slots, language) }],
  }, { signal });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error("session card could not be written");
  }
  return response.parsed_output;
}

// One Claude model (for example claude-sonnet-5-5 or claude-opus-5-5) as an agent.
export function claudeAgent(model: string) {
  return {
    research: (profile: PublicProfile, onCall?: OnQlooCall, signal?: AbortSignal) =>
      research(model, profile, onCall, signal),
    composeCard: (
      profile: PublicProfile,
      notes: string,
      slots: MemorySlot[],
      language: Language = "en",
      signal?: AbortSignal,
    ) => composeCard(model, profile, notes, slots, language, signal),
  };
}
