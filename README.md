# Capacity

A personal instrument for one question, asked over Sep 2026 → Dec 2028:

> Is my **body** becoming able to sustain more work with less fatigue, is my **brain**
> becoming clearer and more resilient, and am I becoming able to hold **one important
> problem** in mind all day and sink into it calmly?

Three domains, tracked separately and never averaged into a single score.

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # dist/            — normal static build
npm run build:single # dist-single/     — one self-contained index.html
npm run build:artifact # artifact/capacity.html — the same build, wrapped for hosting
npm run icons        # regenerate the home-screen icons from the palette
npm run typecheck
npm run test:sync    # merge + migration-verification tests
```

No backend, no accounts, no API keys, no model calls. Everything — including every
stage decision — is computed in the browser from your own raw data, and persists in
`localStorage` with JSON export/import.

---

## The three questions and how each is answered

### Body — reserve, adaptation, benchmark, recovery

| Signal | How it is captured | Frequency |
|---|---|---|
| Training | type, minutes, RPE, reserve left afterwards, plus only the performance fields that apply to that exercise | per session |
| Load | `duration × RPE` (sRPE), a standard transparent unit | derived |
| Weekly reserve | *"How much reserve is left to repeat another week like this?"* — the single weekly subjective question | Sunday |
| Intensity target | five representative lifts — sets, reps (or held seconds), rest, load | Monday |
| Recovery | inferred from post-session reserve, an optional next-day cost prompt, and anchor HR fields — not from a second subjective survey | derived |
| Objective anchor | resting HR, a genuine 3-rep max, HR recovery — measured, to catch RPE drift | ~3-monthly |

**Strength is measured as prescribed work ÷ what it costs you.**

```
goal index      = how hard this week's prescription is, vs. the baseline week
cost index      = mean RPE of the sessions logged against it, vs. the baseline week
strength index  = goal ÷ cost        (1.00 = baseline)
```

Each lift is compared against *its own* baseline as a ratio before the ratios are
averaged, so kilograms and plank seconds combine legitimately and nothing is ever
summed across units. A rising goal with falling RPE is the only combination that
moves the index far; a rising goal with rising RPE reads as "working harder, not yet
stronger", and the app says so in those words. Only weeks with a logged prescribed
session count, so a target you typed but never trained moves nothing.

Its blind spot is RPE drift — your "7" in 2028 may not be your "7" today. The
objective anchor exists solely to catch that: if it stalls while the strength index
climbs, your sense of effort moved, not your body.

The Body view also answers *adaptation vs. accumulation*: load trend and reserve
trend are read together, so "load up 18%, reserve holding" and "load up 18%, reserve
falling" produce different verdicts instead of the same rising line.

### Brain — clarity, baseline, and what actually happens under stress

Morning and end-of-work clarity are both captured, so **within-day decay** is a
first-class metric rather than an afterthought. Emotional baseline is tracked as a
mean *and* a volatility (a steady floor is not the same as a high one).

Stress resilience is **not** a daily question — on a calm day there is nothing to
measure. Instead, stress events are logged only when they happen, and resilience is
read from the relationship between them:

- functional impact **per unit of stress intensity** (is the same size of hit costing less?)
- recovery **minutes** per unit of intensity (kept in real minutes, never scored)
- share of stress events that set off an impulse

### Immersion — the Focus Point

No timers and no "start focus" button anywhere: a timer changes the thing being
measured, and a 10-hour thinking day cannot be bracketed. Instead:

- **Focus Point** — the one problem the mind should keep returning to.
- **Attention coverage** — estimated by experience sampling (a few one-tap pings:
  start of work, optional midday, end of work, plus one optional random check),
  blended with an evening self-estimate. Both raw signals are stored separately;
  the app never claims a precision it doesn't have.
- **FP continuity**, **slow thinking quality** (unhurried, relaxed staying-with-it),
  **automatic return** (does attention come back without an act of will), and
  optional **enjoyment** — because the goal is sustained problem-solving you'd
  choose, not forced grinding.
- **Impulse events** keep **urge duration** and **actual work minutes lost** apart.
  Wanting nicotine for 20 minutes while working normally is a different event from
  losing 20 minutes, and the app refuses to conflate them.

---

## Stages

Each domain runs its own 0–5 ladder (`Fragile / rebuilding` → `Sustainable peak`)
with **different criteria per domain**.

Stages are **gates, not averages**: you hold stage N only if *every* requirement of
stages 1..N is met. One outstanding number cannot buy a weak one. For the next stage
the app shows, per requirement:

```
✓  FP continuity           7.2
✓  Slow thinking           7.1
△  Attention coverage      78% → 82%
✕  Automatic return        5.9 → 8.0
✕  Strong impulses         4.1 /wk → 1.5 /wk
```

plus the single biggest gap. A requirement whose metric doesn't have enough data yet
is marked `·` and **holds** the stage rather than failing it — so a thin week never
looks like a regression.

All of this is deterministic and local. There is no model, no API and no hidden
weighting anywhere in the calculation.

### Calibration

The initial thresholds are first-pass guesses and are labelled as such. For the first
8 weeks (configurable) the app runs in **Calibration mode**: it collects raw data and
still shows provisional stages so you can watch the machinery work, with a banner
saying they are not yet trustworthy.

Recalibrating later takes two forms, both without rewriting the app:

1. edit `src/config/stages.ts` — every threshold in the product lives in that one file;
2. or edit any target in **Data → Thresholds** in the running app, which stores a
   sparse override on top of the config and recalculates immediately.

Raw history is never rewritten by a threshold change: metrics are always recomputed
from the raw record, so re-tuning re-derives the entire past.

---

## Data principle

Subjective judgements use anchored 0–10 scales (the anchors live in
`src/config/scales.ts` — changing one silently redefines the history, so they're
deliberately centralised). Everything else stays in its native unit: minutes, hours,
kg, reps, metres, bpm, counts, event totals. Normalised indicators are derived at read
time and never stored.

---

## Layout

```
src/
  config/          the measurement model — edit here to recalibrate
    stages.ts        stage ladders, gates and thresholds  ← the main dial
    metrics.ts       metric registry: units, windows, data-sufficiency minimums
    scales.ts        anchors for every 0–10 scale
    taxonomy.ts      exercise / impulse / stress vocabularies, default benchmark
  domain/          pure functions over raw state (no persistence of derived values)
    metrics.ts       computes every metric from the raw record
    stages.ts        the deterministic gate engine
    insights.ts      the rule-based plain-language reads
    series.ts        time-series builders for the charts
    pings.ts         experience-sampling schedule
  store/           localStorage persistence, migration, export/import, sample data
  components/      UI primitives, forms, SVG charts (no chart library)
  screens/         Today · Trends · Stages · Data
