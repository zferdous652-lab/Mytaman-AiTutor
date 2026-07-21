import React, { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useTexture } from "@react-three/drei";
import { DoubleSide } from "three";

const MindmapPlane = ({ url, reduce }) => {
  const ref = useRef();
  const texture = useTexture(url);
  const aspect = texture.image ? texture.image.width / texture.image.height : 1;
  const height = 4;
  const width = height * aspect;

  useFrame(({ clock }) => {
    if (reduce || !ref.current) return;
    ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.3) * 0.06;
    ref.current.position.y = Math.sin(clock.elapsedTime * 0.5) * 0.04;
  });

  return (
    <mesh ref={ref}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial map={texture} toneMapped={false} side={DoubleSide} />
    </mesh>
  );
};

const MindmapCanvas = ({ url, reduce }) => (
  <Canvas camera={{ position: [0, 0, 5.5], fov: 45 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
    <ambientLight intensity={0.7} />
    <directionalLight position={[3, 4, 5]} intensity={0.8} color="#00f0ff" />
    <directionalLight position={[-3, -2, 2]} intensity={0.3} color="#8a2be2" />
    <Suspense fallback={null}>
      <MindmapPlane url={url} reduce={reduce} />
    </Suspense>
    <OrbitControls
      makeDefault
      enablePan
      enableZoom
      enableRotate
      minDistance={3}
      maxDistance={9}
      minPolarAngle={Math.PI / 2 - 0.6}
      maxPolarAngle={Math.PI / 2 + 0.6}
      minAzimuthAngle={-0.8}
      maxAzimuthAngle={0.8}
    />
  </Canvas>
);

export default MindmapCanvas;
