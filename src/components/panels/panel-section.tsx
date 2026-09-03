import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type PanelSectionProps = {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function PanelSection({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: PanelSectionProps) {
  return (
    <section className={cn('flex min-h-0 flex-col', className)}>
      {title || actions ? (
        <header className="flex h-7 shrink-0 items-center justify-between border-b px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <span className="truncate">{title}</span>
          {actions}
        </header>
      ) : null}
      <div className={cn('min-h-0 flex-1 overflow-auto p-3', bodyClassName)}>
        {children}
      </div>
    </section>
  );
}
