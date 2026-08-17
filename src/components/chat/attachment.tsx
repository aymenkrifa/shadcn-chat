import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  AlertCircleIcon,
  FileTextIcon,
  Loader2Icon,
  PlusIcon,
  XIcon,
} from "lucide-react";

import { TooltipIconButton } from "@/components/chat/tooltip-icon-button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useChat, useChatState } from "@/lib/chat/provider";
import { useMessage } from "@/lib/chat/message-context";
import type { Attachment } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

/**
 * Attachment tiles, ported from the reference's `attachment.tsx`
 * (assistant-ui `packages/ui/src/components/assistant-ui/attachment.tsx`, read
 * 2026-08-17). Class strings are verbatim; three primitives are translated:
 *
 *  · Radix `Avatar` (not installed here) → a plain `<img>` with a centred
 *    `FileText` fallback. Avatar's only job in the reference is that fallback.
 *  · `Dialog.Trigger render={child}` → `asChild`.
 *  · The reference builds its object URL in a `useFileSrc` hook. Our store
 *    already creates one in `addAttachments` and revokes it in
 *    `removeAttachment`, so creating a second here would leak on every render.
 */

/** The reference's `typeLabel`, derived from our `contentType` instead of its own union. */
function typeLabelOf(attachment: Attachment): string {
  if (attachment.contentType.startsWith("image/")) return "Image";
  if (
    attachment.contentType === "application/pdf" ||
    attachment.contentType.startsWith("text/") ||
    attachment.contentType.includes("word") ||
    attachment.contentType.includes("document")
  ) {
    return "Document";
  }
  return "File";
}

function AttachmentPreviewImage({ src }: { src: string }) {
  const [isLoaded, setIsLoaded] = useState(false);
  return (
    <img
      src={src}
      alt="Attachment preview"
      className={cn(
        "block h-auto max-h-[80vh] w-auto max-w-full rounded-sm object-contain transition-opacity duration-300 motion-reduce:transition-none",
        isLoaded ? "opacity-100" : "opacity-0",
      )}
      onLoad={() => setIsLoaded(true)}
    />
  );
}

function AttachmentThumb({ attachment }: { attachment: Attachment }) {
  if (attachment.previewUrl === undefined) {
    return (
      <span className="flex h-full w-full items-center justify-center">
        <FileTextIcon className="text-muted-foreground/80 size-6 stroke-[1.5]" />
      </span>
    );
  }
  return (
    <img
      src={attachment.previewUrl}
      alt="Attachment preview"
      className="h-full w-full rounded-none object-cover"
    />
  );
}

