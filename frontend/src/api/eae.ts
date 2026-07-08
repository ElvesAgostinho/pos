import { apiClient } from './client';
import type { Role, Policy } from '../engine/authorization/types';

export interface EaeProfile {
  id: number;
  code: string;
  name: string;
  description: string | null;
  category: string;
  color: string | null;
  icon: string | null;
  priority: number;
  is_global: boolean;
  company: number | null;
  status: 'Draft' | 'Active' | 'Inactive';
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EaeResource {
  id: number;
  urn: string;
  name: string;
  description: string | null;
  module: string;
}

export interface EaePolicy {
  id: number;
  profile: number;
  resource: number;
  resource_urn?: string;
  action: string;
  effect: 'allow' | 'deny';
  abac_conditions: any | null;
  created_at?: string;
}

export const fetchProfiles = async (): Promise<EaeProfile[]> => {
  const response = await apiClient.get('eae/profiles/');
  return response.data;
};

export const createProfile = async (data: Partial<EaeProfile>): Promise<EaeProfile> => {
  const response = await apiClient.post('eae/profiles/', data);
  return response.data;
};

export const updateProfile = async (id: number, data: Partial<EaeProfile>): Promise<EaeProfile> => {
  const response = await apiClient.patch(`eae/profiles/${id}/`, data);
  return response.data;
};

export const deleteProfile = async (id: number): Promise<void> => {
  await apiClient.delete(`eae/profiles/${id}/`);
};

export const fetchPolicies = async (): Promise<EaePolicy[]> => {
  const response = await apiClient.get('eae/policies/');
  return response.data;
};

export const createPolicy = async (data: Partial<EaePolicy>): Promise<EaePolicy> => {
  const response = await apiClient.post('eae/policies/', data);
  return response.data;
};

export const updatePolicy = async (id: number, data: Partial<EaePolicy>): Promise<EaePolicy> => {
  const response = await apiClient.patch(`eae/policies/${id}/`, data);
  return response.data;
};

export const deletePolicy = async (id: number): Promise<void> => {
  await apiClient.delete(`eae/policies/${id}/`);
};

export const fetchResources = async (): Promise<EaeResource[]> => {
  const response = await apiClient.get('eae/resources/');
  return response.data;
};
