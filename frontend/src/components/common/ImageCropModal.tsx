import { useCallback, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Loader2, ZoomIn } from 'lucide-react';
import { getCroppedImageBlob } from '../../utils/cropImage';

interface ImageCropModalProps {
  imageSrc: string;
  onCropped: (file: File) => void;
  onClose: () => void;
  cropShape?: 'round' | 'rect';
  fileName?: string;
}

/**
 * Shared crop step for avatar/group-photo uploads — mirrors mobile's
 * native `allowsEditing` crop screen (expo-image-picker), which the web
 * upload flow never had at all until now.
 */
export const ImageCropModal = ({
  imageSrc,
  onCropped,
  onClose,
  cropShape = 'round',
  fileName = 'photo.jpg',
}: ImageCropModalProps) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    setIsSaving(true);
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels);
      onCropped(new File([blob], fileName, { type: 'image/jpeg' }));
    } catch (err) {
      console.error('Failed to crop image:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: '#111b21',
          borderRadius: '12px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ height: '360px', position: 'relative', backgroundColor: '#0b141a' }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape={cropShape}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>

        <div
          style={{
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ZoomIn size={18} color="#8696a0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ flex: 1, accentColor: '#00a884' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={onClose}
              disabled={isSaving}
              style={{
                flex: 1,
                background: 'none',
                border: '1px solid #8696a0',
                color: '#e9edef',
                borderRadius: '8px',
                padding: '12px',
                cursor: isSaving ? 'default' : 'pointer',
                fontSize: '15px',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !croppedAreaPixels}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: '#00a884',
                border: 'none',
                color: '#0b141a',
                borderRadius: '8px',
                padding: '12px',
                cursor: isSaving ? 'default' : 'pointer',
                fontWeight: 500,
                fontSize: '15px',
                opacity: !croppedAreaPixels ? 0.5 : 1,
              }}
            >
              {isSaving && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
