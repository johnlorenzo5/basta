// screens/AllContactsScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  SectionListData,
  TextInput,
  TouchableOpacity,
  Image,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { RootStackParamList } from '../_layout';

const THEME = '#3B4FD8';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// ── types ──────────────────────────────────────────────────────────────────
interface Contact {
  id: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  photoUrl?: string;
  phone?: string;
  email?: string;
  state?: string;
  city?: string;
  street?: string;
  dob?: string;
}

interface ContactSection {
  title: string;
  data: Contact[];
}

type AllContactsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

// ── helpers ──────────────────────────────────────────────────────────────────
function buildSections(contacts: Contact[]): ContactSection[] {
  const map: Record<string, Contact[]> = {};
  contacts.forEach((c) => {
    const letter = (c.lastName || c.firstName || '?')[0].toUpperCase();
    if (!map[letter]) map[letter] = [];
    map[letter].push(c);
  });
  return Object.keys(map)
    .sort()
    .map((letter) => ({ title: letter, data: map[letter] }));
}

function getInitials(firstName = '', lastName = ''): string {
  return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();
}

// ── avatar component ──────────────────────────────────────────────────────────
interface AvatarProps {
  contact: Contact;
  size?: number;
}

function Avatar({ contact, size = 44 }: AvatarProps): React.ReactElement {
  if (contact.photoUrl) {
    return (
      <Image
        source={{ uri: contact.photoUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  const initials = getInitials(contact.firstName, contact.lastName);
  const colors = ['#5B6FE8', '#7C52D4', '#4A90D9', '#3BA8A0', '#D9734A'];
  const colorIndex =
    (contact.firstName?.charCodeAt(0) || 0) % colors.length;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors[colorIndex],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.36 }}>
        {initials || '?'}
      </Text>
    </View>
  );
}

// ── contact row ───────────────────────────────────────────────────────────────
interface ContactRowProps {
  item: Contact;
  onPress: (contact: Contact) => void;
  onLongPress: (contact: Contact) => void;
}

function ContactRow({ item, onPress, onLongPress }: ContactRowProps): React.ReactElement {
  return (
    <TouchableOpacity
      style={styles.contactRow}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      activeOpacity={0.7}
    >
      <Avatar contact={item} />
      <View style={styles.contactInfo}>
        <Text style={styles.contactName}>
          {item.firstName} {item.lastName}
        </Text>
        {!!item.company && (
          <Text style={styles.contactSub}>{item.company}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ── main screen ───────────────────────────────────────────────────────────────
export default function AllContactsScreen(): React.ReactElement {
  const navigation = useNavigation<AllContactsScreenNavigationProp>();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const sectionListRef = React.useRef<SectionList<Contact>>(null);

  useEffect(() => {
    console.log('🔍 Loading contacts from Firestore...');
    const q = query(collection(db, 'contacts'));
    const unsub = onSnapshot(q, (snap) => {
      console.log('📊 Snapshot received:', snap.docs.length, 'contacts');
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Contact));
      setContacts(data);
      setLoading(false);
    }, (err) => {
      console.error('❌ Firestore error:', err);
      Alert.alert('Error', 'Firestore error: ' + err.message);
      setLoading(false);
    });
    return unsub;
  }, []);

  const filtered: Contact[] = search.trim()
    ? contacts.filter((c) => {
        const q = search.toLowerCase();
        return (
          c.firstName?.toLowerCase().includes(q) ||
          c.lastName?.toLowerCase().includes(q) ||
          c.company?.toLowerCase().includes(q) ||
          c.phone?.includes(q)
        );
      })
    : contacts;

  const sections: ContactSection[] = buildSections(filtered);

  // FIXED: Pass contact as JSON string in 'data' parameter
  const handlePress = useCallback(
    (contact: Contact) => {
      navigation.navigate('contact-detail' as never, { 
        data: JSON.stringify(contact) 
      } as never);
    },
    [navigation],
  );

  // FIXED: Same for long press
  const handleLongPress = useCallback(
    (contact: Contact) => {
      navigation.navigate('contact-detail' as never, { 
        data: JSON.stringify(contact) 
      } as never);
    },
    [navigation],
  );

  const scrollToLetter = (letter: string): void => {
    const idx = sections.findIndex((s) => s.title === letter);
    if (idx !== -1 && sectionListRef.current) {
      sectionListRef.current.scrollToLocation({ sectionIndex: idx, itemIndex: 0, animated: true });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Search bar ── */}
      <View style={styles.searchWrapper}>
        <Ionicons name="search" size={18} color="#8E8E93" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search contacts"
          placeholderTextColor="#8E8E93"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* ── Header ── */}
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>All Contacts</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={THEME} style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="people-outline" size={64} color="#C7C7CC" />
          <Text style={styles.emptyText}>
            {search ? 'No contacts found' : 'No contacts yet.\nTap + to add one.'}
          </Text>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <SectionList<Contact>
            ref={sectionListRef}
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ContactRow item={item} onPress={handlePress} onLongPress={handleLongPress} />
            )}
            renderSectionHeader={({ section: { title } }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{title}</Text>
              </View>
            )}
            stickySectionHeadersEnabled
            contentContainerStyle={{ paddingBottom: 100 }}
            onScrollToIndexFailed={() => {}}
          />

          {/* ── Alphabet index ── */}
          <View style={styles.alphabetIndex}>
            {ALPHABET.map((l) => {
              const active = sections.some((s) => s.title === l);
              return (
                <TouchableOpacity key={l} onPress={() => active && scrollToLetter(l)}>
                  <Text style={[styles.alphLetter, active && styles.alphLetterActive]}>
                    {l}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* ── FAB ── */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('add-contact' as never)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1C1C1E',
  },
  headerRow: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: THEME,
    letterSpacing: 0.3,
  },
  sectionHeader: {
    backgroundColor: '#E8EAFB',
    paddingHorizontal: 20,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME,
    marginRight: 6,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  contactInfo: {
    marginLeft: 14,
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  contactSub: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  alphabetIndex: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
  },
  alphLetter: {
    fontSize: 10,
    color: '#C7C7CC',
    paddingVertical: 1,
    paddingHorizontal: 4,
  },
  alphLetterActive: {
    color: THEME,
    fontWeight: '700',
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 24,
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: THEME,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: THEME,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
});