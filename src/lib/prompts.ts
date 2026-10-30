import { MEMORY_SLOTS, type Language, type MemorySlot, type PublicProfile } from "./profile";

// Research output: notes for the card step, the Qloo calls made (for comparing
// providers), and the raw Qloo results (to check the card is really grounded).
export type Research = { notes: string; trace: string[]; evidence: string[] };

// Limits on the research loop, shared by both providers. Lookups (describe,
// find_tags) only resolve names; taste-graph calls are what make the card
// Qloo-powered, so the model is pushed to make some before it may finish.
export const MIN_QLOO_CALLS = 3;
export const MAX_QLOO_CALLS = 14;
const MIN_TASTE_CALLS = 2;
const LOOKUPS_BEFORE_TASTE_NUDGE = 6;
const TASTE_TOOLS = new Set(["qloo_recommend", "qloo_rank", "qloo_where_popular", "qloo_compare_audiences"]);

export const NUDGE_USE_QLOO = `You have not used the Qloo tools enough. Call them now: every finding must come from an actual Qloo result, never from your own knowledge.`;
const NUDGE_TASTE = `You have looked things up but not asked Qloo's taste graph enough. Now call qloo_recommend (and qloo_where_popular or qloo_rank where useful) with the entities and tags you resolved, an older demographic, and filter_location for places. Do not look up anything else first.`;
export const REPEATED_CALL = JSON.stringify({
  status: "error",
  summary: "You already made this exact call; its result is above. Use it, try a different call, or write your notes.",
});
export const WRAP_UP = `That is enough Qloo calls. Do not call any more tools. Write your research notes now, using only what the Qloo results above returned.`;

export class ResearchBudget {
  calls = 0;
  taste = 0;
  private qlooNudged = false;
  private tasteNudged = false;

  record(tool: string) {
    this.calls++;
    if (TASTE_TOOLS.has(tool)) this.taste++;
  }

  get exhausted() {
    return this.calls >= MAX_QLOO_CALLS;
  }

  // After a round of tool results: tell the model to stop looking things up.
  afterRound(): string | null {
    if (!this.tasteNudged && this.taste === 0 && this.calls >= LOOKUPS_BEFORE_TASTE_NUDGE) {
      this.tasteNudged = true;
      return NUDGE_TASTE;
    }
    return null;
  }

  // The model wants to finish: null accepts its notes, a string pushes it to
  // continue, and too few Qloo calls after one push fails the request.
  beforeFinish(): string | null {
    if (this.calls < MIN_QLOO_CALLS) {
      if (this.qlooNudged) throw new Error(`research made only ${this.calls} Qloo calls`);
      this.qlooNudged = true;
      return NUDGE_USE_QLOO;
    }
    if (this.taste < MIN_TASTE_CALLS && !this.tasteNudged && !this.exhausted) {
      this.tasteNudged = true;
      return NUDGE_TASTE;
    }
    return null;
  }
}

// No music, songs, TV or film anywhere in Encore (product decision).
const NO_MEDIA = `Never use music, songs, singers, bands, TV, radio, film or cinema.`;

export const RESEARCH_SYSTEM = `You are the research step of Encore, a reminiscence companion for family caregivers of people living with dementia.

Use the Qloo tools to find culturally specific things this person is likely to recognise from their youth: books and authors, foods and dishes, places and nature, sports figures and teams, and interests. Ground every finding in a Qloo result you actually received. Never write that you called a tool unless you did. ${NO_MEDIA}

How to work with Qloo:
- Resolve each loved thing to a Qloo entity or tag first (qloo_describe, qloo_find_tags), then ask the taste question (qloo_recommend, qloo_rank, qloo_where_popular).
- Older and non-Western entities are often in search but have no taste data. If an entity returns empty or invalid, fall back to the closest tag (a genre, cuisine, region or occupation tag) and recommend from that.
- City names can resolve to the wrong place. Check the country of returned places and drop mismatches.
- If a match is ambiguous, pick the candidate that fits the birth decade and region, and record it as an assumption.
- Cover every loved thing, including each sport. Make independent calls together in one turn.
- Budget: at most about 5 lookups (qloo_describe, qloo_find_tags), then at least 3 taste-graph calls (qloo_recommend, qloo_where_popular, qloo_rank). The taste graph is what makes Encore useful; lookups alone are not enough.

Aim for their youth (roughly ages 5 to 25), not today:
- Prefer classic, long-lived entities: classic books and authors, legendary athletes and historic clubs of that era (clubs are often brands), and long-established places, landmarks, markets and natural sites where they grew up.
- Use a famous era-appropriate entity as the signal (for example a legendary player of that decade) and set demographic to an older audience such as "people 55 and older".
- Use filter_location to keep places in their home city or region, and exclude_tags to drop modern chains, malls and hotels.
- Drop results that are clearly modern (current players, recent books, chain restaurants and hotels) unless they are timeless.

- Skip politicians and political topics entirely; they can distress people with dementia.
- Qloo results describe what groups tend to like, not facts about this person. Never claim otherwise.

Finish with plain-text research notes: for each domain, the grounded items you found, the exact Qloo entity or tag behind each, and any assumptions or gaps.`;

