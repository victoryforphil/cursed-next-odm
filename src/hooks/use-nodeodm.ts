'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { NodeODMClient, getNodeODMClient } from '@/lib/api/nodeodm';
import type {
  NodeInfo,
  TaskInfo,
  TaskListItem,
  ODMOption,
  TaskOption,
  ImageFile,
} from '@/lib/types/nodeodm';

interface UseNodeODMOptions {
  baseUrl?: string;
  token?: string;
  autoConnect?: boolean;
  pollInterval?: number;
}

interface UseNodeODMReturn {
  // Connection
  isConnected: boolean;
  nodeInfo: NodeInfo | null;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  setBaseUrl: (url: string) => void;
  setToken: (token: string) => void;
  baseUrl: string;
  token?: string;

  // Tasks
  tasks: TaskInfo[];
  isLoadingTasks: boolean;
  refreshTasks: () => Promise<void>;
  createTask: (
    files: File[],
    name: string,
    options?: TaskOption[],
    onFileProgress?: (fileIndex: number, progress: number) => void
  ) => Promise<string | null>;
  cancelTask: (uuid: string) => Promise<boolean>;
  removeTask: (uuid: string) => Promise<boolean>;
  restartTask: (uuid: string) => Promise<boolean>;
  getTaskOutput: (uuid: string, line?: number) => Promise<string[]>;
  getDownloadUrl: (uuid: string, asset?: string) => string;

  // Options
  odmOptions: ODMOption[];
  loadOptions: () => Promise<void>;

  // Upload progress
  uploadProgress: number;
  isUploading: boolean;
}

