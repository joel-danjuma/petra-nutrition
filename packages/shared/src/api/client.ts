import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ApiResponse, ApiError, ApiErrorCode, HttpStatusCode } from '../types/api';

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    metadata?: { startTime: number };
  }
}

export interface ApiClientConfig {
  baseURL: string;
  timeout?: number;
  defaultHeaders?: Record<string, string>;
  onTokenExpired?: () => void;
  onUnauthorized?: () => void;
}

export class ApiClient {
  private instance: AxiosInstance;
  private config: ApiClientConfig;
  // In-memory only, and deliberately so: persistence belongs to the auth store,
  // which mirrors its token here via `initializeStores`. Reaching for platform
  // globals like `localStorage` from shared code is what crashed the native app.
  private authToken: string | null = null;

  constructor(config: ApiClientConfig) {
    this.config = config;
    this.instance = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...config.defaultHeaders,
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor
    this.instance.interceptors.request.use(
      (config) => {
        // Add auth token if available
        const token = this.getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Add request timestamp
        config.metadata = { startTime: Date.now() };
        
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.instance.interceptors.response.use(
      (response: AxiosResponse) => {
        // Calculate request duration
        const duration = Date.now() - (response.config.metadata?.startTime || 0);
        
        // Log successful requests in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`API Request: ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status} (${duration}ms)`);
        }

        return response;
      },
      (error) => {
        if (error.response) {
          const { status, data } = error.response;
          
          // Handle specific error cases
          switch (status) {
            case HttpStatusCode.UNAUTHORIZED:
              if (data?.error?.code === ApiErrorCode.TOKEN_EXPIRED) {
                this.config.onTokenExpired?.();
              } else {
                this.config.onUnauthorized?.();
              }
              break;
            case HttpStatusCode.TOO_MANY_REQUESTS:
              // Handle rate limiting
              console.warn('Rate limit exceeded, consider implementing retry logic');
              break;
          }
        }

        return Promise.reject(this.transformError(error));
      }
    );
  }

  private getAuthToken(): string | null {
    return this.authToken;
  }

  private transformError(error: any): ApiError {
    if (error.response?.data?.error) {
      return error.response.data.error;
    }

    // Transform axios errors to our error format
    const apiError: ApiError = {
      code: ApiErrorCode.NETWORK_ERROR,
      message: error.message || 'Network error occurred',
      timestamp: new Date().toISOString(),
    };

    if (error.code === 'ECONNABORTED') {
      apiError.code = ApiErrorCode.TIMEOUT_ERROR;
      apiError.message = 'Request timeout';
    }

    return apiError;
  }

  // Generic request methods
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.instance.get(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.instance.post(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.instance.put(url, data, config);
    return response.data;
  }

  async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.instance.patch(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.instance.delete(url, config);
    return response.data;
  }

  // File upload method
  async uploadFile<T>(
    url: string,
    file: File | Blob,
    fieldName: string = 'file',
    additionalData?: Record<string, any>
  ): Promise<ApiResponse<T>> {
    const formData = new FormData();
    formData.append(fieldName, file);

    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, typeof value === 'string' ? value : JSON.stringify(value));
      });
    }

    const response = await this.instance.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  }

  // Streaming request for AI chat
  async streamRequest(
    url: string,
    data: any,
    onChunk: (chunk: string) => void,
    onComplete: () => void,
    onError: (error: ApiError) => void
  ): Promise<void> {
    try {
      const response = await this.instance.post(url, data, {
        responseType: 'stream',
        headers: {
          'Accept': 'text/event-stream',
        },
      });

      // Handle streaming response
      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        lines.forEach(line => {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              onComplete();
            } else {
              try {
                const parsed = JSON.parse(data);
                onChunk(parsed.content || '');
              } catch (e) {
                // Handle malformed JSON
                onChunk(data);
              }
            }
          }
        });
      });

      response.data.on('error', (error: any) => {
        onError(this.transformError(error));
      });

    } catch (error) {
      onError(this.transformError(error));
    }
  }

  // Update auth token
  setAuthToken(token: string | null) {
    this.authToken = token;
  }

  // Update base URL (useful for switching environments)
  updateBaseURL(baseURL: string) {
    this.instance.defaults.baseURL = baseURL;
    this.config.baseURL = baseURL;
  }

  // Health check
  async healthCheck() {
    return this.get('/health');
  }
}
