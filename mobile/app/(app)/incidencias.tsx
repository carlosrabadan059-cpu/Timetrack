import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Plus, X, ChevronDown } from 'lucide-react-native';
import { api } from '@/lib/api';

type Incidencia = {
  id: string;
  type: 'olvido' | 'correccion' | 'ausencia' | 'hora_extra';
  status: 'pending' | 'approved' | 'rejected';
  date: string;
  reason: string;
  manager_note: string | null;
  created_at: string;
  requested_timestamp: string | null;
  requested_direction: 'in' | 'out' | null;
};

const TYPE_OPTIONS = [
  { value: 'olvido',     label: 'Fichaje olvidado' },
  { value: 'ausencia',   label: 'Ausencia justificada' },
  { value: 'hora_extra', label: 'Hora extra' },
] as const;

const TYPE_LABEL: Record<string, string> = {
  olvido:     'Fichaje olvidado',
  correccion: 'Corrección',
  ausencia:   'Ausencia',
  hora_extra: 'Hora extra',
};

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  pending:  { bg: 'rgba(234,179,8,0.12)',  text: '#eab308', label: 'Pendiente' },
  approved: { bg: 'rgba(34,197,94,0.12)',  text: '#22c55e', label: 'Aprobada'  },
  rejected: { bg: 'rgba(239,68,68,0.12)',  text: '#ef4444', label: 'Rechazada' },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function toLocalISO(dateStr: string, timeStr: string): string {
  // dateStr: YYYY-MM-DD, timeStr: HH:mm → local datetime as ISO string
  return new Date(`${dateStr}T${timeStr}:00`).toISOString();
}

// ─── New Incidencia Form ──────────────────────────────────────────────────────

type FormState = {
  type: 'olvido' | 'ausencia' | 'hora_extra';
  date: string;
  reason: string;
  time: string;
  direction: 'in' | 'out';
};

function NewIncidenciaModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<FormState>({
    type: 'olvido',
    date: todayISO(),
    reason: '',
    time: '09:00',
    direction: 'in',
  });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (form.reason.trim().length < 10) {
      Alert.alert('Motivo demasiado corto', 'Escribe al menos 10 caracteres.');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        type: form.type,
        date: form.date,
        reason: form.reason.trim(),
      };
      if (form.type === 'olvido') {
        body.requested_timestamp = toLocalISO(form.date, form.time);
        body.requested_direction = form.direction;
      }
      await api.post('/api/me/incidencias', body);
      onCreated();
      onClose();
      setForm({ type: 'olvido', date: todayISO(), reason: '', time: '09:00', direction: 'in' });
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo enviar la solicitud');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={modal.container}>
          {/* Header */}
          <View style={modal.header}>
            <Text style={modal.title}>Nueva Solicitud</Text>
            <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
              <X color="#888" size={22} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={modal.body} showsVerticalScrollIndicator={false}>
            {/* Tipo */}
            <View style={modal.field}>
              <Text style={modal.label}>Tipo de solicitud</Text>
              <View style={modal.pills}>
                {TYPE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[modal.pill, form.type === opt.value && modal.pillActive]}
                    onPress={() => set('type', opt.value)}
                  >
                    <Text style={[modal.pillText, form.type === opt.value && modal.pillTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Fecha */}
            <View style={modal.field}>
              <Text style={modal.label}>Fecha</Text>
              <TextInput
                style={modal.input}
                value={form.date}
                onChangeText={(v) => set('date', v)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#444"
                keyboardType="numeric"
              />
            </View>

            {/* Campos extra para 'olvido' */}
            {form.type === 'olvido' && (
              <>
                <View style={modal.field}>
                  <Text style={modal.label}>Hora del fichaje olvidado</Text>
                  <TextInput
                    style={modal.input}
                    value={form.time}
                    onChangeText={(v) => set('time', v)}
                    placeholder="HH:MM"
                    placeholderTextColor="#444"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={modal.field}>
                  <Text style={modal.label}>Tipo de fichaje</Text>
                  <View style={modal.dirRow}>
                    {(['in', 'out'] as const).map((d) => (
                      <TouchableOpacity
                        key={d}
                        style={[modal.dirBtn, form.direction === d && modal.dirBtnActive]}
                        onPress={() => set('direction', d)}
                      >
                        <Text style={[modal.dirBtnText, form.direction === d && modal.dirBtnTextActive]}>
                          {d === 'in' ? 'Entrada' : 'Salida'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </>
            )}

            {/* Motivo */}
            <View style={modal.field}>
              <Text style={modal.label}>Motivo <Text style={{ color: '#555' }}>(mín. 10 caracteres)</Text></Text>
              <TextInput
                style={[modal.input, modal.textarea]}
                value={form.reason}
                onChangeText={(v) => set('reason', v)}
                placeholder="Describe brevemente el motivo..."
                placeholderTextColor="#444"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <TouchableOpacity
              style={[modal.submitBtn, saving && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#0a0a0a" />
              ) : (
                <Text style={modal.submitText}>Enviar solicitud</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function IncidenciasScreen() {
  const [items, setItems] = useState<Incidencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async (replace = true) => {
    try {
      const res = await api.get<{ items: Incidencia[] }>('/api/me/incidencias?limit=30');
      if (replace) setItems(res.data.items ?? []);
    } catch {
      // mantener datos anteriores
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

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
        <View>
          <Text style={styles.title}>Solicitudes</Text>
          <Text style={styles.subtitle}>Incidencias y correcciones</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
          <Plus color="#0a0a0a" size={20} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#befa3b" />}
        renderItem={({ item }) => {
          const s = STATUS_STYLE[item.status];
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardType}>{TYPE_LABEL[item.type]}</Text>
                <View style={[styles.badge, { backgroundColor: s.bg }]}>
                  <Text style={[styles.badgeText, { color: s.text }]}>{s.label}</Text>
                </View>
              </View>
              <Text style={styles.cardDate}>{fmtDate(item.date)}</Text>
              <Text style={styles.cardReason} numberOfLines={2}>{item.reason}</Text>
              {item.manager_note && (
                <View style={styles.noteBox}>
                  <Text style={styles.noteLabel}>Nota del responsable</Text>
                  <Text style={styles.noteText}>{item.manager_note}</Text>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Sin solicitudes</Text>
            <Text style={styles.emptySub}>Pulsa + para crear una nueva</Text>
          </View>
        }
      />

      <NewIncidenciaModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onCreated={() => { load(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center:    { justifyContent: 'center', alignItems: 'center' },

  header: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  title:    { fontSize: 26, fontWeight: '700', color: '#f5f5f5' },
  subtitle: { fontSize: 13, color: '#555', marginTop: 2 },
  addBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#befa3b',
    alignItems: 'center', justifyContent: 'center',
  },

  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },

  card: {
    backgroundColor: '#141414',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    padding: 16,
    gap: 6,
  },
  cardTop:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardType:  { fontSize: 15, fontWeight: '600', color: '#f5f5f5' },
  badge:     { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardDate:  { fontSize: 12, color: '#555' },
  cardReason:{ fontSize: 13, color: '#888', lineHeight: 18 },
  noteBox:   { marginTop: 4, padding: 10, backgroundColor: '#1a1a1a', borderRadius: 10, gap: 2 },
  noteLabel: { fontSize: 11, color: '#555', fontWeight: '600' },
  noteText:  { fontSize: 13, color: '#aaa' },

  empty:    { paddingTop: 80, alignItems: 'center', gap: 6 },
  emptyText:{ color: '#555', fontSize: 15, fontWeight: '600' },
  emptySub: { color: '#333', fontSize: 13 },
});

const modal = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#1e1e1e',
  },
  title:    { fontSize: 18, fontWeight: '700', color: '#f5f5f5' },
  closeBtn: { padding: 4 },

  body:  { padding: 20, gap: 20, paddingBottom: 40 },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#888' },

  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: '#f5f5f5',
  },
  textarea: { minHeight: 100 },

  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 99, borderWidth: 1, borderColor: '#2a2a2a',
  },
  pillActive:     { borderColor: '#befa3b', backgroundColor: 'rgba(190,250,59,0.08)' },
  pillText:       { fontSize: 13, color: '#666' },
  pillTextActive: { color: '#befa3b', fontWeight: '600' },

  dirRow: { flexDirection: 'row', gap: 10 },
  dirBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center',
  },
  dirBtnActive:     { borderColor: '#befa3b', backgroundColor: 'rgba(190,250,59,0.08)' },
  dirBtnText:       { fontSize: 14, color: '#666' },
  dirBtnTextActive: { color: '#befa3b', fontWeight: '600' },

  submitBtn: {
    backgroundColor: '#befa3b', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  submitText: { color: '#0a0a0a', fontWeight: '700', fontSize: 15 },
});
