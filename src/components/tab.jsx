import classNames from "classnames";
import { useContext } from "react";
import { TabContext } from "utils/contexts/tab";
import { useTabBadge } from "utils/contexts/tab-badge";

function slugify(tabName) {
  return tabName.toString().replace(/\s+/g, "-").toLowerCase();
}

export function slugifyAndEncode(tabName) {
  return tabName !== undefined ? encodeURIComponent(slugify(tabName)) : "";
}

export default function Tab({ tab }) {
  const { activeTab, setActiveTab } = useContext(TabContext);
  const { badges } = useTabBadge() || {};

  // Debug log
  console.log("[Tab Badge Debug]", { tab, badges, badgeForTab: badges?.[tab] });

  const matchesTab = decodeURIComponent(activeTab) === slugify(tab);
  const badgeCount = badges?.[tab] || 0;

  return (
    <li
      key={tab}
      role="presentation"
      className={classNames("text-theme-700 dark:text-theme-200 relative h-10 w-full rounded-md flex")}
    >
      <button
        id={`${tab}-tab`}
        type="button"
        role="tab"
        aria-controls={`#${tab}`}
        aria-selected={matchesTab ? "true" : "false"}
        className={classNames(
          "w-full rounded-md m-1 relative",
          matchesTab ? "bg-theme-300/20 dark:bg-white/10" : "hover:bg-theme-100/20 dark:hover:bg-white/5",
        )}
        onClick={() => {
          setActiveTab(slugifyAndEncode(tab));
          window.location.hash = `#${slugifyAndEncode(tab)}`;
        }}
      >
        {tab}
        {badgeCount > 0 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 
                       bg-amber-500 text-white text-[10px] font-bold 
                       rounded-full flex items-center justify-center
                       shadow-sm animate-pulse"
          >
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </button>
    </li>
  );
}
