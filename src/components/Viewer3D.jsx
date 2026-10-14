import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bounds, Center, Environment, Html, Lightformer, OrbitControls, useAnimations, useGLTF, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import { cx } from '@/lib/format';
import { Icon, Spinner } from './ui';

const GOLD = '#c9a965';

/** Draws the dial texture once. Nothing here claims to be a real model: it is a generic stand-in. */
function useDialTexture(name) {
  return useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const g = c.getContext('2d'); const R = 512;
    const bg = g.createRadialGradient(380, 330, 40, 512, 512, 520); bg.addColorStop(0, '#34302a'); bg.addColorStop(0.6, '#16130f'); bg.addColorStop(1, '#0a0908');
    g.fillStyle = bg; g.fillRect(0, 0, 1024, 1024);
    g.save(); g.translate(R, R); g.strokeStyle = 'rgba(210,181,123,.05)'; g.lineWidth = 1;
    for (let r = 40; r < 470; r += 14) { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
    for (let i = 0; i < 60; i++) {
      const a = (i * Math.PI) / 30; const long = i % 5 === 0;
      g.strokeStyle = long ? 'rgba(210,181,123,.0)' : 'rgba(210,181,123,.7)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(Math.sin(a) * 470, -Math.cos(a) * 470); g.lineTo(Math.sin(a) * 448, -Math.cos(a) * 448); g.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6; g.save(); g.rotate(a);
      const grad = g.createLinearGradient(0, -450, 0, -330); grad.addColorStop(0, '#ecd9a8'); grad.addColorStop(1, '#a8884c');
      g.fillStyle = grad; const w = i % 3 === 0 ? 30 : 18; g.fillRect(-w / 2, -450, w, 120);
      g.fillStyle = 'rgba(243,236,217,.9)'; g.fillRect(-(w - 12) / 2, -430, w - 12, 70); g.restore();
    }
    g.fillStyle = '#e7d4a2'; g.font = '500 54px "Bodoni Moda Variable", serif'; g.textAlign = 'center'; g.fillText(name, 0, -150);
    g.fillStyle = '#0a0908'; g.strokeStyle = '#d2b57b'; g.lineWidth = 4; g.fillRect(240, -42, 130, 84); g.strokeRect(240, -42, 130, 84);
    g.fillStyle = '#f3ecd9'; g.font = '600 56px "Instrument Sans Variable", sans-serif'; g.fillText(String(new Date().getDate()), 305, 20);
    g.restore();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }, [name]);
}

