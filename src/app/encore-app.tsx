"use client";

import { useEffect, useRef, useState } from "react";
import { BASELINES } from "@/data/baselines";
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
type LiveCall = { tool: string; subject: string; target?: string };

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
  const [reconnecting, setReconnecting] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [withoutQloo, setWithoutQloo] = useState(false);
  const [liveBaseline, setLiveBaseline] = useState<SessionCard | null>(null);
  const [baselineState, setBaselineState] = useState<"idle" | "loading" | "error">("idle");
  const [showCalls, setShowCalls] = useState(false);
  const lastRequest = useRef<object | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const t = STRINGS[lang];

  // Restore saved state after mount (never during render, so SSR matches).
  useEffect(() => {
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

  // For shared computers: forget the profile, memory book and last card here.
  function clearDetails() {
    for (const key of ["encore.memory", "encore.profile", "encore.lastCard"]) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* storage unavailable */
      }
    }
    setMemory({});
    setGrewUpIn("");
    setBirthDecade(1950);
    setLoves([{ kind: "book", text: "" }]);
    setCleared(true);
  }

  // Live cards: ask the same model for a card without Qloo, on first use.
  async function showWithoutQloo() {
    setWithoutQloo(true);
    if (example || liveBaseline || !lastRequest.current) return;
    setBaselineState("loading");
    try {
      const res = await fetch("/api/baseline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(lastRequest.current),
      });
      const data = await res.json();
      if (!res.ok || !data.card) throw new Error(data.error);
      setLiveBaseline(data.card);
      setBaselineState("idle");
    } catch {
      setBaselineState("error");
    }
  }

  function showExample(ex: Example) {
    const exCard = ex.cards[lang];
    if (!exCard) return;
    setExample(ex);
    setWithoutQloo(false);
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
    setWithoutQloo(false);
    setLiveBaseline(null);
    setBaselineState("idle");
    setShowCalls(false);
    setElapsed(0);
    const started = Date.now();
    timer.current = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);

    // Only the NAMES of filled memory slots leave the browser, never their values.
    const memorySlots = (Object.keys(memory) as MemorySlot[]).filter((k) => memory[k]?.trim());
    let jobId = "";
    let seen = 0; // events received, excluding job and ping lines
    let finished = false;

    // Reads one NDJSON response; returns when the stream ends (or throws if it breaks).
    const read = async (res: Response) => {
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw Object.assign(new Error(data.error ?? t.errorGeneric), { fatal: true });
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
          if (event.type === "job") {
            jobId = event.id;
            continue;
          }
          if (event.type === "ping") continue;
          seen++;
          setReconnecting(false);
          if (event.type === "call") {
            setCalls((c) => [...c, { tool: event.tool, subject: callSubject(event.args), target: event.args?.target_type }]);
          } else if (event.type === "retry") {
            // The primary model failed; the fallback starts the research again.
            setCalls([]);
            setWriting(false);
          } else if (event.type === "writing") {
            setWriting(true);
          } else if (event.type === "done") {
            finished = true;
            setCard(fillMemory(event.card, memory));
            save("encore.lastCard", event.card);
            setStep("card");
          } else if (event.type === "error") {
            throw Object.assign(new Error(event.error), { fatal: true });
          }
        }
      }
    };

    // A phone that locks or switches apps drops the connection; the card keeps
    // building on the server, so wait until the page is visible and reconnect.
    const visible = () =>
      document.hidden
        ? new Promise<void>((resolve) =>
            document.addEventListener("visibilitychange", function onShow() {
              if (!document.hidden) {
                document.removeEventListener("visibilitychange", onShow);
                resolve();
              }
            }),
          )
        : Promise.resolve();

    try {
      try {
        await read(
          await fetch("/api/plan", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(
              (lastRequest.current = {
                profile: { birthDecade, grewUpIn: grewUpIn.trim(), loves: validLoves.slice(0, 12) },
                memorySlots,
                language: lang,
              }),
            ),
          }),
        );
      } catch (err) {
        if ((err as { fatal?: boolean }).fatal || !jobId) throw err;
      }
      for (let attempt = 0; !finished && jobId && attempt < 8; attempt++) {
        setReconnecting(true);
        await visible();
        await new Promise((r) => setTimeout(r, 1500 + attempt * 1000));
        try {
          await read(await fetch(`/api/plan?id=${encodeURIComponent(jobId)}&from=${seen}`));
        } catch (err) {
          if ((err as { fatal?: boolean }).fatal) throw err;
        }
      }
      if (!finished) throw new Error(t.connectionLost);
    } catch (err) {
      const message = err instanceof Error && err.message && !(err instanceof TypeError) ? err.message : t.connectionLost;
      setError(message);
      setStep("memory");
    } finally {
      setReconnecting(false);
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
                    onChange={(e) => {
                      setMemory({ ...memory, [slot]: e.target.value });
                      setCleared(false);
                    }}
                  />
                ))}
                {error && <p className="rounded-xl bg-accent-soft px-4 py-3 text-accent">{error}</p>}
                {cleared ? (
                  <p className="text-sm text-sage">{t.clearedDetails}</p>
                ) : (
                  <button className="self-start text-sm text-muted underline" onClick={clearDetails}>
                    {t.clearDetails}
                  </button>
                )}
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
          {reconnecting && <p className="mt-3 rounded-xl bg-accent-soft px-4 py-2 text-sm text-accent">{t.reconnecting}</p>}
          <ul className="mt-6 flex flex-col gap-2">
            {calls.map((c, i) => (
              <li key={i} className="tile flex items-center gap-3 px-4 py-2 text-sm">
                <span className="text-sage">✓</span>
                <span>{t.call(c.tool, c.subject, c.target)}</span>
              </li>
            ))}
            <li className="flex items-center gap-3 px-4 py-2 text-sm text-muted">
              <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-accent" />
              <span>{writing ? t.writing : "…"}</span>
            </li>
          </ul>
        </section>
      )}

      {step === "card" && card && (() => {
        const baseline = example ? BASELINES[example.id]?.[lang] : (liveBaseline ?? undefined);
        const shown = withoutQloo && baseline ? fillMemory(baseline, example ? example.memory : memory) : card;
        const canCompare = Boolean(example ? baseline : lastRequest.current);
        return (
        <article className="surface p-6 sm:p-10">
          {example && <p className="mb-2 text-sm font-medium uppercase tracking-wide text-accent">{t.example}</p>}
          {canCompare && (
            <div className="no-print mb-6 flex flex-col gap-3">
              <div className="flex gap-2" role="group">
                <button
                  className={`chip px-4 py-2 text-sm ${!withoutQloo ? "bg-accent text-accent-ink" : ""}`}
                  aria-pressed={!withoutQloo}
                  onClick={() => setWithoutQloo(false)}
                >
                  {t.withQloo}
                </button>
                <button
                  className={`chip px-4 py-2 text-sm ${withoutQloo ? "bg-accent text-accent-ink" : ""}`}
                  aria-pressed={withoutQloo}
                  onClick={showWithoutQloo}
                >
                  {t.withoutQloo}
                </button>
              </div>
              {withoutQloo && (
                <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent" aria-live="polite">
                  {baselineState === "loading" && !baseline
                    ? t.baselineLoading
                    : baselineState === "error" && !baseline
                      ? t.baselineError
                      : t.withoutBanner}
                </p>
              )}
            </div>
          )}
          <h2 className="headline font-display text-3xl font-semibold leading-tight">{shown.theme}</h2>
          <p className="mt-4 text-lg leading-relaxed">{shown.opener}</p>
          <p className="ornament mt-6">❦ ❦ ❦</p>
          {!example && calls.length > 0 && !(withoutQloo && baseline) && (
            <div className="tile mt-6 px-5 py-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">🔎 {t.howFound(calls.length)}</span>
                <button className="no-print text-accent underline" aria-expanded={showCalls} onClick={() => setShowCalls(!showCalls)}>
                  {showCalls ? t.hide : t.show}
                </button>
              </div>
              {showCalls && (
                <>
                  <p className="mt-2 text-muted">{t.howFoundHelp}</p>
                  <ol className="mt-2 flex flex-col gap-1 ps-8">
                    {calls.map((c, i) => (
                      <li key={i} className="list-decimal">
                        {t.call(c.tool, c.subject, c.target)}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          )}

          <ol className="mt-8 flex flex-col gap-4">
            {shown.prompts.map((p, i) => (
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
                  {p.kind === "memory" || /memory book/i.test(p.source)
                    ? t.fromMemory
                    : withoutQloo && baseline
                      ? t.noSource
                      : `${t.groundedIn}: ${p.source}`}
                </p>
              </li>
            ))}
          </ol>

          {shown.caregiverTips.length > 0 && (
            <section className="mt-8">
              <h3 className="headline font-display text-xl font-semibold">{t.tips}</h3>
              <ul className="mt-2 list-disc ps-6 leading-relaxed">
                {shown.caregiverTips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </section>
          )}

          {shown.limitations.length > 0 && (
            <details className="mt-6 text-sm text-muted">
              <summary className="cursor-pointer font-medium">{t.limitations}</summary>
              <ul className="mt-2 list-disc ps-6">
                {shown.limitations.map((l, i) => (
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
        );
      })()}

      <footer className="no-print mt-auto pt-10 text-center text-xs text-muted">{t.footer}</footer>
    </div>
  );
}
