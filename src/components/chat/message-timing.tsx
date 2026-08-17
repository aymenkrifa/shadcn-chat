import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMessage } from "@/lib/chat/message-context";
import { cn } from "@/lib/utils";

/**
 * How long the answer took, as a monospaced readout inside the action bar, with
 * the details on hover.
 *
 * Ported from `packages/ui/src/components/assistant-ui/message-timing.tsx`
 * (read 2026-08-17). The reference reads a live streaming record — first-token
 * time, tok/s, chunk count — from `useMessageTiming()`; our runtime records
 * wall-clock duration and the model that produced it, so the tooltip has two
 * rows instead of four. Everything visual is the reference's: the trigger's
 * `font-mono tabular-nums` (a proportional font makes the number jitter as it
 * settles), the popover-styled tooltip, and the label/value grid.
 */

const formatTimingMs = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  // NOTE: one decimal per this slice's spec. The reference uses `.toFixed(2)`
  // — flip this single call if reference-exact digits matter.
  return `${(ms / 1000).toFixed(1)}s`;
};

export function MessageTiming({
  className,
  side = "right",
}: {
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}) {
  const { message } = useMessage();
  const durationMs = message.metadata?.durationMs;
  const model = message.metadata?.model;

  // Nothing to show until the turn has finished — the reference bails on the
  // same fact (`totalStreamTime === undefined`).
  if (durationMs === undefined) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-slot="message-timing-trigger"
          aria-label="Message timing"
          className={cn(
            "text-muted-foreground hover:bg-accent hover:text-accent-foreground flex items-center rounded-md p-1 font-mono text-xs tabular-nums transition-colors",
            className,
          )}
        >
          {formatTimingMs(durationMs)}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={8}
        data-slot="message-timing-popover"
        // `[&_span>svg]:hidden!` is the reference's way of suppressing the
        // tooltip arrow so this reads as a small popover panel rather than a
        // tip. It was written against Base UI, but Radix's popper arrow is also
        // an `<svg>` inside a positioning `<span>`, so the selector still bites.
        // The rest of the string overrides shadcn's inverted tooltip skin
        // (`bg-foreground text-background`) back to popover colours.
        className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 shadow-md [&_span>svg]:hidden!"
      >
        <div className="grid min-w-35 gap-1.5 text-xs">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Total</span>
            <span className="font-mono tabular-nums">
              {formatTimingMs(durationMs)}
            </span>
          </div>
          {model !== undefined && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Model</span>
              <span className="font-mono tabular-nums">{model}</span>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
