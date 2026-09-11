"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/* ─────────────────────────────────────────────────────────────────────────
   The hero's light. Two layers, both additive over the near-black ground:

     1. an aurora — one fullscreen plane running fbm value noise, banded to the
        upper half so the headline never sits on top of a bright fold;
     2. a drifting particle field with a little depth, parallaxed by the pointer.

   Both layers blend normally with an alpha ramp rather than additively. Over
   black, additive IS light — it only ever brightens. Over white there is no
   headroom left to add to, so the same material renders as nothing at all; the
   colour has to be painted on with alpha instead.

   Deliberately no post-processing pass. Bloom would look the part but pulls in
   a second render target at full resolution, and on the mid-range Android this
   page is mostly read on that is the difference between 60fps and 30.
   ───────────────────────────────────────────────────────────────────────── */

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec2  uPointer;
  varying vec2  vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p  = uv * vec2(2.4, 1.5) + uPointer * 0.10;
    float t = uTime * 0.045;

    // Domain-warped fbm: the second fbm displaces the first, which is what
    // turns even bands into something that reads as moving light.
    float n = fbm(p + vec2(t, -t * 0.6) + fbm(p * 1.7 - t * 0.35));

    float band = smoothstep(0.98, 0.10, uv.y);
    float glow = pow(n, 2.5) * band;

    vec3 indigo = vec3(0.310, 0.275, 0.898);
    vec3 violet = vec3(0.655, 0.616, 1.000);
    vec3 col    = mix(indigo, violet, smoothstep(0.30, 0.82, n));

    float d = distance(uv, vec2(0.5, 0.88));
    float a = glow * smoothstep(1.10, 0.05, d) * 0.42;

    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  }
`;

function Aurora() {
    const mat = useRef<THREE.ShaderMaterial>(null);
    const { viewport } = useThree();

    const uniforms = useMemo(
        () => ({
            uTime: { value: 0 },
            uPointer: { value: new THREE.Vector2(0, 0) },
        }),
        [],
    );

    useFrame((state, delta) => {
        if (!mat.current) return;
        uniforms.uTime.value += delta;
        // Ease toward the pointer instead of tracking it, so a fast flick reads
        // as the light swinging rather than snapping.
        uniforms.uPointer.value.lerp(state.pointer, 0.04);
    });

    return (
        <mesh scale={[viewport.width, viewport.height, 1]}>
            <planeGeometry args={[1, 1]} />
            <shaderMaterial
                ref={mat}
                uniforms={uniforms}
                vertexShader={VERTEX}
                fragmentShader={FRAGMENT}
                transparent
                depthWrite={false}
            />
        </mesh>
    );
}

function Particles({ count }: { count: number }) {
    const points = useRef<THREE.Points>(null);

    const geometry = useMemo(() => {
        const positions = new Float32Array(count * 3);
        const scales = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            positions[i * 3 + 0] = (Math.random() - 0.5) * 14;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 9;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 6;
            scales[i] = Math.random();
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        g.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
        return g;
    }, [count]);

    useEffect(() => () => geometry.dispose(), [geometry]);

    useFrame((state, delta) => {
        const p = points.current;
        if (!p) return;
        p.rotation.y += delta * 0.012;
        // Counter-rotate against the pointer for a shallow parallax.
        p.rotation.x += (state.pointer.y * 0.08 - p.rotation.x) * 0.02;
        p.position.x += (state.pointer.x * -0.35 - p.position.x) * 0.02;
    });

    return (
        <points ref={points} geometry={geometry}>
            <pointsMaterial
                size={0.03}
                sizeAttenuation
                color="#6d5efc"
                transparent
                opacity={0.45}
                depthWrite={false}
            />
        </points>
    );
}

export default function LightField() {
    const host = useRef<HTMLDivElement>(null);
    const [active, setActive] = useState(true);
    const [allowed, setAllowed] = useState(false);
    const [dense, setDense] = useState(true);

    useEffect(() => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        setAllowed(true);
        setDense(window.innerWidth >= 768);
    }, []);

    // Stop rendering entirely once the hero leaves the viewport. A WebGL canvas
    // that keeps drawing behind three screens of content is invisible battery.
    useEffect(() => {
        const el = host.current;
        if (!el) return;
        const io = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), {
            threshold: 0,
        });
        io.observe(el);
        return () => io.disconnect();
    }, []);

    if (!allowed) {
        // Reduced motion still deserves a lit hero — just a still one.
        return (
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                    background:
                        "radial-gradient(ellipse 70% 55% at 50% 90%, rgba(79,70,229,0.14), transparent 70%)",
                }}
            />
        );
    }

    return (
        <div ref={host} aria-hidden className="pointer-events-none absolute inset-0">
            <Canvas
                frameloop={active ? "always" : "never"}
                dpr={[1, 1.75]}
                gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
                camera={{ position: [0, 0, 5], fov: 55 }}
            >
                <Aurora />
                <Particles count={dense ? 900 : 340} />
            </Canvas>
        </div>
    );
}
