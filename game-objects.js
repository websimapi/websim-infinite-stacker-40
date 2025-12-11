import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export const BLOCK_HEIGHT = 0.25;
export const ORIGINAL_BLOCK_SIZE = 1;

export function removeObject(scene, world, obj) {
    if (obj.mesh) {
        scene.remove(obj.mesh);
        obj.mesh.geometry.dispose();
        if (obj.mesh.material.dispose) {
             obj.mesh.material.dispose();
        } else if (Array.isArray(obj.mesh.material)) {
            obj.mesh.material.forEach(m => m.dispose());
        }
    }
    if (obj.body) world.removeBody(obj.body);
}


export function createBlock({ x, z, width, depth, type, stack, isGoldenMode }) {
    const isBase = type === 'base';
    const height = isBase ? 20 : BLOCK_HEIGHT;
    const y = isBase ? -height / 2 + BLOCK_HEIGHT / 2 : BLOCK_HEIGHT * stack.length;

    const geometry = new THREE.BoxGeometry(width, height, depth);
    
    let color;
    if (isGoldenMode) {
        color = new THREE.Color(0xFFD700);
    } else {
        color = new THREE.Color(`hsl(${stack.length * 8}, 70%, 50%)`);
    }
    const material = new THREE.MeshLambertMaterial({ color });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    
    let body = null;
    if (type !== 'active' && type !== 'base') {
        const shape = new CANNON.Box(new CANNON.Vec3(width / 2, BLOCK_HEIGHT / 2, depth / 2));
        body = new CANNON.Body({ mass: 0, shape, position: new CANNON.Vec3(x, y, z) });
    }
    
    return { mesh, body, width, depth };
}

export function resizeBlock(block, newWidth, newDepth, world, defaultMaterial) {
    block.width = Math.min(newWidth, ORIGINAL_BLOCK_SIZE * 2);
    block.depth = Math.min(newDepth, ORIGINAL_BLOCK_SIZE * 2);

    const newGeom = new THREE.BoxGeometry(block.width, BLOCK_HEIGHT, block.depth);
    block.mesh.geometry.dispose();
    block.mesh.geometry = newGeom;

    if (block.body) {
        world.removeBody(block.body);
        const newShape = new CANNON.Box(new CANNON.Vec3(block.width / 2, BLOCK_HEIGHT / 2, block.depth / 2));
        const newBody = new CANNON.Body({
            mass: 0,
            shape: newShape,
            position: block.body.position,
            quaternion: block.body.quaternion,
            material: defaultMaterial
        });
        world.addBody(newBody);
        block.body = newBody;
    }
}

export function createOverhang({
    scene, world, activeBlock,
    newX, newZ, newWidth, newDepth,
    overlap, overhangSide, defaultMaterial
}) {
    const direction = activeBlock.userData.direction;
    const overhangWidth = direction === 'x' ? Math.abs(newWidth - overlap) : newWidth;
    const overhangDepth = direction === 'z' ? Math.abs(newDepth - overlap) : newDepth;

    if (overhangWidth < 0.01 || overhangDepth < 0.01) {
        return null;
    }

    const y = activeBlock.position.y;
    const overhangX = direction === 'x' ? newX + (overlap / 2 * overhangSide) + (overhangWidth / 2 * overhangSide) : newX;
    const overhangZ = direction === 'z' ? newZ + (overlap / 2 * overhangSide) + (overhangDepth / 2 * overhangSide) : newZ;

    const geometry = new THREE.BoxGeometry(overhangWidth, BLOCK_HEIGHT, overhangDepth);
    const material = activeBlock.material.clone();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(overhangX, y, overhangZ);
    scene.add(mesh);

    const shape = new CANNON.Box(new CANNON.Vec3(overhangWidth / 2, BLOCK_HEIGHT / 2, overhangDepth / 2));
    const body = new CANNON.Body({
        mass: 1,
        shape,
        position: new CANNON.Vec3(overhangX, y, overhangZ),
        linearDamping: 0.1,
        angularDamping: 0.2,
        material: defaultMaterial
    });

    const speed = activeBlock.userData.speed;
    if (direction === 'x') {
        body.velocity.set(speed * 40 * overhangSide, -1, 0);
    } else {
        body.velocity.set(0, -1, speed * 40 * overhangSide);
    }
    world.addBody(body);

    return {
        mesh,
        body,
        spawnTime: Date.now(),
        stuckCounter: 0,
        originalColor: material.color.clone()
    };
}

export function shatterBlock(overhang, scene, world) {
    const particleCount = 20;
    const particles = [];
    const color = overhang.originalColor || overhang.mesh.material.color;

    for (let i = 0; i < particleCount; i++) {
        const size = Math.random() * 0.08 + 0.04;
        const geometry = new THREE.BoxGeometry(size, size, size);
        const material = new THREE.MeshLambertMaterial({ color });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(overhang.mesh.position);
        scene.add(mesh);

        const shape = new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2));
        const body = new CANNON.Body({
            mass: 0.1,
            shape,
            position: new CANNON.Vec3().copy(overhang.mesh.position),
            linearDamping: 0.3,
            angularDamping: 0.3,
            collisionFilterGroup: 2,
            collisionFilterMask: 0
        });

        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 2;
        body.velocity.set(
            Math.cos(angle) * speed,
            Math.random() * 2 + 1,
            Math.sin(angle) * speed
        );

        world.addBody(body);
        particles.push({ mesh, body, life: 120 });
    }
    return particles;
}

