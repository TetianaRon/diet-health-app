// A form's error message (release 2.3.2: «forms reject silently»): shown next
// to the buttons, announced to screen readers, and scrolled into view when it
// appears — on a long form it was below or above the screen, so a rejected
// save looked like nothing happened.
import { useEffect, useRef } from "react";

export default function FormError({ message }: { message: string | null | undefined }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (message) ref.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [message]);
  if (!message) return null;
  return (
    <p ref={ref} className="food-form-error" role="alert">
      {message}
    </p>
  );
}
