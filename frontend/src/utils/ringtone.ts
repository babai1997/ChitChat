// Ringtone utility for call notifications
class RingtoneManager {
  private static instance: RingtoneManager;
  private ringtoneAudio: HTMLAudioElement | null = null;
  private callingAudio: HTMLAudioElement | null = null;

  private constructor() {
    // Initialize ringtone audio elements
    if (typeof window !== 'undefined') {
      // Incoming call ringtone
      this.ringtoneAudio = new Audio('/ringtone.mp3');
      this.ringtoneAudio.loop = true;
      this.ringtoneAudio.volume = 0.7;
      
      // Outgoing call tone (dial tone)
      this.callingAudio = new Audio('/calling.mp3');
      this.callingAudio.loop = true;
      this.callingAudio.volume = 0.5;
    }
  }

  public static getInstance(): RingtoneManager {
    if (!RingtoneManager.instance) {
      RingtoneManager.instance = new RingtoneManager();
    }
    return RingtoneManager.instance;
  }

  public playRingtone(): void {
    if (this.ringtoneAudio) {
      this.ringtoneAudio.currentTime = 0;
      this.ringtoneAudio.play().catch((err) => {
        console.warn('Could not play ringtone:', err);
      });
    }
  }

  public stopRingtone(): void {
    if (this.ringtoneAudio) {
      this.ringtoneAudio.pause();
      this.ringtoneAudio.currentTime = 0;
    }
  }

  public playCallingTone(): void {
    if (this.callingAudio) {
      this.callingAudio.currentTime = 0;
      this.callingAudio.play().catch((err) => {
        console.warn('Could not play calling tone:', err);
      });
    }
  }

  public stopCallingTone(): void {
    if (this.callingAudio) {
      this.callingAudio.pause();
      this.callingAudio.currentTime = 0;
    }
  }

  public stopAll(): void {
    this.stopRingtone();
    this.stopCallingTone();
  }
}

export const ringtoneManager = RingtoneManager.getInstance();
