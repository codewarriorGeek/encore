import { z } from "zod";

// Public taste signals. These are the ONLY caregiver inputs that reach the
// server, the LLM and Qloo: no names, no relatives, no health details.
export const LoveKind = z.enum([
  "book",
  "author",
  "food",
  "place",
  "nature",
  "sport",
  "athlete",
  "team",
  "hobby",
  "other",
]);

export const PublicProfile = z.object({
  birthDecade: z.number().int().min(1920).max(1990),
  grewUpIn: z.string().trim().min(2).max(80),
  loves: z
    .array(z.object({ kind: LoveKind, text: z.string().trim().min(1).max(120) }))
    .min(1)
    .max(12),
});
export type PublicProfile = z.infer<typeof PublicProfile>;

// Private memory book. The values stay in the browser; the server only learns
// which slots are filled, and the LLM writes {{slot}} placeholders that the
// browser fills in.
export const MEMORY_SLOTS = {
  relative: "A sibling or close relative",
  childhoodHome: "Where they lived as a child",
  school: "Their school",
  familyDish: "A dish someone in the family cooked",
  celebration: "A family celebration or tradition",
  work: "Their first job or life's work",
  pet: "A pet or animal they loved",
} as const;
export type MemorySlot = keyof typeof MEMORY_SLOTS;
export const MemorySlot = z.enum(Object.keys(MEMORY_SLOTS) as [MemorySlot, ...MemorySlot[]]);
export type MemoryBook = Partial<Record<MemorySlot, string>>;

export const PlanRequest = z.object({
  profile: PublicProfile,
  memorySlots: z.array(MemorySlot).max(7).default([]),
});
export type PlanRequest = z.infer<typeof PlanRequest>;

export const SessionCard = z.object({
  theme: z.string(),
  opener: z.string(),
  prompts: z.array(
    z.object({
      kind: z.enum(["book", "food", "place", "nature", "sport", "interest", "memory"]),
      title: z.string(),
      activity: z.string(),
      question: z.string(),
      // Qloo entity or tag name the prompt is grounded in, or "memory book".
      source: z.string(),
    }),
  ),
  caregiverTips: z.array(z.string()),
  limitations: z.array(z.string()),
});
export type SessionCard = z.infer<typeof SessionCard>;

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

// Browser side: fill {{slot}} placeholders from the local memory book, and drop
// memory prompts that reference a slot the caregiver left empty.
export function fillMemory(card: SessionCard, book: MemoryBook): SessionCard {
  const fill = (s: string) => s.replace(PLACEHOLDER, (_, k: string) => book[k as MemorySlot] ?? "");
  const complete = (s: string) => [...s.matchAll(PLACEHOLDER)].every(([, k]) => book[k as MemorySlot]?.trim());
  return {
    ...card,
    prompts: card.prompts
      .filter((p) => complete(p.title) && complete(p.activity) && complete(p.question))
      .map((p) => ({ ...p, title: fill(p.title), activity: fill(p.activity), question: fill(p.question) })),
  };
}
