import { useState, useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  MoreVertical,
  Paperclip,
  Smile,
  Send,
  Mic,
  User,
  Phone,
  Video,
} from "lucide-react";
import { chatApi } from "../../api";
import { decryptMessagesInPlace } from "../../services/e2eeSessions";
import { encryptFileForUpload, type AttachmentDescriptor } from "../../services/e2eeAttachments";
import { useChatStore } from "../../stores";
import { useSocket, useHasCamera } from "../../hooks";
import { MessageBubble } from "./MessageBubble";
import { ReplyPreviewLine } from "./ReplyPreviewLine";
import { ChatViewSkeleton } from "./ChatViewSkeleton";
import { ContactInfoModal } from "./ContactInfoModal";
import { Tooltip } from "../common/Tooltip";
import { GroupInfoModal } from "./GroupInfoModal";
import { AddMemberModal } from "./AddMemberModal";
import { GroupCreatedCard } from "./GroupCreatedCard";
import { ChatGalleryModal } from "./ChatGalleryModal";
import { useCall } from "../../contexts/CallContext";
import EmojiPicker, { type EmojiClickData, Theme } from "emoji-picker-react";
import {
  Image,
  FileText,
  StopCircle,
  Trash2,
  CheckCheck,
  X,
  Pause,
  Play,
} from "lucide-react";
import type { Chat, Message } from "../../types";

interface ChatViewProps {
  chat: Chat;
  onBack: () => void;
  currentUserId: string;
  isMobile?: boolean;
}