export function useNodeODM(options: UseNodeODMOptions = {}): UseNodeODMReturn {
  const {
    baseUrl: initialBaseUrl = 'http://localhost:3001',
    token: initialToken,
    autoConnect = true,
    pollInterval = 5000,
  } = options;

  const [baseUrl, setBaseUrlState] = useState(initialBaseUrl);
  const [token, setTokenState] = useState(initialToken);
  const [isConnected, setIsConnected] = useState(false);
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [odmOptions, setOdmOptions] = useState<ODMOption[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const clientRef = useRef<NodeODMClient>(getNodeODMClient());
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update client when URL/token changes
  useEffect(() => {
    clientRef.current.setBaseUrl(baseUrl);
    if (token) {
      clientRef.current.setToken(token);
    }
  }, [baseUrl, token]);

  // Connect to server
  const connect = useCallback(async (): Promise<boolean> => {
    try {
      const info = await clientRef.current.getInfo();
      setNodeInfo(info);
      setIsConnected(true);
      return true;
    } catch (error) {
      console.error('Failed to connect:', error);
      setIsConnected(false);
      setNodeInfo(null);
      return false;
    }
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    setIsConnected(false);
    setNodeInfo(null);
    setTasks([]);
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Set base URL
  const setBaseUrl = useCallback((url: string) => {
    setBaseUrlState(url);
    setIsConnected(false);
    setNodeInfo(null);
  }, []);

  // Set token
  const setToken = useCallback((newToken: string) => {
    setTokenState(newToken);
  }, []);

  // Load ODM options
  const loadOptions = useCallback(async () => {
    try {
      const opts = await clientRef.current.getOptions();
      setOdmOptions(opts);
    } catch (error) {
      console.error('Failed to load options:', error);
    }
  }, []);

  // Refresh tasks
  const refreshTasks = useCallback(async () => {
    if (!isConnected) return;

    setIsLoadingTasks(true);
    try {
      const taskList = await clientRef.current.getTaskList();
      
      // Fetch full info for each task
      const taskInfos = await Promise.all(
        taskList.map((t) => clientRef.current.getTaskInfo(t.uuid))
      );
      
      setTasks(taskInfos);
    } catch (error) {
      console.error('Failed to refresh tasks:', error);
    }
    setIsLoadingTasks(false);
  }, [isConnected]);

  // Create task
  const createTask = useCallback(
    async (
      files: File[],
      name: string,
      taskOptions?: TaskOption[],
      onFileProgress?: (fileIndex: number, progress: number) => void
    ): Promise<string | null> => {
      if (!isConnected) return null;

      setIsUploading(true);
      setUploadProgress(0);

      try {
        // For large uploads, use init -> upload -> commit flow
        if (files.length > 10 || files.reduce((sum, f) => sum + f.size, 0) > 50 * 1024 * 1024) {
          // Initialize task
          const initResult = await clientRef.current.initTask({
            name,
            options: taskOptions,
          });

          const uuid = initResult.uuid;
          const chunkSize = 5; // Upload 5 files at a time
          let uploaded = 0;
          const totalFiles = files.length;

          // Upload in chunks with progress tracking
          for (let i = 0; i < files.length; i += chunkSize) {
            const chunk = files.slice(i, i + chunkSize);
            const chunkStartIndex = i;
            
            await clientRef.current.uploadToTask(uuid, chunk, (chunkProgress) => {
              // Calculate progress for each file in this chunk
              chunk.forEach((_, chunkIdx) => {
                const fileIndex = chunkStartIndex + chunkIdx;
                const fileProgress = chunkProgress / chunk.length;
                onFileProgress?.(fileIndex, fileProgress);
              });
              
              // Update overall progress
              const overallProgress = ((uploaded + (chunkProgress / 100) * chunk.length) / totalFiles) * 100;
              setUploadProgress(overallProgress);
            });
            
            uploaded += chunk.length;
            // Mark chunk files as complete
            chunk.forEach((_, chunkIdx) => {
              const fileIndex = chunkStartIndex + chunkIdx;
              onFileProgress?.(fileIndex, 100);
            });
            setUploadProgress((uploaded / totalFiles) * 100);
          }

          // Commit task
          await clientRef.current.commitTask(uuid);
          
          setIsUploading(false);
          setUploadProgress(100);
          
          // Refresh tasks
          await refreshTasks();
          
          return uuid;
        } else {
          // Simple upload for small tasks with progress
          const result = await clientRef.current.createTask(
            files,
            {
              name,
              options: taskOptions,
            },
            (progress) => {
              setUploadProgress(progress);
              // Distribute progress evenly across files
              files.forEach((_, index) => {
                onFileProgress?.(index, progress);
              });
            }
          );

          setIsUploading(false);
          setUploadProgress(100);
          
          // Mark all files as complete
          files.forEach((_, index) => {
            onFileProgress?.(index, 100);
          });
          
          // Refresh tasks
          await refreshTasks();
          
          return result.uuid;
        }
      } catch (error) {
        console.error('Failed to create task:', error);
        setIsUploading(false);
        setUploadProgress(0);
        return null;
      }
    },
    [isConnected, refreshTasks]
  );

  // Cancel task
  const cancelTask = useCallback(
    async (uuid: string): Promise<boolean> => {
      try {
        await clientRef.current.cancelTask(uuid);
        await refreshTasks();
        return true;
      } catch (error) {
        console.error('Failed to cancel task:', error);
        return false;
      }
    },
    [refreshTasks]
  );

  // Remove task
  const removeTask = useCallback(
    async (uuid: string): Promise<boolean> => {
      try {
        await clientRef.current.removeTask(uuid);
        await refreshTasks();
        return true;
      } catch (error) {
        console.error('Failed to remove task:', error);
        return false;
      }
    },
    [refreshTasks]
  );

  // Restart task
  const restartTask = useCallback(
    async (uuid: string): Promise<boolean> => {
      try {
        await clientRef.current.restartTask(uuid);
        await refreshTasks();
        return true;
      } catch (error) {
        console.error('Failed to restart task:', error);
        return false;
      }
    },
    [refreshTasks]
  );

  // Get task output
  const getTaskOutput = useCallback(
    async (uuid: string, line: number = 0): Promise<string[]> => {
      try {
        return await clientRef.current.getTaskOutput(uuid, line);
      } catch (error) {
        console.error('Failed to get task output:', error);
        return [];
      }
    },
    []
  );

  // Get download URL
  const getDownloadUrl = useCallback(
    (uuid: string, asset: string = 'all.zip'): string => {
      return clientRef.current.getDownloadUrl(uuid, asset);
    },
    []
  );

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect().then((connected) => {
        if (connected) {
          loadOptions();
          refreshTasks();
        }
      });
    }
  }, [autoConnect, connect, loadOptions, refreshTasks]);

  // Poll for task updates
  useEffect(() => {
    if (!isConnected) return;

    // Check if any tasks are running
    const hasRunningTasks = tasks.some(
      (t) => t.status.code === 10 || t.status.code === 20
    );

    if (hasRunningTasks) {
      pollIntervalRef.current = setInterval(refreshTasks, pollInterval);
    } else if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isConnected, tasks, pollInterval, refreshTasks]);

  return {
    // Connection
    isConnected,
    nodeInfo,
    connect,
    disconnect,
    setBaseUrl,
    setToken,
    baseUrl,
    token,

    // Tasks
    tasks,
    isLoadingTasks,
    refreshTasks,
    createTask,
    cancelTask,
    removeTask,
    restartTask,
    getTaskOutput,
    getDownloadUrl,

    // Options
    odmOptions,
    loadOptions,

    // Upload
    uploadProgress,
    isUploading,
  };
}

