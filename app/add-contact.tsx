// app/add-contact.tsx
import React, { useState, useCallback, ReactElement } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  Platform,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  SafeAreaView,
} from 'react-native';
import {
  Ionicons,
  MaterialIcons,
  MaterialCommunityIcons,
  FontAwesome5,
} from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebaseConfig';

const THEME = '#3B4FD8';

// ── Date helpers ──────────────────────────────────────────────────────────────
const MONTHS: string[] = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

function calcAge(dob: string): string {
  if (!dob) return '';
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? String(age) : '';
}

function normalizeNamePart(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildNameKey(firstName: string, lastName: string): string {
  return `${normalizeNamePart(firstName)} ${normalizeNamePart(lastName)}`.trim();
}

// ── Picker Modal types ─────────────────────────────────────────────────────────
interface PickerModalProps {
  visible: boolean;
  data: string[];
  title: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

function PickerModal({
  visible, data, title, onSelect, onClose,
}: PickerModalProps): ReactElement {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <TouchableOpacity style={styles.modalOverlay} onPress={onClose} activeOpacity={1}>
        <View style={styles.pickerSheet}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#8E8E93" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={data}
            keyExtractor={(i: string) => i}
            renderItem={({ item }: { item: string }) => (
              <TouchableOpacity style={styles.pickerItem} onPress={() => onSelect(item)}>
                <Text style={styles.pickerItemText}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Form state type ───────────────────────────────────────────────────────────
interface FormState {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  company: string;
  state: string;
  city: string;
  street: string;
  photoUrl: string;
}

const EMPTY: FormState = {
  firstName: '', lastName: '', phone: '', email: '',
  company: '', state: '', city: '', street: '', photoUrl: '',
};

// ── Field helpers ─────────────────────────────────────────────────────────────
interface ClearXProps {
  value: string;
  onClear: () => void;
}

function ClearX({ value, onClear }: ClearXProps): ReactElement | null {
  if (!value) return null;
  return (
    <TouchableOpacity onPress={onClear}>
      <Ionicons name="close-circle" size={18} color="#C7C7CC" />
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function AddContactScreen(): ReactElement {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [saving, setSaving] = useState<boolean>(false);

  const [dobDay, setDobDay] = useState<string>('');
  const [dobMonth, setDobMonth] = useState<string>('');
  const [dobYear, setDobYear] = useState<string>('');
  const [showDay, setShowDay] = useState<boolean>(false);
  const [showMonth, setShowMonth] = useState<boolean>(false);
  const [showYear, setShowYear] = useState<boolean>(false);

  const currentYear: number = new Date().getFullYear();
  const yearList: string[] = Array.from({ length: 100 }, (_, i) => String(currentYear - i));
  const dayList: string[] = Array.from(
    { length: daysInMonth(MONTHS.indexOf(dobMonth) + 1, Number(dobYear) || currentYear) },
    (_, i) => String(i + 1),
  );
  const dobString: string = dobYear && dobMonth && dobDay
    ? `${dobYear}-${String(MONTHS.indexOf(dobMonth) + 1).padStart(2, '0')}-${dobDay.padStart(2, '0')}`
    : '';
  const age: string = calcAge(dobString);

  const set = (key: keyof FormState) => (val: string): void =>
    setForm((f) => ({ ...f, [key]: val }));

  const clearAll = (): void => {
    setForm({ ...EMPTY });
    setDobDay('');
    setDobMonth('');
    setDobYear('');
  };

  const pickPhoto = async (): Promise<void> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to add a contact photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) set('photoUrl')(result.assets[0].uri);
  };

  const handleSave = useCallback(async (): Promise<void> => {
    const firstName = form.firstName.trim().replace(/\s+/g, ' ');
    const lastName = form.lastName.trim().replace(/\s+/g, ' ');
    const nameKey = buildNameKey(firstName, lastName);

    if (!firstName) {
      Alert.alert('Required', 'Please enter a first name.');
      return;
    }

    if (!nameKey) {
      Alert.alert('Required', 'Please enter a valid contact name.');
      return;
    }

    if (!form.phone.trim() && !form.email.trim()) {
      Alert.alert('Required', 'Please enter a phone number or email.');
      return;
    }
    setSaving(true);
    try {
      // Duplicate check — phone
      if (form.phone.trim()) {
        const snap = await getDocs(
          query(collection(db, 'contacts'), where('phone', '==', form.phone.trim())),
        );
        if (!snap.empty) {
          Alert.alert('Duplicate', `Phone ${form.phone} is already saved.`);
          setSaving(false);
          return;
        }
      }

      // Duplicate check — full name (case/spacing insensitive)
      const allContactsSnap = await getDocs(collection(db, 'contacts'));
      const duplicateNameExists = allContactsSnap.docs.some((docSnap) => {
        const existing = docSnap.data() as {
          firstName?: string;
          lastName?: string;
          nameKey?: string;
        };
        const existingNameKey =
          typeof existing.nameKey === 'string' && existing.nameKey.trim()
            ? existing.nameKey
            : buildNameKey(existing.firstName ?? '', existing.lastName ?? '');
        return existingNameKey === nameKey;
      });

      if (duplicateNameExists) {
        Alert.alert(
          'Duplicate',
          `${firstName}${lastName ? ` ${lastName}` : ''} is already in your contacts.`,
        );
        setSaving(false);
        return;
      }

      await addDoc(collection(db, 'contacts'), {
        firstName,
        lastName,
        phone: form.phone.trim(),
        email: form.email.trim(),
        company: form.company.trim(),
        state: form.state.trim(),
        city: form.city.trim(),
        street: form.street.trim(),
        dob: dobString,
        photoUrl: form.photoUrl,
        nameKey,
        createdAt: serverTimestamp(),
      });
      router.back();
    } catch (e) {
      Alert.alert('Error', 'Could not save contact. Check your Firestore config.');
    } finally {
      setSaving(false);
    }
  }, [form, dobString, router]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={20} color={THEME} />
          <Text style={styles.headerBtnText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add new contact</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.headerBtn}>
          <Ionicons name="checkmark" size={26} color={saving ? '#C7C7CC' : THEME} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Avatar */}
          <TouchableOpacity style={styles.avatarWrap} onPress={pickPhoto}>
            {form.photoUrl ? (
              <Image source={{ uri: form.photoUrl }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={60} color={THEME} />
              </View>
            )}
            <View style={styles.cameraBtn}>
              <Ionicons name="camera" size={13} color="#fff" />
            </View>
          </TouchableOpacity>

          {/* ── Name Card ── */}
          <View style={styles.card}>
            {/* First Name */}
            <View style={[styles.fieldRow, styles.rowBorder]}>
              <View style={styles.iconCell}>
                <Ionicons name="person-outline" size={20} color={THEME} />
              </View>
              <View style={styles.fieldBox}>
                <Text style={styles.fieldLabel}>First Name</Text>
                <View style={styles.fieldInner}>
                  <TextInput
                    style={styles.fieldInput}
                    value={form.firstName}
                    onChangeText={set('firstName')}
                    placeholder="First Name"
                    placeholderTextColor="#B0B0B8"
                    autoCapitalize="words"
                  />
                  <ClearX value={form.firstName} onClear={() => set('firstName')('')} />
                </View>
              </View>
            </View>
            {/* Last Name */}
            <View style={styles.fieldRow}>
              <View style={styles.iconCell} />
              <View style={styles.fieldBox}>
                <Text style={styles.fieldLabel}>Last Name</Text>
                <View style={styles.fieldInner}>
                  <TextInput
                    style={styles.fieldInput}
                    value={form.lastName}
                    onChangeText={set('lastName')}
                    placeholder="Last Name"
                    placeholderTextColor="#B0B0B8"
                    autoCapitalize="words"
                  />
                  <ClearX value={form.lastName} onClear={() => set('lastName')('')} />
                </View>
              </View>
            </View>
          </View>

          {/* ── Phone Card ── */}
          <View style={styles.card}>
            <View style={styles.fieldRow}>
              <View style={styles.iconCell}>
                <Ionicons name="call-outline" size={20} color={THEME} />
              </View>
              <View style={styles.fieldBox}>
                <Text style={styles.fieldLabel}>Phone</Text>
                <View style={styles.fieldInner}>
                  <TextInput
                    style={styles.fieldInput}
                    value={form.phone}
                    onChangeText={set('phone')}
                    placeholder="+1 (000) 000-0000"
                    placeholderTextColor="#B0B0B8"
                    keyboardType="phone-pad"
                  />
                  <ClearX value={form.phone} onClear={() => set('phone')('')} />
                </View>
              </View>
            </View>
          </View>

          {/* ── Email Card ── */}
          <View style={styles.card}>
            <View style={styles.fieldRow}>
              <View style={styles.iconCell}>
                <MaterialIcons name="email" size={20} color={THEME} />
              </View>
              <View style={styles.fieldBox}>
                <Text style={styles.fieldLabel}>Email</Text>
                <View style={styles.fieldInner}>
                  <TextInput
                    style={styles.fieldInput}
                    value={form.email}
                    onChangeText={set('email')}
                    placeholder="email@example.com"
                    placeholderTextColor="#B0B0B8"
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                  <ClearX value={form.email} onClear={() => set('email')('')} />
                </View>
              </View>
            </View>
          </View>

          {/* ── Company Card ── */}
          <View style={styles.card}>
            <View style={styles.fieldRow}>
              <View style={styles.iconCell}>
                <MaterialCommunityIcons name="office-building-outline" size={20} color={THEME} />
              </View>
              <View style={styles.fieldBox}>
                <Text style={styles.fieldLabel}>Company</Text>
                <View style={styles.fieldInner}>
                  <TextInput
                    style={styles.fieldInput}
                    value={form.company}
                    onChangeText={set('company')}
                    placeholder="Company"
                    placeholderTextColor="#B0B0B8"
                    autoCapitalize="words"
                  />
                </View>
              </View>
            </View>
          </View>

          {/* ── Address Card ── */}
          <View style={styles.card}>
            <View style={[styles.fieldRow, styles.rowBorder]}>
              <View style={styles.iconCell}>
                <Ionicons name="location-outline" size={20} color={THEME} />
              </View>
              <View style={styles.fieldBox}>
                <Text style={styles.fieldLabel}>State</Text>
                <View style={styles.fieldInner}>
                  <TextInput
                    style={styles.fieldInput}
                    value={form.state}
                    onChangeText={set('state')}
                    placeholder="State"
                    placeholderTextColor="#B0B0B8"
                    autoCapitalize="words"
                  />
                </View>
              </View>
            </View>
            <View style={[styles.fieldRow, styles.rowBorder]}>
              <View style={styles.iconCell} />
              <View style={styles.fieldBox}>
                <Text style={styles.fieldLabel}>City</Text>
                <View style={styles.fieldInner}>
                  <TextInput
                    style={styles.fieldInput}
                    value={form.city}
                    onChangeText={set('city')}
                    placeholder="City"
                    placeholderTextColor="#B0B0B8"
                    autoCapitalize="words"
                  />
                </View>
              </View>
            </View>
            <View style={styles.fieldRow}>
              <View style={styles.iconCell} />
              <View style={styles.fieldBox}>
                <Text style={styles.fieldLabel}>Street</Text>
                <View style={styles.fieldInner}>
                  <TextInput
                    style={styles.fieldInput}
                    value={form.street}
                    onChangeText={set('street')}
                    placeholder="Street"
                    placeholderTextColor="#B0B0B8"
                    autoCapitalize="words"
                  />
                </View>
              </View>
            </View>
          </View>

          {/* ── DOB + Age Card ── */}
          <View style={styles.card}>
            <View style={[styles.fieldRow, styles.rowBorder]}>
              <View style={styles.iconCell}>
                <Ionicons name="calendar-outline" size={20} color={THEME} />
              </View>
              <View style={styles.fieldBox}>
                <Text style={styles.fieldLabel}>Date of Birth</Text>
                <View style={[styles.fieldInner, { gap: 6 }]}>
                  <TouchableOpacity style={styles.dobPart} onPress={() => setShowMonth(true)}>
                    <Text style={[styles.dobTxt, !dobMonth && styles.dobPh]}>{dobMonth || 'Month'}</Text>
                    <Ionicons name="chevron-down" size={13} color="#8E8E93" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dobPart} onPress={() => setShowDay(true)}>
                    <Text style={[styles.dobTxt, !dobDay && styles.dobPh]}>{dobDay || 'Day'}</Text>
                    <Ionicons name="chevron-down" size={13} color="#8E8E93" />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.dobPart, { flex: 1.4 }]} onPress={() => setShowYear(true)}>
                    <Text style={[styles.dobTxt, !dobYear && styles.dobPh]}>{dobYear || 'Year'}</Text>
                    <Ionicons name="chevron-down" size={13} color="#8E8E93" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            {/* Age */}
            <View style={styles.fieldRow}>
              <View style={styles.iconCell}>
                <FontAwesome5 name="user-clock" size={17} color={THEME} />
              </View>
              <View style={styles.fieldBox}>
                <Text style={styles.fieldLabel}>Age</Text>
                <View style={styles.fieldInner}>
                  <TextInput
                    style={[styles.fieldInput, { color: '#8E8E93' }]}
                    value={age}
                    editable={false}
                    placeholder="Auto-calculated"
                    placeholderTextColor="#B0B0B8"
                  />
                </View>
              </View>
            </View>
          </View>

          {/* Clear button */}
          <TouchableOpacity style={styles.clearBtn} onPress={clearAll}>
            <Ionicons name="trash-outline" size={18} color="#FF3B30" />
            <Text style={styles.clearBtnText}>Clear All Fields</Text>
          </TouchableOpacity>

          <View style={{ height: 50 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modals */}
      <PickerModal
        visible={showMonth}
        title="Select Month"
        data={MONTHS}
        onSelect={(v: string) => {
          setDobMonth(v);
          setShowMonth(false);
          setDobDay('');
        }}
        onClose={() => setShowMonth(false)}
      />
      <PickerModal
        visible={showDay}
        title="Select Day"
        data={dayList}
        onSelect={(v: string) => {
          setDobDay(v);
          setShowDay(false);
        }}
        onClose={() => setShowDay(false)}
      />
      <PickerModal
        visible={showYear}
        title="Select Year"
        data={yearList}
        onSelect={(v: string) => {
          setDobYear(v);
          setShowYear(false);
        }}
        onClose={() => setShowYear(false)}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#F2F2F7',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D1D1D6',
  },
  headerBtn: { flexDirection: 'row', alignItems: 'center', minWidth: 60 },
  headerBtnText: { color: '#3B4FD8', fontSize: 16 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  scroll: { paddingHorizontal: 16, paddingTop: 20 },
  avatarWrap: { alignSelf: 'center', marginBottom: 24 },
  avatarImg: { width: 90, height: 90, borderRadius: 45 },
  avatarPlaceholder: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: '#E8EAFB', alignItems: 'center', justifyContent: 'center',
  },
  cameraBtn: {
    position: 'absolute', bottom: 0, right: 0, backgroundColor: '#3B4FD8',
    borderRadius: 12, width: 24, height: 24,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#F2F2F7',
  },
  card: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, minHeight: 58 },
  iconCell: { width: 28, alignItems: 'center', marginRight: 10 },
  fieldBox: { flex: 1, paddingRight: 14, paddingVertical: 8 },
  fieldLabel: { fontSize: 11, color: '#3B4FD8', fontWeight: '600', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldInner: { flexDirection: 'row', alignItems: 'center' },
  fieldInput: { flex: 1, fontSize: 16, color: '#1C1C1E', paddingVertical: 0 },
  dobPart: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F2F2F7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7,
  },
  dobTxt: { fontSize: 14, color: '#1C1C1E', fontWeight: '500' },
  dobPh: { color: '#B0B0B8' },
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, gap: 8, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  clearBtnText: { color: '#FF3B30', fontSize: 16, fontWeight: '600' },
  // modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  pickerSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '55%', paddingBottom: 32 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA' },
  pickerTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  pickerItem: { paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F2F2F7' },
  pickerItemText: { fontSize: 16, color: '#1C1C1E' },
});
