import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { 
    BLOCK_HEIGHT, 
    ORIGINAL_BLOCK_SIZE,
    createBlock, 
    resizeBlock, 
    createOverhang, 
    shatterBlock,
    removeObject 
} from './game-objects.js';

export class Game {
    constructor(scene, world, defaultMaterial, camera, callbacks, audioManager) {
        this.scene = scene;
        this.world = world;
        this.defaultMaterial = defaultMaterial;
        this.camera = camera;
        this.callbacks = callbacks;
        this.audioManager = audioManager;

        this.stack = [];
        this.overhangs = [];
        this.activeBlock = null;
        this.gameState = 'loading';
        this.perfectStreak = 0;
        this.goldenStreak = 0;
        this.isGoldenMode = false;
        this.replayRecorder = null;
        this.gameOverAnimation = {
            active: false,
            startTime: 0,
            duration: 1500, // ms
            initialCamera: { y: 0, top: 0, lookAtY: 0 },
            targetCamera: { y: 0, top: 0, lookAtY: 0 }
        };
    }

    start(replayRecorder) {
        this.replayRecorder = replayRecorder;
        this.addBlock(0, 0, ORIGINAL_BLOCK_SIZE, ORIGINAL_BLOCK_SIZE, 'base');
        this.spawnNewBlock();
        this.gameState = 'playing';
    }

    restart() {
        this.overhangs.forEach(o => removeObject(this.scene, this.world, o));
        this.stack.forEach(b => removeObject(this.scene, this.world, b));
        if (this.activeBlock) {
            this.scene.remove(this.activeBlock);
            this.activeBlock.geometry.dispose();
            this.activeBlock.material.dispose();
            this.activeBlock = null;
        }

        this.stack = [];
        this.overhangs = [];
        this.perfectStreak = 0;
        this.goldenStreak = 0;
        this.isGoldenMode = false;
        this.callbacks.onStreakUpdate(0, false);
        this.replayRecorder = null;

        this.camera.position.set(4, 4, 4);
        this.camera.lookAt(0, 0, 0);
    }

    getState() {
        return this.gameState;
    }

    getScore() {
        return this.stack.length > 0 ? this.stack.length - 1 : 0;
    }

    getReplayRecorder() {
        return this.replayRecorder;
    }

    onPointerDown() {
        if (this.gameState === 'playing') {
            this.placeBlock();
        }
    }

    addBlock(x, z, width, depth, type) {
        const block = createBlock({
            x, z, width, depth, type,
            stack: this.stack,
            isGoldenMode: this.isGoldenMode
        });
        
        if (type === 'active') {
            this.activeBlock = block.mesh;
            this.scene.add(this.activeBlock);
        } else {
            const blockData = { mesh: block.mesh, width, depth, body: block.body };
            this.scene.add(block.mesh);
            if(block.body) {
                block.body.material = this.defaultMaterial;
                this.world.addBody(block.body);
            }
            this.stack.push(blockData);
        }
    }

    spawnNewBlock() {
        if (this.stack.length === 0) return;
        const prevBlock = this.stack[this.stack.length - 1];
        const direction = this.stack.length % 2 === 0 ? 'z' : 'x';
        const newWidth = prevBlock.width;
        const newDepth = prevBlock.depth;

        const x = direction === 'x' ? -2 : prevBlock.mesh.position.x;
        const z = direction === 'z' ? -2 : prevBlock.mesh.position.z;

        this.addBlock(x, z, newWidth, newDepth, 'active');
        this.activeBlock.userData.direction = direction;
        this.activeBlock.userData.speed = 0.02 + this.stack.length * 0.001;
    }

