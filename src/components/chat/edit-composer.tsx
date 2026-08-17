import { useEffect, useLayoutEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useChat, useChatState } from "@/lib/chat/provider";

/**
 * Editing one of your own turns in place.
 *
 * `thread.tsx` renders this instead of `<UserMessage/>` while
 * `s.editing?.messageId === message.id`, mirroring the reference's
 * `if (message.composer.isEditing) return <EditComposer/>`.
 *
 * Class strings copied verbatim from the reference's `EditComposer`
 * (apps/docs/components/examples/base.tsx, read 2026-08-17). Note the shape it
 * encodes: `ml-auto` + `max-w-[85%]` so the edit card sits where the bubble was
 * rather than spanning the thread, and the same `--composer-bg` /
 * `--composer-radius` as the real composer so editing feels like typing.
 *
 * The reference's input is a Lexical contenteditable with directive-chip
 * decorators. We render a plain `<textarea>`: no chips exist in this clone, and
 * the shadcn `Textarea` would drag in its own border, ring and `dark:bg-input/30`
 * — chrome the reference's input does not have, because the card supplies it.
 * The `[&_.aui-directive-chip]:*` half of the reference's class string is
 * therefore dropped; it styles nodes that never render here.
 */
export function EditComposer() {
  const text = useChatState((state) => state.editing?.text);
  const { setEditText, submitEdit, cancelEdit } = useChat();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow. The reference gets this free from a contenteditable; Tailwind's
  // `field-sizing-content` would too, but only in Chromium — measuring
  // scrollHeight works everywhere and this is one line.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }, [text]);

  // `autoFocus` alone leaves the caret wherever the browser feels like putting
  // it. You are almost always here to append to or amend the end of a sentence.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  // Defensive: `thread.tsx` only mounts this while `editing` is set, but a race
  // between a cancel and a re-render should render nothing rather than throw.
  if (text === undefined) return null;

  return (
    <div
      data-slot="edit-composer-wrapper"
      className="mx-auto flex w-full max-w-(--thread-max-width) flex-col px-2"
    >
      <div
        className="border-border/60 dark:border-muted-foreground/15 ml-auto flex w-full max-w-[85%] cursor-text flex-col rounded-(--composer-radius) border bg-(--composer-bg) shadow-[0_4px_16px_-8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none"
        // `cursor-text` promises that clicking the card puts you in the text.
        // Restricted to the card itself so a click on the footer buttons is not
        // followed by focus being yanked back into the textarea.
        onClick={(event) => {
          if (event.target === event.currentTarget) inputRef.current?.focus();
        }}
      >
        <textarea
          ref={inputRef}
          value={text}
          autoFocus
          rows={1}
          dir="auto"
          aria-label="Edit message"
          className="text-foreground min-h-14 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base outline-none"
          onChange={(event) => setEditText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancelEdit();
              return;
            }
            // `isComposing` guards IME input: while a candidate window is open,
            // Enter commits the candidate and must not submit the edit.
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (text.trim() !== "") submitEdit();
            }
          }}
        />
        <div className="mx-2.5 mb-2.5 flex items-center gap-1.5 self-end">
          <Button variant="ghost" size="sm" className="h-8 rounded-full px-3.5" onClick={cancelEdit}>
            Cancel
          </Button>
          {/* The reference's `ComposerPrimitive.Send` disables itself on an empty
              composer; submitting a blank edit would silently delete the turn. */}
          <Button
            size="sm"
            className="h-8 rounded-full px-3.5"
            disabled={text.trim() === ""}
            onClick={submitEdit}
          >
            Update
          </Button>
        </div>
      </div>
    </div>
  );
}
