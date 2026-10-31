import assert from "node:assert/strict";
import { test } from "node:test";
import { STRINGS, callSubject } from "../src/lib/i18n";

test("English and Arabic define the same strings", () => {
  assert.deepEqual(Object.keys(STRINGS.ar).sort(), Object.keys(STRINGS.en).sort());
  assert.equal(STRINGS.ar.dir, "rtl");
});

test("live call subjects never show ids, and tags read as words", () => {
  const subject = callSubject({ signals: ["DBA18FE8-DE2B-470A-A681-9A1107A49351", "Galatasaray SK"], signal_tags: ["urn:tag:cuisine:qloo:biryani"] });
  assert.match(subject, /Galatasaray SK, biryani/);
  assert.doesNotMatch(subject, /DBA18FE8|urn:tag/);
});

test("recommendation steps say what they look for", () => {
  assert.equal(STRINGS.en.call("qloo_recommend", "“Galatasaray SK”", "place"), "Finding places that fans of “Galatasaray SK” also love");
  assert.match(STRINGS.ar.call("qloo_recommend", "“Galatasaray SK”", "book"), /كتبًا/);
});
