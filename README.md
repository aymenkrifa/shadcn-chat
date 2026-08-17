# base-clone

A clean-room reimplementation of **assistant-ui's `base` demo**
([`apps/docs/components/examples/base.tsx`](https://github.com/assistant-ui/assistant-ui))
using **only shadcn/ui** — no assistant-ui dependency, no Base UI, no Lexical.

Not affiliated with or endorsed by assistant-ui. This is an independent
reimplementation written against the rendered output of their demo; see
[License](#license).

It exists to answer one question: *can we get that exact look and feel from
shadcn/ui alone?* The answer, measured rather than asserted, is **yes** — see
[Fidelity](#fidelity) for what matches and what doesn't.

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:5173
pnpm build          # tsc -b && vite build
pnpm lint
```

There is no backend. Responses are canned and streamed by a fake runtime so the
UI exercises every visual state it has.

To see the **empty state** (welcome heading + centred composer + suggestion
chips — the design's most distinctive screen), click **New Thread** in the
sidebar. Dark mode has no toggle, deliberately, because the reference has none:
add `class="dark"` to `<html>` to view it.

## What's in here

```
src/
  index.css                  shadcn `neutral` theme tokens + the syntax-highlight palette
  lib/chat/
    types.ts                 the data model the UI renders
    store.ts                 external store standing in for a chat runtime
    provider.tsx             ChatProvider + useChat() + useChatState(selector)
    message-context.tsx      the current message, for a message's subtree
  components/
    ui/                      stock shadcn/ui, pulled with `pnpm dlx shadcn@latest add`
    chat/                    23 files — the reference's components, reimplemented
```

`lib/chat` deliberately mirrors the *shape* of assistant-ui's state so porting a
component from the reference is mechanical:

| assistant-ui | here |
| --- | --- |
| `useAuiState(s => s.thread.isRunning)` | `useChatState(s => s.thread.isRunning)` |
| `useAui().thread.append({...})` | `useChat().append("...")` |
| `MessagePrimitive.Root` context | `MessageProvider` / `useMessage()` |

Swapping in a real backend means writing an adapter against `ChatActions`, not
rewriting components.

## Fidelity

Structure was verified numerically in headless Chrome over CDP
(`getComputedStyle` / `getBoundingClientRect`), not by eyeballing screenshots —
measurements taken 2026-08-17:

| Thing | Reference | Here |
| --- | --- | --- |
| Thread column | `44rem` | `max-width: 704px` |
| Card radius | `rounded-lg` @ `--radius: 0.625rem` | `10px` |
| Composer radius | `--composer-radius: 1.5rem` | `24px` |
| User bubble gutter | `minmax(72px,1fr)` | `72px` at 390px wide |
| Rail | `w-65` / `w-12` | `260px` / `48px` |
| Header | `h-12` | `48px` |
| Muted field padding | `p-2 md:pl-0` | `0 / 8px / 8px` |

**Deliberate deviations**, each commented at its call site:

1. **Composer input is a plain auto-growing `<textarea>`**, not Lexical. The
   reference's rich-text input buys @-mention *chips*; we get the same `@` and `/`
   popovers from shadcn's `Popover` + `Command` without a large dependency. The
   popover anchors to the composer shell rather than following the caret.
2. **The welcome `h1`'s animation utilities are `motion-safe:`-gated.** The
   reference pairs `animate-in` with `fill-mode-both`, which parks the element at
   opacity 0 — so under `prefers-reduced-motion`, where the animation never runs,
   the only line on an empty screen stays invisible. Measured in headless Chrome
   with `--force-prefers-reduced-motion`. This is a bug in the reference that we
   do not copy.
3. **Markdown tables get their own `overflow-x-auto` wrapper.** The reference lets
   a wide table drag the whole transcript sideways.
4. **The composer placeholder is a positioned `<span>`, not the native
   attribute.** A textarea's placeholder cannot be truncated, so at 390px the
   string wrapped to two lines and grew the footer by 8px; the reference's Lexical
   placeholder is a real element with `truncate`. The `aria-label` on the textarea
   is load-bearing as a result — dropping the attribute drops the implicit name.
5. **Syntax colours are highlight.js classes painted with GitHub's palettes.** The
   reference uses Shiki (`github-light-default` / `github-dark-default`). Ours is
   an approximation: Shiki colours fine-grained TextMate scopes, highlight.js
   emits ~20 coarse buckets, so some scopes collapse. Common tokens land right.
6. **The logo is an inline SVG wordmark reading "shadcn chat."** The reference
   renders its own favicon through `next/image`; we have neither Next nor a right
   to that mark. Same reasoning applies to the model-picker glyphs, which are
   lucide icons keyed on vendor group rather than vendor logos.
7. **Accessible names added** where the reference relies on a tooltip alone, plus
   `aria-expanded` on the suggestion category chips and `dir="auto"` on user text.

## Known gaps

- **Bundle is ~315 kB gz in one chunk**, over a 200 kB critical-path budget.
  Attribution: KaTeX 232 kB raw (24%), react-dom 175 kB (18%), highlight.js
  157 kB (16%), our own `src/` 87 kB (9%). KaTeX and highlight.js are 39% of the
  bundle, both eagerly imported and both trivially `import()`-able. No code
  splitting is configured — this is a POC, not a shipping target.
- **`URL.createObjectURL` leaks on an unsent attachment.** Revoked on explicit
  removal, but `newThread()` clears composer attachments without revoking. Not
  naively fixable: a *sent* attachment's preview URL must stay alive for its
  message tile, so the fix needs sent-vs-unsent tracking.
- **`data-slot` naming is inconsistent** — some components kept the reference's
  `aui_` prefix, others dropped it. Nothing selects `data-slot` in CSS, so it has
  no rendering effect, but pick one convention before building on this.
- Dark mode has no toggle (the reference has none), so it is only reachable by
  setting the class manually.
- `pnpm lint` reports 12 `react(only-export-components)` fast-refresh warnings.
  They are hints about files exporting both components and helpers, not errors.

## Verification artefacts

`verify/` holds the headless-Chrome captures. The `fix-*.png` set is current;
files without that prefix predate the fidelity fixes and are kept for comparison.
`desktop-dark.png` was captured with Chrome's `--force-dark-mode`, which does its
own auto-inversion — our dark mode is class-based, so that file shows Chrome's
guess, not our theme. `fix-desktop-dark.png` is the real one.

## License

[MIT](LICENSE). The reference project,
[assistant-ui](https://github.com/assistant-ui/assistant-ui), is also MIT.
No assistant-ui code is vendored here — `src/components/chat/` was written
against the rendered output of their demo, and `src/components/ui/` is stock
shadcn/ui. Their wordmark, favicon, and the model vendors' logos are
deliberately not reproduced (see deviation 6 above).
