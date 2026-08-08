import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * A small hover tooltip rendered on our own timing, not the browser's.
 * Native `title` attributes are unreliable here — Chrome/Brave apply a
 * long, inconsistent hover delay before showing them, and any re-render
 * while hovering (e.g. from a state update elsewhere in the tree) resets
 * that timer, so a native tooltip can end up never appearing at all even
 * though the hover state (and therefore the disabled cursor) is clearly
 * registering.
 *
 * The bubble itself is portaled to document.body (positioned via a
 * measured DOMRect, not CSS) instead of living inside the wrapper's own
 * DOM subtree — otherwise its z-index only wins within whatever
 * stacking context the wrapper happens to be nested in, so an app-level
 * fixed navbar with its own (higher) stacking context can still render
 * on top of it regardless of the z-index value used here.
 */
export function Tooltip({
  text,
  disabled,
  children,
}: {
  text: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [show, setShow] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  if (disabled) return <>{children}</>;

  return (
    <div
      ref={wrapperRef}
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => {
        setRect(wrapperRef.current?.getBoundingClientRect() ?? null);
        setShow(true);
      }}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show &&
        rect &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: rect.top - 8,
              left: rect.left + rect.width / 2,
              transform: "translate(-50%, -100%)",
              backgroundColor: "#202c33",
              color: "#e9edef",
              padding: "5px 10px",
              borderRadius: "6px",
              fontSize: "12px",
              whiteSpace: "nowrap",
              zIndex: 2147483647,
              boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
              pointerEvents: "none",
            }}
          >
            {text}
          </div>,
          document.body,
        )}
    </div>
  );
}
