import type { ComponentProps, CSSProperties } from "react";

import { cn } from "@/lib/utils";

/**
 * The reference's 5x5 dot-matrix status indicator, cut down to the three states
 * this clone uses.
 *
 * Ported from `packages/ui/src/components/assistant-ui/dot-matrix.tsx` (read
 * 2026-08-17). The reference ships 20 states and a glyph system (check, cross,
 * bang, ellipsis, record…) for success/error/warning/paused readouts; none of
 * those are reachable from the base demo, which only ever renders
 * `state="connecting"`. What is kept is everything that makes the thing look
 * alive: the 5x5 geometry, the bit-mixing hash that decorrelates per-dot
 * timings, and the registered-custom-property blink so a state change
 * cross-fades instead of snapping.
 */

const GRID = 5;
const CENTER = (GRID - 1) / 2;
const DOT_INDEXES = Array.from({ length: GRID * GRID }, (_, i) => i);

/*
 * Bit-mixing hash — takes a range in milliseconds, returns seconds. A plain
 * `(i * prime) % range` correlates indexes a grid-stride apart, which renders as
 * column-synchronised waves instead of a twinkle; this is the reference's fix,
 * kept verbatim because the visual difference is obvious.
 */
const hash = (n: number, salt: number, range: number) => {
  let h = (Math.imul(n, 374761393) + Math.imul(salt, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) % range) / 1000;
};

type Blink = { duration: number; delay: number; lo: number };

type StateConfig = {
  /** Text colour class; dots inherit the surrounding colour when omitted. */
  color?: string;
  /** Resting opacity. */
  base?: number;
  /** Blink parameters per dot, keyed by index and grid position. */
  blink?: (i: number, row: number, col: number) => Blink;
};

const STATES = {
  /** Static, dimmed — no animation at all. */
  idle: { color: "text-muted-foreground", base: 0.3 },
  /**
   * The reference's `loading` twinkle (its default state): every dot blinks on
   * its own hashed duration and offset, so the grid shimmers without a
   * direction. Mapped onto our `running` because "the model is working" is what
   * the reference used `loading` for.
   */
  running: {
    blink: (i) => ({
      duration: 0.9 + hash(i, 2, 700),
      delay: -hash(i, 1, 1200),
      lo: 0.15,
    }),
  },
  /**
   * The reference's `connecting`: a ripple outward from the centre, delayed by
   * Chebyshev distance so it reads as concentric rings rather than a diagonal.
   */
  connecting: {
    blink: (_i, row, col) => ({
      duration: 1.4,
      delay: -Math.max(Math.abs(row - CENTER), Math.abs(col - CENTER)) * 0.18,
      lo: 0.15,
    }),
  },
} satisfies Record<string, StateConfig>;

export type DotMatrixState = keyof typeof STATES;

export type DotMatrixProps = Omit<ComponentProps<"span">, "children"> & {
  state?: DotMatrixState;
  /** Screen-reader text; falls back to the state name. */
  label?: string;
};

/*
 * The blink animation runs on every animated state and the registered hi/lo
 * custom properties carry the transition, because adding or removing an
 * animation never fires a CSS transition on the animated property itself —
 * transitioning the amplitude BOUNDS is what makes a state change cross-fade.
 * Copied from the reference 2026-08-17; the `@property` declarations are what
 * make `--aui-dot-matrix-hi/lo` animatable at all.
 */
const DOT_MATRIX_CSS =
  '@property --aui-dot-matrix-hi{syntax:"<number>";inherits:false;initial-value:1}@property --aui-dot-matrix-lo{syntax:"<number>";inherits:false;initial-value:0.15}@keyframes aui-dot-matrix-blink{0%,100%{opacity:var(--aui-dot-matrix-hi,1)}50%{opacity:var(--aui-dot-matrix-lo,0.15)}}';

export function DotMatrix({
  className,
  state = "running",
  label,
  ...props
}: DotMatrixProps) {
  const config: StateConfig = STATES[state];

  return (
    <span
      data-slot="dot-matrix"
      data-state={state}
      role="status"
      className={cn("inline-block size-4 shrink-0", config.color, className)}
      {...props}
    >
      <span className="sr-only">{label ?? state}</span>
      {/*
        Deduplicated across instances by React 19's style hoisting (`href` +
        `precedence`), so twenty indicators inject one stylesheet. It must sit in
        HTML scope — inside the <svg> it would be an SVG-namespace element,
        which React does not hoist.
      */}
      <style href="aui-dot-matrix" precedence="low">
        {DOT_MATRIX_CSS}
      </style>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        fill="currentColor"
        className="size-full"
      >
        {DOT_INDEXES.map((i) => {
          const row = Math.floor(i / GRID);
          const col = i % GRID;
          const hi = config.base ?? 1;
          const blink = config.blink?.(i, row, col);
          return (
            <circle
              key={i}
              data-slot="dot-matrix-dot"
              cx={2 + col * 4}
              cy={2 + row * 4}
              r={1.3}
              className="[transition-property:--aui-dot-matrix-hi,--aui-dot-matrix-lo,opacity] duration-300 [animation-iteration-count:infinite] [animation-name:aui-dot-matrix-blink] [animation-timing-function:ease-in-out] motion-reduce:[animation-name:none]"
              style={
                {
                  opacity: hi,
                  animationDuration: `${blink?.duration ?? 1}s`,
                  animationDelay: `${blink?.delay ?? 0}s`,
                  "--aui-dot-matrix-hi": hi,
                  // A static state sets lo = hi, so the keyframes hold a flat
                  // opacity rather than needing the animation switched off.
                  "--aui-dot-matrix-lo": blink?.lo ?? hi,
                } as CSSProperties
              }
            />
          );
        })}
      </svg>
    </span>
  );
}
