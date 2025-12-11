import * as THREE from 'three';

export class CanvasUI {
    constructor(uiScene) {
        this.uiScene = uiScene;
        this.scoreSprite = null;

        this.canvas = document.createElement('canvas');
        this.canvas.width = 256;
        this.canvas.height = 128;
        this.context = this.canvas.getContext('2d');
    }

    updateScore(score) {
        if (this.scoreSprite) {
            this.uiScene.remove(this.scoreSprite);
            this.scoreSprite.material.map.dispose();
            this.scoreSprite.material.dispose();
        }

        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.context.font = 'bold 80px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif';
        this.context.fillStyle = 'white';
        this.context.textAlign = 'center';
        this.context.textBaseline = 'middle';
        this.context.strokeStyle = 'rgba(0,0,0,0.5)';
        this.context.lineWidth = 8;
        this.context.strokeText(score, this.canvas.width / 2, this.canvas.height / 2);
        this.context.fillText(score, this.canvas.width / 2, this.canvas.height / 2);
        
        const texture = new THREE.CanvasTexture(this.canvas);
        const material = new THREE.SpriteMaterial({ map: texture });
        this.scoreSprite = new THREE.Sprite(material);

        this.uiScene.add(this.scoreSprite);
        this.onWindowResize();
    }

    onWindowResize() {
        if (!this.scoreSprite) return;

        const canvasAspect = this.canvas.width / this.canvas.height;
        const spriteHeight = window.innerHeight * 0.15;
        const spriteWidth = spriteHeight * canvasAspect;

        this.scoreSprite.scale.set(spriteWidth, spriteHeight, 1);
        this.scoreSprite.position.set(0, window.innerHeight / 2 - spriteHeight / 2 - 20, 1);
    }
}