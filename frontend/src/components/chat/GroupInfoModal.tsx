import { useEffect, useState, useRef } from "react";
import {
  X,
  User,
  Users,
  UserPlus,
  ArrowLeft,
  Trash2,
  Loader2,
  Camera,
  ShieldCheck,
  ShieldOff,
  Video,
  Check,
  Copy,
  Image as ImageIcon,
  ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { chatApi, meetingsApi, type ChatMeetingLink } from "../../api";
import { useChatStore } from "../../stores";
import { ImageCropModal } from "../common/ImageCropModal";
import type { Chat, ChatMember } from "../../types";

function extractErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return typeof message === "string" ? message : fallback;
}

interface GroupInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  chat: Chat;
  currentUserId: string;
  onAddMember: () => void;
  onOpenGallery?: () => void;
}

export const GroupInfoModal = ({
  isOpen,
  onClose,
  chat,
  currentUserId,
  onAddMember,
  onOpenGallery,
}: GroupInfoModalProps) => {
  const [selectedMember, setSelectedMember] = useState<ChatMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isChangingRole, setIsChangingRole] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const isMeeting = chat.type === "meeting";
  const [meetingLink, setMeetingLink] = useState<ChatMeetingLink | null>(null);
  const [isLoadingMeetingLink, setIsLoadingMeetingLink] = useState(isMeeting);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isRevokingLink, setIsRevokingLink] = useState(false);

  useEffect(() => {
    if (!isOpen || !isMeeting) return;
    setIsLoadingMeetingLink(true);
    meetingsApi
      .getByChatId(chat.id)
      .then(setMeetingLink)
      .catch((err) => console.error("Failed to load meeting link:", err))
      .finally(() => setIsLoadingMeetingLink(false));
  }, [isOpen, isMeeting, chat.id]);

  const handleCopyMeetingLink = async () => {
    if (!meetingLink) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/meet/${meetingLink.slug}`);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy meeting link:", err);
      toast.error("Failed to copy link");
    }
  };

  const handleRevokeMeetingLink = async () => {
    if (!meetingLink || !window.confirm("Revoke this meeting link? It will stop working immediately.")) return;
    setIsRevokingLink(true);
    try {
      await meetingsApi.revoke(meetingLink.slug);
      setMeetingLink({ ...meetingLink, revoked: true });
      toast.success("Meeting link revoked");
    } catch (err) {
      console.error("Failed to revoke meeting link:", err);
      toast.error("Failed to revoke meeting link");
    } finally {
      setIsRevokingLink(false);
    }
  };

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

  // File picked from the OS dialog — open the crop step rather than
  // uploading it as-is (mobile already gets this via expo-image-picker's
  // native `allowsEditing` crop screen; web never had an equivalent step).
  const handleAvatarFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isUploading) return;
    setCropSrc(URL.createObjectURL(file));
  };

  const handleCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  };

  const handleCroppedAvatarUpload = async (file: File) => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    setIsUploading(true);
    try {
      const { url } = await chatApi.uploadAttachment(chat.id, file);
      const updatedChat = await chatApi.updateGroup(chat.id, { avatarUrl: url });
      const { chats, setChats, activeChat, setActiveChat } = useChatStore.getState();
      setChats(chats.map((c) => (c.id === updatedChat.id ? updatedChat : c)));
      if (activeChat?.id === updatedChat.id) setActiveChat(updatedChat);
      toast.success("Group photo updated");
    } catch (error) {
      console.error("Failed to upload group avatar:", error);
      toast.error(extractErrorMessage(error, "Failed to update group photo"));
    } finally {
      setIsUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

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
      toast.success("Member removed");
    } catch (error) {
      console.error("Failed to remove member:", error);
      toast.error(extractErrorMessage(error, "Failed to remove member"));
    } finally {
      setIsRemoving(false);
    }
  };

  const handleRoleChange = async (newRole: "admin" | "member") => {
    if (!selectedMember || isChangingRole) return;
    setIsChangingRole(true);
    try {
      await chatApi.updateMemberRole(chat.id, selectedMember.userId, newRole);
      const updatedChat = await chatApi.getChat(chat.id);
      const { chats, setChats, activeChat, setActiveChat } = useChatStore.getState();
      setChats(chats.map((c) => (c.id === updatedChat.id ? updatedChat : c)));
      if (activeChat?.id === updatedChat.id) setActiveChat(updatedChat);
      // Keep the currently-open member detail view in sync too — it's a
      // local snapshot, not derived from the store, so the "Group Admin"
      // badge/button label wouldn't otherwise update until this view reopens.
      setSelectedMember((prev) => (prev ? { ...prev, role: newRole } : prev));
      toast.success(newRole === "admin" ? "Promoted to group admin" : "Removed as group admin");
    } catch (error) {
      console.error("Failed to update member role:", error);
      toast.error(extractErrorMessage(error, "Failed to update member role"));
    } finally {
      setIsChangingRole(false);
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
    backgroundColor: "var(--color-surface-elevated)",
    borderRadius: "16px",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
    overflow: "hidden",
    border: "1px solid var(--color-border)",
  };
  const headerStyle: React.CSSProperties = {
    padding: "12px 16px",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    borderBottom: "1px solid var(--color-border)",
    backgroundColor: "var(--color-surface)",
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
              style={{ background: "none", border: "none", color: "var(--color-text-primary)", cursor: "pointer", display: "flex" }}
            >
              <ArrowLeft size={22} />
            </button>
            <h2 style={{ fontSize: "18px", fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>
              Member Info
            </h2>
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {/* Avatar + name */}
            <div style={{ padding: "32px 16px 24px", display: "flex", flexDirection: "column", alignItems: "center", borderBottom: "8px solid var(--color-bg)" }}>
              <div style={{ width: "100px", height: "100px", borderRadius: "50%", backgroundColor: "var(--color-border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: "16px" }}>
                {selectedMember.user.profile?.avatarUrl ? (
                  <img src={selectedMember.user.profile.avatarUrl} alt={memberName} referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <User size={48} color="var(--color-text-secondary)" />
                )}
              </div>
              <h3 style={{ fontSize: "22px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "4px", textAlign: "center" }}>
                {memberName}
              </h3>
              {selectedMember.user.phone && (
                <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>{selectedMember.user.phone}</p>
              )}
              {selectedMember.role === "admin" && (
                <span style={{ fontSize: "12px", color: "var(--color-accent-secondary)", border: "1px solid var(--color-accent-secondary)", padding: "2px 8px", borderRadius: "4px", marginTop: "6px" }}>
                  Group Admin
                </span>
              )}
            </div>

            {/* About */}
            <div style={{ padding: "16px", borderBottom: "8px solid var(--color-bg)" }}>
              <p style={{ fontSize: "13px", color: "var(--color-accent-secondary)", marginBottom: "4px" }}>About</p>
              <p style={{ fontSize: "15px", color: "var(--color-text-primary)" }}>
                {selectedMember.user.profile?.about || "Hey there! I am using ChitChat"}
              </p>
            </div>

            {/* Promote/demote admin — admin only, can't change own role
                (self-demotion when you're the only admin is also blocked
                server-side, but the button stays visible either way; the
                error toast explains it if that specific case is hit). */}
            {isCurrentUserAdmin && selectedMember.userId !== currentUserId && (
              <div style={{ padding: "8px 8px 0" }}>
                <button
                  onClick={() => void handleRoleChange(selectedMember.role === "admin" ? "member" : "admin")}
                  disabled={isChangingRole}
                  style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", padding: "14px 16px", backgroundColor: "transparent", border: "none", borderRadius: "8px", cursor: isChangingRole ? "not-allowed" : "pointer", color: "var(--color-text-primary)" }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--color-border)")}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  {isChangingRole ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : selectedMember.role === "admin" ? (
                    <ShieldOff size={18} />
                  ) : (
                    <ShieldCheck size={18} />
                  )}
                  <span style={{ fontSize: "15px", fontWeight: 500 }}>
                    {selectedMember.role === "admin" ? "Dismiss as admin" : "Make group admin"}
                  </span>
                </button>
              </div>
            )}

            {/* Remove from group — admin only, can't remove self */}
            {isCurrentUserAdmin && selectedMember.userId !== currentUserId && (
              <div style={{ padding: "8px" }}>
                <button
                  onClick={() => void handleRemoveMember()}
                  disabled={isRemoving}
                  style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", padding: "14px 16px", backgroundColor: "transparent", border: "none", borderRadius: "8px", cursor: isRemoving ? "not-allowed" : "pointer", color: "var(--color-danger)" }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.15)")}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  {isRemoving ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                  <span style={{ fontSize: "15px", fontWeight: 500 }}>Remove from group</span>
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
    <>
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--color-text-secondary)", cursor: "pointer", display: "flex" }}>
            <X size={24} />
          </button>
          <h2 style={{ fontSize: "18px", fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>
            {isMeeting ? "Meeting Info" : "Group Info"}
          </h2>
        </div>

        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {/* Avatar + name */}
          <div style={{ padding: "24px 16px", display: "flex", flexDirection: "column", alignItems: "center", borderBottom: "10px solid var(--color-bg)" }}>
            {!isMeeting && (
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleAvatarFileSelected}
              />
            )}
            {/* Avatar with dedicated camera button for group admins — a
                meeting's identity is its link, not a photo, so no upload
                affordance for it. */}
            <div style={{ position: "relative", width: "120px", height: "120px", marginBottom: "16px" }}>
              <div style={{ width: "120px", height: "120px", borderRadius: "50%", backgroundColor: "var(--color-border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {chat.avatarUrl ? (
                  <img src={chat.avatarUrl} alt={chat.name || "Group"} referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : isMeeting ? (
                  <Video size={60} color="var(--color-text-secondary)" />
                ) : (
                  <Users size={60} color="var(--color-text-secondary)" />
                )}
              </div>
              {!isMeeting && isCurrentUserAdmin && (
              <button
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={isUploading}
                  title="Change group photo"
                  style={{
                    position: "absolute", bottom: "4px", right: "4px",
                    width: "34px", height: "34px", borderRadius: "50%",
                    backgroundColor: "var(--color-accent)", border: "2px solid var(--color-surface-elevated)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--color-accent-deep)")}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "var(--color-accent)")}
                >
                  {isUploading
                    ? <Loader2 size={16} color="white" className="animate-spin" />
                    : <Camera size={16} color="white" />
                  }
                </button>
              )}
            </div>

            <h3 style={{ fontSize: "22px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "4px", textAlign: "center" }}>
              {chat.name || (isMeeting ? "Meeting" : "Group Chat")}
            </h3>
            <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>
              {isMeeting ? "Meeting" : "Group"} · {chat.members.length} participants
            </p>
          </div>

          {isMeeting ? (
            /* Meeting link — the actual reason anyone opens this panel for a meeting chat */
            <div style={{ padding: "16px", borderBottom: "10px solid var(--color-bg)" }}>
              <p style={{ fontSize: "14px", color: "var(--color-accent-secondary)", marginBottom: "8px" }}>Meeting link</p>
              {isLoadingMeetingLink ? (
                <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>Loading…</p>
              ) : meetingLink?.revoked ? (
                <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>This meeting link has been revoked.</p>
              ) : meetingLink ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", backgroundColor: "var(--color-border)", borderRadius: "8px", padding: "10px 12px" }}>
                    <span style={{ flex: 1, fontSize: "13px", color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {window.location.origin}/meet/{meetingLink.slug}
                    </span>
                    <button
                      onClick={handleCopyMeetingLink}
                      title="Copy link"
                      style={{ background: "none", border: "none", color: linkCopied ? "var(--color-accent)" : "var(--color-text-secondary)", cursor: "pointer", padding: "4px" }}
                    >
                      {linkCopied ? <Check size={18} /> : <Copy size={18} />}
                    </button>
                  </div>
                  {meetingLink.isHost && (
                    <button
                      onClick={handleRevokeMeetingLink}
                      disabled={isRevokingLink}
                      style={{ display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", color: "var(--color-danger)", cursor: "pointer", padding: "10px 0 0", fontSize: "13px" }}
                    >
                      {isRevokingLink ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      Revoke link
                    </button>
                  )}
                </>
              ) : (
                <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>No link found for this meeting.</p>
              )}
            </div>
          ) : (
            /* Description */
            <div style={{ padding: "16px", borderBottom: "10px solid var(--color-bg)" }}>
              <p style={{ fontSize: "14px", color: "var(--color-accent-secondary)", marginBottom: "4px" }}>Description</p>
              <p style={{ fontSize: "15px", color: "var(--color-text-primary)" }}>Welcome to the group!</p>
            </div>
          )}

          {onOpenGallery && (
            <button
              onClick={onOpenGallery}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "14px 16px",
                backgroundColor: "transparent",
                border: "none",
                borderBottom: "10px solid var(--color-bg)",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <ImageIcon size={18} color="var(--color-text-secondary)" />
              <span style={{ flex: 1, fontSize: "14px", color: "var(--color-text-primary)" }}>Media, links and docs</span>
              <ChevronRight size={16} color="var(--color-text-secondary)" />
            </button>
          )}

          {/* Participants */}
          <div style={{ padding: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <p style={{ fontSize: "14px", color: "var(--color-text-secondary)" }}>{chat.members.length} participants</p>
              {isCurrentUserAdmin && (
                <button
                  onClick={onAddMember}
                  style={{ display: "flex", alignItems: "center", gap: "6px", backgroundColor: "transparent", border: "1px solid var(--color-accent)", borderRadius: "16px", padding: "4px 12px", cursor: "pointer", color: "var(--color-accent)" }}
                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--color-accent-muted-bg)")}
                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <UserPlus size={14} />
                  <span style={{ fontSize: "13px", fontWeight: 500 }}>Add Member</span>
                </button>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {sortedMembers.map((member) => {
                const name =
                  member.userId === currentUserId
                    ? "You"
                    : member.user.profile?.displayName || member.user.phone || "Unknown";
                const clickable = isCurrentUserAdmin && member.userId !== currentUserId;

                return (
                  <div
                    key={member.id}
                    onClick={clickable ? () => setSelectedMember(member) : undefined}
                    style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px", borderRadius: "8px", cursor: clickable ? "pointer" : "default" }}
                    onMouseOver={(e) => { if (clickable) e.currentTarget.style.backgroundColor = "var(--color-border)"; }}
                    onMouseOut={(e) => { if (clickable) e.currentTarget.style.backgroundColor = "transparent"; }}
                  >
                    <div style={{ width: "40px", height: "40px", borderRadius: "50%", backgroundColor: "var(--color-border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
                      {member.user.profile?.avatarUrl ? (
                        <img src={member.user.profile.avatarUrl} alt={name} referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <User size={20} color="var(--color-text-secondary)" />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h4 style={{ fontSize: "16px", color: "var(--color-text-primary)", fontWeight: 400, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {name}
                        </h4>
                        {member.role === "admin" && (
                          <span style={{ fontSize: "11px", color: "var(--color-accent-secondary)", border: "1px solid var(--color-accent-secondary)", padding: "2px 6px", borderRadius: "4px", marginLeft: "8px", flexShrink: 0 }}>
                            Group Admin
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: 0, marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {member.user.profile?.about || "Hey there! I am using ChitChat"}
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
    {cropSrc && (
      <ImageCropModal
        imageSrc={cropSrc}
        cropShape="round"
        fileName="group-photo.jpg"
        onCropped={handleCroppedAvatarUpload}
        onClose={handleCropCancel}
      />
    )}
    </>
  );
};
