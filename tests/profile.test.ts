import assert from "node:assert/strict";
import { test } from "node:test";
import { PlanRequest, fillMemory, type SessionCard } from "../src/lib/profile";

const card: SessionCard = {
  theme: "Days with {{relative}}",
  opener: "Hello",
  prompts: [
    { kind: "memory", title: "Kitchen", activity: "Cook {{familyDish}}", question: "Tell me about cooking with {{relative}}.", source: "memory book" },
    { kind: "memory", title: "Pets", activity: "Look at photos", question: "Tell me about {{pet}}.", source: "memory book" },
    { kind: "food", title: "Koshari", activity: "Cook together", question: "Tell me about koshari.", source: "Koshari" },
  ],
  caregiverTips: ["Ask {{relative}} to join"],
  limitations: [],
};

test("fills memory placeholders in the browser, everywhere on the card", () => {
  const out = fillMemory(card, { relative: "your sister Hoda", familyDish: "molokhia" });
  assert.equal(out.theme, "Days with your sister Hoda");
  assert.equal(out.prompts[0].question, "Tell me about cooking with your sister Hoda.");
  assert.equal(out.prompts[0].activity, "Cook molokhia");
  assert.equal(out.caregiverTips[0], "Ask your sister Hoda to join");
});

test("drops memory prompts whose detail the caregiver left empty", () => {
  const out = fillMemory(card, { relative: "your sister Hoda", familyDish: "molokhia", pet: "  " });
  assert.deepEqual(
    out.prompts.map((p) => p.title),
    ["Kitchen", "Koshari"],
  );
});

test("the server accepts only public taste signals and slot names", () => {
  const ok = PlanRequest.safeParse({
    profile: { birthDecade: 1950, grewUpIn: "Cairo, Egypt", loves: [{ kind: "food", text: "koshari" }] },
    memorySlots: ["relative"],
  });
  assert.equal(ok.success, true);
  assert.equal(ok.success && ok.data.language, "en");

  const values = PlanRequest.safeParse({
    profile: { birthDecade: 1950, grewUpIn: "Cairo", loves: [{ kind: "food", text: "koshari" }] },
    memorySlots: ["your sister Hoda"],
  });
  assert.equal(values.success, false, "memory values must never be accepted as slots");

  const tooMany = PlanRequest.safeParse({
    profile: { birthDecade: 1950, grewUpIn: "Cairo", loves: Array.from({ length: 13 }, () => ({ kind: "food", text: "x" })) },
  });
  assert.equal(tooMany.success, false);

  const decade = PlanRequest.safeParse({ profile: { birthDecade: 1850, grewUpIn: "Cairo", loves: [{ kind: "food", text: "x" }] } });
  assert.equal(decade.success, false);
});
