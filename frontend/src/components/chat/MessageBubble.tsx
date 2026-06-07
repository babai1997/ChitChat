import { useState, useRef, useEffect } from 'react';
import { Check, CheckCheck, Clock, FileText, Pencil, Trash2, Ban, PhoneMissed, Video } from 'lucide-react';
import type { Message } from '../../types';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showSender?: boolean;
  onEdit?: (messageId: string, currentContent: string) => void;
  onDelete?: (messageId: string, deleteForEveryone: boolean) => void;
}

export const MessageBubble = ({ message, isOwn, showSender, onEdit, onDelete }: MessageBubbleProps) => {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const [showClock, setShowClock] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (message.status === 'sending') {
      // WhatsApp delays the clock icon so it doesn't flash on fast networks
      timer = setTimeout(() => setShowClock(true), 300);
    }
    return () => clearTimeout(timer);
  }, [message.status]);

  const getStatusIcon = () => {
    let icon = null;
    switch (message.status) {
      case 'sending':
        icon = <Clock size={14} color="#8696a0" style={{ opacity: showClock ? 1 : 0, transition: 'opacity 0.2s' }} />;
        break;
      case 'sent':
        icon = <Check size={14} color="#8696a0" />;
        break;
      case 'delivered':
        icon = <CheckCheck size={14} color="#8696a0" />;
        break;
      case 'read':
        icon = <CheckCheck size={14} color="#53bdeb" />;
        break;
    }
    
    return (
      <div style={{ width: '16px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
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
        y: e.clientY - rect.top
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
          y: touch.clientY - rect.top
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
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showContextMenu]);

  const handleEdit = () => {
    if (onEdit && message.type === 'text') {
      onEdit(message.id, message.content);
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

  // If message is deleted, show special UI
  if (message.isDeleted) {
    return (
      <div 
        className="animate-slide-up"
        style={{ 
          display: 'flex', 
          justifyContent: isOwn ? 'flex-end' : 'flex-start',
          marginBottom: '4px'
        }}
      >
        <div 
          style={{
            maxWidth: '85%',
            padding: '6px 12px 8px 12px',
            backgroundColor: isOwn ? '#005c4b' : '#202c33',
            borderRadius: isOwn ? '8px 8px 0 8px' : '8px 8px 8px 0',
            boxShadow: '0 1px 0.5px rgba(11,20,26,.13)',
            opacity: 0.6
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Ban size={14} color="#8696a0" />
            <span style={{ 
              fontSize: '14px', 
              fontStyle: 'italic',
              color: '#8696a0'
            }}>
              This message was deleted
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Missed call — render as WhatsApp-style pill (no context menu, not editable)
  if (message.type === 'missed_call') {
    const isVideoCall = message.content?.includes('video');
    return (
      <div
        className="animate-slide-up"
        style={{ display: 'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', marginBottom: '4px' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 14px',
            backgroundColor: isOwn ? '#005c4b' : '#202c33',
            borderRadius: isOwn ? '8px 8px 0 8px' : '8px 8px 8px 0',
            boxShadow: '0 1px 0.5px rgba(11,20,26,.13)',
            maxWidth: '280px',
          }}
        >
          <div style={{
            width: '34px', height: '34px', borderRadius: '50%',
            backgroundColor: 'rgba(234, 67, 53, 0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {isVideoCall
              ? <Video size={17} color="#ea4335" />
              : <PhoneMissed size={17} color="#ea4335" />
            }
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '14px', color: '#e9edef', lineHeight: '18px' }}>
              {message.content}
            </span>
            <span style={{ fontSize: '11px', color: 'rgba(233,237,239,0.5)' }}>
              {formatTime(message.createdAt)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="animate-slide-up"
      style={{ 
        display: 'flex', 
        justifyContent: isOwn ? 'flex-end' : 'flex-start',
        marginBottom: '4px',
        position: 'relative'
      }}
    >
      <div 
        ref={bubbleRef}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
        style={{
          maxWidth: '85%',
          padding: '6px 7px 8px 9px',
          backgroundColor: isOwn ? '#005c4b' : '#202c33',
          borderRadius: isOwn ? '8px 8px 0 8px' : '8px 8px 8px 0',
          boxShadow: '0 1px 0.5px rgba(11,20,26,.13)',
          position: 'relative',
          cursor: 'pointer'
        }}
      >
        {/* Sender name for group chats */}
        {showSender && message.sender && (
          <p style={{ fontSize: '12px', fontWeight: 500, color: '#f382a8', marginBottom: '4px', lineHeight: '14px' }}>
            {message.sender.displayName || 'Unknown'}
          </p>
        )}
        
        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div style={{ marginBottom: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {message.attachments.map((att) => {
              if (message.type === 'image') {
                return (
                  <img
                    key={att.id}
                    src={att.url}
                    alt={att.filename}
                    style={{ borderRadius: '8px', maxWidth: '100%', maxHeight: '300px', objectFit: 'cover', cursor: 'pointer' }}
                    onClick={() => window.open(att.url, '_blank')}
                  />
                );
              }
              if (message.type === 'audio') {
                return (
                   <audio key={att.id} controls src={att.url} style={{ width: '240px', maxWidth: '100%' }} />
                );
              }
              // Default to file
              return (
                 <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: '8px' }}>
                   <FileText size={24} color={isOwn ? '#e9edef' : '#8696a0'} />
                   <a 
                     href={att.url} 
                     target="_blank" 
                     rel="noopener noreferrer" 
                     style={{ 
                       color: 'inherit', 
                       textDecoration: 'none', 
                       fontSize: '14px', 
                       flex: 1, 
                       whiteSpace: 'nowrap', 
                       overflow: 'hidden', 
                       textOverflow: 'ellipsis' 
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
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {message.content && (
            <span style={{ 
              fontSize: '14px', 
              lineHeight: '19px', 
              color: '#e9edef', 
              marginRight: '8px', 
              whiteSpace: 'pre-wrap', 
              wordBreak: 'break-word' 
            }}>
              {message.content}
            </span>
          )}
          
          {/* Time, edited indicator, and status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '15px', marginLeft: 'auto' }}>
            {message.isEdited && (
              <span style={{ fontSize: '11px', color: 'rgba(233, 237, 239, 0.6)', marginRight: '3px' }}>
                Edited
              </span>
            )}
            <span style={{ fontSize: '11px', color: 'rgba(233, 237, 239, 0.6)', lineHeight: '15px' }}>
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
              position: 'absolute',
              top: menuPosition.y,
              left: isOwn ? 'auto' : menuPosition.x,
              right: isOwn ? 0 : 'auto',
              backgroundColor: '#233138',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              zIndex: 1000,
              minWidth: '160px',
              overflow: 'hidden'
            }}
          >
            {/* Edit - only for own text messages */}
            {isOwn && message.type === 'text' && (
              <button
                onClick={handleEdit}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '100%',
                  padding: '12px 16px',
                  border: 'none',
                  background: 'none',
                  color: '#e9edef',
                  fontSize: '14px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#2a3942')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Pencil size={18} color="#8696a0" />
                Edit
              </button>
            )}
            
            {/* Delete for Me */}
            <button
              onClick={handleDeleteForMe}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                width: '100%',
                padding: '12px 16px',
                border: 'none',
                background: 'none',
                color: '#e9edef',
                fontSize: '14px',
                cursor: 'pointer',
                textAlign: 'left'
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#2a3942')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <Trash2 size={18} color="#8696a0" />
              Delete for Me
            </button>
            
            {/* Delete for Everyone - only for own messages */}
            {isOwn && (
              <button
                onClick={handleDeleteForEveryone}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '100%',
                  padding: '12px 16px',
                  border: 'none',
                  background: 'none',
                  color: '#ea4335',
                  fontSize: '14px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#2a3942')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Trash2 size={18} color="#ea4335" />
                Delete for Everyone
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
