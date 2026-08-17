import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ComponentProps, CSSProperties } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { BrainIcon, ChevronDownIcon } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * Chain-of-thought disclosure, ported from the reference's
 * `packages/ui/src/components/assistant-ui/reasoning.tsx` (read 2026-08-17).
 * Every Tailwind string below is the reference's, verbatim, except for the
 * primitive translations called out in comments.
 *
 * Two translations apply to all three collapsibles in this slice:
 *
 *  1. Base UI marks disclosure state with bare `data-open` / `data-closed`
 *     attributes; Radix marks it with `data-state="open|closed"`. So the
 *     reference's `data-open:` / `data-closed:` variants become
 *     `data-[state=open]:` / `data-[state=closed]:`, and its PAIR of chevron
 *     rules (`group-data-open/trigger` + `group-data-panel-open/trigger`,
 *     which exist because Base UI moved the attribute between versions)
 *     collapses to the single Radix rule.
 *  2. The height animation is the same in both: `animate-collapsible-down/up`
 *     from tw-animate-css 1.4.0 (already imported by `src/index.css`), whose
 *     keyframes read `--radix-collapsible-content-height` first — verified in
 *     `node_modules/tw-animate-css/dist/tw-animate.css`, 2026-08-17. So the
 *     reference's `--collapsible-panel-height` needs no substitution here; the
 *     utility resolves the Radix var for us and no global CSS is added.
 *
 * Dropped, because it lives in `@assistant-ui/react` and has no shadcn
 * equivalent: `useScrollLock`, which pinned the scroll container while the
 * panel animated. Its absence means expanding a long reasoning block inside a
 * scrolled thread can shift the viewport; nothing else changes.
 *
 * The reference's `aui-*` class names are dropped: they are assistant-ui's
 * theming hooks and no rule in this project targets them. `data-slot`
 * attributes are kept — that is shadcn's own convention.
 */

/**
 * Collapsible open/close duration in ms, published as `--animation-duration` on
 * every panel in this slice. Exported because `tool-group.tsx` and
 * `tool-fallback.tsx` animate the same kind of panel and must not drift from
 * it — the parallel write left three identical private copies of the number.
 */
export const ANIMATION_DURATION = 200;

/**
 * The reference gets `shimmer` from `@assistant-ui/tw-shimmer`, a CSS-only
 * package we may not install, and `src/index.css` belongs to another agent —
 * so the sweep ships as a React 19 hoisted stylesheet instead (`<style>` with
 * `href` + `precedence` is deduped by href, so the three files in this slice
 * can each render it without emitting three copies).
 *
 * One deliberate difference from tw-shimmer: its light-mode band is
 * `currentColor` at 20% alpha, which composites over the identical opaque
 * label underneath to no visible change (the effect only reads in dark mode).
 * Ours moves the band to `--color-foreground`, so it is darker than the muted
 * label in light mode and brighter in dark mode — visible either way, and it
 * needs no relative-color syntax that could invalidate the whole `background`
 * declaration and take the transparent-filled text with it.
 *
 * `prefers-reduced-motion` is handled inside this sheet as well as by the
 * `motion-reduce:animate-none` utility on the span: React inserts hoisted
 * styles into `<head>` with no ordering guarantee against Tailwind's sheet, so
 * relying on the utility alone would be a coin flip.
 */
const SHIMMER_CSS = `
@keyframes chat-shimmer-sweep { from { background-position: 100% 0; } }
.chat-shimmer {
  background: linear-gradient(
      105deg,
      currentColor 42%,
      var(--color-foreground) 50%,
      currentColor 58%
    ) 0 0 / 300% 100% no-repeat;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: chat-shimmer-sweep 1.3s linear infinite backwards;
}
@media (prefers-reduced-motion: reduce) {
  .chat-shimmer { animation: none; }
}
`;

/**
 * The reference's shimmer affordance: the label is rendered twice, the copy on
 * top being an `aria-hidden` overlay that carries the moving gradient. Keeping
 * a plain, unanimated copy underneath is what keeps the text selectable and
 * legible to assistive tech while the sweep runs.
 *
 * Exported so `tool-group.tsx` and `tool-fallback.tsx` can use it: the module
 * map allocated no shared file for this slice, and duplicating the stylesheet
 * three times is worse than one extra export from the first of the three.
 */
