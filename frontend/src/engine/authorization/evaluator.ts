import type { Action, AuthContext, Policy, ABACCondition } from './types';

/**
 * Validates a single ABAC condition against the current context
 */
function evaluateCondition(condition: ABACCondition, context: AuthContext): boolean {
  const contextValue = context[condition.field];
  
  if (contextValue === undefined) {
    // If the field doesn't exist in the context, but we require it, it fails.
    return false; 
  }

  switch (condition.operator) {
    case 'equals':
      return contextValue === condition.value;
    case 'not_equals':
      return contextValue !== condition.value;
    case 'greater_than':
      return contextValue > condition.value;
    case 'less_than':
      return contextValue < condition.value;
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(contextValue);
    case 'not_in':
      return Array.isArray(condition.value) && !condition.value.includes(contextValue);
    case 'between':
      return Array.isArray(condition.value) && condition.value.length === 2 
             && contextValue >= condition.value[0] && contextValue <= condition.value[1];
    default:
      return false;
  }
}

/**
 * Checks if a specific resource matches the policy's resource definition.
 * Supports wildcard matching, e.g., "erp:articles:*"
 */
function matchResource(policyResource: string, targetResource: string): boolean {
  if (policyResource === targetResource) return true;
  if (policyResource === '*') return true;
  
  if (policyResource.endsWith('*')) {
    const prefix = policyResource.slice(0, -1);
    return targetResource.startsWith(prefix);
  }

  return false;
}

/**
 * The core Authorization Evaluator.
 * Given a set of user roles, the system policies, the requested action/resource, and the context,
 * it returns true if allowed, false if denied.
 */
export function authorize(
  userRoleIds: string[], 
  policies: Policy[], 
  action: Action, 
  resource: string, 
  context: AuthContext
): boolean {
  
  // 1. Filter policies that apply to the user's roles
  const applicablePolicies = policies.filter(p => userRoleIds.includes(p.role_id));

  // Default deny
  let isAllowed = false;

  for (const policy of applicablePolicies) {
    // 2. Check if the policy applies to the requested resource
    if (!matchResource(policy.resource, resource)) continue;

    // 3. Check if the policy applies to the requested action
    if (!policy.actions.includes(action) && !policy.actions.includes('execute') && !policy.actions.includes('view') /* temporary fallback for testing */ ) continue;
    // Note: in a real robust system, if action is missing, it skips.

    if (!policy.actions.includes(action)) continue;

    // 4. Evaluate ABAC conditions if present
    let conditionsMet = true;
    if (policy.conditions && policy.conditions.length > 0) {
      for (const cond of policy.conditions) {
        if (!evaluateCondition(cond, context)) {
          conditionsMet = false;
          break;
        }
      }
    }

    // 5. Apply effect
    if (conditionsMet) {
      if (policy.effect === 'deny') {
        // Explicit deny always wins (overrides any allows)
        return false;
      }
      if (policy.effect === 'allow') {
        isAllowed = true;
      }
    }
  }

  return isAllowed;
}
