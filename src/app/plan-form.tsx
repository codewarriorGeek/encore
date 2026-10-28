"use client";

import { useState } from "react";
import { MEMORY_SLOTS, fillMemory, type MemoryBook, type MemorySlot, type SessionCard } from "@/lib/profile";

// Scaffold test form. The real caregiver flow replaces this.
export default function PlanForm() {
  const [birthDecade, setBirthDecade] = useState(1950);
  const [grewUpIn, setGrewUpIn] = useState("Madinah, Saudi Arabia");
  const [loves, setLoves] = useState("other: Umar ibn al-Khattab\nsport: football\nfood: biryani");
  const [memory, setMemory] = useState<MemoryBook>({});
  const [card, setCard] = useState<SessionCard | null>(null);
  const [meta, setMeta] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setCard(null);
    const lovesList = loves
      .split("\n")
      .map((line) => line.split(":"))
      .filter((p) => p.length >= 2)
      .map(([kind, ...rest]) => ({ kind: kind.trim(), text: rest.join(":").trim() }));
    // Only the NAMES of filled memory slots leave the browser, never their values.
    const memorySlots = (Object.keys(memory) as MemorySlot[]).filter((k) => memory[k]?.trim());
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: { birthDecade, grewUpIn, loves: lovesList }, memorySlots }),
    });
    const data = await res.json();
    if (res.ok) {
      setCard(fillMemory(data.card, memory));
      setMeta(`${data.provider}: research ${data.timings.researchMs} ms, card ${data.timings.cardMs} ms`);
    } else setError(data.error ?? "Something went wrong");
    setBusy(false);
  }

  const field = "w-full rounded border border-zinc-300 bg-transparent p-2 dark:border-zinc-700";
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        Born in the
        <input type="number" step={10} className={field} value={birthDecade} onChange={(e) => setBirthDecade(Number(e.target.value))} />
      </label>
      <label className="flex flex-col gap-1">
        Grew up in
        <input className={field} value={grewUpIn} onChange={(e) => setGrewUpIn(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        Things they loved (one per line, kind: thing)
        <textarea rows={4} className={field} value={loves} onChange={(e) => setLoves(e.target.value)} />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1">Private memory book (stays on this device)</legend>
        {(Object.entries(MEMORY_SLOTS) as [MemorySlot, string][]).map(([slot, label]) => (
          <input
            key={slot}
            className={field}
            placeholder={label}
            value={memory[slot] ?? ""}
            onChange={(e) => setMemory({ ...memory, [slot]: e.target.value })}
          />
        ))}
      </fieldset>
      <button disabled={busy} className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
        {busy ? "Building session..." : "Build session card"}
      </button>
      {error && <p className="text-red-600">{error}</p>}
      {meta && <p className="text-sm text-zinc-500">{meta}</p>}
      {card && <pre className="overflow-x-auto whitespace-pre-wrap text-sm">{JSON.stringify(card, null, 2)}</pre>}
    </form>
  );
}
