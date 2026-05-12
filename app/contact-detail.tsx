// app/contact-detail.tsx
import React, { useState, useCallback, ReactElement } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Alert, Linking, SafeAreaView, Modal, TextInput,
  Platform, FlatList, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import {
  Ionicons, MaterialIcons,
  MaterialCommunityIcons, FontAwesome5,
} from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebaseConfig';
import type { Contact } from './(tabs)/index';

const THEME = '#3B4FD8';

// ── Date helpers ──────────────────────────────────────────────────────────────
const MONTHS: string[] = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

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

function formatDob(dob: string): string {
  if (!dob) return '';
  const d = new Date(dob + 'T00:00:00');
  if (isNaN(d.getTime())) return dob;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

function getInitials(firstName = '', lastName = ''): string {
  return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
}

// ── Picker Modal ──────────────────────────────────────────────────────────────
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
      <TouchableOpacity style={S.modalOverlay} onPress={onClose} activeOpacity={1}>
        <View style={S.pickerSheet}>
          <View style={S.pickerHeader}>
            <Text style={S.pickerTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color="#8E8E93" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={data}
            keyExtractor={(i: string) => i}
            renderItem={({ item }: { item: string }) => (
              <TouchableOpacity style={S.pickerItem} onPress={() => onSelect(item)}>
                <Text style={S.pickerItemText}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Info Row ──────────────────────────────────────────────────────────────────
interface InfoRowProps {
  label: string;
  value?: string;
  onAction?: () => void;
}

function InfoRow({ label, value, onAction }: InfoRowProps): ReactElement | null {
  if (!value) return null;
  return (
    <View style={S.infoRow}>
      <View style={S.infoContent}>
        <Text style={S.infoLabel}>{label}</Text>
        <Text style={S.infoValue}>{value}</Text>
      </View>
      {onAction && (
        <TouchableOpacity onPress={onAction} style={S.copyBtn}>
          <MaterialIcons name="content-copy" size={18} color={THEME} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── ClearX helper ─────────────────────────────────────────────────────────────
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
export default function ContactDetailScreen(): ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ data?: string | string[] }>();

  const rawData = Array.isArray(params.data) ? params.data[0] : params.data;
  let contact: Contact | null = null;

  if (rawData) {
    try {
      const parsed = JSON.parse(rawData);
      if (parsed && typeof parsed === 'object') {
        contact = parsed as Contact;
      }
    } catch {
      contact = null;
    }
  }

  if (!contact) {
    return (
      <SafeAreaView style={S.container}>
        <View style={S.header}>
          <TouchableOpacity onPress={() => router.back()} style={S.headerBtn}>
            <Ionicons name="chevron-back" size={18} color={THEME} />
            <Text style={S.headerBtnText}>Back</Text>
          </TouchableOpacity>
          <Text style={S.headerTitle}>Contact</Text>
          <View style={S.headerRight} />
        </View>

        <View style={[S.scroll, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ color: '#FF3B30', fontSize: 16 }}>Invalid contact data.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const contactId = typeof contact.id === 'string' ? contact.id.trim() : '';

  const [editMode, setEditMode] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);

  const [form, setForm] = useState({
    firstName: contact.firstName || '',
    lastName: contact.lastName || '',
    phone: contact.phone || '',
    email: contact.email || '',
    company: contact.company || '',
    state: contact.state || '',
    city: contact.city || '',
    street: contact.street || '',
    dob: contact.dob || '',
    photoUrl: contact.photoUrl || '',
  });

  // DOB picker
  const parsedDob = contact.dob ? new Date(contact.dob + 'T00:00:00') : null;
  const [dobDay, setDobDay] = useState<string>(parsedDob ? String(parsedDob.getDate()) : '');
  const [dobMonth, setDobMonth] = useState<string>(parsedDob ? MONTHS[parsedDob.getMonth()] : '');
  const [dobYear, setDobYear] = useState<string>(parsedDob ? String(parsedDob.getFullYear()) : '');
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
  const age: string = calcAge(dobString || contact.dob || '');

  const set = (key: keyof typeof form) => (val: string): void =>
    setForm((f) => ({ ...f, [key]: val }));

  const pickPhoto = async (): Promise<void> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) set('photoUrl')(result.assets[0].uri);
  };

  const handleSave = useCallback(async (): Promise<void> => {
    if (!contactId) {
      Alert.alert('Error', 'Cannot update this contact because its ID is missing.');
      return;
    }

    if (!form.firstName.trim()) {
      Alert.alert('Required', 'First name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'contacts', contactId), {
        ...form,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        company: form.company.trim(),
        state: form.state.trim(),
        city: form.city.trim(),
        street: form.street.trim(),
        dob: dobString || form.dob,
        updatedAt: serverTimestamp(),
      });
      setEditMode(false);
    } catch {
      Alert.alert('Error', 'Could not update contact.');
    } finally {
      setSaving(false);
    }
  }, [form, dobString, contactId]);

  const handleDelete = useCallback((): void => {
    if (deleting) return;

    if (!contactId) {
      Alert.alert('Error', 'Cannot delete this contact because its ID is missing.');
      return;
    }

    const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'this contact';

    Alert.alert(
      'Delete Contact',
      `Delete ${fullName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteDoc(doc(db, 'contacts', contactId));
              router.replace('/');
            } catch {
              Alert.alert('Error', 'Could not delete contact.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }, [contact.firstName, contact.lastName, contactId, deleting, router]);

  // ── VIEW MODE ──────────────────────────────────────────────────────────────
  if (!editMode) {
    return (
      <SafeAreaView style={S.container}>
        {/* Header */}
        <View style={S.header}>
          <TouchableOpacity onPress={() => router.back()} style={S.headerBtn}>
            <Ionicons name="chevron-back" size={18} color={THEME} />
            <Text style={S.headerBtnText}>Back</Text>
          </TouchableOpacity>
          <Text style={S.headerTitle}>Contact</Text>
          <View style={S.headerRight}>
            <TouchableOpacity onPress={() => setEditMode(true)} style={S.headerIconBtn}>
              <Ionicons name="pencil" size={20} color={THEME} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} style={S.headerIconBtn} disabled={deleting}>
              {deleting ? (
                <ActivityIndicator size="small" color="#FF3B30" />
              ) : (
                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={S.scroll}>
          {/* Profile */}
          <View style={S.profileSection}>
            {contact.photoUrl ? (
              <Image source={{ uri: contact.photoUrl }} style={S.profileImg} />
            ) : (
              <View style={S.profileInitials}>
                <Text style={S.profileInitialsText}>
                  {getInitials(contact.firstName, contact.lastName)}
                </Text>
              </View>
            )}
            <Text style={S.profileName}>{contact.firstName} {contact.lastName}</Text>
          </View>

          {/* Action Buttons */}
          <View style={S.actionRow}>
            <TouchableOpacity style={S.actionBtn}
              onPress={() => contact.phone && Linking.openURL(`sms:${contact.phone}`)}>
              <View style={S.actionIconBox}>
                <MaterialCommunityIcons name="message-text" size={24} color={THEME} />
              </View>
              <Text style={S.actionLabel}>Message</Text>
            </TouchableOpacity>

            <TouchableOpacity style={S.actionBtn}
              onPress={() => contact.phone && Linking.openURL(`tel:${contact.phone}`)}>
              <View style={S.actionIconBox}>
                <Ionicons name="call" size={24} color={THEME} />
              </View>
              <Text style={S.actionLabel}>Call</Text>
            </TouchableOpacity>

            <TouchableOpacity style={S.actionBtn}
              onPress={() => contact.email && Linking.openURL(`mailto:${contact.email}`)}>
              <View style={S.actionIconBox}>
                <MaterialIcons name="email" size={24} color={THEME} />
              </View>
              <Text style={S.actionLabel}>Mail</Text>
            </TouchableOpacity>
          </View>

          {/* Info Cards */}
          {contact.phone && (
            <View style={S.card}>
              <InfoRow label="Phone" value={contact.phone}
                onAction={() => Linking.openURL(`tel:${contact.phone}`)} />
            </View>
          )}
          {contact.email && (
            <View style={S.card}>
              <InfoRow label="Email" value={contact.email}
                onAction={() => Linking.openURL(`mailto:${contact.email}`)} />
            </View>
          )}
          {contact.company && (
            <View style={S.card}>
              <InfoRow label="Company" value={contact.company} />
            </View>
          )}
          {(contact.city || contact.state || contact.street) && (
            <View style={S.card}>
              <InfoRow label="City" value={contact.city} />
              <InfoRow label="State" value={contact.state} />
              <InfoRow label="Address" value={contact.street} />
            </View>
          )}
          {contact.dob && (
            <View style={S.card}>
              <InfoRow label="Date of Birth" value={formatDob(contact.dob)} />
              {calcAge(contact.dob) && (
                <InfoRow label="Age" value={`${calcAge(contact.dob)} years old`} />
              )}
            </View>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── EDIT MODE ──────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={S.container}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => setEditMode(false)} style={S.headerBtn}>
          <Ionicons name="chevron-back" size={18} color={THEME} />
          <Text style={S.headerBtnText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle}>Edit contact</Text>
        <TouchableOpacity onPress={handleSave} style={S.headerBtn} disabled={saving}>
          {saving
            ? <ActivityIndicator size="small" color={THEME} />
            : <Ionicons name="checkmark" size={26} color={THEME} />
          }
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={S.scroll} keyboardShouldPersistTaps="handled">
          {/* Avatar */}
          <TouchableOpacity style={S.avatarWrap} onPress={pickPhoto}>
            {form.photoUrl ? (
              <Image source={{ uri: form.photoUrl }} style={S.profileImg} />
            ) : (
              <View style={S.profileInitials}>
                <Text style={S.profileInitialsText}>
                  {getInitials(form.firstName, form.lastName)}
                </Text>
              </View>
            )}
            <View style={S.cameraBtn}>
              <Ionicons name="camera" size={13} color="#fff" />
            </View>
          </TouchableOpacity>

          {/* Name */}
          <View style={S.card}>
            <View style={[S.fieldRow, S.rowBorder]}>
              <View style={S.iconCell}><Ionicons name="person-outline" size={20} color={THEME} /></View>
              <View style={S.fieldBox}>
                <Text style={S.fieldLabel}>First Name</Text>
                <View style={S.fieldInner}>
                  <TextInput style={S.fieldInput} value={form.firstName}
                    onChangeText={set('firstName')} placeholder="First Name"
                    autoCapitalize="words" placeholderTextColor="#B0B0B8" />
                  <ClearX value={form.firstName} onClear={() => set('firstName')('')} />
                </View>
              </View>
            </View>
            <View style={S.fieldRow}>
              <View style={S.iconCell} />
              <View style={S.fieldBox}>
                <Text style={S.fieldLabel}>Last Name</Text>
                <View style={S.fieldInner}>
                  <TextInput style={S.fieldInput} value={form.lastName}
                    onChangeText={set('lastName')} placeholder="Last Name"
                    autoCapitalize="words" placeholderTextColor="#B0B0B8" />
                  <ClearX value={form.lastName} onClear={() => set('lastName')('')} />
                </View>
              </View>
            </View>
          </View>

          {/* Phone */}
          <View style={S.card}>
            <View style={S.fieldRow}>
              <View style={S.iconCell}><Ionicons name="call-outline" size={20} color={THEME} /></View>
              <View style={S.fieldBox}>
                <Text style={S.fieldLabel}>Phone</Text>
                <View style={S.fieldInner}>
                  <TextInput style={S.fieldInput} value={form.phone}
                    onChangeText={set('phone')} keyboardType="phone-pad"
                    placeholder="Phone" placeholderTextColor="#B0B0B8" />
                  <ClearX value={form.phone} onClear={() => set('phone')('')} />
                </View>
              </View>
            </View>
          </View>

          {/* Email */}
          <View style={S.card}>
            <View style={S.fieldRow}>
              <View style={S.iconCell}><MaterialIcons name="email" size={20} color={THEME} /></View>
              <View style={S.fieldBox}>
                <Text style={S.fieldLabel}>Email</Text>
                <View style={S.fieldInner}>
                  <TextInput style={S.fieldInput} value={form.email}
                    onChangeText={set('email')} keyboardType="email-address"
                    autoCapitalize="none" placeholder="Email" placeholderTextColor="#B0B0B8" />
                  <ClearX value={form.email} onClear={() => set('email')('')} />
                </View>
              </View>
            </View>
          </View>

          {/* Company */}
          <View style={S.card}>
            <View style={S.fieldRow}>
              <View style={S.iconCell}><MaterialCommunityIcons name="office-building-outline" size={20} color={THEME} /></View>
              <View style={S.fieldBox}>
                <Text style={S.fieldLabel}>Company</Text>
                <View style={S.fieldInner}>
                  <TextInput style={S.fieldInput} value={form.company}
                    onChangeText={set('company')} autoCapitalize="words"
                    placeholder="Company" placeholderTextColor="#B0B0B8" />
                </View>
              </View>
            </View>
          </View>

          {/* Address */}
          <View style={S.card}>
            <View style={[S.fieldRow, S.rowBorder]}>
              <View style={S.iconCell}><Ionicons name="location-outline" size={20} color={THEME} /></View>
              <View style={S.fieldBox}>
                <Text style={S.fieldLabel}>State</Text>
                <View style={S.fieldInner}>
                  <TextInput style={S.fieldInput} value={form.state}
                    onChangeText={set('state')} autoCapitalize="words" placeholder="State" placeholderTextColor="#B0B0B8" />
                </View>
              </View>
            </View>
            <View style={[S.fieldRow, S.rowBorder]}>
              <View style={S.iconCell} />
              <View style={S.fieldBox}>
                <Text style={S.fieldLabel}>City</Text>
                <View style={S.fieldInner}>
                  <TextInput style={S.fieldInput} value={form.city}
                    onChangeText={set('city')} autoCapitalize="words" placeholder="City" placeholderTextColor="#B0B0B8" />
                </View>
              </View>
            </View>
            <View style={S.fieldRow}>
              <View style={S.iconCell} />
              <View style={S.fieldBox}>
                <Text style={S.fieldLabel}>Street</Text>
                <View style={S.fieldInner}>
                  <TextInput style={S.fieldInput} value={form.street}
                    onChangeText={set('street')} autoCapitalize="words" placeholder="Street" placeholderTextColor="#B0B0B8" />
                </View>
              </View>
            </View>
          </View>

          {/* DOB + Age */}
          <View style={S.card}>
            <View style={[S.fieldRow, S.rowBorder]}>
              <View style={S.iconCell}><Ionicons name="calendar-outline" size={20} color={THEME} /></View>
              <View style={S.fieldBox}>
                <Text style={S.fieldLabel}>Date of Birth</Text>
                <View style={[S.fieldInner, { gap: 6 }]}>
                  <TouchableOpacity style={S.dobPart} onPress={() => setShowMonth(true)}>
                    <Text style={[S.dobTxt, !dobMonth && S.dobPh]}>{dobMonth || 'Month'}</Text>
                    <Ionicons name="chevron-down" size={13} color="#8E8E93" />
                  </TouchableOpacity>
                  <TouchableOpacity style={S.dobPart} onPress={() => setShowDay(true)}>
                    <Text style={[S.dobTxt, !dobDay && S.dobPh]}>{dobDay || 'Day'}</Text>
                    <Ionicons name="chevron-down" size={13} color="#8E8E93" />
                  </TouchableOpacity>
                  <TouchableOpacity style={[S.dobPart, { flex: 1.4 }]} onPress={() => setShowYear(true)}>
                    <Text style={[S.dobTxt, !dobYear && S.dobPh]}>{dobYear || 'Year'}</Text>
                    <Ionicons name="chevron-down" size={13} color="#8E8E93" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            <View style={S.fieldRow}>
              <View style={S.iconCell}><FontAwesome5 name="user-clock" size={17} color={THEME} /></View>
              <View style={S.fieldBox}>
                <Text style={S.fieldLabel}>Age</Text>
                <View style={S.fieldInner}>
                  <TextInput style={[S.fieldInput, { color: '#8E8E93' }]}
                    value={age} editable={false} placeholder="Auto-calculated" placeholderTextColor="#B0B0B8" />
                </View>
              </View>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <PickerModal visible={showMonth} title="Select Month" data={MONTHS}
        onSelect={(v: string) => { setDobMonth(v); setShowMonth(false); setDobDay(''); }}
        onClose={() => setShowMonth(false)} />
      <PickerModal visible={showDay} title="Select Day" data={dayList}
        onSelect={(v: string) => { setDobDay(v); setShowDay(false); }}
        onClose={() => setShowDay(false)} />
      <PickerModal visible={showYear} title="Select Year" data={yearList}
        onSelect={(v: string) => { setDobYear(v); setShowYear(false); }}
        onClose={() => setShowYear(false)} />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#F2F2F7',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D1D1D6',
  },
  headerBtn: { flexDirection: 'row', alignItems: 'center', minWidth: 70 },
  headerBtnText: { color: THEME, fontSize: 15 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerIconBtn: { padding: 6 },
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  profileSection: { alignItems: 'center', marginBottom: 20 },
  profileImg: { width: 90, height: 90, borderRadius: 45 },
  profileInitials: {
    width: 90, height: 90, borderRadius: 45, backgroundColor: THEME,
    alignItems: 'center', justifyContent: 'center',
  },
  profileInitialsText: { color: '#fff', fontSize: 32, fontWeight: '700' },
  profileName: { fontSize: 24, fontWeight: '700', color: '#1C1C1E', marginTop: 10 },
  actionRow: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 20 },
  actionBtn: { alignItems: 'center', gap: 6 },
  actionIconBox: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: '#E8EAFB', alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { fontSize: 12, color: THEME, fontWeight: '600' },
  card: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 12, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F2F2F7',
  },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 11, color: THEME, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  infoValue: { fontSize: 16, color: '#1C1C1E' },
  copyBtn: { padding: 6 },
  // edit
  avatarWrap: { alignSelf: 'center', marginBottom: 24 },
  cameraBtn: {
    position: 'absolute', bottom: 0, right: 0, backgroundColor: THEME,
    borderRadius: 12, width: 24, height: 24,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#F2F2F7',
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, minHeight: 58 },
  iconCell: { width: 28, alignItems: 'center', marginRight: 10 },
  fieldBox: { flex: 1, paddingRight: 14, paddingVertical: 8 },
  fieldLabel: { fontSize: 11, color: THEME, fontWeight: '600', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldInner: { flexDirection: 'row', alignItems: 'center' },
  fieldInput: { flex: 1, fontSize: 16, color: '#1C1C1E', paddingVertical: 0 },
  dobPart: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F2F2F7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7,
  },
  dobTxt: { fontSize: 14, color: '#1C1C1E', fontWeight: '500' },
  dobPh: { color: '#B0B0B8' },
  // modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  pickerSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '55%', paddingBottom: 32 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E5EA' },
  pickerTitle: { fontSize: 17, fontWeight: '700', color: '#1C1C1E' },
  pickerItem: { paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F2F2F7' },
  pickerItemText: { fontSize: 16, color: '#1C1C1E' },
});
