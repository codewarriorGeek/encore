// Generates the instant "Try an example" cards from live runs against a local
// Encore server: node scripts/make-examples.mjs [http://localhost:3917] [id:lang,...]
// With a second argument, only those cards are regenerated and merged in.
// Memory values are fictional sample entries, filled in by the browser.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3917";
const EXAMPLES = [
  { id: "madinah", label: { en: "Madinah, 1950s", ar: "المدينة المنورة، الخمسينيات" }, profile: { birthDecade: 1950, grewUpIn: "Madinah, Saudi Arabia", loves: [{ kind: "other", text: "Umar ibn al-Khattab" }, { kind: "sport", text: "football" }, { kind: "food", text: "biryani" }] }, memory: { relative: "your brother Salim", familyDish: "Mother's kabsa" } },
  { id: "cairo", label: { en: "Cairo, 1950s", ar: "القاهرة، الخمسينيات" }, profile: { birthDecade: 1950, grewUpIn: "Cairo, Egypt", loves: [{ kind: "author", text: "Naguib Mahfouz" }, { kind: "team", text: "Al Ahly" }, { kind: "food", text: "koshari" }, { kind: "nature", text: "the Nile" }] }, memory: { relative: "your sister Hoda", familyDish: "Grandmother's molokhia" } },
  { id: "istanbul", label: { en: "Istanbul, 1950s", ar: "إسطنبول، الخمسينيات" }, profile: { birthDecade: 1950, grewUpIn: "Istanbul, Turkey", loves: [{ kind: "author", text: "Yaşar Kemal" }, { kind: "team", text: "Galatasaray" }, { kind: "food", text: "simit" }, { kind: "place", text: "Bosphorus" }] }, memory: { relative: "your cousin Ayşe", familyDish: "Mother's dolma" } },
  { id: "kualalumpur", label: { en: "Kuala Lumpur, 1950s", ar: "كوالالمبور، الخمسينيات" }, profile: { birthDecade: 1950, grewUpIn: "Kuala Lumpur, Malaysia", loves: [{ kind: "sport", text: "badminton" }, { kind: "food", text: "nasi lemak" }, { kind: "place", text: "Penang" }, { kind: "hobby", text: "kite flying" }] }, memory: { relative: "your brother Ahmad", familyDish: "Grandmother's rendang" } },
  { id: "brunei", label: { en: "Bandar Seri Begawan, 1960s", ar: "بندر سري بكاوان، الستينيات" }, profile: { birthDecade: 1960, grewUpIn: "Bandar Seri Begawan, Brunei", loves: [{ kind: "food", text: "ambuyat" }, { kind: "place", text: "Kampong Ayer" }, { kind: "sport", text: "football" }, { kind: "nature", text: "rainforest" }] }, memory: { relative: "your sister Siti", familyDish: "Mother's ambuyat" } },
  { id: "chicago", label: { en: "Chicago, 1950s", ar: "شيكاغو، الخمسينيات" }, profile: { birthDecade: 1950, grewUpIn: "Chicago, USA", loves: [{ kind: "book", text: "To Kill a Mockingbird" }, { kind: "team", text: "Chicago Cubs" }, { kind: "food", text: "apple pie" }, { kind: "nature", text: "Lake Michigan" }] }, memory: { relative: "Aunt Ruth", familyDish: "Grandma's pot roast" } },
  { id: "manchester", label: { en: "Manchester, 1950s", ar: "مانشستر، الخمسينيات" }, profile: { birthDecade: 1950, grewUpIn: "Manchester, United Kingdom", loves: [{ kind: "author", text: "Enid Blyton" }, { kind: "team", text: "Manchester United" }, { kind: "food", text: "fish and chips" }, { kind: "nature", text: "Lake District" }] }, memory: { relative: "your brother Tom", familyDish: "Mum's Lancashire hotpot" } },
  { id: "toronto", label: { en: "Toronto, 1950s", ar: "تورونتو، الخمسينيات" }, profile: { birthDecade: 1950, grewUpIn: "Toronto, Canada", loves: [{ kind: "book", text: "Anne of Green Gables" }, { kind: "team", text: "Toronto Maple Leafs" }, { kind: "food", text: "butter tarts" }, { kind: "nature", text: "Muskoka lakes" }] }, memory: { relative: "your sister Margaret", familyDish: "Mom's tourtière" } },
];

async function run(ex, language) {
  const res = await fetch(`${BASE}/api/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile: ex.profile, memorySlots: Object.keys(ex.memory), language }),
  });
  if (!res.ok) throw new Error(`${ex.id}/${language}: HTTP ${res.status}`);
  const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
  const done = lines.find((e) => e.type === "done");
  if (!done) throw new Error(`${ex.id}/${language}: ${lines.at(-1)?.error ?? "no card"}`);
  console.log(`${ex.id}/${language}: ${done.card.prompts.length} prompts, ${done.trace.length} Qloo calls, ${done.dropped.length} dropped`);
  return done.card;
}

const only = process.argv[3]?.split(",");
const jobs = EXAMPLES.flatMap((ex) => ["en", "ar"].map((lang) => [ex, lang])).filter(
  ([ex, lang]) => !only || only.includes(`${ex.id}:${lang}`),
);
const OUT = "src/data/examples.json";
const results = {};
if (only && existsSync(OUT)) for (const ex of JSON.parse(readFileSync(OUT, "utf8"))) results[ex.id] = ex.cards;
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const [ex, lang] = jobs[next++];
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        (results[ex.id] ??= {})[lang] = await run(ex, lang);
        break;
      } catch (err) {
        console.error(String(err), attempt === 1 ? "(retrying)" : "(giving up)");
      }
    }
  }
}
await Promise.all([worker(), worker(), worker()]);
// Thin cards make a weak first impression: keep only cards with 4+ prompts.
const MIN_PROMPTS = 4;
const out = EXAMPLES.map((ex) => ({
  ...ex,
  cards: Object.fromEntries(Object.entries(results[ex.id] ?? {}).filter(([, c]) => c.prompts.length >= MIN_PROMPTS)),
})).filter((ex) => Object.keys(ex.cards).length > 0);
writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`wrote ${out.length} examples`);
