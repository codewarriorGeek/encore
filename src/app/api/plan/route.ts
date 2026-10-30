import { agent, provider } from "@/lib/agent";
import { groundCard } from "@/lib/grounding";
import { PlanRequest } from "@/lib/profile";
import { allow } from "@/lib/rate-limit";

// Streams newline-delimited JSON events so the caregiver sees the real Qloo
// calls as they happen:
//   {"type":"call","tool":"qloo_describe","args":{...}}
//   {"type":"writing"}
//   {"type":"done","card":{...},"trace":[...],"dropped":[...],"provider":"qwen","timings":{...}}
//   {"type":"error","error":"..."}
export async function POST(request: Request) {
  // Apache appends the real client address last; earlier entries can be forged.
  const ip = request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "local";
  const limit = allow(ip);
  if (!limit.ok) {
    return Response.json({ error: limit.reason }, { status: 429 });
  }

  const parsed = PlanRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    limit.release();
    return Response.json({ error: "invalid request", issues: parsed.error.issues }, { status: 400 });
  }
  const { profile, memorySlots, language } = parsed.data;

  // If the visitor leaves, stop the research and cancel the in-flight model call.
  const signal = request.signal;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (event: object) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          open = false;
        }
      };
      const started = Date.now();
      try {
        const { notes, trace, evidence } = await agent().research(
          profile,
          (tool, args) => send({ type: "call", tool, args }),
          signal,
        );
        const researched = Date.now();
        send({ type: "writing" });
        const raw = await agent().composeCard(profile, notes, memorySlots, language, signal);
        const { card, dropped } = groundCard(raw, evidence);
        const timings = { researchMs: researched - started, cardMs: Date.now() - researched };
        console.log(
          JSON.stringify({ plan: "done", provider: provider(), language, calls: trace.length, prompts: card.prompts.length, dropped: dropped.length, ...timings }),
        );
        send({ type: "done", card, notes, trace, dropped, provider: provider(), timings });
      } catch (err) {
        if (signal.aborted) {
          console.log(JSON.stringify({ plan: "cancelled", afterMs: Date.now() - started }));
        } else {
          console.error("plan failed", err);
          send({ type: "error", error: "could not build a session card, please try again" });
        }
      } finally {
        limit.release();
        if (open) {
          open = false;
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
