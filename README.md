# Encore

Reminiscence sessions for people living with dementia, grounded in what their generation and hometown actually loved. In English and Arabic.

**Live demo:** https://encore.fawzai.com · Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/).

## The problem

Reminiscence is a common, low-cost way to support conversation with people living with dementia: familiar books, flavours, places and sport from their youth can bring back stories and a sense of self. Family caregivers are encouraged to do it, but they rarely know what someone who grew up in 1950s Madinah or Istanbul or Chicago would recognise. A general chatbot fills that gap with generic nostalgia.

Encore asks the caregiver for a few public facts (birth decade, hometown, a handful of things the person loved), uses Qloo's taste graph to find related, era-appropriate things they are likely to recognise, and writes a gentle **session card**: a theme, an opener, 5 to 7 prompts (each with a simple activity and one open "Tell me about..." question), tips and limitations. The caregiver can print it and use it at the kitchen table.

## Why it needs Qloo

An LLM alone produces the same nostalgia for everyone. Qloo connects what this person loved to specific books, clubs, dishes, landmarks and natural places that the same audience loves, across domains and locations. Encore checks every prompt on the card against the actual Qloo results and drops anything Qloo did not return, so the card is grounded in Qloo, not in the model's guesses.

## How it works

```
Caregiver (browser)                 Encore server (Next.js)                       Qloo
-------------------                 -----------------------                       ----
profile: decade, hometown,  ----->  1. Research: LLM + Qloo MCP tools  <-------->  qloo mcp (stdio)
things they loved                      qloo_describe / qloo_find_tags                 -> Qloo Insights API
names of filled memory                 -> qloo_recommend / qloo_rank /
fields (never values)                     qloo_where_popular
                                       (3 to 12 calls, streamed live to the UI)
                                    2. Card: LLM, no tools, writes {{placeholders}}
                                    3. Grounding: drop prompts whose source Qloo
live progress + card       <-----     never returned; replace ids with names;
fill {{placeholders}} from            remove music, TV, film and politics
the local memory book
```

1. **Research.** The model sees only public taste signals. It resolves each loved thing to a Qloo entity or tag, then asks the taste question with an older audience (`demographic`), `filter_location` for the hometown and `exclude_tags` for modern chains. Older and non-Western entities often exist in Qloo search without taste data, so it falls back to the matching cuisine, genre, region or occupation tag. It must make at least 3 Qloo calls and stops at 12.
2. **Session card.** A second call with no tools writes the card in English or Arabic. Each non-memory prompt names the Qloo entity or tag it came from.
3. **Grounding in code.** The server keeps the raw Qloo results and drops any prompt whose source is not in them. Leaked Qloo ids and tag URNs are replaced with the names Qloo returned. Music, TV, film and politics are removed whatever the model writes.

### Example: request to result

A real run on the live demo. Profile: born in the 1950s, grew up in Cairo, loved Naguib Mahfouz, Al Ahly, koshari and the Nile; one memory field filled in. Research took 32 s, the card 16 s. Qloo calls (abridged):

```
qloo_describe   {"entity":"Naguib Mahfouz","type":"author"}
qloo_describe   {"entity":"Al Ahly","type":"brand"}
qloo_find_tags  {"query":"koshari Egyptian food","limit":5}
qloo_describe   {"entity":"Nile","type":"place"}
qloo_find_tags  {"query":"Nile river Egypt geography nature","limit":5}
qloo_recommend  {"target_type":"book","signals":["<Naguib Mahfouz id>"],"demographic":"people 55 and older","filter_location":"Cairo, Egypt"}
qloo_recommend  {"target_type":"brand","signals":["<Al Ahly SC id>"],"demographic":"people 55 and older","filter_location":"Cairo, Egypt"}
qloo_recommend  {"target_type":"place","signal_tags":["urn:tag:cuisine:qloo:koshari"],"demographic":"people 55 and older","filter_location":"Cairo, Egypt","exclude_tags":[...]}
qloo_recommend  {"target_type":"place","signal_tags":["urn:tag:view:qloo:nile_river"],"demographic":"people 55 and older","filter_location":"Cairo, Egypt"}
...
```

The card's prompts and their Qloo sources: *A Taste of Street Culture* (Koshari), *By the River* (Nile River), *The Pride of the City* (Al Ahly SC), *Stories of the City* (Naguib Mahfouz), plus two memory-book prompts filled in by the browser.

## Privacy

- **The family memory book never leaves the browser.** Details such as a close relative or a family dish are stored only in the browser. The server is told which fields are filled in, never their values. The model writes placeholders such as `{{relative}}`, and the browser fills them in.
- **No names are collected**, and no personal data is sent to Qloo, following the kit's safe-use guidance.
- The profile and memory book are kept in the browser's local storage for convenience and can be cleared with the browser's site data.

## Models

Claude Opus 5.5 is the primary model, and a second model takes over automatically if it is unavailable.
Both run the same prompts and Qloo tools; see `LLM_PROVIDER` and `LLM_FALLBACK` in `.env.example`.

## Run it locally

Requirements: Node.js 22.19 or newer, a Qloo hackathon key, and a key for the LLM provider you use.

```sh
npm install --global @qloo/qloo-harness
npm install
cp .env.example .env.local   # fill in QLOO_API_KEY and the LLM keys
npm run dev
```

Open http://localhost:3000. `GET /api/health` reports whether Qloo and the LLM provider are configured. `node scripts/make-examples.mjs http://localhost:3000` regenerates the instant example cards in `src/data/examples.json`.

## Deploy

Encore needs a VM or container (not serverless), because it runs `qloo mcp` as a local process. See [docs/DEPLOY.md](docs/DEPLOY.md).

## Limitations

- Qloo results describe what groups tend to like, not what one person will recognise. The card says so.
- Coverage of older and non-Western entities is uneven. Encore falls back to tags, and some sources are broad (for example a cuisine rather than a dish).
- Building a card takes about a minute. The instant examples are pre-generated from live runs.
- Encore is a conversation aid, not a medical tool.

## License

MIT
