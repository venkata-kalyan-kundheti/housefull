# Housefull

> Every underfilled show has an audience. Housefull finds who they are, where they are and how to reach them, using taste data instead of tracking.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/). *(Housefull is the sold-out sign in many Indian cinemas.)*

| | |
|---|---|
| Live demo | `ADD YOUR DEPLOYED URL HERE` |
| License | MIT |
| Full specification | [`docs/SPEC.md`](docs/SPEC.md) |

## The problem

A cinema earns most of its revenue from a few popular shows. The rest run partly empty, and an empty seat cannot be sold after the film starts. As far as we could find, existing tools predict likely viewers from a cinema's own booking history, or cut prices on unsold seats. Both struggle with new or independent films and with customers who have no history.

## What Housefull does

For each underfilled showtime, an AI agent working for the cinema manager:

1. **Detects** shows trailing their expected fill.
2. **Asks Qloo** what the film's audience loves across artists, brands, films, TV shows, places to visit, and (when the signal is strong) books and podcasts.
3. **Locates** where that taste is concentrated near the theater, using the Qloo heatmap filtered to a catchment radius.
4. **Builds a Taste Brief**: audience skews, ranked channels, local partner venues and ready-to-send invitation messages, each backed by a recorded Qloo call you can open as evidence.
5. **Tests it**: every campaign comes with a test-versus-control experiment design, a sample-size calculator and a result analyzer. Housefull never claims a sales lift.

## How the agent works

Code does the counting, filtering, scoring and statistics. The AI model only ranks and explains candidates that the code generated, and a validator rejects any text that is not backed by evidence (unknown names, promises, exclusion language, contact details). Confidence is computed by code from data coverage, not by the model.

```
resolve film → fan-out to Qloo (7 taste areas, heatmap, demographics) → derive audiences,
areas and channels → optional planning → local partners → rank / write copy / summarize (parallel)
→ validate → score confidence → save
```

Details, schemas, prompts and edge cases are in [`docs/SPEC.md`](docs/SPEC.md).

## Qloo API capabilities used

Entity search; insights for artists, brands, films, TV shows, destinations, books, podcasts and places (filtered by category tag and city); heatmap; demographics; tags. Requests are rate-limited (4 per second), budgeted per brief, cached privately on the server, and validated against a parameter allowlist because the API silently ignores invalid parameters.

## Tech stack

Next.js (App Router) and TypeScript, Tailwind CSS, zod, Drizzle ORM with Neon Postgres, Gemini via `@google/genai` (behind an adapter), vitest.

## Run it locally

Requirements: Node.js 20 or newer, a Postgres database (a free [Neon](https://neon.tech) project works), a Qloo hackathon API key and an LLM API key. Qloo data is **not** included in this repository; you need your own key.

```bash
git clone https://github.com/venkata-kalyan-kundheti/housefull
cd housefull
npm install
cp .env.example .env.local     # fill in the values
npm run db:push                # create tables
npm run seed                   # simulated theaters and showtimes
npm run dev                    # http://localhost:3000
```

| Variable | Purpose |
|---|---|
| `QLOO_API_KEY` | Qloo hackathon key (server only) |
| `LLM_API_KEY`, `LLM_MODEL` | Language model key and model name |
| `DATABASE_URL` | Postgres connection string |
| `APP_MODE` | `live`, or `replay` to serve only cached Qloo responses |
| `DEMO_FIXED_NOW` | Optional fixed demo clock (ISO-8601) so seeded shows stay "upcoming" |

Other scripts: `npm test`, `npm run typecheck`, `npm run lint`, `npm run check:repo`, `npm run warm` (pre-fill the private cache for demo shows), `npm run check:qloo` (checks your API key against the assumptions in the spec).

## Honest limitations

- Qloo shows what audiences **like**, not what makes them **buy**. The effect on ticket sales is a hypothesis; the experiment planner exists to test it.
- Qloo returns audience segments and areas, not individual customers. Heatmap cells show where affinity is high, not where people live.
- Showtimes in this demo are **simulated**, and the app says so. A real deployment needs the cinema's own showtime data.
- Partner results can include loose category fits, and some cities return no results for some categories.
- The expected-sales curve used to flag underfilled shows is a default assumption, not measured data.
- Demographic values are relative skews, shown as context only. Messages and targeting never exclude a group on age or gender alone.

## Related work

As far as we could find, tools such as Movio, Choovie, Atom Tickets and DealFlix address parts of this problem. Housefull differs by using cross-domain taste from outside the cinema's own data, so it can work with no history, and by pairing every campaign with a built-in test. We make no claim that nothing similar exists.

## License

MIT. See [`LICENSE`](LICENSE). Taste data from [Qloo](https://www.qloo.com/).
