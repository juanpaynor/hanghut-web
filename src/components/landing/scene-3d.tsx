"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Physics, useBox, useSphere } from "@react-three/cannon";
import { Environment, Float, ContactShadows } from "@react-three/drei";
import { useMemo, useState, useEffect } from "react";
import * as THREE from "three";

// --- Geometries as Falling Objects ---

function Cube({ position, color, ...props }: any) {
    const [ref] = useBox(() => ({ mass: 1, position, args: [1, 1, 1], ...props }));
    return (
        <mesh ref={ref}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={color} roughness={0.1} metalness={0.8} />
        </mesh>
    );
}

function Sphere({ position, color, ...props }: any) {
    const [ref] = useSphere(() => ({ mass: 1, position, args: [0.6], ...props }));
    return (
        <mesh ref={ref}>
            <sphereGeometry args={[0.6, 32, 32]} />
            <meshStandardMaterial color={color} roughness={0.1} metalness={0.8} emissive={color} emissiveIntensity={0.5} />
        </mesh>
    );
}

function Pill({ position, color, ...props }: any) {
    const [ref] = useBox(() => ({ mass: 1, position, args: [0.5, 1.5, 0.5], ...props }));
    return (
        <mesh ref={ref}>
            <capsuleGeometry args={[0.4, 1, 4, 8]} />
            <meshStandardMaterial color={color} roughness={0.1} metalness={0.1} />
        </mesh>
    );
}

// --- The Rain of Objects ---

function ObjectSpawner({ count = 40 }) {
    // Generate random positions above the view
    const objects = useMemo(() => {
        return new Array(count).fill(0).map(() => ({
            position: [
                (Math.random() - 0.5) * 10, // X spread
                10 + Math.random() * 20,    // Y drop height
                (Math.random() - 0.5) * 5   // Z depth
            ] as [number, number, number],
            type: Math.floor(Math.random() * 3), // 0: Cube, 1: Sphere, 2: Pill
            color: Math.random() > 0.5 ? "#4F46E5" : "#EC4899" // Indigo or Pink
        }));
    }, [count]);

    return (
        <>
            {objects.map((obj, i) => {
                if (obj.type === 0) return <Cube key={i} position={obj.position} color={obj.color} />;
                if (obj.type === 1) return <Sphere key={i} position={obj.position} color={obj.color} />;
                return <Pill key={i} position={obj.position} color={obj.color} />;
            })}
        </>
    );
}

// --- Main Scene ---

export default function Scene3D() {
    return (
        <Canvas
            camera={{ position: [0, 0, 15], fov: 45 }}
            gl={{ alpha: true, antialias: true }}
            className="w-full h-full"
        >
            <ambientLight intensity={0.5} />
            <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
            <pointLight position={[-10, -10, -10]} intensity={1} color="#EC4899" />

            {/* Physics World */}
            <Physics gravity={[0, -5, 0]}>
                <ObjectSpawner count={50} />
                {/* Invisible floor to catch objects */}
                <Plane position={[0, -6, 0]} />
                <MouseKicker />
            </Physics>

            <Environment preset="city" />
            <ContactShadows position={[0, -6, 0]} opacity={0.5} scale={20} blur={2.5} far={4} />
        </Canvas>
    );
}

function Plane(props: any) {
    const [ref] = useBox(() => ({ mass: 0, args: [50, 1, 50], ...props }));
    return <mesh ref={ref} visible={false} />;
}

// Gives the mouse a physical presence to kick objects
function MouseKicker() {
    const [ref, api] = useSphere(() => ({ type: "Kinematic", args: [1.5], position: [0, 0, 0] }));

    useFrame(({ mouse, viewport }) => {
        const x = (mouse.x * viewport.width) / 2
        const y = (mouse.y * viewport.height) / 2
        api.position.set(x, y, 0)
    })

    return (
        <mesh ref={ref} visible={false}>
            <sphereGeometry args={[1.5]} />
        </mesh>
    )
}
