import type { Language } from "./profile";

export const KIND_ORDER = ["book", "author", "food", "place", "nature", "sport", "athlete", "team", "hobby", "other"] as const;
export type Kind = (typeof KIND_ORDER)[number];
export type PromptKind = "book" | "food" | "place" | "nature" | "sport" | "interest" | "memory";

type Strings = {
  dir: "ltr" | "rtl";
  switchTo: string;
  themeModern: string;
  themeAntique: string;
  hero: string;
  tagline: string;
  intro: string;
  examplesTitle: string;
  examplesHint: string;
  stepAbout: string;
  stepLoves: string;
  stepMemory: string;
  bornIn: string;
  decade: (d: number) => string;
  grewUpIn: string;
  grewUpInPlaceholder: string;
  lovesHelp: string;
  lovesPlaceholder: string;
  addLove: string;
  remove: string;
  kinds: Record<Kind, string>;
  memoryHelp: string;
  memoryPrivate: string;
  memorySlots: Record<string, string>;
  next: string;
  back: string;
  build: string;
  working: string;
  workingHelp: string;
  writing: string;
  seconds: (s: number) => string;
  promptKinds: Record<PromptKind, string>;
  tryThis: string;
  ask: string;
  groundedIn: string;
  fromMemory: string;
  tips: string;
  limitations: string;
  print: string;
  newSession: string;
  editDetails: string;
  example: string;
  errorGeneric: string;
  reconnecting: string;
  connectionLost: string;
  privacyNote: string;
  footer: string;
  call: (tool: string, subject: string) => string;
};

const en: Strings = {
  dir: "ltr",
  switchTo: "عربي",
  themeModern: "Modern",
  themeAntique: "Antique",
  hero: "Turn “what did they love?” into “what can we talk about today?”",
  tagline: "Reminiscence sessions for people living with dementia",
  intro:
    "Familiar books, flavours, places and sport from someone's youth can open warm conversations. Tell Encore a little about your loved one, and it finds what their generation and hometown actually loved, then writes a gentle session card for you to use together.",
  examplesTitle: "See an example",
  examplesHint: "Ready-made cards from different countries",
  stepAbout: "About them",
  stepLoves: "Things they loved",
  stepMemory: "Family memory book",
  bornIn: "Born in the",
  decade: (d) => `${d}s`,
  grewUpIn: "Grew up in",
  grewUpInPlaceholder: "City, country",
  lovesHelp: "A few things they loved when they were young: a book or author, a dish, a place, a team or sport, a hobby.",
  lovesPlaceholder: "e.g. Naguib Mahfouz, Galatasaray, simit",
  addLove: "Add another",
  remove: "Remove",
  kinds: {
    book: "Book",
    author: "Author",
    food: "Food",
    place: "Place",
    nature: "Nature",
    sport: "Sport",
    athlete: "Athlete",
    team: "Team",
    hobby: "Hobby",
    other: "Other",
  },
  memoryHelp: "Optional. Encore uses these to write personal questions. Fill in only what you are comfortable with.",
  memoryPrivate: "Stays on this device. It is never sent to our server, the AI model or Qloo.",
  memorySlots: {
    relative: "A sibling or close relative",
    childhoodHome: "Where they lived as a child",
    school: "Their school",
    familyDish: "A dish someone in the family cooked",
    celebration: "A family celebration or tradition",
    work: "Their first job or life's work",
    pet: "A pet or animal they loved",
  },
  next: "Next",
  back: "Back",
  build: "Build session card",
  working: "Finding what their generation loved",
  workingHelp: "Encore is asking Qloo's taste graph about the things they loved. This usually takes about a minute.",
  writing: "Writing your session card",
  seconds: (s) => `${s}s`,
  promptKinds: {
    book: "Books",
    food: "Food",
    place: "Places",
    nature: "Nature",
    sport: "Sport",
    interest: "Interests",
    memory: "Family memory",
  },
  tryThis: "Try",
  ask: "Ask",
  groundedIn: "Found with Qloo",
  fromMemory: "From your memory book",
  tips: "Tips for the session",
  limitations: "What this card does not know",
  print: "Print",
  newSession: "New session",
  editDetails: "Edit details",
  example: "Example",
  errorGeneric: "Something went wrong. Please try again.",
  reconnecting: "Reconnecting… your card is still being built.",
  connectionLost: "The connection was lost before the card was ready. Please check your internet connection and try again.",
  privacyNote: "No names are collected. Family memories stay in your browser.",
  footer: "Encore is a conversation aid, not a medical tool. Built for the Qloo Agentic Hackathon.",
  call: (tool, subject) => {
    const s = subject ? ` ${subject}` : "";
    switch (tool) {
      case "qloo_describe":
        return `Looking up${s}`;
      case "qloo_find_tags":
        return `Finding themes for${s}`;
      case "qloo_recommend":
        return s ? `Finding what fans of${s} also love` : "Finding what the same audience loves";
      case "qloo_rank":
        return `Ranking ideas for${s || " this person"}`;
      case "qloo_where_popular":
        return `Seeing where${s} is loved`;
      case "qloo_entity_tags":
        return `Reading what defines${s}`;
      case "qloo_trends":
        return `Checking how${s} has lasted over time`;
      default:
        return `Asking Qloo${s}`;
    }
  },
};

const AR_DECADES: Record<number, string> = {
  1920: "العشرينيات",
  1930: "الثلاثينيات",
  1940: "الأربعينيات",
  1950: "الخمسينيات",
  1960: "الستينيات",
  1970: "السبعينيات",
  1980: "الثمانينيات",
  1990: "التسعينيات",
};

