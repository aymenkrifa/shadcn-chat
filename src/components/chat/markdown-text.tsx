import { CheckIcon, CopyIcon } from "lucide-react";
import { createContext, useContext, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { TooltipIconButton } from "@/components/chat/tooltip-icon-button";
import { cn } from "@/lib/utils";

/*
  Port of the reference's `markdown-text.tsx` — every class string below was
  copied off two files in the assistant-ui checkout on 2026-08-17:

    apps/docs/components/assistant-ui/markdown-text.tsx     (the one base.tsx imports)
    packages/ui/src/components/assistant-ui/markdown-text.tsx  (identical `defaultComponents`)

  The reference renders `<MarkdownTextPrimitive className="aui-md" components={…}>`,
  which is a `<div class="aui-md" data-status=…>` wrapping react-markdown. We call
  react-markdown directly and supply the same wrapper div, so the DOM and the
  class names match; three consequences worth knowing:

  · `data-status` is gone, and with it the reference's `styles/dot.css` streaming
    dot — that CSS keys off `.aui-md[data-status="running"]`, needs a stylesheet
    we do not own here, and the running indicator is `dot-matrix.tsx`'s job in
    this clone.
  · `pre`/`code` splitting is ours to do. The reference's primitive publishes a
    `PreContext` from its `pre` override and its `code` override renders
    `CodeHeader` + a syntax highlighter; we do the same with `PreContext` below,
    from the `pre` side, because react-markdown hands us the whole `<pre>`.
  · highlighting is rehype-highlight (highlight.js) instead of the reference's
    Shiki. It emits `hljs`-prefixed token classes and NO colours of its own, so
    code blocks stay monochrome until a highlight.js theme lands in `index.css`
    (not this file's to add). The reference's Shiki container applies the same
    `pre` classes we use here via `[&_pre]:…` variants, so the frame matches
    either way.

  Deliberately NOT memoised: the answer streams, so this component re-renders on
  every chunk by design. The `components` map and the plugin arrays are
  module-level constants instead, which is where the re-render cost would
  otherwise be (a fresh `components` object per render remounts every node).
*/

// Stable module-level identities — see the note above about re-renders.
const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS = [rehypeKatex, rehypeHighlight];

/**
 * True while rendering inside a code block.
 *
 * Stands in for the reference's `useIsMarkdownCodeBlock()`, which reads the
 * context assistant-ui's `PreOverride` publishes. Same purpose: `code` needs to
 * know whether it is inline (pill background, own padding) or the body of a
 * `<pre>` (no styling of its own — the `<pre>` owns the frame), and
 * react-markdown never tells a component who its parent is.
 */
const PreContext = createContext(false);

/**
 * react-markdown 10.1.0 passes the hast node to every component
 * (`passNode: true`, verified in `node_modules/react-markdown/lib/index.js`
 * 2026-08-17). It is the only place the raw source text and the fence's
 * language survive — rehype-highlight has already shredded the rendered
 * children into nested token spans — so `pre` reads both off the node. It also
 * means every override has to drop `node` before spreading onto a DOM element,
 * or React warns about an unknown prop.
 *
 * The readers below narrow from `unknown` rather than importing hast's `Element`
 * type: `@types/hast` is a transitive dependency and is not resolvable from
 * `src/`, only from inside react-markdown's own package.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Concatenated text of a hast subtree — token spans and all. */
function hastText(node: unknown): string {
  if (!isRecord(node)) return "";
  if (typeof node.value === "string") return node.value;
  const children = node.children;
  return Array.isArray(children) ? children.map(hastText).join("") : "";
}

function hastClassName(node: unknown): string {
  if (!isRecord(node)) return "";
  const properties = node.properties;
  if (!isRecord(properties)) return "";
  const className = properties.className;
  if (Array.isArray(className)) {
    return className.filter((one): one is string => typeof one === "string").join(" ");
  }
  return typeof className === "string" ? className : "";
}

function codeChild(pre: unknown): unknown {
  if (!isRecord(pre)) return undefined;
  const children = pre.children;
  if (!Array.isArray(children)) return undefined;
  return children.find((child) => isRecord(child) && child.tagName === "code");
}

/**
 * The header strip above a code block: language label on the left, copy button
 * on the right, and a bottom-borderless rounded top that the `<pre>` below
 * completes. Verbatim from the reference, including the empty label a fence with
 * no language produces — the reference passes `""` there too rather than
 * inventing a fallback, and the strip still earns its place because it carries
 * the copy button.
 */
function CodeHeader({ language, code }: { language: string; code: string }) {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const onCopy = () => {
    if (!code || isCopied) return;
    copyToClipboard(code);
  };

  return (
    <div className="aui-code-header-root border-border/50 bg-muted/50 mt-3 flex items-center justify-between rounded-t-xl border border-b-0 px-3.5 py-1.5 text-xs">
      <span className="aui-code-header-language text-muted-foreground font-medium lowercase">
        {language}
      </span>
      <TooltipIconButton tooltip="Copy" onClick={onCopy}>
        {/*
          No `motion-safe:` gate here, on purpose: neither icon uses
          `fill-mode-both`, so when the animation is suppressed the icon renders
          at its normal opacity instead of being parked at 0.
        */}
        {!isCopied && (
          <CopyIcon className="animate-in zoom-in-75 fade-in duration-150" />
        )}
        {isCopied && (
          <CheckIcon className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
        )}
      </TooltipIconButton>
    </div>
  );
}

/**
 * The reference's hook, with one deviation: it reverts after 3000 ms, this
 * reverts after 2000 ms because the integration brief specifies a 2s revert for
 * the clone's copy buttons. Change the default back to 3000 for reference parity.
 */
const useCopyToClipboard = ({
  copiedDuration = 2000,
}: {
  copiedDuration?: number;
} = {}) => {
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const copyToClipboard = (value: string) => {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    navigator.clipboard.writeText(value).then(
      () => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), copiedDuration);
      },
      () => {},
    );
  };

  return { isCopied, copyToClipboard };
};

