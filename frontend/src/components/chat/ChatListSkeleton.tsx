export const ChatListSkeleton = () => {
  return (
    <div style={{ padding: '0', display: 'flex', flexDirection: 'column' }}>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          .skeleton-item {
            background: linear-gradient(90deg, var(--color-surface) 25%, var(--color-border) 50%, var(--color-surface) 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite;
          }
        `}} />
      {[...Array(10)].map((_, i) => (
        <div 
          key={i} 
          style={{ 
            display: 'flex', 
            padding: '12px 16px', 
            alignItems: 'center', 
            gap: '12px',
            borderBottom: '1px solid rgba(156, 147, 179, 0.15)' 
          }}
        >
          {/* Avatar Skeleton */}
          <div 
            className="skeleton-item"
            style={{ 
              width: '48px', 
              height: '48px', 
              borderRadius: '50%', 
              flexShrink: 0 
            }} 
          />
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Top Row: Name + Date */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {/* Name */}
              <div 
                className="skeleton-item"
                style={{ 
                  width: '120px', 
                  height: '16px', 
                  borderRadius: '4px' 
                }} 
              />
              {/* Date */}
              <div 
                className="skeleton-item"
                style={{ 
                  width: '40px', 
                  height: '12px', 
                  borderRadius: '4px' 
                }} 
              />
            </div>
            
            {/* Bottom Row: Last Message */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
               <div 
                className="skeleton-item"
                style={{ 
                  width: '180px', 
                  height: '14px', 
                  borderRadius: '4px' 
                }} 
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
