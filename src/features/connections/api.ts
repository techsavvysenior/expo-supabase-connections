import type { SupabaseClient } from '@supabase/supabase-js';

import { toAppError } from '@/lib/errors';
import type { Database } from '@/types/database';

import {
  toConnectionRequest,
  toQuota,
  type ConnectionRequest,
  type Person,
  type Quota,
} from './model';

type Client = SupabaseClient<Database>;

/**
 * Each function takes the client as an argument, which keeps this module free
 * of global state and lets tests pass a fake. Every failure leaves here as an
 * `AppError`.
 */
export async function listPeople(client: Client, currentUserId: string): Promise<Person[]> {
  const { data, error } = await client
    .from('profiles')
    .select('id, display_name')
    .neq('id', currentUserId)
    .order('display_name');
  if (error) throw toAppError(error);
  return data.map((row) => ({ id: row.id, displayName: row.display_name }));
}

export async function listRequests(client: Client): Promise<ConnectionRequest[]> {
  // Row-level security already limits this to requests the user is part of.
  const { data, error } = await client
    .from('connection_requests')
    .select('id, sender_id, recipient_id, status, created_at, responded_at')
    .order('created_at', { ascending: false });
  if (error) throw toAppError(error);
  return data.map(toConnectionRequest);
}

export async function getQuota(client: Client): Promise<Quota> {
  const { data, error } = await client.rpc('connection_quota');
  if (error) throw toAppError(error);
  const row = data[0];
  if (!row) throw toAppError({ message: 'NOT_AUTHENTICATED' });
  return toQuota(row);
}

export async function sendRequest(client: Client, recipientId: string): Promise<ConnectionRequest> {
  const { data, error } = await client.rpc('send_connection_request', {
    p_recipient_id: recipientId,
  });
  if (error) throw toAppError(error);
  return toConnectionRequest(data);
}

export async function respondToRequest(
  client: Client,
  requestId: string,
  accept: boolean,
): Promise<ConnectionRequest> {
  const { data, error } = await client.rpc('respond_to_connection_request', {
    p_request_id: requestId,
    p_accept: accept,
  });
  if (error) throw toAppError(error);
  return toConnectionRequest(data);
}