/*
  Element overrides, in the reference's order. `className` is merged rather than
  replaced because rehype plugins add their own (`language-ts`, `hljs`,
  `math-display`, KaTeX's classes) and dropping it would kill highlighting and
  maths rendering. `node` is destructured away everywhere it is not used — see
  the note on `isRecord` above for why.
*/
const components = {
  h1: ({ className, node: _node, ...props }) => (
    <h1
      className={cn(
        "aui-md-h1 mt-5 mb-2 scroll-m-20 text-xl font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, node: _node, ...props }) => (
    <h2
      className={cn(
        "aui-md-h2 mt-5 mb-2 scroll-m-20 text-lg font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, node: _node, ...props }) => (
    <h3
      className={cn(
        "aui-md-h3 mt-4 mb-1.5 scroll-m-20 text-base font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h4: ({ className, node: _node, ...props }) => (
    <h4
      className={cn(
        "aui-md-h4 mt-3.5 mb-1 scroll-m-20 text-base font-medium first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h5: ({ className, node: _node, ...props }) => (
    <h5
      className={cn(
        "aui-md-h5 mt-3 mb-1 text-sm font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h6: ({ className, node: _node, ...props }) => (
    <h6
      className={cn(
        "aui-md-h6 mt-3 mb-1 text-sm font-medium first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  p: ({ className, node: _node, ...props }) => (
    <p
      className={cn(
        "aui-md-p my-3 leading-relaxed first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  a: ({ className, node: _node, ...props }) => (
    <a
      className={cn(
        "aui-md-a text-primary hover:text-primary/80 underline underline-offset-2",
        className,
      )}
      {...props}
    />
  ),
  blockquote: ({ className, node: _node, ...props }) => (
    <blockquote
      className={cn(
        "aui-md-blockquote border-muted-foreground/30 text-muted-foreground my-3 border-s-2 ps-4",
        className,
      )}
      {...props}
    />
  ),
  ul: ({ className, node: _node, ...props }) => (
    <ul
      className={cn(
        "aui-md-ul marker:text-muted-foreground my-3 ms-5 list-disc [&>li]:mt-1",
        className,
      )}
      {...props}
    />
  ),
  ol: ({ className, node: _node, ...props }) => (
    <ol
      className={cn(
        "aui-md-ol marker:text-muted-foreground my-3 ms-5 list-decimal [&>li]:mt-1",
        className,
      )}
      {...props}
    />
  ),
  hr: ({ className, node: _node, ...props }) => (
    <hr
      className={cn("aui-md-hr border-muted-foreground/20 my-3", className)}
      {...props}
    />
  ),
  /*
    Two documented changes to the reference's table string,
    "aui-md-table my-3 w-full border-separate border-spacing-0 overflow-y-auto":

    · a scroll wrapper is added, because a wide table otherwise widens the whole
      44rem answer column instead of scrolling inside it;
    · `my-3` moves onto that wrapper. `overflow-x-auto` makes the wrapper a new
      block formatting context, so a margin left on the table can no longer
      collapse with the neighbouring paragraph's — the table would sit in a 24px
      gutter where the reference gives it 12px.

    The reference's `overflow-y-auto` stays on the table, unused as it is there.
  */
  table: ({ className, node: _node, ...props }) => (
    <div className="aui-md-table-container my-3 overflow-x-auto">
      <table
        className={cn(
          "aui-md-table w-full border-separate border-spacing-0 overflow-y-auto",
          className,
        )}
        {...props}
      />
    </div>
  ),
  th: ({ className, node: _node, ...props }) => (
    <th
      className={cn(
        "aui-md-th bg-muted px-3 py-1.5 text-start font-medium first:rounded-ss-lg last:rounded-se-lg [[align=center]]:text-center [[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, node: _node, ...props }) => (
    <td
      className={cn(
        "aui-md-td border-muted-foreground/20 border-s border-b px-3 py-1.5 text-start last:border-e [[align=center]]:text-center [[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  tr: ({ className, node: _node, ...props }) => (
    <tr
      className={cn(
        "aui-md-tr m-0 border-b p-0 first:border-t [&:last-child>td:first-child]:rounded-es-lg [&:last-child>td:last-child]:rounded-ee-lg",
        className,
      )}
      {...props}
    />
  ),
  li: ({ className, node: _node, ...props }) => (
    <li className={cn("aui-md-li leading-relaxed", className)} {...props} />
  ),
  strong: ({ className, node: _node, ...props }) => (
    <strong
      className={cn("aui-md-strong font-semibold", className)}
      {...props}
    />
  ),
  // Footnote references (remark-gfm). Kept from the reference: the link inside a
  // `sup` is a marker, not prose, so it loses the underline `a` would give it.
  sup: ({ className, node: _node, ...props }) => (
    <sup
      className={cn("aui-md-sup [&>a]:text-xs [&>a]:no-underline", className)}
      {...props}
    />
  ),
  /*
    `pre` renders the header strip as its own sibling, which is why the reference's
    `pre` classes have no top radius and no top border: the strip supplies both,
    and the two elements read as one framed block. Returning a fragment keeps
    them siblings in the `.aui-md` flow — nesting the strip inside the `<pre>`
    would put a flex row inside monospace whitespace-preserving text.
  */
  pre: ({ className, children, node, ...props }) => {
    const code = codeChild(node);
    // Same regex as the reference's `CodeOverride`; the class it reads
    // ("language-ts") is put on the `<code>` by remark, and rehype-highlight
    // leaves it in place.
    const language = /language-([^\s]+)/.exec(hastClassName(code))?.[1] ?? "";
    // mdast-to-hast appends a trailing newline to fenced code; strip it so the
    // clipboard gets what the block shows (the reference's Shiki container
    // trims the same way before rendering).
    const rawCode = hastText(code ?? node).replace(/\n+$/, "");

    return (
      <>
        <CodeHeader language={language} code={rawCode} />
        <pre
          className={cn(
            "aui-md-pre border-border/50 bg-muted/30 overflow-x-auto rounded-t-none rounded-b-xl border border-t-0 p-3.5 text-[13px] leading-relaxed",
            className,
          )}
          {...props}
        >
          <PreContext value={true}>{children}</PreContext>
        </pre>
      </>
    );
  },
  code: function Code({ className, node: _node, ...props }) {
    const isCodeBlock = useContext(PreContext);
    return (
      <code
        className={cn(
          !isCodeBlock &&
            "aui-md-inline-code bg-muted rounded-md px-1.5 py-0.5 font-mono text-[0.85em]",
          className,
        )}
        {...props}
      />
    );
  },
} satisfies Components;

/**
 * One markdown answer.
 *
 * `em`, `thead` and `tbody` are intentionally absent: the reference overrides
 * neither, and Tailwind's preflight only resets `strong`'s weight (checked in
 * `node_modules/tailwindcss/preflight.css`, 2026-08-17) — so italics and table
 * sections already look right, and inventing classes for them would be a
 * deviation, not a fix.
 */
export function MarkdownText({ children }: { children: string }) {
  return (
    <div className="aui-md">
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={components}
      >
        {children}
      </Markdown>
    </div>
  );
}
