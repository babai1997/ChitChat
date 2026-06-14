import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  Text,
} from 'react-native';
import { Send, Plus, Mic, Image as ImageIcon, X, Smile, Paperclip, Camera } from 'lucide-react-native';
import { useState, useRef } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chatApi } from '../../src/api';
import { useSocketContext } from '../../src/contexts/SocketProvider';

interface ChatInputProps {
  chatId: string;
}

export default function ChatInput({ chatId }: ChatInputProps) {
  const insets = useSafeAreaInsets();
  const [inputText, setInputText] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const { sendMessage, startTyping, stopTyping } = useSocketContext();

  const handleSendText = () => {
    if (!inputText.trim() || !chatId) return;
    sendMessage(chatId, inputText.trim(), 'text');
    setInputText('');
    handleStopTyping();
  };

  const handleStartTyping = () => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      startTyping(chatId);
    }
    // Reset the debounce timer
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(handleStopTyping, 2000);
  };

  const handleStopTyping = () => {
    if (isTypingRef.current) {
      isTypingRef.current = false;
      stopTyping(chatId);
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  };

  const handleTextChange = (text: string) => {
    setInputText(text);
    if (text.trim().length > 0) {
      handleStartTyping();
    } else {
      handleStopTyping();
    }
  };

  const handleImagePick = async () => {
    setIsMenuOpen(false);
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert('Permission Required', 'Allow photo library access to send images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length > 0) {
      const asset = result.assets[0];
      await uploadFile(asset.uri, asset.fileName || 'image.jpg', asset.mimeType || 'image/jpeg', 'image');
    }
  };


  const uploadFile = async (uri: string, filename: string, mimeType: string, msgType: 'image' | 'file') => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', { uri, name: filename, type: mimeType } as any);
      const response = await chatApi.uploadAttachment(chatId, formData as any);
      sendMessage(chatId, filename, msgType, undefined, [response]);
    } catch (err) {
      console.error('Upload failed:', err);
      Alert.alert('Upload Failed', 'Could not upload the file. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {isMenuOpen && (
        <View style={styles.attachmentMenu}>
          <TouchableOpacity style={styles.menuItem} onPress={handleImagePick}>
            <View style={[styles.menuIcon, { backgroundColor: '#f382a8' }]}>
              <ImageIcon size={24} color="white" />
            </View>
            <Text style={styles.menuText}>Gallery</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputRow}>
        <View style={styles.pillContainer}>
          <TouchableOpacity style={styles.iconButton} activeOpacity={0.7}>
            <Smile size={24} color="#8696a0" />
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            placeholder="Message"
            placeholderTextColor="#8696a0"
            value={inputText}
            onChangeText={handleTextChange}
            multiline
            editable={!isUploading}
            returnKeyType="default"
          />

          <TouchableOpacity style={styles.iconButton} onPress={() => setIsMenuOpen(!isMenuOpen)} activeOpacity={0.7}>
            <Paperclip size={22} color="#8696a0" />
          </TouchableOpacity>
          
          {!inputText.trim() && (
            <TouchableOpacity style={styles.iconButton} activeOpacity={0.7}>
              <Camera size={24} color="#8696a0" />
            </TouchableOpacity>
          )}
        </View>

        {isUploading ? (
          <View style={styles.actionCircle}>
            <ActivityIndicator size="small" color="white" />
          </View>
        ) : inputText.trim() ? (
          <TouchableOpacity style={styles.actionCircle} onPress={handleSendText} activeOpacity={0.8}>
            <Send size={20} color="white" style={{ marginLeft: 3 }} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.actionCircle} onPress={() => {}} activeOpacity={0.8}>
            <Mic size={24} color="white" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0b141a', // Transparent/Chat background
  },
  attachmentMenu: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 8,
    backgroundColor: '#202c33',
    gap: 32,
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a3942',
  },
  menuItem: {
    alignItems: 'center',
    gap: 8,
  },
  menuIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  menuText: {
    color: '#e9edef',
    fontSize: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4, // Adds a little extra space at the bottom to push it up
    gap: 8,
  },
  pillContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#202c33',
    borderRadius: 24,
    minHeight: 52, // Increased from 48 to make it larger
    paddingHorizontal: 6,
    paddingBottom: 6, // Increased padding
  },
  iconButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
    height: 40,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#e9edef',
    maxHeight: 120,
    minHeight: 40,
    paddingTop: 10,
    paddingBottom: 6, // Reduced bottom padding since pill has paddingBottom: 6
    lineHeight: 20,
  },
  actionCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#00a884',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
});
