import { agent, provider } from "@/lib/agent";
import { PlanRequest } from "@/lib/profile";

export async function POST(request: Request) {
  const parsed = PlanRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid request", issues: parsed.error.issues }, { status: 400 });
  }
  const { profile, memorySlots } = parsed.data;
  const started = Date.now();
  try {
    const { notes, trace } = await agent().research(profile);
    const researched = Date.now();
    const card = await agent().composeCard(profile, notes, memorySlots);
    return Response.json({
      card,
      notes,
      trace,
      provider: provider(),
      timings: { researchMs: researched - started, cardMs: Date.now() - researched },
    });
  } catch (err) {
    console.error("plan failed", err);
    return Response.json({ error: "could not build a session card, please try again" }, { status: 502 });
  }
}
