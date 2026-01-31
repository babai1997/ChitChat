import { Check, CheckCheck, Clock, FileText } from 'lucide-react';
import type { Message } from '../../types';

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showSender?: boolean;
}

export const MessageBubble = ({ message, isOwn, showSender }: MessageBubbleProps) => {
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const getStatusIcon = () => {
    switch (message.status) {
      case 'sending':
        return <Clock size={14} color="#8696a0" />;
      case 'sent':
        return <Check size={14} color="#8696a0" />;
      case 'delivered':
        return <CheckCheck size={14} color="#8696a0" />;
      case 'read':
        return <CheckCheck size={14} color="#53bdeb" />; // Blue double check
      default:
        return null;
    }
  };

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
          // On mobile max-width is 85%, ideally 65% on desktop
          // We can use style prop with CSS variable or just stick to 85% for simplicity or add internal resizing logic
          padding: '6px 7px 8px 9px',
          backgroundColor: isOwn ? '#005c4b' : '#202c33',
          borderRadius: isOwn ? '8px 8px 0 8px' : '8px 8px 8px 0',
          boxShadow: '0 1px 0.5px rgba(11,20,26,.13)',
          position: 'relative'
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
          
          {/* Time and status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '15px', marginLeft: 'auto' }}>
            <span style={{ fontSize: '11px', color: 'rgba(233, 237, 239, 0.6)', lineHeight: '15px' }}>
              {formatTime(message.createdAt)}
            </span>
            {isOwn && getStatusIcon()}
          </div>
        </div>
      </div>
    </div>
  );
};
