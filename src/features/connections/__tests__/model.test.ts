import {
  describeQuota,
  relationshipWith,
  toConnectionRequest,
  type ConnectionRequest,
  type Quota,
} from '@/features/connections/model';

const ME = 'me';
const THEM = 'them';

function request(overrides: Partial<ConnectionRequest>): ConnectionRequest {
  return {
    id: 'r1',
    senderId: ME,
    recipientId: THEM,
    status: 'pending',
    createdAt: '2026-11-19T12:00:00Z',
    ...overrides,
  };
}

describe('relationshipWith', () => {
  it('is none when there is no request between the two people', () => {
    const unrelated = request({ recipientId: 'someone-else' });
    expect(relationshipWith(THEM, ME, [unrelated])).toEqual({ kind: 'none' });
  });

  it('is sent when I asked and they have not answered', () => {
    expect(relationshipWith(THEM, ME, [request({})])).toEqual({ kind: 'sent' });
  });

  it('is received, with the request to answer, when they asked me', () => {
    const incoming = request({ id: 'r9', senderId: THEM, recipientId: ME });
    expect(relationshipWith(THEM, ME, [incoming])).toEqual({ kind: 'received', requestId: 'r9' });
  });

  it('is connected once accepted, whoever sent it', () => {
    const mine = request({ status: 'accepted' });
    const theirs = request({ senderId: THEM, recipientId: ME, status: 'accepted' });

    expect(relationshipWith(THEM, ME, [mine])).toEqual({ kind: 'connected' });
    expect(relationshipWith(THEM, ME, [theirs])).toEqual({ kind: 'connected' });
  });

  it('is declined once declined', () => {
    expect(relationshipWith(THEM, ME, [request({ status: 'declined' })])).toEqual({
      kind: 'declined',
    });
  });
});

describe('describeQuota', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  const quota = (overrides: Partial<Quota>): Quota => ({
    dailyLimit: 5,
    used: 0,
    remaining: 5,
    nextSlotAt: null,
    ...overrides,
  });

  it('counts what is left', () => {
    expect(describeQuota(quota({ used: 2, remaining: 3 }), now)).toBe('3 of 5 requests left today');
  });

  it('says how many minutes until the next slot', () => {
    const empty = quota({ used: 5, remaining: 0, nextSlotAt: '2026-11-19T12:25:00Z' });
    expect(describeQuota(empty, now)).toBe('Limit reached. Next request in 25 min');
  });

  it('switches to hours for longer waits', () => {
    const empty = quota({ used: 5, remaining: 0, nextSlotAt: '2026-11-19T15:10:00Z' });
    expect(describeQuota(empty, now)).toBe('Limit reached. Next request in 4 h');
  });

  it('never shows zero or negative minutes', () => {
    const empty = quota({ used: 5, remaining: 0, nextSlotAt: '2026-11-19T11:59:00Z' });
    expect(describeQuota(empty, now)).toBe('Limit reached. Next request in 1 min');
  });
});

describe('toConnectionRequest', () => {
  it('maps database columns to the app model', () => {
    expect(
      toConnectionRequest({
        id: 'r1',
        sender_id: ME,
        recipient_id: THEM,
        status: 'pending',
        created_at: '2026-11-19T12:00:00Z',
        responded_at: null,
      }),
    ).toEqual(request({}));
  });
});
