import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import type { PGlite } from '@electric-sql/pglite';

import { asAnonymous, asUser, createDatabase, signUp } from './harness.mts';

type RequestRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  status: 'pending' | 'accepted' | 'declined';
  responded_at: Date | null;
};

type QuotaRow = {
  daily_limit: number;
  used: number;
  remaining: number;
  next_slot_at: Date | null;
};

const PERMISSION_DENIED = /permission denied/;

let db: PGlite;
let alice: string;
let bob: string;
let carol: string;

beforeEach(async () => {
  db = await createDatabase();
  alice = await signUp(db, 'alice@example.com', 'Alice');
  bob = await signUp(db, 'bob@example.com', 'Bob');
  carol = await signUp(db, 'carol@example.com', 'Carol');
});

afterEach(async () => {
  await db.close();
});

const send = (from: string, to: string) =>
  asUser(db, from, async (tx) => {
    const { rows } = await tx.query<RequestRow>(
      'select * from public.send_connection_request($1)',
      [to],
    );
    return rows[0];
  });

const respond = (as: string, requestId: string, accept: boolean) =>
  asUser(db, as, async (tx) => {
    const { rows } = await tx.query<RequestRow>(
      'select * from public.respond_to_connection_request($1, $2)',
      [requestId, accept],
    );
    return rows[0];
  });

const visibleRequests = (as: string) =>
  asUser(db, as, async (tx) => {
    const { rows } = await tx.query<RequestRow>('select * from public.connection_requests');
    return rows;
  });

const quota = (as: string) =>
  asUser(db, as, async (tx) => {
    const { rows } = await tx.query<QuotaRow>('select * from public.connection_quota()');
    return rows[0];
  });

/** Signs up `count` extra people for a sender to connect with. */
async function signUpMany(count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(await signUp(db, `person${i}@example.com`));
  }
  return ids;
}

describe('sign-up', () => {
  it('creates a profile from the chosen display name', async () => {
    const { rows } = await db.query(
      'select display_name, plan from public.profiles where id = $1',
      [alice],
    );
    assert.deepEqual(rows, [{ display_name: 'Alice', plan: 'free' }]);
  });

  it('falls back to the email name when no display name is given', async () => {
    const id = await signUp(db, 'dana.lee@example.com');
    const { rows } = await db.query('select display_name from public.profiles where id = $1', [id]);
    assert.deepEqual(rows, [{ display_name: 'dana.lee' }]);
  });
});

describe('profiles', () => {
  it('lets a signed-in user read names', async () => {
    const names = await asUser(db, alice, async (tx) => {
      const { rows } = await tx.query<{ display_name: string }>(
        'select display_name from public.profiles order by display_name',
      );
      return rows.map((row) => row.display_name);
    });
    assert.deepEqual(names, ['Alice', 'Bob', 'Carol']);
  });

  it("does not expose anyone's plan", async () => {
    await assert.rejects(
      asUser(db, alice, (tx) => tx.query('select plan from public.profiles')),
      PERMISSION_DENIED,
    );
  });

  it('does not let a user upgrade their own plan', async () => {
    await assert.rejects(
      asUser(db, alice, (tx) =>
        tx.query("update public.profiles set plan = 'pro' where id = $1", [alice]),
      ),
      PERMISSION_DENIED,
    );
  });

  it('lets a user rename themselves but nobody else', async () => {
    const own = await asUser(db, alice, (tx) =>
      tx.query("update public.profiles set display_name = 'Ali' where id = $1", [alice]),
    );
    const other = await asUser(db, alice, (tx) =>
      tx.query("update public.profiles set display_name = 'Hacked' where id = $1", [bob]),
    );

    assert.equal(own.affectedRows, 1);
    assert.equal(other.affectedRows, 0);
  });

  it('shows nothing to a visitor who is not signed in', async () => {
    await assert.rejects(
      asAnonymous(db, (tx) => tx.query('select display_name from public.profiles')),
      PERMISSION_DENIED,
    );
  });
});

