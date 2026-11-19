import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Button, EmptyState, ErrorNotice, Loading, colors } from '@/components/ui';
import { useCurrentUserId } from '@/features/auth/auth-context';
import {
  usePeople,
  useQuota,
  useRequests,
  useRespondToRequest,
  useSendRequest,
} from '@/features/connections/hooks';
import { describeQuota, relationshipWith, type Person } from '@/features/connections/model';

export default function PeopleScreen() {
  const userId = useCurrentUserId();
  const people = usePeople();
  const requests = useRequests();
  const quota = useQuota();
  const send = useSendRequest();
  const respond = useRespondToRequest();

  const loadError = people.error ?? requests.error;
  const actionError = send.error ?? respond.error;
  const refreshing = people.isRefetching || requests.isRefetching || quota.isRefetching;

  function refresh() {
    void people.refetch();
    void requests.refetch();
    void quota.refetch();
  }

  if (people.isPending || requests.isPending) return <Loading />;

  if (loadError && !people.data) {
    return (
      <View style={styles.padded}>
        <ErrorNotice error={loadError} onRetry={refresh} />
      </View>
    );
  }

  const outOfRequests = quota.data ? quota.data.remaining === 0 : false;

  function renderPerson({ item }: { item: Person }) {
    const relationship = relationshipWith(item.id, userId, requests.data ?? []);
    const sendingThis = send.isPending && send.variables === item.id;

    return (
      <View style={styles.row}>
        <Text numberOfLines={1} style={styles.name}>
          {item.displayName}
        </Text>
        {relationship.kind === 'none' ? (
          <Button
            disabled={outOfRequests || send.isPending}
            label="Connect"
            loading={sendingThis}
            onPress={() => send.mutate(item.id)}
            testID={`connect-${item.id}`}
          />
        ) : relationship.kind === 'received' ? (
          <Button
            disabled={respond.isPending}
            label="Accept"
            onPress={() => respond.mutate({ requestId: relationship.requestId, accept: true })}
            variant="secondary"
          />
        ) : (
          <Text style={[styles.status, relationship.kind === 'connected' && styles.connected]}>
            {relationship.kind === 'sent'
              ? 'Request sent'
              : relationship.kind === 'connected'
                ? 'Connected'
                : 'Declined'}
          </Text>
        )}
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={people.data}
      keyExtractor={(person) => person.id}
      ListEmptyComponent={
        <EmptyState body="When other people join, they will show up here." title="No one yet" />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          {quota.data ? (
            <Text style={[styles.quota, outOfRequests && styles.quotaEmpty]} testID="quota">
              {describeQuota(quota.data)}
            </Text>
          ) : null}
          {actionError ? <ErrorNotice error={actionError} /> : null}
        </View>
      }
      refreshControl={<RefreshControl onRefresh={refresh} refreshing={refreshing} />}
      renderItem={renderPerson}
      style={styles.screen}
    />
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  padded: { backgroundColor: colors.background, flex: 1, padding: 16 },
  list: { flexGrow: 1, gap: 10, padding: 16 },
  header: { gap: 10 },
  quota: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  quotaEmpty: { color: colors.danger },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  name: { color: colors.text, flex: 1, fontSize: 16, fontWeight: '600' },
  status: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  connected: { color: colors.success },
});
