import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { callQloo, qlooTools } from "./qloo";
import { SessionCard, type MemorySlot, type PublicProfile } from "./profile";
import { CARD_SYSTEM, RESEARCH_SYSTEM, cardInput, researchInput, type Research } from "./prompts";

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 12;

let client: Anthropic | null = null;
const claude = () => (client ??= new Anthropic());

// Research: Claude + Qloo tools, seeing only the public profile.
export async function research(profile: PublicProfile): Promise<Research> {
  const trace: string[] = [];
  const tools: Anthropic.Beta.BetaTool[] = (await qlooTools()).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
  }));
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: researchInput(profile) }];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await claude().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: RESEARCH_SYSTEM,
      tools,
      messages,
    });

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
      return { notes, trace };
    }

    messages.push({ role: "assistant", content: response.content });
    const results = await Promise.all(
      toolUses.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        trace.push(`${t.name} ${JSON.stringify(t.input)}`);
        try {
          const { text, isError } = await callQloo(t.name, t.input);
          return { type: "tool_result", tool_use_id: t.id, content: text, is_error: isError };
        } catch (err) {
          return { type: "tool_result", tool_use_id: t.id, content: String(err), is_error: true };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }
  throw new Error(`research did not finish within ${MAX_TOOL_ROUNDS} tool rounds`);
}

// Session card: no tools, no memory book contents (placeholders only).
export async function composeCard(
  profile: PublicProfile,
  notes: string,
  slots: MemorySlot[],
): Promise<SessionCard> {
  const response = await claude().messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(SessionCard) },
    system: CARD_SYSTEM,
    messages: [{ role: "user", content: cardInput(profile, notes, slots) }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error("session card could not be written");
  }
  return response.parsed_output;
}
