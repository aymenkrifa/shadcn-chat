import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { QuoteIcon, XIcon } from "lucide-react";

import { useChat, useChatState } from "@/lib/chat/provider";

/**
 * "Select text in an answer → carry it into your next question."
 *
 * Ported from the reference's `packages/ui/src/components/assistant-ui/quote.tsx`
 * plus the primitive it sits on (`primitives/selectionToolbar/SelectionToolbarRoot`),
 * read 2026-08-17. All class strings below are copied verbatim from that file;
 * the primitive's behaviour (which events recompute the selection, the -8px /
 * translate(-50%,-100%) placement, the mousedown guard) is reimplemented here in
 * ~40 lines because the toolbar is the primitive — there is nothing left of it
 * once the selection plumbing is gone.
 *
 * One structural difference from the reference: it keys the selection to
 * `[data-message-id]` and lets a per-message `data-aui-quote-selectable` opt-out
 * narrow it further. We have no such opt-out, so the anchor is the assistant
 * message root's `data-role="assistant"` — quoting your own question back at
 * yourself is not a thing the design offers.
 */

interface SelectionInfo {
  text: string;
  /** Optional: only set if the assistant root carries a `data-message-id`. */
  sourceMessageId?: string;
  /** Viewport-relative, so the toolbar is positioned `fixed`. */
  rect: DOMRect;
}

/** Nearest enclosing assistant message element, or null if the node is outside one. */
function closestAssistantMessage(node: Node | null): HTMLElement | null {
  const element = node instanceof HTMLElement ? node : (node?.parentElement ?? null);
  return element?.closest<HTMLElement>('[data-role="assistant"]') ?? null;
}

export function SelectionToolbar() {
  const { setQuote } = useChat();
  const [info, setInfo] = useState<SelectionInfo | null>(null);

  useEffect(() => {
    // The rAF handle and the `cancelled` flag exist so an unmount cannot leave a
    // frame in flight that resurrects state on a dead component.
    let frame = 0;

    const measureSelection = () => {
      cancelAnimationFrame(frame);
      // A frame of delay, exactly as the reference does it: on pointerup the
      // selection is not always final yet, and reading the range in the same
      // task can measure the previous one.
      frame = requestAnimationFrame(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
          setInfo(null);
          return;
        }

        const text = selection.toString().trim();
        if (!text) {
          setInfo(null);
          return;
        }

        // Both ends must sit in the SAME assistant message. A drag that runs
        // from an answer into the next question has no single source, so there
        // is nothing coherent to quote.
        const anchor = closestAssistantMessage(selection.anchorNode);
        const focus = closestAssistantMessage(selection.focusNode);
        if (!anchor || anchor !== focus) {
          setInfo(null);
          return;
        }

        const rect = selection.getRangeAt(0).getBoundingClientRect();
        setInfo({
          text,
          sourceMessageId: anchor.dataset.messageId,
          rect,
        });
      });
    };

    // `selectionchange` fires continuously during a drag. Recomputing on it
    // would make the toolbar chase the pointer, so — as in the reference — it is
    // only used to notice the selection went away (a click elsewhere).
    const clearIfCollapsed = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) setInfo(null);
    };

    // A fixed-position toolbar measured once would detach from its text on
    // scroll; the reference dismisses rather than tracks, and so do we.
    const clearOnScroll = () => setInfo(null);

    // `pointerup` rather than the reference's `mouseup`: it covers touch and pen
    // selection with one listener, and fires for mouse too.
    document.addEventListener("pointerup", measureSelection);
    document.addEventListener("keyup", measureSelection);
    document.addEventListener("selectionchange", clearIfCollapsed);
    // Capture phase: scrolling happens in the thread viewport, not on document,
    // and scroll does not bubble.
    document.addEventListener("scroll", clearOnScroll, true);

    // Not a nicety. These are on `document`, which outlives this component, so a
    // missed removal keeps a closure over dead React state alive for the rest of
    // the session and every remount adds another copy — four leaked listeners
    // per thread switch.
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerup", measureSelection);
      document.removeEventListener("keyup", measureSelection);
      document.removeEventListener("selectionchange", clearIfCollapsed);
      document.removeEventListener("scroll", clearOnScroll, true);
    };
  }, []);

  const quoteSelection = useCallback(() => {
    if (!info) return;
    setQuote({ text: info.text, sourceMessageId: info.sourceMessageId });
    // Dropping the selection also unmounts this toolbar via `clearIfCollapsed`.
    window.getSelection()?.removeAllRanges();
  }, [info, setQuote]);

  if (!info) return null;

  // Portalled to `document.body` like the reference. `position: fixed` alone is
  // not enough: any ancestor with a transform/filter/`contain` becomes the
  // containing block for fixed descendants, and the thread shell has animated
  // (i.e. transformed) ancestors — the toolbar would land in the wrong place or
  // be clipped.
  return createPortal(
    <div
      data-slot="selection-toolbar"
      className="bg-popover flex items-center gap-1 rounded-lg border px-1 py-1 shadow-md"
      style={{
        position: "fixed",
        top: `${info.rect.top - 8}px`,
        left: `${info.rect.left + info.rect.width / 2}px`,
        transform: "translate(-50%, -100%)",
        zIndex: 50,
      }}
      // Without this the browser collapses the selection on mousedown and the
      // click lands with nothing left to quote.
      onMouseDown={(event) => event.preventDefault()}
    >
      <button
        type="button"
        data-slot="selection-toolbar-quote"
        className="text-popover-foreground hover:bg-accent flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors"
        onClick={quoteSelection}
      >
        <QuoteIcon className="size-3.5" />
        Quote
      </button>
    </div>,
    document.body,
  );
}

/**
 * The quotation as it appears inside a sent user bubble.
 *
 * `line-clamp-2` is the load-bearing class: a reader can select four paragraphs,
 * and without the clamp the quote dwarfs the question asked about it.
 */
export function QuoteBlock({ text }: { text: string }) {
  return (
    <div data-slot="quote-block" className="mb-2 flex items-start gap-1.5">
      <QuoteIcon
        data-slot="quote-block-icon"
        className="text-muted-foreground/60 mt-0.5 size-3 shrink-0"
      />
      {/* dir="auto" for the same reason as the bubble text: this is lifted out of
          an answer, and nothing tells us its script. */}
      <p
        data-slot="quote-block-text"
        dir="auto"
        className="text-muted-foreground/80 line-clamp-2 min-w-0 text-sm italic"
      >
        {text}
      </p>
    </div>
  );
}

/**
 * The pending quote, shown inside the composer shell until it is sent or dropped.
 *
 * Selects `quote?.text` rather than the quote object: a primitive can never
 * trip `useChatState`'s `Object.is` snapshot check, and the text is all this
 * renders.
 */
export function ComposerQuotePreview() {
  const text = useChatState((state) => state.composer.quote?.text);
  const { setQuote } = useChat();

  if (text === undefined) return null;

  return (
    <div
      data-slot="composer-quote"
      className="bg-muted/60 mx-3 mt-2 flex items-start gap-2 rounded-lg px-3 py-2"
    >
      <QuoteIcon
        data-slot="composer-quote-icon"
        className="text-muted-foreground/70 mt-0.5 size-3.5 shrink-0"
      />
      <p
        data-slot="composer-quote-text"
        dir="auto"
        className="text-muted-foreground line-clamp-2 min-w-0 flex-1 text-sm"
      >
        {text}
      </p>
      <button
        type="button"
        aria-label="Dismiss quote"
        data-slot="composer-quote-dismiss"
        className="shrink-0 rounded-sm p-0.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
        onClick={() => setQuote(null)}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}
