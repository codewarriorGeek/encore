import assert from "node:assert/strict";
import { test } from "node:test";
import { groundCard, nameArgs } from "../src/lib/grounding";
import type { SessionCard } from "../src/lib/profile";

// What Qloo returned during research (shape trimmed to what matters).
const evidence = [
  JSON.stringify({
    results: [
      { entity_id: "A0951379-E7A8-4EBC-BFB7-44802A869AE2", name: "Al-Masjid an-Nabawi" },
      { id: "urn:tag:cuisine:qloo:biryani", name: "Biryani" },
      { name: "Galatasaray SK", entity_id: "DBA18FE8-DE2B-470A-A681-9A1107A49351" },
      { id: "urn:tag:nearby_attraction:qloo:nile_river", name: "Nile River" },
    ],
  }),
];

const prompt = (title: string, source: string, kind: SessionCard["prompts"][number]["kind"] = "place", activity = "Look at photos") => ({
  kind,
  title,
  activity,
  question: "Tell me about it.",
  source,
});
const card = (prompts: SessionCard["prompts"], extra: Partial<SessionCard> = {}): SessionCard => ({
  theme: "t",
  opener: "o",
  prompts,
  caregiverTips: [],
  limitations: [],
  ...extra,
});

test("keeps prompts whose source Qloo returned, in any common format", () => {
  const { card: out, dropped } = groundCard(
    card([
      prompt("By name", "Galatasaray SK", "sport"),
      prompt("By entity id", "Place entity `A0951379-E7A8-4EBC-BFB7-44802A869AE2`"),
      prompt("By tag URN", "urn:tag:cuisine:qloo:biryani", "food"),
      prompt("Shorthand tag", "cuisine:biryani", "food"),
      prompt("Prettified URN", "Urn: Tag: Nearby Attraction: Qloo: Nile River", "nature"),
    ]),
    evidence,
  );
  assert.equal(out.prompts.length, 5);
  assert.deepEqual(dropped, []);
});

test("drops prompts the model wrote from its own knowledge", () => {
  const { card: out, dropped } = groundCard(
    card([
      prompt("Invented", "Topkapi Palace"),
      prompt("No source", "None"),
      prompt("Vague", "Entity: Author", "book"),
      prompt("Fake id", "11111111-2222-3333-4444-555555555555"),
    ]),
    evidence,
  );
  assert.equal(out.prompts.length, 0);
  assert.equal(dropped.length, 4);
});

test("always keeps memory-book prompts", () => {
  const { card: out } = groundCard(card([prompt("Family", "memory book", "memory"), prompt("Mislabelled", "memory book", "interest")]), evidence);
  assert.equal(out.prompts.length, 2);
});

test("removes music, TV, film and politics, including in tips and limitations", () => {
  const { card: out, dropped } = groundCard(
    card([prompt("Movie night", "Galatasaray SK", "sport", "Watch a film together"), prompt("تلفزيون", "Biryani", "food")], {
      caregiverTips: ["Play their favourite songs", "Go slowly"],
      limitations: ["No music, film or TV is used", "Qloo describes group tastes"],
    }),
    evidence,
  );
  assert.equal(out.prompts.length, 0);
  assert.equal(dropped.length, 2);
  assert.deepEqual(out.caregiverTips, ["Go slowly"]);
  assert.deepEqual(out.limitations, ["Qloo describes group tastes"]);
});

test("replaces leaked Qloo ids with the names Qloo returned", () => {
  const { card: out } = groundCard(
    card([prompt("Mosque", "{{A0951379-E7A8-4EBC-BFB7-44802A869AE2}}", "place", "Look at photos of {{A0951379-E7A8-4EBC-BFB7-44802A869AE2}}")]),
    evidence,
  );
  assert.equal(out.prompts[0].activity, "Look at photos of Al-Masjid an-Nabawi");
  assert.equal(out.prompts[0].source, "Al-Masjid an-Nabawi");
});

test("drops a prompt with an id that cannot be resolved, and keeps memory placeholders", () => {
  const { card: out, dropped } = groundCard(
    card([
      prompt("Ghost", "Biryani", "food", "Visit {{11111111-2222-3333-4444-555555555555}}"),
      prompt("Family", "memory book", "memory", "Cook with {{relative}}"),
    ]),
    evidence,
  );
  assert.equal(out.prompts.length, 1);
  assert.equal(out.prompts[0].activity, "Cook with {{relative}}");
  assert.match(dropped[0], /unreadable/);
});

test("live progress shows names instead of ids and URNs", () => {
  const args = nameArgs(
    {
      target_type: "place",
      signals: ["DBA18FE8-DE2B-470A-A681-9A1107A49351"],
      signal_tags: ["urn:tag:cuisine:qloo:biryani"],
    },
    evidence,
  );
  assert.deepEqual(args, { target_type: "place", signals: ["Galatasaray SK"], signal_tags: ["Biryani"] });
});