    placeBlock() {
        if (!this.activeBlock) return;

        const prevBlock = this.stack[this.stack.length - 1];
        const direction = this.activeBlock.userData.direction;

        let overlap, overhangSide;
        let newWidth, newDepth;

        if (direction === 'x') {
            const activePos = this.activeBlock.position.x;
            const prevPos = prevBlock.mesh.position.x;
            overlap = prevBlock.width - Math.abs(activePos - prevPos);
            overhangSide = activePos > prevPos ? 1 : -1;
            newWidth = overlap;
            newDepth = prevBlock.depth;
        } else {
            const activePos = this.activeBlock.position.z;
            const prevPos = prevBlock.mesh.position.z;
            overlap = prevBlock.depth - Math.abs(activePos - prevPos);
            overhangSide = activePos > prevPos ? 1 : -1;
            newWidth = prevBlock.width;
            newDepth = overlap;
        }

        if (overlap <= 0) {
            this.resetStreaks();
            this.gameOver();
            return;
        }

        const isPerfect = (direction === 'x' && newWidth >= prevBlock.width * 0.95) ||
                          (direction === 'z' && newDepth >= prevBlock.depth * 0.95);

        let newX = prevBlock.mesh.position.x;
        let newZ = prevBlock.mesh.position.z;

        if (isPerfect) {
            if (direction === 'x') newWidth = prevBlock.width;
            else newDepth = prevBlock.depth;
        } else {
             newX = (direction === 'x' ? (this.activeBlock.position.x + prevBlock.mesh.position.x) / 2 : prevBlock.mesh.position.x);
             newZ = (direction === 'z' ? (this.activeBlock.position.z + prevBlock.mesh.position.z) / 2 : prevBlock.mesh.position.z);
        }

        this.scene.remove(this.activeBlock);
        this.addBlock(newX, newZ, newWidth, newDepth, 'stacked');

        if (!isPerfect) {
            const overhang = createOverhang({
                scene: this.scene, world: this.world, activeBlock: this.activeBlock,
                newX, newZ, newWidth: prevBlock.width, newDepth: prevBlock.depth,
                overlap, overhangSide, defaultMaterial: this.defaultMaterial
            });
            if (overhang) this.overhangs.push(overhang);
        }

        this.handleStreak(isPerfect);

        // Keep a copy of the camera's lookAt vector before changing it.
        const currentLookAt = new THREE.Vector3();
        this.camera.getWorldDirection(currentLookAt);
        currentLookAt.multiplyScalar(10).add(this.camera.position);

        this.gameOverAnimation.initialCamera.lookAtY = currentLookAt.y;


        if (isPerfect && this.isGoldenMode) {
             const placedBlock = this.stack[this.stack.length - 1];
             resizeBlock(placedBlock, placedBlock.width * 1.05, placedBlock.depth * 1.05, this.world, this.defaultMaterial);
        }

        this.activeBlock = null;
        this.callbacks.onScoreUpdate(this.stack.length - 1);
        this.audioManager.playSound('place', 0.8);
        this.spawnNewBlock();
    }
    
    handleStreak(isPerfect) {
        if (isPerfect) {
            let currentStreakCount;
            if (this.isGoldenMode) {
                this.goldenStreak++;
                currentStreakCount = this.goldenStreak;
                if (this.goldenStreak >= 5) {
                    this.resetStreaks();
                }
            } else {
                this.perfectStreak++;
                currentStreakCount = this.perfectStreak;
                if (this.perfectStreak >= 5) {
                    this.perfectStreak = 0;
                    this.isGoldenMode = true;
                }
            }
            this.callbacks.onStreakUpdate(currentStreakCount, this.isGoldenMode, true);
        } else {
            this.resetStreaks();
        }
    }

    resetStreaks() {
        this.perfectStreak = 0;
        this.goldenStreak = 0;
        this.isGoldenMode = false;
        this.callbacks.onStreakUpdate(0, false, false);
    }

    gameOver() {
        if (this.gameState === 'gameover') return;

        this.gameState = 'gameover';
        this.audioManager.playSound('fail');
        this.resetStreaks();

        if (this.activeBlock) {
            const { width, depth } = this.activeBlock.geometry.parameters;
            const shape = new CANNON.Box(new CANNON.Vec3(width / 2, BLOCK_HEIGHT / 2, depth / 2));
            const body = new CANNON.Body({ mass: 1, shape, position: new CANNON.Vec3().copy(this.activeBlock.position) });
            body.velocity.x = this.activeBlock.userData.speed * 50;
            this.world.addBody(body);

            this.overhangs.push({ 
                mesh: this.activeBlock, 
                body: body, 
                spawnTime: Date.now(),
                originalColor: this.activeBlock.material.color.clone()
            });
            this.activeBlock = null;
        }

        const score = this.getScore();
        const towerHeight = score * BLOCK_HEIGHT;
        const currentFrustumHeight = this.camera.top * 2;

        if (towerHeight > currentFrustumHeight * 0.9) { // if tower is taller than 90% of view
            this.gameOverAnimation.active = true;
            this.gameOverAnimation.startTime = Date.now();
            this.gameOverAnimation.initialCamera.y = this.camera.position.y;
            this.gameOverAnimation.initialCamera.top = this.camera.top;
            
            this.gameOverAnimation.targetCamera.top = (towerHeight + 1.5) / 2; // Add more padding
            this.gameOverAnimation.targetCamera.y = towerHeight / 2 + 4;
            this.gameOverAnimation.targetCamera.lookAtY = towerHeight / 2;

            setTimeout(() => {
                this.gameOverAnimation.active = false;
                this.callbacks.onGameOver(score);
            }, this.gameOverAnimation.duration + 500); // 500ms pause after animation
        } else {
            setTimeout(() => {
                this.callbacks.onGameOver(score);
            }, 1000); // 1s pause for short towers
        }
    }

