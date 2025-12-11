export class ReplayRecorder {
    constructor(canvas, audioManager, fps = 30) {
        this.sourceCanvas = canvas;
        this.audioManager = audioManager;
        this.chunks = [];
        this.isRecording = false;
        this.mediaRecorder = null;
        this.recordPromise = null;
        this.audioDestination = null;
        this.animationFrameId = null;

        // Setup 9:16 Recording Canvas (Mobile Shorts Format)
        this.width = 1080;
        this.height = 1920;
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.ctx = this.canvas.getContext('2d');

        // Load QR Code
        this.qrImage = new Image();
        this.qrImage.crossOrigin = "Anonymous";
        this.qrImage.src = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://stacker.on.websim.com&bgcolor=ffffff&color=000000&margin=0";

        try {
            const videoStream = this.canvas.captureStream(fps);
            
            // Create audio destination node if audio context is available
            let combinedStream = videoStream;
            if (this.audioManager?.audioContext && this.audioManager?.masterGain) {
                this.audioDestination = this.audioManager.audioContext.createMediaStreamDestination();
                this.audioManager.masterGain.connect(this.audioDestination);
                
                // Combine video and audio tracks
                const audioTrack = this.audioDestination.stream.getAudioTracks()[0];
                if (audioTrack) {
                    combinedStream = new MediaStream([
                        ...videoStream.getVideoTracks(),
                        audioTrack
                    ]);
                }
            }
            
            const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;

            const mimeTypes = isFirefox 
            ? [ // Prioritize VP8 for Firefox for better compatibility
                'video/webm;codecs=vp8,opus',
                'video/webm;codecs=vp8',
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=vp9',
                'video/webm',
            ]
            : [ // Default order for other browsers
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=vp8,opus',
                'video/webm;codecs=vp9',
                'video/webm;codecs=vp8',
                'video/webm',
            ];
            
            const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));

            if (!supportedMimeType) {
                console.error("No supported mimeType for MediaRecorder");
                return;
            }

            this.mediaRecorder = new MediaRecorder(combinedStream, {
                mimeType: supportedMimeType,
                videoBitsPerSecond: isFirefox ? undefined : 5000000,
            });

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.chunks.push(e.data);
                }
            };

            this.recordPromise = new Promise((resolve) => {
                this.mediaRecorder.onstop = () => {
                    const blob = new Blob(this.chunks, { type: supportedMimeType });
                    this.chunks = [];
                    
                    // Disconnect audio destination
                    if (this.audioDestination && this.audioManager?.masterGain) {
                        this.audioManager.masterGain.disconnect(this.audioDestination);
                    }
                    
                    resolve(blob);
                };
            });

            this.mediaRecorder.start();
            this.isRecording = true;
            this.drawFrame();

        } catch (e) {
            console.error("Error initializing MediaRecorder:", e);
        }
    }

    drawFrame() {
        if (!this.isRecording) return;

        const ctx = this.ctx;
        
        // 1. Background
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, this.width, this.height);

        // 2. Draw Game Canvas (Center fit)
        if (this.sourceCanvas.width > 0 && this.sourceCanvas.height > 0) {
            const srcAspect = this.sourceCanvas.width / this.sourceCanvas.height;
            const destAspect = this.width / this.height;
            
            let renderW, renderH, renderX, renderY;

            // Fit inside logic
            if (srcAspect > destAspect) {
                renderW = this.width;
                renderH = this.width / srcAspect;
                renderX = 0;
                renderY = (this.height - renderH) / 2;
            } else {
                renderH = this.height;
                renderW = this.height * srcAspect;
                renderX = (this.width - renderW) / 2;
                renderY = 0;
            }
            
            ctx.drawImage(this.sourceCanvas, renderX, renderY, renderW, renderH);
        }

        // 3. Draw QR Overlay
        if (this.qrImage.complete && this.qrImage.naturalWidth > 0) {
             const padding = 20;
             const boxPadding = 8;
             const qrSize = 80;
             const fontSize = 10;
             const textGap = 4;
             
             const boxW = qrSize + boxPadding * 2;
             const boxH = qrSize + boxPadding * 2 + fontSize + textGap;
             
             const boxX = this.width - boxW - padding;
             const boxY = this.height - boxH - padding;
             
             // Shadow
             ctx.save();
             ctx.shadowColor = 'rgba(0,0,0,0.5)';
             ctx.shadowBlur = 6;
             ctx.shadowOffsetY = 4;
             
             // Background Box
             ctx.fillStyle = 'white';
             if (ctx.roundRect) {
                 ctx.beginPath();
                 ctx.roundRect(boxX, boxY, boxW, boxH, 8);
                 ctx.fill();
             } else {
                 ctx.fillRect(boxX, boxY, boxW, boxH);
             }
             ctx.restore();
             
             // QR Image
             ctx.drawImage(this.qrImage, boxX + boxPadding, boxY + boxPadding, qrSize, qrSize);
             
             // Text
             ctx.fillStyle = 'black';
             ctx.font = `bold ${fontSize}px Arial, sans-serif`;
             ctx.textAlign = 'center';
             ctx.textBaseline = 'top';
             ctx.fillText("PLAY NOW", boxX + boxW / 2, boxY + boxPadding + qrSize + textGap);
        }

        this.animationFrameId = requestAnimationFrame(() => this.drawFrame());
    }

    stop() {
        if (this.isRecording && this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        this.isRecording = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    async getReplayBlob() {
        if (!this.recordPromise) {
            return null;
        }
        return this.recordPromise;
    }
}