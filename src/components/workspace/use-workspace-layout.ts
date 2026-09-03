import type { DockviewApi, SerializedDockview } from 'dockview';

export interface WorkspaceLayoutStorage {
  load(): SerializedDockview | null;
  save(serialized: SerializedDockview): void;
  clear(): void;
}

// Per-dock storage factory: job status and new job keep independent layouts.
export function createWorkspaceLayoutStorage(storageKey: string): WorkspaceLayoutStorage {
  return {
    load(): SerializedDockview | null {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return null;
        return JSON.parse(raw) as SerializedDockview;
      } catch {
        return null;
      }
    },
    save(serialized: SerializedDockview) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(serialized));
      } catch {
        // ignore quota errors
      }
    },
    clear() {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    },
  };
}

// Job status: live logs column on the left, asset viewers tabbed on the right.
export function buildJobStatusLayout(api: DockviewApi) {
  if (api.getPanel('logs')) return;

  const logsPanel = api.addPanel({
    id: 'logs',
    component: 'logs',
    title: 'Logs',
    initialWidth: 480,
  });

  const pointCloudPanel = api.addPanel({
    id: 'pointcloud',
    component: 'pointcloud',
    title: 'Point Cloud',
    position: { referencePanel: logsPanel, direction: 'right' },
  });

  api.addPanel({
    id: 'orthomosaic',
    component: 'orthomosaic',
    title: 'Orthomosaic',
    position: { referencePanel: pointCloudPanel, direction: 'within' },
  });
}

// New job: images left, locations right, configuration full-width below.
export function buildNewJobLayout(api: DockviewApi) {
  if (api.getPanel('files')) return;

  const filesPanel = api.addPanel({
    id: 'files',
    component: 'files',
    title: 'Images',
    initialWidth: 480,
  });

  api.addPanel({
    id: 'map',
    component: 'map',
    title: 'Locations',
    position: { referencePanel: filesPanel, direction: 'right' },
  });

  api.addPanel({
    id: 'config',
    component: 'config',
    title: 'Configuration',
    position: { direction: 'below' },
  });
}
