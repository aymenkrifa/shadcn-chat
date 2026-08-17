import {
  createAssistantMessage,
  createUserMessage,
  DEFAULT_MODEL_ID,
  type ChatSeed,
  type Responder,
} from "@/lib/chat/store";

/**
 * The canned conversation the demo boots with, plus the scripted responder.
 *
 * This file has no counterpart in the reference — the reference's example talks
 * to a real runtime. Its only job is to put every visual state the port has to
 * prove on screen at once: reasoning, a tool call, markdown prose, a list, a
 * table, inline and display math, a fenced code block, the timing readout, and
 * a sidebar with enough spread in `lastMessageAt` that its date grouping is
 * visible rather than theoretical.
 *
 * Keep it boring and short. It is scaffolding for a UI, not content.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Read once at module load so every timestamp shares one "now". */
const NOW = Date.now();

const startOfToday = (() => {
  const date = new Date(NOW);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
})();

/**
 * `NOW - ago`, but never earlier than this morning. Without the clamp, opening
 * the demo at 00:20 would push every "today" thread into yesterday's group and
 * the sidebar's grouping would look broken for twenty minutes a day.
 */
const todayAgo = (ago: number) => Math.max(startOfToday + MINUTE, NOW - ago);

/** Noon yesterday — inside yesterday whatever the wall clock says right now. */
const yesterdayAt = (hour: number) => startOfToday - (24 - hour) * HOUR;

const ANSWER_MARKDOWN = `**Quicksort**, with a merge-sort fallback. The benchmark above puts it ~20 % ahead
of merge sort on uniform random data, and the fallback is what keeps the tail
honest rather than fast-on-average.

A comparison sort cannot beat $O(n \\log n)$ — that is a counting argument, not an
implementation gap. There are $n!$ orderings and one bit per comparison, so:

$$
\\log_2(n!) \\;=\\; \\Theta(n \\log n)
$$

- **Merge sort** — stable and predictable, but wants $O(n)$ of scratch space
- **Quicksort** — best constants in practice, degrades to $O(n^2)$ on adversarial input
- **Heapsort** — in place and worst-case optimal, but its access pattern defeats the cache

| Algorithm | Median (10M) | Worst case | In place | Stable |
| --- | --- | --- | --- | --- |
| Quicksort | 940 ms | $O(n^2)$ | yes | no |
| Merge sort | 1180 ms | $O(n \\log n)$ | no | yes |
| Heapsort | 1620 ms | $O(n \\log n)$ | yes | no |

The standard mitigation is to stop trusting the pivot after a while — cap the
recursion depth and fall back:

\`\`\`ts
export function sortRecords(records: Int32Array): Int32Array {
  const depthLimit = 2 * Math.floor(Math.log2(records.length));
  return introsort(records, 0, records.length - 1, depthLimit);
}
\`\`\`

Below ~32 elements, switch to insertion sort: the recursion overhead costs more
than the extra comparisons.`;

const FOLLOWUP_MARKDOWN = `Yes — it flips the ranking. Nearly-sorted input is exactly what adaptive sorts
are built for: **Timsort** finds the runs that are already in order and merges
them, so it lands close to $O(n)$ instead of $O(n \\log n)$.

- Sorted, or sorted in blocks → Timsort, by a wide margin
- Reverse-sorted → still fine; it detects descending runs and reverses them in place
- Genuinely shuffled → back to the table above`;

const activeThreadMessages = [
  createUserMessage(
    "I need to sort 10M int32 records on a single box. Which algorithm should I use — and can you benchmark it first?",
  ),
  createAssistantMessage(
    [
      {
        type: "reasoning",
        text: "Sort performance at this size is dominated by cache behaviour and by the constant factors, neither of which I can recall reliably for this machine. Better to run the benchmark and reason from its numbers than to quote a textbook ranking that may not hold here.",
        status: { type: "complete" },
      },
      {
        type: "tool-call",
        toolCallId: "call-benchmark-seed",
        toolName: "run_benchmark",
        args: {
          dataset: "10M int32, uniform random",
          algorithms: ["quicksort", "merge_sort", "heapsort"],
          runs: 5,
        },
        result: {
          unit: "ms, median of 5 runs",
          quicksort: 940,
          merge_sort: 1180,
          heapsort: 1620,
          peak_rss_mb: { quicksort: 41, merge_sort: 79, heapsort: 41 },
        },
        status: { type: "complete" },
      },
      { type: "text", text: ANSWER_MARKDOWN },
    ],
    { metadata: { durationMs: 8420, model: DEFAULT_MODEL_ID } },
  ),
  createUserMessage("Does that change if the data is almost sorted already?"),
  createAssistantMessage([{ type: "text", text: FOLLOWUP_MARKDOWN }], {
    metadata: { durationMs: 2140, model: DEFAULT_MODEL_ID },
  }),
];

