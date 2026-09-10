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

const TABS: { id: TabId; label: string }[] = [
  { id: "today", label: uk.tabs.today },
  { id: "foods", label: uk.tabs.foods },
  { id: "bloodSugar", label: uk.tabs.bloodSugar },
  { id: "settings", label: uk.tabs.settings },
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
