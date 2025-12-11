import * as THREE from 'three';

const vertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
varying vec2 vUv;
uniform float u_time;
uniform vec3 u_skyColorTop;
uniform vec3 u_skyColorBottom;
uniform vec3 u_cloudColor;

// 2D Random
float random (vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

// 2D Noise based on Morgan McGuire @morgan3d
// https://www.shadertoy.com/view/4dS3Wd
float noise (vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    vec2 u = f*f*(3.0-2.0*f);
    return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}


float fbm (vec2 st) {
    float value = 0.0;
    float amplitude = .5;
    float frequency = 0.;
    for (int i = 0; i < 6; i++) {
        value += amplitude * noise(st);
        st *= 2.;
        amplitude *= .5;
    }
    return value;
}

void main() {
    vec3 skyColor = mix(u_skyColorBottom, u_skyColorTop, vUv.y);

    vec2 cloudUv = vUv;
    cloudUv.x *= 1.5; // Stretch clouds
    cloudUv.x += u_time * 0.02;

    float cloudPattern = fbm(cloudUv * 2.0);
    cloudPattern = smoothstep(0.4, 0.6, cloudPattern);

    vec3 finalColor = mix(skyColor, u_cloudColor, cloudPattern);

    gl_FragColor = vec4(finalColor, 1.0);
}
`;


export class Sky {
    constructor() {
        this.uniforms = {
            u_time: { value: 0.0 },
            u_skyColorTop: { value: new THREE.Color(0x73b3e8) },
            u_skyColorBottom: { value: new THREE.Color(0xd0e7f9) },
            u_cloudColor: { value: new THREE.Color(0xffffff) },
        };

        const geometry = new THREE.PlaneGeometry(2, 2);
        const material = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            uniforms: this.uniforms,
            depthTest: false,
            depthWrite: false,
        });

        this.mesh = new THREE.Mesh(geometry, material);
    }

    update() {
        this.uniforms.u_time.value += 1 / 60;
    }
}