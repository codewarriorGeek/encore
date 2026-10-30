import "server-only";
import dns from "node:dns";
import OpenAI from "openai";
import { z } from "zod";
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

// Qwen on Hetzner Inference (OpenAI-compatible). Experimental service, no SLA:
// base URL and model come from env so we can switch providers.
const MODEL = process.env.LLM_MODEL ?? "Qwen/Qwen3.6-35B-A3B";
const MAX_TOOL_ROUNDS = 12;
// Qwen thinks by default; off is faster. QWEN_THINKING=true to compare.
const THINKING = { chat_template_kwargs: { enable_thinking: process.env.QWEN_THINKING === "true" } };

// IPv6 to inference.hetzner.com stalls in the TLS handshake on some networks.
dns.setDefaultResultOrder("ipv4first");

let client: OpenAI | null = null;
const qwen = () =>
  (client ??= new OpenAI({
    apiKey: process.env.HETZNER_API_KEY,
    baseURL: process.env.LLM_BASE_URL ?? "https://inference.hetzner.com/api/v1",
    // A stuck call should fail fast rather than hold the caregiver for minutes.
    timeout: 45_000,
    maxRetries: 1,
  }));

// Research: Qwen + Qloo tools, seeing only the public profile.
export async function research(
  profile: PublicProfile,
  onCall?: OnQlooCall,
  signal?: AbortSignal,
): Promise<Research> {
  const trace: string[] = [];
  const tools: OpenAI.Chat.ChatCompletionFunctionTool[] = (await qlooTools()).map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: RESEARCH_SYSTEM },
    { role: "user", content: researchInput(profile) },
  ];

  const evidence: string[] = [];
  const budget = new ResearchBudget();

  for (let round = 0; round < MAX_TOOL_ROUNDS && !budget.exhausted; round++) {
    signal?.throwIfAborted();
    const response = await qwen().chat.completions.create({
      model: MODEL,
      max_tokens: 4000,
      tools,
      messages,
      ...THINKING,
    }, { signal });
    const message = response.choices[0]?.message;
    if (!message) throw new Error("empty response from Qwen");

    const calls = (message.tool_calls ?? []).filter(
      (c): c is OpenAI.Chat.ChatCompletionMessageFunctionToolCall => c.type === "function",
    );
    if (calls.length === 0) {
      const nudge = budget.beforeFinish();
      if (!nudge) return { notes: message.content ?? "", trace, evidence };
      messages.push({ role: "assistant", content: message.content ?? "" });
      messages.push({ role: "user", content: nudge });
      continue;
    }

    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: calls });
    const results = await Promise.all(
      calls.map(async (c): Promise<OpenAI.Chat.ChatCompletionToolMessageParam> => {
        const key = `${c.function.name} ${c.function.arguments}`;
        // Repeats still count toward the budget (so a loop ends) but do not hit Qloo again.
        const repeat = trace.includes(key);
        trace.push(key);
        budget.record(c.function.name);
        if (repeat) return { role: "tool", tool_call_id: c.id, content: REPEATED_CALL };
        let content: string;
        try {
          const args = JSON.parse(c.function.arguments || "{}");
          onCall?.(c.function.name, args, evidence);
          const result = await callQloo(c.function.name, args);
          content = result.text;
          if (!result.isError) evidence.push(content);
        } catch (err) {
          content = JSON.stringify({ status: "error", summary: String(err) });
        }
        return { role: "tool", tool_call_id: c.id, content };
      }),
    );
    messages.push(...results);
    const nudge = budget.afterRound();
    if (nudge) messages.push({ role: "user", content: nudge });
  }

  // Call budget (or round limit) reached: one last request with no tools, so it
  // must write the notes from what Qloo has returned so far.
  if (budget.calls < MIN_QLOO_CALLS) throw new Error(`research made only ${budget.calls} Qloo calls`);
  const final = await qwen().chat.completions.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [...messages, { role: "user", content: WRAP_UP }],
    ...THINKING,
  }, { signal });
  return { notes: final.choices[0]?.message?.content ?? "", trace, evidence };
}

// Session card: no tools, no memory book contents (placeholders only).
export async function composeCard(
  profile: PublicProfile,
  notes: string,
  slots: MemorySlot[],
  language: Language = "en",
  signal?: AbortSignal,
): Promise<SessionCard> {
  const response = await qwen().chat.completions.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [
      { role: "system", content: CARD_SYSTEM },
      { role: "user", content: cardInput(profile, notes, slots, language) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "session_card", schema: z.toJSONSchema(SessionCard), strict: true },
    },
    ...THINKING,
  }, { signal });
  const parsed = SessionCard.safeParse(JSON.parse(response.choices[0]?.message?.content ?? "null"));
  if (!parsed.success) throw new Error("session card did not match the schema");
  return parsed.data;
}
