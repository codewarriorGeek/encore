import "server-only";
import { MEMORY_SLOTS, type SessionCard } from "./profile";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const TAG_URN = /urn:tag:[\w:.-]+/gi;
const VAGUE = new Set([
  "none", "null", "n/a", "unknown", "qloo", "memory book", "entity", "tag", "author", "book", "brand", "place",
  "person", "destination", "locality", "food", "cuisine", "sport", "nature", "interest", "football", "soccer",
]);

// "Urn: Tag: Nearby Attraction: Qloo: Nile River" -> "urn:tag:nearby_attraction:qloo:nile_river"
function unprettifyUrn(source: string): string {
  if (!/^\s*urn\s*:/i.test(source)) return source;
  return source
    .split(":")
    .map((part) => part.trim().toLowerCase().replace(/\s+/g, "_"))
    .join(":");
}

// What the caregiver sees: a readable name, without type prefixes or underscores.
function displaySource(source: string): string {
  return source
    .replace(/^\s*(qloo\s*)?((book|author|brand|place|person|destination|locality)\s*)?(entity|tag)?\s*:\s*/i, "")
    .replace(/_/g, " ")
    .trim();
}

// Product rules enforced in code, not only in prompts: no music, TV or film,
// and no politics, anywhere on the card (including the model restating the rules).
const EXCLUDED =
  /\b(music|musical|songs?|singers?|bands?|tv|television|radio|films?|cinema|movies?|politic\w*)\b|موسيق|أغني|أغان|مطرب|تلفزيون|تلفاز|إذاع|راديو|فيلم|أفلام|سينما|سياس/i;

// Everything in a source string that could identify a Qloo result: tag URNs,
// entity UUIDs, and the names inside and outside parentheses.
// "Book Entity `E7202BD2-...` (*Anne of Green Gables*)" -> [uuid, "anne of green gables", ...]
function candidates(source: string): string[] {
  const text = unprettifyUrn(source.replace(/[*"`]/g, ""));
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
export function resolveRef(ref: string, raw: string): string | null {
  const urn = ref.match(/urn:tag:[\w:.-]+/i)?.[0];
  const id = urn ?? ref.match(UUID)?.[0];
  if (!id) return null;
  const at = raw.toLowerCase().indexOf(id.toLowerCase());
  if (at >= 0) {
    // The name in the same result object: after the id up to the object's end,
    // otherwise before it back to the object's start.
    const end = raw.indexOf("}", at);
    const after = raw.slice(at, end < 0 ? at + 600 : end).match(/"name"\s*:\s*"([^"]+)"/);
    if (after) return after[1];
    const before = [...raw.slice(Math.max(raw.lastIndexOf("{", at), at - 600), at).matchAll(/"name"\s*:\s*"([^"]+)"/g)];
    if (before.length) return before[before.length - 1][1];
  }
  // A tag URN still reads well as its last segment; an unknown UUID does not.
  return urn ? urn.split(":").pop()!.replace(/_/g, " ") : null;
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
    const resolved = readable(unprettifyUrn(p.source.replace(/[`*]/g, "")), raw);
    const source = resolved ? displaySource(resolved) || "Qloo" : "Qloo";
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

// Live progress: replace Qloo ids and tag URNs in tool arguments with the names
// Qloo has returned so far, so caregivers see "fans of Galatasaray", not an id.
export function nameArgs(args: unknown, evidence: string[]): unknown {
  const raw = evidence.join("\n");
  const isRef = new RegExp(`${UUID.source}|urn:tag:`, "i"); // non-global: .test() stays stateless
  const swap = (v: unknown): unknown =>
    typeof v === "string" && isRef.test(v)
      ? (resolveRef(v, raw) ?? v)
      : Array.isArray(v)
        ? v.map(swap)
        : v;
  if (!args || typeof args !== "object") return args;
  return Object.fromEntries(Object.entries(args as Record<string, unknown>).map(([k, v]) => [k, swap(v)]));
}
