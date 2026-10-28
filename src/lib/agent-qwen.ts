import "server-only";
import dns from "node:dns";
import OpenAI from "openai";
import { z } from "zod";
import { callQloo, qlooTools } from "./qloo";
import { SessionCard, type MemorySlot, type PublicProfile } from "./profile";
import { CARD_SYSTEM, RESEARCH_SYSTEM, cardInput, researchInput, type Research } from "./prompts";

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
    timeout: 60_000,
    maxRetries: 2,
  }));

// Research: Qwen + Qloo tools, seeing only the public profile.
export async function research(profile: PublicProfile): Promise<Research> {
  const trace: string[] = [];
  const tools: OpenAI.Chat.ChatCompletionFunctionTool[] = (await qlooTools()).map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: RESEARCH_SYSTEM },
    { role: "user", content: researchInput(profile) },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await qwen().chat.completions.create({
      model: MODEL,
      max_tokens: 4000,
      tools,
      messages,
      ...THINKING,
    });
    const message = response.choices[0]?.message;
    if (!message) throw new Error("empty response from Qwen");

    const calls = (message.tool_calls ?? []).filter(
      (c): c is OpenAI.Chat.ChatCompletionMessageFunctionToolCall => c.type === "function",
    );
    if (calls.length === 0) return { notes: message.content ?? "", trace };

    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: calls });
    const results = await Promise.all(
      calls.map(async (c): Promise<OpenAI.Chat.ChatCompletionToolMessageParam> => {
        trace.push(`${c.function.name} ${c.function.arguments}`);
        let content: string;
        try {
          content = (await callQloo(c.function.name, JSON.parse(c.function.arguments || "{}"))).text;
        } catch (err) {
          content = JSON.stringify({ status: "error", summary: String(err) });
        }
        return { role: "tool", tool_call_id: c.id, content };
      }),
    );
    messages.push(...results);
  }
  throw new Error(`research did not finish within ${MAX_TOOL_ROUNDS} tool rounds`);
}

// Session card: no tools, no memory book contents (placeholders only).
export async function composeCard(
  profile: PublicProfile,
  notes: string,
  slots: MemorySlot[],
): Promise<SessionCard> {
  const response = await qwen().chat.completions.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [
      { role: "system", content: CARD_SYSTEM },
      { role: "user", content: cardInput(profile, notes, slots) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "session_card", schema: z.toJSONSchema(SessionCard), strict: true },
    },
    ...THINKING,
  });
  const parsed = SessionCard.safeParse(JSON.parse(response.choices[0]?.message?.content ?? "null"));
  if (!parsed.success) throw new Error("session card did not match the schema");
  return parsed.data;
}
