import { connection } from "next/server";
import { providerReady } from "@/lib/agent";
import { qlooReady } from "@/lib/qloo";

export async function GET() {
  await connection();
  let qloo = false;
  try {
    qloo = await qlooReady();
  } catch {
    qloo = false;
  }
  const llm = providerReady();
  // Public endpoint: readiness only, no model details.
  return Response.json({ ok: qloo && llm, qloo, llm }, { status: qloo && llm ? 200 : 503 });
}
