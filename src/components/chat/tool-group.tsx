import { useState } from "react";
import type { ComponentProps, CSSProperties } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDownIcon, LoaderIcon } from "lucide-react";

import {
  ANIMATION_DURATION,
  ShimmerOverlay,
} from "@/components/chat/reasoning";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * The "N tool calls" disclosure that wraps a run of consecutive tool parts.
 * Ported from the reference's
 * `packages/ui/src/components/assistant-ui/tool-group.tsx` (read 2026-08-17);
 * class strings are the reference's, verbatim.
 *
 * The Base UI → Radix translations (`data-open`/`data-closed` →
 * `data-[state=…]`, the doubled chevron rule collapsing to one, the collapsible
 * height keyframes coming from tw-animate-css) are documented once in
 * `reasoning.tsx`. `useScrollLock` is dropped for the same reason given there.
 * `aui-*` class names are dropped; `data-slot` attributes are kept.
 */

const toolGroupVariants = cva("group/tool-group w-full", {
  variants: {
    variant: {
      outline: "rounded-lg border py-3",
      ghost: "",
      muted: "border-muted-foreground/30 bg-muted/30 rounded-lg border py-3",
    },
  },
  defaultVariants: { variant: "outline" },
});

export type ToolGroupRootProps = Omit<
  ComponentProps<typeof Collapsible>,
  "open" | "onOpenChange"
> &
  VariantProps<typeof toolGroupVariants> & {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    defaultOpen?: boolean;
  };

function ToolGroupRoot({
  className,
  variant,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
  children,
  ...props
}: ToolGroupRootProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = (open: boolean) => {
    if (!isControlled) {
      setUncontrolledOpen(open);
    }
    controlledOnOpenChange?.(open);
  };

  return (
    <Collapsible
      data-slot="tool-group-root"
      // Unlike the reasoning root, this one defaults the attribute: every
      // variant-scoped rule below keys off `data-variant`, so leaving it unset
      // would drop the outline variant's padding and borders.
      data-variant={variant ?? "outline"}
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn(
        toolGroupVariants({ variant }),
        "group/tool-group-root",
        className,
      )}
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

function ToolGroupTrigger({
  count,
  active = false,
  className,
  ...props
}: ComponentProps<typeof CollapsibleTrigger> & {
  count: number;
  active?: boolean;
}) {
  // The reference's label — "1 tool call" / "3 tool calls" — with no wrench
  // icon. My brief described a "Used N tools" row with a WrenchIcon; the
  // fidelity rule wins, since this is the row the visual comparison sees.
  const label = `${count} tool ${count === 1 ? "call" : "calls"}`;

  return (
    <CollapsibleTrigger
      data-slot="tool-group-trigger"
      className={cn(
        "group/trigger flex origin-left items-center gap-2 text-sm transition-[color,scale] active:scale-[0.98]",
        "group-data-[variant=ghost]/tool-group-root:text-muted-foreground group-data-[variant=ghost]/tool-group-root:hover:text-foreground group-data-[variant=ghost]/tool-group-root:py-1.5",
        "group-data-[variant=outline]/tool-group-root:w-full group-data-[variant=outline]/tool-group-root:px-4",
        "group-data-[variant=muted]/tool-group-root:w-full group-data-[variant=muted]/tool-group-root:px-4",
        className,
      )}
      {...props}
    >
      {active && (
        <LoaderIcon
          data-slot="tool-group-trigger-loader"
          className="size-3 shrink-0 animate-spin [animation-duration:0.6s]"
        />
      )}
      <span
        data-slot="tool-group-trigger-label"
        className={cn(
          "relative inline-block text-start leading-none font-medium",
          "group-data-[variant=ghost]/tool-group-root:font-normal",
          "group-data-[variant=outline]/tool-group-root:grow",
          "group-data-[variant=muted]/tool-group-root:grow",
        )}
      >
        <span className="text-xs">{label}</span>
        {active && (
          <ShimmerOverlay
            data-slot="tool-group-trigger-shimmer"
            className="text-xs"
          >
            {label}
          </ShimmerOverlay>
        )}
      </span>
      <ChevronDownIcon
        data-slot="tool-group-trigger-chevron"
        className={cn(
          "size-3 shrink-0",
          "transition-transform duration-(--animation-duration) ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          "-rotate-90",
          "group-data-[state=open]/trigger:rotate-0",
        )}
      />
    </CollapsibleTrigger>
  );
}

function ToolGroupContent({
  className,
  children,
  ...props
}: ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      data-slot="tool-group-content"
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
      {/* The staggered `[&>*]` animation delays are what make the expanded
          list read as a cascade rather than a jump — each child is one tool
          card, so the nth-child selectors are the stagger. */}
      <div
        className={cn(
          "mt-2 flex flex-col gap-2",
          "group-data-[variant=ghost]/tool-group-root:mt-1 group-data-[variant=ghost]/tool-group-root:gap-1",
          "group-data-[variant=outline]/tool-group-root:mt-3 group-data-[variant=outline]/tool-group-root:border-t group-data-[variant=outline]/tool-group-root:px-4 group-data-[variant=outline]/tool-group-root:pt-3",
          "group-data-[variant=muted]/tool-group-root:mt-3 group-data-[variant=muted]/tool-group-root:border-t group-data-[variant=muted]/tool-group-root:px-4 group-data-[variant=muted]/tool-group-root:pt-3",
          "[&>*]:animate-in [&>*]:fade-in-0 [&>*]:blur-in-[2px] [&>*]:slide-in-from-top-1 [&>*]:duration-(--animation-duration) [&>*]:ease-[cubic-bezier(0.32,0.72,0,1)]",
          "[&>*]:motion-reduce:animate-none",
          "[&>*:nth-child(2)]:[animation-delay:40ms]",
          "[&>*:nth-child(3)]:[animation-delay:80ms]",
          "[&>*:nth-child(4)]:[animation-delay:120ms]",
          "[&>*:nth-child(n+5)]:[animation-delay:160ms]",
        )}
      >
        {children}
      </div>
    </CollapsibleContent>
  );
}

export { ToolGroupRoot, ToolGroupTrigger, ToolGroupContent };