export const CARD_SYSTEM = `You write a single reminiscence session card for a family caregiver.

Use the research notes (grounded in Qloo) for the book, food, place, nature, sport and interest prompts, and name the Qloo entity or tag in each prompt's source. Keep 5 to 7 prompts, each with a simple activity (read aloud, cook together, look at photos) and one open, gentle question that never tests recall ("Tell me about..." rather than "Do you remember...").

Memory prompts: you do NOT see the family's memory book. You are only told which details the caregiver has filled in. Write up to 2 prompts of kind "memory" with source "memory book" that refer to those details ONLY through the exact placeholders listed, for example "Tell me about cooking with {{relative}}". Never invent names or facts, and never use a placeholder that is not listed. If none are listed, write no memory prompts.

Cover each domain that has grounded findings, including every sport they loved. Give each prompt its most specific kind (book for books and authors, food, place, nature, sport for sports, athletes and teams); use interest only when nothing else fits. Write the theme, opener, prompts and caregiver tips in warm, plain language for a family member: do not mention Qloo, data, databases or coverage gaps there. Put those only in limitations, where you say plainly what the card does not establish, including that Qloo describes group tastes, not this person.

Never mention politics. ${NO_MEDIA}

Never put Qloo ids, UUIDs, tag URNs or curly braces in the text. Write readable names (for example "biryani", "the Prophet's Mosque"). In each source, give the readable Qloo entity or tag name.

Each non-memory source must be the exact Qloo entity name or tag from the notes, nothing else. Use memory placeholders only inside prompts, never in the theme, opener or tips. Do not restate these rules anywhere on the card.`;

// Ages roughly 5 to 25: the years their memories come from.
function youth(profile: PublicProfile): string {
  return `Their youth was roughly ${profile.birthDecade + 5} to ${profile.birthDecade + 30}; focus on those years, not later decades.`;
}

export function researchInput(profile: PublicProfile): string {
  return `Born in the ${profile.birthDecade}s, grew up in ${profile.grewUpIn}. ${youth(profile)}\nThings they loved:\n${profile.loves
    .map((l) => `- ${l.kind}: ${l.text}`)
    .join("\n")}`;
}

const LANGUAGE_NAME: Record<Language, string> = { en: "English", ar: "Modern Standard Arabic" };

// Called for each Qloo call as it happens, so the UI can show live progress.
// evidence holds the Qloo results so far, to turn ids in args into names.
export type OnQlooCall = (tool: string, args: unknown, evidence: string[]) => void;

export function cardInput(profile: PublicProfile, notes: string, slots: MemorySlot[], language: Language): string {
  const placeholders = slots.length
    ? slots.map((s) => `- {{${s}}}: ${MEMORY_SLOTS[s]}`).join("\n")
    : "(none)";
  return `Born in the ${profile.birthDecade}s, grew up in ${profile.grewUpIn}. ${youth(profile)}\n\n<research_notes>\n${notes}\n</research_notes>\n\n<memory_placeholders>\n${placeholders}\n</memory_placeholders>\n\nWrite every field of the card in ${LANGUAGE_NAME[language]}, except each source, which stays the exact Qloo name, and the {{placeholders}}, which stay exactly as listed.`;
}

// "Without Qloo" baseline: the same card instructions and profile, no research.
// Shared by the live comparison (/api/baseline) and scripts/make-baselines.mts.
export const BASELINE_SYSTEM = `${CARD_SYSTEM}

You have NO research notes and no data source for this card: write it from your own general knowledge. Set every non-memory source to "general knowledge".`;

export function baselineInput(profile: PublicProfile, slots: MemorySlot[], language: Language): string {
  const placeholders = slots.map((s) => `- {{${s}}}: ${MEMORY_SLOTS[s]}`).join("\n") || "(none)";
  return `${researchInput(profile)}\n\n<memory_placeholders>\n${placeholders}\n</memory_placeholders>\n\nWrite every field of the card in ${LANGUAGE_NAME[language]}, except the {{placeholders}}, which stay exactly as listed.`;
}
