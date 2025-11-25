import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NodeInfo, TaskInfo, ODMOption, FileNode, ImageFile } from '@/lib/types/nodeodm';

interface ConnectionState {
  baseUrl: string;
  token?: string;
  isConnected: boolean;
  nodeInfo?: NodeInfo;
}

interface TasksState {
  tasks: TaskInfo[];
  selectedTaskId?: string;
  isLoading: boolean;
}

interface FileBrowserState {
  rootNodes: FileNode[];
  selectedFiles: ImageFile[];
  expandedFolders: Set<string>;
}

interface AppState {
  // Connection
  connection: ConnectionState;
  setBaseUrl: (url: string) => void;
  setToken: (token: string) => void;
  setConnected: (connected: boolean, nodeInfo?: NodeInfo) => void;

  // Tasks
  tasks: TasksState;
  setTasks: (tasks: TaskInfo[]) => void;
  updateTask: (task: TaskInfo) => void;
  selectTask: (taskId?: string) => void;
  setTasksLoading: (loading: boolean) => void;

  // File browser
  fileBrowser: FileBrowserState;
  setRootNodes: (nodes: FileNode[]) => void;
  addSelectedFile: (file: ImageFile) => void;
  removeSelectedFile: (fileId: string) => void;
  clearSelectedFiles: () => void;
  toggleFolder: (folderId: string) => void;
  setSelectedFiles: (files: ImageFile[]) => void;

  // ODM Options
  odmOptions: ODMOption[];
  setOdmOptions: (options: ODMOption[]) => void;

  // UI State
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  activeView: 'tasks' | 'files' | 'map' | 'pointcloud';
  setActiveView: (view: 'tasks' | 'files' | 'map' | 'pointcloud') => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Connection
      connection: {
        baseUrl: 'http://localhost:3001',
        isConnected: false,
      },
      setBaseUrl: (url) =>
        set((state) => ({
          connection: { ...state.connection, baseUrl: url },
        })),
      setToken: (token) =>
        set((state) => ({
          connection: { ...state.connection, token },
        })),
      setConnected: (connected, nodeInfo) =>
        set((state) => ({
          connection: { ...state.connection, isConnected: connected, nodeInfo },
        })),

      // Tasks
      tasks: {
        tasks: [],
        isLoading: false,
      },
      setTasks: (tasks) =>
        set((state) => ({
          tasks: { ...state.tasks, tasks },
        })),
      updateTask: (task) =>
        set((state) => ({
          tasks: {
            ...state.tasks,
            tasks: state.tasks.tasks.map((t) =>
              t.uuid === task.uuid ? task : t
            ),
          },
        })),
      selectTask: (taskId) =>
        set((state) => ({
          tasks: { ...state.tasks, selectedTaskId: taskId },
        })),
      setTasksLoading: (loading) =>
        set((state) => ({
          tasks: { ...state.tasks, isLoading: loading },
        })),

      // File browser
      fileBrowser: {
        rootNodes: [],
        selectedFiles: [],
        expandedFolders: new Set(),
      },
      setRootNodes: (nodes) =>
        set((state) => ({
          fileBrowser: { ...state.fileBrowser, rootNodes: nodes },
        })),
      addSelectedFile: (file) =>
        set((state) => ({
          fileBrowser: {
            ...state.fileBrowser,
            selectedFiles: [...state.fileBrowser.selectedFiles, file],
          },
        })),
      removeSelectedFile: (fileId) =>
        set((state) => ({
          fileBrowser: {
            ...state.fileBrowser,
            selectedFiles: state.fileBrowser.selectedFiles.filter(
              (f) => f.id !== fileId
            ),
          },
        })),
      clearSelectedFiles: () =>
        set((state) => ({
          fileBrowser: { ...state.fileBrowser, selectedFiles: [] },
        })),
      toggleFolder: (folderId) =>
        set((state) => {
          const newExpanded = new Set(state.fileBrowser.expandedFolders);
          if (newExpanded.has(folderId)) {
            newExpanded.delete(folderId);
          } else {
            newExpanded.add(folderId);
          }
          return {
            fileBrowser: { ...state.fileBrowser, expandedFolders: newExpanded },
          };
        }),
      setSelectedFiles: (files) =>
        set((state) => ({
          fileBrowser: { ...state.fileBrowser, selectedFiles: files },
        })),

      // ODM Options
      odmOptions: [],
      setOdmOptions: (options) => set({ odmOptions: options }),

      // UI State
      sidebarOpen: true,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      activeView: 'tasks',
      setActiveView: (view) => set({ activeView: view }),
    }),
    {
      name: 'cursed-odm-storage',
      partialize: (state) => ({
        connection: {
          baseUrl: state.connection.baseUrl,
          token: state.connection.token,
        },
      }),
    }
  )
);

