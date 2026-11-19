import type { ConnectionQuotaRow, ConnectionRequestRow, RequestStatus } from '@/types/database';

export type Person = { id: string; displayName: string };

export type ConnectionRequest = {
  id: string;
  senderId: string;
  recipientId: string;
  status: RequestStatus;
  createdAt: string;
};

export type Quota = {
  dailyLimit: number;
  used: number;
  remaining: number;
  /** When the next request slot frees up, if any are in use. */
  nextSlotAt: string | null;
};

/** How the signed-in user stands with one other person. */
export type Relationship =
  | { kind: 'none' }
  | { kind: 'sent' }
  | { kind: 'received'; requestId: string }
  | { kind: 'connected' }
  | { kind: 'declined' };

export function toConnectionRequest(row: ConnectionRequestRow): ConnectionRequest {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function toQuota(row: ConnectionQuotaRow): Quota {
  return {
    dailyLimit: row.daily_limit,
    used: row.used,
    remaining: row.remaining,
    nextSlotAt: row.next_slot_at,
  };
}

/**
 * Works out the relationship from the requests the user can see.
 * The database allows one request per pair, so the first match is the only one.
 */
export function relationshipWith(
  personId: string,
  currentUserId: string,
  requests: readonly ConnectionRequest[],
): Relationship {
  const request = requests.find(
    (r) =>
      (r.senderId === currentUserId && r.recipientId === personId) ||
      (r.senderId === personId && r.recipientId === currentUserId),
  );
  if (!request) return { kind: 'none' };

  if (request.status === 'accepted') return { kind: 'connected' };
  if (request.status === 'declined') return { kind: 'declined' };
  return request.senderId === currentUserId
    ? { kind: 'sent' }
    : { kind: 'received', requestId: request.id };
}

export function describeQuota(quota: Quota, now: Date = new Date()): string {
  if (quota.remaining > 0) {
    return `${quota.remaining} of ${quota.dailyLimit} requests left today`;
  }
  if (!quota.nextSlotAt) return 'No requests left today';

  const minutes = Math.max(
    1,
    Math.ceil((new Date(quota.nextSlotAt).getTime() - now.getTime()) / 60_000),
  );
  if (minutes < 60) return `Limit reached. Next request in ${minutes} min`;
  return `Limit reached. Next request in ${Math.ceil(minutes / 60)} h`;
}