describe('who can see a request', () => {
  it('is visible to the sender and the recipient only', async () => {
    const request = await send(alice, bob);

    assert.deepEqual((await visibleRequests(alice)).map((r) => r.id), [request.id]);
    assert.deepEqual((await visibleRequests(bob)).map((r) => r.id), [request.id]);
    assert.deepEqual(await visibleRequests(carol), []);
  });

  it('cannot be inserted directly, bypassing the limit', async () => {
    await assert.rejects(
      asUser(db, alice, (tx) =>
        tx.query(
          'insert into public.connection_requests (sender_id, recipient_id) values ($1, $2)',
          [alice, bob],
        ),
      ),
      PERMISSION_DENIED,
    );
  });

  it('cannot be accepted by editing the row directly', async () => {
    const request = await send(alice, bob);

    await assert.rejects(
      asUser(db, alice, (tx) =>
        tx.query("update public.connection_requests set status = 'accepted' where id = $1", [
          request.id,
        ]),
      ),
      PERMISSION_DENIED,
    );
  });

  it('cannot be sent by a visitor who is not signed in', async () => {
    await assert.rejects(
      asAnonymous(db, (tx) => tx.query('select public.send_connection_request($1)', [bob])),
      PERMISSION_DENIED,
    );
  });
});

describe('sending a request', () => {
  it('creates a pending request from the signed-in user', async () => {
    const request = await send(alice, bob);

    assert.partialDeepStrictEqual(request, {
      sender_id: alice,
      recipient_id: bob,
      status: 'pending',
      responded_at: null,
    });
  });

  it('refuses a request to yourself', async () => {
    await assert.rejects(send(alice, alice), /CANNOT_CONNECT_TO_SELF/);
  });

  it('refuses a recipient who does not exist', async () => {
    await assert.rejects(
      send(alice, '00000000-0000-0000-0000-000000000000'),
      /RECIPIENT_NOT_FOUND/,
    );
  });

  it('refuses a second request to the same person', async () => {
    await send(alice, bob);
    await assert.rejects(send(alice, bob), /ALREADY_REQUESTED/);
  });

  it('refuses a request when the other person already sent one', async () => {
    await send(alice, bob);
    await assert.rejects(send(bob, alice), /ALREADY_REQUESTED/);
  });
});

describe('the daily limit', () => {
  it('stops a free account at five requests in 24 hours', async () => {
    const people = await signUpMany(6);
    for (const person of people.slice(0, 5)) {
      await send(alice, person);
    }

    await assert.rejects(send(alice, people[5]), /LIMIT_REACHED/);
    assert.equal((await visibleRequests(alice)).length, 5);
  });

  it('stops counting a request once it is more than 24 hours old', async () => {
    const people = await signUpMany(6);
    for (const person of people.slice(0, 5)) {
      await send(alice, person);
    }
    await db.query(
      "update public.connection_requests set created_at = now() - interval '25 hours' where recipient_id = $1",
      [people[0]],
    );

    const request = await send(alice, people[5]);
    assert.equal(request.status, 'pending');
  });

  it('gives a pro account a higher limit', async () => {
    await db.query("update public.profiles set plan = 'pro' where id = $1", [alice]);
    const people = await signUpMany(6);

    for (const person of people) {
      await send(alice, person);
    }

    assert.equal((await visibleRequests(alice)).length, 6);
  });

  it('reports the allowance the app shows', async () => {
    assert.deepEqual(await quota(alice), {
      daily_limit: 5,
      used: 0,
      remaining: 5,
      next_slot_at: null,
    });

    await send(alice, bob);
    await send(alice, carol);

    const after = await quota(alice);
    assert.partialDeepStrictEqual(after, { daily_limit: 5, used: 2, remaining: 3 });
    assert.ok(after.next_slot_at instanceof Date);
  });

  it('does not count requests the user received', async () => {
    await send(bob, alice);
    assert.partialDeepStrictEqual(await quota(alice), { used: 0, remaining: 5 });
  });
});

describe('responding to a request', () => {
  it('lets the recipient accept', async () => {
    const request = await send(alice, bob);

    const answered = await respond(bob, request.id, true);

    assert.equal(answered.status, 'accepted');
    assert.ok(answered.responded_at instanceof Date);
  });

  it('lets the recipient decline', async () => {
    const request = await send(alice, bob);
    assert.equal((await respond(bob, request.id, false)).status, 'declined');
  });

  it('does not let the sender accept their own request', async () => {
    const request = await send(alice, bob);
    await assert.rejects(respond(alice, request.id, true), /REQUEST_NOT_FOUND/);
  });

  it('does not let a third person answer it', async () => {
    const request = await send(alice, bob);
    await assert.rejects(respond(carol, request.id, true), /REQUEST_NOT_FOUND/);
  });

  it('cannot be answered twice', async () => {
    const request = await send(alice, bob);
    await respond(bob, request.id, false);

    await assert.rejects(respond(bob, request.id, true), /REQUEST_NOT_FOUND/);
  });
});
