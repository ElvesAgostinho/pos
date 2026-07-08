import { apiClient } from './client';

export interface Outlet {
  id?: number;
  code: string;
  name: string;
  description?: string;
  is_active: boolean;
}

export interface ItemPOSUI {
  id?: number;
  button_name?: string;
  button_color?: string;
  icon_svg?: string;
  pos_category?: string;
  pos_subcategory?: string;
  z_index?: number;
  visible_on_kiosk?: boolean;
}

export interface ItemPOSPricing {
  id?: number;
  price?: number;
  tax?: string;
  allow_discount?: boolean;
}

export interface ItemPOSKitchen {
  id?: number;
  main_printer?: string;
  backup_printer?: string;
  kds_station?: string;
  prep_station?: string;
  production_order?: number;
  prep_time_minutes?: number;
  max_prep_time_minutes?: number;
  min_prep_time_minutes?: number;
  kds_priority?: 'LOW' | 'NORMAL' | 'HIGH';
  grouping?: boolean;
  ticket_separation?: boolean;
  simultaneous_production?: boolean;
}

export interface ItemPOSAllergens {
  id?: number;
  calories_kcal?: number;
  has_gluten?: boolean;
  has_lactose?: boolean;
  has_nuts?: boolean;
  has_seafood?: boolean;
  is_vegan?: boolean;
  is_vegetarian?: boolean;
}

export interface ItemPOSMinibar {
  id?: number;
  is_available?: boolean;
  requires_refill?: boolean;
  max_qty_per_room?: number;
  auto_consume?: boolean;
  housekeeping_inventory?: boolean;
  room_auto_charge?: boolean;
}

export interface ItemPOSDelivery {
  id?: number;
  is_available_online?: boolean;
  delivery_packaging_fee?: number;
  packaging_type?: string;
  preparation_buffer_minutes?: number;
  delivery_area?: string;
  couriers_allowed?: boolean;
  external_apps_allowed?: boolean;
}

export interface ItemPOSEvents {
  id?: number;
  is_available_events?: boolean;
  min_pax?: number;
  max_pax?: number;
  requires_advance_notice_days?: number;
  weddings?: boolean;
  conferences?: boolean;
  coffee_break?: boolean;
  banquets?: boolean;
  catering?: boolean;
}

export interface ItemPOSAI {
  id?: number;
  recommendation_score?: number;
  pairing_suggestion?: string;
  is_upsell_candidate?: boolean;
  learning_enabled?: boolean;
  auto_suggest_pairing?: boolean;
}

export interface ItemPOSFiscal {
  id?: number;
  document_type?: string;
  billing_series?: string;
  vat_by_hotel?: boolean;
  exemptions?: string;
  international_rules?: boolean;
}

export interface ItemPOSPrinting {
  id?: number;
  main_printer?: string;
  backup_printer?: string;
  bar_printer?: string;
  kitchen_printer?: string;
  desserts_printer?: string;
  coffee_printer?: string;
  number_of_copies?: number;
  print_language?: string;
  print_format?: string;
  auto_print?: boolean;
  conditional_print?: boolean;
}

export interface ItemPOSBuffets {
  id?: number;
  included_in_buffet?: boolean;
  price_by_weight?: boolean;
  fixed_price?: number;
  bracelet_control?: boolean;
  consumption_limit?: number;
}

export interface ItemPOSBars {
  id?: number;
  is_cocktail?: boolean;
  doses?: string;
  measures?: string;
  glasses?: string;
  mixers?: string;
  ice?: string;
  decoration?: string;
}

export interface ItemPOSRoomService {
  id?: number;
  is_available?: boolean;
  max_time_minutes?: number;
  tray?: string;
  priority?: string;
  elevator?: string;
  floor?: string;
  delivery?: string;
}

export interface ItemPOSSelfOrdering {
  id?: number;
  qr_menu?: boolean;
  tablet?: boolean;
  kiosk?: boolean;
  app?: boolean;
}

export interface ItemPOSMultilingual {
  id?: number;
  translated_name?: string;
  translated_description?: string;
  translated_ingredients?: string;
  translated_allergens?: string;
  image_url?: string;
  video_url?: string;
}

export interface ItemPOSProfile {
  id?: number;
  item: number;
  item_name?: string;
  outlet: number;
  outlet_name?: string;
  is_active?: boolean;
  
