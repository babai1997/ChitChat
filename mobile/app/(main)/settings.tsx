
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { profileApi } from '../../src/api';
import * as ImagePicker from 'expo-image-picker';
import {
  Key,
  Lock,
  Smile,
  List,
  MessageSquare,
  Bell,
  Database,
  Globe,
  HelpCircle,
  Users,
  QrCode,
  LogOut,
  User,
  Edit3,
  Camera,
  Laptop,
} from 'lucide-react-native';

export default function SettingsScreen() {
  const { user, logout, updateProfile } = useAuthStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState(user?.profile?.displayName || '');
  const [editAbout, setEditAbout] = useState(user?.profile?.about || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const settingsItems = [
    { icon: Key, label: 'Account', subLabel: 'Security notifications, change number' },
    { icon: Laptop, label: 'Linked Devices', subLabel: 'Approve or revoke devices linked to this account', onPress: () => router.push('/linked-devices') },
    { icon: Lock, label: 'Privacy', subLabel: 'Block contacts, disappearing messages' },
    { icon: Smile, label: 'Avatar', subLabel: 'Create, edit, profile photo' },
    { icon: List, label: 'Lists', subLabel: 'Manage people and groups' },
    { icon: MessageSquare, label: 'Chats', subLabel: 'Theme, wallpapers, chat history' },
    { icon: Bell, label: 'Notifications', subLabel: 'Message, group & call tones' },
    { icon: Database, label: 'Storage and data', subLabel: 'Network usage, auto-download' },
    { icon: Globe, label: 'App language', subLabel: "English (device's language)" },
    { icon: HelpCircle, label: 'Help', subLabel: 'Help center, contact us, privacy policy' },
    { icon: Users, label: 'Invite a friend', subLabel: '' },
  ];

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => {
          logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) return;
    setIsSaving(true);
    try {
      await profileApi.updateProfile({
        displayName: editName.trim(),
        about: editAbout.trim(),
      });
      updateProfile({ displayName: editName.trim(), about: editAbout.trim() });
      setIsEditModalOpen(false);
    } catch (err) {
      Alert.alert('Error', 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarPick = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert('Permission Required', 'Allow photo library access to change your avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) return;

    setIsUploadingAvatar(true);
    try {
      const asset = result.assets[0];
      const updated = await profileApi.uploadAvatar(
        asset.uri,
        asset.fileName || 'avatar.jpg',
        asset.mimeType || 'image/jpeg',
      );
      if (updated?.avatarUrl) {
        updateProfile({ avatarUrl: updated.avatarUrl });
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to upload avatar.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          {/* Avatar with camera overlay */}
          <TouchableOpacity style={styles.avatarWrapper} onPress={handleAvatarPick} activeOpacity={0.8}>
            {user?.profile?.avatarUrl ? (
              <Image source={{ uri: user.profile.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>
                  {user?.profile?.displayName?.charAt(0)?.toUpperCase() || 'U'}
                </Text>
              </View>
            )}
            <View style={styles.cameraOverlay}>
              {isUploadingAvatar ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Camera size={14} color="white" />
              )}
            </View>
          </TouchableOpacity>

          {/* Profile info + edit */}
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.profile?.displayName || 'User'}</Text>
            <Text style={styles.profileAbout} numberOfLines={2}>
              {user?.profile?.about || 'Hey there! I am using ChitChat'}
            </Text>
          </View>

          {/* Edit button */}
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => {
              setEditName(user?.profile?.displayName || '');
              setEditAbout(user?.profile?.about || '');
              setIsEditModalOpen(true);
            }}
          >
            <Edit3 size={20} color="#00a884" />
          </TouchableOpacity>
        </View>

        {/* Settings Items */}
        <View style={styles.settingsList}>
          {settingsItems.map((item, index) => (
            <TouchableOpacity key={index} style={styles.settingsItem} activeOpacity={0.7} onPress={item.onPress}>
              <View style={styles.iconContainer}>
                <item.icon size={22} color="#8696a0" />
              </View>
              <View style={styles.itemContent}>
                <Text style={styles.itemLabel}>{item.label}</Text>
                {item.subLabel ? (
                  <Text style={styles.itemSubLabel}>{item.subLabel}</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}

          {/* Logout */}
          <TouchableOpacity style={styles.settingsItem} onPress={handleLogout} activeOpacity={0.7}>
            <View style={styles.iconContainer}>
              <LogOut size={22} color="#ef4444" />
            </View>
            <View style={[styles.itemContent, { borderBottomWidth: 0 }]}>
              <Text style={[styles.itemLabel, { color: '#ef4444' }]}>Log out</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>ChitChat v1.0.0</Text>
        </View>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={isEditModalOpen} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setIsEditModalOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Edit Profile</Text>

            <Text style={styles.fieldLabel}>Name</Text>
            <View style={styles.fieldContainer}>
              <TextInput
                style={styles.fieldInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Your name"
                placeholderTextColor="#8696a0"
                maxLength={25}
                autoFocus
              />
              <Text style={styles.charCount}>{25 - editName.length}</Text>
            </View>

            <Text style={styles.fieldLabel}>About</Text>
            <View style={styles.fieldContainer}>
              <TextInput
                style={styles.fieldInput}
                value={editAbout}
                onChangeText={setEditAbout}
                placeholder="About"
                placeholderTextColor="#8696a0"
                maxLength={139}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setIsEditModalOpen(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, (!editName.trim() || isSaving) && { opacity: 0.4 }]}
                onPress={handleSaveProfile}
                disabled={!editName.trim() || isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111b21' },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#202c33',
    borderBottomWidth: 1,
    borderBottomColor: '#2a3942',
  },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#e9edef' },
  scrollView: { flex: 1 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 8,
    borderBottomColor: '#0b141a',
  },
  avatarWrapper: { position: 'relative', marginRight: 16 },
  avatar: { width: 68, height: 68, borderRadius: 34 },
  avatarPlaceholder: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#00a884',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: 'white', fontSize: 28, fontWeight: 'bold' },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2a3942',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#111b21',
  },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '500', color: '#e9edef', marginBottom: 4 },
  profileAbout: { fontSize: 14, color: '#8696a0', lineHeight: 18 },
  editBtn: { padding: 8 },
  settingsList: { marginTop: 0 },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    backgroundColor: '#111b21',
  },
  iconContainer: { width: 28, marginRight: 20, alignItems: 'center' },
  itemContent: {
    flex: 1,
    paddingVertical: 16,
    paddingRight: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a3942',
  },
  itemLabel: { fontSize: 16, color: '#e9edef', marginBottom: 2 },
  itemSubLabel: { fontSize: 13, color: '#8696a0' },
  footer: { padding: 32, alignItems: 'center' },
  footerText: { color: '#4f6672', fontSize: 13 },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#1f2c33',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: { fontSize: 20, fontWeight: '600', color: '#e9edef', marginBottom: 24 },
  fieldLabel: { color: '#00a884', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  fieldContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: '#00a884',
    paddingBottom: 8,
    marginBottom: 24,
  },
  fieldInput: { flex: 1, color: '#e9edef', fontSize: 16 },
  charCount: { color: '#8696a0', fontSize: 12, marginLeft: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 8 },
  cancelBtn: { paddingHorizontal: 20, paddingVertical: 12 },
  cancelBtnText: { color: '#8696a0', fontSize: 15, fontWeight: '500' },
  saveBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#00a884',
    minWidth: 80,
    alignItems: 'center',
  },
  saveBtnText: { color: 'white', fontSize: 15, fontWeight: '600' },
});