/**
 * Eight threads, newest first — the store keeps this order for the sidebar. The
 * spread is deliberate: three land today, two yesterday, three further back, so
 * all three of the thread list's date buckets have something in them.
 */
export const seed: ChatSeed = {
  activeIndex: 0,
  threads: [
    {
      title: "Choosing a sort for 10M records",
      lastMessageAt: todayAgo(8 * MINUTE),
      messages: activeThreadMessages,
    },
    { title: "Weather in San Francisco", lastMessageAt: todayAgo(3 * HOUR) },
    {
      title: "Debounce vs throttle in TypeScript",
      lastMessageAt: todayAgo(7 * HOUR),
    },
    { title: "Release notes for 2.4.1", lastMessageAt: yesterdayAt(17) },
    {
      title: "Naming a developer tools startup",
      lastMessageAt: yesterdayAt(9),
    },
    {
      title: "Pros and cons of server-side rendering",
      lastMessageAt: startOfToday - 4 * DAY,
    },
    {
      title: "GDP of the US, China and Japan",
      lastMessageAt: startOfToday - 9 * DAY,
    },
    {
      title: "PR description for keyboard shortcuts",
      lastMessageAt: startOfToday - 23 * DAY,
    },
  ],
};

/** Tool call ids have to be unique across a session; the seed's is separate. */
let toolCallSeq = 0;

/** Everything between "in " and the end, trimmed of punctuation. */
const cityFrom = (prompt: string) =>
  /\bin\s+([A-Za-z][A-Za-z\s'-]*)/.exec(prompt)?.[1]?.replace(/[?.!]+$/, "").trim() ??
  "San Francisco";

/**
 * The scripted "model".
 *
 * Keyed off the prompt so the demo visibly reacts to what was asked — a weather
 * prompt exercises the reasoning + tool-call + answer path, a comparison prompt
 * exercises the markdown table, and everything else gets a short answer with a
 * little math in it. The store handles the staging (one part revealed every
 * 420 ms), so these are just the final parts.
 */
export const respond: Responder = (prompt) => {
  const asked = prompt.toLowerCase();

  if (asked.includes("weather")) {
    const city = cityFrom(prompt);
    toolCallSeq += 1;
    return [
      {
        type: "reasoning",
        text: `Current conditions change by the hour, so anything I remember about ${city} is already stale. Call the weather tool and report what it returns.`,
        status: { type: "complete" },
      },
      {
        type: "tool-call",
        toolCallId: `call-weather-${String(toolCallSeq)}`,
        toolName: "get_weather",
        args: { location: city, units: "metric" },
        result: {
          temperature_c: 18,
          feels_like_c: 17,
          condition: "Partly cloudy",
          humidity: 0.72,
          wind_kph: 21,
        },
        status: { type: "complete" },
      },
      {
        type: "text",
        text: `It is **18 °C** and partly cloudy in ${city} right now.

- Feels like 17 °C, humidity 72 %
- Wind 21 km/h
- No rain in the next few hours

A light jacket, not a coat.`,
      },
    ];
  }

  if (asked.includes("table") || asked.includes("compare")) {
    return [
      {
        type: "text",
        text: `Here they are side by side. The numbers are indicative, not benchmarks.

| | React | Vue | Svelte |
| --- | --- | --- | --- |
| Runtime model | virtual DOM | virtual DOM | compiled, no VDOM |
| Baseline bundle | ~45 kB | ~34 kB | ~2 kB |
| State | hooks | refs + reactive | runes |
| Ecosystem | largest | large | smaller |

Pick React for the hiring pool, Svelte for the bundle, Vue if you want the
middle of the road.`,
      },
    ];
  }

  return [
    {
      type: "text",
      text: `Short version: yes, with one caveat worth knowing about.

- The common case is already handled for you
- The edge case is where the time actually goes
- Measure before optimising — below $n \\approx 10^4$ the constant factor dominates and the asymptotics tell you nothing useful

The recurrence for the divide-and-conquer version is the familiar one:

$$
T(n) = 2\\,T(n/2) + O(n)
$$

which solves to $O(n \\log n)$.`,
    },
  ];
};