const ar: Strings = {
  dir: "rtl",
  switchTo: "English",
  themeModern: "عصري",
  themeAntique: "عتيق",
  hero: "حوّل سؤال «ماذا كان يحب؟» إلى «عمّ نتحدث اليوم؟»",
  tagline: "جلسات استرجاع الذكريات لمن يعيشون مع الخرف",
  intro:
    "الكتب والنكهات والأماكن والرياضة المألوفة من شباب الإنسان قد تفتح أحاديث دافئة. أخبر Encore قليلًا عمّن تحب، فيكتشف ما أحبّه جيله وأهل مدينته فعلًا، ثم يكتب لك بطاقة جلسة لطيفة تستخدمانها معًا.",
  examplesTitle: "شاهد مثالًا",
  examplesHint: "بطاقات جاهزة من بلدان مختلفة",
  stepAbout: "عنه أو عنها",
  stepLoves: "أشياء أحبّها",
  stepMemory: "دفتر ذكريات العائلة",
  bornIn: "وُلد في",
  decade: (d) => AR_DECADES[d] ?? String(d),
  grewUpIn: "نشأ في",
  grewUpInPlaceholder: "المدينة، البلد",
  lovesHelp: "بعض ما أحبّه في صغره: كتاب أو كاتب، طبق، مكان، فريق أو رياضة، هواية.",
  lovesPlaceholder: "مثال: نجيب محفوظ، الهلال، الكبسة",
  addLove: "أضف المزيد",
  remove: "حذف",
  kinds: {
    book: "كتاب",
    author: "كاتب",
    food: "طعام",
    place: "مكان",
    nature: "طبيعة",
    sport: "رياضة",
    athlete: "رياضي",
    team: "فريق",
    hobby: "هواية",
    other: "أخرى",
  },
  memoryHelp: "اختياري. يستخدمها Encore لكتابة أسئلة شخصية. املأ فقط ما ترتاح لمشاركته.",
  memoryPrivate: "تبقى على هذا الجهاز، ولا تُرسل أبدًا إلى خادمنا أو إلى نموذج الذكاء الاصطناعي أو إلى Qloo.",
  memorySlots: {
    relative: "أخ أو أخت أو قريب مقرّب",
    childhoodHome: "المكان الذي عاش فيه في طفولته",
    school: "مدرسته",
    familyDish: "طبق كان يطبخه أحد أفراد العائلة",
    celebration: "مناسبة أو عادة عائلية",
    work: "أول عمل له أو عمل حياته",
    pet: "حيوان أليف أو حيوان أحبّه",
  },
  next: "التالي",
  back: "رجوع",
  build: "أنشئ بطاقة الجلسة",
  working: "نبحث عمّا أحبّه جيله",
  workingHelp: "يسأل Encore شبكة الأذواق في Qloo عن الأشياء التي أحبّها. يستغرق ذلك عادةً نحو دقيقة.",
  writing: "نكتب بطاقة الجلسة",
  seconds: (s) => `${s} ث`,
  promptKinds: {
    book: "كتب",
    food: "طعام",
    place: "أماكن",
    nature: "طبيعة",
    sport: "رياضة",
    interest: "اهتمامات",
    memory: "ذكريات العائلة",
  },
  tryThis: "جرّبا",
  ask: "اسأل",
  groundedIn: "وُجد عبر Qloo",
  fromMemory: "من دفتر ذكرياتك",
  tips: "نصائح للجلسة",
  limitations: "ما لا تعرفه هذه البطاقة",
  print: "طباعة",
  newSession: "جلسة جديدة",
  editDetails: "تعديل البيانات",
  example: "مثال",
  errorGeneric: "حدث خطأ ما. يُرجى المحاولة مرة أخرى.",
  reconnecting: "نعيد الاتصال… ما زلنا نُعدّ بطاقتك.",
  connectionLost: "انقطع الاتصال قبل أن تجهز البطاقة. يُرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.",
  privacyNote: "لا نجمع أي أسماء. تبقى ذكريات العائلة في متصفحك.",
  footer: "Encore أداة مساعدة على الحديث، وليس أداة طبية. صُمّم لهاكاثون \u2068Qloo Agentic\u2069",
  call: (tool, subject) => {
    const s = subject ? ` ${subject}` : "";
    switch (tool) {
      case "qloo_describe":
        return `نبحث عن${s}`;
      case "qloo_find_tags":
        return `نجد موضوعات تخص${s}`;
      case "qloo_recommend":
        return s ? `نكتشف ما يحبه أيضًا محبو${s}` : "نكتشف ما يحبه الجمهور نفسه";
      case "qloo_rank":
        return `نرتّب الأفكار${s}`;
      case "qloo_where_popular":
        return `نرى أين يُحَب${s}`;
      case "qloo_entity_tags":
        return `نقرأ ما يميّز${s}`;
      case "qloo_trends":
        return `نتحقق من استمرار${s} عبر الزمن`;
      default:
        return `نسأل Qloo${s}`;
    }
  },
};

export const STRINGS: Record<Language, Strings> = { en, ar };

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-/i;

// Readable subject for a live Qloo call: names, not UUIDs or tag URNs.
export function callSubject(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  const pick = (v: unknown): string[] =>
    (Array.isArray(v) ? v : v == null ? [] : [v])
      .map(String)
      .filter((x) => !UUID.test(x))
      .map((x) => (x.startsWith("urn:tag:") ? x.split(":").pop()!.replace(/_/g, " ") : x));
  const names = [
    ...pick(a.entity),
    ...pick(a.query),
    ...pick(a.signals),
    ...pick(a.signal_tags),
    ...pick(a.entities),
    ...pick(a.options),
  ];
  const unique = [...new Set(names)].slice(0, 3);
  // First-strong isolates keep the quotes right in Arabic (RTL) text.
  return unique.length ? `\u2068“${unique.join(", ")}”\u2069` : "";
}
