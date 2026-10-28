import "server-only";
import type { SessionCard } from "./profile";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const TAG_URN = /urn:tag:[\w:.-]+/gi;
const VAGUE = new Set(["none", "null", "n/a", "unknown", "qloo", "memory book"]);

// Product rules enforced in code, not only in prompts: no music, TV or film,
// and no politics, anywhere on the card (including the model restating the rules).
const EXCLUDED = /\b(music|musical|songs?|singers?|bands?|tv|television|radio|films?|cinema|movies?|politic\w*)\b/i;

// Everything in a source string that could identify a Qloo result: tag URNs,
// entity UUIDs, and the names inside and outside parentheses.
// "Book Entity `E7202BD2-...` (*Anne of Green Gables*)" -> [uuid, "anne of green gables", ...]
function candidates(source: string): string[] {
  const text = source.replace(/[*"`]/g, "");
  const urns = text.match(TAG_URN) ?? [];
  const ids = text.match(UUID) ?? [];
  const rest = text.replace(TAG_URN, " ").replace(UUID, " ");
  const names = [...rest.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  names.push(rest.replace(/\(.*?\)/g, " "));
  const cleaned = names
    .flatMap((n) => n.split(/\bAND\b|;|,/))
    .map((n) =>
      n
        .replace(/^\s*qloo\s*/i, "")
        .replace(/^\s*(book|author|brand|place|person|destination|locality)?\s*(entity|tag)?\s*:?\s*/i, "")
        .replace(/\s+tag\s*$/i, "")
        .trim()
        .toLowerCase(),
    )
    .filter((n) => n.length >= 4 && !VAGUE.has(n));
  // Shorthand tags such as "cuisine:biryani" -> also try the last segment.
  const tails = cleaned.filter((n) => /^[\w-]+:[\w-]+$/.test(n)).map((n) => n.split(":").pop()!.replace(/_/g, " "));
  return [...urns, ...ids].map((s) => s.toLowerCase()).concat(cleaned, tails.filter((t) => t.length >= 4));
}

// Keeps memory prompts and the prompts whose source names an entity or tag that
// appears in an actual Qloo result from the research step. Anything else was
// written from the model's own knowledge and is dropped.
export function groundCard(card: SessionCard, evidence: string[]): { card: SessionCard; dropped: string[] } {
  const haystack = evidence.join("\n").toLowerCase();
  const dropped: string[] = [];
  const prompts = card.prompts.filter((p) => {
    const text = `${p.title} ${p.activity} ${p.question}`;
    if (EXCLUDED.test(text)) {
      dropped.push(`${p.title} (excluded topic)`);
      return false;
    }
    if (p.kind === "memory" || /^\s*memory book\s*$/i.test(p.source)) return true;
    const grounded = candidates(p.source).some((c) => haystack.includes(c));
    if (!grounded) dropped.push(`${p.title} (source: ${p.source})`);
    return grounded;
  });
  const clean = (lines: string[]) => lines.filter((l) => !EXCLUDED.test(l));
  return {
    card: { ...card, prompts, caregiverTips: clean(card.caregiverTips), limitations: clean(card.limitations) },
    dropped,
  };
}
