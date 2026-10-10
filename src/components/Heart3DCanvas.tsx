/**
 * High-Realism 3D Cardiac Anatomical Canvas (Three.js)
 * Modeled directly after clinical cardiovascular 3D visualization reference:
 * - Screen Space Ambient Occlusion (SSAOPass) for deep contact shadows between vessels & myocardium
 * - Subtle UnrealBloomPass for cinematic vascular glow
 * - Translucent crystal-glass cardiac envelope revealing internal chambers & valvular rings
 * - Dual arterial (red / risk-coded) and venous (royal blue) vascular network
 * - Fine micro-vascular capillary arborization across ventricular surfaces
 * - Ascending aorta, blue pulmonary trunk, great cardiac vein, and coronary sinus
 * - Systolic heartbeat pulsation, blood flow particles, interactive landmark pins,
 *   and luxury burgundy workstation aesthetic.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { VesselName, ModelPredictionResult } from '../types/cardiac';
import {
  RotateCcw,
  Eye,
  Activity,
  Layers,
  Sparkles,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Play,
  Pause,
  MapPin,
  Heart,
  Flame,
  Sun,
  Shield,
} from 'lucide-react';

interface Heart3DCanvasProps {
  prediction: ModelPredictionResult;
  selectedVessel: VesselName | null;
  onSelectVessel: (vessel: VesselName | null) => void;
  heartRate: number;
}

export const Heart3DCanvas: React.FC<Heart3DCanvasProps> = ({
  prediction,
  selectedVessel,
  onSelectVessel,
  heartRate,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const ssaoPassRef = useRef<SSAOPass | null>(null);
  const bloomPassRef = useRef<UnrealBloomPass | null>(null);
  const heartGroupRef = useRef<THREE.Group | null>(null);
  const flowParticlesRef = useRef<THREE.Points | null>(null);
  const particlePositionsRef = useRef<Float32Array | null>(null);
  const particleCurvesRef = useRef<Array<{ curve: THREE.CatmullRomCurve3; speed: number; progress: number; vessel: VesselName }>>([]);
  const animFrameIdRef = useRef<number | null>(null);

  // Vessel Meshes Refs
  const ladMeshesRef = useRef<THREE.Mesh[]>([]);
  const lcxMeshesRef = useRef<THREE.Mesh[]>([]);
  const rcaMeshesRef = useRef<THREE.Mesh[]>([]);
  const venousMeshesRef = useRef<THREE.Mesh[]>([]);
  const glassEnvelopeMeshesRef = useRef<THREE.Mesh[]>([]);
  const internalChamberMeshesRef = useRef<THREE.Mesh[]>([]);
  const greatVesselsGroupRef = useRef<THREE.Group | null>(null);
  const microVesselsGroupRef = useRef<THREE.Group | null>(null);
  const stenosisMarkersRef = useRef<THREE.Group | null>(null);
  const pinsGroupRef = useRef<THREE.Group | null>(null);

  // Camera Target Interpolation
  const targetCamPos = useRef(new THREE.Vector3(0, 0.4, 11.2));
  const targetLookAt = useRef(new THREE.Vector3(0, -0.3, 0));
  const currentLookAt = useRef(new THREE.Vector3(0, -0.3, 0));

  // Layer & Visual States (Translucent Glass matching reference photo is default)
  const [showHeartbeat, setShowHeartbeat] = useState(true);
  const [showBloodFlow, setShowBloodFlow] = useState(true);
  const [showGreatVessels, setShowGreatVessels] = useState(true);
  const [showVenousSystem, setShowVenousSystem] = useState(true);
  const [showMicroVessels, setShowMicroVessels] = useState(true);
  const [showPins, setShowPins] = useState(true);
  const [enableSSAO, setEnableSSAO] = useState(true);
  const [enableBloom, setEnableBloom] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [envelopeMode, setEnvelopeMode] = useState<'glass' | 'solid' | 'wireframe'>('glass');
  const [activePreset, setActivePreset] = useState<'overview' | 'lad' | 'lcx' | 'rca' | 'aorta'>('overview');
  const [hoveredVessel, setHoveredVessel] = useState<VesselName | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Helper for vessel risk color
  const getVesselColor = useCallback((prob: number): THREE.Color => {
    if (prob < 0.30) {
      // Normal healthy arterial crimson/emerald
      return new THREE.Color('#e11d48'); // Rich arterial red
    } else if (prob < 0.60) {
      // Warning Amber
      return new THREE.Color('#f59e0b');
    } else {
      // Critical Stenosis Fiery Scarlet
      return new THREE.Color('#ff1744');
    }
  }, []);

  // Update dynamic vessel colors whenever prediction or selection changes
  useEffect(() => {
    const ladColor = getVesselColor(prediction.vessels.LAD.probability);
    const lcxColor = getVesselColor(prediction.vessels.LCX.probability);
    const rcaColor = getVesselColor(prediction.vessels.RCA.probability);

    ladMeshesRef.current.forEach((m) => {
      if (m.material instanceof THREE.MeshPhysicalMaterial || m.material instanceof THREE.MeshStandardMaterial) {
        m.material.color.copy(ladColor);
        const isSelected = selectedVessel === 'LAD';
        const isStenosed = prediction.vessels.LAD.probability >= 0.50;
        const intensity = isSelected ? 1.5 : isStenosed ? 1.0 : 0.45;
        m.material.emissive.copy(ladColor).multiplyScalar(intensity);
      }
    });

    lcxMeshesRef.current.forEach((m) => {
      if (m.material instanceof THREE.MeshPhysicalMaterial || m.material instanceof THREE.MeshStandardMaterial) {
        m.material.color.copy(lcxColor);
        const isSelected = selectedVessel === 'LCX';
        const isStenosed = prediction.vessels.LCX.probability >= 0.50;
        const intensity = isSelected ? 1.5 : isStenosed ? 1.0 : 0.45;
        m.material.emissive.copy(lcxColor).multiplyScalar(intensity);
      }
    });

    rcaMeshesRef.current.forEach((m) => {
      if (m.material instanceof THREE.MeshPhysicalMaterial || m.material instanceof THREE.MeshStandardMaterial) {
        m.material.color.copy(rcaColor);
        const isSelected = selectedVessel === 'RCA';
        const isStenosed = prediction.vessels.RCA.probability >= 0.50;
        const intensity = isSelected ? 1.5 : isStenosed ? 1.0 : 0.45;
        m.material.emissive.copy(rcaColor).multiplyScalar(intensity);
      }
    });

    // Update stenosis marker visibility/scale and emissive intensity
    if (stenosisMarkersRef.current) {
      stenosisMarkersRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const v = child.userData.vessel as VesselName;
          if (v) {
            const prob = prediction.vessels[v]?.probability ?? 0;
            child.visible = prob >= 0.50;
            if (prob >= 0.70) {
              child.scale.set(1.25, 1.25, 1.25);
              if (child.material instanceof THREE.MeshPhysicalMaterial) {
                child.material.emissiveIntensity = 1.6;
              }
            } else {
              child.scale.set(1.0, 1.0, 1.0);
              if (child.material instanceof THREE.MeshPhysicalMaterial) {
                child.material.emissiveIntensity = 1.1;
              }
            }
          }
        }
      });
    }
  }, [prediction, selectedVessel, getVesselColor]);

  // Update SSAO Pass and Bloom Pass parameters
  useEffect(() => {
    if (ssaoPassRef.current) {
      ssaoPassRef.current.enabled = enableSSAO;
      ssaoPassRef.current.kernelRadius = enableSSAO ? 0.75 : 0.0;
    }
  }, [enableSSAO]);

  useEffect(() => {
    if (bloomPassRef.current) {
      bloomPassRef.current.strength = enableBloom ? 0.68 : 0.0;
      bloomPassRef.current.radius = enableBloom ? 0.42 : 0.0;
    }
  }, [enableBloom]);

  // Update outer envelope material style (Glass, Solid, Wireframe)
  useEffect(() => {
    glassEnvelopeMeshesRef.current.forEach((mesh) => {
      const mat = mesh.material as THREE.MeshPhysicalMaterial;
      if (!mat) return;
      if (envelopeMode === 'glass') {
        // Glistening translucent crystal shell matching image reference
        mat.transparent = true;
        mat.opacity = 0.32;
        mat.roughness = 0.12;
        mat.metalness = 0.02;
        mat.clearcoat = 1.0;
        mat.clearcoatRoughness = 0.08;
        mat.transmission = 0.65;
        mat.ior = 1.45;
        mat.wireframe = false;
        mesh.visible = true;
      } else if (envelopeMode === 'solid') {
        mat.transparent = false;
        mat.opacity = 1.0;
        mat.roughness = 0.35;
        mat.metalness = 0.08;
        mat.clearcoat = 0.85;
        mat.transmission = 0.0;
        mat.wireframe = false;
        mesh.visible = true;
      } else {
        mat.transparent = true;
        mat.opacity = 0.75;
        mat.wireframe = true;
        mat.transmission = 0.0;
        mesh.visible = true;
      }
    });
  }, [envelopeMode]);

  // Update layer visibilities
  useEffect(() => {
    if (greatVesselsGroupRef.current) {
      greatVesselsGroupRef.current.visible = showGreatVessels;
    }
    venousMeshesRef.current.forEach((m) => {
      m.visible = showVenousSystem;
    });
    if (microVesselsGroupRef.current) {
      microVesselsGroupRef.current.visible = showMicroVessels;
    }
    if (flowParticlesRef.current) {
      flowParticlesRef.current.visible = showBloodFlow;
    }
    if (pinsGroupRef.current) {
      pinsGroupRef.current.visible = showPins;
    }
  }, [showGreatVessels, showVenousSystem, showMicroVessels, showBloodFlow, showPins]);

  // Camera presets
  const applyCameraPreset = (preset: 'overview' | 'lad' | 'lcx' | 'rca' | 'aorta') => {
    setActivePreset(preset);
    if (preset === 'overview') {
      targetCamPos.current.set(0, 0.4, 11.2);
      targetLookAt.current.set(0, -0.3, 0);
      onSelectVessel(null);
    } else if (preset === 'lad') {
      targetCamPos.current.set(0.3, -0.3, 8.2);
      targetLookAt.current.set(0.1, -1.1, 0.4);
      onSelectVessel('LAD');
    } else if (preset === 'lcx') {
      targetCamPos.current.set(-7.5, 0.6, 4.6);
      targetLookAt.current.set(-1.2, -0.4, 0);
      onSelectVessel('LCX');
    } else if (preset === 'rca') {
      targetCamPos.current.set(7.5, -0.6, 5.2);
      targetLookAt.current.set(1.4, -0.6, 0);
      onSelectVessel('RCA');
    } else if (preset === 'aorta') {
      targetCamPos.current.set(0.0, 5.8, 6.8);
      targetLookAt.current.set(0.0, 1.2, 0.0);
      onSelectVessel(null);
    }
  };

  const handleZoom = (inOut: 'in' | 'out') => {
    if (!cameraRef.current) return;
    const factor = inOut === 'in' ? 0.82 : 1.22;
    targetCamPos.current.multiplyScalar(factor);
    const dist = targetCamPos.current.length();
    if (dist < 4.5) targetCamPos.current.setLength(4.5);
    if (dist > 18) targetCamPos.current.setLength(18);
  };

  const toggleFullscreen = () => {
    if (!mountRef.current?.parentElement) return;
    if (!document.fullscreenElement) {
      mountRef.current.parentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Three.js Scene Setup
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene & Dark Cinematic Studio Background (matches the image's pure black studio lighting)
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color('#070205');
    scene.fog = new THREE.FogExp2(0x070205, 0.02);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0.4, 11.2);
    cameraRef.current = camera;

    // WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // ---------------------------------------------------------
    // POST-PROCESSING: SSAO + BLOOM + COLOR PASSES
    // ---------------------------------------------------------
    const composer = new EffectComposer(renderer);
    composerRef.current = composer;

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Screen Space Ambient Occlusion (SSAO)
    // Deepens crevices between coronary vessels and cardiac wall
    const ssaoPass = new SSAOPass(scene, camera, width, height);
    ssaoPass.kernelRadius = 0.75;
    ssaoPass.minDistance = 0.003;
    ssaoPass.maxDistance = 0.22;
    ssaoPassRef.current = ssaoPass;
    composer.addPass(ssaoPass);

    // Selective Unreal Bloom (Cinematic glow on vascular arteries & particles)
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.68, // strength
      0.42, // radius
      0.52  // threshold
    );
    bloomPassRef.current = bloomPass;
    composer.addPass(bloomPass);

    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    // ---------------------------------------------------------
    // HIGH-CONTRAST CINEMATIC STUDIO LIGHTING (Matching image.png)
    // ---------------------------------------------------------
    const ambientLight = new THREE.AmbientLight(0xfff1f2, 0.75);
    scene.add(ambientLight);

    // High-Contrast Key Light (Top-Right Angle)
    const keyLight = new THREE.DirectionalLight(0xfff5ea, 2.2);
    keyLight.position.set(7, 9, 8);
    keyLight.castShadow = true;
    scene.add(keyLight);

    // Soft Crimson Fill Light (Lower-Left Angle)
    const fillLight = new THREE.DirectionalLight(0xf43f5e, 0.85);
    fillLight.position.set(-8, -4, 4);
    scene.add(fillLight);

    // Crisp Ice-Blue Rim Light (Separates vascular curves from background)
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.45);
    rimLight.position.set(2, 8, -8);
    scene.add(rimLight);

    // Pure Ruby Volumetric Up-light
    const bounceLight = new THREE.DirectionalLight(0xbe123c, 0.7);
    bounceLight.position.set(0, -8, 2);
    scene.add(bounceLight);

    // Root Heart Group
    const heartGroup = new THREE.Group();
    heartGroupRef.current = heartGroup;
    scene.add(heartGroup);

    // ---------------------------------------------------------
    // 1. TRANSLUCENT CRYSTAL-GLASS CARDIAC ENVELOPE (Matches image.png)
    // ---------------------------------------------------------
    glassEnvelopeMeshesRef.current = [];

    // Glistening clear crystal shell material with fresnel reflections
    const glassShellMat = new THREE.MeshPhysicalMaterial({
      color: 0x9f1239, // Warm garnet undertone
      transmission: 0.65, // Transparent glass-like transmission
      transparent: true,
      opacity: 0.32,
      roughness: 0.12,
      metalness: 0.02,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      ior: 1.45,
      reflectivity: 0.7,
      side: THREE.DoubleSide,
      depthWrite: false, // Allows crisp internal depth visibility
    });

    // Anatomical Ventricular Conical Shell
    const lvGeo = new THREE.ConeGeometry(2.35, 4.6, 48, 32);
    lvGeo.rotateX(Math.PI);
    lvGeo.rotateZ(0.24);
    lvGeo.translate(-0.35, -1.35, 0.1);
    const lvMesh = new THREE.Mesh(lvGeo, glassShellMat);
    heartGroup.add(lvMesh);
    glassEnvelopeMeshesRef.current.push(lvMesh);

    // Right Ventricle Curvature
    const rvGeo = new THREE.SphereGeometry(1.85, 44, 36);
    rvGeo.scale(1.25, 1.75, 0.95);
    rvGeo.translate(1.05, -0.9, 0.45);
    const rvMesh = new THREE.Mesh(rvGeo, glassShellMat);
    heartGroup.add(rvMesh);
    glassEnvelopeMeshesRef.current.push(rvMesh);

    // ---------------------------------------------------------
    // 2. INTERNAL CARDIAC ANATOMY: CHAMBERS & VALVULAR RINGS (Visible through glass)
    // ---------------------------------------------------------
    internalChamberMeshesRef.current = [];

    const internalMuscleMat = new THREE.MeshPhysicalMaterial({
      color: 0x4a0417, // Deep muscular inner septum
      roughness: 0.45,
      metalness: 0.1,
      clearcoat: 0.6,
    });

    // Inner Muscular Septal Core
    const septumGeo = new THREE.CylinderGeometry(0.5, 0.25, 3.2, 20);
    septumGeo.rotateZ(-0.2);
    septumGeo.translate(-0.1, -1.2, 0.2);
    const septumMesh = new THREE.Mesh(septumGeo, internalMuscleMat);
    heartGroup.add(septumMesh);
    internalChamberMeshesRef.current.push(septumMesh);

    // Fibrous Valvular Annuli Rings (Prominently visible inside in image.png)
    const valveRingMat = new THREE.MeshPhysicalMaterial({
      color: 0xfde047, // Golden fibro-cartilaginous valve ring
      roughness: 0.3,
      metalness: 0.4,
      clearcoat: 0.8,
      emissive: 0xd97706,
      emissiveIntensity: 0.35,
    });

    // Aortic Valve Annulus Ring
    const aorticAnnulusGeo = new THREE.TorusGeometry(0.65, 0.1, 16, 32);
    aorticAnnulusGeo.rotateX(Math.PI * 0.45);
    aorticAnnulusGeo.translate(-0.1, 0.65, 0.3);
    const aorticAnnulus = new THREE.Mesh(aorticAnnulusGeo, valveRingMat);
    heartGroup.add(aorticAnnulus);

    // Pulmonary Valve Annulus Ring
    const pulAnnulusGeo = new THREE.TorusGeometry(0.58, 0.09, 16, 32);
    pulAnnulusGeo.rotateX(Math.PI * 0.4);
    pulAnnulusGeo.rotateY(-0.25);
    pulAnnulusGeo.translate(0.55, 0.52, 0.72);
    const pulAnnulus = new THREE.Mesh(pulAnnulusGeo, valveRingMat);
    heartGroup.add(pulAnnulus);

    // Mitral / Tricuspid Valve Ring
    const atrioventricularRingGeo = new THREE.TorusGeometry(0.85, 0.11, 16, 32);
    atrioventricularRingGeo.rotateX(Math.PI * 0.42);
    atrioventricularRingGeo.translate(-0.75, 0.4, -0.2);
    const avRing = new THREE.Mesh(atrioventricularRingGeo, valveRingMat);
    heartGroup.add(avRing);

    // ---------------------------------------------------------
    // 3. GREAT VESSELS: AORTA & PULMONARY ARTERY (Matching image.png)
    // ---------------------------------------------------------
    const greatVesselsGroup = new THREE.Group();
    greatVesselsGroupRef.current = greatVesselsGroup;
    heartGroup.add(greatVesselsGroup);

    // Glossy Arterial Red Aorta Material
    const aortaMat = new THREE.MeshPhysicalMaterial({
      color: 0xdc2626, // Vivid arterial red
      roughness: 0.22,
      metalness: 0.15,
      clearcoat: 0.95,
      clearcoatRoughness: 0.1,
    });

    // Ascending Aorta & Arch
    const aortaCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.1, 0.65, 0.3),
      new THREE.Vector3(0.0, 1.85, 0.15),
      new THREE.Vector3(-0.4, 2.75, -0.3),
      new THREE.Vector3(-1.15, 2.45, -0.85),
      new THREE.Vector3(-1.35, 1.0, -1.05),
    ]);
    const aortaGeo = new THREE.TubeGeometry(aortaCurve, 52, 0.62, 26, false);
    const aortaMesh = new THREE.Mesh(aortaGeo, aortaMat);
    aortaMesh.userData = { name: 'Aorta' };
    greatVesselsGroup.add(aortaMesh);

    // 3 Supra-Aortic Branches (Brachiocephalic, Carotid, Subclavian)
    const archBranchCoords = [
      new THREE.Vector3(-0.15, 2.55, -0.1),
      new THREE.Vector3(-0.58, 2.75, -0.42),
      new THREE.Vector3(-0.98, 2.65, -0.65),
    ];
    archBranchCoords.forEach((pt, idx) => {
      const bCurve = new THREE.CatmullRomCurve3([
        pt,
        new THREE.Vector3(pt.x + 0.12, pt.y + 0.95, pt.z + 0.12 * idx),
      ]);
      const bGeo = new THREE.TubeGeometry(bCurve, 14, 0.16, 14, false);
      const bMesh = new THREE.Mesh(bGeo, aortaMat);
      greatVesselsGroup.add(bMesh);
    });

    // Deep Royal Blue Pulmonary Trunk Material (Iconic blue in image.png)
    const pulmonaryBlueMat = new THREE.MeshPhysicalMaterial({
      color: 0x1d4ed8, // Rich royal blue
      roughness: 0.22,
      metalness: 0.18,
      clearcoat: 0.95,
      clearcoatRoughness: 0.1,
    });

    // Pulmonary Trunk (curving in front of aorta toward left lung)
    const paCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.65, 0.45, 0.75),
      new THREE.Vector3(0.35, 1.65, 0.65),
      new THREE.Vector3(-0.25, 2.05, 0.25),
      new THREE.Vector3(-1.25, 1.85, -0.45),
    ]);
    const paGeo = new THREE.TubeGeometry(paCurve, 40, 0.56, 24, false);
    const paMesh = new THREE.Mesh(paGeo, pulmonaryBlueMat);
    paMesh.userData = { name: 'PulmonaryTrunk' };
    greatVesselsGroup.add(paMesh);

    // Right Pulmonary Artery branch (branching beneath aorta)
    const rpaCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.25, 2.05, 0.25),
      new THREE.Vector3(0.85, 1.8, -0.3),
      new THREE.Vector3(1.65, 1.65, -0.6),
    ]);
    const rpaGeo = new THREE.TubeGeometry(rpaCurve, 20, 0.38, 16, false);
    const rpaMesh = new THREE.Mesh(rpaGeo, pulmonaryBlueMat);
    greatVesselsGroup.add(rpaMesh);

    // Superior Vena Cava (Blue venous inlet)
    const svcCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.65, 2.6, -0.4),
      new THREE.Vector3(1.55, 1.3, -0.3),
      new THREE.Vector3(1.35, 0.65, -0.2),
    ]);
    const svcGeo = new THREE.TubeGeometry(svcCurve, 20, 0.44, 18, false);
    const svcMesh = new THREE.Mesh(svcGeo, pulmonaryBlueMat);
    svcMesh.userData = { name: 'SuperiorVenaCava' };
    greatVesselsGroup.add(svcMesh);

    // ---------------------------------------------------------
    // 4. CORONARY ARTERY TREE (Red / Dynamically Risk-Coded)
    // ---------------------------------------------------------
    ladMeshesRef.current = [];
    lcxMeshesRef.current = [];
    rcaMeshesRef.current = [];

    // Left Main Trunk (from left aortic sinus)
    const lmcaCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.22, 0.62, 0.42),
      new THREE.Vector3(-0.58, 0.48, 0.72),
      new THREE.Vector3(-0.88, 0.38, 0.92),
    ]);
    const lmcaGeo = new THREE.TubeGeometry(lmcaCurve, 16, 0.18, 16, false);
    const lmcaMat = new THREE.MeshPhysicalMaterial({
      color: 0xe11d48,
      roughness: 0.2,
      metalness: 0.25,
      clearcoat: 0.95,
      emissive: 0xe11d48,
      emissiveIntensity: 0.5,
    });
    const lmcaMesh = new THREE.Mesh(lmcaGeo, lmcaMat);
    heartGroup.add(lmcaMesh);

    // (A) LAD - Left Anterior Descending Artery
    const ladMainCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.88, 0.38, 0.92),
      new THREE.Vector3(-0.72, -0.4, 1.5),
      new THREE.Vector3(-0.48, -1.2, 1.8),
      new THREE.Vector3(-0.26, -2.1, 1.74),
      new THREE.Vector3(-0.16, -2.85, 1.44),
      new THREE.Vector3(-0.05, -3.45, 0.85), // Apex wrap
    ]);

    // LAD Diagonal 1 (D1)
    const ladD1Curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.72, -0.4, 1.5),
      new THREE.Vector3(-1.25, -0.9, 1.4),
      new THREE.Vector3(-1.65, -1.6, 1.05),
    ]);

    // LAD Diagonal 2 (D2)
    const ladD2Curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.48, -1.2, 1.8),
      new THREE.Vector3(-0.95, -1.85, 1.55),
      new THREE.Vector3(-1.25, -2.45, 1.15),
    ]);

    // Septal Perforator
    const ladSeptalCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.6, -0.8, 1.65),
      new THREE.Vector3(-0.25, -1.0, 1.05),
      new THREE.Vector3(0.0, -1.2, 0.5),
    ]);

    const ladGeoMain = new THREE.TubeGeometry(ladMainCurve, 55, 0.15, 16, false);
    const ladGeoD1 = new THREE.TubeGeometry(ladD1Curve, 28, 0.09, 14, false);
    const ladGeoD2 = new THREE.TubeGeometry(ladD2Curve, 28, 0.08, 14, false);
    const ladGeoSeptal = new THREE.TubeGeometry(ladSeptalCurve, 20, 0.07, 12, false);

    const baseArteryMat = new THREE.MeshPhysicalMaterial({
      color: 0xe11d48,
      roughness: 0.2,
      metalness: 0.28,
      clearcoat: 0.96,
      clearcoatRoughness: 0.08,
      emissive: 0xe11d48,
      emissiveIntensity: 0.45,
    });

    [ladGeoMain, ladGeoD1, ladGeoD2, ladGeoSeptal].forEach((geo) => {
      const mesh = new THREE.Mesh(geo, baseArteryMat.clone());
      mesh.userData = { vessel: 'LAD' };
      heartGroup.add(mesh);
      ladMeshesRef.current.push(mesh);
    });

    // (B) LCX - Left Circumflex Artery
    const lcxMainCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.88, 0.38, 0.92),
      new THREE.Vector3(-1.45, 0.22, 0.62),
      new THREE.Vector3(-1.9, -0.2, 0.0),
      new THREE.Vector3(-2.0, -0.9, -0.72),
      new THREE.Vector3(-1.75, -1.75, -1.15),
      new THREE.Vector3(-1.25, -2.35, -1.25),
    ]);

    // LCX OM1 & OM2
    const lcxOM1Curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.9, -0.2, 0.0),
      new THREE.Vector3(-2.15, -0.9, 0.12),
      new THREE.Vector3(-2.05, -1.75, 0.0),
    ]);

    const lcxOM2Curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.0, -0.9, -0.72),
      new THREE.Vector3(-2.1, -1.6, -0.5),
    ]);

    const lcxGeoMain = new THREE.TubeGeometry(lcxMainCurve, 55, 0.14, 16, false);
    const lcxGeoOM1 = new THREE.TubeGeometry(lcxOM1Curve, 28, 0.09, 14, false);
    const lcxGeoOM2 = new THREE.TubeGeometry(lcxOM2Curve, 20, 0.08, 12, false);

    [lcxGeoMain, lcxGeoOM1, lcxGeoOM2].forEach((geo) => {
      const mesh = new THREE.Mesh(geo, baseArteryMat.clone());
      mesh.userData = { vessel: 'LCX' };
      heartGroup.add(mesh);
      lcxMeshesRef.current.push(mesh);
    });

    // (C) RCA - Right Coronary Artery
    const rcaMainCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.32, 0.72, 0.52),
      new THREE.Vector3(1.15, 0.48, 0.92),
      new THREE.Vector3(1.75, -0.1, 1.1),
      new THREE.Vector3(1.95, -0.9, 0.85),
      new THREE.Vector3(1.85, -1.85, 0.32),
      new THREE.Vector3(1.45, -2.55, -0.42),
      new THREE.Vector3(0.72, -2.95, -0.95),
    ]);

    // RCA Conus, Acute Marginal & PDA
    const rcaConusCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.6, 0.65, 0.75),
      new THREE.Vector3(0.4, 0.8, 1.1),
      new THREE.Vector3(0.2, 0.6, 1.3),
    ]);

    const rcaAMCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.95, -0.9, 0.85),
      new THREE.Vector3(1.65, -1.55, 1.25),
      new THREE.Vector3(1.15, -2.15, 1.35),
    ]);

    const rcaPDACurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.72, -2.95, -0.95),
      new THREE.Vector3(0.42, -3.15, -0.52),
      new THREE.Vector3(0.05, -3.35, 0.12),
    ]);

    const rcaGeoMain = new THREE.TubeGeometry(rcaMainCurve, 55, 0.15, 16, false);
    const rcaGeoConus = new THREE.TubeGeometry(rcaConusCurve, 20, 0.08, 12, false);
    const rcaGeoAM = new THREE.TubeGeometry(rcaAMCurve, 28, 0.09, 14, false);
    const rcaGeoPDA = new THREE.TubeGeometry(rcaPDACurve, 28, 0.09, 14, false);

    [rcaGeoMain, rcaGeoConus, rcaGeoAM, rcaGeoPDA].forEach((geo) => {
      const mesh = new THREE.Mesh(geo, baseArteryMat.clone());
      mesh.userData = { vessel: 'RCA' };
      heartGroup.add(mesh);
      rcaMeshesRef.current.push(mesh);
    });

    // ---------------------------------------------------------
    // 5. BLUE VENOUS VASCULAR NETWORK (Prominently featured in image.png)
    // ---------------------------------------------------------
    venousMeshesRef.current = [];

    const venousMat = new THREE.MeshPhysicalMaterial({
      color: 0x2563eb, // Rich royal blue venous blood
      roughness: 0.22,
      metalness: 0.2,
      clearcoat: 0.95,
      clearcoatRoughness: 0.1,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.4,
    });

    // Great Cardiac Vein (Runs alongside LAD in anterior sulcus, exactly as in image.png)
    const gcvCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.1, -3.3, 0.9),
      new THREE.Vector3(-0.28, -2.7, 1.48),
      new THREE.Vector3(-0.38, -1.9, 1.76),
      new THREE.Vector3(-0.58, -1.0, 1.78),
      new THREE.Vector3(-0.82, -0.2, 1.48),
      new THREE.Vector3(-1.0, 0.4, 0.88),
      new THREE.Vector3(-1.5, 0.3, 0.5), // Curves to coronary sinus
    ]);
    const gcvGeo = new THREE.TubeGeometry(gcvCurve, 45, 0.12, 16, false);
    const gcvMesh = new THREE.Mesh(gcvGeo, venousMat);
    heartGroup.add(gcvMesh);
    venousMeshesRef.current.push(gcvMesh);

    // Anterior Cardiac Vein (Across right ventricular wall)
    const acvCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.5, -2.2, 1.4),
      new THREE.Vector3(0.8, -1.6, 1.35),
      new THREE.Vector3(1.1, -0.9, 1.15),
      new THREE.Vector3(1.3, -0.2, 0.8),
    ]);
    const acvGeo = new THREE.TubeGeometry(acvCurve, 30, 0.09, 14, false);
    const acvMesh = new THREE.Mesh(acvGeo, venousMat);
    heartGroup.add(acvMesh);
    venousMeshesRef.current.push(acvMesh);

    // Middle Cardiac Vein (Posterior wall)
    const mcvCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.0, -3.2, 0.1),
      new THREE.Vector3(0.35, -2.8, -0.5),
      new THREE.Vector3(0.65, -2.4, -0.9),
    ]);
    const mcvGeo = new THREE.TubeGeometry(mcvCurve, 24, 0.1, 14, false);
    const mcvMesh = new THREE.Mesh(mcvGeo, venousMat);
    heartGroup.add(mcvMesh);
    venousMeshesRef.current.push(mcvMesh);

    // Coronary Sinus (Thick venous collector)
    const csCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.5, 0.3, 0.5),
      new THREE.Vector3(-1.8, -0.2, -0.1),
      new THREE.Vector3(-1.6, -0.8, -0.7),
      new THREE.Vector3(-0.9, -1.0, -1.0),
    ]);
    const csGeo = new THREE.TubeGeometry(csCurve, 32, 0.22, 16, false);
    const csMesh = new THREE.Mesh(csGeo, venousMat);
    heartGroup.add(csMesh);
    venousMeshesRef.current.push(csMesh);

    // ---------------------------------------------------------
    // 6. MICRO-VASCULAR CAPILLARY PLEXUS (Fine branching network in image.png)
    // ---------------------------------------------------------
    const microGroup = new THREE.Group();
    microVesselsGroupRef.current = microGroup;
    heartGroup.add(microGroup);

    // Fine red arterioles
    const microRedMat = new THREE.MeshPhysicalMaterial({
      color: 0xef4444,
      roughness: 0.3,
      metalness: 0.2,
      clearcoat: 0.8,
      emissive: 0xef4444,
      emissiveIntensity: 0.4,
    });

    // Fine blue venules
    const microBlueMat = new THREE.MeshPhysicalMaterial({
      color: 0x3b82f6,
      roughness: 0.3,
      metalness: 0.2,
      clearcoat: 0.8,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.4,
    });

    // Procedural delicate micro-vascular branches curling over ventricular shell
    const microBranches = [
      // Red Arterioles branching off LAD
      [new THREE.Vector3(-0.48, -1.2, 1.8), new THREE.Vector3(-0.3, -1.5, 1.7), new THREE.Vector3(-0.15, -1.7, 1.5)],
      [new THREE.Vector3(-0.26, -2.1, 1.74), new THREE.Vector3(-0.05, -2.3, 1.6), new THREE.Vector3(0.1, -2.5, 1.3)],
      [new THREE.Vector3(-1.25, -0.9, 1.4), new THREE.Vector3(-1.45, -1.2, 1.3), new THREE.Vector3(-1.65, -1.4, 1.0)],
      [new THREE.Vector3(-1.65, -1.6, 1.05), new THREE.Vector3(-1.75, -2.0, 0.8), new THREE.Vector3(-1.8, -2.3, 0.5)],
      // Red Arterioles branching off RCA
      [new THREE.Vector3(1.75, -0.1, 1.1), new THREE.Vector3(1.5, -0.4, 1.25), new THREE.Vector3(1.3, -0.7, 1.3)],
      [new THREE.Vector3(1.85, -1.85, 0.32), new THREE.Vector3(1.6, -2.0, 0.6), new THREE.Vector3(1.35, -2.2, 0.9)],
      // Blue Venules branching off Great Cardiac Vein
      [new THREE.Vector3(-0.58, -1.0, 1.78), new THREE.Vector3(-0.75, -1.3, 1.65), new THREE.Vector3(-0.95, -1.5, 1.4)],
      [new THREE.Vector3(-0.38, -1.9, 1.76), new THREE.Vector3(-0.55, -2.2, 1.6), new THREE.Vector3(-0.7, -2.5, 1.3)],
      [new THREE.Vector3(0.8, -1.6, 1.35), new THREE.Vector3(0.6, -1.8, 1.4), new THREE.Vector3(0.4, -2.0, 1.35)],
    ];

    microBranches.forEach((pts, idx) => {
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 16, 0.045, 10, false);
      const mat = idx < 6 ? microRedMat : microBlueMat;
      const mesh = new THREE.Mesh(geo, mat);
      microGroup.add(mesh);
    });

    // ---------------------------------------------------------
    // 7. STENOSIS LESION NARROWING PLACEMENTS & CALCIFICATIONS
    // ---------------------------------------------------------
    const stenosisMarkers = new THREE.Group();
    stenosisMarkersRef.current = stenosisMarkers;
    heartGroup.add(stenosisMarkers);

    const createLesionPlaque = (pos: THREE.Vector3, vessel: VesselName) => {
      const ringGeo = new THREE.TorusGeometry(0.24, 0.08, 16, 32);
      const ringMat = new THREE.MeshPhysicalMaterial({
        color: 0xfef08a,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.1,
        roughness: 0.15,
        metalness: 0.85,
        clearcoat: 0.9,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos);
      ring.userData = { vessel, name: `${vessel}_LesionPlaque` };
      ring.visible = false;
      stenosisMarkers.add(ring);
    };

    createLesionPlaque(new THREE.Vector3(-0.58, -0.82, 1.68), 'LAD');
    createLesionPlaque(new THREE.Vector3(-1.9, -0.2, 0.0), 'LCX');
    createLesionPlaque(new THREE.Vector3(1.88, -0.62, 0.98), 'RCA');

    // ---------------------------------------------------------
    // 8. 3D ANATOMICAL CALLOUT PINS
    // ---------------------------------------------------------
    const pinsGroup = new THREE.Group();
    pinsGroupRef.current = pinsGroup;
    heartGroup.add(pinsGroup);

    const createPin = (pos: THREE.Vector3, label: string, vessel: VesselName | null) => {
      const pinSphereGeo = new THREE.SphereGeometry(0.12, 16, 16);
      const pinMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const pinSphere = new THREE.Mesh(pinSphereGeo, pinMat);
      pinSphere.position.copy(pos);
      pinSphere.userData = { pinLabel: label, vessel };
      pinsGroup.add(pinSphere);

      const ringGeo = new THREE.RingGeometry(0.16, 0.22, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xe11d48,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos);
      ring.position.z += 0.01;
      pinsGroup.add(ring);
    };

    createPin(new THREE.Vector3(-0.48, -1.2, 1.95), 'LAD', 'LAD');
    createPin(new THREE.Vector3(-2.15, -0.4, 0.2), 'LCX', 'LCX');
    createPin(new THREE.Vector3(2.1, -0.9, 0.95), 'RCA', 'RCA');
    createPin(new THREE.Vector3(-0.4, 2.85, -0.3), 'Aorta', null);
    createPin(new THREE.Vector3(-0.05, -3.55, 0.95), 'Apex', null);

    // ---------------------------------------------------------
    // 9. ARTERIAL BLOOD FLOW PARTICLE SIMULATION (Glowing in Bloom)
    // ---------------------------------------------------------
    const particleCount = 380;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);

    const curvesPool: Array<{ curve: THREE.CatmullRomCurve3; speed: number; vessel: VesselName }> = [
      { curve: ladMainCurve, speed: 0.009, vessel: 'LAD' },
      { curve: ladD1Curve, speed: 0.007, vessel: 'LAD' },
      { curve: ladD2Curve, speed: 0.006, vessel: 'LAD' },
      { curve: lcxMainCurve, speed: 0.008, vessel: 'LCX' },
      { curve: lcxOM1Curve, speed: 0.006, vessel: 'LCX' },
      { curve: rcaMainCurve, speed: 0.009, vessel: 'RCA' },
      { curve: rcaAMCurve, speed: 0.007, vessel: 'RCA' },
      { curve: rcaPDACurve, speed: 0.007, vessel: 'RCA' },
    ];

    particleCurvesRef.current = [];
    for (let i = 0; i < particleCount; i++) {
      const source = curvesPool[i % curvesPool.length];
      particleCurvesRef.current.push({
        curve: source.curve,
        speed: source.speed * (0.85 + Math.random() * 0.3),
        progress: Math.random(),
        vessel: source.vessel,
      });

      particleColors[i * 3 + 0] = 1.0;
      particleColors[i * 3 + 1] = 0.25;
      particleColors[i * 3 + 2] = 0.45;
    }

    const flowGeo = new THREE.BufferGeometry();
    flowGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    flowGeo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
    particlePositionsRef.current = particlePositions;

    const flowMat = new THREE.PointsMaterial({
      size: 0.16,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    const flowPoints = new THREE.Points(flowGeo, flowMat);
    flowParticlesRef.current = flowPoints;
    heartGroup.add(flowPoints);

    // ---------------------------------------------------------
    // 10. INTERACTION: MOUSE ROTATION & RAYCASTING
    // ---------------------------------------------------------
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (isDragging && heartGroupRef.current) {
        const deltaX = e.clientX - prevMouseX;
        const deltaY = e.clientY - prevMouseY;
        heartGroupRef.current.rotation.y += deltaX * 0.008;
        heartGroupRef.current.rotation.x += deltaY * 0.008;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
      } else {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);
        const allVesselMeshes = [
          ...ladMeshesRef.current,
          ...lcxMeshesRef.current,
          ...rcaMeshesRef.current,
        ];
        const intersects = raycaster.intersectObjects(allVesselMeshes, false);
        if (intersects.length > 0) {
          const v = intersects[0].object.userData.vessel as VesselName;
          if (v) {
            setHoveredVessel(v);
            container.style.cursor = 'pointer';
            return;
          }
        }
        setHoveredVessel(null);
        container.style.cursor = isDragging ? 'grabbing' : 'grab';
      }
    };

    const handleMouseUp = () => {
      isDragging = false;
      container.style.cursor = 'grab';
    };

    const handleClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

      if (pinsGroupRef.current) {
        const pinIntersects = raycaster.intersectObjects(pinsGroupRef.current.children, true);
        if (pinIntersects.length > 0) {
          const pVessel = pinIntersects[0].object.userData.vessel as VesselName;
          if (pVessel) {
            onSelectVessel(pVessel);
            return;
          }
        }
      }

      const allVesselMeshes = [
        ...ladMeshesRef.current,
        ...lcxMeshesRef.current,
        ...rcaMeshesRef.current,
      ];
      const intersects = raycaster.intersectObjects(allVesselMeshes, false);
      if (intersects.length > 0) {
        const v = intersects[0].object.userData.vessel as VesselName;
        if (v) {
          onSelectVessel(v);
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!cameraRef.current) return;
      const zoomDelta = e.deltaY * 0.004;
      const currentDist = cameraRef.current.position.length();
      const newDist = Math.max(4.5, Math.min(18.0, currentDist + zoomDelta));
      cameraRef.current.position.setLength(newDist);
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('click', handleClick);
    container.addEventListener('wheel', handleWheel, { passive: false });

    // ---------------------------------------------------------
    // 11. ANIMATION LOOP: HEARTBEAT, BLOOD FLOW, LERPING, SSAO+BLOOM
    // ---------------------------------------------------------
    let clock = new THREE.Clock();

    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      // Camera smooth damping towards target
      if (cameraRef.current) {
        cameraRef.current.position.lerp(targetCamPos.current, 0.05);
        currentLookAt.current.lerp(targetLookAt.current, 0.05);
        cameraRef.current.lookAt(currentLookAt.current);
      }

      // Optional Auto-Rotation
      if (heartGroupRef.current && autoRotate && !isDragging) {
        heartGroupRef.current.rotation.y += delta * 0.45;
      }

      // Systolic heartbeat contraction
      if (heartGroupRef.current && showHeartbeat) {
        const bps = heartRate / 60;
        const cycle = (time * bps) % 1;
        const systolicPulse = Math.sin(cycle * Math.PI * 2);
        const scale = 1.0 + (systolicPulse > 0 ? systolicPulse * 0.042 : systolicPulse * 0.016);
        heartGroupRef.current.scale.set(scale, scale * 0.98, scale);
      }

      // Blood flow particle progression
      if (flowParticlesRef.current && particlePositionsRef.current && showBloodFlow) {
        const positions = particlePositionsRef.current;
        const curves = particleCurvesRef.current;
        for (let i = 0; i < curves.length; i++) {
          const item = curves[i];
          const vProb = prediction.vessels[item.vessel]?.probability ?? 0;
          const speedMultiplier = vProb >= 0.5 ? 0.45 : 1.0;

          item.progress = (item.progress + item.speed * speedMultiplier) % 1.0;
          const pt = item.curve.getPointAt(item.progress);
          positions[i * 3 + 0] = pt.x;
          positions[i * 3 + 1] = pt.y;
          positions[i * 3 + 2] = pt.z;
        }
        flowParticlesRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // Render through Composer (SSAO + Bloom)
      if (composerRef.current) {
        composerRef.current.render();
      } else {
        renderer.render(scene, camera);
      }
    };

    animate();

    const handleResize = () => {
      if (!container || !cameraRef.current || !rendererRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
      if (composerRef.current) {
        composerRef.current.setSize(w, h);
      }
      if (ssaoPassRef.current) {
        ssaoPassRef.current.setSize(w, h);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('click', handleClick);
      container.removeEventListener('wheel', handleWheel);
      if (composerRef.current) {
        composerRef.current.dispose();
      }
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [heartRate, onSelectVessel, showBloodFlow, showHeartbeat, autoRotate, prediction]);

  return (
    <div className="relative w-full h-full min-h-[520px] flex flex-col bg-[#070205] rounded-xl overflow-hidden border border-[#3f1025] shadow-2xl">
      {/* 3D Canvas Mount Point */}
      <div ref={mountRef} className="w-full flex-1 relative cursor-grab select-none" />

      {/* Top Floating HUD: Anatomical Orientation Presets & Telemetry */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
        {/* Left: View Presets with Burgundy Glass */}
        <div className="flex items-center gap-1.5 p-1 bg-[#1a0612]/90 backdrop-blur-md rounded-lg border border-[#4c1228] pointer-events-auto shadow-md">
          <button
            onClick={() => applyCameraPreset('overview')}
            className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
              activePreset === 'overview'
                ? 'bg-[#881337] text-rose-100 shadow-sm'
                : 'text-rose-300/70 hover:text-rose-100'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => applyCameraPreset('lad')}
            className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
              activePreset === 'lad'
                ? 'bg-[#881337] text-rose-100 shadow-sm'
                : 'text-rose-300/70 hover:text-rose-100'
            }`}
          >
            LAD (Anterior)
          </button>
          <button
            onClick={() => applyCameraPreset('lcx')}
            className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
              activePreset === 'lcx'
                ? 'bg-[#881337] text-rose-100 shadow-sm'
                : 'text-rose-300/70 hover:text-rose-100'
            }`}
          >
            LCX (Lateral)
          </button>
          <button
            onClick={() => applyCameraPreset('rca')}
            className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
              activePreset === 'rca'
                ? 'bg-[#881337] text-rose-100 shadow-sm'
                : 'text-rose-300/70 hover:text-rose-100'
            }`}
          >
            RCA (Inferior)
          </button>
          <button
            onClick={() => applyCameraPreset('aorta')}
            className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
              activePreset === 'aorta'
                ? 'bg-[#881337] text-rose-100 shadow-sm'
                : 'text-rose-300/70 hover:text-rose-100'
            }`}
          >
            Aortic Root
          </button>
        </div>

        {/* Right: Cardiac Rhythm & Live HR */}
        <div className="flex items-center gap-2 px-3 py-1 bg-[#1a0612]/90 backdrop-blur-md rounded-lg border border-[#4c1228] pointer-events-auto shadow-md">
          <Activity className="w-4 h-4 text-rose-500 animate-pulse" />
          <span className="text-xs text-rose-300/80">Cardiac Rhythm:</span>
          <span className="text-xs font-mono font-bold text-rose-100 tabular-nums">{heartRate} BPM</span>
        </div>
      </div>

      {/* Floating Vessel Inspection Badge (when selected or hovered) */}
      {(hoveredVessel || selectedVessel) && (
        <div className="absolute top-14 left-3 px-3 py-1.5 bg-[#26091a]/95 backdrop-blur-md rounded-lg border border-rose-500/50 pointer-events-none flex items-center gap-2 shadow-xl animate-in fade-in duration-150">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
          <span className="text-xs font-bold text-rose-100">
            {hoveredVessel || selectedVessel}
          </span>
          <span className="text-xs text-rose-400/60">·</span>
          <span className="text-xs text-rose-200">
            {hoveredVessel === 'LAD' || selectedVessel === 'LAD'
              ? 'Left Anterior Descending'
              : hoveredVessel === 'LCX' || selectedVessel === 'LCX'
              ? 'Left Circumflex'
              : 'Right Coronary Artery'}
          </span>
          <span className="text-xs text-rose-400/60">·</span>
          <span className="text-xs font-mono font-bold text-rose-300 tabular-nums">
            {((prediction.vessels[hoveredVessel || selectedVessel || 'LAD'].probability) * 100).toFixed(1)}% Stenosis Risk
          </span>
        </div>
      )}

      {/* Quick Navigation HUD Overlay (Right Column Controls: Zoom, Rotate, SSAO, Bloom, Fullscreen) */}
      <div className="absolute right-3 top-14 flex flex-col gap-1.5 pointer-events-auto">
        <button
          onClick={() => setAutoRotate(!autoRotate)}
          className={`p-2 rounded-lg backdrop-blur-md border transition-colors shadow-md ${
            autoRotate
              ? 'bg-[#881337] text-white border-rose-400'
              : 'bg-[#1a0612]/80 text-rose-300/80 border-[#4c1228] hover:text-white hover:bg-[#2b0c1e]'
          }`}
          title="Toggle 360° Auto-Rotation"
        >
          {autoRotate ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>

        {/* SSAO Ambient Occlusion Toggle */}
        <button
          onClick={() => setEnableSSAO(!enableSSAO)}
          className={`p-2 rounded-lg backdrop-blur-md border transition-colors shadow-md ${
            enableSSAO
              ? 'bg-[#881337] text-amber-200 border-amber-400/80'
              : 'bg-[#1a0612]/80 text-rose-300/50 border-[#4c1228] hover:text-rose-200'
          }`}
          title="Toggle Screen Space Ambient Occlusion (SSAO) Deep Contact Shadows"
        >
          <Sun className="w-4 h-4" />
        </button>

        {/* Bloom Glow Toggle */}
        <button
          onClick={() => setEnableBloom(!enableBloom)}
          className={`p-2 rounded-lg backdrop-blur-md border transition-colors shadow-md ${
            enableBloom
              ? 'bg-[#881337] text-rose-200 border-rose-400/80'
              : 'bg-[#1a0612]/80 text-rose-300/50 border-[#4c1228] hover:text-rose-200'
          }`}
          title="Toggle Cinematic Vascular Bloom Glow"
        >
          <Flame className="w-4 h-4" />
        </button>

        <button
          onClick={() => handleZoom('in')}
          className="p-2 rounded-lg bg-[#1a0612]/80 text-rose-300/80 border border-[#4c1228] hover:text-white hover:bg-[#2b0c1e] backdrop-blur-md transition-colors shadow-md"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <button
          onClick={() => handleZoom('out')}
          className="p-2 rounded-lg bg-[#1a0612]/80 text-rose-300/80 border border-[#4c1228] hover:text-white hover:bg-[#2b0c1e] backdrop-blur-md transition-colors shadow-md"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        <button
          onClick={toggleFullscreen}
          className="p-2 rounded-lg bg-[#1a0612]/80 text-rose-300/80 border border-[#4c1228] hover:text-white hover:bg-[#2b0c1e] backdrop-blur-md transition-colors shadow-md"
          title="Toggle Fullscreen"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom Controls Ribbon & Risk Legend */}
      <div className="px-3 py-2 bg-[#14050e]/95 backdrop-blur-md border-t border-[#3f1025] flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Layer Toggles */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* SSAO Control Badge */}
          <button
            onClick={() => setEnableSSAO(!enableSSAO)}
            className={`px-2.5 py-1 rounded text-xs flex items-center gap-1 font-medium transition-colors ${
              enableSSAO
                ? 'bg-[#881337] text-amber-200 border border-amber-500/60 shadow-sm'
                : 'text-rose-300/60 hover:text-rose-100'
            }`}
            title="Toggle SSAO Deep Vascular Contact Shadows"
          >
            <Sun className="w-3 h-3 text-amber-400" />
            <span>SSAO: {enableSSAO ? 'On' : 'Off'}</span>
          </button>

          <button
            onClick={() => setEnableBloom(!enableBloom)}
            className={`px-2.5 py-1 rounded text-xs flex items-center gap-1 font-medium transition-colors ${
              enableBloom
                ? 'bg-[#881337] text-rose-100 border border-rose-500/50 shadow-sm'
                : 'text-rose-300/60 hover:text-rose-100'
            }`}
            title="Toggle Cinematic Vascular Bloom Glow"
          >
            <Flame className="w-3 h-3 text-rose-400" />
            <span>Bloom: {enableBloom ? 'On' : 'Off'}</span>
          </button>

          <button
            onClick={() => setShowVenousSystem(!showVenousSystem)}
            className={`px-2.5 py-1 rounded text-xs flex items-center gap-1 font-medium transition-colors ${
              showVenousSystem
                ? 'bg-[#1e3a8a] text-blue-200 border border-blue-500/60 shadow-sm'
                : 'text-rose-300/60 hover:text-rose-100'
            }`}
            title="Toggle Royal Blue Venous System"
          >
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            <span>Veins</span>
          </button>

          <button
            onClick={() => setShowMicroVessels(!showMicroVessels)}
            className={`px-2.5 py-1 rounded text-xs flex items-center gap-1 font-medium transition-colors ${
              showMicroVessels
                ? 'bg-[#881337] text-rose-100 border border-rose-500/50 shadow-sm'
                : 'text-rose-300/60 hover:text-rose-100'
            }`}
            title="Toggle Micro-Vascular Capillary Network"
          >
            <Sparkles className="w-3 h-3 text-rose-300" />
            <span>Capillaries</span>
          </button>

          <button
            onClick={() => setShowGreatVessels(!showGreatVessels)}
            className={`px-2.5 py-1 rounded text-xs flex items-center gap-1 font-medium transition-colors ${
              showGreatVessels
                ? 'bg-[#881337] text-rose-100 border border-rose-500/50 shadow-sm'
                : 'text-rose-300/60 hover:text-rose-100'
            }`}
            title="Toggle Aorta & Pulmonary Trunk"
          >
            <Eye className="w-3 h-3" />
            <span>Aorta/PA</span>
          </button>

          <button
            onClick={() => setShowHeartbeat(!showHeartbeat)}
            className={`px-2.5 py-1 rounded text-xs flex items-center gap-1 font-medium transition-colors ${
              showHeartbeat
                ? 'bg-[#881337] text-rose-100 border border-rose-500/50 shadow-sm'
                : 'text-rose-300/60 hover:text-rose-100'
            }`}
            title="Toggle Systolic Pulsation"
          >
            <Activity className="w-3 h-3" />
            <span>Pulsation</span>
          </button>

          <button
            onClick={() => setShowPins(!showPins)}
            className={`px-2.5 py-1 rounded text-xs flex items-center gap-1 font-medium transition-colors ${
              showPins
                ? 'bg-[#881337] text-rose-100 border border-rose-500/50 shadow-sm'
                : 'text-rose-300/60 hover:text-rose-100'
            }`}
            title="Toggle Anatomical Landmark Pins"
          >
            <MapPin className="w-3 h-3" />
            <span>Pins</span>
          </button>

          <button
            onClick={() => {
              const modes: Array<'glass' | 'solid' | 'wireframe'> = ['glass', 'solid', 'wireframe'];
              const next = modes[(modes.indexOf(envelopeMode) + 1) % modes.length];
              setEnvelopeMode(next);
            }}
            className="px-2.5 py-1 rounded text-xs text-rose-200 bg-[#26091a] border border-[#4c1228] flex items-center gap-1 capitalize font-medium hover:bg-[#3b0f2a]"
            title="Cycle Heart Shell (Crystal Glass matches reference image)"
          >
            <Layers className="w-3 h-3" />
            <span>Shell: {envelopeMode}</span>
          </button>
        </div>

        {/* Stenosis Risk Probability Legend */}
        <div className="flex items-center gap-3 text-xs text-rose-300/80">
          <span className="text-[11px] text-rose-400/60 uppercase tracking-wider">Vessels:</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block shadow-sm" />
            <span>Arteries</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block shadow-sm" />
            <span>Veins</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-sm" />
            <span>Stenosis</span>
          </div>
        </div>
      </div>
    </div>
  );
};
