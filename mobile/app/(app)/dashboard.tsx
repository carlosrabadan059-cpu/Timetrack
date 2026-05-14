import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  AppState,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

type WeekBar = { date: string; label: string; minutes: number };

type DashboardData = {
  is_inside: boolean;
  jornada_status: 'working' | 'paused' | 'not_started' | 'finished';
  jornada_started_at: string | null;
  week_total_minutes: number;
  days_worked_this_week: number;
  daily_average_minutes: number;
  weekly_bars: WeekBar[];
};

function fmtMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtTime(iso: string | null) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

const STATUS_LABEL: Record<string, string> = {
  working: 'En jornada',
  paused: 'En pausa',
  not_started: 'Sin iniciar',
  finished: 'Jornada terminada',
};

export default function DashboardScreen() {
  const auth = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fichando, setFichando] = useState(false);
  const appState = useRef(AppState.currentState);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await api.get<DashboardData>('/api/me/dashboard');
      setData(res.data);
    } catch {
      // mantener datos anteriores si falla
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    // Refrescar al volver a primer plano
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        loadDashboard();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [loadDashboard]);

  const handleFichar = async () => {
    setFichando(true);
    try {
      let coords: { latitude: number; longitude: number } | undefined;

      // GPS solo disponible en nativo
      if (Platform.OS !== 'web') {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          }
        } catch { /* best-effort */ }
      }

      const deviceInfo = Platform.OS === 'web' ? 'web' : Platform.OS === 'ios' ? 'ios' : 'android';

      await api.post('/api/me/fichar', {
        device_info: deviceInfo,
        ...(coords ?? {}),
      });

      await loadDashboard();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al fichar';
      Alert.alert('Error', msg);
    } finally {
      setFichando(false);
    }
  };

  if (auth.status !== 'authenticated') return null;

  const isInside = data?.is_inside ?? false;
  const status = data?.jornada_status ?? 'not_started';
  const maxMinutes = Math.max(...(data?.weekly_bars.map((b) => b.minutes) ?? [1]), 1);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>Hola, {auth.profile.full_name?.split(' ')[0]}</Text>
        <Text style={styles.code}>{auth.profile.employee_code}</Text>
      </View>

      {/* Botón principal fichar */}
      <View style={styles.clockCard}>
        <View style={[styles.statusDot, isInside ? styles.dotIn : styles.dotOut]} />
        <Text style={styles.statusLabel}>{STATUS_LABEL[status]}</Text>
        {data?.jornada_started_at && (
          <Text style={styles.startedAt}>Desde las {fmtTime(data.jornada_started_at)}</Text>
        )}

        {loading ? (
          <ActivityIndicator color="#befa3b" size="large" style={{ marginTop: 32 }} />
        ) : (
          <TouchableOpacity
            style={[styles.fichaBtn, isInside ? styles.fichaBtnOut : styles.fichaBtnIn, fichando && styles.fichaBtnDisabled]}
            onPress={handleFichar}
            disabled={fichando}
            activeOpacity={0.85}
          >
            {fichando ? (
              <ActivityIndicator color="#0a0a0a" />
            ) : (
              <>
                <Text style={styles.fichaBtnLabel}>{isInside ? 'Registrar Salida' : 'Registrar Entrada'}</Text>
                <Text style={styles.fichaBtnSub}>
                  {isInside ? 'Finalizar jornada' : 'Iniciar jornada'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Stats semanales */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{data ? fmtMinutes(data.week_total_minutes) : '--'}</Text>
          <Text style={styles.statLabel}>Esta semana</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{data?.days_worked_this_week ?? '--'}</Text>
          <Text style={styles.statLabel}>Días trabajados</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{data ? fmtMinutes(data.daily_average_minutes) : '--'}</Text>
          <Text style={styles.statLabel}>Media diaria</Text>
        </View>
      </View>

      {/* Barras semanales */}
      {data && data.weekly_bars.length > 0 && (
        <View style={styles.barsCard}>
          <Text style={styles.barsTitle}>Semana actual</Text>
          <View style={styles.barsRow}>
            {data.weekly_bars.map((bar) => {
              const pct = Math.round((bar.minutes / maxMinutes) * 100);
              return (
                <View key={bar.date} style={styles.barCol}>
                  <Text style={styles.barValue}>{bar.minutes > 0 ? fmtMinutes(bar.minutes) : ''}</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { height: `${pct}%` as any }]} />
                  </View>
                  <Text style={styles.barDay}>{bar.label}</Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 20, paddingBottom: 40, gap: 16 },

  header: { paddingTop: 56, paddingBottom: 8 },
  greeting: { fontSize: 26, fontWeight: '700', color: '#f5f5f5' },
  code: { fontSize: 13, color: '#555', marginTop: 2 },

  // Tarjeta botón fichar
  clockCard: {
    backgroundColor: '#141414',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#222',
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotIn: { backgroundColor: '#befa3b' },
  dotOut: { backgroundColor: '#444' },
  statusLabel: { fontSize: 16, fontWeight: '600', color: '#f5f5f5' },
  startedAt: { fontSize: 13, color: '#666' },

  fichaBtn: {
    marginTop: 20,
    width: '100%',
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
    gap: 4,
  },
  fichaBtnIn: { backgroundColor: '#befa3b' },
  fichaBtnOut: { backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#333' },
  fichaBtnDisabled: { opacity: 0.6 },
  fichaBtnLabel: { fontSize: 17, fontWeight: '700', color: '#0a0a0a' },
  fichaBtnSub: { fontSize: 12, color: '#0a0a0a', opacity: 0.6 },

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#141414',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222',
    paddingVertical: 16,
  },
  statBox: { flex: 1, alignItems: 'center', gap: 4 },
  statDivider: { width: 1, backgroundColor: '#222' },
  statValue: { fontSize: 20, fontWeight: '700', color: '#f5f5f5' },
  statLabel: { fontSize: 11, color: '#555' },

  // Barras
  barsCard: {
    backgroundColor: '#141414',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222',
    padding: 20,
    gap: 16,
  },
  barsTitle: { fontSize: 13, fontWeight: '600', color: '#888' },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 100 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barValue: { fontSize: 9, color: '#666', height: 14 },
  barTrack: { flex: 1, width: '70%', backgroundColor: '#1e1e1e', borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' },
  barFill: { backgroundColor: '#befa3b', borderRadius: 4, width: '100%' },
  barDay: { fontSize: 11, color: '#666' },
});
