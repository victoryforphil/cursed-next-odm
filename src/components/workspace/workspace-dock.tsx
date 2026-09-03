'use client';

import {
  DockviewReact,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from 'dockview';
import type { FunctionComponent } from 'react';

import { useWorkspace } from './workspace-context';

export type DockviewComponents = Record<string, FunctionComponent<IDockviewPanelProps>>;

export function WorkspaceDock({ components }: { components: DockviewComponents }) {
  const { registerDockApi, dockLayoutVersion, storage, defaultLayout } = useWorkspace();

  const onReady = (event: DockviewReadyEvent) => {
    registerDockApi(event.api);

    const saved = storage.load();
    if (saved) {
      try {
        event.api.fromJSON(saved);
      } catch {
        defaultLayout(event.api);
      }
    } else {
      defaultLayout(event.api);
    }

    event.api.onDidLayoutChange(() => {
      storage.save(event.api.toJSON());
    });
  };

  return (
    <div className="dockview-theme-dark dockview-theme-odm h-full min-h-0 bg-background">
      <DockviewReact
        key={dockLayoutVersion}
        components={components}
        onReady={onReady}
        className="dockview-theme-dark dockview-theme-odm h-full"
      />
    </div>
  );
}
