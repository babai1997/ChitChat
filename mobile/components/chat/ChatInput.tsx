import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  Text,
  Animated,
  Dimensions,
  Pressable,
  Keyboard,
} from "react-native";
import {
  Send,
  Plus,
  Mic,
  Image as ImageIcon,
  X,
  Smile,
  Paperclip,
  Camera,
  FileText,
  MapPin,
  Trash2,
  Headphones,
  User,
  Square,
  Pause,
} from "lucide-react-native";
import { useState, useRef, useEffect } from "react";
import * as ImagePicker from "expo-image-picker";
import { Audio } from 'expo-av';
import { EmojiKeyboard } from 'rn-emoji-keyboard';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { chatApi } from "../../src/api";
import { useSocketContext } from "../../src/contexts/SocketProvider";
import * as Crypto from 'expo-crypto';
import { useAuthStore, useChatStore } from '../../src/stores';

const { height } = Dimensions.get("window");

interface ChatInputProps {
  chatId: string;
}

export default function ChatInput({ chatId }: ChatInputProps) {
  const insets = useSafeAreaInsets();
  const [inputText, setInputText] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const bottomSheetAnim = useRef(new Animated.Value(height)).current;
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const { sendMessage, startTyping, stopTyping } = useSocketContext();

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
      setIsEmojiOpen(false);
      setIsMenuOpen(false);
    });

    return () => {
      keyboardDidShowListener.remove();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      // Emit stop so the remote typing indicator clears when navigating away
      if (isTypingRef.current) {
        isTypingRef.current = false;
        stopTyping(chatId);
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  const toggleAttachmentMenu = () => {
    if (!isMenuOpen) {
      Keyboard.dismiss();
      setIsEmojiOpen(false);
      setIsMenuOpen(true);
      Animated.spring(bottomSheetAnim, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
      }).start();
    } else {
      Animated.timing(bottomSheetAnim, {
        toValue: height,
        duration: 250,
        useNativeDriver: true,
      }).start(() => setIsMenuOpen(false));
    }
  };

  const toggleEmojiKeyboard = () => {
    if (isEmojiOpen) {
      setIsEmojiOpen(false);
    } else {
      Keyboard.dismiss();
      setIsMenuOpen(false);
      setIsEmojiOpen(true);
    }
  };

  const handleSendText = () => {
    if (!inputText.trim() || !chatId) return;
    sendMessage(chatId, inputText.trim(), "text");
    setInputText("");
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
      Alert.alert(
        "Permission Required",
        "Allow photo library access to send images.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length > 0) {
      const asset = result.assets[0];
      await uploadFile(
        asset.uri,
        asset.fileName || "image.jpg",
        asset.mimeType || "image/jpeg",
        "image",
      );
    }
  };

  const handleCameraPick = async () => {
    setIsMenuOpen(false);
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) {
      Alert.alert("Permission Required", "Allow camera access to take photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length > 0) {
      const asset = result.assets[0];
      await uploadFile(
        asset.uri,
        asset.fileName || "photo.jpg",
        asset.mimeType || "image/jpeg",
        "image",
      );
    }
  };

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status === 'granted') {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        const { recording } = await Audio.Recording.createAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY,
          (status) => {
            if (status.isRecording) {
              setRecordingDuration(Math.floor(status.durationMillis / 1000));
            }
          },
          1000 // Update every second
        );
        setRecording(recording);
        setIsRecording(true);
        setIsRecordingPaused(false);
        setRecordingDuration(0);
        recording.setOnRecordingStatusUpdate((status) => {
          if (status.isRecording) {
            setRecordingDuration(Math.floor(status.durationMillis / 1000));
          }
        });
      } else {
        Alert.alert('Permission Required', 'Allow microphone access to send voice messages.');
      }
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {});
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, [recording]);

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    setIsRecordingPaused(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      
      if (uri) {
        // Send the audio file
        await uploadFile(uri, 'voice_message.m4a', 'audio/mp4', 'audio' as any);
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
    }
  };

  const cancelRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    setIsRecordingPaused(false);

    try {
      await recording.stopAndUnloadAsync();
      setRecording(null);
    } catch (err) {
      console.error('Failed to cancel recording', err);
    }
  };

  const togglePauseRecording = async () => {
    if (!recording) return;
    try {
      if (isRecordingPaused) {
        await recording.startAsync();
        setIsRecordingPaused(false);
      } else {
        await recording.pauseAsync();
        setIsRecordingPaused(true);
      }
    } catch (err) {
      console.error('Failed to toggle pause', err);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const uploadFile = async (
    uri: string,
    filename: string,
    mimeType: string,
    msgType: "image" | "file" | "audio",
  ) => {
    // --- Optimistic UI for file uploads ---
    const tempId = Crypto.randomUUID();
    const currentUser = useAuthStore.getState().user;
    const store = useChatStore.getState();

    if (currentUser) {
      store.addMessage(chatId, {
        id: tempId,
        tempId,
        chatId,
        content: filename,
        type: msgType as any,
        senderId: currentUser.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'sending',
        isEdited: false,
        isDeleted: false,
        sender: {
          id: currentUser.id,
          displayName: currentUser.profile?.displayName || '',
          avatarUrl: currentUser.profile?.avatarUrl || null,
        },
        attachments: [{
          id: tempId,
          url: uri, // Use local URI so UI renders it immediately
          filename: filename,
          mimeType: mimeType,
          size: 0,
        }],
        replyTo: null,
      });

      store.updateChat(chatId, {
        lastMessage: {
          id: tempId,
          content: msgType === 'audio' ? 'Voice message' : filename,
          type: msgType as any,
          createdAt: new Date().toISOString(),
          senderId: currentUser.id,
          senderName: currentUser.profile?.displayName || null,
          status: 'sending',
        },
      });
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", { uri, name: filename, type: mimeType } as any);
      const response = await chatApi.uploadAttachment(chatId, formData as any);
      sendMessage(chatId, filename, msgType, undefined, [response], tempId);
    } catch (err) {
      console.error("Upload failed:", err);
      // Remove temp message if upload fails
      store.setMessages(chatId, store.messages[chatId]?.filter((m: any) => m.id !== tempId) || []);
      Alert.alert(
        "Upload Failed",
        "Could not upload the file. Please try again.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <View
      style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}
    >
      <View style={styles.inputRow}>
        <View style={styles.pillContainer}>
          {!isRecording ? (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={toggleEmojiKeyboard}
              activeOpacity={0.7}
            >
              <Smile size={24} color={isEmojiOpen ? "#00a884" : "#8696a0"} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={cancelRecording}
              activeOpacity={0.7}
            >
              <Trash2 size={24} color="#ef4444" />
            </TouchableOpacity>
          )}

          {isRecording ? (
            <View style={styles.recordingContainer}>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={togglePauseRecording}
                activeOpacity={0.7}
              >
                {isRecordingPaused ? (
                  <Mic size={24} color="#ff5252" />
                ) : (
                  <Pause size={24} color="#ff5252" />
                )}
              </TouchableOpacity>
              {!isRecordingPaused && <View style={styles.recordingPulse} />}
              <Text style={styles.recordingText}>
                {formatDuration(recordingDuration)}
              </Text>
            </View>
          ) : (
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
          )}

          {!isRecording && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={toggleAttachmentMenu}
              activeOpacity={0.7}
            >
              <Paperclip size={24} color="#8696a0" style={isMenuOpen ? { transform: [{ rotate: '-45deg' }] } : {}} />
            </TouchableOpacity>
          )}

          {!inputText.trim() && !isRecording && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleCameraPick}
              activeOpacity={0.7}
            >
              <Camera size={24} color="#8696a0" />
            </TouchableOpacity>
          )}
        </View>

        {isUploading ? (
          <View style={styles.actionCircle}>
            <ActivityIndicator size="small" color="white" />
          </View>
        ) : inputText.trim() ? (
          <TouchableOpacity
            style={styles.actionCircle}
            onPress={handleSendText}
            activeOpacity={0.8}
          >
            <Send size={20} color="white" style={{ marginLeft: 3 }} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.actionCircle}
            onPress={isRecording ? stopRecording : startRecording}
            activeOpacity={0.8}
          >
            {isRecording ? (
              <Send size={20} color="white" style={{ marginLeft: 3 }} />
            ) : (
              <Mic size={24} color="white" />
            )}
          </TouchableOpacity>
        )}
      </View>
      {isEmojiOpen && (
        <View style={{ height: 320, backgroundColor: '#202c33' }}>
          <EmojiKeyboard
            onEmojiSelected={(emojiObject) => {
              setInputText((prev) => prev + emojiObject.emoji);
            }}
            theme={{
              backdrop: '#111b2188',
              knob: '#00a884',
              container: '#202c33',
              header: '#e9edef',
              skinTonesContainer: '#2a3942',
              category: {
                icon: '#8696a0',
                iconActive: '#00a884',
                container: '#202c33',
                containerActive: '#2a3942',
              },
            }}
          />
        </View>
      )}

      {isMenuOpen && (
        <Animated.View style={[styles.inlineBottomSheet, { height: 320, transform: [{ translateY: bottomSheetAnim }] }]}>
          <View style={styles.sheetContent}>
            <View style={styles.attachmentGrid}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => setIsMenuOpen(false)}
              >
                <View style={[styles.menuIcon, { backgroundColor: "#7f66ff" }]}>
                  <FileText size={28} color="white" />
                </View>
                <Text style={styles.menuText}>Document</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleCameraPick}
              >
                <View style={[styles.menuIcon, { backgroundColor: "#ed4c67" }]}>
                  <Camera size={28} color="white" />
                </View>
                <Text style={styles.menuText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleImagePick}
              >
                <View style={[styles.menuIcon, { backgroundColor: "#b224ef" }]}>
                  <ImageIcon size={28} color="white" />
                </View>
                <Text style={styles.menuText}>Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => setIsMenuOpen(false)}
              >
                <View style={[styles.menuIcon, { backgroundColor: "#f39c12" }]}>
                  <Headphones size={28} color="white" />
                </View>
                <Text style={styles.menuText}>Audio</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => setIsMenuOpen(false)}
              >
                <View style={[styles.menuIcon, { backgroundColor: "#218c74" }]}>
                  <MapPin size={28} color="white" />
                </View>
                <Text style={styles.menuText}>Location</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => setIsMenuOpen(false)}
              >
                <View style={[styles.menuIcon, { backgroundColor: "#3498db" }]}>
                  <User size={28} color="white" />
                </View>
                <Text style={styles.menuText}>Contact</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#0b141a",
  },
  inlineBottomSheet: {
    backgroundColor: '#202c33',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a3942',
    overflow: 'hidden',
  },
  sheetContent: {
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  attachmentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 24,
  },
  menuItem: {
    alignItems: "center",
    gap: 8,
    width: "33%", // 3 items per row
  },
  menuIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  menuText: {
    color: "#e9edef",
    fontSize: 13,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4, // Adds a little extra space at the bottom to push it up
    gap: 8,
  },
  pillContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#202c33",
    borderRadius: 24,
    minHeight: 52, // Increased from 48 to make it larger
    paddingHorizontal: 6,
    paddingBottom: 6, // Increased padding
  },
  iconButton: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
    height: 40,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: "#e9edef",
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
    backgroundColor: "#00a884",
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  recordingContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    height: 40,
  },
  recordingPulse: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#ed4c67",
    marginRight: 12,
  },
  recordingText: {
    color: "#e9edef",
    fontSize: 16,
    fontWeight: "500",
  },
});
