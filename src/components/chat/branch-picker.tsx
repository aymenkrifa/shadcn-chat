import type { ComponentProps } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { TooltipIconButton } from "@/components/chat/tooltip-icon-button";
import { useMessage } from "@/lib/chat/message-context";
import { useChat } from "@/lib/chat/provider";
import { cn } from "@/lib/utils";

/**
 * "3 / 5" with a chevron either side, for a message the reader has edited or
 * regenerated.
 *
 * Ported from base.tsx's `BranchPicker` (read 2026-08-17). The reference gets
 * `hideWhenSingleBranch` from `BranchPickerPrimitive.Root`; here it is the early
 * return, and it matters more than it looks: every message in the transcript
 * mounts this component, so without the guard the whole thread would sprout
 * "1 / 1" controls.
 *
 * Takes the full div prop bag rather than only `className` (which is all the
 * assistant side passes) because the reference's user message positions it with
 * its own `data-slot` and grid classes — same prop shape as
 * `BranchPickerPrimitive.Root.Props` there.
 */
export function BranchPicker({ className, ...rest }: ComponentProps<"div">) {
  const { message } = useMessage();
  const { switchBranch } = useChat();

  if (message.branchCount < 2) return null;

  return (
    <div
      data-slot="aui_branch-picker-root"
      {...rest}
      // Class string copied from the reference 2026-08-17. The negative `-ml-2`
      // pulls the first chevron back over the message's own padding so the
      // glyph, not the button box, lines up with the text above it.
      className={cn(
        "text-muted-foreground mr-2 -ml-2 inline-flex items-center text-xs",
        className,
      )}
    >
      <TooltipIconButton
        tooltip="Previous"
        disabled={message.branchIndex === 0}
        onClick={() => switchBranch(message.id, -1)}
      >
        <ChevronLeftIcon />
      </TooltipIconButton>
      <span data-slot="aui_branch-picker-state" className="font-medium">
        {message.branchIndex + 1} / {message.branchCount}
      </span>
      <TooltipIconButton
        tooltip="Next"
        disabled={message.branchIndex >= message.branchCount - 1}
        onClick={() => switchBranch(message.id, 1)}
      >
        <ChevronRightIcon />
      </TooltipIconButton>
    </div>
  );
}
