import type { Language, SessionCard } from "@/lib/profile";
import data from "./baselines.json";

// "Without Qloo" cards for the examples: the same model and card format, no
// Qloo research. Generated with scripts/make-baselines.mts.
export const BASELINES = data as Record<string, Partial<Record<Language, SessionCard>>>;