  ui?: ItemPOSUI;
  pricing?: ItemPOSPricing;
  kitchen?: ItemPOSKitchen;
  allergens?: ItemPOSAllergens;
  minibar?: ItemPOSMinibar;
  delivery?: ItemPOSDelivery;
  events?: ItemPOSEvents;
  ai?: ItemPOSAI;
  fiscal?: ItemPOSFiscal;
  printing?: ItemPOSPrinting;
  buffets?: ItemPOSBuffets;
  bars?: ItemPOSBars;
  room_service?: ItemPOSRoomService;
  self_ordering?: ItemPOSSelfOrdering;
  multilingual?: ItemPOSMultilingual;
}

export interface POSTerminal {
  id?: number;
  outlet: number;
  outlet_name?: string;
  code: string;
  name: string;
  hotel: string;
  area: string;
  restaurant: string;
  bar: string;
  cash_register: string;
  currency: string;
  language: string;
  theme: string;
  grid_columns: number;
  grid_rows: number;
  resolution: string;
  logout_timeout_seconds: number;
  is_touch_mode: boolean;
  is_desktop_mode: boolean;
  is_tablet_mode: boolean;
  is_kiosk_mode: boolean;
  is_self_service_mode: boolean;
  is_room_service_mode: boolean;
  is_delivery_mode: boolean;
  is_offline_mode: boolean;
  is_online_mode: boolean;
  has_keyboard: boolean;
  home_page: string;
  favorites_page: boolean;
  drinks_page: boolean;
  desserts_page: boolean;
  menus_page: boolean;
  shortcuts: string;
  quick_buttons: string;
  favorite_categories: string;
  is_active: boolean;
}

