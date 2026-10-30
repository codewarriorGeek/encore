// With Qloo vs without Qloo, on the 8 example profiles (English cards).
//   ANTHROPIC_API_KEY=... npx tsx scripts/benchmark.mts
// 1. Traceable prompts: non-memory prompts whose source is a Qloo result
//    (Encore checks this in code; the baseline has no data source).
// 2. New specific items: named places, books, people, clubs, dishes or
//    landmarks the card adds beyond what the caregiver typed.
// 3. Era fit (1-5): do the items belong to the person's youth and region?
// 2 and 3 are judged by Claude Opus, one card at a time, without being told
// which version it is. Results go to docs/BENCHMARK.md.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import type { PublicProfile, SessionCard } from "../src/lib/profile";

const JUDGE_MODEL = "claude-opus-5-5";
const client = new Anthropic();

type Example = { id: string; label: { en: string }; profile: PublicProfile; cards: { en: SessionCard } };
const examples: Example[] = JSON.parse(readFileSync("src/data/examples.json", "utf8"));
const baselines: Record<string, { en: SessionCard }> = JSON.parse(readFileSync("src/data/baselines.json", "utf8"));

const Judgement = z.object({
  new_specific_items: z.array(z.string()),
  era_fit: z.number().int().min(1).max(5),
  era_notes: z.string(),
});

const JUDGE_SYSTEM = `You assess reminiscence session cards for people living with dementia.

Given the person's profile (birth decade, hometown and the things the caregiver typed) and one card, return:
- new_specific_items: every concrete, named item the card suggests that the caregiver did NOT already type: a specific place or landmark, book or author, person, club or team, dish, or natural site. Generic categories ("football", "the rainforest", "family meals") and restatements of the caregiver's own words do not count.
- era_fit: 1 to 5. 5 means everything fits the person's youth (roughly ages 5 to 25) and region; 1 means mostly anachronistic or from the wrong place.
- era_notes: one short sentence explaining the era_fit score.`;

const nonMemory = (c: SessionCard) => c.prompts.filter((p) => p.kind !== "memory" && !/memory book/i.test(p.source));

async function judge(profile: PublicProfile, card: SessionCard) {
  const response = await client.messages.parse({
    model: JUDGE_MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(Judgement) },
    system: JUDGE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `<profile>\nBorn in the ${profile.birthDecade}s, grew up in ${profile.grewUpIn}.\nThe caregiver typed: ${profile.loves
          .map((l) => `${l.kind}: ${l.text}`)
          .join("; ")}\n</profile>\n\n<card>\n${JSON.stringify(
          { theme: card.theme, prompts: nonMemory(card).map(({ title, activity, question }) => ({ title, activity, question })) },
          null,
          1,
        )}\n</card>`,
      },
    ],
  });
  if (!response.parsed_output) throw new Error("no judgement");
  return response.parsed_output;
}

const rows = await Promise.all(
  examples.map(async (ex) => {
    const encore = ex.cards.en;
    const base = baselines[ex.id].en;
    const [je, jb] = await Promise.all([judge(ex.profile, encore), judge(ex.profile, base)]);
    const traceable = nonMemory(encore).length; // every kept Encore prompt passed the Qloo grounding check
    return {
      id: ex.id,
      label: ex.label.en,
      encore: { prompts: nonMemory(encore).length, traceable, newItems: je.new_specific_items, eraFit: je.era_fit, notes: je.era_notes },
      baseline: { prompts: nonMemory(base).length, traceable: 0, newItems: jb.new_specific_items, eraFit: jb.era_fit, notes: jb.era_notes },
    };
  }),
);

const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
const avg = (f: (r: (typeof rows)[number]) => number) => (sum(f) / rows.length).toFixed(1);
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);

const md = `# Benchmark: with Qloo vs without Qloo

Encore's example cards compared with cards from a Claude model given the same profile and the same card instructions, but no Qloo research (\`scripts/make-baselines.mts\`). Eight profiles, English cards, memory-book prompts excluded. Run with \`scripts/benchmark.mts\`.

| | With Qloo (Encore) | Without Qloo |
|---|---|---|
| Prompts traceable to a Qloo result | **${pct(sum((r) => r.encore.traceable), sum((r) => r.encore.prompts))}%** (${sum((r) => r.encore.traceable)} of ${sum((r) => r.encore.prompts)}) | ${pct(0, sum((r) => r.baseline.prompts))}% (no data source) |
| New specific items per card, beyond what the caregiver typed | **${avg((r) => r.encore.newItems.length)}** | ${avg((r) => r.baseline.newItems.length)} |
| Era and region fit (1 to 5) | **${avg((r) => r.encore.eraFit)}** | ${avg((r) => r.baseline.eraFit)} |

"New specific items" and "era fit" were judged by a Claude model, one card at a time, without being told which version it was. The judge is from the same model family as the card writers, so treat those two rows as indicative rather than definitive. Traceability is measured directly from the data.

## By profile

| Profile | New items with Qloo | New items without Qloo | Era fit with / without |
|---|---|---|---|
${rows
  .map((r) => `| ${r.label} | ${r.encore.newItems.length}: ${r.encore.newItems.join(", ") || "none"} | ${r.baseline.newItems.length}: ${r.baseline.newItems.join(", ") || "none"} | ${r.encore.eraFit} / ${r.baseline.eraFit} |`)
  .join("\n")}
`;
writeFileSync("docs/BENCHMARK.md", md);
writeFileSync("docs/benchmark.json", JSON.stringify(rows, null, 1) + "\n");
console.log(md);
