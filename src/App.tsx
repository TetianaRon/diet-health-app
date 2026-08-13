import { useState } from "react";
import { uk } from "./i18n/uk";

type TabId = "today" | "foods" | "bloodSugar" | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "today", label: uk.tabs.today },
  { id: "foods", label: uk.tabs.foods },
  { id: "bloodSugar", label: uk.tabs.bloodSugar },
  { id: "settings", label: uk.tabs.settings },
];

function ScreenPlaceholder({ title, placeholder }: { title: string; placeholder: string }) {
  return (
    <section className="screen">
      <h1>{title}</h1>
      <p>{placeholder}</p>
    </section>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("today");

  return (
    <div className="app">
      <main className="app-content">
        {activeTab === "today" && <ScreenPlaceholder title={uk.today.title} placeholder={uk.today.placeholder} />}
        {activeTab === "foods" && <ScreenPlaceholder title={uk.foods.title} placeholder={uk.foods.placeholder} />}
        {activeTab === "bloodSugar" && (
          <ScreenPlaceholder title={uk.bloodSugar.title} placeholder={uk.bloodSugar.placeholder} />
        )}
        {activeTab === "settings" && (
          <ScreenPlaceholder title={uk.settings.title} placeholder={uk.settings.placeholder} />
        )}
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
  );
}
