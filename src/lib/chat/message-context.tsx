import { createContext, useContext, type ReactNode } from "react";

import type { Message } from "./types";

/**
 * The message a subtree belongs to.
 *
 * The reference gets this from `MessagePrimitive.Root`, which puts the current
 * message on a context so every descendant — the bubble, the action bar, the
 * branch picker, the timing readout — can read it without the thread threading
 * props down four levels. Same idea, ~20 lines.
 *
 * `isLast` is separate from the message itself because it is a fact about
 * POSITION, not content: the reference's action bar uses `autohide="not-last"`,
 * i.e. every message except the final one hides its actions until hovered.
 */
export interface MessageContextValue {
  message: Message;
  isLast: boolean;
}

const MessageContext = createContext<MessageContextValue | null>(null);

export function MessageProvider({
  message,
  isLast,
  children,
}: {
  message: Message;
  isLast: boolean;
  children: ReactNode;
}) {
  // A fresh object per render is fine here: it changes exactly when the message
  // or its position does, which is when the subtree needs to re-render anyway.
  return <MessageContext value={{ message, isLast }}>{children}</MessageContext>;
}

export function useMessage(): MessageContextValue {
  const value = useContext(MessageContext);
  if (!value) throw new Error("useMessage must be used inside <MessageProvider>");
  return value;
}