function AttachmentTile({
  attachment,
  isComposer,
}: {
  attachment: Attachment;
  isComposer: boolean;
}) {
  const actions = useChat();
  const isUploading = attachment.status === "uploading";
  const isError = attachment.status === "error";
  const isImage = attachment.previewUrl !== undefined;

  const tile = (
    <div
      // Verbatim from the reference's attachment tile (2026-08-17). Note the
      // radius: it is derived from the composer's own vars so a tile's corners
      // stay concentric with the shell's, whatever the theme sets them to.
      // `cursor-default` is appended for tiles with nothing to open — the copied
      // string promises `cursor-pointer`, and a pointer cursor over a dead
      // element is a lie the reader only discovers by clicking.
      className={cn(
        "bg-muted hover:after:bg-foreground/10 focus-visible:ring-ring/50 relative size-14 cursor-pointer overflow-hidden rounded-[calc(var(--composer-radius,1.5rem)-var(--composer-padding,8px))] transition-transform outline-none after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-1 after:ring-black/10 after:transition-colors after:ring-inset focus-visible:ring-3 active:scale-[0.96] motion-reduce:transition-none dark:after:ring-white/10",
        isError && "after:ring-destructive/60 dark:after:ring-destructive/60",
        !isImage && "cursor-default",
      )}
      role={isImage ? "button" : undefined}
      tabIndex={isImage ? 0 : undefined}
      aria-label={
        isImage
          ? `${typeLabelOf(attachment)} attachment${
              isError ? ", upload failed" : isUploading ? ", uploading" : ""
            }`
          : undefined
      }
    >
      <AttachmentThumb attachment={attachment} />
      {isUploading && (
        <div
          aria-hidden="true"
          className="bg-background/60 animate-in fade-in-0 absolute inset-0 flex items-center justify-center backdrop-blur-[2px] motion-reduce:animate-none"
        >
          <Loader2Icon className="text-muted-foreground size-4 animate-spin" />
        </div>
      )}
      {isError && (
        <div
          aria-hidden="true"
          className="bg-background/70 animate-in fade-in-0 absolute inset-0 flex items-center justify-center backdrop-blur-[2px] motion-reduce:animate-none"
        >
          <AlertCircleIcon className="text-destructive size-4" />
        </div>
      )}
    </div>
  );

  return (
    <Tooltip>
      <div
        className={cn(
          "relative",
          isComposer && "animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none",
          // The reference's message-side image rule: a lone image attachment on a
          // sent message renders at 6rem instead of the 3.5rem chip size.
          isImage && !isComposer && "only:*:first:size-24",
        )}
      >
        {isImage ? (
          <Dialog>
            <DialogTrigger asChild>
              <TooltipTrigger asChild>{tile}</TooltipTrigger>
            </DialogTrigger>
            <DialogContent className="[&>button]:bg-foreground/60 [&>button]:hover:bg-foreground/80 [&_svg]:text-background p-2 sm:max-w-3xl [&>button]:rounded-full [&>button]:p-1 [&>button]:opacity-100 [&>button]:ring-0!">
              <DialogTitle className="sr-only">Image Attachment Preview</DialogTitle>
              <div className="bg-background relative mx-auto flex max-h-[80dvh] w-full items-center justify-center overflow-hidden rounded-sm">
                {attachment.previewUrl !== undefined && (
                  <AttachmentPreviewImage src={attachment.previewUrl} />
                )}
              </div>
            </DialogContent>
          </Dialog>
        ) : (
          <TooltipTrigger asChild>{tile}</TooltipTrigger>
        )}
        {isComposer && (
          <TooltipIconButton
            tooltip="Remove file"
            side="top"
            type="button"
            // Verbatim from the reference's AttachmentRemove (2026-08-17). The
            // `!` suffixes beat the Button variant's own background, and the
            // `after:-inset-1.5` grows the 20px hit target to ~44px without
            // changing the visual size.
            className="absolute end-1 top-1 size-5 rounded-full bg-black/50! text-white backdrop-blur-sm after:absolute after:-inset-1.5 hover:bg-black/70! hover:text-white! active:scale-[0.96] motion-reduce:transition-none"
            onClick={() => actions.removeAttachment(attachment.id)}
          >
            <XIcon className="size-3 stroke-[2.5]" />
          </TooltipIconButton>
        )}
      </div>
      <TooltipContent side="top">
        {attachment.name}
        {isError && <p>Upload failed</p>}
      </TooltipContent>
    </Tooltip>
  );
}

/** The read-only row on a sent message. `empty:hidden` so it collapses to nothing. */
export function UserMessageAttachments() {
  const { message } = useMessage();
  return (
    <div className="col-span-full col-start-1 row-start-1 flex w-full flex-row justify-end gap-2 empty:hidden">
      {message.attachments.map((attachment) => (
        <AttachmentTile key={attachment.id} attachment={attachment} isComposer={false} />
      ))}
    </div>
  );
}

/** The pending row inside the composer shell. */
export function ComposerAttachments() {
  const attachments = useChatState((state) => state.composer.attachments);
  return (
    <div className="flex w-full flex-row items-center gap-2 overflow-x-auto empty:hidden">
      {attachments.map((attachment) => (
        <AttachmentTile key={attachment.id} attachment={attachment} isComposer />
      ))}
    </div>
  );
}

export function ComposerAddAttachment() {
  const supported = useChatState((state) => state.thread.capabilities.attachments);
  const actions = useChat();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Reset first: picking the same file twice in a row fires no `change` event
    // unless the input's value is cleared, and "my second upload did nothing" is
    // an unfixable-looking bug.
    event.target.value = "";
    if (files.length > 0) actions.addAttachments(files);
  };

  if (!supported) return null;

  return (
    <>
      <input ref={inputRef} type="file" multiple className="hidden" onChange={handleChange} />
      <TooltipIconButton
        tooltip="Add attachment"
        side="bottom"
        type="button"
        variant="ghost"
        size="icon"
        // Verbatim from the reference's `ComposerAddAttachment` (read off
        // `packages/ui/src/components/assistant-ui/attachment.tsx`, 2026-08-17).
        // This deliberately does NOT match the dictation button beside it: the
        // add-attachment control carries a hover FILL as well as a colour change,
        // which is what makes it read as the primary affordance of the two.
        className="text-muted-foreground hover:text-foreground hover:bg-muted-foreground/15 dark:border-muted-foreground/15 dark:hover:bg-muted-foreground/30 size-7 rounded-full active:scale-[0.96] motion-reduce:transition-none"
        aria-label="Add attachment"
        onClick={() => inputRef.current?.click()}
      >
        {/* A PLUS, not a paperclip. The reference uses `PlusIcon` here; a
            paperclip was the single most obvious glyph-level difference on the
            screen, because it sits in the composer row the eye lands on. */}
        <PlusIcon className="size-4" />
      </TooltipIconButton>
    </>
  );
}
