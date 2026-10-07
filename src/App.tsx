import DuplicatesDialog from "./screens/DuplicatesDialog";
import OtherTabNotice from "./screens/OtherTabNotice";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { handleBack } from "./lib/backStack";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { StatusBar, Style } from "@capacitor/status-bar";
import { uk } from "./i18n/uk";
import AppNotifications from "./screens/AppNotifications";
import Toaster from "./screens/Toaster";
import { NotificationsProvider } from "./context/NotificationsContext";
import { AuthProvider } from "./context/AuthContext";
import { SheetHealthProvider, useSheetHealth } from "./context/SheetHealthContext";
import SheetHealthDialog from "./screens/SheetHealthDialog";
import ConnectSheetDialog from "./screens/ConnectSheetDialog";
import CopyUpdateOffer from "./screens/CopyUpdateOffer";
import { initMealReminders } from "./lib/reminderScheduler";
import TodayScreen from "./screens/TodayScreen";
import FoodsScreen from "./screens/FoodsScreen";
import HistoryScreen from "./screens/HistoryScreen";
import SettingsScreen from "./screens/SettingsScreen";

type TabId = "today" | "history" | "foods" | "settings";

// Settings lives behind the gear icon in the top-right corner, not in this
// bottom bar — it's a device/account-config screen, not a peer of the three
// daily-use screens below, and the 4th label used to get clipped off-screen
// at larger OS text sizes (see docs/build-log.md's UX-pass entry).
/** Pages remembered for back. */
const MAX_HISTORY = 30;

const TABS: { id: TabId; label: string }[] = [
  { id: "today", label: uk.tabs.today },
  { id: "history", label: uk.tabs.history },
  { id: "foods", label: uk.tabs.foods },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("today");
  // The pages opened before this one, for Android's back (developer, 2026-10-06):
  // back returns to the previous page; with none, the app is minimised.
  const tabHistory = useRef<TabId[]>([]);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const goTo = (tab: TabId) => {
    if (tab === activeTabRef.current) return;
    tabHistory.current = [...tabHistory.current, activeTabRef.current].slice(-MAX_HISTORY);
    setActiveTab(tab);
  };
  const [autoOpenAddForm, setAutoOpenAddForm] = useState(false);
  // The meal editor is a dedicated screen: while it's open the tab bar and
  // settings gear are hidden, so a stray tap can't navigate away mid-draft.
  const [editorOpen, setEditorOpen] = useState(false);

  // Android's back (backStack.ts): an open dialog or form answers first; otherwise
  // the previous page opens again, and with none the app is minimised (not closed).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listenerPromise = CapacitorApp.addListener("backButton", () => {
      if (handleBack()) return;
      const previous = tabHistory.current.pop();
      if (previous) setActiveTab(previous);
      else void CapacitorApp.minimizeApp();
    });
    return () => {
      void listenerPromise.then((listener) => listener.remove());
    };
  }, []);

  useEffect(() => {
    // The app's background is white — Style.Light gives dark status bar
    // icons/text (Capacitor's naming is the reverse of what it sounds like:
    // it names the *content* color, not the background). Without this, the
    // status bar defaults to light/white icons that vanish on our white
    // background. No-op on web (no status bar there).
    if (Capacitor.isNativePlatform()) {
      void StatusBar.setStyle({ style: Style.Light });
    }

    void initMealReminders();

    const listenerPromise = LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
      if (action.notification.extra?.action === "addMeal") {
        goTo("today");
        setAutoOpenAddForm(true);
      }
    });
    return () => {
      void listenerPromise.then((listener) => listener.remove());
    };
  }, []);

  return (
    <AuthProvider>
      <SheetHealthProvider>
      <NotificationsProvider>
      <AppNotifications />
      <div className="app">
        {!editorOpen && (
        <div className="app-header">
          <button
            type="button"
            className={activeTab === "settings" ? "settings-gear active" : "settings-gear"}
            aria-label={uk.tabs.settings}
            aria-current={activeTab === "settings" ? "page" : undefined}
            onClick={() => goTo("settings")}
          >
            <svg viewBox="0 -960 960 960" width="24" height="24" fill="currentColor" aria-hidden="true">
              <path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm112-260q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Z" />
            </svg>
            {/* visible only in the desktop sidebar (see .settings-label in index.css) */}
            <span className="settings-label" aria-hidden="true">{uk.tabs.settings}</span>
          </button>
        </div>
        )}


        {/* Keyed on the repair count: a repaired spreadsheet remounts the screens so they re-read it. */}
        <ScreensAfterRepair>
        <main className={editorOpen ? "app-content editor-open" : "app-content"}>
          {activeTab === "today" && (
            <TodayScreen
              autoOpenAddForm={autoOpenAddForm}
              onAutoOpenAddFormConsumed={() => setAutoOpenAddForm(false)}
              onEditorOpenChange={setEditorOpen}
            />
          )}
          {activeTab === "foods" && <FoodsScreen />}
          {activeTab === "history" && <HistoryScreen />}
          {activeTab === "settings" && <SettingsScreen />}
        </main>
        </ScreensAfterRepair>

        <SheetHealthDialog onOpenSettings={() => goTo("settings")} />
        <ConnectSheetDialog />
        <CopyUpdateOffer />
        <OtherTabNotice />
        <DuplicatesDialog />
        <Toaster />

        {!editorOpen && (
          <nav className="tab-bar">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={tab.id === activeTab ? "tab-button active" : "tab-button"}
                aria-current={tab.id === activeTab ? "page" : undefined}
                onClick={() => goTo(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}
      </div>
      </NotificationsProvider>
      </SheetHealthProvider>
    </AuthProvider>
  );
}

function ScreensAfterRepair({ children }: { children: ReactNode }) {
  const { version } = useSheetHealth();
  return <Fragment key={version}>{children}</Fragment>;
}
