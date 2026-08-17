/**
 * The one line an empty thread shows.
 *
 * Ported from the reference's `ThreadWelcome`
 * (assistant-ui/apps/docs/components/examples/base.tsx, read 2026-08-17). The
 * wrapper and typography classes are verbatim; the animation utilities carry one
 * deliberate change, documented below.
 */
export function ThreadWelcome() {
  return (
    <div className="mx-auto mb-6 flex w-full max-w-(--thread-max-width) flex-col items-center px-4 text-center">
      {/*
        DELIBERATE DEVIATION from the reference, the only one in this file.

        The reference writes `fade-in slide-in-from-bottom-1 animate-in
        fill-mode-both` unprefixed. `fill-mode-both` applies the animation's
        FROM state before it starts — and `fade-in` starts at opacity 0. Under
        `prefers-reduced-motion: reduce` the browser is free to not run the
        animation at all, at which point the element is parked at opacity 0
        forever: a reduced-motion reader opens the app to a blank screen whose
        only content is this heading.

        So every one of the four animation utilities is gated behind
        `motion-safe:` — all four, not just `fill-mode-both`, because a
        half-prefixed set would leave `animate-in` running a named keyframe
        whose starting opacity is no longer being reset. `text-2xl font-semibold
        duration-200` stay unprefixed: `duration-200` is inert without an
        animation, and the type scale is not motion.

        We do this ONLY where `fill-mode-both` is present. Elsewhere in the port
        the reference's animation classes are copied verbatim, because an
        animation that merely does not play still leaves its element visible.
      */}
      <h1 className="motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:animate-in motion-safe:fill-mode-both text-2xl font-semibold duration-200">
        How can I help you today?
      </h1>
    </div>
  );
}
