import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as eaeApi from '../api/eae';

export const useProfiles = () => {
  return useQuery({
    queryKey: ['eae_profiles'],
    queryFn: eaeApi.fetchProfiles,
  });
};

export const useCreateProfile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: eaeApi.createProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eae_profiles'] });
    },
  });
};

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<eaeApi.EaeProfile> }) => eaeApi.updateProfile(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eae_profiles'] });
    },
  });
};

export const useDeleteProfile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: eaeApi.deleteProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eae_profiles'] });
    },
  });
};

export const usePolicies = () => {
  return useQuery({
    queryKey: ['eae_policies'],
    queryFn: eaeApi.fetchPolicies,
  });
};

export const useCreatePolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: eaeApi.createPolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eae_policies'] });
    },
  });
};

export const useUpdatePolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<eaeApi.EaePolicy> }) => eaeApi.updatePolicy(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eae_policies'] });
    },
  });
};

export const useDeletePolicy = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: eaeApi.deletePolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eae_policies'] });
    },
  });
};

export const useResources = () => {
  return useQuery({
    queryKey: ['eae_resources'],
    queryFn: eaeApi.fetchResources,
  });
};
