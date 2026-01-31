import { useRef, useState } from 'react';
import { Camera, Upload } from 'lucide-react';

interface AvatarUploadProps {
  currentAvatarUrl: string | null;
  onUpload: (file: File) => Promise<void>;
  isUploading: boolean;
}

export const AvatarUpload = ({ currentAvatarUrl, onUpload, isUploading }: AvatarUploadProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatarUrl);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Create local preview
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    try {
      await onUpload(file);
    } catch (error) {
      // Revert preview on error
      setPreviewUrl(currentAvatarUrl);
      console.error('Upload failed:', error);
    }
  };

  return (
    <div className="relative group w-32 h-32 mx-auto">
      <div className="w-full h-full rounded-full overflow-hidden bg-gray-700 border-4 border-[#202c33] relative">
        {previewUrl ? (
          <img 
            src={previewUrl} 
            alt="Profile Avatar" 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-600">
            <Camera size={40} className="text-gray-400" />
          </div>
        )}
        
        {/* Overlay */}
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        >
          {isUploading ? (
            <div className="w-6 h-6 border-2 border-white/50 border-t-white rounded-full animate-spin" />
          ) : (
            <Upload className="text-white w-8 h-8" />
          )}
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/png,image/jpeg,image/jpg"
        className="hidden"
      />
    </div>
  );
};
