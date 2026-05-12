// app/contactDetails.tsx
import React, { useState, useCallback, useEffect } from 'react';
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
import { doc, updateDoc, deleteDoc, serverTimestamp, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Contact } from './(tabs)/index';

const THEME = '#3B4FD8';

// ── Date helpers ──────────────────────────────────────────────────────────────
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
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

function daysInMonth(month: number, year: number) {
  return new Date(year, month, 0).getDate();
}

function getInitials(firstName = '', lastName = ''): string {
  return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
}

// ── Picker Modal ──────────────────────────────────────────────────────────────
function PickerModal({
  visible, data, title, onSelect, onClose,
}: {
  visible: boolean; data: string[]; title: string;
  onSelect: (v: string) => void; onClose: () => void;
}) {
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
            data={data} keyExtractor={(i) => i}
            renderItem={({ item }) => (
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

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────────────
function DeleteConfirmModal({
  visible,
  name,
  deleting,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  name: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel}>
      <View style={deleteModalStyles.overlay}>
        <View style={deleteModalStyles.confirmBox}>
          <View style={deleteModalStyles.confirmIconWrap}>
            <Ionicons name="trash-outline" size={30} color="#e05c5c" />
          </View>
          <Text style={deleteModalStyles.confirmTitle}>Delete Contact</Text>
          <Text style={deleteModalStyles.confirmMessage}>
            Delete <Text style={deleteModalStyles.confirmName}>{name}</Text> from your contacts?
          </Text>
          <View style={deleteModalStyles.confirmBtnRow}>
            <TouchableOpacity
              style={deleteModalStyles.confirmCancelBtn}
              onPress={onCancel}
              activeOpacity={0.7}
              disabled={deleting}
            >
              <Text style={deleteModalStyles.confirmCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[deleteModalStyles.confirmAddBtn, { backgroundColor: '#e05c5c' }]}
              onPress={onConfirm}
              activeOpacity={0.8}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={deleteModalStyles.confirmAddText}>Delete</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Info Row ──────────────────────────────────────────────────────────────────
function InfoRow({ label, value, onAction }: { label: string; value?: string; onAction?: () => void }) {
  return (
    <View style={S.infoRow}>
      <View style={S.infoContent}>
        <Text style={S.infoLabel}>{label}</Text>
        <Text style={[S.infoValue, (!value || value === 'Not provided') && { color: '#8E8E93', fontStyle: 'italic' }]}>
          {value || 'Not provided'}
        </Text>
      </View>
      {onAction && value && value !== 'Not provided' && (
        <TouchableOpacity onPress={onAction} style={S.copyBtn}>
          <MaterialIcons name="content-copy" size={18} color={THEME} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── ClearX helper ─────────────────────────────────────────────────────────────
function ClearX({ value, onClear }: { value: string; onClear: () => void }) {
  if (!value) return null;
  return (
    <TouchableOpacity onPress={onClear}>
      <Ionicons name="close-circle" size={18} color="#C7C7CC" />
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ContactDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ data: string }>();
  
  // Add error handling for missing data
  if (!params.data) {
    return (
      <SafeAreaView style={S.container}>
        <View style={S.header}>
          <TouchableOpacity onPress={() => router.back()} style={S.headerBtn}>
            <Ionicons name="chevron-back" size={18} color={THEME} />
            <Text style={S.headerBtnText}>Back</Text>
          </TouchableOpacity>
          <Text style={S.headerTitle}>Error</Text>
          <View style={S.headerRight} />
        </View>
        <View style={[S.scroll, { justifyContent: 'center', alignItems: 'center', flex: 1 }]}>
          <Text style={{ color: '#FF3B30', fontSize: 16 }}>No contact data provided</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  let initialContact: Contact;
  try {
    initialContact = JSON.parse(params.data);
    console.log('Contact loaded:', initialContact.id, initialContact.firstName);
  } catch (error) {
    console.error('Failed to parse contact data:', error);
    return (
      <SafeAreaView style={S.container}>
        <View style={S.header}>
          <TouchableOpacity onPress={() => router.back()} style={S.headerBtn}>
            <Ionicons name="chevron-back" size={18} color={THEME} />
            <Text style={S.headerBtnText}>Back</Text>
          </TouchableOpacity>
          <Text style={S.headerTitle}>Error</Text>
          <View style={S.headerRight} />
        </View>
        <View style={[S.scroll, { justifyContent: 'center', alignItems: 'center', flex: 1 }]}>
          <Text style={{ color: '#FF3B30', fontSize: 16 }}>Invalid contact data</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  // State for real-time contact data from Firestore
  const [contact, setContact] = useState<Contact>(initialContact);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  // Listen for real-time updates from Firestore
  useEffect(() => {
    if (!initialContact.id) {
      console.warn('No contact ID available');
      return;
    }
    
    console.log('Setting up Firestore listener for contact:', initialContact.id);
    const contactRef = doc(db, 'contacts', initialContact.id);
    
    const unsubscribe = onSnapshot(contactRef, (docSnap) => {
      if (docSnap.exists()) {
        const updatedContact = { id: docSnap.id, ...docSnap.data() } as Contact;
        console.log('Contact updated from Firestore:', updatedContact);
        setContact(updatedContact);
        
        // Update form if not in edit mode
        if (!editMode) {
          setForm({
            firstName: updatedContact.firstName || '',
            lastName: updatedContact.lastName || '',
            phone: updatedContact.phone || '',
            email: updatedContact.email || '',
            company: updatedContact.company || '',
            state: updatedContact.state || '',
            city: updatedContact.city || '',
            street: updatedContact.street || '',
            dob: updatedContact.dob || '',
            photoUrl: updatedContact.photoUrl || '',
          });
        }
      } else {
        console.log('Contact no longer exists in Firestore');
        // Contact was deleted, go back
        router.replace('/');
      }
    }, (error) => {
      console.error('Firestore listener error:', error);
      Alert.alert('Error', 'Failed to listen for contact updates: ' + error.message);
    });
    
    return () => {
      console.log('Cleaning up Firestore listener');
      unsubscribe();
    };
  }, [initialContact.id, editMode]);

  // Debug Firebase connection
  useEffect(() => {
    const testFirebase = async () => {
      console.log('=== FIREBASE DEBUG ===');
      console.log('Firestore db:', db ? 'Initialized' : 'Not initialized');
      console.log('Contact ID:', contact.id);
      
      if (contact.id) {
        try {
          const testRef = doc(db, 'contacts', contact.id);
          console.log('Document path:', testRef.path);
          
          // Test if document exists
          const docSnap = await getDoc(testRef);
          console.log('Document exists:', docSnap.exists());
          if (docSnap.exists()) {
            console.log('Document data:', docSnap.data());
          }
        } catch (error) {
          console.error('Firebase test error:', error);
        }
      }
    };
    
    testFirebase();
  }, [contact.id]);

  // DOB picker - update when contact changes
  const parsedDob = contact.dob ? new Date(contact.dob + 'T00:00:00') : null;
  const [dobDay, setDobDay] = useState(parsedDob ? String(parsedDob.getDate()) : '');
  const [dobMonth, setDobMonth] = useState(parsedDob ? MONTHS[parsedDob.getMonth()] : '');
  const [dobYear, setDobYear] = useState(parsedDob ? String(parsedDob.getFullYear()) : '');
  const [showDay, setShowDay] = useState(false);
  const [showMonth, setShowMonth] = useState(false);
  const [showYear, setShowYear] = useState(false);

  // Update DOB fields when contact changes
  useEffect(() => {
    if (contact.dob) {
      const date = new Date(contact.dob + 'T00:00:00');
      if (!isNaN(date.getTime())) {
        setDobDay(String(date.getDate()));
        setDobMonth(MONTHS[date.getMonth()]);
        setDobYear(String(date.getFullYear()));
      }
    } else {
      setDobDay('');
      setDobMonth('');
      setDobYear('');
    }
  }, [contact.dob]);

  const currentYear = new Date().getFullYear();
  const yearList = Array.from({ length: 100 }, (_, i) => String(currentYear - i));
  const dayList = Array.from(
    { length: daysInMonth(MONTHS.indexOf(dobMonth) + 1, Number(dobYear) || currentYear) },
    (_, i) => String(i + 1),
  );
  const dobString = dobYear && dobMonth && dobDay
    ? `${dobYear}-${String(MONTHS.indexOf(dobMonth) + 1).padStart(2, '0')}-${dobDay.padStart(2, '0')}`
    : '';
  const age = calcAge(dobString || contact.dob || '');

  const set = (key: keyof typeof form) => (val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.7,
    });
    if (!result.canceled) set('photoUrl')(result.assets[0].uri);
  };

  const handleSave = useCallback(async () => {
    if (!form.firstName.trim()) {
      Alert.alert('Required', 'First name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      const contactRef = doc(db, 'contacts', contact.id);
      await updateDoc(contactRef, {
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
      
      Alert.alert('Success', 'Contact updated successfully');
      setEditMode(false);
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert('Error', 'Could not update contact: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  }, [form, dobString, contact.id]);

  const handleDeletePress = () => {
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      console.log('=== STARTING DELETE PROCESS ===');
      console.log('Contact object:', contact);
      console.log('Contact ID:', contact.id);
      
      if (!contact.id) {
        throw new Error('Contact ID is missing or undefined');
      }
      
      // Verify Firebase is initialized
      if (!db) {
        throw new Error('Firestore is not initialized');
      }
      
      // Create document reference
      const contactRef = doc(db, 'contacts', contact.id);
      console.log('Document reference created:', contactRef.path);
      
      // Try to delete
      console.log('Attempting deletion...');
      await deleteDoc(contactRef);
      console.log('✅ Delete successful!');
      
      // Close modal and show success
      setShowDeleteConfirm(false);
      Alert.alert('Success', 'Contact deleted successfully');
      
      // Navigate back
      router.replace('/');
      
    } catch (error: any) {
      console.error('❌ Delete error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      
      let errorMessage = 'Could not delete contact.\n\n';
      
      if (error.code === 'permission-denied') {
        errorMessage += 'Permission denied. Please check your Firebase Security Rules.\n\n';
        errorMessage += 'Current rule expires on June 11, 2026. Make sure your device date is correct.';
      } else if (error.code === 'not-found') {
        errorMessage += 'Contact not found in database.';
      } else if (error.code === 'unavailable') {
        errorMessage += 'Service unavailable. Check your internet connection.';
      } else {
        errorMessage += error.message || 'Unknown error occurred';
      }
      
      Alert.alert('Error', errorMessage);
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
      console.log('=== DELETE PROCESS ENDED ===');
    }
  };

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
          <Text style={S.headerTitle}>Contact Details</Text>
          <View style={S.headerRight}>
            <TouchableOpacity onPress={() => setEditMode(true)} style={S.headerIconBtn}>
              <Ionicons name="pencil" size={20} color={THEME} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDeletePress} style={S.headerIconBtn} disabled={deleting}>
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
              onPress={() => contact.phone?.trim() ? Linking.openURL(`sms:${contact.phone}`) : Alert.alert('No phone number', 'This contact has no phone number')}>
              <View style={S.actionIconBox}>
                <MaterialCommunityIcons name="message-text" size={24} color={contact.phone?.trim() ? THEME : '#C7C7CC'} />
              </View>
              <Text style={[S.actionLabel, { color: contact.phone?.trim() ? THEME : '#C7C7CC' }]}>Message</Text>
            </TouchableOpacity>

            <TouchableOpacity style={S.actionBtn}
              onPress={() => contact.phone?.trim() ? Linking.openURL(`tel:${contact.phone}`) : Alert.alert('No phone number', 'This contact has no phone number')}>
              <View style={S.actionIconBox}>
                <Ionicons name="call" size={24} color={contact.phone?.trim() ? THEME : '#C7C7CC'} />
              </View>
              <Text style={[S.actionLabel, { color: contact.phone?.trim() ? THEME : '#C7C7CC' }]}>Call</Text>
            </TouchableOpacity>

            <TouchableOpacity style={S.actionBtn}
              onPress={() => contact.email?.trim() ? Linking.openURL(`mailto:${contact.email}`) : Alert.alert('No email address', 'This contact has no email address')}>
              <View style={S.actionIconBox}>
                <MaterialIcons name="email" size={24} color={contact.email?.trim() ? THEME : '#C7C7CC'} />
              </View>
              <Text style={[S.actionLabel, { color: contact.email?.trim() ? THEME : '#C7C7CC' }]}>Mail</Text>
            </TouchableOpacity>
          </View>

          {/* Contact Information Cards */}
          <View style={S.card}>
            <InfoRow 
              label="Phone" 
              value={contact.phone?.trim() || 'Not provided'}
              onAction={contact.phone?.trim() ? () => Linking.openURL(`tel:${contact.phone}`) : undefined}
            />
          </View>

          <View style={S.card}>
            <InfoRow 
              label="Email" 
              value={contact.email?.trim() || 'Not provided'}
              onAction={contact.email?.trim() ? () => Linking.openURL(`mailto:${contact.email}`) : undefined}
            />
          </View>

          <View style={S.card}>
            <InfoRow label="Company" value={contact.company?.trim() || 'Not provided'} />
          </View>

          <View style={S.card}>
            <InfoRow label="Street" value={contact.street?.trim() || 'Not provided'} />
            <InfoRow label="City" value={contact.city?.trim() || 'Not provided'} />
            <InfoRow label="State" value={contact.state?.trim() || 'Not provided'} />
          </View>

          <View style={S.card}>
            <InfoRow 
              label="Date of Birth" 
              value={contact.dob?.trim() ? formatDob(contact.dob) : 'Not provided'} 
            />
            {contact.dob?.trim() && calcAge(contact.dob) && (
              <InfoRow label="Age" value={`${calcAge(contact.dob)} years old`} />
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Delete Confirm Modal */}
        <DeleteConfirmModal
          visible={showDeleteConfirm}
          name={`${contact.firstName} ${contact.lastName}`}
          deleting={deleting}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={handleConfirmDelete}
        />
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
        <Text style={S.headerTitle}>Edit Contact</Text>
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
        onSelect={(v) => { setDobMonth(v); setShowMonth(false); setDobDay(''); }}
        onClose={() => setShowMonth(false)} />
      <PickerModal visible={showDay} title="Select Day" data={dayList}
        onSelect={(v) => { setDobDay(v); setShowDay(false); }}
        onClose={() => setShowDay(false)} />
      <PickerModal visible={showYear} title="Select Year" data={yearList}
        onSelect={(v) => { setDobYear(v); setShowYear(false); }}
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
  actionLabel: { fontSize: 12, fontWeight: '600' },
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

// ─── Delete Modal Styles ─────────────────────────────────────────────────────────────
const deleteModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBox: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    width: '82%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  confirmIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff5f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  confirmTitle: { fontSize: 18, fontWeight: '800', color: '#1a2340', marginBottom: 8 },
  confirmMessage: { fontSize: 14, color: '#8b9bb4', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  confirmName: { color: '#e05c5c', fontWeight: '700' },
  confirmBtnRow: { flexDirection: 'row', gap: 12, width: '100%' },
  confirmCancelBtn: {
    flex: 1,
    backgroundColor: '#f0f2fa',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  confirmCancelText: { color: '#8b9bb4', fontSize: 15, fontWeight: '700' },
  confirmAddBtn: {
    flex: 1,
    backgroundColor: '#5e3c75',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  confirmAddText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});