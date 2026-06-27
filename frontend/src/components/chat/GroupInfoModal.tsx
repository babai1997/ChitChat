import { useState } from "react";
import {
  X,
  User,
  Users,
  UserPlus,
  ArrowLeft,
  Trash2,
  Loader2,
} from "lucide-react";
import { chatApi } from "../../api";
import { useChatStore } from "../../stores";
import type { Chat, ChatMember } from "../../types";

interface GroupInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  chat: Chat;
  currentUserId: string;
  onAddMember: () => void;
}

export const GroupInfoModal = ({
  isOpen,
  onClose,
  chat,
  currentUserId,
  onAddMember,
}: GroupInfoModalProps) => {
  const [selectedMember, setSelectedMember] = useState<ChatMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  // const [isUploading, setIsUploading] = useState(false);
  // const avatarInputRef = useRef<HTMLInputElement>(null);

  const isCurrentUserAdmin =
    chat.members.find((m) => m.userId === currentUserId)?.role === "admin";

  const sortedMembers = [...chat.members].sort((a, b) => {
    if (a.userId === currentUserId) return -1;
    if (b.userId === currentUserId) return 1;
    if (a.role === "admin" && b.role !== "admin") return -1;
    if (b.role === "admin" && a.role !== "admin") return 1;
    const nameA = a.user.profile?.displayName || a.user.phone || "";
    const nameB = b.user.profile?.displayName || b.user.phone || "";
    return nameA.localeCompare(nameB);
  });

  const handleRemoveMember = async () => {
    if (!selectedMember || isRemoving) return;
    setIsRemoving(true);
    try {
      await chatApi.removeMember(chat.id, selectedMember.userId);
      const updatedChat = await chatApi.getChat(chat.id);
      const { chats, setChats, activeChat, setActiveChat } =
        useChatStore.getState();
      setChats(chats.map((c) => (c.id === updatedChat.id ? updatedChat : c)));
      if (activeChat?.id === updatedChat.id) setActiveChat(updatedChat);
      setSelectedMember(null);
    } catch (error) {
      console.error("Failed to remove member:", error);
    } finally {
      setIsRemoving(false);
    }
  };

  if (!isOpen) return null;

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "16px",
  };
  const panelStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: "400px",
    maxHeight: "80vh",
    backgroundColor: "#1f2c34",
    borderRadius: "16px",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    overflow: "hidden",
    border: "1px solid #2a3942",
  };
  const headerStyle: React.CSSProperties = {
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    borderBottom: "1px solid #2a3942",
    backgroundColor: "#202c33",
  };

  // ── Member profile / remove view ───────────────────────────────────────────
  if (selectedMember) {
    const memberName =
      selectedMember.userId === currentUserId
        ? "You"
        : selectedMember.user.profile?.displayName ||
          selectedMember.user.phone ||
          "Unknown";

    return (
      <div style={overlayStyle} onClick={() => setSelectedMember(null)}>
        <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
          <div style={headerStyle}>
            <button
              onClick={() => setSelectedMember(null)}
              style={{
                background: "none",
                border: "none",
                color: "#e9edef",
                cursor: "pointer",
                display: "flex",
              }}
            >
              <ArrowLeft size={22} />
            </button>
            <h2
              style={{
                fontSize: "18px",
                fontWeight: 500,
                color: "#e9edef",
                margin: 0,
              }}
            >
              Member Info
            </h2>
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {/* Avatar + name */}
            <div
              style={{
                padding: "32px 16px 24px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                borderBottom: "8px solid #111b21",
              }}
            >
              <div
                style={{
                  width: "100px",
                  height: "100px",
                  borderRadius: "50%",
                  backgroundColor: "#2a3942",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  marginBottom: "16px",
                }}
              >
                {selectedMember.user.profile?.avatarUrl ? (
                  <img
                    src={selectedMember.user.profile.avatarUrl}
                    alt={memberName}
                    referrerPolicy="no-referrer"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <User size={48} color="#8696a0" />
                )}
              </div>
              <h3
                style={{
                  fontSize: "22px",
                  fontWeight: 600,
                  color: "#e9edef",
                  marginBottom: "4px",
                  textAlign: "center",
                }}
              >
                {memberName}
              </h3>
              {selectedMember.user.phone && (
                <p style={{ fontSize: "14px", color: "#8696a0" }}>
                  {selectedMember.user.phone}
                </p>
              )}
              {selectedMember.role === "admin" && (
                <span
                  style={{
                    fontSize: "12px",
                    color: "#25d366",
                    border: "1px solid #25d366",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    marginTop: "6px",
                  }}
                >
                  Group Admin
                </span>
              )}
            </div>

            {/* About */}
            <div style={{ padding: "16px", borderBottom: "8px solid #111b21" }}>
              <p
                style={{
                  fontSize: "13px",
                  color: "#25d366",
                  marginBottom: "4px",
                }}
              >
                About
              </p>
              <p style={{ fontSize: "15px", color: "#e9edef" }}>
                {selectedMember.user.profile?.about ||
                  "Hey there! I am using ChitChat"}
              </p>
            </div>

            {/* Remove from group — admin only, can't remove self */}
            {isCurrentUserAdmin && selectedMember.userId !== currentUserId && (
              <div style={{ padding: "8px" }}>
                <button
                  onClick={() => void handleRemoveMember()}
                  disabled={isRemoving}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    width: "100%",
                    padding: "14px 16px",
                    backgroundColor: "transparent",
                    border: "none",
                    borderRadius: "8px",
                    cursor: isRemoving ? "not-allowed" : "pointer",
                    color: "#ef4444",
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = "#2a1a1a")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                >
                  {isRemoving ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Trash2 size={18} />
                  )}
                  <span style={{ fontSize: "15px", fontWeight: 500 }}>
                    Remove from group
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Group info main view ───────────────────────────────────────────────────
  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#8696a0",
              cursor: "pointer",
              display: "flex",
            }}
          >
            <X size={24} />
          </button>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 500,
              color: "#e9edef",
              margin: 0,
            }}
          >
            Group Info
          </h2>
        </div>

        <div
          style={{
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Avatar + name */}
          <div
            style={{
              padding: "24px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              borderBottom: "10px solid #111b21",
            }}
          >
            <div
              style={{
                width: "120px",
                height: "120px",
                borderRadius: "50%",
                backgroundColor: "#2a3942",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
                overflow: "hidden",
              }}
            >
              {chat.avatarUrl ? (
                <img
                  src={chat.avatarUrl}
                  alt={chat.name || "Group"}
                  referrerPolicy="no-referrer"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <Users size={60} color="#8696a0" />
              )}
            </div>
            <h3
              style={{
                fontSize: "22px",
                fontWeight: 600,
                color: "#e9edef",
                marginBottom: "4px",
                textAlign: "center",
              }}
            >
              {chat.name || "Group Chat"}
            </h3>
            <p style={{ fontSize: "14px", color: "#8696a0" }}>
              Group · {chat.members.length} participants
            </p>
          </div>

          {/* Description */}
          <div style={{ padding: "16px", borderBottom: "10px solid #111b21" }}>
            <p
              style={{
                fontSize: "14px",
                color: "#25d366",
                marginBottom: "4px",
              }}
            >
              Description
            </p>
            <p style={{ fontSize: "15px", color: "#e9edef" }}>
              Welcome to the group!
            </p>
          </div>

          {/* Participants */}
          <div style={{ padding: "16px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
              }}
            >
              <p style={{ fontSize: "14px", color: "#8696a0" }}>
                {chat.members.length} participants
              </p>
              {isCurrentUserAdmin && (
                <button
                  onClick={onAddMember}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: "transparent",
                    border: "1px solid #00a884",
                    borderRadius: "16px",
                    padding: "4px 12px",
                    cursor: "pointer",
                    color: "#00a884",
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.backgroundColor = "#0d2e25")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                >
                  <UserPlus size={14} />
                  <span style={{ fontSize: "13px", fontWeight: 500 }}>
                    Add Member
                  </span>
                </button>
              )}
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "4px" }}
            >
              {sortedMembers.map((member) => {
                const name =
                  member.userId === currentUserId
                    ? "You"
                    : member.user.profile?.displayName ||
                      member.user.phone ||
                      "Unknown";
                const clickable =
                  isCurrentUserAdmin && member.userId !== currentUserId;

                return (
                  <div
                    key={member.id}
                    onClick={
                      clickable ? () => setSelectedMember(member) : undefined
                    }
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "8px",
                      borderRadius: "8px",
                      cursor: clickable ? "pointer" : "default",
                    }}
                    onMouseOver={(e) => {
                      if (clickable)
                        e.currentTarget.style.backgroundColor = "#2a3942";
                    }}
                    onMouseOut={(e) => {
                      if (clickable)
                        e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        backgroundColor: "#2a3942",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        flexShrink: 0,
                      }}
                    >
                      {member.user.profile?.avatarUrl ? (
                        <img
                          src={member.user.profile.avatarUrl}
                          alt={name}
                          referrerPolicy="no-referrer"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <User size={20} color="#8696a0" />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <h4
                          style={{
                            fontSize: "16px",
                            color: "#e9edef",
                            fontWeight: 400,
                            margin: 0,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {name}
                        </h4>
                        {member.role === "admin" && (
                          <span
                            style={{
                              fontSize: "11px",
                              color: "#25d366",
                              border: "1px solid #25d366",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              marginLeft: "8px",
                              flexShrink: 0,
                            }}
                          >
                            Group Admin
                          </span>
                        )}
                      </div>
                      <p
                        style={{
                          fontSize: "13px",
                          color: "#8696a0",
                          margin: 0,
                          marginTop: "2px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {member.user.profile?.about ||
                          "Hey there! I am using ChitChat"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
