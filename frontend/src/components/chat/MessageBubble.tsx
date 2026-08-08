import { useState, useRef, useEffect, useCallback } from "react";
import {
  Check,
  CheckCheck,
  Clock,
  FileText,
  Pencil,
  Trash2,
  Ban,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Video,
  X,
  Forward,
  Download,
  ZoomIn,
  ZoomOut,
  Reply,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Message } from "../../types";
import { chatApi } from "../../api";
import { useChatStore, useAuthStore } from "../../stores";
import { EncryptedAttachment } from "./EncryptedAttachment";
import { ReplyPreviewLine } from "./ReplyPreviewLine";
import { isE2eePlaceholder, PLACEHOLDER_APPROVE_DEVICE } from "../../services/e2eeSessions";

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showSender?: boolean;
  onEdit?: (messageId: string, currentContent: string) => void;
  onDelete?: (messageId: string, deleteForEveryone: boolean) => void;
  onReply?: (message: Message) => void;
  /** Briefly flashed when this message is the target of a "jump to" (see onJumpToReply). */
  isHighlighted?: boolean;
  /** Clicking this message's own reply-quote asks the parent to scroll to and highlight the quoted message. */
  onJumpToReply?: (messageId: string) => void;
}

export const MessageBubble = ({
  message,
  isOwn,
  showSender,
  onEdit,
  onDelete,
  onReply,
  isHighlighted,
  onJumpToReply,
}: MessageBubbleProps) => {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [showForward, setShowForward] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const { chats } = useChatStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  // Reset zoom every time a different image is opened (or the viewer closes).
  useEffect(() => {
    setImageZoom(1);
  }, [selectedImage]);

  const IMAGE_ZOOM_MIN = 0.5;
  const IMAGE_ZOOM_MAX = 4;
  const zoomImageIn = useCallback(
    () => setImageZoom((z) => Math.min(IMAGE_ZOOM_MAX, Math.round((z + 0.5) * 100) / 100)),
    []
  );
  const zoomImageOut = useCallback(
    () => setImageZoom((z) => Math.max(IMAGE_ZOOM_MIN, Math.round((z - 0.5) * 100) / 100)),
    []
  );
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // React's onWheel prop is attached as a passive listener, so e.preventDefault()
  // inside it silently fails — the browser's native ctrl+wheel zoom would still
  // fire alongside ours. A native, non-passive listener is the only reliable fix.
  useEffect(() => {
    const el = imageContainerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomImageIn();
      else zoomImageOut();
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [selectedImage, zoomImageIn, zoomImageOut]);

  const handleDownload = async () => {
    if (!selectedImage) return;
    try {
      const response = await fetch(selectedImage);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const filename = selectedImage.split("/").pop() || "download.jpg";
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(blobUrl);
      document.body.removeChild(a);
    } catch (e) {
      console.error("Failed to download image", e);
    }
  };

  const handleForward = async (chatId: string) => {
    try {
      const attachment = message.attachments?.[0];
      if (!attachment) return;

      await chatApi.sendMessage(
        chatId,
        message.content ?? '',
        message.type,
        undefined,
        [
          {
            filename: attachment.filename,
            url: attachment.url,
            mimeType: attachment.mimeType,
            size: attachment.size,
          },
        ]
      );
      setShowForward(false);
      setSelectedImage(null);
    } catch (error) {
      console.error("Forward failed", error);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const [showClock, setShowClock] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (message.status === "sending") {
      // WhatsApp delays the clock icon so it doesn't flash on fast networks
      timer = setTimeout(() => setShowClock(true), 300);
    }
    return () => clearTimeout(timer);
  }, [message.status]);

  const getStatusIcon = () => {
    let icon = null;
    switch (message.status) {
      case "sending":
        icon = (
          <Clock
            size={14}
            color="#8696a0"
            style={{ opacity: showClock ? 1 : 0, transition: "opacity 0.2s" }}
          />
        );
        break;
      case "sent":
        icon = <Check size={14} color="#8696a0" />;
        break;
      case "delivered":
        icon = <CheckCheck size={14} color="#8696a0" />;
        break;
      case "read":
        icon = <CheckCheck size={14} color="#53bdeb" />;
        break;
    }

    return (
      <div
        style={{
          width: "16px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {icon}
      </div>
    );
  };

  // Handle right-click / long-press for context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = bubbleRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
    setShowContextMenu(true);
  };

  // Handle touch for mobile (long press)
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchTimerRef.current = setTimeout(() => {
      const touch = e.touches[0];
      const rect = bubbleRef.current?.getBoundingClientRect();
      if (rect) {
        setMenuPosition({
          x: touch.clientX - rect.left,
          y: touch.clientY - rect.top,
        });
      }
      setShowContextMenu(true);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
    }
  };

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowContextMenu(false);
      }
    };

    if (showContextMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showContextMenu]);

  const handleReply = () => {
    if (onReply) {
      onReply(message);
    }
    setShowContextMenu(false);
  };

  const handleEdit = () => {
    if (onEdit && message.type === "text") {
      onEdit(message.id, message.content ?? "");
    }
    setShowContextMenu(false);
  };

  const handleDeleteForMe = () => {
    if (onDelete) {
      onDelete(message.id, false);
    }
    setShowContextMenu(false);
  };

  const handleDeleteForEveryone = () => {
    if (onDelete) {
      onDelete(message.id, true);
    }
    setShowContextMenu(false);
  };

  // A device-side E2EE limitation, not something anyone actually typed and
  // sent — rendering it as a normal left/right bubble (with the sender's
  // tick marks/timestamp) reads as a real chat message, which is actively
  // misleading. Render as a centered, muted system-style notice instead,
  // matching how WhatsApp-style apps surface this kind of app-level notice.
  if (message.isEncrypted && isE2eePlaceholder(message.content)) {
    const isApprovalPrompt = message.content === PLACEHOLDER_APPROVE_DEVICE;
    return (
      <div style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}>
        <div
          onClick={isApprovalPrompt ? () => navigate("/settings/linked-devices") : undefined}
          style={{
            maxWidth: "80%",
            padding: "6px 14px",
            backgroundColor: "#182229",
            borderRadius: "8px",
            cursor: isApprovalPrompt ? "pointer" : "default",
          }}
        >
          <span
            style={{
              display: "block",
              fontSize: "12.5px",
              fontStyle: "italic",
              color: "#8696a0",
              textAlign: "center",
              textDecoration: isApprovalPrompt ? "underline" : "none",
            }}
          >
            {message.content}
          </span>
        </div>
      </div>
    );
  }

  // If message is deleted, show special UI
  if (message.isDeleted) {
    return (
      <div
        className="animate-slide-up"
        style={{
          display: "flex",
          justifyContent: isOwn ? "flex-end" : "flex-start",
          marginBottom: "4px",
        }}
      >
        <div
          style={{
            maxWidth: "85%",
            padding: "6px 12px 8px 12px",
            backgroundColor: isOwn ? "#005c4b" : "#202c33",
            borderRadius: isOwn ? "8px 8px 0 8px" : "8px 8px 8px 0",
            boxShadow: "0 1px 0.5px rgba(11,20,26,.13)",
            opacity: 0.6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Ban size={14} color="#8696a0" />
            <span
              style={{
                fontSize: "14px",
                fontStyle: "italic",
                color: "#8696a0",
              }}
            >
              This message was deleted
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Call log — render as WhatsApp-style pill (no context menu, not editable)
  if (message.type === "missed_call" || message.type === "call_log") {
    type CallPayload = { status: "ended" | "missed" | "rejected"; duration: number; isVideo: boolean };
    let call: CallPayload | null = null;
    try {
      const parsed = JSON.parse(message.content ?? "");
      if (parsed && typeof parsed === "object" && "status" in parsed) call = parsed as CallPayload;
    } catch { /* plain-text fallback */ }

    const isVideo  = call ? call.isVideo : (message.content?.toLowerCase().includes("video") ?? false);
    const ended    = call?.status === "ended";
    const rejected = call?.status === "rejected";
    // isOwn = the person who placed the call (initiator wrote the log)

    // ── Title ──
    const title = ended || rejected
      ? isVideo ? "Video Call" : "Voice Call"
      : isOwn
        ? isVideo ? "Video Call" : "Voice Call"          // outgoing, not answered
        : isVideo ? "Missed Video Call" : "Missed Voice Call"; // incoming, missed

    // ── Subtitle ──
    const formatDuration = (s: number) => {
      if (s < 60)   return `${s}s`;
      if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
      return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    };
    const duration  = ended && call && call.duration > 0 ? formatDuration(call.duration) : null;
    const subtitle  = duration ?? (rejected ? "Call declined" : "No answer");

    // ── Icon ──
    // ended   → green  | outgoing arrow (own) or incoming arrow (theirs)
    // outgoing missed → neutral white | outgoing arrow
    // incoming missed → red           | incoming arrow
    let iconColor: string;
    let iconBg: string;
    let AudioIcon: typeof Phone;

    if (ended) {
      iconColor = "#25d366";
      iconBg    = "rgba(37,211,102,0.12)";
      AudioIcon = isOwn ? PhoneOutgoing : PhoneIncoming;
    } else if (isOwn) {
      iconColor = "rgba(233,237,239,0.65)";
      iconBg    = "rgba(255,255,255,0.07)";
      AudioIcon = PhoneOutgoing;
    } else {
      iconColor = "#ea4335";
      iconBg    = "rgba(234,67,53,0.12)";
      AudioIcon = PhoneIncoming;
    }

    return (
      <div className="animate-slide-up" style={{ display: "flex", justifyContent: isOwn ? "flex-end" : "flex-start", marginBottom: "4px" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: "10px",
          padding: "8px 14px 8px 10px",
          backgroundColor: isOwn ? "#005c4b" : "#202c33",
          borderRadius: isOwn ? "8px 8px 0 8px" : "8px 8px 8px 0",
          boxShadow: "0 1px 0.5px rgba(11,20,26,.13)",
          maxWidth: "280px",
        }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "50%",
            backgroundColor: iconBg, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {isVideo
              ? <Video size={17} color={iconColor} />
              : <AudioIcon size={17} color={iconColor} />}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
            <span style={{ fontSize: "14px", fontWeight: 500, color: "#e9edef", lineHeight: "18px" }}>
              {title}
            </span>
            <span style={{ fontSize: "11px", color: "rgba(233,237,239,0.5)" }}>
              {subtitle} · {formatTime(message.createdAt)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      id={`chat-message-${message.id}`}
      className="animate-slide-up"
      style={{
        display: "flex",
        justifyContent: isOwn ? "flex-end" : "flex-start",
        marginBottom: "4px",
        position: "relative",
      }}
    >
      <div
        ref={bubbleRef}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
        style={{
          maxWidth: "85%",
          padding: "6px 7px 8px 9px",
          backgroundColor: isHighlighted
            ? "rgba(6,207,156,0.35)"
            : isOwn
              ? "#005c4b"
              : "#202c33",
          borderRadius: isOwn ? "8px 8px 0 8px" : "8px 8px 8px 0",
          boxShadow: "0 1px 0.5px rgba(11,20,26,.13)",
          position: "relative",
          cursor: "pointer",
          transition: "background-color 0.4s ease",
        }}
      >
        {/* Sender name for group chats */}
        {showSender && message.sender && (
          <p
            style={{
              fontSize: "12px",
              fontWeight: 500,
              color: "#f382a8",
              marginBottom: "4px",
              lineHeight: "14px",
            }}
          >
            {message.sender.displayName || "Unknown"}
          </p>
        )}

        {/* Quoted preview of the message being replied to — click jumps to it, like WhatsApp */}
        {message.replyTo && (
          <div
            onClick={(e) => {
              e.stopPropagation(); // don't also trigger the bubble's own context-menu/select handlers
              if (!message.replyTo!.isDeleted) onJumpToReply?.(message.replyTo!.id);
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "6px 8px",
              marginBottom: "4px",
              borderLeft: "3px solid #06cf9c",
              backgroundColor: "rgba(255,255,255,0.06)",
              borderRadius: "4px",
              cursor: message.replyTo.isDeleted ? "default" : "pointer",
            }}
          >
            <span style={{ fontSize: "12.5px", fontWeight: 600, color: "#06cf9c" }}>
              {message.replyTo.senderName}
            </span>
            <ReplyPreviewLine chatId={message.chatId} replyTo={message.replyTo} />
          </div>
        )}

        {/* Encrypted attachment — no plaintext Attachment row exists for
            these (see ChatView.tsx's handleUploadAndSend); the real file
            lives only inside the encrypted descriptor in `content`. */}
        {message.isEncrypted &&
          (!message.attachments || message.attachments.length === 0) &&
          ["image", "video", "audio", "file"].includes(message.type) && (
            <div style={{ marginBottom: "4px" }}>
              <EncryptedAttachment
                message={message}
                isOwn={isOwn}
                onImageClick={(url) => setSelectedImage(url)}
              />
            </div>
          )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div
            style={{
              marginBottom: "4px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            {message.attachments.map((att) => {
              if (message.type === "image") {
                return (
                  <img
                    key={att.id}
                    src={att.url}
                    alt={att.filename}
                    style={{
                      borderRadius: "8px",
                      maxWidth: "100%",
                      maxHeight: "300px",
                      objectFit: "cover",
                      cursor: "pointer",
                    }}
                    onClick={() => setSelectedImage(att.url)}
                  />
                );
              }
              if (message.type === "audio") {
                return (
                  <audio
                    key={att.id}
                    controls
                    src={att.url}
                    style={{ width: "240px", maxWidth: "100%" }}
                  />
                );
              }
              // Default to file
              return (
                <div
                  key={att.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px",
                    backgroundColor: "rgba(0,0,0,0.1)",
                    borderRadius: "8px",
                  }}
                >
                  <FileText size={24} color={isOwn ? "#e9edef" : "#8696a0"} />
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "inherit",
                      textDecoration: "none",
                      fontSize: "14px",
                      flex: 1,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {att.filename}
                  </a>
                </div>
              );
            })}
          </div>
        )}

        {/* Message content */}
        <div
          style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end" }}
        >
          {message.content && message.type === "text" && (
            <span
              style={{
                fontSize: "14px",
                lineHeight: "19px",
                color: "#e9edef",
                marginRight: "8px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {message.content}
            </span>
          )}

          {/* Time, edited indicator, and status */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "3px",
              height: "15px",
              marginLeft: "auto",
            }}
          >
            {message.isEdited && (
              <span
                style={{
                  fontSize: "11px",
                  color: "rgba(233, 237, 239, 0.6)",
                  marginRight: "3px",
                }}
              >
                Edited
              </span>
            )}
            <span
              style={{
                fontSize: "11px",
                color: "rgba(233, 237, 239, 0.6)",
                lineHeight: "15px",
              }}
            >
              {formatTime(message.createdAt)}
            </span>
            {isOwn && getStatusIcon()}
          </div>
        </div>

        {/* Context Menu */}
        {showContextMenu && (
          <div
            ref={menuRef}
            style={{
              position: "absolute",
              top: menuPosition.y,
              left: isOwn ? "auto" : menuPosition.x,
              right: isOwn ? 0 : "auto",
              backgroundColor: "#233138",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              zIndex: 1000,
              minWidth: "160px",
              overflow: "hidden",
            }}
          >
            {/* Reply - available on any message */}
            <button
              onClick={handleReply}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                width: "100%",
                padding: "12px 16px",
                border: "none",
                background: "none",
                color: "#e9edef",
                fontSize: "14px",
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.backgroundColor = "#2a3942")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              <Reply size={18} color="#8696a0" />
              Reply
            </button>

            {/* Edit - only for own text messages */}
            {isOwn && message.type === "text" && (
              <button
                onClick={handleEdit}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  width: "100%",
                  padding: "12px 16px",
                  border: "none",
                  background: "none",
                  color: "#e9edef",
                  fontSize: "14px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.backgroundColor = "#2a3942")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <Pencil size={18} color="#8696a0" />
                Edit
              </button>
            )}

            {/* Delete for Me */}
            <button
              onClick={handleDeleteForMe}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                width: "100%",
                padding: "12px 16px",
                border: "none",
                background: "none",
                color: "#e9edef",
                fontSize: "14px",
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.backgroundColor = "#2a3942")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              <Trash2 size={18} color="#8696a0" />
              Delete for Me
            </button>

            {/* Delete for Everyone - only for own messages */}
            {isOwn && (
              <button
                onClick={handleDeleteForEveryone}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  width: "100%",
                  padding: "12px 16px",
                  border: "none",
                  background: "none",
                  color: "#ea4335",
                  fontSize: "14px",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.backgroundColor = "#2a3942")
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <Trash2 size={18} color="#ea4335" />
                Delete for Everyone
              </button>
            )}
          </div>
        )}
      </div>

      {/* Image Viewer Modal */}
      {selectedImage && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.9)",
            zIndex: 2000,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 24px",
              backgroundColor: "rgba(0,0,0,0.5)",
            }}
          >
            <button
              onClick={() => setSelectedImage(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#fff" }}
            >
              <X size={28} />
            </button>
            <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
              <button
                onClick={zoomImageOut}
                disabled={imageZoom <= IMAGE_ZOOM_MIN}
                style={{
                  background: "none",
                  border: "none",
                  cursor: imageZoom <= IMAGE_ZOOM_MIN ? "default" : "pointer",
                  color: "#fff",
                  opacity: imageZoom <= IMAGE_ZOOM_MIN ? 0.4 : 1,
                }}
              >
                <ZoomOut size={22} />
              </button>
              <span style={{ color: "#fff", fontSize: 13, minWidth: 40, textAlign: "center" }}>
                {Math.round(imageZoom * 100)}%
              </span>
              <button
                onClick={zoomImageIn}
                disabled={imageZoom >= IMAGE_ZOOM_MAX}
                style={{
                  background: "none",
                  border: "none",
                  cursor: imageZoom >= IMAGE_ZOOM_MAX ? "default" : "pointer",
                  color: "#fff",
                  opacity: imageZoom >= IMAGE_ZOOM_MAX ? 0.4 : 1,
                }}
              >
                <ZoomIn size={22} />
              </button>
              <button
                onClick={handleDownload}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#fff" }}
              >
                <Download size={24} />
              </button>
              <button
                onClick={() => setShowForward(true)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#fff" }}
              >
                <Forward size={24} />
              </button>
            </div>
          </div>

          {/* Image container */}
          <div
            ref={imageContainerRef}
            style={{
              flex: 1,
              display: "flex",
              alignItems: imageZoom <= 1 ? "center" : "flex-start",
              justifyContent: imageZoom <= 1 ? "center" : "flex-start",
              overflow: "auto",
              padding: "20px",
            }}
          >
            <img
              src={selectedImage}
              alt="Full screen"
              onDoubleClick={() => setImageZoom((z) => (z > 1 ? 1 : 2))}
              style={{
                maxWidth: imageZoom <= 1 ? "100%" : "none",
                maxHeight: imageZoom <= 1 ? "100%" : "none",
                width: imageZoom > 1 ? `${imageZoom * 100}%` : undefined,
                objectFit: "contain",
                margin: imageZoom <= 1 ? "auto" : undefined,
                cursor: imageZoom > 1 ? "zoom-out" : "zoom-in",
                transition: "width 0.15s ease",
                flexShrink: 0,
              }}
            />
          </div>
        </div>
      )}

      {/* Forward Modal */}
      {showForward && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(11,20,26,0.85)",
            zIndex: 3000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setShowForward(false)}
        >
          <div
            style={{
              backgroundColor: "#202c33",
              borderRadius: "8px",
              width: "400px",
              maxWidth: "90%",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "20px", display: "flex", alignItems: "center", gap: "16px", borderBottom: "1px solid #2a3942" }}>
              <button
                onClick={() => setShowForward(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#aebac1" }}
              >
                <X size={24} />
              </button>
              <h2 style={{ margin: 0, fontSize: "18px", color: "#e9edef", fontWeight: 500 }}>Forward to...</h2>
            </div>
            
            <div style={{ flex: 1, overflowY: "auto" }}>
              {chats.map((c) => {
                let name = c.name;
                if (c.type === "direct") {
                  const otherMember = c.members.find((m) => m.userId !== user?.id);
                  name = otherMember?.user?.profile?.displayName || "Unknown";
                }
                return (
                  <button
                    key={c.id}
                    style={{
                      width: "100%",
                      padding: "16px 20px",
                      display: "flex",
                      alignItems: "center",
                      background: "none",
                      border: "none",
                      borderBottom: "1px solid #2a3942",
                      color: "#e9edef",
                      fontSize: "16px",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#2a3942")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    onClick={() => handleForward(c.id)}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
