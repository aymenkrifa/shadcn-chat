import type { ComponentProps, CSSProperties, ElementType } from "react";
import { CheckIcon, ChevronDownIcon, LoaderIcon, XCircleIcon } from "lucide-react";

import {
  ANIMATION_DURATION,
  ShimmerOverlay,
} from "@/components/chat/reasoning";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { PartStatus } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

/**
 * The generic card a tool call falls back to when no bespoke tool UI exists.
 * Ported from the reference's
 * `packages/ui/src/components/assistant-ui/tool-fallback.tsx` (read
 * 2026-08-17); class strings are the reference's, verbatim.
 *
 * The Base UI → Radix translations and the dropped `useScrollLock` are
 * documented once in `reasoning.tsx`. `aui-*` class names are dropped;
 * `data-slot` attributes are kept.
 *
 * Three things the reference has that our runtime cannot feed, so they are
 * absent rather than faked:
 *  · the elapsed-time readout — it came from `useToolCallElapsed()`, and
 *    `ToolCallPart` carries no timing;
 *  · the human-approval bar — `PartStatus` has no `requires-action` case, so
 *    there is nothing to approve and no auto-open on it;
 *  · a structured error payload — our `incomplete` status carries `reason`
 *    (a string) where the reference carried `error`, so `reason` is what the
 *    error block renders.
 */

const statusIconMap: Record<PartStatus["type"], ElementType> = {
  running: LoaderIcon,
  complete: CheckIcon,
  incomplete: XCircleIcon,
};

/**
 * `JSON.stringify` throws on a circular structure and on BigInt. Both are
 * plausible in an arbitrary tool's args, and an exception here would unmount
 * the whole thread rather than one card — so the failure degrades to
 * `String(value)` instead of propagating.
 */
