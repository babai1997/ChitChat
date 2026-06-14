import wave
import struct
import math

def generate_tone(filename, freqs, duration_sec, sample_rate=44100, pattern=None):
    obj = wave.open(filename, 'w')
    obj.setnchannels(1)
    obj.setsampwidth(2)
    obj.setframerate(sample_rate)

    num_samples = int(sample_rate * duration_sec)
    for i in range(num_samples):
        t = float(i) / sample_rate
        
        # apply pattern (on/off)
        if pattern:
            cycle_time = pattern['on'] + pattern['off']
            pos = t % cycle_time
            if pos > pattern['on']:
                value = 0
            else:
                value = sum([math.sin(2.0 * math.pi * f * t) for f in freqs]) / len(freqs)
        else:
            value = sum([math.sin(2.0 * math.pi * f * t) for f in freqs]) / len(freqs)
            
        data = struct.pack('<h', int(value * 32767.0 * 0.5))
        obj.writeframesraw(data)
    
    obj.close()

# Dialing tone (US standard: 440Hz + 480Hz, 2 sec on, 4 sec off)
generate_tone('assets/audio/outgoing.wav', [440, 480], duration_sec=12, pattern={'on': 2.0, 'off': 4.0})

# Ringtone (UK style ring: 400Hz + 450Hz, 0.4s on, 0.2s off, 0.4s on, 2s off)
def generate_ringtone(filename, freqs, duration_sec, sample_rate=44100):
    obj = wave.open(filename, 'w')
    obj.setnchannels(1)
    obj.setsampwidth(2)
    obj.setframerate(sample_rate)

    num_samples = int(sample_rate * duration_sec)
    for i in range(num_samples):
        t = float(i) / sample_rate
        cycle_time = 3.0
        pos = t % cycle_time
        
        if (0 <= pos <= 0.4) or (0.6 <= pos <= 1.0):
            value = sum([math.sin(2.0 * math.pi * f * t) for f in freqs]) / len(freqs)
        else:
            value = 0
            
        data = struct.pack('<h', int(value * 32767.0 * 0.5))
        obj.writeframesraw(data)
    
    obj.close()

generate_ringtone('assets/audio/incoming.wav', [400, 450], duration_sec=15)
print("Audio generated")
