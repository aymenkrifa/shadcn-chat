import { PencilIcon } from "lucide-react";

import { UserMessageAttachments } from "@/components/chat/attachment";
import { BranchPicker } from "@/components/chat/branch-picker";
import { QuoteBlock } from "@/components/chat/quote";
import { TooltipIconButton } from "@/components/chat/tooltip-icon-button";
import { useMessage } from "@/lib/chat/message-context";
import { useChat, useChatState } from "@/lib/chat/provider";
import { partsToText } from "@/lib/chat/store";
import { cn } from "@/lib/utils";

/**
 * The reader's own turn.
 *
 * Class strings copied verbatim from the reference's `UserMessage` /
 * `UserActionBar` (apps/docs/components/examples/base.tsx, read 2026-08-17).
 * The grid is the whole reason the user side reads as the other speaker: a
 * `minmax(72px,1fr)` gutter that the bubble can never enter, everything pushed
 * into column 2 by `[&:where(>*)]:col-start-2`, and the edit affordance hung out
 * into that gutter with `-translate-x-full`.
 *
 * Two translations of primitives we do not have:
 *
 * 1. `ActionBarPrimitive.Root autohide="not-last"` hides the bar unless the
 *    message is the last one OR `s.message.isHovering` — hover tracked in the
 *    reference's store. We have no hover state, so the root carries
 *    `group/message` (the one class added to the reference's string) and the bar
 *    fades in on `group-hover`. Consequence worth knowing: the button stays in
 *    the tab order on older messages where the reference unmounts it, so
 *    `focus-within:opacity-100` makes it visible when a keyboard reaches it —
 *    deliberately better than the reference, visually identical for a pointer.
 * 2. `hideWhenRunning` — the reference returns null from the action bar root
 *    while the thread is generating; the bar (not the wrapper) is skipped here,
 *    so the wrapper's `peer-empty:hidden` relationship to the bubble is intact.
 */
export function UserMessage() {
  const { message, isLast } = useMessage();
  const isRunning = useChatState((state) => state.thread.isRunning);
  const canEdit = useChatState((state) => state.thread.capabilities.edit);
  const { beginEdit } = useChat();

  const text = partsToText(message.parts);

  return (
    <div
      data-slot="user-message-root"
      data-role="user"
      className="group/message fade-in slide-in-from-bottom-1 animate-in mx-auto grid w-full max-w-(--thread-max-width) auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 duration-150 [&:where(>*)]:col-start-2"
    >
      <UserMessageAttachments />

      <div className="relative col-start-2 min-w-0">
        {/* `empty:hidden` is load-bearing and `:empty` means literally no child
            nodes — so an empty turn must render NOTHING here, not an empty span.
            That is also what switches off the edit affordance via
            `peer-empty:hidden` below. */}
        <div className="peer bg-muted text-foreground rounded-xl px-4 py-2 wrap-break-word empty:hidden">
          {message.quote ? <QuoteBlock text={message.quote.text} /> : null}
          {text ? (
            // `whitespace-pre-wrap` keeps a multi-line question's shape (people
            // paste code and numbered lists in here). `dir="auto"` because the
            // reader types FR, EN or Arabic script and nothing upstream declares
            // which — without it, an Arabic question renders with its
            // punctuation on the wrong side.
            <span className="whitespace-pre-wrap" dir="auto">
              {text}
            </span>
          ) : null}
        </div>

        <div className="absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-2 peer-empty:hidden">
          {isRunning ? null : (
            <div
              className={cn(
                "flex flex-col items-end",
                !isLast && "opacity-0 focus-within:opacity-100 group-hover/message:opacity-100",
              )}
            >
              <TooltipIconButton
                tooltip="Edit"
                // The reference's `ActionBarPrimitive.Edit` disables itself when
                // the runtime cannot edit; same rule, read off capabilities.
                disabled={!canEdit}
                onClick={() => beginEdit(message.id)}
              >
                <PencilIcon />
              </TooltipIconButton>
            </div>
          )}
        </div>
      </div>

      <BranchPicker className="col-span-full col-start-1 row-start-3 -mr-1 justify-end" />
    </div>
  );
}
