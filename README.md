# Encore

Reminiscence sessions for people living with dementia, grounded in what their generation and region actually loved.

Family caregivers are told that familiar books, food, places and sport from a person's youth can open conversations. But they rarely know what someone who grew up in 1950s Madinah or 1960s Alexandria would recognise, and a general chatbot guesses generic nostalgia. Encore uses Qloo's taste graph to find specific, culturally grounded things to talk about, and turns them into a gentle session card.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/).

## How it works

Two steps, with a privacy boundary around the family's memories:

1. **Research (LLM + Qloo tools).** The model sees only public taste signals: birth decade, where the person grew up, and a few things they loved (a book, a dish, a team, a place, a hobby). It calls Qloo through the `qloo mcp` server: it resolves each item to a Qloo entity or tag, then asks for related books, foods, places, sports figures and interests. When an older or non-Western entity has no taste data, it falls back to the matching genre, cuisine, region or occupation tag.
2. **Session card (LLM, no tools).** The model writes a session card: a theme, 5 to 7 prompts with a simple activity and one open question each, caregiver tips, and limitations. Every prompt names the Qloo entity or tag it came from.

**The memory book never leaves the browser.** The caregiver fills in details such as a close relative or a family dish. The server is told only which details are filled in, the model writes prompts with placeholders such as `{{relative}}`, and the browser fills them in. No names reach the server, the model or Qloo. Encore also skips politics.

## Models

Encore runs the same prompts and the same Qloo tools on either provider, set by `LLM_PROVIDER`:

- `qwen` (default): Qwen3.6-35B-A3B on Hetzner Inference, through its OpenAI-compatible API.
- `claude`: Claude Opus 5.5 through the Anthropic API.

Each `/api/plan` response includes the provider, timings and the Qloo calls made, so the two can be compared on the same profile.

## Run it locally

Requirements: Node.js 22.19 or newer, a Qloo hackathon key, and a key for the LLM provider you use.

```sh
npm install --global @qloo/qloo-harness
npm install
cp .env.example .env.local   # fill in QLOO_API_KEY and the LLM keys
npm run dev
```

Open http://localhost:3000. `GET /api/health` reports whether Qloo and the LLM provider are configured.

## Deploy

Encore starts `qloo mcp` as a local stdio process, so it needs a VM or container with Node.js 22.19+, the harness installed, and the keys set as secrets. Serverless platforms are not supported. The browser never calls Qloo directly.

## Limitations

- Qloo results describe what groups tend to like, not what one person will recognise.
- Coverage of older and non-Western entities is uneven; Encore falls back to tags and says so on the card.
- Encore is a conversation aid, not a medical tool.

## License

MIT
