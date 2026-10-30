import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { chain } from "@/lib/agent";
import { PlanRequest, SessionCard } from "@/lib/profile";
import { BASELINE_SYSTEM, baselineInput } from "@/lib/prompts";
import { allow } from "@/lib/rate-limit";

// "Without Qloo" card for the live comparison: the first Claude model in the
// chain, the same card instructions and profile, and no Qloo research.
const MAX_BODY_BYTES = 32 * 1024;
let client: Anthropic | null = null;

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "local";
  const body = await request.text().catch(() => "");
  if (body.length > MAX_BODY_BYTES) return Response.json({ error: "request too large" }, { status: 413 });
  const parsed = PlanRequest.safeParse((() => {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  })());
  if (!parsed.success) return Response.json({ error: "invalid request" }, { status: 400 });
  const model = chain().find((p) => p.startsWith("claude-"));
  if (!model) return Response.json({ error: "comparison is not available right now" }, { status: 503 });

  const limit = allow(`baseline:${ip}`);
  if (!limit.ok) return Response.json({ error: limit.reason }, { status: 429 });
  try {
    const { profile, memorySlots, language } = parsed.data;
    const response = await (client ??= new Anthropic()).messages.parse({
      model,
      max_tokens: 16000,
      output_config: { effort: "low", format: zodOutputFormat(SessionCard) },
      system: BASELINE_SYSTEM,
      messages: [{ role: "user", content: baselineInput(profile, memorySlots, language) }],
    });
    if (!response.parsed_output) throw new Error("no card");
    console.log(JSON.stringify({ baseline: "done", model, language }));
    return Response.json({ card: response.parsed_output });
  } catch (err) {
    console.error("baseline failed", err);
    return Response.json({ error: "could not build the comparison, please try again" }, { status: 502 });
  } finally {
    limit.release();
  }
}
