import React, { createContext, useContext, useMemo } from 'react';
import type { Action, AuthContext, Policy } from './types';
import { authorize } from './evaluator';

// ---------------------------------------------------------
// Global Auth State Context (In a real app, this comes from Redux/Zustand + Identity Engine)
// ---------------------------------------------------------

interface AuthorizationState {
  userRoleIds: string[];
  policies: Policy[];
  baseContext: AuthContext;
}

const AuthorizationContext = createContext<AuthorizationState>({
  userRoleIds: [],
  policies: [],
  baseContext: {}
});

export const AuthorizationProvider: React.FC<{
  state: AuthorizationState;
  children: React.ReactNode;
}> = ({ state, children }) => {
  return (
    <AuthorizationContext.Provider value={state}>
      {children}
    </AuthorizationContext.Provider>
  );
};

// ---------------------------------------------------------
// useAuthorization Hook
// ---------------------------------------------------------

export function useAuthorization() {
  const state = useContext(AuthorizationContext);

  const can = (action: Action, resource: string, localContext?: Partial<AuthContext>): boolean => {
    // Merge global context with specific local overrides (e.g. passing a specific document_value)
    const mergedContext = { ...state.baseContext, ...localContext };
    return authorize(state.userRoleIds, state.policies, action, resource, mergedContext);
  };

  return { can, state };
}

// ---------------------------------------------------------
// <Can> Component wrapper for UI
// ---------------------------------------------------------

interface CanProps {
  action: Action;
  resource: string;
  context?: Partial<AuthContext>;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const Can: React.FC<CanProps> = ({ action, resource, context, children, fallback = null }) => {
  const { can } = useAuthorization();
  
  if (can(action, resource, context)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
};
