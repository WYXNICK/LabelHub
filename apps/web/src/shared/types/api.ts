export interface PaginationVO {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PageVO<T> {
  data: T[];
  pagination: PaginationVO;
}

export interface ApiErrorVO {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

export interface HealthVO {
  status: string;
  service: string;
  version: string;
  environment: string;
  serverTime: string;
}
