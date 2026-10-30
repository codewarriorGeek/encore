"use client";

import { useEffect, useRef, useState } from "react";
import { EXAMPLES, type Example } from "@/data/examples";
import { KIND_ORDER, STRINGS, callSubject, type Kind } from "@/lib/i18n";
import {
  MEMORY_SLOTS,
  fillMemory,
  type Language,
  type MemoryBook,
  type MemorySlot,
  type SessionCard,
} from "@/lib/profile";

type Love = { kind: Kind; text: string };
type Step = "about" | "loves" | "memory" | "working" | "card";
type Theme = "modern" | "antique";
type LiveCall = { tool: string; subject: string };

const DECADES = [1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990];
const PROMPT_ICON: Record<string, string> = {
  book: "📚",
  food: "🍲",
  place: "🏛️",
  nature: "🌿",
  sport: "⚽",
  interest: "✨",
  memory: "💛",
};

// Browser storage is a convenience only; every read and write may fail.
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export default function EncoreApp() {
  const [lang, setLang] = useState<Language>("en");
  const [theme, setTheme] = useState<Theme>("modern");
  const [step, setStep] = useState<Step>("about");
  const [birthDecade, setBirthDecade] = useState(1950);
  const [grewUpIn, setGrewUpIn] = useState("");
  const [loves, setLoves] = useState<Love[]>([{ kind: "book", text: "" }]);
  const [memory, setMemory] = useState<MemoryBook>({});
  const [card, setCard] = useState<SessionCard | null>(null);
  const [example, setExample] = useState<Example | null>(null);
  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [writing, setWriting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const t = STRINGS[lang];

  // Restore saved state after mount (never during render, so SSR matches).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from browser storage
    setLang(load<Language>("encore.lang", "en"));
    setTheme(load<Theme>("encore.theme", "modern"));
    setMemory(load<MemoryBook>("encore.memory", {}));
    const saved = load<{ birthDecade: number; grewUpIn: string; loves: Love[] } | null>("encore.profile", null);
    if (saved) {
      setBirthDecade(saved.birthDecade);
      setGrewUpIn(saved.grewUpIn);
      if (saved.loves?.length) setLoves(saved.loves);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;
    save("encore.lang", lang);
  }, [lang, t.dir]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    save("encore.theme", theme);
  }, [theme]);

  useEffect(() => save("encore.memory", memory), [memory]);
  useEffect(() => save("encore.profile", { birthDecade, grewUpIn, loves }), [birthDecade, grewUpIn, loves]);
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const validLoves = loves.filter((l) => l.text.trim());
  // Only examples that have a card in the current language.
  const examples = EXAMPLES.filter((ex) => ex.cards[lang]);
  const canBuild = grewUpIn.trim().length >= 2 && validLoves.length > 0;

  function showExample(ex: Example) {
    const exCard = ex.cards[lang];
    if (!exCard) return;
    setExample(ex);
    setCard(fillMemory(exCard, ex.memory));
    setError("");
    setStep("card");
  }

  async function build() {
    setStep("working");
    setCalls([]);
    setWriting(false);
    setError("");
    setExample(null);
    setElapsed(0);
    const started = Date.now();
    timer.current = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);

    // Only the NAMES of filled memory slots leave the browser, never their values.
    const memorySlots = (Object.keys(memory) as MemorySlot[]).filter((k) => memory[k]?.trim());
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile: { birthDecade, grewUpIn: grewUpIn.trim(), loves: validLoves.slice(0, 12) },
          memorySlots,
          language: lang,
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t.errorGeneric);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "call") {
            setCalls((c) => [...c, { tool: event.tool, subject: callSubject(event.args) }]);
          } else if (event.type === "retry") {
            // The primary model failed; the fallback starts the research again.
            setCalls([]);
            setWriting(false);
          } else if (event.type === "writing") {
            setWriting(true);
          } else if (event.type === "done") {
            const filled = fillMemory(event.card, memory);
            setCard(filled);
            save("encore.lastCard", event.card);
            setStep("card");
          } else if (event.type === "error") {
            throw new Error(event.error);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t.errorGeneric);
      setStep("memory");
    } finally {
      if (timer.current) clearInterval(timer.current);
    }
  }

  const input =
    "w-full rounded-xl border border-line bg-tile px-4 py-3 text-base text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
  const primary =
    "btn-primary px-6 py-3 font-medium shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";
  const secondary = "chip px-5 py-3 font-medium text-ink transition hover:bg-accent-soft";
  const steps: Step[] = ["about", "loves", "memory"];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 sm:py-10">
      <header className="no-print mb-8 flex items-start justify-between gap-4">
        <div>
          <button onClick={() => setStep("about")} className="headline headline-accent font-display text-3xl font-bold sm:text-4xl">
            Encore
          </button>
          <p className="mt-1 text-muted">{t.tagline}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setTheme(theme === "modern" ? "antique" : "modern")}
            className={`${secondary} py-2 text-sm`}
            aria-label={theme === "modern" ? t.themeAntique : t.themeModern}
          >
            {theme === "modern" ? `❦ ${t.themeAntique}` : `✦ ${t.themeModern}`}
          </button>
          <button onClick={() => setLang(lang === "en" ? "ar" : "en")} className={`${secondary} py-2 text-sm`}>
            {t.switchTo}
          </button>
        </div>
      </header>

      {steps.includes(step) && (
        <>
          {step === "about" && (
            <section className="mb-8">
              <h2 className="headline font-display text-3xl font-bold leading-tight sm:text-5xl">{t.hero}</h2>
              <p className="ornament mt-4">❦ ❦ ❦</p>
              <p className="mt-4 text-lg leading-relaxed text-muted">{t.intro}</p>
              {examples.length > 0 && (
                <div className="mt-6">
                  <h2 className="headline font-display text-lg font-semibold">{t.examplesTitle}</h2>
                  <p className="text-sm text-muted">{t.examplesHint}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {examples.map((ex) => (
                      <button key={ex.id} onClick={() => showExample(ex)} className={`${secondary} py-2 text-sm`}>
                        {ex.label[lang]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          <ol className="mb-6 flex gap-2 text-sm">
            {steps.map((s, i) => (
              <li
                key={s}
                className={`flex-1 rounded-full px-3 py-2 text-center ${
                  s === step ? "bg-accent text-accent-ink" : "bg-accent-soft text-muted"
                }`}
              >
                {i + 1}. {s === "about" ? t.stepAbout : s === "loves" ? t.stepLoves : t.stepMemory}
              </li>
            ))}
          </ol>

          <div className="surface p-5 sm:p-8">
            {step === "about" && (
              <div className="flex flex-col gap-5">
                <label className="flex flex-col gap-2">
                  <span className="font-medium">{t.bornIn}</span>
                  <select className={input} value={birthDecade} onChange={(e) => setBirthDecade(Number(e.target.value))}>
                    {DECADES.map((d) => (
                      <option key={d} value={d}>
                        {t.decade(d)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="font-medium">{t.grewUpIn}</span>
                  <input
                    className={input}
                    value={grewUpIn}
                    maxLength={80}
                    placeholder={t.grewUpInPlaceholder}
                    onChange={(e) => setGrewUpIn(e.target.value)}
                  />
                </label>
                <div className="flex justify-end">
                  <button className={primary} disabled={grewUpIn.trim().length < 2} onClick={() => setStep("loves")}>
                    {t.next}
                  </button>
                </div>
              </div>
            )}

            {step === "loves" && (
              <div className="flex flex-col gap-4">
                <p className="text-muted">{t.lovesHelp}</p>
                {loves.map((love, i) => (
                  <div key={i} className="flex flex-col gap-2 sm:flex-row">
                    <select
                      className={`${input} sm:w-40`}
                      value={love.kind}
                      onChange={(e) => setLoves(loves.map((l, j) => (j === i ? { ...l, kind: e.target.value as Kind } : l)))}
                    >
                      {KIND_ORDER.map((k) => (
                        <option key={k} value={k}>
                          {t.kinds[k]}
                        </option>
                      ))}
                    </select>
                    <input
                      className={input}
                      value={love.text}
                      maxLength={120}
                      placeholder={t.lovesPlaceholder}
                      onChange={(e) => setLoves(loves.map((l, j) => (j === i ? { ...l, text: e.target.value } : l)))}
                    />
                    {loves.length > 1 && (
                      <button
                        className="self-end px-2 py-3 text-sm text-muted underline sm:self-auto"
                        onClick={() => setLoves(loves.filter((_, j) => j !== i))}
                      >
                        {t.remove}
                      </button>
                    )}
                  </div>
                ))}
                {loves.length < 12 && (
                  <button
                    className="self-start text-accent underline"
                    onClick={() => setLoves([...loves, { kind: "food", text: "" }])}
                  >
                    + {t.addLove}
                  </button>
                )}
                <div className="flex justify-between">
                  <button className={secondary} onClick={() => setStep("about")}>
                    {t.back}
                  </button>
                  <button className={primary} disabled={validLoves.length === 0} onClick={() => setStep("memory")}>
                    {t.next}
                  </button>
                </div>
              </div>
            )}

            {step === "memory" && (
              <div className="flex flex-col gap-4">
                <p className="text-muted">{t.memoryHelp}</p>
                <p className="rounded-xl bg-sage-soft px-4 py-3 text-sm text-sage">🔒 {t.memoryPrivate}</p>
                {(Object.keys(MEMORY_SLOTS) as MemorySlot[]).map((slot) => (
                  <input
                    key={slot}
                    className={input}
                    maxLength={120}
                    placeholder={t.memorySlots[slot]}
                    aria-label={t.memorySlots[slot]}
                    value={memory[slot] ?? ""}
                    onChange={(e) => setMemory({ ...memory, [slot]: e.target.value })}
                  />
                ))}
                {error && <p className="rounded-xl bg-accent-soft px-4 py-3 text-accent">{error}</p>}
                <div className="flex justify-between">
                  <button className={secondary} onClick={() => setStep("loves")}>
                    {t.back}
                  </button>
                  <button className={primary} disabled={!canBuild} onClick={build}>
                    {t.build}
                  </button>
                </div>
              </div>
            )}
          </div>
          <p className="mt-4 text-center text-sm text-muted">{t.privacyNote}</p>
        </>
      )}

      {step === "working" && (
        <section className="surface p-6 sm:p-8" aria-live="polite">
          <div className="flex items-center justify-between gap-4">
            <h2 className="headline font-display text-2xl font-semibold">{writing ? t.writing : t.working}</h2>
            <span className="tabular-nums text-muted">{t.seconds(elapsed)}</span>
          </div>
          <p className="mt-2 text-muted">{t.workingHelp}</p>
          <ul className="mt-6 flex flex-col gap-2">
            {calls.map((c, i) => (
              <li key={i} className="tile flex items-center gap-3 px-4 py-2 text-sm">
                <span className="text-sage">✓</span>
                <span>{t.call(c.tool, c.subject)}</span>
              </li>
            ))}
            <li className="flex items-center gap-3 px-4 py-2 text-sm text-muted">
              <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-accent" />
              <span>{writing ? t.writing : "…"}</span>
            </li>
          </ul>
        </section>
      )}

      {step === "card" && card && (
        <article className="surface p-6 sm:p-10">
          {example && <p className="mb-2 text-sm font-medium uppercase tracking-wide text-accent">{t.example}</p>}
          <h2 className="headline font-display text-3xl font-semibold leading-tight">{card.theme}</h2>
          <p className="mt-4 text-lg leading-relaxed">{card.opener}</p>
          <p className="ornament mt-6">❦ ❦ ❦</p>

          <ol className="mt-8 flex flex-col gap-4">
            {card.prompts.map((p, i) => (
              <li key={i} className="tile px-6 py-5">
                <div className="flex items-center gap-2 text-sm text-muted">
                  <span aria-hidden>{PROMPT_ICON[p.kind] ?? "✨"}</span>
                  <span>{t.promptKinds[p.kind]}</span>
                </div>
                <h3 className="mt-1 headline font-display text-xl font-semibold">{p.title}</h3>
                <p className="mt-2">
                  <span className="font-medium">{t.tryThis}: </span>
                  {p.activity}
                </p>
                <p className="mt-3 border-s-4 border-accent ps-4 text-lg italic">{p.question}</p>
                <p className="mt-3 text-xs text-muted">
                  {p.kind === "memory" || /memory book/i.test(p.source) ? t.fromMemory : `${t.groundedIn}: ${p.source}`}
                </p>
              </li>
            ))}
          </ol>

          {card.caregiverTips.length > 0 && (
            <section className="mt-8">
              <h3 className="headline font-display text-xl font-semibold">{t.tips}</h3>
              <ul className="mt-2 list-disc ps-6 leading-relaxed">
                {card.caregiverTips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </section>
          )}

          {card.limitations.length > 0 && (
            <details className="mt-6 text-sm text-muted">
              <summary className="cursor-pointer font-medium">{t.limitations}</summary>
              <ul className="mt-2 list-disc ps-6">
                {card.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="no-print mt-8 flex flex-wrap gap-3">
            <button className={primary} onClick={() => window.print()}>
              {t.print}
            </button>
            <button
              className={secondary}
              onClick={() => {
                setCard(null);
                setExample(null);
                setStep("about");
              }}
            >
              {t.newSession}
            </button>
            {!example && (
              <button className={secondary} onClick={() => setStep("loves")}>
                {t.editDetails}
              </button>
            )}
          </div>
        </article>
      )}

      <footer className="no-print mt-auto pt-10 text-center text-xs text-muted">{t.footer}</footer>
    </div>
  );
}
