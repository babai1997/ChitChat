

export const ChatViewSkeleton = () => {
  return (
    <div style={{ padding: '0', display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', width: '100%', overflow: 'hidden' }}>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          .skeleton-message {
            background: linear-gradient(90deg, #202c33 25%, #2a3942 50%, #202c33 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite;
          }
        `}} />
      
      {/* Simulate a conversation with alternating message bubbles - Filling the page */}
      
      {/* 1. Left */}
      <div style={{ alignSelf: 'flex-start', maxWidth: '60%' }}>
        <div 
          className="skeleton-message"
          style={{ width: '180px', height: '40px', borderRadius: '0 12px 12px 12px' }} 
        />
        <div className="skeleton-message" style={{ width: '50px', height: '10px', marginTop: '4px', borderRadius: '4px' }} />
      </div>

      {/* 2. Right */}
      <div style={{ alignSelf: 'flex-end', maxWidth: '60%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <div 
          className="skeleton-message"
          style={{ width: '140px', height: '40px', borderRadius: '12px 0 12px 12px', opacity: 0.8 }} 
        />
        <div className="skeleton-message" style={{ width: '50px', height: '10px', marginTop: '4px', borderRadius: '4px' }} />
      </div>

      {/* 3. Left */}
      <div style={{ alignSelf: 'flex-start', maxWidth: '60%' }}>
        <div 
          className="skeleton-message"
          style={{ width: '220px', height: '60px', borderRadius: '0 12px 12px 12px' }} 
        />
          <div className="skeleton-message" style={{ width: '50px', height: '10px', marginTop: '4px', borderRadius: '4px' }} />
      </div>

       {/* 4. Right */}
       <div style={{ alignSelf: 'flex-end', maxWidth: '60%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <div 
          className="skeleton-message"
          style={{ width: '200px', height: '36px', borderRadius: '12px 0 12px 12px', opacity: 0.8 }} 
        />
         <div className="skeleton-message" style={{ width: '50px', height: '10px', marginTop: '4px', borderRadius: '4px' }} />
      </div>
      
      {/* 5. Left */}
       <div style={{ alignSelf: 'flex-start', maxWidth: '60%' }}>
        <div 
          className="skeleton-message"
          style={{ width: '100px', height: '36px', borderRadius: '0 12px 12px 12px' }} 
        />
          <div className="skeleton-message" style={{ width: '50px', height: '10px', marginTop: '4px', borderRadius: '4px' }} />
      </div>

      {/* 6. Right */}
      <div style={{ alignSelf: 'flex-end', maxWidth: '60%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <div 
          className="skeleton-message"
          style={{ width: '160px', height: '45px', borderRadius: '12px 0 12px 12px', opacity: 0.8 }} 
        />
        <div className="skeleton-message" style={{ width: '50px', height: '10px', marginTop: '4px', borderRadius: '4px' }} />
      </div>

      {/* 7. Left */}
      <div style={{ alignSelf: 'flex-start', maxWidth: '60%' }}>
        <div 
          className="skeleton-message"
          style={{ width: '250px', height: '70px', borderRadius: '0 12px 12px 12px' }} 
        />
        <div className="skeleton-message" style={{ width: '50px', height: '10px', marginTop: '4px', borderRadius: '4px' }} />
      </div>

      {/* 8. Right */}
      <div style={{ alignSelf: 'flex-end', maxWidth: '60%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <div 
          className="skeleton-message"
          style={{ width: '120px', height: '36px', borderRadius: '12px 0 12px 12px', opacity: 0.8 }} 
        />
        <div className="skeleton-message" style={{ width: '50px', height: '10px', marginTop: '4px', borderRadius: '4px' }} />
      </div>

    </div>
  );
};
