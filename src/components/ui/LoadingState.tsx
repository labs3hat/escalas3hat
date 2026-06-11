import { ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  message?: string;
  fullPage?: boolean;
}

export function LoadingState({ message = "Carregando...", fullPage = false }: LoadingStateProps) {
  const content = (
    <div className="flex flex-col items-center justify-center gap-3 p-8 text-gray-500">
      <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );

  if (fullPage) {
    return <div className="flex-1 flex items-center justify-center h-full">{content}</div>;
  }

  return content;
}
