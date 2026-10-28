import "server-only";
import { MEMORY_SLOTS, type SessionCard } from "./profile";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const TAG_URN = /urn:tag:[\w:.-]+/gi;
const VAGUE = new Set(["none", "null", "n/a", "unknown", "qloo", "memory book"]);

// Product rules enforced in code, not only in prompts: no music, TV or film,
// and no politics, anywhere on the card (including the model restating the rules).
const EXCLUDED =
  /\b(music|musical|songs?|singers?|bands?|tv|television|radio|films?|cinema|movies?|politic\w*)\b|موسيق|أغني|أغان|مطرب|تلفزيون|تلفاز|إذاع|راديو|فيلم|أفلام|سينما|سياس/i;

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

const BRACED = /\{\{\s*([^}]*?)\s*\}\}/g;

// Readable name for a Qloo reference the model leaked into the card:
// a tag URN becomes its last segment, an entity UUID becomes the name Qloo
// returned next to that id. Returns null when it cannot be resolved.
function resolveRef(ref: string, raw: string): string | null {
  const urn = ref.match(/urn:tag:[\w:.-]+/i)?.[0];
  if (urn) return urn.split(":").pop()!.replace(/_/g, " ");
  const id = ref.match(UUID)?.[0];
  if (id) {
    const at = raw.toLowerCase().indexOf(id.toLowerCase());
    if (at < 0) return null;
    const start = Math.max(0, at - 600);
    const near = raw.slice(start, at + 600);
    const idAt = at - start;
    const names = [...near.matchAll(/"name"\s*:\s*"([^"]+)"/g)];
    if (!names.length) return null;
    // The name closest to the id belongs to the same result object.
    names.sort((a, b) => Math.abs(a.index! - idAt) - Math.abs(b.index! - idAt));
    return names[0][1];
  }
  return null;
}

// Replaces {{...}} that are not memory placeholders, and bare ids/URNs, with
// readable names. Returns null if something cannot be resolved.
function readable(text: string, raw: string): string | null {
  let ok = true;
  const out = text
    .replace(BRACED, (whole, inner: string) => {
      if (inner in MEMORY_SLOTS) return `{{${inner}}}`;
      const name = resolveRef(inner, raw);
      if (name == null) ok = false;
      return name ?? whole;
    })
    .replace(TAG_URN, (urn) => resolveRef(urn, raw) ?? urn)
    .replace(UUID, (id) => {
      const name = resolveRef(id, raw);
      if (name == null) ok = false;
      return name ?? id;
    });
  return ok ? out : null;
}

// Keeps memory prompts and the prompts whose source names an entity or tag that
// appears in an actual Qloo result from the research step. Anything else was
// written from the model's own knowledge and is dropped.
export function groundCard(card: SessionCard, evidence: string[]): { card: SessionCard; dropped: string[] } {
  const raw = evidence.join("\n");
  const haystack = raw.toLowerCase();
  const dropped: string[] = [];
  const grounded = card.prompts.filter((p) => {
    const text = `${p.title} ${p.activity} ${p.question}`;
    if (EXCLUDED.test(text)) {
      dropped.push(`${p.title} (excluded topic)`);
      return false;
    }
    if (p.kind === "memory" || /^\s*memory book\s*$/i.test(p.source)) return true;
    const found = candidates(p.source).some((c) => haystack.includes(c));
    if (!found) dropped.push(`${p.title} (source: ${p.source})`);
    return found;
  });
  // Caregivers should see names, never Qloo ids or URNs.
  const prompts = grounded.flatMap((p) => {
    const title = readable(p.title, raw);
    const activity = readable(p.activity, raw);
    const question = readable(p.question, raw);
    const source = readable(p.source.replace(/[`*]/g, ""), raw) ?? "Qloo";
    if (title == null || activity == null || question == null) {
      dropped.push(`${p.title} (unreadable Qloo reference)`);
      return [];
    }
    return [{ ...p, title, activity, question, source }];
  });
  const clean = (lines: string[]) => lines.filter((l) => !EXCLUDED.test(l));
  return {
    card: { ...card, prompts, caregiverTips: clean(card.caregiverTips), limitations: clean(card.limitations) },
    dropped,
  };
}
