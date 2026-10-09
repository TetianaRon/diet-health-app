// One standard for app-level messages (developer, 2026-10-04): toasts in a
// single queue that never overlap — bottom-right on a computer, above the
// tab bar on a phone, at most 3 visible, the rest waiting their turn.
//   info   — e.g. «Таблицю оновлено…»: closes by itself after a few seconds
//            (or with ✕ earlier).
//   progress — e.g. «Оновлюємо таблицю…»: work under way; no ✕, no timer. The
//            same key is then shown again with the result (it replaces it).
//   action — e.g. «Вхід завершився — Увійти знову»: stays until acted on or
//            closed; if closed while the problem remains, it comes back at
//            the next sign-in / app start (the owner decides — see
//            AppNotifications).
// Messages tied to one spot (form errors, the search's translation notice)
// stay where they are. The reminder popups (2.1.3) are in ReminderPopups.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export interface NoticeAction {
  label: string;
  onClick: () => void;
}

export interface Notice {
  /** One notice per key — showing a key again replaces it in place. */
  key: string;
  kind: "info" | "progress" | "action";
  title: string;
  /** Extra lines, shown behind «Детальніше». */
  details?: string[];
  actions?: NoticeAction[];
  /**
   * false = no ✕: only acting on it resolves it. For a problem that blocks
   * the app with no other way out (an expired sign-in), so closing it can't
   * strand her. Default true.
   */
  dismissible?: boolean;
  /** Called when the person closes it with ✕ (or an info notice times out). */
  onDismiss?: () => void;
}

interface NotificationsContextValue {
  notices: Notice[];
  show: (notice: Notice) => void;
  /** Removes a notice without calling its onDismiss (its reason went away). */
  remove: (key: string) => void;
  /** The person closed it (✕ / timeout): removes it and calls onDismiss. */
  dismiss: (key: string) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  // Mirror for dismiss(), so onDismiss runs once, outside a state updater.
  const noticesRef = useRef<Notice[]>([]);
  noticesRef.current = notices;

  const show = useCallback((notice: Notice) => {
    setNotices((prev) => {
      const i = prev.findIndex((n) => n.key === notice.key);
      if (i === -1) return [...prev, notice];
      const next = [...prev];
      next[i] = notice;
      return next;
    });
  }, []);

  const remove = useCallback((key: string) => setNotices((prev) => prev.filter((n) => n.key !== key)), []);

  const dismiss = useCallback((key: string) => {
    const notice = noticesRef.current.find((n) => n.key === key);
    setNotices((prev) => prev.filter((n) => n.key !== key));
    notice?.onDismiss?.();
  }, []);

  return <NotificationsContext.Provider value={{ notices, show, remove, dismiss }}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error("useNotifications must be used within a NotificationsProvider");
  return context;
}
