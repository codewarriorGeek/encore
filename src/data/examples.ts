import type { Language, MemoryBook, PublicProfile, SessionCard } from "@/lib/profile";

// Pre-generated cards so visitors and judges can see a result instantly.
// Generated with scripts/make-examples.mjs from live runs (Qwen + Qloo);
// memory values are fictional sample entries.
export type Example = {
  id: string;
  label: Record<Language, string>;
  profile: PublicProfile;
  memory: MemoryBook;
  cards: Partial<Record<Language, SessionCard>>;
};

export const EXAMPLES: Example[] = [];
