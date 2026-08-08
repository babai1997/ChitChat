import { useEffect, useState } from "react";
import {
  ArrowLeft,
  MessageSquare,
  Phone,
  Video,
  PhoneMissed,
  PhoneOutgoing,
  PhoneIncoming,
  User,
} from "lucide-react";
import { chatApi } from "../../api";
import { useChatStore } from "../../stores/chatStore";
import { useAuthStore } from "../../stores/authStore";
import { useCall } from "../../contexts/CallContext";
import { useHasCamera } from "../../hooks";
import { Tooltip } from "../common/Tooltip";
import type { Message } from "../../types";

interface CallInfoViewProps {
  chatId: string;
  onBack?: () => void;
  onMessageClick: (chatId: string) => void;
}

export const CallInfoView = ({
  chatId,
  onBack,
  onMessageClick,
}: CallInfoViewProps) => {
  const { user } = useAuthStore();
  const { chats } = useChatStore();
  const { startCall } = useCall();
  const hasCamera = useHasCamera();
  const [callRecords, setCallRecords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const chat = chats.find((c) => c.id === chatId);

  let chatName = "Unknown";
  let avatarUrl: string | null = null;
  let phoneStr = "";

  if (chat) {
    if (chat.type === "direct") {
      const otherMember = chat.members.find((m) => m.userId !== user?.id);
      if (otherMember?.user?.profile) {
        chatName = otherMember.user.profile.displayName || "Unknown";
        avatarUrl = otherMember.user.profile.avatarUrl;
        phoneStr = otherMember.user.phone || "";
      } else if (otherMember?.user) {
        chatName =
          otherMember.user.phone || otherMember.user.email || "Unknown";
        phoneStr = otherMember.user.phone || "";
      }
    } else {
      chatName = chat.name || "Group";
      avatarUrl = chat.avatarUrl;
    }
  }

  useEffect(() => {
    const loadCallHistory = async () => {
      try {
        const { data: raw } = await chatApi.getCallHistory({ chatId });

        const records = raw.map((msg: Message) => {
          const isMine = msg.senderId === user?.id;
          let callLog = { status: "missed", duration: 0, isVideo: false };
          try {
            if (msg.content) {
              if (msg.content.startsWith("{")) {
                callLog = JSON.parse(msg.content);
              } else {
                callLog.isVideo = msg.content.includes("video");
                callLog.status = msg.content.includes("ended")
                  ? "ended"
                  : "missed";
              }
            }
          } catch {
            // ignore parse error
          }

          let direction = "missed";
          if (isMine) {
            direction = "outgoing";
          } else if (callLog.status === "ended") {
            direction = "incoming";
          } else {
            direction = "missed";
          }

          return {
            id: msg.id,
            type: callLog.isVideo ? "video" : "audio",
            direction,
            time: msg.createdAt,
            duration: callLog.duration,
            status: callLog.status,
          };
        });

        setCallRecords(records);
      } catch (err) {
        console.error("Failed to load call history for chat:", err);
      } finally {
        setIsLoading(false);
      }
    };

    if (chatId) {
      loadCallHistory();
    }
  }, [chatId, user?.id]);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getCallIcon = (direction: string) => {
    if (direction === "missed") {
      return <PhoneMissed size={20} color="var(--color-danger)" />;
    }
    if (direction === "outgoing") {
      return <PhoneOutgoing size={20} color="var(--color-accent)" />;
    }
    return <PhoneIncoming size={20} color="var(--color-info)" />;
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return "Not answered";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s} sec`;
    return `${m} min ${s} sec`;
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--color-bg-deepest)",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          height: "60px",
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          backgroundColor: "var(--color-surface)",
          flexShrink: 0,
        }}
      >
        {onBack && (
          <button
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text-primary)",
              cursor: "pointer",
              marginRight: "16px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <ArrowLeft size={24} />
          </button>
        )}
        <h2
          style={{
            fontSize: "18px",
            fontWeight: 500,
            color: "var(--color-text-primary)",
            margin: 0,
          }}
        >
          Call info
        </h2>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Profile Section */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "32px 16px",
            borderBottom: "1px solid var(--color-surface)",
          }}
        >
          {/* Avatar */}
          <div style={{ marginBottom: "16px" }}>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                referrerPolicy="no-referrer"
                alt={chatName}
                style={{
                  width: "140px",
                  height: "140px",
                  borderRadius: "50%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={{
                  width: "140px",
                  height: "140px",
                  borderRadius: "50%",
                  backgroundColor: "var(--color-surface-elevated)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <User size={64} color="var(--color-text-secondary)" />
              </div>
            )}
          </div>

          {/* Name & Phone */}
          <h1
            style={{
              fontSize: "24px",
              fontWeight: 500,
              color: "var(--color-text-primary)",
              margin: "0 0 8px 0",
            }}
          >
            {chatName}
          </h1>
          {phoneStr && (
            <p
              style={{
                fontSize: "16px",
                color: "var(--color-text-secondary)",
                margin: "0 0 24px 0",
              }}
            >
              {phoneStr}
            </p>
          )}

          {/* Action Buttons */}
          <div
            style={{ display: "flex", gap: "16px", justifyContent: "center" }}
          >
            <button
              onClick={() => onMessageClick(chatId)}
              style={{
                width: "80px",
                height: "80px",
                borderRadius: "16px",
                border: "1px solid var(--color-surface)",
                backgroundColor: "var(--color-bg)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                cursor: "pointer",
                color: "var(--color-text-primary)",
              }}
            >
              <MessageSquare size={24} color="var(--color-accent)" />
              <span style={{ fontSize: "14px", fontWeight: 500 }}>Message</span>
            </button>

            <button
              onClick={() => startCall(chatId, "audio")}
              style={{
                width: "80px",
                height: "80px",
                borderRadius: "16px",
                border: "1px solid var(--color-surface)",
                backgroundColor: "var(--color-bg)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                cursor: "pointer",
                color: "var(--color-text-primary)",
              }}
            >
              <Phone size={24} color="var(--color-accent)" />
              <span style={{ fontSize: "14px", fontWeight: 500 }}>Audio</span>
            </button>

            <Tooltip text="No camera detected" disabled={hasCamera}>
              <button
                onClick={() => hasCamera && startCall(chatId, "video")}
                aria-disabled={!hasCamera}
                style={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "16px",
                  border: "1px solid var(--color-surface)",
                  backgroundColor: "var(--color-bg)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  cursor: hasCamera ? "pointer" : "not-allowed",
                  opacity: hasCamera ? 1 : 0.4,
                  color: "var(--color-text-primary)",
                }}
              >
                <Video size={24} color="var(--color-accent)" />
                <span style={{ fontSize: "14px", fontWeight: 500 }}>Video</span>
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Call History */}
        <div style={{ padding: "24px 0" }}>
          <div style={{ padding: "0 24px 16px 24px" }}>
            <span
              style={{ color: "var(--color-text-secondary)", fontSize: "14px", fontWeight: 500 }}
            >
              Today
            </span>
          </div>

          {isLoading ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                padding: "32px",
              }}
            >
              <div
                style={{
                  color: "var(--color-accent)",
                  animation: "spin 1s linear infinite",
                }}
              >
                <Phone size={24} />
              </div>
            </div>
          ) : callRecords.length === 0 ? (
            <div style={{ padding: "0 24px", color: "var(--color-text-secondary)" }}>
              No call history
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {callRecords.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "16px 24px",
                  }}
                >
                  <div
                    style={{
                      width: "32px",
                      display: "flex",
                      justifyContent: "center",
                      marginRight: "16px",
                    }}
                  >
                    {getCallIcon(item.direction)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        color: "var(--color-text-primary)",
                        fontSize: "16px",
                        fontWeight: 500,
                        marginBottom: "4px",
                      }}
                    >
                      {item.direction === "missed"
                        ? "Missed"
                        : item.direction === "outgoing"
                          ? "Outgoing"
                          : "Incoming"}
                    </div>
                    <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
                      {formatTime(item.time)}
                    </div>
                  </div>
                  <div style={{ color: "var(--color-text-secondary)", fontSize: "14px" }}>
                    {formatDuration(item.duration)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