export function ShimmerOverlay({
  className,
  children,
  ...props
}: ComponentProps<"span">) {
  return (
    <>
      <style href="chat-shimmer" precedence="default">
        {SHIMMER_CSS}
      </style>
      <span
        aria-hidden
        className={cn(
          "chat-shimmer pointer-events-none absolute inset-0 motion-reduce:animate-none",
          className,
        )}
        {...props}
      >
        {children}
      </span>
    </>
  );
}

const ReasoningPreviewContext = createContext(false);

const reasoningVariants = cva("mb-4 w-full", {
  variants: {
    variant: {
      outline: "rounded-lg border px-3 py-2",
      ghost: "",
      muted: "bg-muted/50 rounded-lg px-3 py-2",
    },
  },
  defaultVariants: {
    variant: "outline",
  },
});

export type ReasoningRootProps = Omit<
  ComponentProps<typeof Collapsible>,
  "open" | "onOpenChange"
> &
  VariantProps<typeof reasoningVariants> & {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    defaultOpen?: boolean;
    /**
     * Whether the reasoning is currently streaming. While `true` the
     * disclosure is held open with a bottom-pinned live preview; when
     * streaming ends it returns to `defaultOpen`, and the first manual toggle
     * takes over the open/close state permanently.
     */
    streaming?: boolean;
  };

function ReasoningRoot({
  className,
  variant,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
  streaming,
  children,
  ...props
}: ReasoningRootProps) {
  // Captured once: the caller (per the reference demo) passes
  // `defaultOpen={running}`, and a running turn flipping to done must not slam
  // the panel shut under the reader.
  const initialOpenRef = useRef(defaultOpen);
  const [userOpen, setUserOpen] = useState<boolean | null>(null);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled
    ? controlledOpen
    : (userOpen ?? (streaming || initialOpenRef.current));
  const isPreview = streaming === true && isOpen;

  const handleOpenChange = (open: boolean) => {
    if (!isControlled) {
      setUserOpen(open);
    }
    controlledOnOpenChange?.(open);
  };

  return (
    <Collapsible
      data-slot="reasoning-root"
      data-variant={variant}
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn(
        "group/reasoning-root",
        reasoningVariants({ variant, className }),
      )}
      style={
        {
          "--animation-duration": `${ANIMATION_DURATION}ms`,
        } as CSSProperties
      }
      {...props}
    >
      <ReasoningPreviewContext value={isPreview}>
        {children}
      </ReasoningPreviewContext>
    </Collapsible>
  );
}

/**
 * The gradient that fades the panel's edge into the page. `color-mix` against
 * `--color-muted` is only reached by the `muted` variant, which is why the
 * root sets `data-variant` at all.
 */
function ReasoningFade({
  side = "bottom",
  className,
  ...props
}: ComponentProps<"div"> & { side?: "top" | "bottom" }) {
  if (side === "top") {
    return (
      <div
        data-slot="reasoning-fade"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-10 h-8",
          "bg-[linear-gradient(to_bottom,var(--color-background),transparent)]",
          "group-data-[variant=muted]/reasoning-root:bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--color-muted)_50%,var(--color-background)),transparent)]",
          "fade-in-0 animate-in",
          "duration-(--animation-duration)",
          className,
        )}
        {...props}
      />
    );
  }

  return (
    <div
      data-slot="reasoning-fade"
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8",
        "bg-[linear-gradient(to_top,var(--color-background),transparent)]",
        "group-data-[variant=muted]/reasoning-root:bg-[linear-gradient(to_top,color-mix(in_oklab,var(--color-muted)_50%,var(--color-background)),transparent)]",
        "fade-in-0 animate-in",
        "duration-(--animation-duration)",
        className,
      )}
      {...props}
    />
  );
}

function ReasoningTrigger({
  active,
  duration,
  className,
  ...props
}: ComponentProps<typeof CollapsibleTrigger> & {
  active?: boolean;
  duration?: number;
}) {
  // The reference's label is "Reasoning" plus an optional " (Ns)" — not
  // "Thinking"/"Thought for Ns". Kept as the reference writes it.
  const durationText = duration ? ` (${duration}s)` : "";

  return (
    <CollapsibleTrigger
      data-slot="reasoning-trigger"
      className={cn(
        "group/trigger text-muted-foreground hover:text-foreground flex max-w-[75%] origin-left items-center gap-2 py-1.5 text-sm transition-[color,scale] active:scale-[0.98]",
        className,
      )}
      {...props}
    >
      <BrainIcon
        data-slot="reasoning-trigger-icon"
        className="size-4 shrink-0"
      />
      <span
        data-slot="reasoning-trigger-label"
        className="relative inline-block leading-none tabular-nums"
      >
        <span>Reasoning{durationText}</span>
        {active ? (
          <ShimmerOverlay data-slot="reasoning-trigger-shimmer">
            Reasoning{durationText}
          </ShimmerOverlay>
        ) : null}
      </span>
      <ChevronDownIcon
        data-slot="reasoning-trigger-chevron"
        className={cn(
          "mt-0.5 size-4 shrink-0",
          "transition-transform duration-(--animation-duration) ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          "-rotate-90",
          "group-data-[state=open]/trigger:rotate-0",
        )}
      />
    </CollapsibleTrigger>
  );
}

