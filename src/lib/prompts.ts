import { MEMORY_SLOTS, type MemorySlot, type PublicProfile } from "./profile";

// Research output: notes for the card step, plus the Qloo calls made (for comparing providers).
export type Research = { notes: string; trace: string[] };

export const RESEARCH_SYSTEM = `You are the research step of Encore, a reminiscence companion for family caregivers of people living with dementia.

Use the Qloo tools to find culturally specific things this person is likely to recognise from their youth: books and authors, foods and dishes, places and nature, sports figures and teams, and interests. Ground every finding in a Qloo result.

How to work with Qloo:
- Resolve each loved thing to a Qloo entity or tag first (qloo_describe, qloo_find_tags), then ask the taste question (qloo_recommend, qloo_rank, qloo_where_popular).
- Older and non-Western entities are often in search but have no taste data. If an entity returns empty or invalid, fall back to the closest tag (a genre, cuisine, region or occupation tag) and recommend from that.
- City names can resolve to the wrong place. Check the country of returned places and drop mismatches.
- If a match is ambiguous, pick the candidate that fits the birth decade and region, and record it as an assumption.
- Skip politicians and political topics entirely; they can distress people with dementia.
- Qloo results describe what groups tend to like, not facts about this person. Never claim otherwise.

Finish with plain-text research notes: for each domain, the grounded items you found, the exact Qloo entity or tag behind each, and any assumptions or gaps.`;

export const CARD_SYSTEM = `You write a single reminiscence session card for a family caregiver.

Use the research notes (grounded in Qloo) for the book, food, place, nature, sport and interest prompts, and name the Qloo entity or tag in each prompt's source. Keep 5 to 7 prompts, each with a simple activity (read aloud, cook together, look at photos) and one open, gentle question that never tests recall ("Tell me about..." rather than "Do you remember...").

Memory prompts: you do NOT see the family's memory book. You are only told which details the caregiver has filled in. Write up to 2 prompts of kind "memory" with source "memory book" that refer to those details ONLY through the exact placeholders listed, for example "Tell me about cooking with {{relative}}". Never invent names or facts, and never use a placeholder that is not listed. If none are listed, write no memory prompts.

Never mention politics. In limitations, say plainly what the card does not establish, including that Qloo describes group tastes, not this person.`;

export function researchInput(profile: PublicProfile): string {
  return `Born in the ${profile.birthDecade}s, grew up in ${profile.grewUpIn}.\nThings they loved:\n${profile.loves
    .map((l) => `- ${l.kind}: ${l.text}`)
    .join("\n")}`;
}

export function cardInput(profile: PublicProfile, notes: string, slots: MemorySlot[]): string {
  const placeholders = slots.length
    ? slots.map((s) => `- {{${s}}}: ${MEMORY_SLOTS[s]}`).join("\n")
    : "(none)";
  return `Born in the ${profile.birthDecade}s, grew up in ${profile.grewUpIn}.\n\n<research_notes>\n${notes}\n</research_notes>\n\n<memory_placeholders>\n${placeholders}\n</memory_placeholders>`;
}
