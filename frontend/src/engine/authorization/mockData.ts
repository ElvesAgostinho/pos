import type { AuthState } from './types';

export const mockAuthState: AuthState = {
  roles: [
    { id: 'role_admin', name: 'Administrador', description: 'Acesso total ao sistema' },
    { id: 'role_waiter', name: 'Empregado de Mesa', description: 'Acesso básico ao POS' },
    { id: 'role_manager', name: 'Chefe de Restaurante', description: 'Acesso gestão POS' }
  ],
  policies: [
    // ----------------------------------------------------
    // Administrador (Super Role)
    // ----------------------------------------------------
    {
      id: 'pol_admin_all',
      role_id: 'role_admin',
      resource: '*',
      actions: ['view', 'create', 'edit', 'delete', 'export', 'print', 'duplicate', 'approve', 'cancel', 'execute'],
      effect: 'allow'
    },
    
    // ----------------------------------------------------
    // Empregado de Mesa
    // ----------------------------------------------------
    // Pode entrar no POS
    {
      id: 'pol_waiter_pos_enter',
      role_id: 'role_waiter',
      resource: 'erp:pos',
      actions: ['execute', 'view'],
      effect: 'allow'
    },
    // Pode ver a Ficha de Artigos (mas não editar)
    {
      id: 'pol_waiter_articles_view',
      role_id: 'role_waiter',
      resource: 'erp:articles',
      actions: ['view'],
      effect: 'allow'
    },
    // NÃO pode ver os preços de custo na ficha de artigos
    {
      id: 'pol_waiter_articles_cost_deny',
      role_id: 'role_waiter',
      resource: 'erp:articles:tab_precos:campo_custo',
      actions: ['view'],
      effect: 'deny'
    },

    // ----------------------------------------------------
    // Chefe de Restaurante
    // ----------------------------------------------------
    // Pode fazer tudo o que o empregado faz + Anular e Aprovar Descontos (ABAC)
    {
      id: 'pol_manager_articles_edit',
      role_id: 'role_manager',
      resource: 'erp:articles',
      actions: ['view', 'edit'],
      effect: 'allow'
    },
    {
      id: 'pol_manager_discount_approval',
      role_id: 'role_manager',
      resource: 'erp:pos:discount',
      actions: ['approve'],
      effect: 'allow',
      conditions: [
        {
          field: 'document_value',
          operator: 'less_than',
          value: 20 // Regra: Chefe de restaurante só pode aprovar até 20%
        }
      ]
    }
  ]
};