    update() {
        if (this.gameState === 'playing' && this.activeBlock) {
            this.updateActiveBlock();
        }
        if (this.gameState === 'gameover' && this.gameOverAnimation.active) {
            this.updateGameOverAnimation();
        }
        this.updateOverhangs();
    }

    updateActiveBlock() {
        const speed = this.activeBlock.userData.speed;
        if (this.activeBlock.userData.direction === 'x') {
            this.activeBlock.position.x += speed;
            if (this.activeBlock.position.x > 2 || this.activeBlock.position.x < -2) {
                this.activeBlock.userData.speed *= -1;
            }
        } else {
            this.activeBlock.position.z += speed;
            if (this.activeBlock.position.z > 2 || this.activeBlock.position.z < -2) {
                this.activeBlock.userData.speed *= -1;
            }
        }

        const targetCameraY = BLOCK_HEIGHT * this.stack.length + 4;
        this.camera.position.y += (targetCameraY - this.camera.position.y) * 0.1;

        const lookAtY = (this.stack.length > 10) ? BLOCK_HEIGHT * (this.stack.length - 5) : BLOCK_HEIGHT * this.stack.length * 0.5;
        this.camera.lookAt(0, lookAtY, 0);
        this.gameOverAnimation.initialCamera.lookAtY = lookAtY;
    }

    updateGameOverAnimation() {
        const elapsed = Date.now() - this.gameOverAnimation.startTime;
        let progress = elapsed / this.gameOverAnimation.duration;
        progress = Math.min(progress, 1);
        // Ease out quint
        progress = 1 - Math.pow(1 - progress, 5);

        const { initialCamera, targetCamera } = this.gameOverAnimation;
        
        // Interpolate camera position
        const newY = initialCamera.y + (targetCamera.y - initialCamera.y) * progress;
        this.camera.position.y = newY;

        // Interpolate lookAt
        const newLookAtY = initialCamera.lookAtY + (targetCamera.lookAtY - initialCamera.lookAtY) * progress;
        this.camera.lookAt(0, newLookAtY, 0);

        // Interpolate frustum size (zoom)
        const newTop = initialCamera.top + (targetCamera.top - initialCamera.top) * progress;
        const aspect = window.innerWidth / window.innerHeight;
        this.camera.top = newTop;
        this.camera.bottom = -newTop;
        this.camera.left = -newTop * aspect;
        this.camera.right = newTop * aspect;
        this.camera.updateProjectionMatrix();
    }

    updateOverhangs() {
        const newOverhangs = [];
        for (const overhang of this.overhangs) {
            if (this.handleStuckOrFallen(overhang)) {
                newOverhangs.push(overhang);
            }
        }
        this.overhangs = newOverhangs;
    }

    handleStuckOrFallen(overhang) {
        overhang.mesh.position.copy(overhang.body.position);
        overhang.mesh.quaternion.copy(overhang.body.quaternion);

        // Particle logic
        if (overhang.life !== undefined) {
            overhang.life--;
            if (overhang.life <= 0 || overhang.mesh.position.y < -10) {
                removeObject(this.scene, this.world, overhang);
                return false;
            }
            return true;
        }

        // Off-screen cleanup
        if (overhang.mesh.position.y < -10) {
            removeObject(this.scene, this.world, overhang);
            return false;
        }

        // Stuck logic
        const timeSinceSpawn = Date.now() - overhang.spawnTime;
        const hasntFallenMuch = overhang.body.position.y >= overhang.mesh.position.y - 0.3;

        if (timeSinceSpawn > 1500 && hasntFallenMuch) {
            const particles = shatterBlock(overhang, this.scene, this.world);
            this.overhangs.push(...particles);
            removeObject(this.scene, this.world, overhang);
            return false;
        }

        return true;
    }
}