import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Play, Pause } from 'lucide-react-native';
import { Audio } from 'expo-av';

export default function AudioPlayer({ uri, isOwn }: { uri: string; isOwn: boolean }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);

  useEffect(() => {
    let currentSound: Audio.Sound | null = null;
    let isMounted = true;

    const loadMetadata = async () => {
      try {
        const { sound: newSound, status } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: false },
          (statusUpdate) => {
            if (isMounted) onPlaybackStatusUpdate(statusUpdate);
          }
        );
        if (isMounted) {
          if (status.isLoaded) {
            setDuration(status.durationMillis || 0);
          }
          currentSound = newSound;
          setSound(newSound);
        } else {
          newSound.unloadAsync();
        }
      } catch (e) {
        console.error('Failed to load sound metadata', e);
      }
    };

    loadMetadata();

    return () => {
      isMounted = false;
      if (currentSound) {
        currentSound.unloadAsync().catch(() => {});
      } else if (sound) {
        sound.unloadAsync().catch(() => {});
      }
    };
  }, [uri]);

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setDuration(status.durationMillis || 0);
      setPosition(status.positionMillis || 0);
      setIsPlaying(status.isPlaying);
      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
        sound?.setPositionAsync(0).catch(() => {});
      }
    }
  };

  const loadSound = async () => {
    if (sound) {
      await sound.playAsync();
      setIsPlaying(true);
    }
  };

  const [playbackRate, setPlaybackRate] = useState(1.0);

  const handlePlayPause = async () => {
    if (!sound) {
      await loadSound();
    } else {
      if (isPlaying) {
        await sound.pauseAsync();
      } else {
        await sound.playAsync();
      }
    }
  };

  const togglePlaybackRate = async () => {
    let newRate = 1.0;
    if (playbackRate === 1.0) newRate = 1.5;
    else if (playbackRate === 1.5) newRate = 2.0;
    else newRate = 1.0;

    setPlaybackRate(newRate);
    if (sound) {
      await sound.setRateAsync(newRate, true);
    }
  };

  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Default duration visual before loading if we don't have it
  const displayTime = duration > 0 
    ? formatTime(isPlaying || position > 0 ? position : duration) 
    : '0:00';

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  // Fake waveform pattern
  const WAVEFORM = [
    3, 5, 8, 12, 15, 20, 24, 18, 12, 8, 5, 10, 16, 22, 28, 24, 18, 12, 8, 5, 
    8, 14, 20, 26, 22, 16, 10, 6, 4, 8, 14, 22, 28, 30, 24, 16, 10, 6, 4, 3
  ];

  const playedColor = isOwn ? '#7edcf5' : '#00a884';
  const unplayedColor = isOwn ? 'rgba(233,248,245,0.3)' : 'rgba(134,150,160,0.3)';

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={handlePlayPause} style={styles.playButton}>
          {isPlaying ? (
            <Pause size={28} fill="#8696a0" color="#8696a0" />
          ) : (
            <Play size={28} fill="#8696a0" color="#8696a0" style={{ marginLeft: 3 }} />
          )}
        </TouchableOpacity>

        <View style={styles.timelineContainer}>
          <View style={styles.waveformContainer}>
            {WAVEFORM.map((height, i) => {
              const barProgress = (i / WAVEFORM.length) * 100;
              const isPlayed = barProgress <= progress;
              return (
                <View
                  key={i}
                  style={[
                    styles.waveformBar,
                    { height, backgroundColor: isPlayed ? playedColor : unplayedColor }
                  ]}
                />
              );
            })}
            {/* Progress Knob */}
            <View style={[styles.progressKnob, { left: `${progress}%`, backgroundColor: playedColor }]} />
          </View>
        </View>

        <TouchableOpacity onPress={togglePlaybackRate} style={styles.speedButton}>
          <Text style={styles.speedText}>{playbackRate}x</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomRow}>
        <Text style={[styles.timeText, { color: '#8696a0' }]}>
          {displayTime}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 250,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomRow: {
    flexDirection: 'row',
    paddingLeft: 48,
    marginTop: -4,
  },
  playButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineContainer: {
    flex: 1,
    marginLeft: 4,
    marginRight: 8,
    justifyContent: 'center',
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 30,
    position: 'relative',
    width: '100%',
  },
  waveformBar: {
    flex: 1,
    marginHorizontal: 1,
    borderRadius: 2,
  },
  progressKnob: {
    width: 12,
    height: 12,
    borderRadius: 6,
    position: 'absolute',
    top: 9,
    transform: [{ translateX: -6 }],
  },
  timeText: {
    fontSize: 11,
    marginTop: 4,
  },
  speedButton: {
    backgroundColor: '#2a3942',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 4,
  },
  speedText: {
    color: '#8696a0',
    fontSize: 12,
    fontWeight: '600',
  },
});
