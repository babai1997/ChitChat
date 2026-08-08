import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, Camera, Check } from 'lucide-react-native';
import { useAuthStore } from '../../src/stores/authStore';
import { profileApi } from '../../src/api';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '../../src/theme/colors';

export default function SetupProfileScreen() {
  const router = useRouter();
  const { user, updateProfile } = useAuthStore();

  const [displayName, setDisplayName] = useState(user?.profile?.displayName || '');
  const [about, setAbout] = useState(user?.profile?.about || 'Hey there! I am using ChitChat');
  const [avatarUri, setAvatarUri] = useState<string | null>(user?.profile?.avatarUrl || null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const handleAvatarPick = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert('Permission Required', 'Allow photo library access to set your avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    setAvatarUri(asset.uri);
    setIsUploadingAvatar(true);

    try {
      const updated = await profileApi.uploadAvatar(
        asset.uri,
        asset.fileName || 'avatar.jpg',
        asset.mimeType || 'image/jpeg',
      );
      // Update local state with the returned URL
      if (updated?.avatarUrl) {
        setAvatarUri(updated.avatarUrl);
        updateProfile({ avatarUrl: updated.avatarUrl });
      }
    } catch (err) {
      console.error('Avatar upload failed:', err);
      Alert.alert('Upload Failed', 'Could not upload avatar. Please try again.');
      setAvatarUri(user?.profile?.avatarUrl || null);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleComplete = async () => {
    if (!displayName.trim()) return;

    setIsLoading(true);
    try {
      await profileApi.updateProfile({
        displayName: displayName.trim(),
        about: about.trim(),
      });

      updateProfile({
        displayName: displayName.trim(),
        about: about.trim(),
      });

      router.replace('/(main)');
    } catch (error) {
      console.error('Failed to setup profile:', error);
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Profile info</Text>
            <Text style={styles.subtitle}>
              Please provide your name and an optional profile photo
            </Text>
          </View>

          {/* Avatar */}
          <TouchableOpacity style={styles.avatarContainer} onPress={handleAvatarPick} activeOpacity={0.8}>
            <View style={styles.avatarPlaceholder}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatar} />
              ) : (
                <User size={56} color={COLORS.textSecondary} />
              )}
            </View>
            <View style={styles.cameraButton}>
              {isUploadingAvatar ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Camera size={20} color="white" />
              )}
            </View>
          </TouchableOpacity>

          {/* Display name */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Your name</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Enter your name"
                placeholderTextColor={COLORS.textSecondary}
                value={displayName}
                onChangeText={setDisplayName}
                maxLength={25}
                autoCapitalize="words"
              />
              <Text style={styles.charCount}>{25 - displayName.length}</Text>
            </View>
          </View>

          {/* About */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>About</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="About (optional)"
                placeholderTextColor={COLORS.textSecondary}
                value={about}
                onChangeText={setAbout}
                maxLength={139}
              />
            </View>
          </View>
        </ScrollView>

        {/* Submit button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.button,
              (!displayName.trim() || isLoading || isUploadingAvatar) && styles.buttonDisabled,
            ]}
            onPress={handleComplete}
            disabled={!displayName.trim() || isLoading || isUploadingAvatar}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <>
                <Text style={styles.buttonText}>Done</Text>
                <Check size={20} color="white" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
    width: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 40,
  },
  avatarPlaceholder: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  avatar: {
    width: 130,
    height: 130,
    resizeMode: 'cover',
  },
  cameraButton: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: COLORS.accent,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.bg,
  },
  inputGroup: {
    width: '100%',
    marginBottom: 28,
  },
  inputLabel: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.accent,
    paddingBottom: 8,
  },
  input: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 16,
    paddingVertical: 4,
  },
  charCount: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginLeft: 8,
  },
  footer: {
    padding: 24,
    alignItems: 'center',
  },
  button: {
    flexDirection: 'row',
    backgroundColor: COLORS.accent,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minWidth: 140,
    elevation: 3,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '600',
  },
});
