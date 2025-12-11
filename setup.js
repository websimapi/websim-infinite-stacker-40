import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Sky } from './sky.js';

export function setupScene() {
    const scene = new THREE.Scene();
    const world = new CANNON.World({
        gravity: new CANNON.Vec3(0, -9.82, 0),
        allowSleep: true,
    });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.solver.iterations = 20;

    const defaultMaterial = new CANNON.Material('default');
    const contactMaterial = new CANNON.ContactMaterial(defaultMaterial, defaultMaterial, {
        friction: 0.4,
        restitution: 0.3,
    });
    world.addContactMaterial(contactMaterial);
    world.defaultContactMaterial = contactMaterial;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(10, 20, 0);
    scene.add(dirLight);

    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = 4;
    const camera = new THREE.OrthographicCamera(frustumSize * aspect / -2, frustumSize * aspect / 2, frustumSize / 2, frustumSize / -2, 1, 100);
    camera.position.set(4, 4, 4);
    camera.lookAt(0, 0, 0);
    scene.add(camera);

    const canvas = document.getElementById('game-canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.autoClear = false;

    const uiScene = new THREE.Scene();
    const uiCamera = new THREE.OrthographicCamera(
        -window.innerWidth / 2,
        window.innerWidth / 2,
        window.innerHeight / 2,
        -window.innerHeight / 2,
        1,
        1000
    );
    uiCamera.position.z = 10;
    
    // Setup sky in its own scene
    const sky = new Sky();
    const skyScene = new THREE.Scene();
    skyScene.add(sky.mesh);
    const skyCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    return { scene, world, camera, renderer, defaultMaterial, uiScene, uiCamera, sky, skyScene, skyCamera };
}