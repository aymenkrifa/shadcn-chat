import { ArrowDownIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { AssistantMessage } from "@/components/chat/assistant-message";
import { Composer } from "@/components/chat/composer";
import { EditComposer } from "@/components/chat/edit-composer";
import { SelectionToolbar } from "@/components/chat/quote";
import { ThreadSuggestions } from "@/components/chat/suggestions";
import { TooltipIconButton } from "@/components/chat/tooltip-icon-button";
import { UserMessage } from "@/components/chat/user-message";
import { ThreadWelcome } from "@/components/chat/welcome";
import { MessageProvider } from "@/lib/chat/message-context";
import {
  selectIsNewChatView,
  useChatState,
  useComposerIsEmpty,
} from "@/lib/chat/provider";
import { cn } from "@/lib/utils";

/**
 * The transcript: viewport, message list, docked footer.
 *
 * Ported from the reference's `Thread` / `ThreadScrollToBottom`
 * (assistant-ui/apps/docs/components/examples/base.tsx, read 2026-08-17). Every
 * class string and CSS variable here is verbatim from it.
 *
 * The one thing that is NOT a copy is the scroll behaviour, because the
 * reference gets it from `ThreadPrimitive.Viewport` — a primitive we do not
 * have. It is reimplemented below, in about 30 lines.
 */

/**
 * Inline CSS custom properties, verbatim from the reference.
 *
 * They live on the root rather than in `index.css` because they are the
 * design's shared measurements and every descendant reads them as arbitrary
 * values — `max-w-(--thread-max-width)` in the welcome, the messages and the
 * footer, `rounded-(--composer-radius)` in the composer, the edit composer and
 * the footer's top corners. Move them and three sibling files break silently.
 *
 * Cast rather than `["--x" as string]`-indexed (the reference's spelling) so the
 * keys stay readable and greppable; the emitted style attribute is identical.
 */
const THREAD_STYLE = {
  "--thread-max-width": "44rem",
  "--composer-bg": "var(--color-card)",
  "--composer-radius": "1.5rem",
  "--composer-padding": "8px",
} as CSSProperties;

/**
 * How close to the bottom still counts as "at the bottom", in px.
 *
 * This number is the whole auto-scroll policy. Too large and a reader who
 * scrolled up a little gets yanked back down mid-sentence — the single
 * most-hated bug in any chat UI, and unlike a visual bug it is impossible to
 * work around. Too small and the stick breaks on its own, because browsers
 * report a sub-pixel-short `scrollTop` at maximum scroll under fractional
 * zoom/DPR, so `distance` is often 0.5–2px when the viewport is genuinely
 * pinned. 32px ≈ one line of body text: it absorbs the rounding, and it is far
 * below one wheel notch (~100px), so any deliberate scroll up releases the
 * stick immediately.
 */
const BOTTOM_THRESHOLD_PX = 32;

export function Thread() {
  const isEmpty = useChatState(selectIsNewChatView);
  const messages = useChatState((state) => state.thread.messages);
  // A primitive, not `state.editing` — returning the object would be a fresh
  // reference on nothing and re-render the whole transcript per store emit.
  const editingMessageId = useChatState((state) => state.editing?.messageId);
  const composerIsEmpty = useComposerIsEmpty();

  const viewportRef = useRef<HTMLDivElement>(null);
  const messageGroupRef = useRef<HTMLDivElement>(null);

  /**
   * Whether we are still following new content. A ref and not just the state
   * below: the follow effect has to read it without listing it as a dependency,
   * or crossing the threshold would itself re-run the effect and re-pin the
   * viewport — the exact yank this whole mechanism exists to prevent.
   */
  const stickToBottomRef = useRef(true);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const pinToBottom = useCallback((behavior: ScrollBehavior) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    // `scrollTo` on the viewport, never `scrollIntoView` on the newest part:
    // `scrollIntoView` walks up and scrolls EVERY scrollable ancestor, so the
    // page itself jumps whenever the transcript grows.
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
  }, []);

  const handleScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distance =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const atBottom = distance <= BOTTOM_THRESHOLD_PX;
    stickToBottomRef.current = atBottom;
    // Same value in, no re-render out — React bails on an identical setState,
    // so this fires at most twice per scroll gesture.
    setIsAtBottom(atBottom);
  }, []);

  // Follow the transcript as messages and parts land, and pin on mount so a
  // seeded conversation opens at its newest message rather than its oldest.
  //
  // `behavior: "instant"` overrides the root's CSS `scroll-smooth`, and it has
  // to: an animated follow reports intermediate positions to `handleScroll`,
  // every one of them "not at the bottom", which releases the stick a few
  // frames after each part arrives and leaves the scroller drifting behind the
  // stream. Smooth is right for a deliberate jump (the button below), wrong for
  // a per-part correction.
  useLayoutEffect(() => {
    if (!stickToBottomRef.current) return;
    pinToBottom("instant");
  }, [messages, pinToBottom]);

  // Content also grows without the message array changing: a reasoning block or
  // tool group expanding, KaTeX or highlight.js relaying out after paint, a web
  // font swapping in. The effect above cannot see any of that.
  useEffect(() => {
    const group = messageGroupRef.current;
    if (!group) return;
    const observer = new ResizeObserver(() => {
      if (!stickToBottomRef.current) return;
      pinToBottom("instant");
    });
    observer.observe(group);
    return () => observer.disconnect();
  }, [pinToBottom]);

  return (
    <div
      className="bg-background @container flex h-full flex-col"
      style={THREAD_STYLE}
    >
      <div
        ref={viewportRef}
        onScroll={handleScroll}
        data-slot="thread-viewport"
        className={cn(
          "relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth px-4 pt-4",
          isEmpty && "justify-center",
        )}
      >
        {isEmpty && <ThreadWelcome />}

        {/*
          `empty:hidden` is why this div can be unconditional: with no messages
          it has no child nodes at all, so it collapses and its `mb-14` does not
          push the centred composer off-centre on a new chat.
        */}
        <div
          ref={messageGroupRef}
          data-slot="message-group"
          className="mb-14 flex flex-col gap-y-6 empty:hidden"
        >
          {messages.map((message, index) => (
            <MessageProvider
              key={message.id}
              message={message}
              isLast={index === messages.length - 1}
            >
              {editingMessageId === message.id ? (
                <EditComposer />
              ) : message.role === "user" ? (
                <UserMessage />
              ) : (
                <AssistantMessage />
              )}
            </MessageProvider>
          ))}
        </div>

        <div
          data-slot="thread-viewport-footer"
          className={cn(
            "bg-background mx-auto flex w-full max-w-(--thread-max-width) flex-col gap-4 overflow-visible pb-4 md:pb-6",
            // `sticky` is also what gives the scroll-to-bottom button its
            // containing block: `position: sticky` is positioned, so the
            // button's `-top-12` resolves against this footer. On an empty
            // thread there is no sticky, the button would resolve against the
            // viewport instead — and it is `disabled:invisible` there anyway,
            // because an empty thread has nothing to scroll.
            !isEmpty && "sticky bottom-0 mt-auto rounded-t-(--composer-radius)",
          )}
        >
          <ThreadScrollToBottom
            isAtBottom={isAtBottom}
            onScrollToBottom={() => {
              stickToBottomRef.current = true;
              pinToBottom("smooth");
            }}
          />
          <Composer />
          {isEmpty && (
            // `min-h-19` reserves the rail's height so the composer does not
            // jump upward on the first keystroke, when the suggestions below
            // unmount. Removing it looks like a bug the moment you type.
            <div className="min-h-19">
              {composerIsEmpty && <ThreadSuggestions />}
            </div>
          )}
        </div>
      </div>

      <SelectionToolbar />
    </div>
  );
}

function ThreadScrollToBottom({
  isAtBottom,
  onScrollToBottom,
}: {
  isAtBottom: boolean;
  onScrollToBottom: () => void;
}) {
  return (
    <TooltipIconButton
      tooltip="Scroll to bottom"
      variant="outline"
      disabled={isAtBottom}
      onClick={onScrollToBottom}
      className="dark:border-border dark:bg-background dark:hover:bg-accent absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible"
    >
      <ArrowDownIcon />
    </TooltipIconButton>
  );
}
