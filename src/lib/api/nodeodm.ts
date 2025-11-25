import type {
  NodeInfo,
  AuthInfo,
  LoginResponse,
  ODMOption,
  TaskInfo,
  TaskListItem,
  ApiResponse,
  NewTaskResponse,
  CreateTaskParams,
} from '@/lib/types/nodeodm';

const DEFAULT_BASE_URL = 'http://localhost:3001';

export class NodeODMClient {
  private baseUrl: string;
  private token?: string;

  constructor(baseUrl: string = DEFAULT_BASE_URL, token?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }

  private getUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(path, this.baseUrl);
    if (this.token) {
      url.searchParams.set('token', this.token);
    }
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }
    return url.toString();
  }

  private async request<T>(
    path: string,
    options?: RequestInit,
    params?: Record<string, string>
  ): Promise<T> {
    const url = this.getUrl(path, params);
    
    // Don't set Content-Type for FormData - browser will set it with boundary
    const headers: HeadersInit = {};
    if (options?.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (Array.isArray(options.headers)) {
        options.headers.forEach(([key, value]) => {
          headers[key] = value;
        });
      } else {
        Object.assign(headers, options.headers);
      }
    }
    
    const response = await fetch(url, {
      ...options,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  setToken(token: string) {
    this.token = token;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '');
  }

  // Auth endpoints
  async getAuthInfo(): Promise<AuthInfo> {
    return this.request<AuthInfo>('/auth/info');
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);

    return this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: formData,
    });
  }

  async register(username: string, password: string): Promise<ApiResponse> {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);

    return this.request<ApiResponse>('/auth/register', {
      method: 'POST',
      body: formData,
    });
  }

  // Server endpoints
  async getInfo(): Promise<NodeInfo> {
    return this.request<NodeInfo>('/info');
  }

  async getOptions(): Promise<ODMOption[]> {
    return this.request<ODMOption[]>('/options');
  }

  // Task endpoints
  async getTaskList(): Promise<TaskListItem[]> {
    return this.request<TaskListItem[]>('/task/list');
  }

  async getTaskInfo(uuid: string, withOutput?: number): Promise<TaskInfo> {
    const params: Record<string, string> = {};
    if (withOutput !== undefined) {
      params.with_output = withOutput.toString();
    }
    return this.request<TaskInfo>(`/task/${uuid}/info`, undefined, params);
  }

  async getTaskOutput(uuid: string, line: number = 0): Promise<string[]> {
    return this.request<string[]>(`/task/${uuid}/output`, undefined, { line: line.toString() });
  }

  async createTask(
    files: File[], 
    params?: CreateTaskParams,
    onProgress?: (progress: number) => void
  ): Promise<NewTaskResponse> {
    const formData = new FormData();
    
    files.forEach((file) => {
      formData.append('images', file);
    });

    if (params?.name) {
      formData.append('name', params.name);
    }

    if (params?.options) {
      formData.append('options', JSON.stringify(params.options));
    }

    if (params?.webhook) {
      formData.append('webhook', params.webhook);
    }

    if (params?.skipPostProcessing !== undefined) {
      formData.append('skipPostProcessing', params.skipPostProcessing.toString());
    }

    if (params?.outputs) {
      formData.append('outputs', JSON.stringify(params.outputs));
    }

    if (onProgress) {
      return this.requestWithProgress<NewTaskResponse>('/task/new', formData, onProgress);
    }

    return this.request<NewTaskResponse>('/task/new', {
      method: 'POST',
      body: formData,
    });
  }

  private async requestWithProgress<T>(
    path: string,
    formData: FormData,
    onProgress: (progress: number) => void
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = this.getUrl(path);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = (e.loaded / e.total) * 100;
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (error) {
            reject(new Error('Invalid JSON response'));
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.error || `HTTP ${xhr.status}`));
          } catch {
            reject(new Error(`HTTP ${xhr.status}`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error'));
      });

      const finalUrl = this.token ? (() => {
        const urlObj = new URL(url);
        urlObj.searchParams.set('token', this.token);
        return urlObj.toString();
      })() : url;
      
      xhr.open('POST', finalUrl);
      xhr.send(formData);
    });
  }

  // For large uploads: init -> upload -> commit flow
  async initTask(params?: CreateTaskParams, setUuid?: string): Promise<NewTaskResponse> {
    const formData = new FormData();

    if (params?.name) {
      formData.append('name', params.name);
    }

    if (params?.options) {
      formData.append('options', JSON.stringify(params.options));
    }

    if (params?.webhook) {
      formData.append('webhook', params.webhook);
    }

    if (params?.skipPostProcessing !== undefined) {
      formData.append('skipPostProcessing', params.skipPostProcessing.toString());
    }

    const headers: HeadersInit = {};
    if (setUuid) {
      headers['set-uuid'] = setUuid;
    }

    return this.request<NewTaskResponse>('/task/new/init', {
      method: 'POST',
      body: formData,
      headers,
    });
  }

  async uploadToTask(
    uuid: string, 
    files: File[],
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse> {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('images', file);
    });

    if (onProgress) {
      return this.requestWithProgress<ApiResponse>(`/task/new/upload/${uuid}`, formData, onProgress);
    }

    return this.request<ApiResponse>(`/task/new/upload/${uuid}`, {
      method: 'POST',
      body: formData,
    });
  }

  async commitTask(uuid: string): Promise<NewTaskResponse> {
    return this.request<NewTaskResponse>(`/task/new/commit/${uuid}`, {
      method: 'POST',
    });
  }

  async cancelTask(uuid: string): Promise<ApiResponse> {
    return this.request<ApiResponse>('/task/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uuid }),
    });
  }

  async removeTask(uuid: string): Promise<ApiResponse> {
    return this.request<ApiResponse>('/task/remove', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uuid }),
    });
  }

  async restartTask(uuid: string, options?: { name: string; value: string | number | boolean }[]): Promise<ApiResponse> {
    const body: { uuid: string; options?: string } = { uuid };
    if (options) {
      body.options = JSON.stringify(options);
    }

    return this.request<ApiResponse>('/task/restart', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  getDownloadUrl(uuid: string, asset: string = 'all.zip'): string {
    return this.getUrl(`/task/${uuid}/download/${asset}`);
  }
}

// Singleton instance
let clientInstance: NodeODMClient | null = null;

export function getNodeODMClient(): NodeODMClient {
  if (!clientInstance) {
    clientInstance = new NodeODMClient();
  }
  return clientInstance;
}

export function createNodeODMClient(baseUrl?: string, token?: string): NodeODMClient {
  return new NodeODMClient(baseUrl, token);
}

