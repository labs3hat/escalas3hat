import { ReactNode } from "react";

interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: number;
}

interface TabBarProps {
  items: readonly TabItem[];
  activeId: string;
  onChange: (id: any) => void;
}

export function TabBar({ items, activeId, onChange }: TabBarProps) {
  return (
    <div className="px-6 flex items-center gap-2 flex-shrink-0">
      <div className="inline-flex bg-gray-100 rounded-lg p-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors flex items-center gap-1.5 ${
              activeId === item.id
                ? "bg-white text-gray-900 font-medium shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {item.icon}
            {item.label}
            {item.badge && item.badge > 0 ? (
              <span className="inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold rounded-full bg-amber-500 text-white">
                {item.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
