import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { StatusBar, Style } from "@capacitor/status-bar";
import { uk } from "./i18n/uk";
import { AuthProvider } from "./context/AuthContext";
import { initMealReminders } from "./lib/reminderScheduler";
import TodayScreen from "./screens/TodayScreen";
import FoodsScreen from "./screens/FoodsScreen";
import BloodSugarScreen from "./screens/BloodSugarScreen";
import SettingsScreen from "./screens/SettingsScreen";

type TabId = "today" | "foods" | "bloodSugar" | "settings";

// Settings lives behind the gear icon in the top-right corner, not in this
// bottom bar — it's a device/account-config screen, not a peer of the three
// daily-use screens below, and the 4th label used to get clipped off-screen
// at larger OS text sizes (see docs/build-log.md's UX-pass entry).
const TABS: { id: TabId; label: string }[] = [
  { id: "today", label: uk.tabs.today },
  { id: "foods", label: uk.tabs.foods },
  { id: "bloodSugar", label: uk.tabs.bloodSugar },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("today");
  const [autoOpenAddForm, setAutoOpenAddForm] = useState(false);

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
        setActiveTab("today");
        setAutoOpenAddForm(true);
      }
    });
    return () => {
      void listenerPromise.then((listener) => listener.remove());
    };
  }, []);

  return (
    <AuthProvider>
      <div className="app">
        <div className="app-header">
          <button
            type="button"
            className={activeTab === "settings" ? "settings-gear active" : "settings-gear"}
            aria-label={uk.tabs.settings}
            aria-current={activeTab === "settings" ? "page" : undefined}
            onClick={() => setActiveTab("settings")}
          >
            <svg viewBox="0 -960 960 960" width="24" height="24" fill="currentColor" aria-hidden="true">
              <path d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm112-260q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Z" />
            </svg>
          </button>
        </div>

        <main className="app-content">
          {activeTab === "today" && (
            <TodayScreen autoOpenAddForm={autoOpenAddForm} onAutoOpenAddFormConsumed={() => setAutoOpenAddForm(false)} />
          )}
          {activeTab === "foods" && <FoodsScreen />}
          {activeTab === "bloodSugar" && <BloodSugarScreen />}
          {activeTab === "settings" && <SettingsScreen />}
        </main>

        <nav className="tab-bar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={tab.id === activeTab ? "tab-button active" : "tab-button"}
              aria-current={tab.id === activeTab ? "page" : undefined}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </AuthProvider>
  );
}
