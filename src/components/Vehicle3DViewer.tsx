import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import {
  Box,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Compass,
  Download,
  Eye,
  FileCode,
  Layers,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  Vehicle,
  Vehicle3DAICalibration,
  VehicleAngleLabel,
  VehicleBodyType,
  VehicleMedia,
} from '../types/fleet';
import { useFleet } from '../context/FleetContext';
import { formatINR, formatKm, getDaysUntilExpiry } from '../lib/calculations';

// Pre-allocated math helpers at module scope (Zero GC inside render loop)
const _camTargetPos = new THREE.Vector3();
const _camLookAtTarget = new THREE.Vector3();
const _rayMouse = new THREE.Vector2();
const _bbox = new THREE.Box3();
const _bboxCenter = new THREE.Vector3();
const _bboxSize = new THREE.Vector3();

export const STANDARD_INSPECTION_ANGLES: Array<{
  label: VehicleAngleLabel;
  shortTitle: string;
  degrees: number;
  description: string;
}> = [
  {
    label: '0_Front',
    shortTitle: '0° Front',
    degrees: 0,
    description: 'Front bumper, HSRP number plate, grille & headlamps',
  },
  {
    label: '45_FrontLeft',
    shortTitle: '45° Front-Left',
    degrees: 45,
    description: 'Front-left fender, passenger wheel & A-pillar',
  },
  {
    label: '90_Left',
    shortTitle: '90° Left Profile',
    degrees: 90,
    description: 'Full left passenger side doors, sill & wheelbase',
  },
  {
    label: '135_RearLeft',
    shortTitle: '135° Rear-Left',
    degrees: 135,
    description: 'Rear-left quarter panel, tail cluster & bumper corner',
  },
  {
    label: '180_Rear',
    shortTitle: '180° Rear',
    degrees: 180,
    description: 'Boot/tailgate, rear HSRP plate, reflector strip & exhaust',
  },
  {
    label: '225_RearRight',
    shortTitle: '225° Rear-Right',
    degrees: 225,
    description: 'Rear-right quarter panel, fuel/CNG filler flap & wheel',
  },
  {
    label: '270_Right',
    shortTitle: '270° Right Profile',
    degrees: 270,
    description: 'Full driver side profile, ORVM mirror & doors',
  },
  {
    label: '315_FrontRight',
    shortTitle: '315° Front-Right',
    degrees: 315,
    description: 'Driver-side front quarter, headlamp & front wheel',
  },
];

type ViewerPrimaryTab = '3d_webgl' | 'turntable_360' | 'assets_and_ai';
type CameraPresetId = 'orbit' | 'front' | 'side' | 'rear' | 'top' | 'cabin';
type LightingPresetId = 'showroom' | 'daylight' | 'night';

interface SubsystemHotspotInfo {
  id: string;
  title: string;
  subtitle: string;
  metrics: Array<{ label: string; value: string }>;
}

const PAINT_SWATCHES: Array<{ name: string; hex: string; metalness: number; roughness: number }> = [
  { name: 'Arctic White', hex: '#f8fafc', metalness: 0.35, roughness: 0.22 },
  { name: 'Silver Metallic', hex: '#cbd5e1', metalness: 0.78, roughness: 0.18 },
  { name: 'Titan Grey', hex: '#475569', metalness: 0.72, roughness: 0.24 },
  { name: 'Deep Navy', hex: '#1e3a8a', metalness: 0.68, roughness: 0.2 },
  { name: 'Fleet Teal', hex: '#0d9488', metalness: 0.62, roughness: 0.22 },
  { name: 'Amber Gold', hex: '#d97706', metalness: 0.55, roughness: 0.25 },
];

function resolveColorHexFromName(colourName: string): string {
  const lower = (colourName || '').toLowerCase();
  if (lower.includes('silver')) return '#cbd5e1';
  if (lower.includes('grey') || lower.includes('gray') || lower.includes('titan')) return '#475569';
  if (lower.includes('blue') || lower.includes('navy')) return '#1e3a8a';
  if (lower.includes('red') || lower.includes('maroon')) return '#b91c1c';
  if (lower.includes('black') || lower.includes('dark')) return '#1e293b';
  if (lower.includes('yellow') || lower.includes('gold')) return '#eab308';
  if (lower.includes('teal') || lower.includes('green')) return '#0d9488';
  return '#f8fafc';
}

/**
 * Generates a high-sharpness procedural High Security Registration Plate (HSRP) CanvasTexture.
 */
function createRegistrationPlateTexture(
  registrationNumber: string,
  isCommercial: boolean,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  // Plate background (Yellow for Commercial, White for Personal)
  ctx.fillStyle = isCommercial ? '#facc15' : '#f8fafc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Outer border
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

  // Blue IND strip on left
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(12, 12, 58, canvas.height - 24);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('IND', 41, 82);

  // Hologram chakra circle
  ctx.strokeStyle = '#93c5fd';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(41, 42, 11, 0, Math.PI * 2);
  ctx.stroke();

  // Registration text
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 48px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    (registrationNumber || 'TN-38-CZ-4512').toUpperCase(),
    284,
    canvas.height / 2 + 2
  );

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates a procedural radial contact shadow + showroom turntable floor texture.
 */
function createShowroomFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 512, 512);

  // Soft radial contact shadow under the vehicle
  const grad = ctx.createRadialGradient(256, 256, 30, 256, 256, 230);
  grad.addColorStop(0, 'rgba(2, 6, 23, 0.72)');
  grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.34)');
  grad.addColorStop(1, 'rgba(2, 6, 23, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Precision degree markings ring
  ctx.strokeStyle = 'rgba(20, 184, 166, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(256, 256, 210, 0, Math.PI * 2);
  ctx.stroke();

  for (let deg = 0; deg < 360; deg += 15) {
    const rad = (deg * Math.PI) / 180;
    const r1 = deg % 45 === 0 ? 196 : 203;
    const r2 = 210;
    ctx.strokeStyle =
      deg % 45 === 0 ? 'rgba(45, 212, 191, 0.65)' : 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = deg % 45 === 0 ? 2.5 : 1;
    ctx.beginPath();
    ctx.moveTo(256 + Math.cos(rad) * r1, 256 + Math.sin(rad) * r1);
    ctx.lineTo(256 + Math.cos(rad) * r2, 256 + Math.sin(rad) * r2);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates an 8-angle studio blueprint frame on a 2D canvas when the user
 * hasn't uploaded a real photograph for a specific turntable angle yet.
 */
function renderBlueprintAngleFrameDataUrl(
  vehicle: Vehicle,
  angleDeg: number,
  angleShortTitle: string
): string {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 450;
  const ctx = canvas.getContext('2d')!;

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 0, 450);
  bg.addColorStop(0, '#0f172a');
  bg.addColorStop(0.65, '#1e293b');
  bg.addColorStop(1, '#090d16');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 800, 450);

  // Subtle floor grid ellipse
  ctx.strokeStyle = 'rgba(20, 184, 166, 0.28)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(400, 330, 270, 56, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(400, 330, 210, 42, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Compute projected silhouette based on angleDeg
  const rad = (angleDeg * Math.PI) / 180;
  const sinA = Math.sin(rad);
  const cosA = Math.cos(rad);

  const bodyHex = resolveColorHexFromName(vehicle.colour);
  const isTall =
    vehicle.vehicleType === 'SUV' ||
    vehicle.vehicleType === 'MPV' ||
    vehicle.vehicleType === 'Commercial Van' ||
    vehicle.vehicleType === 'Truck';

  const halfLength = 155;
  const halfWidth = 74;
  const projectedHalfSpan = Math.round(
    Math.abs(sinA) * halfLength + Math.abs(cosA) * halfWidth
  );
  const bodyHeight = isTall ? 78 : 58;
  const roofHeight = isTall ? 62 : 48;
  const baseY = 305;

  // Shadow oval
  ctx.fillStyle = 'rgba(2, 6, 23, 0.65)';
  ctx.beginPath();
  ctx.ellipse(400, baseY + 18, projectedHalfSpan + 18, 24, 0, 0, Math.PI * 2);
  ctx.fill();

  // Lower chassis block
  ctx.fillStyle = bodyHex;
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(
    400 - projectedHalfSpan,
    baseY - bodyHeight,
    projectedHalfSpan * 2,
    bodyHeight,
    14
  );
  ctx.fill();
  ctx.stroke();

  // Upper cabin greenhouse
  const cabinHalfSpan = Math.round(projectedHalfSpan * (isTall ? 0.78 : 0.64));
  const cabinOffset = Math.round(-sinA * 14);
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = bodyHex;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(
    400 - cabinHalfSpan + cabinOffset,
    baseY - bodyHeight - roofHeight + 6,
    cabinHalfSpan * 2,
    roofHeight,
    16
  );
  ctx.fill();
  ctx.stroke();

  // Commercial yellow roof permit beacon
  if (vehicle.ownershipType === 'Commercial') {
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.roundRect(378 + cabinOffset, baseY - bodyHeight - roofHeight - 8, 44, 12, 4);
    ctx.fill();
  }

  // Headlamps / Taillamps indicator based on cosA
  if (cosA > 0.2) {
    // Front view component visible
    const frontCenterX = 400 + Math.round(sinA * (projectedHalfSpan * 0.55));
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(frontCenterX - 48, baseY - bodyHeight + 14, 24, 10);
    ctx.fillRect(frontCenterX + 24, baseY - bodyHeight + 14, 24, 10);
    // HSRP Plate
    ctx.fillStyle = vehicle.ownershipType === 'Commercial' ? '#facc15' : '#ffffff';
    ctx.fillRect(frontCenterX - 36, baseY - 24, 72, 16);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(vehicle.registrationNumber, frontCenterX, baseY - 13);
  } else if (cosA < -0.2) {
    // Rear view component visible
    const rearCenterX = 400 - Math.round(sinA * (projectedHalfSpan * 0.55));
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(rearCenterX - 50, baseY - bodyHeight + 14, 26, 11);
    ctx.fillRect(rearCenterX + 24, baseY - bodyHeight + 14, 26, 11);
    ctx.fillStyle = vehicle.ownershipType === 'Commercial' ? '#facc15' : '#ffffff';
    ctx.fillRect(rearCenterX - 36, baseY - 24, 72, 16);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(vehicle.registrationNumber, rearCenterX, baseY - 13);
  }

  // Wheels
  const wheelOffset = Math.round(projectedHalfSpan * 0.64);
  for (const wx of [400 - wheelOffset, 400 + wheelOffset]) {
    ctx.fillStyle = '#090d16';
    ctx.beginPath();
    ctx.arc(wx, baseY + 2, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(wx, baseY + 2, 15, 0, Math.PI * 2);
    ctx.fill();
  }

  // Top-left & bottom-right technical overlay
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(
    `REFERENCE STUDIO FRAME · ${angleShortTitle.toUpperCase()} (${angleDeg}°)`,
    24,
    34
  );
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(
    `${vehicle.registrationNumber} — ${vehicle.make} ${vehicle.model} (${vehicle.vehicleType})`,
    24,
    58
  );

  ctx.fillStyle = '#2dd4bf';
  ctx.font = '12px monospace';
  ctx.fillText(
    'Upload actual vehicle angle photo below to replace this studio reference frame',
    24,
    422
  );

  return canvas.toDataURL('image/png');
}

/**
 * Compresses an uploaded image file onto an HTML5 Canvas so its DataURL stays well
 * within Firestore's document size limit (< 90 KB).
 */
async function compressImageFileToDataUrl(
  file: File,
  maxWidth = 960,
  maxHeight = 540,
  quality = 0.76
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Failed to decode uploaded image'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Builds a composite 12-part procedural 3D vehicle assembly (`THREE.Group`)
 * following the Three.js skill directives:
 * - Primary silhouette (extruded lower chassis hull, upper cabin greenhouse)
 * - Secondary read (4 multi-part wheels with tyres/rims/rotors/calipers, glass windows, roof carrier/beacon)
 * - Accent detail (front/rear HSRP registration plates, projector headlamps, LED tail bar, wing mirrors, CNG/exhaust undercarriage)
 * - Every movable sub-assembly stores `basePosition` and `explodeVector` in `userData` for smooth damped exploded inspection!
 */
function buildCompositeProceduralVehicleGroup(
  vehicle: Vehicle,
  paintHex: string,
  metalness: number,
  roughness: number,
  wireframe: boolean,
  calibration: Vehicle3DAICalibration | null,
  maxAnisotropy: number
): {
  rootGroup: THREE.Group;
  explodableParts: THREE.Object3D[];
  bodyMaterials: THREE.MeshPhysicalMaterial[];
  wheelGroups: THREE.Object3D[];
  interactiveMeshes: THREE.Object3D[];
} {
  const rootGroup = new THREE.Group();
  rootGroup.name = `FzeeLog_Vehicle_${vehicle.registrationNumber}`;

  const explodableParts: THREE.Object3D[] = [];
  const bodyMaterials: THREE.MeshPhysicalMaterial[] = [];
  const wheelGroups: THREE.Object3D[] = [];
  const interactiveMeshes: THREE.Object3D[] = [];

  const registerPart = (
    obj: THREE.Object3D,
    explodeVec: THREE.Vector3,
    subsystemId?: string
  ) => {
    obj.userData.basePosition = obj.position.clone();
    obj.userData.explodeVector = explodeVec.clone();
    explodableParts.push(obj);
    if (subsystemId) {
      obj.traverse((child) => {
        child.userData.subsystemId = subsystemId;
      });
      interactiveMeshes.push(obj);
    }
    rootGroup.add(obj);
  };

  const bodyType: VehicleBodyType =
    calibration?.detectedBodyStyle || vehicle.vehicleType || 'Sedan';
  const isSUVOrMPV =
    bodyType === 'SUV' || bodyType === 'MPV' || bodyType === 'Commercial Van';
  const isHatchback = bodyType === 'Hatchback';
  const isTruck = bodyType === 'Truck';

  const lengthScale = calibration?.lengthScale ?? 1.0;
  const widthScale = calibration?.widthScale ?? 1.0;
  const heightScale = calibration?.heightScale ?? 1.0;
  const rideOffset = calibration?.rideHeightOffset ?? 0.0;

  // Materials (varied roughness & metalness across adjacent parts >= 0.25 difference)
  const carPaintMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(paintHex),
    metalness,
    roughness,
    clearcoat: 1.0,
    clearcoatRoughness: 0.12,
    wireframe,
  });
  bodyMaterials.push(carPaintMat);

  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.25,
    roughness: 0.72,
    wireframe,
  });

  const brushedChromeMat = new THREE.MeshPhysicalMaterial({
    color: 0xe2e8f0,
    metalness: 0.92,
    roughness: 0.16,
    clearcoat: 0.8,
    wireframe,
  });

  const opticalGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    metalness: 0.1,
    roughness: 0.08,
    transmission: 0.88,
    ior: 1.52,
    thickness: 0.8,
    transparent: true,
    opacity: 0.92,
    clearcoat: 1.0,
    depthWrite: false,
    wireframe,
  });

  const rubberTyreMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    metalness: 0.08,
    roughness: 0.86,
    wireframe,
  });

  const headlampMat = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.85,
    roughness: 0.15,
    metalness: 0.2,
    wireframe,
  });

  const taillampMat = new THREE.MeshStandardMaterial({
    color: 0xfecaca,
    emissive: 0xef4444,
    emissiveIntensity: 0.9,
    roughness: 0.2,
    metalness: 0.2,
    wireframe,
  });

  const wheelRadius = isSUVOrMPV || isTruck ? 0.38 : 0.33;
  const chassisClearance = wheelRadius + 0.04 + rideOffset;
  const bodyWidth = (isSUVOrMPV ? 1.82 : 1.72) * widthScale;
  const halfW = bodyWidth / 2;

  // 1. Primary Lower Chassis & Aerodynamic Hull (ExtrudeGeometry)
  const hullLength = (isHatchback ? 3.85 : isSUVOrMPV ? 4.55 : 4.25) * lengthScale;
  const halfL = hullLength / 2;
  const lowerHullHeight = (isSUVOrMPV ? 0.62 : 0.52) * heightScale;

  const hullShape = new THREE.Shape();
  hullShape.moveTo(-halfL, 0);
  hullShape.lineTo(halfL, 0);
  hullShape.lineTo(halfL - 0.12, lowerHullHeight * 0.88);
  hullShape.lineTo(halfL - 0.35, lowerHullHeight);
  hullShape.lineTo(-halfL + 0.22, lowerHullHeight);
  hullShape.lineTo(-halfL, lowerHullHeight * 0.82);
  hullShape.closePath();

  const hullExtrudeGeo = new THREE.ExtrudeGeometry(hullShape, {
    depth: bodyWidth - 0.12,
    bevelEnabled: true,
    bevelSegments: 4,
    steps: 1,
    bevelSize: 0.06,
    bevelThickness: 0.06,
  });
  hullExtrudeGeo.center();
  // Rotate so length is along Z (+Z front, -Z rear) and width along X
  hullExtrudeGeo.rotateY(Math.PI / 2);

  const lowerHullMesh = new THREE.Mesh(hullExtrudeGeo, carPaintMat);
  lowerHullMesh.castShadow = true;
  lowerHullMesh.receiveShadow = true;
  lowerHullMesh.position.set(0, chassisClearance + lowerHullHeight / 2, 0);
  registerPart(lowerHullMesh, new THREE.Vector3(0, 0.15, 0), 'chassis_body');

  // 2. Upper Cabin Greenhouse & Roofline (ExtrudeGeometry)
  const cabinLength = isSUVOrMPV
    ? hullLength * 0.68
    : isHatchback
    ? hullLength * 0.62
    : isTruck
    ? hullLength * 0.34
    : hullLength * 0.56;
  const cabinHeight = (isSUVOrMPV ? 0.56 : 0.46) * heightScale;
  const cabinZOffset = isTruck
    ? halfL * 0.36
    : isSUVOrMPV
    ? -0.18
    : -0.1;

  const cabinShape = new THREE.Shape();
  const cHalf = cabinLength / 2;
  cabinShape.moveTo(-cHalf, 0);
  cabinShape.lineTo(cHalf, 0);
  cabinShape.lineTo(cHalf - 0.42, cabinHeight);
  cabinShape.lineTo(
    isSUVOrMPV || isHatchback ? -cHalf + 0.22 : -cHalf + 0.48,
    cabinHeight
  );
  cabinShape.closePath();

  const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, {
    depth: bodyWidth * 0.82,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.04,
    bevelThickness: 0.04,
  });
  cabinGeo.center();
  cabinGeo.rotateY(Math.PI / 2);

  const cabinMesh = new THREE.Mesh(cabinGeo, carPaintMat);
  cabinMesh.castShadow = true;
  cabinMesh.receiveShadow = true;
  const cabinBaseY =
    chassisClearance + lowerHullHeight + cabinHeight / 2 - 0.04;
  cabinMesh.position.set(0, cabinBaseY, cabinZOffset);
  registerPart(cabinMesh, new THREE.Vector3(0, 0.55, 0), 'cabin_odometer');

  // 3. Optical Glass Greenhouse Wrap (Windshield + Side Windows + Rear Glass)
  const glassGeo = cabinGeo.clone();
  glassGeo.scale(1.015, 0.86, 0.96);
  const glassMesh = new THREE.Mesh(glassGeo, opticalGlassMat);
  glassMesh.renderOrder = 2;
  glassMesh.position.set(0, cabinBaseY - 0.01, cabinZOffset);
  registerPart(glassMesh, new THREE.Vector3(0, 0.82, 0), 'cabin_odometer');

  // 4. Undercarriage & Twin CNG / Fuel Tank Cylinder Assembly (visible in Exploded / X-Ray mode)
  const underGroup = new THREE.Group();
  const floorPanMesh = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth * 0.86, 0.08, hullLength * 0.84),
    darkTrimMat
  );
  floorPanMesh.castShadow = true;
  floorPanMesh.receiveShadow = true;
  underGroup.add(floorPanMesh);

  // S-CNG / Fuel Tank Cylinder in rear boot floor
  const tankMat = new THREE.MeshStandardMaterial({
    color: vehicle.fuelType.includes('CNG') ? 0x0d9488 : 0x475569,
    metalness: 0.65,
    roughness: 0.3,
    wireframe,
  });
  const cngTankMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, bodyWidth * 0.68, 24),
    tankMat
  );
  cngTankMesh.rotation.z = Math.PI / 2;
  cngTankMesh.position.set(0, 0.14, -halfL * 0.58);
  underGroup.add(cngTankMesh);

  // Front Engine / Powertrain Block
  const engineBlockMesh = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth * 0.48, 0.34, 0.52),
    brushedChromeMat
  );
  engineBlockMesh.position.set(0, 0.2, halfL * 0.58);
  underGroup.add(engineBlockMesh);

  underGroup.position.set(0, chassisClearance - 0.02, 0);
  registerPart(underGroup, new THREE.Vector3(0, -0.45, 0), 'engine_cng');

  // 5. Front Grille, Bumper Splitter & Projector Headlamps
  const frontModule = new THREE.Group();
  const grilleMesh = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth * 0.62, lowerHullHeight * 0.42, 0.08),
    darkTrimMat
  );
  grilleMesh.position.set(0, 0, 0);
  frontModule.add(grilleMesh);

  const chromeBarMesh = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth * 0.6, 0.04, 0.09),
    brushedChromeMat
  );
  chromeBarMesh.position.set(0, 0.06, 0.01);
  frontModule.add(chromeBarMesh);

  const leftHeadlamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.12, 0.1),
    headlampMat
  );
  leftHeadlamp.position.set(halfW * 0.68, 0.1, -0.02);
  frontModule.add(leftHeadlamp);

  const rightHeadlamp = leftHeadlamp.clone();
  rightHeadlamp.position.x = -halfW * 0.68;
  frontModule.add(rightHeadlamp);

  // Front High-Security Registration Plate (HSRP)
  const plateTex = createRegistrationPlateTexture(
    vehicle.registrationNumber,
    vehicle.ownershipType === 'Commercial',
    maxAnisotropy
  );
  const plateMat = new THREE.MeshStandardMaterial({
    map: plateTex,
    roughness: 0.35,
    metalness: 0.15,
  });
  const frontPlateMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.52, 0.13),
    plateMat
  );
  frontPlateMesh.position.set(0, -0.14, 0.055);
  frontPlateMesh.material.polygonOffset = true;
  frontPlateMesh.material.polygonOffsetFactor = -1;
  frontPlateMesh.material.polygonOffsetUnits = -1;
  frontModule.add(frontPlateMesh);

  frontModule.position.set(
    0,
    chassisClearance + lowerHullHeight * 0.45,
    halfL + 0.02
  );
  registerPart(frontModule, new THREE.Vector3(0, 0, 0.65), 'engine_cng');

  // 6. Rear Tail-Lamp Cluster, Diffuser & Rear HSRP Plate
  const rearModule = new THREE.Group();
  const rearBumperTrim = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth * 0.88, 0.16, 0.1),
    darkTrimMat
  );
  rearBumperTrim.position.set(0, -0.14, 0);
  rearModule.add(rearBumperTrim);

  const leftTaillamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.13, 0.09),
    taillampMat
  );
  leftTaillamp.position.set(halfW * 0.66, 0.12, -0.01);
  rearModule.add(leftTaillamp);

  const rightTaillamp = leftTaillamp.clone();
  rightTaillamp.position.x = -halfW * 0.66;
  rearModule.add(rightTaillamp);

  const rearPlateMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.52, 0.13),
    plateMat
  );
  rearPlateMesh.rotation.y = Math.PI;
  rearPlateMesh.position.set(0, 0.02, -0.055);
  rearModule.add(rearPlateMesh);

  rearModule.position.set(
    0,
    chassisClearance + lowerHullHeight * 0.48,
    -halfL - 0.02
  );
  registerPart(rearModule, new THREE.Vector3(0, 0, -0.65), 'puc_exhaust');

  // 7. Left & Right Wing Mirrors (ORVMs)
  const mirrorGeo = new THREE.BoxGeometry(0.18, 0.11, 0.14);
  const leftMirror = new THREE.Mesh(mirrorGeo, carPaintMat);
  leftMirror.position.set(
    halfW + 0.06,
    chassisClearance + lowerHullHeight + 0.06,
    cabinZOffset + cHalf * 0.48
  );
  registerPart(leftMirror, new THREE.Vector3(0.45, 0.2, 0), 'cabin_odometer');

  const rightMirror = new THREE.Mesh(mirrorGeo, carPaintMat);
  rightMirror.position.set(
    -halfW - 0.06,
    chassisClearance + lowerHullHeight + 0.06,
    cabinZOffset + cHalf * 0.48
  );
  registerPart(rightMirror, new THREE.Vector3(-0.45, 0.2, 0), 'cabin_odometer');

  // 8. Commercial Permit Roof Beacon / Tourist Carrier
  if (
    vehicle.ownershipType === 'Commercial' ||
    calibration?.hasRoofCarrierOrBeacon
  ) {
    const roofSignGroup = new THREE.Group();
    const carrierRails = new THREE.Mesh(
      new THREE.BoxGeometry(bodyWidth * 0.56, 0.04, cabinLength * 0.55),
      darkTrimMat
    );
    roofSignGroup.add(carrierRails);

    const taxiBeaconMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.45,
      roughness: 0.25,
      wireframe,
    });
    const beaconMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.11, 0.18),
      taxiBeaconMat
    );
    beaconMesh.position.set(0, 0.07, cabinLength * 0.12);
    roofSignGroup.add(beaconMesh);

    roofSignGroup.position.set(
      0,
      cabinBaseY + cabinHeight / 2 + 0.04,
      cabinZOffset
    );
    registerPart(
      roofSignGroup,
      new THREE.Vector3(0, 0.95, 0),
      'compliance_canopy'
    );
  }

  // 9–12. Four Multi-Part Wheel & Brake Suspension Assemblies
  const wheelbaseHalf = hullLength * 0.33;
  const trackHalf = halfW - 0.02;
  const wheelCoords: Array<{ x: number; z: number; label: string }> = [
    { x: trackHalf, z: wheelbaseHalf, label: 'FL' },
    { x: -trackHalf, z: wheelbaseHalf, label: 'FR' },
    { x: trackHalf, z: -wheelbaseHalf, label: 'RL' },
    { x: -trackHalf, z: -wheelbaseHalf, label: 'RR' },
  ];

  const tyreGeo = new THREE.CylinderGeometry(
    wheelRadius,
    wheelRadius,
    0.24,
    32
  );
  tyreGeo.rotateZ(Math.PI / 2);

  const rimGeo = new THREE.CylinderGeometry(
    wheelRadius * 0.66,
    wheelRadius * 0.66,
    0.25,
    24
  );
  rimGeo.rotateZ(Math.PI / 2);

  const rotorGeo = new THREE.CylinderGeometry(
    wheelRadius * 0.48,
    wheelRadius * 0.48,
    0.06,
    20
  );
  rotorGeo.rotateZ(Math.PI / 2);

  const caliperMat = new THREE.MeshStandardMaterial({
    color: 0x0d9488,
    metalness: 0.6,
    roughness: 0.3,
    wireframe,
  });

  for (const wc of wheelCoords) {
    const wGroup = new THREE.Group();
    const tyreMesh = new THREE.Mesh(tyreGeo, rubberTyreMat);
    tyreMesh.castShadow = true;
    tyreMesh.receiveShadow = true;
    wGroup.add(tyreMesh);

    const rimMesh = new THREE.Mesh(rimGeo, brushedChromeMat);
    wGroup.add(rimMesh);

    const rotorMesh = new THREE.Mesh(rotorGeo, darkTrimMat);
    wGroup.add(rotorMesh);

    const caliperMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, wheelRadius * 0.42, 0.14),
      caliperMat
    );
    caliperMesh.position.set(wc.x > 0 ? 0.06 : -0.06, 0.06, 0.08);
    wGroup.add(caliperMesh);

    // Bottom of tyre sits flush on ground plane y = 0
    wGroup.position.set(wc.x, wheelRadius, wc.z);
    wheelGroups.push(wGroup);
    registerPart(
      wGroup,
      new THREE.Vector3(wc.x > 0 ? 0.65 : -0.65, 0, wc.z > 0 ? 0.25 : -0.25),
      'suspension_tyres'
    );
  }

  return {
    rootGroup,
    explodableParts,
    bodyMaterials,
    wheelGroups,
    interactiveMeshes,
  };
}

