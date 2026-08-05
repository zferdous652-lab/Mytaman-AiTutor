import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";

/**
 * The WebGL hero: a shader-displaced wireframe sphere ("the knowledge mesh") with the five
 * content types the app generates orbiting it.
 *
 * The mesh is a WireframeGeometry icosahedron drawn as LineSegments, displaced along each
 * vertex normal by a sum of sines in the vertex shader, and coloured by that displacement
 * in the fragment shader. Additive blending with depthWrite off is what makes overlapping
 * strands accumulate light instead of z-fighting into a flat cage.
 *
 * Lazy-loaded by HeroScene so three.js stays off the critical path, and every animation is
 * gated on `reduce`.
 */

const CYAN = "#00f0ff";
const VIOLET = "#8b5cf6";
const PINK = "#ff5ca8";

// The five content types generated per chapter, orbiting the mesh.
const NODES = [
  { label: "notes", color: CYAN, radius: 3.15, speed: 0.20, phase: 0 },
  { label: "mindmap", color: VIOLET, radius: 3.55, speed: -0.16, phase: 1.25 },
  { label: "summary", color: CYAN, radius: 2.85, speed: 0.26, phase: 2.5 },
  { label: "flashcards", color: PINK, radius: 3.85, speed: -0.12, phase: 3.75 },
  { label: "quiz", color: VIOLET, radius: 3.35, speed: 0.18, phase: 5.0 },
];

const vertexShader = /* glsl */ `
  uniform float uTime;
  varying float vMix;

  // Summed sines at different frequencies/directions -- cheaper than noise and, because the
  // periods don't divide evenly, it never visibly loops.
  float wob(vec3 p) {
    return sin(p.x * 2.1 + uTime * 0.55) * 0.50
         + sin(p.y * 2.7 - uTime * 0.42) * 0.42
         + sin(p.z * 2.3 + uTime * 0.33) * 0.46;
  }

  void main() {
    vec3 n = normalize(position);
    float d = wob(n * 1.55);
    // Displace along the normal so the sphere breathes rather than shears.
    vec3 p = position + n * d * 0.36;
    vMix = clamp(d * 0.5 + 0.5, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;
  varying float vMix;

  void main() {
    // Two-stop ramp through the brand triad, driven by how far this vertex was pushed out.
    vec3 c = vMix < 0.5 ? mix(uA, uB, vMix * 2.0) : mix(uB, uC, (vMix - 0.5) * 2.0);
    gl_FragColor = vec4(c, 0.34);
  }
`;

const KnowledgeMesh = ({ reduce }) => {
  const group = useRef();
  const { size } = useThree();

  // Subdivision is the entire mobile performance story: detail 5 is ~4x the line segments
  // of detail 3. Dropping it on narrow viewports keeps phones smooth.
  const detail = size.width < 760 ? 3 : 5;

  const geometry = useMemo(
    () => new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(2.35, detail)),
    [detail]
  );

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uA: { value: new THREE.Color(CYAN) },
          uB: { value: new THREE.Color(VIOLET) },
          uC: { value: new THREE.Color(PINK) },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    []
  );

  // Dispose only a geometry that has already been REPLACED (the viewport crossed the 760px
  // breakpoint and `detail` changed), never the live one.
  //
  // The obvious version of this -- `useEffect(() => () => geometry.dispose(), [geometry])`
  // -- is wrong under StrictMode, which double-invokes effects as mount → cleanup → mount.
  // useMemo keeps its cache across that simulated remount, so the cleanup disposes the very
  // object still attached to the live lineSegments; its GPU buffers are freed, the next
  // render throws, and the entire canvas goes blank. Comparing against the previous value
  // is immune to that, because a superseded object is safe to free no matter how many times
  // the effect runs.
  const prevGeometry = useRef(null);
  useEffect(() => {
    const prev = prevGeometry.current;
    if (prev && prev !== geometry) prev.dispose();
    prevGeometry.current = geometry;
  }, [geometry]);

  useFrame((state) => {
    if (reduce) return;
    const t = state.clock.elapsedTime;
    material.uniforms.uTime.value = t;
    if (group.current) {
      group.current.rotation.y = t * 0.12;
      group.current.rotation.x = Math.sin(t * 0.18) * 0.14;
    }
  });

  return (
    <group ref={group}>
      <lineSegments geometry={geometry} material={material} />
    </group>
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
      child.position.set(Math.cos(a) * n.radius, Math.sin(a * 1.3) * 0.6, Math.sin(a) * n.radius);
    });
  });
  return (
    <group ref={group}>
      {NODES.map((n) => (
        <mesh key={n.label} position={[n.radius, 0, 0]}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshBasicMaterial color={n.color} transparent opacity={0.9} />
        </mesh>
      ))}
    </group>
  );
};

/**
 * Parallax by moving the CAMERA rather than rotating the scene. Orbiting the camera around
 * a fixed mesh gives real perspective shift, where spinning the group only ever looks like
 * the object turning -- the difference between depth and a turntable.
 */
const CameraRig = ({ reduce }) => {
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e) => {
      target.current.x = (e.clientX / window.innerWidth - 0.5) * 0.42;
      target.current.y = (e.clientY / window.innerHeight - 0.5) * 0.32;
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame(({ camera }, delta) => {
    if (reduce) return;
    // Frame-rate independent damping, so the follow feels identical at 60 and 144Hz.
    const k = 1 - Math.pow(0.0001, delta);
    current.current.x += (target.current.x - current.current.x) * k;
    current.current.y += (target.current.y - current.current.y) * k;
    camera.position.x = current.current.x * 2.4;
    camera.position.y = -current.current.y * 1.8;
    camera.lookAt(0, 0, 0);
  });
  return null;
};

const HeroCanvas = ({ reduce = false }) => (
  <Canvas
    camera={{ position: [0, 0, 6.2], fov: 46 }}
    // Capped DPR: a retina background at full resolution triples fragment cost for no
    // perceptible gain on a soft, additive scene.
    dpr={[1, 2]}
    gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
    style={{ pointerEvents: "none" }}
  >
    <CameraRig reduce={reduce} />
    <KnowledgeMesh reduce={reduce} />
    <SubjectNodes reduce={reduce} />
    <Stars radius={60} depth={40} count={900} factor={3} saturation={0} fade speed={reduce ? 0 : 0.4} />
  </Canvas>
);

export default HeroCanvas;
