import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';

import { Button, EmptyState, ErrorNotice, Loading, colors } from '@/components/ui';
import { useCurrentUserId } from '@/features/auth/auth-context';
import { usePeople, useRequests, useRespondToRequest } from '@/features/connections/hooks';
import type { ConnectionRequest } from '@/features/connections/model';

const STATUS_LABEL = { pending: 'Pending', accepted: 'Accepted', declined: 'Declined' } as const;

export default function RequestsScreen() {
  const userId = useCurrentUserId();
  const requests = useRequests();
  const people = usePeople();
  const respond = useRespondToRequest();

  if (requests.isPending) return <Loading />;

  if (requests.error && !requests.data) {
    return (
      <View style={styles.padded}>
        <ErrorNotice error={requests.error} onRetry={() => void requests.refetch()} />
      </View>
    );
  }

  const all = requests.data ?? [];
  const names = new Map(people.data?.map((person) => [person.id, person.displayName]));
  const nameOf = (id: string) => names.get(id) ?? 'Someone';

  const sections = [
    { title: 'Received', data: all.filter((request) => request.recipientId === userId) },
    { title: 'Sent', data: all.filter((request) => request.senderId === userId) },
  ].filter((section) => section.data.length > 0);

  function renderRequest({ item }: { item: ConnectionRequest }) {
    const incoming = item.recipientId === userId;
    const answeringThis = respond.isPending && respond.variables?.requestId === item.id;

    return (
      <View style={styles.row}>
        <Text numberOfLines={1} style={styles.name}>
          {nameOf(incoming ? item.senderId : item.recipientId)}
        </Text>
        {incoming && item.status === 'pending' ? (
          <View style={styles.actions}>
            <Button
              disabled={respond.isPending}
              label="Decline"
              onPress={() => respond.mutate({ requestId: item.id, accept: false })}
              variant="secondary"
            />
            <Button
              disabled={respond.isPending}
              label="Accept"
              loading={answeringThis}
              onPress={() => respond.mutate({ requestId: item.id, accept: true })}
            />
          </View>
        ) : (
          <Text style={styles.status}>{STATUS_LABEL[item.status]}</Text>
        )}
      </View>
    );
  }

  return (
    <SectionList
      contentContainerStyle={styles.list}
      keyExtractor={(request) => request.id}
      ListEmptyComponent={
        <EmptyState
          body="Requests you send and receive will show up here."
          title="No requests yet"
        />
      }
      ListHeaderComponent={respond.error ? <ErrorNotice error={respond.error} /> : undefined}
      refreshControl={
        <RefreshControl
          onRefresh={() => void requests.refetch()}
          refreshing={requests.isRefetching}
        />
      }
      renderItem={renderRequest}
      renderSectionHeader={({ section }) => (
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {section.title}
        </Text>
      )}
      sections={sections}
      stickySectionHeadersEnabled={false}
      style={styles.screen}
    />
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  padded: { backgroundColor: colors.background, flex: 1, padding: 16 },
  list: { flexGrow: 1, gap: 10, padding: 16 },
  sectionTitle: { color: colors.muted, fontSize: 13, fontWeight: '700', marginTop: 6 },
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
  actions: { flexDirection: 'row', gap: 8 },
  status: { color: colors.muted, fontSize: 14, fontWeight: '600' },
});
