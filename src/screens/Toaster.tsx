// Renders the notification queue (NotificationsContext): at most
// MAX_VISIBLE toasts, oldest first, the rest waiting. Info toasts close by
// themselves after INFO_TIMEOUT_MS unless their details are open; action
// toasts stay until acted on or closed.
import { useEffect, useRef, useState } from "react";
import { useNotifications, type Notice } from "../context/NotificationsContext";
import { uk } from "../i18n/uk";

const MAX_VISIBLE = 3;
const INFO_TIMEOUT_MS = 8000;

function Toast({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false);
  // The latest onDismiss without restarting the timer on every re-render.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (notice.kind !== "info" || expanded) return;
    const timer = window.setTimeout(() => onDismissRef.current(), INFO_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [notice.key, notice.kind, expanded]);

  return (
    <div className={`toast toast-${notice.kind}`} role={notice.kind === "action" ? "alert" : "status"}>
      <div className="toast-body">
        <p className="toast-title">{notice.title}</p>
        {expanded && notice.details?.map((line) => (
          <p key={line} className="toast-detail">
            {line}
          </p>
        ))}
        {(notice.actions?.length || notice.details?.length) && (
          <div className="toast-actions">
            {notice.actions?.map((action) => (
              <button key={action.label} type="button" onClick={action.onClick}>
                {action.label}
              </button>
            ))}
            {notice.details && notice.details.length > 0 && (
              <button type="button" className="button-secondary" onClick={() => setExpanded((e) => !e)}>
                {expanded ? uk.notifications.less : uk.notifications.more}
              </button>
            )}
          </div>
        )}
      </div>
      {notice.dismissible !== false && notice.kind !== "progress" && (
        <button type="button" className="toast-close" onClick={onDismiss} aria-label={uk.notifications.close} title={uk.notifications.close}>
          ✕
        </button>
      )}
    </div>
  );
}

export default function Toaster() {
  const { notices, dismiss } = useNotifications();
  if (notices.length === 0) return null;

  return (
    <div className="toaster" aria-live="polite">
      {notices.slice(0, MAX_VISIBLE).map((notice) => (
        <Toast key={notice.key} notice={notice} onDismiss={() => dismiss(notice.key)} />
      ))}
    </div>
  );
}
