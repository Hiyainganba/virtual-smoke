"use client";

import { useEffect, useRef, useState } from "react";
import { DebugOverlay, drawTrackingDebug } from "./debug-overlay";
import { FaceAnalyzer, HandAnalyzer } from "./lib/analyzers";
import { InteractionEngine } from "./lib/interaction-engine";
import { SmokeRenderer } from "./lib/smoke-renderer";
import { useInteractionStore } from "./lib/store";
import type { FaceAnalysis, HandAnalysis, TrackingFrame } from "./lib/types";
import { VisionTracker } from "./lib/vision-tracker";
import { WineEngine } from "./lib/wine-engine";

export function SmokingExperience() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const debugCanvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraState, setCameraState] = useState<"loading" | "ready" | "denied">("loading");

  const experienceMode = useInteractionStore((s) => s.experienceMode);
  const setExperienceMode = useInteractionStore((s) => s.setExperienceMode);
  const wineLevel = useInteractionStore((s) => s.wineLevel);
  const isSippingWine = useInteractionStore((s) => s.isSippingWine);
  const wineGlassHeld = useInteractionStore((s) => s.wineGlassHeld);
  const cigaretteState = useInteractionStore((s) => s.cigaretteState);
  const refillWine = useInteractionStore((s) => s.refillWine);

  useEffect(() => {
    const video = videoRef.current;
    const renderCanvas = renderCanvasRef.current;
    const debugCanvas = debugCanvasRef.current;
    if (!video || !renderCanvas || !debugCanvas) return;

    let stream: MediaStream | undefined;
    let tracker: VisionTracker | undefined;
    let visual: SmokeRenderer | undefined;
    let engine: InteractionEngine | undefined;
    const wineEngine = new WineEngine();
    let animationFrame = 0;
    let videoFrameCallback = 0;
    let trackingFallbackFrame = 0;
    let running = true;
    let delegate: "GPU" | "CPU" = "GPU";
    const faceAnalyzer = new FaceAnalyzer();
    const handAnalyzer = new HandAnalyzer();
    let face: FaceAnalysis = faceAnalyzer.analyze(undefined, performance.now(), 0);
    let hands: HandAnalysis[] = [];
    let latestTracking: TrackingFrame | null = null;
    let appliedTracking: TrackingFrame | null = null;
    let appliedHandRevision = 0;
    let appliedFaceRevision = 0;
    let lastFaceTrackingAt = performance.now();
    let lastFrameAt = performance.now();
    let fpsWindowAt = lastFrameAt;
    let renderedFrames = 0;
    let fps = 60;
    let inputLatencyMs = 0;
    let handInferenceMs = 0;
    let faceInferenceMs = 0;
    const frameTimes: number[] = [];
    const handleKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      const store = useInteractionStore.getState();
      if (key === "d") {
        const wasEnabled = store.debugMode;
        store.toggleDebug();
        if (wasEnabled) debugCanvas.getContext("2d")?.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
      } else if (key === "c") {
        store.setExperienceMode("CIGARETTE");
      } else if (key === "w") {
        store.setExperienceMode("WINE");
      } else if (key === "r") {
        wineEngine.refill();
        store.refillWine();
      }
    };


    const resize = () => visual?.resize(
      window.innerWidth,
      window.innerHeight,
      video.videoWidth || 1920,
      video.videoHeight || 1080,
    );

    const processLatestCameraFrame = (sourceTimestamp: number) => {
      if (!running || !tracker) return;
      const tracking = tracker.processLatest(video, sourceTimestamp);
      if (tracking) latestTracking = tracking;
    };

    const scheduleTracking = () => {
      if (!running || !tracker) return;
      if (typeof video.requestVideoFrameCallback === "function") {
        videoFrameCallback = video.requestVideoFrameCallback((now, metadata) => {
          const timedMetadata = metadata as VideoFrameCallbackMetadata & { captureTime?: number };
          processLatestCameraFrame(timedMetadata.captureTime ?? metadata.presentationTime ?? now);
          scheduleTracking();
        });
      } else {
        trackingFallbackFrame = requestAnimationFrame((now) => {
          processLatestCameraFrame(now);
          scheduleTracking();
        });
      }
    };

    window.addEventListener("keydown", handleKey);
    window.addEventListener("resize", resize);

    try {
      // Start WebGL immediately. The cigarette remains visible while camera
      // permission and MediaPipe models initialize, or even if tracking fails.
      visual = new SmokeRenderer(renderCanvas);
      const rendererInfo = visual.getDiagnostics();
      renderCanvas.dataset.webglVersion = rendererInfo.webglVersion;
      renderCanvas.dataset.gpuRenderer = rendererInfo.renderer;
      renderCanvas.dataset.gpuVendor = rendererInfo.vendor;
      renderCanvas.dataset.gpuAccelerated = String(rendererInfo.hardwareAccelerated);
      renderCanvas.dataset.trackingSchedule = "LATEST_FRAME";
      delete renderCanvas.dataset.frameAlphaBounds;
      useInteractionStore.getState().updateRuntime({
        webglVersion: rendererInfo.webglVersion,
        gpuRenderer: rendererInfo.renderer,
        gpuVendor: rendererInfo.vendor,
        gpuAccelerated: rendererInfo.hardwareAccelerated,
      });
      engine = new InteractionEngine((emission) => visual?.emit(emission));
      resize();
    } catch (error) {
      useInteractionStore.getState().updateRuntime({
        webglVersion: "UNAVAILABLE",
        gpuRenderer: "WEBGL INITIALIZATION FAILED",
        gpuAccelerated: false,
        trackingStatus: "ERROR",
      });
      console.error("WebGL renderer initialization failed", error);
    }

    const loop = (now: number) => {
      if (!running || !visual || !engine) return;
      const frameTimeMs = Math.max(0.1, now - lastFrameAt);
      const dt = Math.min(0.05, Math.max(0.001, frameTimeMs / 1000));
      lastFrameAt = now;
      frameTimes.push(frameTimeMs);
      if (frameTimes.length > 240) frameTimes.shift();
      renderedFrames += 1;

      let appliedThisFrame: TrackingFrame | null = null;
      if (latestTracking && latestTracking !== appliedTracking) {
        const debugMode = useInteractionStore.getState().debugMode;
        if (latestTracking.handRevision !== appliedHandRevision) {
          hands = handAnalyzer.analyze(latestTracking.handLandmarks, latestTracking.handedness, debugMode);
          appliedHandRevision = latestTracking.handRevision;
          if (latestTracking.handInferenceMs > 0) handInferenceMs = latestTracking.handInferenceMs;
        }
        if (latestTracking.faceRevision !== appliedFaceRevision) {
          const trackingDt = Math.min(0.08, Math.max(0.001, (latestTracking.completedAt - lastFaceTrackingAt) / 1000));
          face = faceAnalyzer.analyze(latestTracking.faceLandmarks[0], latestTracking.completedAt, trackingDt, debugMode);
          lastFaceTrackingAt = latestTracking.completedAt;
          appliedFaceRevision = latestTracking.faceRevision;
          if (latestTracking.faceInferenceMs > 0) faceInferenceMs = latestTracking.faceInferenceMs;
        }
        appliedTracking = latestTracking;
        if (latestTracking.updatedTask === "HAND") appliedThisFrame = latestTracking;
      }

      const snapshot = engine.update(face, hands, now, dt, delegate);
      const wineSnapshot = wineEngine.update(face, hands, now, dt);
      visual.update(snapshot, face, now, dt, fps, wineSnapshot);
      if (appliedThisFrame) inputLatencyMs = Math.max(0, performance.now() - appliedThisFrame.sourceTimestamp);

      const debugMode = useInteractionStore.getState().debugMode;
      if (debugMode) {
        drawTrackingDebug(
          debugCanvas,
          face,
          hands,
          video.videoWidth || 1920,
          video.videoHeight || 1080,
          true,
        );
      }

      if (now - fpsWindowAt >= 500) {
        fps = renderedFrames * 1000 / (now - fpsWindowAt);
        const sortedFrameTimes = [...frameTimes].sort((a, b) => a - b);
        const worstFrameMs = sortedFrameTimes.at(-1) ?? 0;
        const p95FrameMs = sortedFrameTimes[Math.min(sortedFrameTimes.length - 1, Math.floor(sortedFrameTimes.length * 0.95))] ?? 0;
        renderedFrames = 0;
        fpsWindowAt = now;
        renderCanvas.dataset.fps = fps.toFixed(1);
        renderCanvas.dataset.worstFrameMs = worstFrameMs.toFixed(1);
        renderCanvas.dataset.p95FrameMs = p95FrameMs.toFixed(1);
        renderCanvas.dataset.inputLatencyMs = inputLatencyMs.toFixed(1);
        renderCanvas.dataset.handInferenceMs = handInferenceMs.toFixed(1);
        renderCanvas.dataset.faceInferenceMs = faceInferenceMs.toFixed(1);
        if (debugMode) {
          useInteractionStore.getState().updateRuntime({
            fps,
            worstFrameMs,
            p95FrameMs,
            inputLatencyMs,
            handInferenceMs,
            faceInferenceMs,
          });
        }
      }
      animationFrame = requestAnimationFrame(loop);
    };
    animationFrame = requestAnimationFrame(loop);

    const startCameraAndTracking = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 60, min: 30 },
            facingMode: "user",
          },
        });
        if (!running) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        setCameraState("ready");
        resize();
      } catch {
        if (running) setCameraState("denied");
        return;
      }

      tracker = new VisionTracker();
      try {
        delegate = await tracker.initialize();
        if (!running) {
          tracker.close();
          return;
        }
        const trackerInfo = tracker.getDiagnostics();
        renderCanvas.dataset.trackingDelegate = trackerInfo.delegate;
        renderCanvas.dataset.faceGpuContext = trackerInfo.faceContext;
        renderCanvas.dataset.handGpuContext = trackerInfo.handContext;
        renderCanvas.dataset.trackingSchedule = "LATEST_FRAME";
        useInteractionStore.getState().updateRuntime({
          delegate: trackerInfo.delegate,
          trackingStatus: "READY",
          faceGpuContext: trackerInfo.faceContext,
          handGpuContext: trackerInfo.handContext,
        });
        scheduleTracking();
      } catch (error) {
        useInteractionStore.getState().updateRuntime({ trackingStatus: "ERROR" });
        console.error("MediaPipe tracking initialization failed", error);
      }
    };
    void startCameraAndTracking();

    return () => {
      running = false;
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrame);
      if (videoFrameCallback) video.cancelVideoFrameCallback(videoFrameCallback);
      if (trackingFallbackFrame) cancelAnimationFrame(trackingFallbackFrame);
      tracker?.close();
      visual?.dispose();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <main className="experience" data-camera={cameraState}>
      <video ref={videoRef} className="camera" aria-label="Mirrored webcam view" autoPlay muted playsInline />
      <canvas ref={renderCanvasRef} className="render-canvas" aria-hidden="true" />
      <canvas ref={debugCanvasRef} className="debug-canvas" aria-hidden="true" />

      <nav className="ar-control-bar" role="toolbar" aria-label="AR Experience Controls">
        <div className="ar-mode-tabs">
          <button
            type="button"
            className={`ar-mode-btn mode-cigarette ${experienceMode === "CIGARETTE" ? "active" : ""}`}
            onClick={() => setExperienceMode("CIGARETTE")}
            title="Switch to Cigarette (Press C)"
          >
            <span className="ar-icon">🚬</span>
            <span>Cigarette</span>
          </button>
          <button
            type="button"
            className={`ar-mode-btn mode-wine ${experienceMode === "WINE" ? "active" : ""}`}
            onClick={() => setExperienceMode("WINE")}
            title="Switch to Red Wine (Press W)"
          >
            <span className="ar-icon">🍷</span>
            <span>Red Wine</span>
          </button>
        </div>

        {experienceMode === "WINE" && (
          <div className="ar-wine-actions">
            <button
              type="button"
              className="ar-refill-btn"
              onClick={refillWine}
              title="Refill Glass (Press R)"
            >
              🍾 Refill ({Math.round(wineLevel * 100)}%)
            </button>
          </div>
        )}

        <div className={`ar-hint-badge ${isSippingWine ? "sipping" : ""}`} aria-live="polite">
          {experienceMode === "CIGARETTE" ? (
            cigaretteState === "HAND_HELD" || cigaretteState === "FINGER_HELD"
              ? "✨ Holding cigarette • Moving hand leaves rising smoke trail"
              : "✋ Bring hand near cigarette to hold between fingers"
          ) : isSippingWine ? (
            "🍷 Sipping fine red wine..."
          ) : wineGlassHeld ? (
            "🍷 Holding wine glass • Tilt near mouth to sip"
          ) : (
            "✋ Show hand to hold wine glass by stem or bowl"
          )}
        </div>
      </nav>

      <p className="sr-only" aria-live="polite">
        {cameraState === "ready" ? "Virtual cigarette interaction is active." : cameraState === "denied" ? "Camera access is required." : "Preparing camera."}
      </p>
      <DebugOverlay />
    </main>
  );
}