export const Vehicle3DViewer: React.FC<{
  vehicle: Vehicle;
}> = ({ vehicle }) => {
  const { vehicleMedia, saveVehicleMedia, deleteVehicleMedia } = useFleet();

  // Primary viewer mode tabs
  const [activeTab, setActiveTab] = useState<ViewerPrimaryTab>('3d_webgl');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);

  // 3D WebGL controls state
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('orbit');
  const [lightingPreset, setLightingPreset] =
    useState<LightingPresetId>('showroom');
  const [paintHex, setPaintHex] = useState<string>(() =>
    resolveColorHexFromName(vehicle.colour)
  );
  const [explodeFactor, setExplodeFactor] = useState<number>(0); // 0 to 1
  const [autoRotate3D, setAutoRotate3D] = useState<boolean>(true);
  const [wireframeMode, setWireframeMode] = useState<boolean>(false);
  const [selectedSubsystemId, setSelectedSubsystemId] =
    useState<string>('chassis_body');

  // Custom GLB / glTF loaded model state
  const [loadedGlbName, setLoadedGlbName] = useState<string | null>(null);
  const [loadingGlb, setLoadingGlb] = useState<boolean>(false);
  const [glbError, setGlbError] = useState<string | null>(null);
  const [exportingGlb, setExportingGlb] = useState<boolean>(false);

  // 360-degree multi-angle image sequence state
  const [currentAngleIndex, setCurrentAngleIndex] = useState<number>(0);
  const [isSpinning360, setIsSpinning360] = useState<boolean>(false);
  const [zoom360, setZoom360] = useState<number>(1);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteConfirmMedia, setDeleteConfirmMedia] =
    useState<VehicleMedia | null>(null);

  // Optional AI Calibration & Server Status state
  const [aiServerStatus, setAiServerStatus] = useState<{
    aiCalibrationAvailable: boolean;
    externalMeshReconstructionAvailable: boolean;
    modeDescription: string;
  } | null>(null);
  const [runningAiCalibration, setRunningAiCalibration] =
    useState<boolean>(false);
  const [aiStatusMessage, setAiStatusMessage] = useState<string | null>(null);

  // Refs for stable Three.js WebGL lifecycle
  const viewerWrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const glbFileInputRef = useRef<HTMLInputElement | null>(null);
  const batchPhotoInputRef = useRef<HTMLInputElement | null>(null);

  // Mutable refs synchronized with React state so WebGL loop never tears down canvas
  const explodeTargetRef = useRef<number>(0);
  const explodeCurrentRef = useRef<number>(0);
  const cameraPresetRef = useRef<CameraPresetId>('orbit');
  const autoRotateRef = useRef<boolean>(true);
  const customGlbGroupRef = useRef<THREE.Group | null>(null);
  const proceduralGroupRef = useRef<THREE.Group | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const bodyMaterialsRef = useRef<THREE.MeshPhysicalMaterial[]>([]);

  // Filter media for this vehicle
  const thisVehicleMedia = useMemo(
    () => vehicleMedia.filter((m) => m.vehicleId === vehicle.id),
    [vehicleMedia, vehicle.id]
  );

  const anglePhotosByLabel = useMemo(() => {
    const map = new Map<VehicleAngleLabel, VehicleMedia>();
    for (const item of thisVehicleMedia) {
      if (item.mediaCategory === 'AnglePhoto') {
        map.set(item.angleLabel, item);
      }
    }
    return map;
  }, [thisVehicleMedia]);

  const persistedGlbModels = useMemo(
    () => thisVehicleMedia.filter((m) => m.mediaCategory === 'Model3D'),
    [thisVehicleMedia]
  );

  const activeAiCalibration = useMemo<Vehicle3DAICalibration | null>(() => {
    const calDoc = thisVehicleMedia.find(
      (m) => m.mediaCategory === 'AICalibration'
    );
    if (!calDoc || !calDoc.dataUrl) return null;
    try {
      return JSON.parse(calDoc.dataUrl) as Vehicle3DAICalibration;
    } catch {
      return null;
    }
  }, [thisVehicleMedia]);

  // Keep paint color synchronized when vehicle changes or AI calibration updates
  useEffect(() => {
    if (activeAiCalibration?.primaryPaintHex) {
      setPaintHex(activeAiCalibration.primaryPaintHex);
    } else {
      setPaintHex(resolveColorHexFromName(vehicle.colour));
    }
  }, [vehicle.id, vehicle.colour, activeAiCalibration]);

  // Fetch server-side AI / 3D reconstruction availability
  useEffect(() => {
    let cancelled = false;
    fetch('/api/vehicle-3d/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setAiServerStatus(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAiServerStatus({
            aiCalibrationAvailable: false,
            externalMeshReconstructionAvailable: false,
            modeDescription:
              'Standard Three.js GLB & Parametric 3D Viewer (Offline / Local)',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keyboard shortcut 'H' to toggle bottom control dock
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Synchronize React controls into mutable refs for the 60fps animation loop
  useEffect(() => {
    explodeTargetRef.current = explodeFactor;
  }, [explodeFactor]);

  useEffect(() => {
    cameraPresetRef.current = cameraPreset;
  }, [cameraPreset]);

  useEffect(() => {
    autoRotateRef.current = autoRotate3D;
    if (controlsRef.current) {
      controlsRef.current.autoRotate =
        autoRotate3D && cameraPreset === 'orbit';
    }
  }, [autoRotate3D, cameraPreset]);

  useEffect(() => {
    for (const mat of bodyMaterialsRef.current) {
      mat.color.set(paintHex);
      mat.wireframe = wireframeMode;
      mat.needsUpdate = true;
    }
    if (proceduralGroupRef.current) {
      proceduralGroupRef.current.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = (child as THREE.Mesh).material;
          if (Array.isArray(m)) {
            m.forEach((matItem: any) => {
              matItem.wireframe = wireframeMode;
            });
          } else if (m) {
            (m as any).wireframe = wireframeMode;
          }
        }
      });
    }
  }, [paintHex, wireframeMode]);

  // Update lighting preset dynamically
  useEffect(() => {
    const scene = sceneRef.current;
    const keyLight = keyLightRef.current;
    const hemiLight = hemiLightRef.current;
    if (!scene || !keyLight || !hemiLight) return;

    if (lightingPreset === 'showroom') {
      scene.background = new THREE.Color(0x0b1120);
      scene.fog = new THREE.FogExp2(0x0b1120, 0.045);
      keyLight.color.setHex(0xfff7ed);
      keyLight.intensity = 2.4;
      hemiLight.color.setHex(0x38bdf8);
      hemiLight.groundColor.setHex(0x0f172a);
      hemiLight.intensity = 0.85;
    } else if (lightingPreset === 'daylight') {
      scene.background = new THREE.Color(0x1e293b);
      scene.fog = new THREE.FogExp2(0x1e293b, 0.035);
      keyLight.color.setHex(0xffffff);
      keyLight.intensity = 3.1;
      hemiLight.color.setHex(0xbae6fd);
      hemiLight.groundColor.setHex(0x334155);
      hemiLight.intensity = 1.2;
    } else {
      scene.background = new THREE.Color(0x020617);
      scene.fog = new THREE.FogExp2(0x020617, 0.06);
      keyLight.color.setHex(0x93c5fd);
      keyLight.intensity = 1.4;
      hemiLight.color.setHex(0x14b8a6);
      hemiLight.groundColor.setHex(0x020617);
      hemiLight.intensity = 0.55;
    }
  }, [lightingPreset]);

  // Stable Three.js WebGL initialization & cleanup
  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const isHeadless =
      navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent);

    const width = mountEl.clientWidth || 800;
    const height = mountEl.clientHeight || 500;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120);
    scene.fog = new THREE.FogExp2(0x0b1120, 0.045);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(4.2, 2.1, 4.6);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isHeadless,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
      });
    } catch {
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(
      isHeadless ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = !isHeadless;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    mountEl.innerHTML = '';
    mountEl.appendChild(renderer.domElement);

    // 1. Mandatory Studio Environment Reflection (RoomEnvironment + PMREMGenerator)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    // 2. Balanced Studio Lighting Rig + RectAreaLight Softboxes
    RectAreaLightUniformsLib.init();

    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 0.85);
    hemiLight.position.set(0, 15, 0);
    scene.add(hemiLight);
    hemiLightRef.current = hemiLight;

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.4);
    keyLight.position.set(6, 9, 6);
    keyLight.castShadow = !isHeadless;
    const d = 4.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 25;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);
    keyLightRef.current = keyLight;

    const rimLight = new THREE.DirectionalLight(0x2dd4bf, 1.1);
    rimLight.position.set(-6, 4, -6);
    scene.add(rimLight);

    const overheadSoftbox = new THREE.RectAreaLight(0xffffff, 3.5, 4.5, 1.8);
    overheadSoftbox.position.set(0, 4.2, 0);
    overheadSoftbox.lookAt(0, 0.6, 0);
    scene.add(overheadSoftbox);

    // 3. Contact Shadow Grounding & Showroom Pedestal
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const floorTex = createShowroomFloorTexture(maxAniso);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      transparent: true,
      depthWrite: false,
      roughness: 0.4,
      metalness: 0.2,
    });
    floorMat.polygonOffset = true;
    floorMat.polygonOffsetFactor = -1;
    floorMat.polygonOffsetUnits = -1;

    const contactFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(7.2, 7.2),
      floorMat
    );
    contactFloor.rotation.x = -Math.PI / 2;
    contactFloor.position.y = 0.005;
    contactFloor.receiveShadow = true;
    scene.add(contactFloor);

    // Base showroom disc
    const baseDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 3.75, 0.08, 64),
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        metalness: 0.45,
        roughness: 0.6,
      })
    );
    baseDisc.position.y = -0.04;
    baseDisc.receiveShadow = true;
    scene.add(baseDisc);

    // 4. Build Composite 12-Part Procedural 3D Vehicle Group
    const initialPaint =
      activeAiCalibration?.primaryPaintHex ||
      resolveColorHexFromName(vehicle.colour);
    const initialMetalness = activeAiCalibration?.metalness ?? 0.55;
    const initialRoughness = activeAiCalibration?.roughness ?? 0.22;

    const {
      rootGroup,
      explodableParts,
      bodyMaterials,
      wheelGroups,
      interactiveMeshes,
    } = buildCompositeProceduralVehicleGroup(
      vehicle,
      initialPaint,
      initialMetalness,
      initialRoughness,
      wireframeMode,
      activeAiCalibration,
      maxAniso
    );
    scene.add(rootGroup);
    proceduralGroupRef.current = rootGroup;
    bodyMaterialsRef.current = bodyMaterials;

    // 5. OrbitControls with exponential damping
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.minDistance = 2.2;
    controls.maxDistance = 11.5;
    controls.target.set(0, 0.72, 0);
    controls.autoRotate = autoRotateRef.current;
    controls.autoRotateSpeed = 1.2;
    controlsRef.current = controls;

    // Pre-compile shaders once
    renderer.compile(scene, camera);

    // 6. High-Performance Raycasting for Subsystem Inspection
    const raycaster = new THREE.Raycaster();
    const onPointerDown = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      _rayMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _rayMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(_rayMouse, camera);
      const hits = raycaster.intersectObjects(interactiveMeshes, true);
      if (hits.length > 0) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData?.subsystemId) {
          obj = obj.parent;
        }
        if (obj?.userData?.subsystemId) {
          setSelectedSubsystemId(obj.userData.subsystemId);
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    // 7. Animation Loop with THREE.Clock and THREE.MathUtils.damp
    const clock = new THREE.Clock();
    let animFrameId = 0;

    const animate = () => {
      animFrameId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.1);

      // Smoothly damp exploded-view separation
      explodeCurrentRef.current = THREE.MathUtils.damp(
        explodeCurrentRef.current,
        explodeTargetRef.current,
        6,
        delta
      );

      const exp = explodeCurrentRef.current;
      for (let i = 0; i < explodableParts.length; i++) {
        const part = explodableParts[i];
        const basePos = part.userData.basePosition as THREE.Vector3;
        const expVec = part.userData.explodeVector as THREE.Vector3;
        if (basePos && expVec) {
          part.position.set(
            basePos.x + expVec.x * exp,
            basePos.y + expVec.y * exp,
            basePos.z + expVec.z * exp
          );
        }
      }

      // Subtle wheel rotation when auto-rotating
      if (autoRotateRef.current && cameraPresetRef.current === 'orbit') {
        for (let i = 0; i < wheelGroups.length; i++) {
          wheelGroups[i].rotation.x += delta * 0.85;
        }
      }

      // Smooth camera preset damping when not in free 'orbit' preset
      const preset = cameraPresetRef.current;
      if (preset !== 'orbit') {
        if (preset === 'front') {
          _camTargetPos.set(0, 1.15, 5.2);
          _camLookAtTarget.set(0, 0.7, 0);
        } else if (preset === 'side') {
          _camTargetPos.set(5.4, 1.2, 0);
          _camLookAtTarget.set(0, 0.72, 0);
        } else if (preset === 'rear') {
          _camTargetPos.set(0, 1.25, -5.2);
          _camLookAtTarget.set(0, 0.7, 0);
        } else if (preset === 'top') {
          _camTargetPos.set(0.01, 6.2, 0.01);
          _camLookAtTarget.set(0, 0.5, 0);
        } else if (preset === 'cabin') {
          _camTargetPos.set(1.65, 1.48, 0.45);
          _camLookAtTarget.set(0, 0.95, 0.35);
        }

        camera.position.x = THREE.MathUtils.damp(
          camera.position.x,
          _camTargetPos.x,
          5,
          delta
        );
        camera.position.y = THREE.MathUtils.damp(
          camera.position.y,
          _camTargetPos.y,
          5,
          delta
        );
        camera.position.z = THREE.MathUtils.damp(
          camera.position.z,
          _camTargetPos.z,
          5,
          delta
        );
        controls.target.x = THREE.MathUtils.damp(
          controls.target.x,
          _camLookAtTarget.x,
          6,
          delta
        );
        controls.target.y = THREE.MathUtils.damp(
          controls.target.y,
          _camLookAtTarget.y,
          6,
          delta
        );
        controls.target.z = THREE.MathUtils.damp(
          controls.target.z,
          _camLookAtTarget.z,
          6,
          delta
        );
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    // Responsive ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(mountEl);

    return () => {
      cancelAnimationFrame(animFrameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      controls.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material?.dispose();
          }
        }
      });
      renderer.dispose();
    };
  }, [vehicle.id, vehicle.vehicleType, vehicle.ownershipType, activeAiCalibration]);

  // 360-degree turntable auto-spin interval
  useEffect(() => {
    if (!isSpinning360 || activeTab !== 'turntable_360') return;
    const timer = window.setInterval(() => {
      setCurrentAngleIndex(
        (prev) => (prev + 1) % STANDARD_INSPECTION_ANGLES.length
      );
    }, 650);
    return () => window.clearInterval(timer);
  }, [isSpinning360, activeTab]);

  // Load an actual .GLB or .GLTF ArrayBuffer / DataURL into the Three.js scene
  const loadGlbBufferIntoScene = (
    bufferOrUrl: ArrayBuffer | string,
    fileName: string
  ) => {
    const scene = sceneRef.current;
    if (!scene) return;

    setLoadingGlb(true);
    setGlbError(null);

    const loader = new GLTFLoader();

    const onLoaded = (gltf: any) => {
      if (customGlbGroupRef.current) {
        scene.remove(customGlbGroupRef.current);
      }
      if (proceduralGroupRef.current) {
        proceduralGroupRef.current.visible = false;
      }

      const model = gltf.scene as THREE.Group;
      model.traverse((child: any) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // Center and normalize scale so imported GLB sits flush on y = 0
      _bbox.setFromObject(model);
      _bbox.getCenter(_bboxCenter);
      _bbox.getSize(_bboxSize);
      const maxDim = Math.max(_bboxSize.x, _bboxSize.y, _bboxSize.z, 0.001);
      const targetScale = 4.2 / maxDim;
      model.scale.setScalar(targetScale);

      _bbox.setFromObject(model);
      _bbox.getCenter(_bboxCenter);
      model.position.x -= _bboxCenter.x;
      model.position.z -= _bboxCenter.z;
      model.position.y -= _bbox.min.y;

      scene.add(model);
      customGlbGroupRef.current = model;
      setLoadedGlbName(fileName);
      setLoadingGlb(false);
      setActiveTab('3d_webgl');
    };

    const onError = (err: any) => {
      setLoadingGlb(false);
      setGlbError(
        err?.message ||
          'Failed to parse GLB/glTF 3D model file. Ensure the file is a valid binary .glb or .gltf asset.'
      );
    };

    if (typeof bufferOrUrl === 'string') {
      loader.load(bufferOrUrl, onLoaded, undefined, onError);
    } else {
      loader.parse(bufferOrUrl, '', onLoaded, onError);
    }
  };

  const handleGlbFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setGlbError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      loadGlbBufferIntoScene(arrayBuffer, file.name);

      // Persist GLB metadata (and embedded dataUrl if <= 180KB) to Firestore vehicle_media
      let embeddedDataUrl = '';
      if (file.size <= 160000) {
        embeddedDataUrl = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result || ''));
          r.onerror = () => resolve('');
          r.readAsDataURL(file);
        });
      }

      await saveVehicleMedia({
        vehicleId: vehicle.id,
        registrationNumber: vehicle.registrationNumber,
        mediaCategory: 'Model3D',
        angleLabel: 'Custom',
        angleDegrees: 0,
        fileName: file.name,
        mimeType: file.name.toLowerCase().endsWith('.gltf')
          ? 'model/gltf+json'
          : 'model/gltf-binary',
        fileSizeBytes: file.size,
        dataUrl: embeddedDataUrl,
        storagePath: `vehicle-assets/${vehicle.ownerId}/${vehicle.id}/${file.name}`,
        notes: `Uploaded custom 3D ${
          file.name.toLowerCase().endsWith('.gltf') ? 'glTF' : 'GLB'
        } model (${(file.size / 1024).toFixed(1)} KB).`,
      });
    } catch (err: any) {
      setGlbError(err?.message || 'Failed to upload GLB/glTF file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleResetToProceduralMesh = () => {
    const scene = sceneRef.current;
    if (scene && customGlbGroupRef.current) {
      scene.remove(customGlbGroupRef.current);
      customGlbGroupRef.current = null;
    }
    if (proceduralGroupRef.current) {
      proceduralGroupRef.current.visible = true;
    }
    setLoadedGlbName(null);
  };

  // Export current 3D vehicle assembly as a genuine binary .glb file via GLTFExporter
  const handleExportAndLoadBinaryGlb = async (loadIntoViewerAfterExport: boolean) => {
    const targetObj =
      customGlbGroupRef.current || proceduralGroupRef.current;
    if (!targetObj) return;

    setExportingGlb(true);
    setGlbError(null);
    try {
      const exporter = new GLTFExporter();
      const glbBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        exporter.parse(
          targetObj,
          (result) => {
            if (result instanceof ArrayBuffer) {
              resolve(result);
            } else {
              const jsonStr = JSON.stringify(result);
              resolve(new TextEncoder().encode(jsonStr).buffer);
            }
          },
          (err) => reject(err),
          { binary: true }
        );
      });

      const fileName = `${vehicle.registrationNumber.replace(
        /[^A-Z0-9]/gi,
        '_'
      )}_3D_Model.glb`;

      if (loadIntoViewerAfterExport) {
        loadGlbBufferIntoScene(glbBuffer, fileName);
      } else {
        const blob = new Blob([glbBuffer], { type: 'model/gltf-binary' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      setGlbError(err?.message || 'Failed to export binary GLB asset.');
    } finally {
      setExportingGlb(false);
    }
  };

  // Upload a single angle photo for the 360° sequence
  const handleSingleAnglePhotoUpload = async (
    angleMeta: (typeof STANDARD_INSPECTION_ANGLES)[number],
    file: File
  ) => {
    setUploadingSlot(angleMeta.label);
    setUploadError(null);
    try {
      const compressedDataUrl = await compressImageFileToDataUrl(file);
      await saveVehicleMedia({
        vehicleId: vehicle.id,
        registrationNumber: vehicle.registrationNumber,
        mediaCategory: 'AnglePhoto',
        angleLabel: angleMeta.label,
        angleDegrees: angleMeta.degrees,
        fileName: file.name,
        mimeType: 'image/jpeg',
        fileSizeBytes: file.size,
        dataUrl: compressedDataUrl,
        storagePath: `vehicle-assets/${vehicle.ownerId}/${vehicle.id}/${angleMeta.label}.jpg`,
        notes: `${angleMeta.shortTitle} inspection photograph`,
      });
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to upload angle photograph.');
    } finally {
      setUploadingSlot(null);
    }
  };

  // Batch upload multiple angle photos in order
  const handleBatchAngleUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files || []).slice(
      0,
      STANDARD_INSPECTION_ANGLES.length
    );
    if (files.length === 0) return;
    setUploadingSlot('BATCH');
    setUploadError(null);
    try {
      for (let i = 0; i < files.length; i++) {
        const angleMeta = STANDARD_INSPECTION_ANGLES[i];
        const compressedDataUrl = await compressImageFileToDataUrl(files[i]);
        await saveVehicleMedia({
          vehicleId: vehicle.id,
          registrationNumber: vehicle.registrationNumber,
          mediaCategory: 'AnglePhoto',
          angleLabel: angleMeta.label,
          angleDegrees: angleMeta.degrees,
          fileName: files[i].name,
          mimeType: 'image/jpeg',
          fileSizeBytes: files[i].size,
          dataUrl: compressedDataUrl,
          storagePath: `vehicle-assets/${vehicle.ownerId}/${vehicle.id}/${angleMeta.label}.jpg`,
          notes: `Batch uploaded ${angleMeta.shortTitle} inspection frame`,
        });
      }
      setActiveTab('turntable_360');
    } catch (err: any) {
      setUploadError(err?.message || 'Failed to process batch angle upload.');
    } finally {
      setUploadingSlot(null);
      e.target.value = '';
    }
  };

  // Run optional server-side AI Multi-Angle Calibration
  const handleRunAiCalibration = async () => {
    setRunningAiCalibration(true);
    setAiStatusMessage(null);
    try {
      const uploadedPhotos = Array.from(anglePhotosByLabel.values()).map(
        (m) => ({
          angleLabel: m.angleLabel,
          dataUrl: m.dataUrl,
        })
      );

      const res = await fetch('/api/vehicle-3d/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationNumber: vehicle.registrationNumber,
          make: vehicle.make,
          model: vehicle.model,
          vehicleType: vehicle.vehicleType,
          colour: vehicle.colour,
          photos: uploadedPhotos,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'AI calibration request failed.');
      }

      const calibration: Vehicle3DAICalibration = data.calibration;
      await saveVehicleMedia({
        vehicleId: vehicle.id,
        registrationNumber: vehicle.registrationNumber,
        mediaCategory: 'AICalibration',
        angleLabel: 'Custom',
        angleDegrees: 0,
        fileName: `${vehicle.registrationNumber}_AI_3D_Calibration.json`,
        mimeType: 'application/json',
        fileSizeBytes: JSON.stringify(calibration).length,
        dataUrl: JSON.stringify(calibration),
        storagePath: `vehicle-assets/${vehicle.ownerId}/${vehicle.id}/calibration.json`,
        notes: calibration.inspectionSummary.slice(0, 490),
      });

      setAiStatusMessage(
        `Calibrated 3D parametric proportions (${calibration.detectedBodyStyle}, L:${calibration.lengthScale}x W:${calibration.widthScale}x H:${calibration.heightScale}x): ${calibration.inspectionSummary}`
      );
    } catch (err: any) {
      setAiStatusMessage(`Error: ${err?.message || 'Calibration failed.'}`);
    } finally {
      setRunningAiCalibration(false);
    }
  };

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    const el = viewerWrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.()
        .then(() => setIsFullscreen(true))
        .catch(() => setIsFullscreen((prev) => !prev));
    } else {
      document
        .exitFullscreen?.()
        .then(() => setIsFullscreen(false))
        .catch(() => setIsFullscreen(false));
    }
  };

  // Subsystem Telemetry Details for Raycasted 3D Inspection
  const subsystemDetails: Record<string, SubsystemHotspotInfo> = useMemo(() => {
    const kmToService =
      vehicle.nextServiceOdometerKm - vehicle.currentOdometerKm;
    const fcDays = getDaysUntilExpiry(vehicle.fcExpiry);
    const insDays = getDaysUntilExpiry(vehicle.insuranceExpiry);
    const pucDays = getDaysUntilExpiry(vehicle.pollutionExpiry);

    return {
      chassis_body: {
        id: 'chassis_body',
        title: 'Primary Chassis & Body Shell',
        subtitle: `${vehicle.make} ${vehicle.model} ${vehicle.variant} (${vehicle.manufacturingYear})`,
        metrics: [
          { label: 'Body Style', value: vehicle.vehicleType },
          { label: 'Exterior Finish', value: vehicle.colour },
          { label: 'Purchase Value', value: formatINR(vehicle.purchasePrice) },
          { label: 'Operational Status', value: vehicle.status },
        ],
      },
      cabin_odometer: {
        id: 'cabin_odometer',
        title: 'Driver Cabin & Validated Odometer Console',
        subtitle: `Assigned Operator: ${vehicle.assignedDriverName || 'Unassigned'}`,
        metrics: [
          {
            label: 'Validated Odometer',
            value: formatKm(vehicle.currentOdometerKm),
          },
          {
            label: 'Next Service Target',
            value: formatKm(vehicle.nextServiceOdometerKm),
          },
          {
            label: 'Service Remaining',
            value:
              kmToService > 0 ? formatKm(kmToService) : 'Service Due Now',
          },
          { label: 'Transmission', value: vehicle.transmission },
        ],
      },
      engine_cng: {
        id: 'engine_cng',
        title: 'Powertrain, Fuel & S-CNG Tank Assembly',
        subtitle: `Fuel Configuration: ${vehicle.fuelType}`,
        metrics: [
          { label: 'Fuel System', value: vehicle.fuelType },
          {
            label: 'Last Service Date',
            value: vehicle.lastServiceDate || 'Not recorded',
          },
          {
            label: 'Last Service Odo',
            value: formatKm(vehicle.lastServiceOdometerKm),
          },
          {
            label: 'Service Interval',
            value: `Every ${formatKm(vehicle.serviceIntervalKm)}`,
          },
        ],
      },
      suspension_tyres: {
        id: 'suspension_tyres',
        title: '4-Wheel Suspension, Alloy Rims & Disc Brakes',
        subtitle: 'Running Gear & Roadworthiness Assembly',
        metrics: [
          {
            label: 'Current Odometer',
            value: formatKm(vehicle.currentOdometerKm),
          },
          {
            label: 'FC Certificate',
            value: vehicle.fcNumber || 'Pending',
          },
          {
            label: 'FC Validity',
            value:
              fcDays !== null
                ? `${vehicle.fcExpiry} (${fcDays}d)`
                : vehicle.fcExpiry || '—',
          },
          { label: 'Ownership', value: vehicle.ownershipType },
        ],
      },
      compliance_canopy: {
        id: 'compliance_canopy',
        title: 'Commercial Permit & Statutory Canopy',
        subtitle: `${vehicle.permitType || 'Commercial Permit'} (${
          vehicle.permitNumber || 'No Permit #'
        })`,
        metrics: [
          {
            label: 'Insurance Expiry',
            value:
              insDays !== null
                ? `${vehicle.insuranceExpiry} (${insDays}d)`
                : vehicle.insuranceExpiry || '—',
          },
          {
            label: 'Permit Expiry',
            value: vehicle.permitExpiry || '—',
          },
          {
            label: 'Insurance Provider',
            value: vehicle.insuranceProvider || '—',
          },
          { label: 'Registration', value: vehicle.registrationNumber },
        ],
      },
      puc_exhaust: {
        id: 'puc_exhaust',
        title: 'Rear Tailgate, HSRP Plate & PUCC Emissions',
        subtitle: 'Statutory Pollution Under Control (PUCC) & Rear Assembly',
        metrics: [
          {
            label: 'PUCC Expiry',
            value:
              pucDays !== null
                ? `${vehicle.pollutionExpiry} (${pucDays}d)`
                : vehicle.pollutionExpiry || '—',
          },
          { label: 'Fuel Type', value: vehicle.fuelType },
          { label: 'Registration Plate', value: vehicle.registrationNumber },
          { label: 'Next Service Date', value: vehicle.nextServiceDate || '—' },
        ],
      },
    };
  }, [vehicle]);

  const activeSubsystem =
    subsystemDetails[selectedSubsystemId] || subsystemDetails.chassis_body;

  // Interactive 360° drag-to-scrub handler
  const dragStartXRef = useRef<number | null>(null);
  const dragStartIndexRef = useRef<number>(0);

  const handleTurntablePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsSpinning360(false);
    dragStartXRef.current = e.clientX;
    dragStartIndexRef.current = currentAngleIndex;
  };

  const handleTurntablePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartXRef.current === null) return;
    const deltaX = e.clientX - dragStartXRef.current;
    const step = Math.round(deltaX / 36);
    const total = STANDARD_INSPECTION_ANGLES.length;
    const nextIdx = (((dragStartIndexRef.current - step) % total) + total) % total;
    if (nextIdx !== currentAngleIndex) {
      setCurrentAngleIndex(nextIdx);
    }
  };

  const handleTurntablePointerUp = () => {
    dragStartXRef.current = null;
  };

  const activeAngleMeta =
    STANDARD_INSPECTION_ANGLES[currentAngleIndex] ||
    STANDARD_INSPECTION_ANGLES[0];
  const uploadedPhotoForActiveAngle = anglePhotosByLabel.get(
    activeAngleMeta.label
  );
  const activeTurntableImageSrc = useMemo(() => {
    if (uploadedPhotoForActiveAngle?.dataUrl) {
      return uploadedPhotoForActiveAngle.dataUrl;
    }
    return renderBlueprintAngleFrameDataUrl(
      vehicle,
      activeAngleMeta.degrees,
      activeAngleMeta.shortTitle
    );
  }, [uploadedPhotoForActiveAngle, vehicle, activeAngleMeta]);

  const uploadedAngleCount = anglePhotosByLabel.size;

  return (
    <div
      ref={viewerWrapperRef}
      className={`bg-white border border-slate-200 rounded-xl overflow-hidden ${
        isFullscreen ? 'fixed inset-0 z-50 flex flex-col bg-slate-950' : ''
      }`}
    >
      {/* Top Header & Honest Mode Switcher */}
      <div className="bg-slate-900 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-teal-500/20 border border-teal-500/40 text-teal-300 flex items-center justify-center shrink-0">
            <Box className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold tracking-tight text-white">
                3D Digital Twin &amp; Multi-Angle Vehicle Studio
              </h3>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-teal-300 border border-slate-700">
                {activeTab === '3d_webgl'
                  ? loadedGlbName
                    ? `GENUINE 3D GLB/glTF MESH (${loadedGlbName})`
                    : 'GENUINE 3D WEBGL GEOMETRY (THREE.JS 12-PART ASSEMBLY)'
                  : activeTab === 'turntable_360'
                  ? `2D 360° IMAGE-SEQUENCE VIEWER (${uploadedAngleCount}/8 REAL PHOTOS)`
                  : 'GLB/glTF ASSETS & AI CALIBRATION'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {vehicle.registrationNumber} · {vehicle.make} {vehicle.model} (
              {vehicle.vehicleType}) · Never misrepresents 2D photo sequences as 3D meshes
            </p>
          </div>
        </div>

        {/* Mode Tabs & Fullscreen Button */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700">
            <button
              type="button"
              onClick={() => setActiveTab('3d_webgl')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                activeTab === '3d_webgl'
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              3D Model Viewer (WebGL / GLB)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('turntable_360')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                activeTab === 'turntable_360'
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              360° Photo Sequence ({uploadedAngleCount}/8)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('assets_and_ai')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                activeTab === 'assets_and_ai'
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              GLB &amp; AI Calibration
            </button>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* =====================================================================
          TAB 1: GENUINE 3D WEBGL VIEWER (Three.js + GLB/glTF Loader + Collapsible Bottom Dock)
         ===================================================================== */}
      <div
        className={
          activeTab === '3d_webgl'
            ? 'relative w-full bg-slate-950 select-none'
            : 'hidden'
        }
        style={{ height: isFullscreen ? 'calc(100vh - 64px)' : '540px' }}
      >
        {/* Dedicated Isolated WebGL Canvas Mount Container (100% Unobstructed Center) */}
        <div
          ref={canvasMountRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        />

        {/* Minimal Top-Left Specification & Subsystem Badge (No side-panel clutter, no backdrop-filter over WebGL) */}
        <div className="absolute top-4 left-4 pointer-events-none max-w-md bg-slate-900/95 border border-slate-700/90 rounded-xl px-4 py-3 text-white shadow-lg">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[11px] font-mono uppercase tracking-wider text-teal-400">
              {loadedGlbName
                ? `Loaded GLB Asset: ${loadedGlbName}`
                : `Interactive Subsystem · Click 3D Part to Inspect`}
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {explodeFactor > 0
                ? `Exploded ${Math.round(explodeFactor * 100)}%`
                : 'Assembled'}
            </span>
          </div>
          <p className="text-sm font-bold text-white mt-0.5">
            {activeSubsystem.title}
          </p>
          <p className="text-xs text-slate-300">{activeSubsystem.subtitle}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 pt-2 border-t border-slate-800 text-[11px]">
            {activeSubsystem.metrics.map((m, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2">
                <span className="text-slate-400">{m.label}:</span>
                <span className="font-mono font-semibold text-slate-100">
                  {m.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Hidden file input for direct .glb / .gltf upload */}
        <input
          ref={glbFileInputRef}
          type="file"
          accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
          onChange={handleGlbFileUpload}
          className="hidden"
        />

        {/* Ergonomic Unified Collapsible Bottom Control Dock (Zero Side-Flank Clutter) */}
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-4 z-10 transition-transform duration-300"
          style={{
            width: 'min(920px, 94%)',
            transform: dockCollapsed
              ? 'translate(-50%, calc(100% - 32px))'
              : 'translate(-50%, 0)',
          }}
        >
          {/* Collapse / Expand Handle (Cinema / Zen Mode Drawer) */}
          <div className="flex justify-center mb-1.5">
            <button
              type="button"
              onClick={() => setDockCollapsed((prev) => !prev)}
              className="px-3.5 py-1 text-[11px] font-mono font-semibold text-slate-200 bg-slate-900 border border-slate-700 rounded-t-lg hover:bg-slate-800 flex items-center gap-1.5 shadow"
            >
              {dockCollapsed ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5 text-teal-400" />
                  Show 3D Controls (H)
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5 text-teal-400" />
                  Hide Controls · Cinema Mode (H)
                </>
              )}
            </button>
          </div>

          {!dockCollapsed && (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-3.5 text-white shadow-2xl space-y-3">
              {/* Row 1: Camera Presets, Lighting, Wireframe & Turntable Toggles */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[11px] font-mono text-slate-400 mr-1">
                    Camera:
                  </span>
                  {(
                    [
                      { id: 'orbit', label: '360° Orbit' },
                      { id: 'front', label: 'Front' },
                      { id: 'side', label: 'Side Profile' },
                      { id: 'rear', label: 'Rear' },
                      { id: 'top', label: 'Top Canopy' },
                      { id: 'cabin', label: 'Driver Cabin' },
                    ] as Array<{ id: CameraPresetId; label: string }>
                  ).map((cam) => (
                    <button
                      key={cam.id}
                      type="button"
                      onClick={() => setCameraPreset(cam.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                        cameraPreset === cam.id
                          ? 'bg-teal-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {cam.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAutoRotate3D((prev) => !prev)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors flex items-center gap-1 ${
                      autoRotate3D
                        ? 'bg-teal-950 border-teal-600 text-teal-300'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                  >
                    {autoRotate3D ? (
                      <Pause className="w-3 h-3" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                    Auto-Spin
                  </button>

                  <button
                    type="button"
                    onClick={() => setWireframeMode((prev) => !prev)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors flex items-center gap-1 ${
                      wireframeMode
                        ? 'bg-amber-950 border-amber-500 text-amber-300'
                        : 'bg-slate-800 border-slate-700 text-slate-300'
                    }`}
                  >
                    <Layers className="w-3 h-3" />
                    Wireframe
                  </button>

                  <select
                    value={lightingPreset}
                    onChange={(e) =>
                      setLightingPreset(e.target.value as LightingPresetId)
                    }
                    aria-label="Studio lighting rig preset"
                    className="px-2.5 py-1 text-xs font-medium bg-slate-800 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  >
                    <option value="showroom">Studio Softbox</option>
                    <option value="daylight">Daylight Highway</option>
                    <option value="night">Night Shift</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Exploded Inspection Slider, Paint Finish Swatches & GLB Loader Actions */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800">
                {/* Exploded View Slider */}
                <div className="flex items-center gap-2.5 min-w-[220px] flex-1">
                  <Sliders className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <label
                    htmlFor="explode-slider"
                    className="text-xs font-medium text-slate-300 whitespace-nowrap"
                  >
                    Exploded Inspection:
                  </label>
                  <input
                    id="explode-slider"
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={explodeFactor}
                    onChange={(e) => setExplodeFactor(Number(e.target.value))}
                    className="w-full accent-teal-500 cursor-pointer"
                  />
                  <span className="text-xs font-mono text-teal-300 w-9 text-right">
                    {Math.round(explodeFactor * 100)}%
                  </span>
                </div>

                {/* Showroom Paint Finish Swatches */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono text-slate-400 mr-1">
                    Finish:
                  </span>
                  {PAINT_SWATCHES.map((sw) => (
                    <button
                      key={sw.name}
                      type="button"
                      onClick={() => setPaintHex(sw.hex)}
                      title={sw.name}
                      style={{ backgroundColor: sw.hex }}
                      className={`w-5 h-5 rounded-full border transition-transform ${
                        paintHex.toLowerCase() === sw.hex.toLowerCase()
                          ? 'border-teal-400 scale-115 ring-2 ring-teal-500/40'
                          : 'border-slate-600 hover:scale-105'
                      }`}
                    />
                  ))}
                </div>

                {/* GLB / glTF Direct Upload & Export Buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => glbFileInputRef.current?.click()}
                    disabled={loadingGlb}
                    className="px-2.5 py-1 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 rounded-md transition-colors flex items-center gap-1"
                  >
                    <Upload className="w-3 h-3" />
                    {loadingGlb ? 'Loading GLB...' : 'Load .GLB / .glTF'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportAndLoadBinaryGlb(false)}
                    disabled={exportingGlb}
                    className="px-2.5 py-1 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors flex items-center gap-1"
                    title="Export genuine binary .glb 3D model file"
                  >
                    <Download className="w-3 h-3" />
                    Export .GLB
                  </button>

                  {loadedGlbName && (
                    <button
                      type="button"
                      onClick={handleResetToProceduralMesh}
                      className="px-2 py-1 text-xs text-amber-300 bg-amber-950/80 border border-amber-700 rounded-md hover:bg-amber-900 flex items-center gap-1"
                      title="Restore parametric 12-part vehicle assembly"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset Mesh
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================================
          TAB 2: INTERACTIVE 360° MULTI-ANGLE IMAGE-SEQUENCE TURNTABLE & PHOTO UPLOAD BAY
         ===================================================================== */}
      {activeTab === 'turntable_360' && (
        <div className="p-6 space-y-6 bg-slate-50">
          {/* Honest Disclosure Banner */}
          <div className="bg-slate-900 text-white rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  2D Image-Sequence Turntable Mode
                </span>
                <span className="text-xs text-slate-300 font-mono">
                  {uploadedAngleCount} of 8 Standard Inspection Angles Uploaded
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Drag horizontally across the viewport below to scrub through the 8-angle 360° sequence. Upload real vehicle photographs for each angle slot below, or switch to the{' '}
                <button
                  type="button"
                  onClick={() => setActiveTab('3d_webgl')}
                  className="text-teal-400 underline font-semibold"
                >
                  3D Model Viewer (WebGL / GLB)
                </button>{' '}
                for genuine 3D mesh inspection.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <input
                ref={batchPhotoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={handleBatchAngleUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => batchPhotoInputRef.current?.click()}
                disabled={uploadingSlot !== null}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" />
                {uploadingSlot === 'BATCH'
                  ? 'Uploading Batch...'
                  : 'Batch Upload 8 Angles'}
              </button>
            </div>
          </div>

          {uploadError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {uploadError}
            </div>
          )}

          {/* Interactive 360° Turntable Frame Viewport */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
            <div
              onPointerDown={handleTurntablePointerDown}
              onPointerMove={handleTurntablePointerMove}
              onPointerUp={handleTurntablePointerUp}
              onPointerLeave={handleTurntablePointerUp}
              className="relative w-full h-[380px] sm:h-[440px] flex items-center justify-center overflow-hidden cursor-ew-resize select-none"
            >
              <img
                src={activeTurntableImageSrc}
                alt={`${vehicle.registrationNumber} - ${activeAngleMeta.shortTitle}`}
                draggable={false}
                style={{
                  transform: `scale(${zoom360})`,
                  transition: 'transform 150ms ease-out',
                }}
                className="max-h-full max-w-full object-contain pointer-events-none"
              />

              {/* Top-left Frame Badge */}
              <div className="absolute top-3 left-3 bg-slate-900/90 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono flex items-center gap-2">
                <span className="text-teal-400 font-bold">
                  {activeAngleMeta.shortTitle}
                </span>
                <span className="text-slate-400">|</span>
                <span>
                  {uploadedPhotoForActiveAngle
                    ? `Uploaded Photo (${uploadedPhotoForActiveAngle.fileName})`
                    : 'Studio Reference Template'}
                </span>
              </div>

              {/* Top-right Zoom & Auto-Spin Controls */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-slate-900/90 border border-slate-700 rounded-lg p-1 text-white">
                <button
                  type="button"
                  onClick={() => setIsSpinning360((prev) => !prev)}
                  className={`px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1 ${
                    isSpinning360
                      ? 'bg-teal-600 text-white'
                      : 'hover:bg-slate-800 text-slate-200'
                  }`}
                >
                  {isSpinning360 ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  {isSpinning360 ? 'Pause 360°' : 'Auto-Spin 360°'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setZoom360((z) => Math.max(1, Number((z - 0.25).toFixed(2))))
                  }
                  className="p-1.5 hover:bg-slate-800 rounded text-slate-200"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-mono px-1">
                  {Math.round(zoom360 * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setZoom360((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))))
                  }
                  className="p-1.5 hover:bg-slate-800 rounded text-slate-200"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Bottom Angle Scrubber Bar */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-slate-900/95 border border-slate-700 rounded-lg px-3 py-1.5">
                {STANDARD_INSPECTION_ANGLES.map((ang, idx) => {
                  const hasRealPhoto = anglePhotosByLabel.has(ang.label);
                  return (
                    <button
                      key={ang.label}
                      type="button"
                      onClick={() => {
                        setIsSpinning360(false);
                        setCurrentAngleIndex(idx);
                      }}
                      className={`px-2.5 py-1 text-xs font-mono rounded transition-colors ${
                        currentAngleIndex === idx
                          ? 'bg-teal-600 text-white font-bold'
                          : hasRealPhoto
                          ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-700/60 hover:bg-emerald-900'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {ang.degrees}°
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 8-Angle Photo Upload & Inspection Grid */}
          <div>
            <h4 className="text-sm font-bold text-slate-900 mb-3">
              Multi-Angle Vehicle Photographs (8-Point 360° Turntable Slots)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {STANDARD_INSPECTION_ANGLES.map((angleMeta, idx) => {
                const existingPhoto = anglePhotosByLabel.get(angleMeta.label);
                const isSelected = currentAngleIndex === idx;

                return (
                  <div
                    key={angleMeta.label}
                    className={`bg-white rounded-xl border p-3.5 flex flex-col justify-between gap-3 transition-colors ${
                      isSelected
                        ? 'border-teal-600 ring-2 ring-teal-500/20'
                        : 'border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <button
                          type="button"
                          onClick={() => setCurrentAngleIndex(idx)}
                          className="text-xs font-bold font-mono text-slate-900 hover:text-teal-700"
                        >
                          {angleMeta.shortTitle}
                        </button>
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded ${
                            existingPhoto
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {existingPhoto ? 'Uploaded' : 'Template'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mb-2">
                        {angleMeta.description}
                      </p>

                      {existingPhoto?.dataUrl && (
                        <button
                          type="button"
                          onClick={() => setCurrentAngleIndex(idx)}
                          className="w-full h-24 rounded-lg overflow-hidden border border-slate-200 bg-slate-950 block"
                        >
                          <img
                            src={existingPhoto.dataUrl}
                            alt={angleMeta.shortTitle}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <label className="flex-1 px-2.5 py-1.5 text-xs font-semibold text-center text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg cursor-pointer transition-colors">
                        {uploadingSlot === angleMeta.label
                          ? 'Saving...'
                          : existingPhoto
                          ? 'Replace Photo'
                          : 'Upload Photo'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              handleSingleAnglePhotoUpload(angleMeta, f);
                            }
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>

                      {existingPhoto && (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmMedia(existingPhoto)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete uploaded angle photo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: GLB / glTF 3D ASSET MANAGER & OPTIONAL AI MULTI-ANGLE CALIBRATION
         ===================================================================== */}
      {activeTab === 'assets_and_ai' && (
        <div className="p-6 space-y-6 bg-slate-50">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Panel 1: Genuine GLB / glTF 3D Model Loader & Exporter */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-teal-600" />
                    GLB / glTF 3D Asset Pipeline
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Import an external `.glb` or `.gltf` 3D vehicle mesh or export the calibrated Three.js vehicle assembly as a standard binary `.glb` file.
                  </p>
                </div>
              </div>

              {glbError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {glbError}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => glbFileInputRef.current?.click()}
                  disabled={loadingGlb}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {loadingGlb
                    ? 'Parsing 3D Mesh...'
                    : 'Upload Custom .GLB / .glTF File'}
                </button>

                <button
                  type="button"
                  onClick={() => handleExportAndLoadBinaryGlb(false)}
                  disabled={exportingGlb}
                  className="px-4 py-2 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {exportingGlb
                    ? 'Exporting Binary .GLB...'
                    : 'Download Binary .GLB Model'}
                </button>

                <button
                  type="button"
                  onClick={() => handleExportAndLoadBinaryGlb(true)}
                  disabled={exportingGlb}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Test Round-Trip .GLB Loader
                </button>
              </div>

              {/* Persisted 3D Model Records */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <p className="text-xs font-semibold text-slate-700">
                  Recorded 3D Model Assets ({persistedGlbModels.length})
                </p>
                {persistedGlbModels.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No custom external `.glb`/`.gltf` files attached yet. Using the 12-part procedural Three.js vehicle mesh for {vehicle.registrationNumber}.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {persistedGlbModels.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      >
                        <div>
                          <p className="font-mono font-semibold text-slate-900">
                            {item.fileName}
                          </p>
                          <p className="text-slate-500">
                            {(item.fileSizeBytes / 1024).toFixed(1)} KB ·{' '}
                            {item.storagePath}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {item.dataUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                loadGlbBufferIntoScene(
                                  item.dataUrl,
                                  item.fileName
                                )
                              }
                              className="px-2.5 py-1 font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded hover:bg-teal-100"
                            >
                              Load in 3D Viewer
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmMedia(item)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded"
                            title="Delete 3D asset record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Panel 2: Optional AI Multi-Angle Inspection & Parametric 3D Calibration */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-teal-600" />
                    Optional AI Multi-Angle 3D Calibration
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    When server-side Gemini AI is configured, inspects uploaded multi-angle vehicle photographs to calibrate 3D body proportions, ride height, and paint finish.
                  </p>
                </div>
                <span
                  className={`text-[11px] font-mono px-2.5 py-0.5 rounded border shrink-0 ${
                    aiServerStatus?.aiCalibrationAvailable
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {aiServerStatus?.aiCalibrationAvailable
                    ? 'Service Configured'
                    : 'Service Optional / Offline'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 space-y-1">
                <p className="font-semibold text-slate-900">
                  Service Mode:{' '}
                  <span className="font-normal text-slate-600">
                    {aiServerStatus?.modeDescription ||
                      'Checking server configuration...'}
                  </span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Transparency Note: This service calibrates our multi-part Three.js parametric 3D vehicle mesh from your uploaded angle photos; it never misrepresents a 2D image sequence as an external photogrammetry mesh.
                </p>
              </div>

              {activeAiCalibration && (
                <div className="p-3.5 bg-teal-50/70 border border-teal-200 rounded-lg text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-teal-900 flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-teal-600" />
                      Active 3D Calibration Profile ({activeAiCalibration.detectedBodyStyle})
                    </span>
                    <span className="font-mono text-[11px] text-teal-700">
                      L:{activeAiCalibration.lengthScale}x · W:
                      {activeAiCalibration.widthScale}x · H:
                      {activeAiCalibration.heightScale}x
                    </span>
                  </div>
                  <p className="text-slate-700">
                    {activeAiCalibration.inspectionSummary}
                  </p>
                </div>
              )}

              {aiStatusMessage && (
                <div className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono">
                  {aiStatusMessage}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <span className="text-xs text-slate-500">
                  Uploaded angle photos available for analysis:{' '}
                  <strong className="text-slate-800">
                    {uploadedAngleCount} / 8
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={handleRunAiCalibration}
                  disabled={
                    runningAiCalibration ||
                    !aiServerStatus?.aiCalibrationAvailable
                  }
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      runningAiCalibration ? 'animate-spin' : ''
                    }`}
                  />
                  {runningAiCalibration
                    ? 'Calibrating 3D Mesh...'
                    : 'Run AI 3D Calibration'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Media Confirmation Modal */}
      {deleteConfirmMedia && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <h4 className="text-base font-bold text-slate-900">
              Remove Vehicle Media Asset?
            </h4>
            <p className="text-sm text-slate-600">
              Are you sure you want to delete{' '}
              <span className="font-mono font-semibold text-slate-900">
                {deleteConfirmMedia.fileName}
              </span>{' '}
              ({deleteConfirmMedia.angleLabel}) from {vehicle.registrationNumber}?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmMedia(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = deleteConfirmMedia;
                  setDeleteConfirmMedia(null);
                  await deleteVehicleMedia(target);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