function ReasoningContent({
  className,
  children,
  ...props
}: ComponentProps<typeof CollapsibleContent>) {
  const isPreview = useContext(ReasoningPreviewContext);

  return (
    <CollapsibleContent
      data-slot="reasoning-content"
      className={cn(
        "text-muted-foreground relative overflow-hidden text-sm outline-none",
        "group/collapsible-content ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none",
        "data-[state=closed]:animate-collapsible-up",
        "data-[state=open]:animate-collapsible-down",
        "data-[state=closed]:fill-mode-forwards",
        "data-[state=closed]:pointer-events-none",
        "data-[state=open]:duration-(--animation-duration)",
        "data-[state=closed]:duration-(--animation-duration)",
        className,
      )}
      {...props}
    >
      <ReasoningFade side="top" />
      {children}
      {isPreview ? <ReasoningFade /> : null}
    </CollapsibleContent>
  );
}

/**
 * Styles the body; the caller passes already-rendered markdown in.
 *
 * The scroll effect only runs while a live preview is streaming, and exists so
 * the panel follows the newest tokens without fighting a reader who scrolled
 * up to read something.
 */
function ReasoningText({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  const isPreview = useContext(ReasoningPreviewContext);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPreview) return;
    const scrollEl = scrollRef.current;
    const contentEl = contentRef.current;
    if (!scrollEl || !contentEl) return;

    let pinned = true;
    let lastScrollTop = scrollEl.scrollTop;
    let lastScrollHeight = scrollEl.scrollHeight;
    const isAtBottom = () =>
      Math.abs(
        scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight,
      ) <= 1 || scrollEl.scrollHeight <= scrollEl.clientHeight;

    const pin = () => {
      if (!pinned) return;
      scrollEl.scrollTop = scrollEl.scrollHeight;
    };
    // A pin's own scroll event can arrive after new content grew the scroll
    // height and read as "not at bottom"; only an upward move at unchanged
    // scroll height is user intent.
    const onScroll = () => {
      if (isAtBottom()) {
        pinned = true;
      } else if (
        scrollEl.scrollTop < lastScrollTop &&
        scrollEl.scrollHeight === lastScrollHeight
      ) {
        pinned = false;
      }
      lastScrollTop = scrollEl.scrollTop;
      lastScrollHeight = scrollEl.scrollHeight;
    };

    pin();
    scrollEl.addEventListener("scroll", onScroll);
    const observer = new ResizeObserver(pin);
    observer.observe(contentEl);
    return () => {
      scrollEl.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [isPreview]);

  return (
    <div
      ref={scrollRef}
      data-slot="reasoning-text"
      className={cn(
        // `ps-6` is logical in the reference too — copied as written.
        "relative z-0 max-h-64 overflow-y-auto ps-6 pt-2 pb-2 leading-relaxed text-pretty",
        "transform-gpu transition-[transform,opacity] ease-[cubic-bezier(0.32,0.72,0,1)]",
        "motion-reduce:animate-none",
        "group-data-[state=open]/collapsible-content:animate-in",
        "group-data-[state=closed]/collapsible-content:animate-out",
        "group-data-[state=open]/collapsible-content:fade-in-0",
        "group-data-[state=closed]/collapsible-content:fade-out-0",
        "group-data-[state=open]/collapsible-content:slide-in-from-top-4",
        "group-data-[state=closed]/collapsible-content:slide-out-to-top-4",
        "group-data-[state=open]/collapsible-content:blur-in-[2px]",
        "group-data-[state=closed]/collapsible-content:blur-out-[2px]",
        "group-data-[state=open]/collapsible-content:duration-(--animation-duration)",
        "group-data-[state=closed]/collapsible-content:duration-(--animation-duration)",
        className,
      )}
      {...props}
    >
      <div ref={contentRef} className="space-y-4">
        {children}
      </div>
    </div>
  );
}

export { ReasoningRoot, ReasoningTrigger, ReasoningContent, ReasoningText };