```

## Daily rhythm

| When | What | Cost |
|---|---|---|
| Morning | clarity, emotional baseline, confirm Focus Point | ~15s |
| During the day | one-tap sampling pings; stress/impulse events only when they occur | ~5s each |
| End of work | clarity + five immersion ratings | ~45s |
| Monday | set the week's intensity target (prefilled from last week) | ~20s |
| Sunday | weekly reserve | ~15s |
| ~3-monthly | objective anchor | one session |

Missed pings are never lost — the Today screen shows whatever is outstanding when you
next open the app.

## Notes and limitations

- **Reminders** fire while the app is open (including as an installed home-screen
  app). Background push would require a server and an account, which this app
  deliberately doesn't have. For hard alarms, set the same times in the phone's clock.
- **Backups matter.** Data lives in one browser's storage; clearing site data would
  take it with it. Back up from **Data → Backup**: *Export file* saves a JSON file
  (via the host's save confirmation when running as a hosted artifact, where pages
  cannot download directly), *Copy backup* puts the same JSON on the clipboard, and
  either can be restored with *Import file* or *Paste backup*.
- **Two ways to run it.** `npm run dev` locally, or the hosted single-file build for
  the phone. Each browser keeps its own separate record — moving between them means
  exporting and importing.
- **Sample data** (Data → Backup → Load sample data) generates 12 synthetic weeks for
  previewing the charts and stage logic. Erase it before recording for real.
