export class AudioManager {
    constructor() {
        this.sounds = {};
        this.audioContext = null;
        this.masterGain = null;
        this.isUnlocked = false;
    }

    _initializeAudioContext() {
        if (this.audioContext) return;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 1;
        this.masterGain.connect(this.audioContext.destination);
    }

    async loadSound(name, url) {
        this._initializeAudioContext();
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.sounds[name] = audioBuffer;
        } catch (error) {
            console.error(`Failed to load sound ${name}:`, error);
        }
    }

    playSound(name, volume = 1) {
        if (!this.isUnlocked || !this.sounds[name] || !this.audioContext) {
            return;
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = this.sounds[name];
        
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = volume;
        
        source.connect(gainNode);
        gainNode.connect(this.masterGain);
        
        source.start(0);
    }

    unlockAudio() {
        if (this.isUnlocked || !this.audioContext) return;
        
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().then(() => {
                this.isUnlocked = true;
            });
        } else {
            this.isUnlocked = true;
        }
    }
}