function toJsonBlock(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function ToolFallbackRoot({
  className,
  children,
  ...props
}: ComponentProps<typeof Collapsible>) {
  return (
    <Collapsible
      data-slot="tool-fallback-root"
      className={cn("group/tool-fallback-root w-full", className)}
      style={
        {
          "--animation-duration": `${ANIMATION_DURATION}ms`,
        } as CSSProperties
      }
      {...props}
    >
      {children}
    </Collapsible>
  );
}

function ToolFallbackTrigger({
  toolName,
  status,
  isError,
  className,
  ...props
}: ComponentProps<typeof CollapsibleTrigger> & {
  toolName: string;
  status: PartStatus;
  isError?: boolean;
}) {
  const isRunning = status.type === "running";
  const isCancelled = status.type === "incomplete" && status.reason === "cancelled";

  // `isError` is ours, not the reference's (which inferred failure from the
  // status alone): a tool can complete and still return an error payload, and
  // the icon is the only place that distinction is visible from the collapsed
  // row.
  const Icon = isError ? XCircleIcon : statusIconMap[status.type];
  const label = isCancelled ? "Cancelled tool" : "Used tool";

  return (
    <CollapsibleTrigger
      data-slot="tool-fallback-trigger"
      className={cn(
        "group/trigger text-muted-foreground hover:text-foreground flex w-fit origin-left items-center gap-2 py-1.5 text-sm transition-[color,scale] active:scale-[0.98]",
        className,
      )}
      {...props}
    >
      <Icon
        data-slot="tool-fallback-trigger-icon"
        className={cn(
          "size-4 shrink-0",
          isCancelled && "text-muted-foreground",
          isRunning && "animate-spin [animation-duration:0.6s]",
          isError && !isCancelled && "text-destructive",
        )}
      />
      <span
        data-slot="tool-fallback-trigger-label"
        className={cn(
          "relative inline-block text-start leading-none",
          isCancelled && "text-muted-foreground line-through",
          isError && !isCancelled && "text-destructive",
        )}
      >
        <span>
          {label}: <b>{toolName}</b>
        </span>
        {isRunning && (
          <ShimmerOverlay data-slot="tool-fallback-trigger-shimmer">
            {label}: <b>{toolName}</b>
          </ShimmerOverlay>
        )}
      </span>
      <ChevronDownIcon
        data-slot="tool-fallback-trigger-chevron"
        className={cn(
          "size-4 shrink-0",
          "transition-transform duration-(--animation-duration) ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          "-rotate-90",
          "group-data-[state=open]/trigger:rotate-0",
        )}
      />
    </CollapsibleTrigger>
  );
}

function ToolFallbackContent({
  className,
  children,
  ...props
}: ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      data-slot="tool-fallback-content"
      className={cn(
        "relative overflow-hidden text-sm outline-none",
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
      <div
        className={cn(
          // `ps-6` is logical in the reference too — copied as written; it
          // lines the body up under the trigger's label, past the icon.
          "flex flex-col gap-2 ps-6 pt-1 pb-2 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none",
          "group-data-[state=open]/collapsible-content:animate-in group-data-[state=open]/collapsible-content:fade-in-0 group-data-[state=open]/collapsible-content:blur-in-[2px] group-data-[state=open]/collapsible-content:slide-in-from-top-1",
          "group-data-[state=closed]/collapsible-content:animate-out group-data-[state=closed]/collapsible-content:fade-out-0 group-data-[state=closed]/collapsible-content:blur-out-[2px] group-data-[state=closed]/collapsible-content:slide-out-to-top-1",
          "group-data-[state=closed]/collapsible-content:duration-(--animation-duration) group-data-[state=open]/collapsible-content:duration-(--animation-duration)",
        )}
      >
        {children}
      </div>
    </CollapsibleContent>
  );
}

/**
 * `whitespace-pre-wrap` is the reference's; `overflow-x-auto` is added on top
 * of it so a single unbreakable token (a URL, a base64 blob) scrolls inside the
 * card instead of widening the whole message column.
 */
const jsonBlockClasses =
  "bg-muted/50 text-foreground/90 overflow-x-auto rounded-md p-2.5 text-xs whitespace-pre-wrap";

function ToolFallbackArgs({
  args,
  className,
  ...props
}: ComponentProps<"div"> & { args: unknown }) {
  if (args === undefined) return null;

  return (
    <div data-slot="tool-fallback-args" className={className} {...props}>
      <pre className={jsonBlockClasses}>{toJsonBlock(args)}</pre>
    </div>
  );
}

function ToolFallbackResult({
  result,
  className,
  ...props
}: ComponentProps<"div"> & { result?: unknown }) {
  if (result === undefined) return null;

  return (
    <div data-slot="tool-fallback-result" className={className} {...props}>
      <p className="text-muted-foreground text-xs font-medium">Result:</p>
      <pre className={cn(jsonBlockClasses, "mt-1")}>{toJsonBlock(result)}</pre>
    </div>
  );
}

function ToolFallbackError({
  status,
  className,
  ...props
}: ComponentProps<"div"> & { status: PartStatus }) {
  if (status.type !== "incomplete") return null;
  if (!status.reason) return null;

  const isCancelled = status.reason === "cancelled";
  const headerText = isCancelled ? "Cancelled reason:" : "Error:";

  return (
    <div data-slot="tool-fallback-error" className={className} {...props}>
      <p className="text-muted-foreground font-semibold">{headerText}</p>
      <p className="text-muted-foreground">{status.reason}</p>
    </div>
  );
}

export interface ToolFallbackProps {
  toolName: string;
  args: unknown;
  result?: unknown;
  isError?: boolean;
  status: PartStatus;
}

export function ToolFallback({
  toolName,
  args,
  result,
  isError,
  status,
}: ToolFallbackProps) {
  const isCancelled = status.type === "incomplete" && status.reason === "cancelled";

  return (
    <ToolFallbackRoot>
      <ToolFallbackTrigger
        toolName={toolName}
        status={status}
        isError={isError}
      />
      <ToolFallbackContent>
        <ToolFallbackError status={status} />
        <ToolFallbackArgs args={args} className={cn(isCancelled && "opacity-60")} />
        {!isCancelled && <ToolFallbackResult result={result} />}
      </ToolFallbackContent>
    </ToolFallbackRoot>
  );
}
