import React, { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, Stars } from "@react-three/drei";
import * as THREE from "three";

/**
 * The WebGL hero: a wireframe "knowledge core" wrapped in orbiting rings and subject nodes,
 * drifting with the pointer.
 *
 * Loaded lazily by HeroScene so three.js stays out of the initial bundle — a landing page
 * that blocks first paint on a 600kb 3D library has already lost the visitor it was trying
 * to impress. Every animation here is also gated on `reduce`.
 */

const CYAN = "#00f0ff";
const VIOLET = "#8a2be2";
const MAGENTA = "#ff0055";

// The five content types the app actually generates, orbiting the core.
const NODES = [
  { label: "notes", color: CYAN, radius: 3.1, speed: 0.22, phase: 0 },
  { label: "mindmap", color: VIOLET, radius: 3.6, speed: -0.17, phase: 1.2 },
  { label: "summary", color: CYAN, radius: 2.7, speed: 0.29, phase: 2.4 },
  { label: "flashcards", color: MAGENTA, radius: 3.9, speed: -0.13, phase: 3.6 },
  { label: "quiz", color: VIOLET, radius: 3.3, speed: 0.19, phase: 4.8 },
];

const KnowledgeCore = ({ reduce }) => {
  const inner = useRef();
  const outer = useRef();

  useFrame((state, delta) => {
    if (reduce) return;
    if (inner.current) {
      inner.current.rotation.y += delta * 0.12;
      inner.current.rotation.x += delta * 0.05;
      // Slow breathing pulse so the core reads as alive rather than a static prop.
      const s = 1 + Math.sin(state.clock.elapsedTime * 0.8) * 0.04;
      inner.current.scale.setScalar(s);
    }
    if (outer.current) {
      outer.current.rotation.y -= delta * 0.06;
      outer.current.rotation.z += delta * 0.03;
    }
  });

  return (
    <group>
      <mesh ref={outer}>
        <icosahedronGeometry args={[2.15, 1]} />
        <meshBasicMaterial color={VIOLET} wireframe transparent opacity={0.28} />
      </mesh>
      <mesh ref={inner}>
        <icosahedronGeometry args={[1.5, 2]} />
        <meshBasicMaterial color={CYAN} wireframe transparent opacity={0.55} />
      </mesh>
      {/* Solid inner glow so the wireframe reads as a shell around something. */}
      <mesh>
        <sphereGeometry args={[0.85, 32, 32]} />
        <meshBasicMaterial color={CYAN} transparent opacity={0.13} />
      </mesh>
      <pointLight position={[0, 0, 0]} color={CYAN} intensity={12} distance={9} />
    </group>
  );
};

const OrbitRing = ({ radius, tilt, color, speed, reduce, opacity = 0.35 }) => {
  const ref = useRef();
  useFrame((_, delta) => {
    if (!reduce && ref.current) ref.current.rotation.z += delta * speed;
  });
  return (
    <mesh ref={ref} rotation={tilt}>
      <torusGeometry args={[radius, 0.006, 8, 128]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  );
};

const SubjectNodes = ({ reduce }) => {
  const group = useRef();
  useFrame((state) => {
    if (reduce || !group.current) return;
    const t = state.clock.elapsedTime;
    group.current.children.forEach((child, i) => {
      const n = NODES[i];
      const a = t * n.speed + n.phase;
      child.position.set(
        Math.cos(a) * n.radius,
        Math.sin(a * 1.3) * 0.55,
        Math.sin(a) * n.radius
      );
    });
  });
  return (
    <group ref={group}>
      {NODES.map((n) => (
        <mesh key={n.label} position={[n.radius, 0, 0]}>
          <sphereGeometry args={[0.075, 16, 16]} />
          <meshBasicMaterial color={n.color} />
        </mesh>
      ))}
    </group>
  );
};

// The dome of points behind everything — the depth cue that makes the core feel suspended
// in space rather than pasted onto a flat background.
const MeshDome = ({ reduce }) => {
  const ref = useRef();
  const geometry = useMemo(() => new THREE.SphereGeometry(7.5, 28, 18), []);
  useFrame((_, delta) => {
    if (!reduce && ref.current) ref.current.rotation.y += delta * 0.015;
  });
  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial color={VIOLET} size={0.035} transparent opacity={0.55} sizeAttenuation />
    </points>
  );
};

/** Eases the whole scene toward the pointer — the "it follows me" effect, damped. */
const PointerRig = ({ children, reduce }) => {
  const group = useRef();
  const { pointer } = useThree();
  useFrame((_, delta) => {
    if (reduce || !group.current) return;
    const k = 1 - Math.pow(0.001, delta); // frame-rate independent damping
    group.current.rotation.y += (pointer.x * 0.35 - group.current.rotation.y) * k;
    group.current.rotation.x += (-pointer.y * 0.22 - group.current.rotation.x) * k;
  });
  return <group ref={group}>{children}</group>;
};

const HeroCanvas = ({ reduce = false }) => (
  <Canvas
    camera={{ position: [0, 0, 8.5], fov: 50 }}
    // Capped DPR: retina at full resolution triples the fragment cost for a background.
    dpr={[1, 1.75]}
    gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
    style={{ pointerEvents: "none" }}
  >
    <ambientLight intensity={0.4} />
    <PointerRig reduce={reduce}>
      <Float speed={reduce ? 0 : 1.2} rotationIntensity={reduce ? 0 : 0.25} floatIntensity={reduce ? 0 : 0.5}>
        <KnowledgeCore reduce={reduce} />
      </Float>
      <SubjectNodes reduce={reduce} />
      <OrbitRing radius={3.1} tilt={[Math.PI / 2.4, 0, 0]} color={CYAN} speed={0.05} reduce={reduce} />
      <OrbitRing radius={3.6} tilt={[Math.PI / 2.9, 0.5, 0]} color={VIOLET} speed={-0.04} reduce={reduce} opacity={0.3} />
      <OrbitRing radius={4.3} tilt={[Math.PI / 2.2, -0.4, 0.3]} color={MAGENTA} speed={0.03} reduce={reduce} opacity={0.2} />
      <MeshDome reduce={reduce} />
    </PointerRig>
    <Stars radius={60} depth={40} count={1200} factor={3} saturation={0} fade speed={reduce ? 0 : 0.4} />
  </Canvas>
);

export default HeroCanvas;
