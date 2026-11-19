import { QueryClient } from '@tanstack/react-query';

import { toAppError } from '@/lib/errors';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Retry only what can clear up on its own. Retrying a permission or
        // validation failure just delays the message.
        retry: (failureCount, error) => toAppError(error).kind === 'offline' && failureCount < 2,
      },
      // Writes are never retried automatically.
      mutations: { retry: false },
    },
  });
}
