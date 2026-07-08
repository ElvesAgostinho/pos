export type Action = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'print' | 'duplicate' | 'approve' | 'cancel' | 'execute';

export interface AuthContext {
  hotel_id?: string;
  department_id?: string;
  pos_terminal_id?: string;
  current_time?: string; // "HH:mm" format
  current_shift?: 'Manhã' | 'Tarde' | 'Noite';
  document_value?: number;
  [key: string]: any;
}

export interface ABACCondition {
  field: string; // e.g., 'document_value', 'current_shift', 'time'
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'in' | 'not_in' | 'between';
  value: any;
}

export interface Policy {
  id: string;
  role_id: string;
  resource: string; // "module:form:tab:field" pattern. e.g., "erp:articles", "pos:discount"
  actions: Action[]; // which actions are allowed
  effect: 'allow' | 'deny';
  conditions?: ABACCondition[]; // if present, ALL conditions must match
}

export interface Role {
  id: string;
  name: string;
  description?: string;
}

export interface AuthState {
  roles: Role[];
  policies: Policy[];
}
