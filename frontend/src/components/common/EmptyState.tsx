import { MessageCircle, Lock } from 'lucide-react';

export const EmptyState = () => {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-surface)', padding: '32px', height: '100%' }}>
      <div style={{ width: '256px', height: '256px', marginBottom: '32px', position: 'relative' }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '192px', height: '192px', borderRadius: '50%', backgroundColor: 'var(--color-border)', opacity: 0.5 }} />
        </div>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '128px', height: '128px', borderRadius: '50%', backgroundColor: 'var(--color-border)' }} />
        </div>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MessageCircle size={48} color="var(--color-accent-secondary)" />
        </div>
      </div>
      
      <h2 style={{ fontSize: '32px', fontWeight: 300, color: 'var(--color-text-primary)', marginBottom: '8px', textAlign: 'center' }}>
        ChitChat Web
      </h2>
      
      <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', maxWidth: '400px', marginBottom: '32px', fontSize: '14px', lineHeight: '20px' }}>
        Send and receive messages. Select a chat from the sidebar to start messaging.
      </p>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
        <Lock size={14} />
        <span>End-to-end encrypted</span>
      </div>
    </div>
  );
};
