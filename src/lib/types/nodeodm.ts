// NodeODM API Types based on API documentation

export interface NodeInfo {
  version: string;
  taskQueueCount: number;
  maxImages: number | null;
  maxParallelTasks?: number;
  engineVersion: string;
  engine: string;
  availableMemory?: number;
  totalMemory?: number;
  cpuCores?: number;
}

export interface AuthInfo {
  loginUrl: string | null;
  registerUrl: string | null;
  message: string;
}

export interface LoginResponse {
  token: string;
}

export interface ODMOption {
  name: string;
  type: 'int' | 'float' | 'string' | 'bool';
  value: string;
  domain: string;
  help: string;
}

export interface TaskOption {
  name: string;
  value: string | number | boolean;
}

export type TaskStatusCode = 10 | 20 | 30 | 40 | 50;

export const TaskStatusMap: Record<TaskStatusCode, string> = {
  10: 'QUEUED',
  20: 'RUNNING',
  30: 'FAILED',
  40: 'COMPLETED',
  50: 'CANCELED',
};

export interface TaskStatus {
  code: TaskStatusCode;
}

export interface TaskInfo {
  uuid: string;
  name: string;
  dateCreated: number;
  processingTime: number;
  status: TaskStatus;
  options: TaskOption[];
  imagesCount: number;
  progress: number;
  output?: string[];
}

export interface TaskListItem {
  uuid: string;
}

export interface ApiResponse {
  success: boolean;
  error?: string;
}

export interface ApiError {
  error: string;
}

export interface NewTaskResponse {
  uuid: string;
}

export interface CreateTaskParams {
  name?: string;
  options?: TaskOption[];
  webhook?: string;
  skipPostProcessing?: boolean;
  outputs?: string[];
  dateCreated?: number;
}

// File browser types
export interface FileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  lastModified?: Date;
  children?: FileNode[];
  selected?: boolean;
  expanded?: boolean;
}

export type UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'error';

export interface ImageFile extends FileNode {
  type: 'file';
  thumbnail?: string;
  exif?: ExifData;
  uploadStatus?: UploadStatus;
  uploadProgress?: number; // 0-100
}

export interface ExifData {
  latitude?: number;
  longitude?: number;
  altitude?: number;
  relativeAltitude?: number;
  timestamp?: Date;
  make?: string;
  model?: string;
  focalLength?: number;
  imageWidth?: number;
  imageHeight?: number;
  // DJI-specific fields
  gimbalYaw?: number;
  gimbalPitch?: number;
  gimbalRoll?: number;
  flightYaw?: number;
  flightPitch?: number;
  flightRoll?: number;
  // Computed
  heading?: number;
}

// Point cloud types
export interface PointCloudMetadata {
  bounds: [number, number, number, number, number, number];
  numPoints: number;
  schema: Array<{
    name: string;
    type: string;
    size: number;
  }>;
}