function ProceduralWatch({ name, live }) {
  const dial = useDialTexture(name);
  const h = useRef(); const m = useRef(); const s = useRef();
  useFrame(() => {
    const d = new Date(); const sec = d.getSeconds() + d.getMilliseconds() / 1000; const min = d.getMinutes() + sec / 60; const hr = (d.getHours() % 12) + min / 60;
    if (!live) return;
    h.current.rotation.z = -(hr / 12) * Math.PI * 2; m.current.rotation.z = -(min / 60) * Math.PI * 2; s.current.rotation.z = -(sec / 60) * Math.PI * 2;
  });
  const gold = <meshStandardMaterial color={GOLD} metalness={1} roughness={0.26} envMapIntensity={1.4} />;
  const dark = <meshStandardMaterial color="#0d0c0b" metalness={0.6} roughness={0.45} />;
  const links = Array.from({ length: 7 }, (_, i) => i);
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[1, 1, 0.3, 96]} />{gold}</mesh>
      <mesh position={[0, 0, 0.15]}><torusGeometry args={[0.93, 0.075, 24, 120]} />{gold}</mesh>
      <mesh position={[0, 0, 0.12]}><circleGeometry args={[0.9, 96]} />{dark}</mesh>
      <mesh position={[0, 0, 0.142]}><circleGeometry args={[0.87, 96]} /><meshStandardMaterial map={dial} roughness={0.5} metalness={0.2} /></mesh>
      <group position={[0, 0, 0.16]}>
        <group ref={h}><mesh position={[0, 0.2, 0.012]}><boxGeometry args={[0.085, 0.52, 0.012]} />{gold}</mesh></group>
        <group ref={m}><mesh position={[0, 0.34, 0.022]}><boxGeometry args={[0.055, 0.8, 0.012]} />{gold}</mesh></group>
        <group ref={s}><mesh position={[0, 0.3, 0.032]}><boxGeometry args={[0.016, 0.98, 0.008]} /><meshStandardMaterial color="#e7d4a2" metalness={1} roughness={0.2} /></mesh></group>
        <mesh position={[0, 0, 0.04]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.06, 0.06, 0.05, 32]} />{gold}</mesh>
      </group>
      <mesh position={[0, 0, 0.19]}><cylinderGeometry args={[0.9, 0.9, 0.012, 96]} rotation={[Math.PI / 2, 0, 0]} /><meshPhysicalMaterial transparent opacity={0.1} roughness={0.02} metalness={0} clearcoat={1} envMapIntensity={1.6} /></mesh>
      <mesh position={[1.11, 0, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.095, 0.095, 0.2, 32]} />{gold}</mesh>
      {[[-0.46, 1.02], [0.46, 1.02], [-0.46, -1.02], [0.46, -1.02]].map(([x, y], i) => <mesh key={i} position={[x, y, -0.02]} rotation={[0, 0, 0]}><boxGeometry args={[0.2, 0.34, 0.2]} />{gold}</mesh>)}
      {links.map((i) => (
        <group key={i}>
          <mesh position={[0, 1.34 + i * 0.27, -0.06 - i * i * 0.012]} rotation={[-i * 0.05, 0, 0]}><boxGeometry args={[0.8, 0.24, 0.11]} />{gold}</mesh>
          <mesh position={[0, -1.34 - i * 0.27, -0.06 - i * i * 0.012]} rotation={[i * 0.05, 0, 0]}><boxGeometry args={[0.8, 0.24, 0.11]} />{gold}</mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Width of the procedural watch head. Loaded models are scaled so their middle dimension matches it:
 * for a watch that is the case width (the largest is usually the strap length, the smallest the
 * thickness), so the dial appears at a consistent size whatever the strap.
 */
const HEAD_SIZE = 2.1;
const DEG = Math.PI / 180;
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

/**
 * turns: [['x', 90], ['y', -90]] rotates about the world X axis, then the world Y axis (degrees).
 * focus: pattern matched against "<node name> <material name>", or { box: [min, max] } in model units,
 * to find the watch head; the model is
 * sized and centred on that part, so a long strap does not shrink or push the dial off-centre.
 */
/**
 * Drives a model's own hour, minute and second hands to the current time. The seconds hand ticks once a
 * second with a short snap, like a quartz or ticking movement. Works for any model whose hand nodes are
 * named "...hour...", "...minute...", "...second..." and whose seconds hand points to 12 in its rest pose.
 */
function useLiveHands(object, enabled) {
  const rig = useMemo(() => {
    if (!enabled) return null;
    const find = (re) => { let hit = null; object.traverse((o) => { if (!hit && re.test(o.name) && !o.isMesh) hit = o; }); return hit; };
    const sec = find(/hand.?sec/i), min = find(/hand.?min/i), hour = find(/hand.?hour/i);
    if (!sec || !min || !hour) return null;
    object.updateMatrixWorld(true);
    const P = sec.getWorldPosition(new THREE.Vector3());
    const A = new THREE.Vector3(0, 1, 0).applyQuaternion(sec.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const dirOf = (o) => new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()).sub(P).projectOnPlane(A).normalize();
    const twelve = dirOf(sec);
    // Clockwise angle (positive about A, the direction the model's own ticking animation turns) from 12.
    const cw = (d) => Math.atan2(new THREE.Vector3().crossVectors(twelve, d).dot(A), twelve.dot(d));
    const hands = [sec, min, hour].map((o) => {
      const parentInv = new THREE.Matrix4().copy(o.parent.matrixWorld).invert();
      const parentRot = o.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      return { o, rest: o === sec ? 0 : cw(dirOf(o)), pos0: o.position.clone(), quat0: o.quaternion.clone(), pivot: P.clone().applyMatrix4(parentInv), axis: A.clone().applyQuaternion(parentRot).normalize() };
    });
    return hands;
  }, [object, enabled]);

  useFrame(() => {
    if (!rig) return;
    const d = new Date();
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const tick = Math.floor(s) + Math.min(1, (s % 1) / 0.09) ** 0.6; // snap to the next second in ~90 ms
    const m = d.getMinutes() + s / 60;
    const h = (d.getHours() % 12) + m / 60;
    const target = [(tick / 60) * Math.PI * 2, (m / 60) * Math.PI * 2, (h / 12) * Math.PI * 2];
    const q = new THREE.Quaternion();
    rig.forEach((hand, i) => {
      q.setFromAxisAngle(hand.axis, target[i] - hand.rest);
      hand.o.position.copy(hand.pos0).sub(hand.pivot).applyQuaternion(q).add(hand.pivot);
      hand.o.quaternion.copy(q).multiply(hand.quat0);
    });
  });
  return Boolean(rig);
}

export function Model({ url, turns = [], focus, liveTime = false }) {
  const { scene, animations } = useGLTF(url);
  const object = useMemo(() => {
    const copy = scene.clone(true);
    for (const [axis, deg] of turns) copy.rotateOnWorldAxis(AXES[axis], deg * DEG);
    copy.updateMatrixWorld(true);
    const box = new THREE.Box3();
    if (focus?.box) {
      box.set(new THREE.Vector3(...focus.box[0]), new THREE.Vector3(...focus.box[1])).applyMatrix4(copy.matrixWorld);
    } else if (focus) {
      copy.traverse((o) => {
        if (!o.isMesh) return;
        const mats = [].concat(o.material).map((m) => m?.name ?? '').join(' ');
        if (focus.test(`${o.name} ${mats}`)) box.expandByObject(o);
      });
    }
    if (box.isEmpty()) box.setFromObject(copy);
    const size = box.getSize(new THREE.Vector3());
    const middle = [size.x, size.y, size.z].sort((x, y) => x - y)[1] || 1;
    const k = HEAD_SIZE / middle;
    const centre = box.getCenter(new THREE.Vector3()).multiplyScalar(k);
    copy.scale.multiplyScalar(k);
    copy.position.sub(centre);
    const group = new THREE.Group();
    group.add(copy);
    return group;
  }, [scene, turns, focus]);
  const live = useLiveHands(object, liveTime);
  const { actions } = useAnimations(animations, object);
  useEffect(() => {
    if (live) return undefined; // the hands follow the clock instead of the baked animation
    const all = Object.values(actions);
    all.forEach((a) => a?.reset().play()); // e.g. a ticking second hand
    return () => all.forEach((a) => a?.stop());
  }, [actions, live]);
  return <primitive object={object} />;
}

const VIEWS = {
  front: [0, 0, 6],
  angle: [3.2, 2.4, 5],
  side: [6, 0.4, 0.3],
  crown: [3, 0.2, 3.4],
  back: [0, 0.2, -6],
};

function CameraRig({ target, controls }) {
  const { camera } = useThree();
  const goal = useRef(null);
  useEffect(() => { if (target) goal.current = new THREE.Vector3(...target.pos); }, [target]);
  useFrame((_, dt) => {
    if (!goal.current) return;
    camera.position.lerp(goal.current, 1 - Math.exp(-6 * dt));
    controls.current?.update();
    if (camera.position.distanceTo(goal.current) < 0.02) goal.current = null;
  });
  return null;
}

function Hotspot({ position, children }) {
  return (
    <Html position={position} center zIndexRange={[20, 0]} distanceFactor={9}>
      <span className="pointer-events-none whitespace-nowrap border border-champagne/60 bg-ink/85 px-2 py-1 text-[.7rem] text-champagne">{children}</span>
    </Html>
  );
}

/**
 * modelUrl:       this exact watch's own GLB, when one has been uploaded.
 * representative: a bundled stand-in from lib/models3d (used only when there is no modelUrl); it is
 *                 always labelled as not being this exact watch, with its licence credit.
 * With neither, a procedural generic watch is drawn.
 */
export default function Viewer3D({ modelUrl: ownModelUrl, representative = null, name = 'Time Luxe', className, initialHotspots = true }) {
  const stand = ownModelUrl ? null : representative;
  const modelUrl = ownModelUrl || stand?.url || null;
  const wrap = useRef(null);
  const controls = useRef(null);
  const [auto, setAuto] = useState(true);
  const [spots, setSpots] = useState(initialHotspots);
  const [target, setTarget] = useState(null);
  const [full, setFull] = useState(false);
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const { active: loading } = useProgress();
  const android = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

  useEffect(() => { if (reduce) setAuto(false); }, [reduce]);
  useEffect(() => { const on = () => setFull(Boolean(document.fullscreenElement)); document.addEventListener('fullscreenchange', on); return () => document.removeEventListener('fullscreenchange', on); }, []);

  const zoom = (k) => {
    const c = controls.current; if (!c) return;
    const cam = c.object; const dir = cam.position.clone().sub(c.target).multiplyScalar(k);
    setTarget({ pos: c.target.clone().add(dir).toArray(), t: Date.now() });
  };
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen?.());
  const arHref = modelUrl ? `intent://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(new URL(modelUrl, window.location.origin).href)}&mode=ar_preferred#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;end;` : null;

  const btn = 'grid size-10 place-items-center border rule bg-ink/80 backdrop-blur transition-colors hover:border-champagne hover:text-champagne';
  return (
    <div ref={wrap} className={cx('relative isolate overflow-hidden bg-[radial-gradient(ellipse_at_50%_40%,#2a2520_0%,#0c0b0a_70%)]', full ? 'h-screen' : 'aspect-[4/5] sm:aspect-square', className)}>
      <Canvas dpr={[1, 1.75]} camera={{ position: VIEWS.angle, fov: 32 }} gl={{ antialias: true, powerPreference: 'high-performance' }} aria-label="Interactive 3D watch. Drag to rotate, scroll or pinch to zoom.">
        <color attach="background" args={['#0c0b0a']} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[3, 4, 5]} intensity={1.6} />
        <directionalLight position={[-4, -2, 3]} intensity={0.5} color="#ffe2b0" />
        <Suspense fallback={null}>
          <Environment resolution={256}>
            <Lightformer form="rect" intensity={2.4} position={[0, 5, 4]} scale={[10, 3, 1]} />
            <Lightformer form="rect" intensity={1.2} position={[-6, 1, 2]} scale={[2, 8, 1]} />
            <Lightformer form="rect" intensity={1.5} position={[6, 0, -2]} scale={[2, 8, 1]} />
            <Lightformer form="ring" intensity={1} color="#d2b57b" position={[0, 0, 8]} scale={4} />
          </Environment>
          <Bounds fit={!modelUrl} clip observe margin={1.55}>
            <Center disable={Boolean(modelUrl)}>
              {modelUrl ? <Model url={modelUrl} turns={stand?.turns} focus={stand?.focus} /> : <ProceduralWatch name={name} live />}
              {!modelUrl && spots && (<>
                <Hotspot position={[1.15, 0.2, 0.3]}>Crown</Hotspot>
                <Hotspot position={[-0.7, 0.75, 0.35]}>Bezel</Hotspot>
                <Hotspot position={[0, -0.35, 0.3]}>Dial</Hotspot>
                <Hotspot position={[0, -1.7, 0.1]}>Bracelet</Hotspot>
              </>)}
            </Center>
          </Bounds>
        </Suspense>
        <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping dampingFactor={0.08} minDistance={2.5} maxDistance={14} autoRotate={auto} autoRotateSpeed={1.1} onStart={() => setAuto(false)} />
        <CameraRig target={target} controls={controls} />
      </Canvas>

      {loading && <div className="pointer-events-none absolute inset-0 grid place-items-center"><Spinner className="text-champagne" /></div>}
      {!modelUrl && <p className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit max-w-[90%] border border-champagne/30 bg-ink/80 px-3 py-1 text-center text-[.72rem] text-champagne">Generic 3D model. A model of this exact watch has not been supplied.</p>}
      {stand && <p className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit max-w-[90%] border border-champagne/30 bg-ink/80 px-3 py-1 text-center text-[.72rem] text-champagne">Representative 3D model: {stand.label}. Not this exact watch.</p>}
      {stand ? (
        <p className="absolute bottom-2 left-3 right-16 text-[.68rem] leading-snug text-ash">
          3D model: <a href={stand.credit.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-ash/50 underline-offset-2 hover:text-champagne">“{stand.credit.title}”</a> by {stand.credit.author}, <a href={stand.credit.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-ash/50 underline-offset-2 hover:text-champagne">{stand.credit.license}</a>{stand.credit.changes ? `. ${stand.credit.changes}` : ''}
        </p>
      ) : (
        <p className="pointer-events-none absolute bottom-3 left-3 text-[.75rem] text-ash">Drag to rotate. Scroll or pinch to zoom.</p>
      )}

      <div className="absolute right-3 top-14 z-10 flex flex-col gap-1.5">
        <button className={btn} onClick={() => zoom(0.75)} aria-label="Zoom in"><Icon name="zoomIn" size={18} /></button>
        <button className={btn} onClick={() => zoom(1.35)} aria-label="Zoom out"><Icon name="zoomOut" size={18} /></button>
        <button className={cx(btn, auto && 'border-champagne text-champagne')} onClick={() => setAuto(!auto)} aria-pressed={auto} aria-label="Auto-rotate"><Icon name="rotate" size={18} /></button>
        <button className={btn} onClick={toggleFull} aria-label={full ? 'Exit full screen' : 'Full screen'}><Icon name="expand" size={18} /></button>
        {!modelUrl && <button className={cx(btn, spots && 'border-champagne text-champagne')} onClick={() => setSpots(!spots)} aria-pressed={spots} aria-label="Toggle labels"><Icon name="info" size={18} /></button>}
      </div>
      <div className={cx("absolute inset-x-3 z-10 flex flex-wrap justify-center gap-1.5", stand ? "bottom-12" : "bottom-8")}>
        {Object.keys(VIEWS).map((k) => <button key={k} onClick={() => { setAuto(false); setTarget({ pos: VIEWS[k], t: Date.now() }); }} className="border rule bg-ink/80 px-3 py-1.5 text-[.78rem] capitalize backdrop-blur hover:border-champagne hover:text-champagne">{k}</button>)}
        {android && arHref && <a href={arHref} className="border border-champagne bg-champagne px-3 py-1.5 text-[.78rem] font-semibold text-ink">View in AR</a>}
      </div>
    </div>
  );
}
