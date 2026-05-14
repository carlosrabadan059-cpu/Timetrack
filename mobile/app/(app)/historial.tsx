import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { api } from '@/lib/api';

type Fichaje = {
  id: string;
  direction: 'in' | 'out';
  timestamp: string;
  detail_type: string | null;
  source: string;
  corrected: boolean | null;
};

type DayGroup = {
  date: string;
  label: string;
  total_minutes: number;
  fichajes: Fichaje[];
};

type HistorialResponse = {
  days: DayGroup[];
  meta: { page: number; total_days: number; has_more: boolean };
};

const SOURCE_LABEL: Record<string, string> = {
  signalr: '2N',
  web: 'Web',
  mobile: 'Móvil',
  correction: 'Corrección',
};

const DETAIL_LABEL: Record<string, string> = {
  normal: '',
  comida: '· Comida',
  descanso: '· Descanso',
  medico: '· Médico',
  otro: '· Otro',
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function fmtMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function HistorialScreen() {
  const [days, setDays] = useState<DayGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadPage = useCallback(async (p: number, replace: boolean) => {
    try {
      const res = await api.get<HistorialResponse>(`/api/me/historial?period=month&page=${p}&limit=15`);
      const incoming = res.data.days ?? [];
      setDays((prev) => (replace ? incoming : [...prev, ...incoming]));
      setHasMore(res.data.meta?.has_more ?? false);
    } catch {
      // mantener datos anteriores
    }
  }, []);

  useEffect(() => {
    loadPage(1, true).finally(() => setLoading(false));
  }, [loadPage]);

  const onRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    await loadPage(1, true);
    setRefreshing(false);
  };

  const onEndReached = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    const next = page + 1;
    setPage(next);
    await loadPage(next, false);
    setLoadingMore(false);
  };

  const sections = days.map((d) => ({
    title: d.label,
    totalMinutes: d.total_minutes,
    data: d.fichajes,
  }));

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#befa3b" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Historial</Text>
        <Text style={styles.subtitle}>Este mes</Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#befa3b"
          />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.totalMinutes > 0 && (
              <Text style={styles.sectionTotal}>{fmtMinutes(section.totalMinutes)}</Text>
            )}
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.fichajeRow}>
            <View style={[styles.dirBadge, item.direction === 'in' ? styles.badgeIn : styles.badgeOut]}>
              <Text style={[styles.dirText, item.direction === 'in' ? styles.textIn : styles.textOut]}>
                {item.direction === 'in' ? 'E' : 'S'}
              </Text>
            </View>
            <View style={styles.fichajeInfo}>
              <Text style={styles.fichajeTime}>{fmtTime(item.timestamp)}</Text>
              <Text style={styles.fichajeDetail}>
                {SOURCE_LABEL[item.source] ?? item.source}
                {item.detail_type ? ` ${DETAIL_LABEL[item.detail_type] ?? ''}` : ''}
                {item.corrected ? ' · Corregido' : ''}
              </Text>
            </View>
          </View>
        )}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color="#befa3b" style={{ marginVertical: 16 }} />
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Sin fichajes este mes</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { justifyContent: 'center', alignItems: 'center' },

  header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontSize: 26, fontWeight: '700', color: '#f5f5f5' },
  subtitle: { fontSize: 13, color: '#555', marginTop: 2 },

  list: { paddingHorizontal: 20, paddingBottom: 40 },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    marginTop: 8,
  },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#888' },
  sectionTotal: { fontSize: 13, fontWeight: '600', color: '#befa3b' },

  fichajeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
    gap: 14,
  },
  dirBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeIn: { backgroundColor: 'rgba(190,250,59,0.12)' },
  badgeOut: { backgroundColor: 'rgba(239,68,68,0.1)' },
  dirText: { fontSize: 14, fontWeight: '700' },
  textIn: { color: '#befa3b' },
  textOut: { color: '#ef4444' },

  fichajeInfo: { flex: 1, gap: 2 },
  fichajeTime: { fontSize: 16, fontWeight: '600', color: '#f5f5f5' },
  fichajeDetail: { fontSize: 12, color: '#555' },

  empty: { paddingTop: 48, alignItems: 'center' },
  emptyText: { color: '#555', fontSize: 14 },
});
