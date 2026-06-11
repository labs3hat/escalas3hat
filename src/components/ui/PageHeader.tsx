import { ReactNode } from "react";
import { Store } from "@/types";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  stores?: Store[];
  selectedStoreId?: string;
  onStoreChange?: (store: Store) => void;
}

export function PageHeader({ title, subtitle, actions, stores, selectedStoreId, onStoreChange }: PageHeaderProps) {
  return (
    <div className="px-6 pt-3 pb-2 flex items-start justify-between gap-4 flex-shrink-0">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {stores && stores.length > 0 && (
          <select
            value={selectedStoreId}
            onChange={(e) => {
              const store = stores.find((s) => s.id === e.target.value);
              if (store && onStoreChange) onStoreChange(store);
            }}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 font-medium focus:outline-none focus:border-brand-400 min-w-[200px]"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.shopping}
              </option>
            ))}
          </select>
        )}
        {actions}
      </div>
    </div>
  );
}
