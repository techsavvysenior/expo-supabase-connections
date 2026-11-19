import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useCurrentUserId } from '@/features/auth/auth-context';
import type { AppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

import { getQuota, listPeople, listRequests, respondToRequest, sendRequest } from './api';
import type { ConnectionRequest, Person, Quota } from './model';

/** Keys include the user id so one account never sees another's cached data. */
const keys = {
  people: (userId: string) => ['people', userId] as const,
  requests: (userId: string) => ['requests', userId] as const,
  quota: (userId: string) => ['quota', userId] as const,
};

export function usePeople() {
  const userId = useCurrentUserId();
  return useQuery<Person[], AppError>({
    queryKey: keys.people(userId),
    queryFn: () => listPeople(supabase, userId),
  });
}

export function useRequests() {
  const userId = useCurrentUserId();
  return useQuery<ConnectionRequest[], AppError>({
    queryKey: keys.requests(userId),
    queryFn: () => listRequests(supabase),
  });
}

export function useQuota() {
  const userId = useCurrentUserId();
  return useQuery<Quota, AppError>({
    queryKey: keys.quota(userId),
    queryFn: () => getQuota(supabase),
  });
}

export function useSendRequest() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  return useMutation<ConnectionRequest, AppError, string>({
    mutationFn: (recipientId) => sendRequest(supabase, recipientId),
    // Refetch on failure too. A LIMIT_REACHED or ALREADY_REQUESTED answer means
    // what the screen was showing is out of date.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.requests(userId) }),
        queryClient.invalidateQueries({ queryKey: keys.quota(userId) }),
      ]),
  });
}

export function useRespondToRequest() {
  const userId = useCurrentUserId();
  const queryClient = useQueryClient();
  return useMutation<ConnectionRequest, AppError, { requestId: string; accept: boolean }>({
    mutationFn: ({ requestId, accept }) => respondToRequest(supabase, requestId, accept),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.requests(userId) }),
  });
}
