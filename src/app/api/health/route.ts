import { connection } from "next/server";
import { provider, providerReady } from "@/lib/agent";
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
  return Response.json({ ok: qloo && llm, qloo, llm, provider: provider() }, { status: qloo && llm ? 200 : 503 });
}
