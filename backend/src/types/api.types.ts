// Standard API envelope types

export type ApiSuccess<T> = {
  data: T;
  meta?: {
    page?: number;
    total?: number;
    has_more?: boolean;
  };
};

export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type UserRole = 'superadmin' | 'admin' | 'manager' | 'employee';

// JWT payload attached by auth middleware
export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  company_id: string | null; // null for superadmin
  ac_external_id: string | null;
  employee_code: string | null;
  ac_synced: boolean;
};

// Hono context variables
export type AppVariables = {
  user: AuthUser;
  companyId?: string;
  apiScopes?: string[];
};
