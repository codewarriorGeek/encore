// "Without Qloo" baseline cards for the instant examples: the same model, the
// same card format and the same profile, but no Qloo research. Used by the
// "Without Qloo" view and the benchmark.
//   ANTHROPIC_API_KEY=... npx tsx scripts/make-baselines.mts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readFileSync, writeFileSync } from "node:fs";
import { SessionCard, type Language, type MemorySlot, type PublicProfile } from "../src/lib/profile";
import { BASELINE_SYSTEM, baselineInput } from "../src/lib/prompts";

export const BASELINE_MODEL = "claude-sonnet-5-5";

type Example = { id: string; profile: PublicProfile; memory: Partial<Record<MemorySlot, string>> };

const client = new Anthropic();

async function baseline(ex: Example, language: Language): Promise<SessionCard> {
  const slots = Object.keys(ex.memory) as MemorySlot[];
  const response = await client.messages.parse({
    model: BASELINE_MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(SessionCard) },
    system: BASELINE_SYSTEM,
    messages: [{ role: "user", content: baselineInput(ex.profile, slots, language) }],
  });
  if (!response.parsed_output) throw new Error(`${ex.id}/${language}: no card`);
  return response.parsed_output;
}

const examples: Example[] = JSON.parse(readFileSync("src/data/examples.json", "utf8"));
const out: Record<string, Partial<Record<Language, SessionCard>>> = {};
await Promise.all(
  examples.flatMap((ex) =>
    (["en", "ar"] as Language[]).map(async (language) => {
      (out[ex.id] ??= {})[language] = await baseline(ex, language);
      console.log(`${ex.id}/${language}: ${out[ex.id][language]!.prompts.length} prompts`);
    }),
  ),
);
writeFileSync("src/data/baselines.json", JSON.stringify(out, null, 1) + "\n");
console.log(`wrote baselines for ${Object.keys(out).length} examples`);
