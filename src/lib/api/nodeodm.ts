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
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options?.headers,
      },
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

  async createTask(files: File[], params?: CreateTaskParams): Promise<NewTaskResponse> {
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

    return this.request<NewTaskResponse>('/task/new', {
      method: 'POST',
      body: formData,
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

  async uploadToTask(uuid: string, files: File[]): Promise<ApiResponse> {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('images', file);
    });

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
    const formData = new FormData();
    formData.append('uuid', uuid);

    return this.request<ApiResponse>('/task/cancel', {
      method: 'POST',
      body: formData,
    });
  }

  async removeTask(uuid: string): Promise<ApiResponse> {
    const formData = new FormData();
    formData.append('uuid', uuid);

    return this.request<ApiResponse>('/task/remove', {
      method: 'POST',
      body: formData,
    });
  }

  async restartTask(uuid: string, options?: { name: string; value: string | number | boolean }[]): Promise<ApiResponse> {
    const formData = new FormData();
    formData.append('uuid', uuid);

    if (options) {
      formData.append('options', JSON.stringify(options));
    }

    return this.request<ApiResponse>('/task/restart', {
      method: 'POST',
      body: formData,
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