export const ChatView = ({ chat, onBack, currentUserId, isMobile = false }: ChatViewProps) => {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isContactInfoOpen, setIsContactInfoOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(
    null,
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  // "Jump to" a quoted message (see MessageBubble's onJumpToReply) — scroll
  // it into view and flash it briefly, WhatsApp-style. Only works for a
  // message currently rendered in the DOM; a quote pointing further back
  // than what's loaded is a silent no-op rather than auto-paginating to find
  // it (matches this app's existing "Load more messages" being a manual,
  // explicit action, not something a click elsewhere should trigger).
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleJumpToReply = (messageId: string) => {
    const el = document.getElementById(`chat-message-${messageId}`);
    if (!el) {
      // Genuinely not loaded (e.g. an older item surfaced by ChatGalleryModal,
      // which fetches full history separately from what's paginated into the
      // open chat) — say so rather than silently doing nothing.
      toast("Scroll up to load that part of the conversation first");
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    setHighlightedMessageId(messageId);
    highlightTimeoutRef.current = setTimeout(() => setHighlightedMessageId(null), 1500);
  };
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

  const [editingMessage, setEditingMessage] = useState<{
    id: string;
    content: string;
  } | null>(null);

  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewType, setPreviewType] = useState<"image" | "video" | "audio" | "file" | null>(null);
  const [previewCaption, setPreviewCaption] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const {
    messages,
    setMessages,
    addMessage,
    typingUsers,
    onlineUsers,
    lastSeen,
  } = useChatStore();
  const {
    sendMessage,
    startTyping,
    stopTyping,
    joinChat,
    deleteMessage,
    editMessage,
  } = useSocket();
  const { startCall, ongoingCallsByChatId, joinOngoingCall, callStatus } = useCall();
  const hasCamera = useHasCamera();

  const chatMessages = messages[chat.id] || [];
  const typingUserIds = typingUsers[chat.id] || [];
  const isCurrentUserAdmin = chat.members.find(m => m.userId === currentUserId)?.role === 'admin';

  // Fetch messages
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["messages", chat.id],
      queryFn: ({ pageParam }) => chatApi.getMessages(chat.id, pageParam, 50),
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      initialPageParam: undefined as string | undefined,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    });

  // Update store with fetched messages
  useEffect(() => {
    if (!data?.pages) return;
    let cancelled = false;

    (async () => {
      const fetchedMessages = [...data.pages]
        .reverse()
        .flatMap((page) => page.messages);
      const currentMessages = useChatStore.getState().messages[chat.id] || [];
      const currentIds = new Set(currentMessages.map((m) => m.id));
      const missingMessages = fetchedMessages.filter(
        (m) => !currentIds.has(m.id),
      );

      // Only decrypt messages we haven't already seen — a Double Ratchet
      // message key is single-use, so re-decrypting one already resolved by
      // the real-time socket handler would throw, not just redundantly succeed.
      if (missingMessages.length > 0) {
        await decryptMessagesInPlace(missingMessages, chat.type === 'group' || chat.type === 'meeting');
      }
      if (cancelled) return;

      if (missingMessages.length > 0) {
        const mergedMessages = [...missingMessages, ...currentMessages].sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );
        setMessages(chat.id, mergedMessages);
      } else if (currentMessages.length === 0 && fetchedMessages.length > 0) {
        setMessages(chat.id, fetchedMessages);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data, chat.id, setMessages]);

  const { updateChat } = useChatStore();
  const { markAsRead } = useSocket();

  // Mark messages as read and clear unread count
  useEffect(() => {
    // Reset unread count in local store immediately
    if (chat.unreadCount > 0) {
      updateChat(chat.id, { unreadCount: 0 });
    }

    const unreadMessages = chatMessages.filter(
      (m) => m.senderId !== currentUserId && m.status !== "read",
    );

    if (unreadMessages.length > 0) {
      const ids = unreadMessages.map((m) => m.id);
      markAsRead(chat.id, ids);
    }
  }, [
    chat.id,
    chat.unreadCount,
    chatMessages,
    currentUserId,
    markAsRead,
    updateChat,
  ]);

  useEffect(() => {
    joinChat(chat.id);
    // Immediately mark the chat as read so lastReadAt is updated in DB.
    // This ensures that even before messages load, opening the chat clears
    // the unread badge on refresh. We pass an empty array so the backend
    // only updates lastReadAt without touching individual message statuses.
    markAsRead(chat.id, []);
    updateChat(chat.id, { unreadCount: 0 });
    // Note: We intentionally do NOT leave the chat room when unmounting.
  }, [chat.id, joinChat, markAsRead, updateChat]);

  // Captured before fetchNextPage() so we can restore the anchor after older
  // messages are prepended and the DOM height increases.
  const scrollAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const isInitialLoadRef = useRef(true);

  // Reset initial-load flag whenever the chat changes
  useEffect(() => {
    isInitialLoadRef.current = true;
  }, [chat.id]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || chatMessages.length === 0) return;

    // After loading older messages: restore the viewport to the same visual position
    if (scrollAnchorRef.current) {
      const { scrollHeight: prev, scrollTop } = scrollAnchorRef.current;
      container.scrollTop = scrollTop + (container.scrollHeight - prev);
      scrollAnchorRef.current = null;
      return;
    }

    // First render for this chat: jump to bottom instantly
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      container.scrollTop = container.scrollHeight;
      return;
    }

    // New message arrived: only scroll if the user is already near the bottom
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 150) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages.length]);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    startTyping(chat.id);
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping(chat.id);
    }, 2000);
  };

  const handleEditMessage = (messageId: string, currentContent: string) => {
    setEditingMessage({ id: messageId, content: currentContent });
    setReplyingTo(null);
    setMessage(currentContent);
    fileInputRef.current?.focus();
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setMessage("");
  };

  const handleReplyToMessage = (targetMessage: Message) => {
    setReplyingTo(targetMessage);
    // Replying and editing are mutually exclusive — same as the mobile app.
    setEditingMessage(null);
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  const handleDeleteMessage = (
    messageId: string,
    deleteForEveryone: boolean,
  ) => {
    deleteMessage(chat.id, messageId, deleteForEveryone);
  };

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
      if (
        attachMenuRef.current &&
        !attachMenuRef.current.contains(event.target as Node)
      ) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Recording timer — pauses along with the recorder itself, matching
  // WhatsApp's behavior of freezing the displayed duration while paused.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRecording && !isRecordingPaused) {
      interval = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, isRecordingPaused]);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessage((prev) => prev + emojiData.emoji);
  };

  const handleUploadAndSend = async (
    file: File,
    type: "image" | "video" | "audio" | "file",
    caption?: string,
  ) => {
    // `caption` is accepted but not yet wired to render anywhere — see
    // MessageBubble.tsx, which only shows `content` for `type === "text"`.
    // Pre-existing gap (not introduced by this change); flagging rather than
    // silently building full caption support here.
    void caption;

    const localAttachments = [
      {
        id: crypto.randomUUID(),
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        url: URL.createObjectURL(file),
      },
    ];

    if (chat.type === "direct" || chat.type === "group" || chat.type === "meeting") {
      // Real-time delivery for an encrypted message ONLY happens via the
      // socket path (message.handler.ts's per-device fan-out) — the REST
      // endpoint (chatApi.sendMessage) explicitly skips broadcasting
      // encrypted sends at all (see messages.service.ts's create(): the
      // 'message.created' event is gated on `!data.isEncrypted`, since
      // Phase 1 assumed every encrypted send goes through the socket,
      // which does its own explicit fan-out instead of relying on that
      // event). Sending an encrypted attachment via REST silently "worked"
      // — it just left the receiver with nothing until their next REST
      // refetch (a reload). Routing through `sendMessage()` (the same
      // socket call text messages use) fixes that: it already knows how
      // to encrypt+emit for both direct and group chats, so this file's
      // only job is to build the descriptor and hand it over as `content`,
      // exactly like a text message's plaintext.
      try {
        setIsSending(true);
        const { uploadFile, key, nonce } = await encryptFileForUpload(file);
        const uploaded = await chatApi.uploadAttachment(chat.id, uploadFile);
        const descriptor: AttachmentDescriptor = {
          attachmentUrl: uploaded.url,
          attachmentKey: key,
          attachmentNonce: nonce,
          mimeType: file.type,
          fileName: file.name,
          size: file.size,
        };
        const descriptorJson = JSON.stringify(descriptor);

        const tempId = sendMessage(chat.id, descriptorJson, type, undefined);
        if (tempId && currentUserId) {
          useChatStore.getState().addMessage(chat.id, {
            id: tempId,
            tempId,
            chatId: chat.id,
            // Matches what handleMessageSent looks up as `optimistic.content`
            // to cache under the real message id once the ack arrives.
            content: descriptorJson,
            type,
            senderId: currentUserId,
            status: "sending",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isEncrypted: true,
            attachments: localAttachments,
            sender: { id: currentUserId, displayName: "You", avatarUrl: null },
            replyTo: null,
          } as any);
        }
        setShowAttachMenu(false);
      } catch (error) {
        console.error("Failed to send encrypted attachment:", error);
      } finally {
        setIsSending(false);
      }
    }
    // `ChatType` is exactly 'direct' | 'group' | 'meeting' — every chat this
    // component can ever render matches the branch above, so there is no
    // plaintext attachment fallback here (there used to be a ~50-line dead
    // branch for it; removed rather than left to imply a real code path).
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let type: "image" | "video" | "audio" | "file" = "file";
    if (file.type.startsWith("image/")) type = "image";
    else if (file.type.startsWith("video/")) type = "video";
    else if (file.type.startsWith("audio/")) type = "audio";

    if (type === "image" || type === "video") {
      setPreviewFile(file);
      setPreviewType(type);
      setPreviewCaption("");
      setPreviewUrl(URL.createObjectURL(file));
      setShowAttachMenu(false);
    } else {
      handleUploadAndSend(file, type);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSendPreview = () => {
    if (previewFile && previewType) {
      handleUploadAndSend(previewFile, previewType, previewCaption);
    }
    cancelPreview();
  };

  const cancelPreview = () => {
    setPreviewFile(null);
    setPreviewType(null);
    setPreviewCaption("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        // Use whatever MediaRecorder actually negotiated, not a hardcoded
        // guess — browsers that don't support webm (e.g. Safari) record in
        // a different container (typically mp4/aac), and declaring the
        // wrong type here would mislabel the file without changing what's
        // actually inside it.
        const actualMimeType = recorder.mimeType || "audio/webm";
        const extension = actualMimeType.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(chunks, { type: actualMimeType });
        const file = new File([blob], `voice-message.${extension}`, {
          type: actualMimeType,
        });
        handleUploadAndSend(file, "audio");
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setIsRecordingPaused(false);
      setRecordingDuration(0);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone");
    }
  };

  const stopRecording = (cancel: boolean = false) => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      if (cancel) {
        mediaRecorder.ondataavailable = null;
        mediaRecorder.onstop = null;
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      } else {
        // A "sent while paused" recording must still flush the chunks
        // MediaRecorder already captured — stop() alone triggers onstop
        // and does that regardless of the paused state.
        mediaRecorder.stop();
      }
      setIsRecording(false);
      setIsRecordingPaused(false);
      setMediaRecorder(null);
      setRecordingDuration(0);
    }
  };

  const togglePauseRecording = () => {
    if (!mediaRecorder) return;
    if (mediaRecorder.state === "recording") {
      mediaRecorder.pause();
      setIsRecordingPaused(true);
    } else if (mediaRecorder.state === "paused") {
      mediaRecorder.resume();
      setIsRecordingPaused(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSend = () => {
    if (!message.trim() || isSending) return;
    const content = message.trim();

    if (editingMessage) {
      editMessage(chat.id, editingMessage.id, content);
      setEditingMessage(null);
      setMessage("");
      stopTyping(chat.id);
      return;
    }

    setMessage("");
    stopTyping(chat.id);
    const replyTarget = replyingTo;
    setReplyingTo(null);

    // Instant Optimistic UI using WebSockets instead of awaiting HTTP
    const tempId = sendMessage(chat.id, content, "text", replyTarget?.id);
    if (tempId && currentUserId) {
      addMessage(chat.id, {
        id: tempId,
        chatId: chat.id,
        content,
        type: "text",
        senderId: currentUserId,
        createdAt: new Date().toISOString(),
        status: "sending",
        tempId,
        // Populate the quote immediately from what we already have locally —
        // otherwise it only appears once MESSAGE_SENT round-trips back.
        replyTo: replyTarget
          ? {
              id: replyTarget.id,
              content: replyTarget.content,
              isDeleted: replyTarget.isDeleted ?? false,
              senderName: replyTarget.sender?.displayName || "Unknown",
            }
          : null,
      } as any);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getChatName = () => {
    if (chat.name) return chat.name;
    const otherMember = chat.members.find((m) => m.userId !== currentUserId);
    return otherMember?.user.profile?.displayName || "Unknown";
  };

  const getChatAvatar = () => {
    if (chat.type === "direct") {
      const otherMember = chat.members.find((m) => m.userId !== currentUserId);
      return otherMember?.user.profile?.avatarUrl || null;
    }
    return chat.avatarUrl || null;
  };

  const getTypingText = () => {
    if (typingUserIds.length === 0) return null;
    const names = typingUserIds.map((userId) => {
      const member = chat.members.find((m) => m.userId === userId);
      return member?.user.profile?.displayName || "Someone";
    });
    if (names.length === 1) return `${names[0]} is typing...`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
    return `${names.length} people are typing...`;
  };

  const getOnlineStatus = () => {
    if (chat.type === "meeting") {
      return `Meeting · ${chat.members.length} participants`;
    }
    if (chat.type === "group") {
      return `Group · ${chat.members.length} participants`;
    }
    const otherMember = chat.members.find((m) => m.userId !== currentUserId);
    if (!otherMember) return "Offline";

    // Check real-time online status from store
    if (onlineUsers.has(otherMember.userId)) {
      return "Online";
    }

    const lastSeenTime =
      lastSeen[otherMember.userId] || otherMember.user.lastSeen;
    if (lastSeenTime) {
      const date = new Date(lastSeenTime);
      if (!isNaN(date.getTime())) {
        const today = new Date();
        const isToday = date.toDateString() === today.toDateString();
        const timeStr = date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        return `Last seen ${isToday ? "today" : date.toLocaleDateString()} at ${timeStr}`;
      }
    }

    return "Offline";
  };

  // Group messages by date
  const groupMessagesByDate = (msgs: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = "";

    msgs.forEach((msg) => {
      const msgDateObj = new Date(msg.createdAt);
      if (isNaN(msgDateObj.getTime())) {
        if (
          groups.length === 0 ||
          groups[groups.length - 1].date !== "Unknown"
        ) {
          groups.push({ date: "Unknown", messages: [msg] });
        } else {
          groups[groups.length - 1].messages.push(msg);
        }
        return;
      }

      // Use ISO string (YYYY-MM-DD) for grouping to avoid locale issues
      const msgDate = msgDateObj.toISOString().split("T")[0];

      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [msg] });
      } else {
        groups[groups.length - 1].messages.push(msg);
      }
    });

    return groups;
  };

  const formatDateHeader = (dateStr: string) => {
    if (!dateStr || dateStr === "Unknown") return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return date.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  };

  const messageGroups = groupMessagesByDate(chatMessages);

  const buttonStyle = {
    padding: "8px",
    borderRadius: "50%",
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--color-text-secondary)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const getOtherMember = () => {
    return chat.members.find((m) => m.userId !== currentUserId);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div
        style={{
          padding: "10px 16px",
          backgroundColor: "var(--color-surface)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          borderBottom: "1px solid var(--color-border)",
          height: "60px",
        }}
      >
        <button
          onClick={onBack}
          style={{ ...buttonStyle, marginLeft: "-8px" }}
          className="md-hidden"
        >
          <ArrowLeft size={20} />
        </button>

        {/* Clickable Header Area */}
        <div
          onClick={() => setIsContactInfoOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flex: 1,
            cursor: "pointer",
            minWidth: 0,
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              backgroundColor: "var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {getChatAvatar() ? (
              <img
                src={getChatAvatar()!}
                alt={getChatName()}
                referrerPolicy="no-referrer"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <User size={20} color="var(--color-text-secondary)" />
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              style={{
                fontWeight: 500,
                color: "var(--color-text-primary)",
                fontSize: "16px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                margin: 0,
              }}
            >
              {getChatName()}
            </h2>
            <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {getTypingText() || getOnlineStatus()}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {chat.type !== 'meeting' && (
            <>
              <Tooltip text="No camera detected" disabled={hasCamera}>
                <button
                  style={hasCamera ? buttonStyle : { ...buttonStyle, cursor: "not-allowed", opacity: 0.4 }}
                  onClick={() => hasCamera && startCall(chat.id, "video")}
                  aria-disabled={!hasCamera}
                >
                  <Video size={20} />
                </button>
              </Tooltip>
              <button
                style={buttonStyle}
                onClick={() => startCall(chat.id, "audio")}
              >
                <Phone size={20} />
              </button>
            </>
          )}
          <div style={{ position: 'relative' }}>
            <button style={buttonStyle} onClick={() => setShowChatMenu(s => !s)}>
              <MoreVertical size={20} />
            </button>
            {showChatMenu && (
              <>
                {/* Click-outside overlay */}
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 98 }}
                  onClick={() => setShowChatMenu(false)}
                />
                <div style={{
                  position: 'absolute', top: '40px', right: 0, zIndex: 99,
                  backgroundColor: 'var(--color-surface-hover)', borderRadius: '8px',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
                  minWidth: '180px', overflow: 'hidden',
                }}>
                  {(chat.type === 'group' || chat.type === 'meeting') && (
                    <button
                      onClick={() => { setIsContactInfoOpen(true); setShowChatMenu(false); }}
                      style={{ display: 'block', width: '100%', padding: '12px 16px', backgroundColor: 'transparent', border: 'none', color: 'var(--color-text-primary)', fontSize: '14px', textAlign: 'left', cursor: 'pointer' }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-border)'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {chat.type === 'meeting' ? 'Meeting Info' : 'Group Info'}
                    </button>
                  )}
                  {(chat.type === 'group' || chat.type === 'meeting') && isCurrentUserAdmin && (
                    <button
                      onClick={() => { setShowAddMember(true); setShowChatMenu(false); }}
                      style={{ display: 'block', width: '100%', padding: '12px 16px', backgroundColor: 'transparent', border: 'none', color: 'var(--color-text-primary)', fontSize: '14px', textAlign: 'left', cursor: 'pointer' }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-border)'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      Add Member
                    </button>
                  )}
                  {chat.type === 'direct' && (
                    <button
                      onClick={() => { setIsContactInfoOpen(true); setShowChatMenu(false); }}
                      style={{ display: 'block', width: '100%', padding: '12px 16px', backgroundColor: 'transparent', border: 'none', color: 'var(--color-text-primary)', fontSize: '14px', textAlign: 'left', cursor: 'pointer' }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-border)'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      Contact Info
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Ongoing call banner */}
      {(() => {
        if (chat.type === 'meeting') return null;
        const ongoing = ongoingCallsByChatId.get(chat.id);
        if (!ongoing || callStatus !== 'idle') return null;
        return (
          <div
            onClick={() => joinOngoingCall(chat.id, ongoing.type)}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              backgroundColor: 'var(--color-accent)', padding: '10px 16px', cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              backgroundColor: 'rgba(0,0,0,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {ongoing.type === 'video' ? <Video size={16} color="var(--color-white)" /> : <Phone size={16} color="var(--color-white)" />}
            </div>
            <div>
              <div style={{ color: 'var(--color-white)', fontWeight: 600, fontSize: '13px' }}>
                {ongoing.type === 'video' ? 'Ongoing video call' : 'Ongoing voice call'}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '12px' }}>
                {ongoing.participantCount} participant{ongoing.participantCount !== 1 ? 's' : ''} · Tap to join
              </div>
            </div>
          </div>
        );
      })()}

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="chat-bg"
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: isMobile ? "8px 8px" : "16px 32px",
        }}
      >
        {isLoading ? (
          <ChatViewSkeleton />
        ) : (
          <>
            {hasNextPage && (
              <div style={{ textAlign: "center", marginBottom: "16px" }}>
                <button
                  onClick={() => {
                    const container = messagesContainerRef.current;
                    if (container) {
                      scrollAnchorRef.current = {
                        scrollHeight: container.scrollHeight,
                        scrollTop: container.scrollTop,
                      };
                    }
                    fetchNextPage();
                  }}
                  disabled={isFetchingNextPage}
                  style={{
                    color: "var(--color-accent-secondary)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  {isFetchingNextPage ? "Loading..." : "Load more messages"}
                </button>
              </div>
            )}

            {!hasNextPage && chat.type === 'group' && (
              <GroupCreatedCard
                chat={chat}
                currentUserId={currentUserId}
                onAddMember={() => setShowAddMember(true)}
              />
            )}

            {messageGroups.map((group) => (
              <div key={group.date}>
                {/* Date Header */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    margin: "16px 0",
                  }}
                >
                  <span
                    style={{
                      padding: "6px 12px",
                      backgroundColor: "var(--color-surface-elevated)",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "var(--color-text-secondary)",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                    }}
                  >
                    {formatDateHeader(group.date)}
                  </span>
                </div>

                {/* Messages */}
                {group.messages.map((msg, index) => {
                  const prevMsg = index > 0 ? group.messages[index - 1] : null;
                  const showSender =
                    (chat.type === "group" || chat.type === "meeting") &&
                    msg.senderId !== currentUserId &&
                    (!prevMsg || prevMsg.senderId !== msg.senderId);

                  return (
                    <MessageBubble
                      key={(msg as any).tempId || msg.id}
                      message={msg}
                      isOwn={msg.senderId === currentUserId}
                      showSender={showSender}
                      onEdit={handleEditMessage}
                      onDelete={handleDeleteMessage}
                      onReply={handleReplyToMessage}
                      isHighlighted={msg.id === highlightedMessageId}
                      onJumpToReply={handleJumpToReply}
                    />
                  );
                })}
              </div>
            ))}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div
        style={{
          padding: "8px 16px",
          backgroundColor: "var(--color-surface)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          borderTop: "1px solid var(--color-border)",
          position: "relative",
          flexDirection: "column",
        }}
      >
        {editingMessage && (
          <div
            style={{
              width: "100%",
              padding: "8px 12px",
              backgroundColor: "var(--color-surface-elevated)",
              borderLeft: "4px solid var(--color-accent)",
              borderRadius: "4px",
              marginBottom: "4px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <p
                style={{
                  color: "var(--color-accent)",
                  fontSize: "12px",
                  fontWeight: 500,
                  margin: 0,
                }}
              >
                Editing Message
              </p>
              <p
                style={{
                  color: "var(--color-text-secondary)",
                  fontSize: "12px",
                  margin: 0,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "300px",
                }}
              >
                {editingMessage.content}
              </p>
            </div>
            <button
              onClick={handleCancelEdit}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {replyingTo && !editingMessage && (
          <div
            style={{
              width: "100%",
              padding: "8px 12px",
              backgroundColor: "var(--color-surface-elevated)",
              borderLeft: "4px solid var(--color-accent-hover)",
              borderRadius: "4px",
              marginBottom: "4px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <p
                style={{
                  color: "var(--color-accent-hover)",
                  fontSize: "12px",
                  fontWeight: 500,
                  margin: 0,
                }}
              >
                Replying to {replyingTo.senderId === currentUserId ? "yourself" : replyingTo.sender?.displayName || "Unknown"}
              </p>
              <ReplyPreviewLine
                chatId={chat.id}
                replyTo={{
                  id: replyingTo.id,
                  content: replyingTo.content,
                  type: replyingTo.type,
                  isDeleted: replyingTo.isDeleted ?? false,
                  senderName: replyingTo.sender?.displayName || "Unknown",
                }}
                maxWidth={300}
              />
            </div>
            <button
              onClick={handleCancelReply}
              style={{
                background: "none",
                border: "none",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            width: "100%",
          }}
        >
          {/* Emoji Picker */}
          {showEmojiPicker && (
            <div
              ref={emojiPickerRef}
              style={{
                position: "absolute",
                bottom: "70px",
                left: "20px",
                zIndex: 10,
              }}
            >
              <EmojiPicker
                onEmojiClick={handleEmojiClick}
                theme={Theme.DARK}
                lazyLoadEmojis={true}
              />
            </div>
          )}

          {/* Attachment Menu */}
          {showAttachMenu && (
            <div
              ref={attachMenuRef}
              style={{
                position: "absolute",
                bottom: "70px",
                left: "60px",
                zIndex: 10,
                backgroundColor: "var(--color-surface-hover)",
                borderRadius: "8px",
                padding: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
              }}
            >
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  ...buttonStyle,
                  borderRadius: "8px",
                  justifyContent: "flex-start",
                  gap: "8px",
                  width: "100%",
                }}
              >
                <Image size={20} color="var(--color-info)" /> Photos & Videos
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  ...buttonStyle,
                  borderRadius: "8px",
                  justifyContent: "flex-start",
                  gap: "8px",
                  width: "100%",
                }}
              >
                <FileText size={20} color="var(--color-accent)" /> Document
              </button>
            </div>
          )}

          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={handleFileSelect}
          />

          {isRecording ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: "12px",
                color: "var(--color-text-primary)",
              }}
            >
              <span
                style={{
                  color: "var(--color-danger)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    backgroundColor: "var(--color-danger)",
                    animation: isRecordingPaused ? "none" : "pulse 1s infinite",
                    opacity: isRecordingPaused ? 0.5 : 1,
                  }}
                />
                {formatDuration(recordingDuration)}
              </span>
              <span style={{ flex: 1, color: "var(--color-text-secondary)", fontSize: "14px" }}>
                {isRecordingPaused ? "Paused" : "Recording..."}
              </span>
              <button
                onClick={() => stopRecording(true)}
                style={{
                  color: "var(--color-danger)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <Trash2 size={24} />
              </button>
              <button
                onClick={togglePauseRecording}
                style={{
                  color: "var(--color-text-secondary)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {isRecordingPaused ? <Play size={24} /> : <Pause size={24} />}
              </button>
              <button
                onClick={() => stopRecording(false)}
                style={{
                  color: "var(--color-accent-secondary)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <StopCircle size={24} />
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                style={{
                  ...buttonStyle,
                  color: showEmojiPicker ? "var(--color-accent-secondary)" : "var(--color-text-secondary)",
                }}
              >
                <Smile size={24} />
              </button>
              <button
                onClick={() => setShowAttachMenu(!showAttachMenu)}
                style={{
                  ...buttonStyle,
                  color: showAttachMenu ? "var(--color-accent-secondary)" : "var(--color-text-secondary)",
                }}
                disabled={!!editingMessage}
              >
                <Paperclip
                  size={24}
                  style={{ opacity: editingMessage ? 0.5 : 1 }}
                />
              </button>

              <input
                type="text"
                value={message}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder={
                  editingMessage ? "Edit message..." : "Type a message"
                }
                style={{
                  flex: 1,
                  backgroundColor: "var(--color-border)",
                  border: "none",
                  borderRadius: "8px",
                  padding: "10px 16px",
                  color: "var(--color-text-primary)",
                  fontSize: "15px",
                  outline: "none",
                  height: "42px",
                }}
              />

              <button
                onClick={message.trim() ? handleSend : startRecording}
                disabled={isSending || (!!editingMessage && !message.trim())}
                style={{
                  minWidth: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  backgroundColor:
                    message.trim() || isRecording ? "var(--color-accent-secondary)" : "var(--color-border)", // Changing this logic to show green only for send
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "none",
                  cursor: "pointer",
                  transition: "background-color 0.2s ease",
                  color: message.trim() ? "white" : "var(--color-text-secondary)",
                }}
              >
                {message.trim() ? (
                  editingMessage ? (
                    <CheckCheck size={20} />
                  ) : (
                    <Send size={20} />
                  )
                ) : (
                  <Mic size={20} />
                )}
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`
        @media (min-width: 1024px) {
          .md-hidden {
            display: none !important;
          }
        }
      `}</style>

      {/* Preview Modal for Images/Videos */}
      {previewFile && previewUrl && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(13, 11, 22,0.85)",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column"
        }}>
          {/* Header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            padding: "16px 24px",
            backgroundColor: "rgba(0,0,0,0.3)"
          }}>
            <button
              onClick={cancelPreview}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-white)" }}
            >
              <X size={28} />
            </button>
            <span style={{ color: "white", fontSize: "18px", marginLeft: "24px" }}>
              Preview
            </span>
          </div>
          
          {/* Content */}
          <div style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            overflow: "hidden"
          }}>
            {previewType === "image" ? (
              <img src={previewUrl} alt="Preview" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
            ) : previewType === "video" ? (
              <video src={previewUrl} controls style={{ maxWidth: "100%", maxHeight: "100%" }} />
            ) : null}
          </div>

          {/* Footer (Caption Input & Send) */}
          <div style={{
            padding: "16px 24px",
            backgroundColor: "var(--color-surface)",
            display: "flex",
            alignItems: "center",
            gap: "16px"
          }}>
            <input
              type="text"
              placeholder="Add a caption..."
              value={previewCaption}
              onChange={(e) => setPreviewCaption(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") handleSendPreview();
              }}
              style={{
                flex: 1,
                backgroundColor: "var(--color-border)",
                border: "none",
                borderRadius: "8px",
                padding: "12px 16px",
                color: "var(--color-text-primary)",
                fontSize: "15px",
                outline: "none"
              }}
              autoFocus
            />
            <button
              onClick={handleSendPreview}
              disabled={isSending}
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: "var(--color-accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                cursor: "pointer",
                color: "white"
              }}
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Contact Info Modal */}
      {chat.type === "direct" && getOtherMember() && (
        <ContactInfoModal
          isOpen={isContactInfoOpen}
          onClose={() => setIsContactInfoOpen(false)}
          user={{
            id: getOtherMember()!.userId,
            displayName:
              getOtherMember()!.user.profile?.displayName || "Unknown",
            avatarUrl: getOtherMember()!.user.profile?.avatarUrl || null,
            about: getOtherMember()!.user.profile?.about || null,
            phone: getOtherMember()!.user.phone,
            email: getOtherMember()!.user.email,
          }}
          onOpenGallery={() => { setIsContactInfoOpen(false); setIsGalleryOpen(true); }}
        />
      )}

      {/* Group/Meeting Info Modal */}
      {(chat.type === "group" || chat.type === "meeting") && (
        <GroupInfoModal
          isOpen={isContactInfoOpen}
          onClose={() => setIsContactInfoOpen(false)}
          chat={chat}
          currentUserId={currentUserId}
          onAddMember={() => { setIsContactInfoOpen(false); setShowAddMember(true); }}
          onOpenGallery={() => { setIsContactInfoOpen(false); setIsGalleryOpen(true); }}
        />
      )}

      {/* Add Member Modal */}
      {(chat.type === "group" || chat.type === "meeting") && (
        <AddMemberModal
          isOpen={showAddMember}
          onClose={() => setShowAddMember(false)}
          chat={chat}
          currentUserId={currentUserId}
        />
      )}

      {/* Media, links and docs */}
      <ChatGalleryModal
        chat={chat}
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        onJumpToMessage={(messageId) => {
          setIsGalleryOpen(false);
          // Let the modal's own close transition/unmount finish before the
          // target bubble's DOM node needs to exist for scrollIntoView.
          setTimeout(() => handleJumpToReply(messageId), 50);
        }}
      />
    </div>
  );
};
