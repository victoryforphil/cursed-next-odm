import type { ReactNode } from 'react';

export function PanelEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-[8rem] items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
