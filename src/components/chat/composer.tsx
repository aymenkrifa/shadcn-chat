import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent, MouseEvent, SyntheticEvent } from "react";
import { ArrowUpIcon, MicIcon, SquareIcon } from "lucide-react";

import {
  ComposerAddAttachment,
  ComposerAttachments,
} from "@/components/chat/attachment";
import { ModelSelector } from "@/components/chat/model-selector";
import { ComposerQuotePreview } from "@/components/chat/quote";
import { TooltipIconButton } from "@/components/chat/tooltip-icon-button";
import {
  ComposerTriggerPopover,
  useMentionAdapter,
  useSlashCommandAdapter,
  type TriggerKeyHandler,
} from "@/components/chat/trigger-popover";
import { Button } from "@/components/ui/button";
import { useChat, useChatState } from "@/lib/chat/provider";

/**
 * The composer.
 *
 * Every class string on the shell, the input and the action row is copied
 * verbatim off the reference's `Composer` / `ComposerAction`
 * (assistant-ui `apps/docs/components/examples/base.tsx`, read 2026-08-17).
 * The `--composer-radius` / `--composer-bg` / `--composer-padding` vars the shell
 * consumes are set by the thread root, not here.
 *
 * The one structural difference: the reference's input is a Lexical editor
 * (rich text, mention chips). We use a plain auto-growing `<textarea>`, styled
 * to match — see `trigger-popover.tsx` for what that costs behaviourally.
 */
