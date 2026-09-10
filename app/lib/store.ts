import { create } from "zustand";
import type { ActiveExperienceMode, CigaretteState, HandState, MouthState, SmokingState } from "./types";

export interface RuntimeDebugState {
  debugMode: boolean;
  experienceMode: ActiveExperienceMode;
  wineLevel: number;
  isSippingWine: boolean;
  wineGlassHeld: boolean;
  fps: number;
  faceVisible: boolean;
  handVisible: boolean;
  handState: HandState;
  mouthState: MouthState;
  cigaretteState: CigaretteState;
  smokingState: SmokingState;
  mouthOpenRatio: number;
  mouthWidthRatio: number;
  mouthPursed: boolean;
  cigaretteBurn: number;
  inhaleSeconds: number;
  smokeReady: boolean;
  smokeReadySeconds: number;
  mouthBurstCount: number;
  noseBurstCount: number;
  baseSmokeParticles: number;
  particleDrawCount: number;
  pinchDistance: number;
  worstFrameMs: number;
  p95FrameMs: number;
  inputLatencyMs: number;
  handInferenceMs: number;
  faceInferenceMs: number;
  delegate: "GPU" | "CPU";
  trackingStatus: "INITIALIZING" | "READY" | "ERROR";
  faceGpuContext: string;
  handGpuContext: string;
  webglVersion: "WEBGL2" | "WEBGL1" | "UNAVAILABLE";
  gpuRenderer: string;
  gpuVendor: string;
  gpuAccelerated: boolean;
  particleQuality: "HIGH" | "MEDIUM" | "LOW";
  toggleDebug: () => void;
  setExperienceMode: (mode: ActiveExperienceMode) => void;
  refillWine: () => void;
  updateRuntime: (patch: Partial<Omit<RuntimeDebugState, "toggleDebug" | "updateRuntime" | "setExperienceMode" | "refillWine">>) => void;
}

export const useInteractionStore = create<RuntimeDebugState>((set) => ({
  debugMode: false,
  experienceMode: "CIGARETTE",
  wineLevel: 1,
  isSippingWine: false,
  wineGlassHeld: false,
  fps: 0,
  faceVisible: false,
  handVisible: false,
  handState: "NONE",
  mouthState: "CLOSED",
  cigaretteState: "IDLE",
  smokingState: "IDLE",
  mouthOpenRatio: 0,
  mouthWidthRatio: 0,
  mouthPursed: false,
  cigaretteBurn: 0,
  inhaleSeconds: 0,
  smokeReady: false,
  smokeReadySeconds: 0,
  mouthBurstCount: 0,
  noseBurstCount: 0,
  baseSmokeParticles: 0,
  particleDrawCount: 0,
  pinchDistance: 0,
  worstFrameMs: 0,
  p95FrameMs: 0,
  inputLatencyMs: 0,
  handInferenceMs: 0,
  faceInferenceMs: 0,
  delegate: "GPU",
  trackingStatus: "INITIALIZING",
  faceGpuContext: "PENDING",
  handGpuContext: "PENDING",
  webglVersion: "UNAVAILABLE",
  gpuRenderer: "INITIALIZING",
  gpuVendor: "UNKNOWN",
  gpuAccelerated: false,
  particleQuality: "HIGH",
  toggleDebug: () => set((state) => ({ debugMode: !state.debugMode })),
  setExperienceMode: (mode) => set({ experienceMode: mode }),
  refillWine: () => set({ wineLevel: 1 }),
  updateRuntime: (patch) => set(patch),
}));

