export interface ApiFieldError {
  code: string;
  details?: Record<string, unknown>;
}

export interface ApiErrorBody {
  error: {
    code: string;
    requestId: string;
    fields?: Record<string, ApiFieldError[]>;
    details?: Record<string, unknown>;
  };
}

export const API_ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
