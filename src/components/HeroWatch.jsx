import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls, useProgress } from '@react-three/drei';
import { cx } from '@/lib/format';
import { Model } from './Viewer3D';
import { Spinner } from './ui';

const GOLD = '#c9a965';
const STAGE_TOP = -1.12; // the watch (about 2.2 units tall, centred on 0) stands on this surface
const RESUME_MS = 3000;

/** Turns the display slowly on its own, pausing while the visitor drags and for a moment afterwards. */
function AutoSpin({ controls, lastTouch }) {
  useFrame(() => {
    const c = controls.current;
    if (c) c.autoRotate = Date.now() - lastTouch.current > RESUME_MS;
  });
  return null;
}

/** A two-tier display pedestal: glossy black top, gold rims, dark base. */
function Stage() {
  const gold = <meshStandardMaterial color={GOLD} metalness={1} roughness={0.22} envMapIntensity={1.4} />;
  return (
    <group position={[0, STAGE_TOP, 0]}>
      <mesh position={[0, -0.14, 0]}><cylinderGeometry args={[1.42, 1.48, 0.26, 128]} /><meshPhysicalMaterial color="#0d0c0b" roughness={0.12} metalness={0.4} clearcoat={1} clearcoatRoughness={0.08} envMapIntensity={1.2} /></mesh>
      <mesh position={[0, -0.005, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.42, 0.016, 16, 160]} />{gold}</mesh>
      <mesh position={[0, -0.39, 0]}><cylinderGeometry args={[1.7, 1.78, 0.24, 128]} /><meshStandardMaterial color="#14110e" roughness={0.45} metalness={0.5} /></mesh>
      <mesh position={[0, -0.27, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.7, 0.014, 16, 160]} />{gold}</mesh>
      <ContactShadows position={[0, 0.002, 0]} scale={2.8} blur={2.4} far={2} opacity={0.75} resolution={512} color="#000" />
    </group>
  );
}

/**
 * The homepage hero: a real 3D watch standing on a display pedestal, turning slowly like a showroom
 * turntable. Its hands show the current time and tick every second. It can be dragged all the way round;
 * zoom is off so the page still scrolls.
 */
export default function HeroWatch({ model, className }) {
  const controls = useRef(null);
  const lastTouch = useRef(0);
  const { active } = useProgress();
  return (
    <div className={cx('size-full', className)}>
      <Canvas dpr={[1, 1.75]} camera={{ position: [0, 1.1, 8.4], fov: 30 }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} aria-label={`3D model of a ${model.label.toLowerCase()} on a turning display stand, showing the current time. Drag to turn it.`}>
        <ambientLight intensity={0.3} />
        <spotLight position={[0, 6, 2.5]} angle={0.45} penumbra={0.8} intensity={60} color="#ffe6bd" />
        <directionalLight position={[3, 3, 5]} intensity={1.3} />
        <directionalLight position={[-4, 1, -3]} intensity={0.6} color="#ffd9a0" />
        <Suspense fallback={null}>
          <Environment resolution={256}>
            <Lightformer form="rect" intensity={2.6} position={[0, 5, 4]} scale={[10, 3, 1]} />
            <Lightformer form="rect" intensity={1.3} position={[-6, 1, 2]} scale={[2, 8, 1]} />
            <Lightformer form="rect" intensity={1.6} position={[6, 0, -2]} scale={[2, 8, 1]} />
            <Lightformer form="ring" intensity={1.1} color="#d2b57b" position={[0, 0, 8]} scale={4} />
          </Environment>
          <Model url={model.url} turns={model.turns} focus={model.focus} liveTime />
          <Stage />
        </Suspense>
        <OrbitControls
          ref={controls}
          target={[0, -0.35, 0]}
          enableZoom={false}
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.55}
          autoRotate
          autoRotateSpeed={1.6}
          minPolarAngle={Math.PI * 0.32}
          maxPolarAngle={Math.PI * 0.5}
          onStart={() => { lastTouch.current = Date.now() + 10 ** 9; }}
          onEnd={() => { lastTouch.current = Date.now(); }}
        />
        <AutoSpin controls={controls} lastTouch={lastTouch} />
      </Canvas>
      {active && <div className="pointer-events-none absolute inset-0 grid place-items-center"><Spinner className="text-champagne" /></div>}
    </div>
  );
}