export function Composer() {
  const text = useChatState((state) => state.composer.text);
  const attachmentCount = useChatState((state) => state.composer.attachments.length);
  const isRunning = useChatState((state) => state.thread.isRunning);
  const canDictate = useChatState((state) => state.thread.capabilities.dictation);
  const isDictating = useChatState((state) => state.composer.dictation !== null);
  const supportsAttachments = useChatState((state) => state.thread.capabilities.attachments);
  const actions = useChat();

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  /**
   * Where the caret must end up after a trigger selection rewrites the text.
   * It is applied in the layout effect below rather than inline, because the
   * textarea's `value` is only the new text after React commits — setting the
   * selection before that commit puts the caret in the old string and it is
   * immediately clobbered by the value assignment.
   */
  const pendingCaretRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const element = inputRef.current;
    if (!element) return;

    // Auto-grow. `height = "auto"` first is load-bearing: `scrollHeight` never
    // shrinks below the element's current height, so without the reset the box
    // only ever grows and deleting a line leaves a gap. `max-h-48` caps it and
    // `overflow-y-auto` takes over past that.
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;

    const pending = pendingCaretRef.current;
    if (pending !== null) {
      pendingCaretRef.current = null;
      element.focus();
      element.setSelectionRange(pending, pending);
    }
  }, [text]);

  /** The trigger popovers register here so they can claim keys before the textarea. */
  const triggerKeyHandlers = useRef(new Set<TriggerKeyHandler>());
  const registerKeyHandler = useCallback((handler: TriggerKeyHandler) => {
    const handlers = triggerKeyHandlers.current;
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  }, []);

  const handleTriggerReplace = useCallback(
    (nextText: string, nextCaret: number) => {
      pendingCaretRef.current = nextCaret;
      setCaret(nextCaret);
      actions.setComposerText(nextText);
    },
    [actions],
  );

  const mention = useMentionAdapter();
  const slash = useSlashCommandAdapter();

  const canSend = text.trim() !== "" || attachmentCount > 0;

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setCaret(event.target.selectionStart);
    actions.setComposerText(event.target.value);
  };

  /**
   * The `select` event does not fire for a bare caret move, so the caret is
   * re-read after keys and clicks too. The trigger pickers are a pure function
   * of (text, caret), and a stale caret is how you get a mention popover that
   * stays open after the reader arrows away from the `@`.
   */
  const syncCaret = (event: SyntheticEvent<HTMLTextAreaElement>) => {
    setCaret(event.currentTarget.selectionStart);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    for (const handler of triggerKeyHandlers.current) {
      if (handler(event)) return;
    }

    if (event.key !== "Enter" || event.shiftKey) return;

    // An IME (Japanese, Chinese, Arabic keyboards with candidate lists) uses
    // Enter to COMMIT the candidate that is currently being composed. Sending on
    // that Enter cuts the word in half and fires a half-typed message. The bug is
    // invisible on a Latin keyboard, which is exactly why it survives review.
    if (event.nativeEvent.isComposing) return;

    event.preventDefault();
    if (isRunning) return;
    actions.send();
  };

  /**
   * Drag-and-drop, which is what the shell's whole `data-[dragging=true]` half
   * keys off. `preventDefault` on a file drag is claimed even when attachments
   * are unsupported: an unprevented file drop navigates the tab to the file and
   * the reader loses the conversation (the reference's dropzone says the same).
   */
  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    if (!supportsAttachments) {
      event.dataTransfer.dropEffect = "none";
      return;
    }
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    // Moving between the shell's own children fires dragleave on the shell; only
    // a leave that lands outside it should drop the highlight.
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    setIsDragging(false);
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    if (!supportsAttachments) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) actions.addAttachments(files);
  };

  const handleShellMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    // The shell says `cursor-text`, so clicking its padding has to land in the
    // input. Guarded to the shell itself so clicks on the buttons still work.
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    inputRef.current?.focus();
  };

  return (
    <div className="relative flex w-full flex-col">
      <div
        // The reference's dropzone sets the attribute only while dragging, so the
        // `data-[dragging=true]` half of the shell's class string is the only
        // state that exists — there is no `data-dragging="false"`.
        data-dragging={isDragging ? "true" : undefined}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onMouseDown={handleShellMouseDown}
        // Verbatim from the reference's composer shell (2026-08-17).
        className="border-border/60 data-[dragging=true]:border-ring focus-within:border-border dark:border-muted-foreground/15 dark:focus-within:border-muted-foreground/30 flex w-full cursor-text flex-col gap-2 rounded-(--composer-radius) border bg-(--composer-bg) p-(--composer-padding) shadow-[0_4px_16px_-8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] focus-within:shadow-[0_6px_24px_-8px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.05)] data-[dragging=true]:border-dashed data-[dragging=true]:bg-[color-mix(in_oklab,var(--color-accent)_50%,var(--color-background))] dark:shadow-none"
      >
        <ComposerQuotePreview />
        <ComposerAttachments />

        {/* The placeholder is a positioned SPAN, not the native `placeholder`
            attribute.

            Measured 2026-08-17 at 390x844: with a native placeholder this string
            WRAPPED TO TWO LINES and pushed the footer from 118px to 126px,
            because a textarea's placeholder cannot be truncated — `truncate` has
            nothing to apply to. The reference never has this problem: its Lexical
            placeholder is a real element, `absolute top-0 right-0 left-0
            truncate`, so it contributes zero height and ellipsises to one line at
            any width. Reproducing that needs a real element here too.

            Consequence that must not be lost: dropping the attribute drops the
            textarea's implicit accessible name with it, so the `aria-label` below
            is load-bearing, not decoration. The span is `aria-hidden` so a screen
            reader hears the label once rather than twice. */}
        <div className="relative flex w-full flex-col">
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onKeyUp={syncCaret}
            onClick={syncCaret}
            onFocus={syncCaret}
            onSelect={syncCaret}
            aria-label="Send a message"
            // The reference's input classes (2026-08-17). A bare textarea rather
            // than shadcn's `Textarea`, whose own border/shadow/min-h-16 would
            // have to be unset one utility at a time.
            className="max-h-48 min-h-10 w-full resize-none overflow-y-auto bg-transparent px-2.5 py-1 text-base leading-6 outline-none"
          />
          {text === "" && (
            <span
              aria-hidden="true"
              className="text-muted-foreground/60 pointer-events-none absolute top-0 right-0 left-0 truncate px-2.5 py-1 text-base leading-6"
            >
              Send a message... (@ to mention, / for commands)
            </span>
          )}
        </div>

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-1">
            <ComposerAddAttachment />
            <ModelSelector />
          </div>
          <div className="flex items-center gap-1.5">
            {canDictate && !isDictating && (
              <TooltipIconButton
                tooltip="Voice input"
                side="bottom"
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground size-7 rounded-full"
                aria-label="Start voice input"
                onClick={() => actions.startDictation()}
              >
                <MicIcon className="size-4" />
              </TooltipIconButton>
            )}
            {canDictate && isDictating && (
              <TooltipIconButton
                tooltip="Stop dictation"
                side="bottom"
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive size-7 rounded-full"
                aria-label="Stop voice input"
                onClick={() => actions.stopDictation()}
              >
                <SquareIcon className="size-3.5 animate-pulse fill-current" />
              </TooltipIconButton>
            )}
            {isRunning ? (
              <Button
                type="button"
                variant="default"
                size="icon"
                className="size-7 rounded-full"
                aria-label="Stop generating"
                onClick={() => actions.cancel()}
              >
                <SquareIcon className="size-3.5 fill-current" />
              </Button>
            ) : (
              <TooltipIconButton
                tooltip="Send message"
                side="bottom"
                type="button"
                variant="default"
                size="icon"
                className="size-7 rounded-full"
                aria-label="Send message"
                disabled={!canSend}
                onClick={() => actions.send()}
              >
                <ArrowUpIcon className="size-4" />
              </TooltipIconButton>
            )}
          </div>
        </div>
      </div>

      {/* Siblings of the shell, so they can overlay it without being clipped by
          its `overflow`-free but rounded box. */}
      <ComposerTriggerPopover
        char="@"
        {...mention}
        text={text}
        caret={caret}
        onReplace={handleTriggerReplace}
        registerKeyHandler={registerKeyHandler}
      />
      <ComposerTriggerPopover
        char="/"
        {...slash}
        emptyItemsLabel="No matching commands"
        text={text}
        caret={caret}
        onReplace={handleTriggerReplace}
        registerKeyHandler={registerKeyHandler}
      />
    </div>
  );
}
