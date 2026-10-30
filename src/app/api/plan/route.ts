import type { NextRequest } from "next/server";
import { agentFor, chain, type Provider } from "@/lib/agent";
import { groundCard, nameArgs } from "@/lib/grounding";
import { createJob, emit, finish, getJob, streamJob, type Job } from "@/lib/jobs";
import { PlanRequest, type Language, type MemorySlot, type PublicProfile } from "@/lib/profile";
import { allow } from "@/lib/rate-limit";

// POST starts a card build and streams it as newline-delimited JSON:
//   {"type":"job","id":"..."}               (first line; use it to reconnect)
//   {"type":"call","tool":"qloo_describe","args":{...}}
//   {"type":"retry"}                         (a model failed; the next in the chain takes over)
//   {"type":"writing"}
//   {"type":"done","card":{...},"trace":[...],"dropped":[...],"timings":{...}}
// Model names stay in the server log; they are not sent to the browser.
//   {"type":"error","error":"..."}
//   {"type":"ping"}                          (keep-alive, not counted)
// GET /api/plan?id=...&from=N reconnects: it replays events from index N
// (counting everything except job and ping lines) and continues live.
// A real request is well under 4 KB; reject anything large before reading it.
const MAX_BODY_BYTES = 32 * 1024;

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return Response.json({ error: "request too large" }, { status: 413 });
  }
  // Apache appends the real client address last; earlier entries can be forged.
  const ip = request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "local";
  const limit = allow(ip);
  if (!limit.ok) {
    return Response.json({ error: limit.reason }, { status: 429 });
  }

  const body = await request.text().catch(() => "");
  if (body.length > MAX_BODY_BYTES) {
    limit.release();
    return Response.json({ error: "request too large" }, { status: 413 });
  }
  const parsed = PlanRequest.safeParse((() => {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  })());
  if (!parsed.success) {
    limit.release();
    return Response.json({ error: "invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  const job = createJob();
  // The build is not tied to this connection; it ends on its own or when abandoned.
  void build(job, parsed.data.profile, parsed.data.memorySlots, parsed.data.language).finally(limit.release);
  return streamJob(job, 0);
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const from = Number(request.nextUrl.searchParams.get("from") ?? 0);
  const job = getJob(id);
  if (!job) return Response.json({ error: "This session card is no longer available." }, { status: 404 });
  return streamJob(job, Number.isFinite(from) ? from : 0);
}

async function build(job: Job, profile: PublicProfile, memorySlots: MemorySlot[], language: Language) {
  const signal = job.abort.signal;
  const started = Date.now();
  const run = async (p: Provider) => {
    const agent = agentFor(p);
    const { notes, trace, evidence } = await agent.research(
      profile,
      (tool, args, evidence) => emit(job, { type: "call", tool, args: nameArgs(args, evidence) }),
      signal,
    );
    const researched = Date.now();
    emit(job, { type: "writing" });
    const raw = await agent.composeCard(profile, notes, memorySlots, language, signal);
    const { card, dropped } = groundCard(raw, evidence);
    const timings = { researchMs: researched - started, cardMs: Date.now() - researched };
    console.log(
      JSON.stringify({ plan: "done", provider: p, language, calls: trace.length, prompts: card.prompts.length, dropped: dropped.length, ...timings }),
    );
    emit(job, { type: "done", card, notes, trace, dropped, timings });
  };
  try {
    const models = chain();
    if (models.length === 0) throw new Error("no LLM provider is configured");
    for (let i = 0; ; i++) {
      try {
        await run(models[i]);
        break;
      } catch (err) {
        const next = models[i + 1];
        if (signal.aborted || !next) throw err;
        console.error(`plan failed on ${models[i]}, retrying on ${next}`, err);
        emit(job, { type: "retry" });
      }
    }
  } catch (err) {
    if (signal.aborted) {
      console.log(JSON.stringify({ plan: "abandoned", afterMs: Date.now() - started }));
    } else {
      console.error("plan failed", err);
      emit(job, { type: "error", error: "could not build a session card, please try again" });
    }
  } finally {
    finish(job);
  }
}