export const posApi = {
  // Outlets
  getOutlets: async (): Promise<Outlet[]> => {
    const { data } = await apiClient.get<Outlet[]>('pos/outlets/');
    return data;
  },
  createOutlet: async (outletData: Partial<Outlet>): Promise<Outlet> => {
    const { data } = await apiClient.post<Outlet>('pos/outlets/', outletData);
    return data;
  },
  updateOutlet: async (id: number, outletData: Partial<Outlet>): Promise<Outlet> => {
    const { data } = await apiClient.put<Outlet>(`pos/outlets/${id}/`, outletData);
    return data;
  },
  deleteOutlet: async (id: number): Promise<void> => {
    await apiClient.delete(`pos/outlets/${id}/`);
  },

  // Terminals
  getTerminals: async (): Promise<POSTerminal[]> => {
    const { data } = await apiClient.get<POSTerminal[]>('pos/terminals/');
    return data;
  },
  createTerminal: async (terminalData: Partial<POSTerminal>): Promise<POSTerminal> => {
    const { data } = await apiClient.post<POSTerminal>('pos/terminals/', terminalData);
    return data;
  },
  updateTerminal: async (id: number, terminalData: Partial<POSTerminal>): Promise<POSTerminal> => {
    const { data } = await apiClient.put<POSTerminal>(`pos/terminals/${id}/`, terminalData);
    return data;
  },
  deleteTerminal: async (id: number): Promise<void> => {
    await apiClient.delete(`pos/terminals/${id}/`);
  },

  // POS Profiles
  getProfiles: async (): Promise<ItemPOSProfile[]> => {
    const { data } = await apiClient.get<ItemPOSProfile[]>('pos/item-pos-profiles/');
    return data;
  },
  createProfile: async (profileData: Partial<ItemPOSProfile>): Promise<ItemPOSProfile> => {
    const { data } = await apiClient.post<ItemPOSProfile>('pos/item-pos-profiles/', profileData);
    return data;
  },
  updateProfile: async (id: number, profileData: Partial<ItemPOSProfile>): Promise<ItemPOSProfile> => {
    const { data } = await apiClient.put<ItemPOSProfile>(`pos/item-pos-profiles/${id}/`, profileData);
    return data;
  },
  deleteProfile: async (id: number): Promise<void> => {
    await apiClient.delete(`pos/item-pos-profiles/${id}/`);
  },

  // Fase C: Configuração da Operação
  getOperationConfigs: async (): Promise<POSOperationConfig[]> => {
    const { data } = await apiClient.get<POSOperationConfig[]>('pos/operation-configs/');
    return data;
  },
  createOperationConfig: async (configData: Partial<POSOperationConfig>): Promise<POSOperationConfig> => {
    const { data } = await apiClient.post<POSOperationConfig>('pos/operation-configs/', configData);
    return data;
  },
  updateOperationConfig: async (id: number, configData: Partial<POSOperationConfig>): Promise<POSOperationConfig> => {
    const { data } = await apiClient.put<POSOperationConfig>(`pos/operation-configs/${id}/`, configData);
    return data;
  },

  getDiningTables: async (): Promise<POSDiningTable[]> => {
    const { data } = await apiClient.get<POSDiningTable[]>('pos/dining-tables/');
    return data;
  },
  createDiningTable: async (tableData: Partial<POSDiningTable>): Promise<POSDiningTable> => {
    const { data } = await apiClient.post<POSDiningTable>('pos/dining-tables/', tableData);
    return data;
  },
  updateDiningTable: async (id: number, tableData: Partial<POSDiningTable>): Promise<POSDiningTable> => {
    const { data } = await apiClient.put<POSDiningTable>(`pos/dining-tables/${id}/`, tableData);
    return data;
  },
  deleteDiningTable: async (id: number): Promise<void> => {
    await apiClient.delete(`pos/dining-tables/${id}/`);
  },

  getPaymentMethods: async (): Promise<POSPaymentMethod[]> => {
    const { data } = await apiClient.get<POSPaymentMethod[]>('pos/payment-methods/');
    return data;
  },
  createPaymentMethod: async (methodData: Partial<POSPaymentMethod>): Promise<POSPaymentMethod> => {
    const { data } = await apiClient.post<POSPaymentMethod>('pos/payment-methods/', methodData);
    return data;
  },
  updatePaymentMethod: async (id: number, methodData: Partial<POSPaymentMethod>): Promise<POSPaymentMethod> => {
    const { data } = await apiClient.put<POSPaymentMethod>(`pos/payment-methods/${id}/`, methodData);
    return data;
  },
  deletePaymentMethod: async (id: number): Promise<void> => {
    await apiClient.delete(`pos/payment-methods/${id}/`);
  },

  getOrderTypes: async (): Promise<POSOrderType[]> => {
    const { data } = await apiClient.get<POSOrderType[]>('pos/order-types/');
    return data;
  },
  createOrderType: async (typeData: Partial<POSOrderType>): Promise<POSOrderType> => {
    const { data } = await apiClient.post<POSOrderType>('pos/order-types/', typeData);
    return data;
  },
  updateOrderType: async (id: number, typeData: Partial<POSOrderType>): Promise<POSOrderType> => {
    const { data } = await apiClient.put<POSOrderType>(`pos/order-types/${id}/`, typeData);
    return data;
  },
  deleteOrderType: async (id: number): Promise<void> => {
    await apiClient.delete(`pos/order-types/${id}/`);
  }
};

export interface POSOperationConfig {
  id?: number;
  outlet: number;
  allow_join_tables?: boolean;
  allow_split_tables?: boolean;
  allow_move_tables?: boolean;
  allow_transfer_accounts?: boolean;
  allow_partial_close?: boolean;
  allow_split_by_pax?: boolean;
  allow_split_equal?: boolean;
  allow_split_by_item?: boolean;
  allow_reopen_account?: boolean;
  allow_immediate_order?: boolean;
  allow_scheduled_order?: boolean;
  allow_takeaway?: boolean;
  allow_delivery?: boolean;
  allow_room_charge?: boolean;
  allow_spa_charge?: boolean;
}

export interface POSDiningTable {
  id?: number;
  outlet: number;
  zone?: string;
  table_number: string;
  name?: string;
  seats_capacity?: number;
  status?: 'FREE' | 'OCCUPIED' | 'RESERVED' | 'DIRTY';
  x_position?: number;
  y_position?: number;
  width?: number;
  height?: number;
  shape?: 'square' | 'circle';
}

export interface POSPaymentMethod {
  id?: number;
  outlet: number;
  name: string;
  is_active?: boolean;
  requires_authorization?: boolean;
  integration_code?: string;
  sort_order?: number;
}

export interface POSOrderType {
  id?: number;
  outlet: number;
  name: string;
  is_active?: boolean;
  tax_behavior?: string;
  default_preparation_time?: number;
  sort_order?: number;
}
