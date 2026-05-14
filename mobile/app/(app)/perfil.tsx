import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

type ProfileData = {
  full_name: string | null;
  email: string | null;
  employee_code: string | null;
  role: string;
  notifications_email: boolean | null;
  ac_synced: boolean;
  created_at: string;
};

const ROLE_LABEL: Record<string, string> = {
  employee: 'Empleado',
  admin:    'Administrador',
  manager:  'Responsable',
};

export default function PerfilScreen() {
  const { signOut } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit name
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Change password
  const [showPassForm, setShowPassForm] = useState(false);
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [savingPass, setSavingPass] = useState(false);

  // Notifications toggle
  const [savingNotif, setSavingNotif] = useState(false);

  useEffect(() => {
    api.get<ProfileData>('/api/me')
      .then((res) => {
        setProfile(res.data);
        setNameInput(res.data.full_name ?? '');
      })
      .finally(() => setLoading(false));
  }, []);

  const saveName = async () => {
    if (!nameInput.trim() || nameInput.trim() === profile?.full_name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const res = await api.patch<ProfileData>('/api/me', { full_name: nameInput.trim() });
      setProfile(res.data);
      setEditingName(false);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSavingName(false);
    }
  };

  const toggleNotifications = async (value: boolean) => {
    if (!profile) return;
    setSavingNotif(true);
    const prev = profile.notifications_email;
    setProfile((p) => p ? { ...p, notifications_email: value } : p);
    try {
      await api.patch('/api/me', { notifications_email: value });
    } catch {
      setProfile((p) => p ? { ...p, notifications_email: prev } : p);
    } finally {
      setSavingNotif(false);
    }
  };

  const changePassword = async () => {
    if (newPass.length < 8) {
      Alert.alert('Contraseña muy corta', 'Mínimo 8 caracteres');
      return;
    }
    setSavingPass(true);
    try {
      await api.post('/api/me/change-password', {
        current_password: currentPass,
        new_password: newPass,
      });
      Alert.alert('Listo', 'Contraseña actualizada correctamente');
      setShowPassForm(false);
      setCurrentPass('');
      setNewPass('');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo cambiar la contraseña');
    } finally {
      setSavingPass(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: signOut },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#befa3b" />
      </View>
    );
  }

  if (!profile) return null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Avatar / nombre */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>
              {(profile.full_name ?? profile.email ?? 'U').charAt(0).toUpperCase()}
            </Text>
          </View>

          {editingName ? (
            <View style={styles.nameEditRow}>
              <TextInput
                style={styles.nameInput}
                value={nameInput}
                onChangeText={setNameInput}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveName}
              />
              <TouchableOpacity style={styles.saveBtn} onPress={saveName} disabled={savingName}>
                {savingName ? (
                  <ActivityIndicator color="#0a0a0a" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Guardar</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setEditingName(true)}>
              <Text style={styles.name}>{profile.full_name ?? '—'}</Text>
              <Text style={styles.nameHint}>Pulsa para editar</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.email}>{profile.email}</Text>
        </View>

        {/* Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Información</Text>
          <View style={styles.card}>
            <Row label="Código empleado" value={profile.employee_code ?? '—'} />
            <Divider />
            <Row label="Rol" value={ROLE_LABEL[profile.role] ?? profile.role} />
            <Divider />
            <Row label="Acceso 2N AC" value={profile.ac_synced ? 'Sincronizado' : 'Sin sincronizar'} />
            <Divider />
            <Row
              label="Miembro desde"
              value={new Date(profile.created_at).toLocaleDateString('es-ES', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            />
          </View>
        </View>

        {/* Notificaciones */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferencias</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.switchLabel}>Notificaciones por email</Text>
                <Text style={styles.switchSub}>Recibe alertas de incidencias resueltas</Text>
              </View>
              <Switch
                value={profile.notifications_email ?? false}
                onValueChange={toggleNotifications}
                disabled={savingNotif}
                trackColor={{ false: '#222', true: '#befa3b' }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>

        {/* Cambiar contraseña */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Seguridad</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.rowBtn} onPress={() => setShowPassForm((v) => !v)}>
              <Text style={styles.rowBtnText}>Cambiar contraseña</Text>
              <Text style={{ color: '#444', fontSize: 18 }}>{showPassForm ? '−' : '+'}</Text>
            </TouchableOpacity>

            {showPassForm && (
              <View style={styles.passForm}>
                <TextInput
                  style={styles.passInput}
                  placeholder="Contraseña actual"
                  placeholderTextColor="#444"
                  secureTextEntry
                  value={currentPass}
                  onChangeText={setCurrentPass}
                />
                <TextInput
                  style={styles.passInput}
                  placeholder="Nueva contraseña (mín. 8 caracteres)"
                  placeholderTextColor="#444"
                  secureTextEntry
                  value={newPass}
                  onChangeText={setNewPass}
                />
                <TouchableOpacity
                  style={[styles.saveBtn, { borderRadius: 12 }, savingPass && { opacity: 0.6 }]}
                  onPress={changePassword}
                  disabled={savingPass}
                >
                  {savingPass ? (
                    <ActivityIndicator color="#0a0a0a" size="small" />
                  ) : (
                    <Text style={styles.saveBtnText}>Actualizar contraseña</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Cerrar sesión */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content:   { padding: 20, paddingBottom: 60, gap: 24 },
  center:    { justifyContent: 'center', alignItems: 'center' },

  avatarSection: { alignItems: 'center', paddingTop: 56, gap: 10 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(190,250,59,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { fontSize: 32, fontWeight: '700', color: '#befa3b' },
  name:         { fontSize: 22, fontWeight: '700', color: '#f5f5f5', textAlign: 'center' },
  nameHint:     { fontSize: 11, color: '#444', textAlign: 'center', marginTop: 2 },
  email:        { fontSize: 14, color: '#555' },

  nameEditRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  nameInput: {
    flex: 1, backgroundColor: '#1a1a1a',
    borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 16, color: '#f5f5f5',
  },
  saveBtn: {
    backgroundColor: '#befa3b', paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  saveBtnText: { color: '#0a0a0a', fontWeight: '700', fontSize: 13 },

  section:      { gap: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#444', letterSpacing: 0.8, textTransform: 'uppercase' },
  card: {
    backgroundColor: '#141414',
    borderRadius: 16, borderWidth: 1, borderColor: '#1e1e1e',
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: '#1e1e1e' },

  row:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  rowLabel:  { fontSize: 14, color: '#888' },
  rowValue:  { fontSize: 14, color: '#f5f5f5', fontWeight: '500', maxWidth: '55%', textAlign: 'right' },

  switchRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  switchLabel:{ fontSize: 14, color: '#f5f5f5', fontWeight: '500' },
  switchSub:  { fontSize: 12, color: '#555' },

  rowBtn: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16,
  },
  rowBtnText: { fontSize: 14, color: '#f5f5f5' },
  passForm: { padding: 16, paddingTop: 0, gap: 10 },
  passInput: {
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#f5f5f5',
  },

  signOutBtn: {
    borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 16,
    paddingVertical: 16, alignItems: 'center',
  },
  signOutText: { color: '#ef4444', fontWeight: '600', fontSize: 15 },
});
