import { clamp, distance, expSmoothing, lerp, lerpPoint } from "./math";
import { useInteractionStore } from "./store";
import type { FaceAnalysis, HandAnalysis, Point3, WineSnapshot } from "./types";

const INITIAL_GLASS_POS: Point3 = { x: 0.5, y: 0.68, z: 0 };
const GLASS_BASE_HEIGHT = 0.12;

export class WineEngine {
  private snapshot: WineSnapshot = {
    glassPosition: { ...INITIAL_GLASS_POS },
    glassRotation: 0,
    glassScale: 1,
    wineLevel: 1.0,
    isHeld: false,
    isSipping: false,
    sloshOffset: 0,
    handGripType: "NONE",
    glassVisible: true,
  };

  private lastGripPoint: Point3 = { ...INITIAL_GLASS_POS };
  private sloshAngle = 0;
  private sloshVelocity = 0;
  private handVelocity: Point3 = { x: 0, y: 0, z: 0 };

  update(face: FaceAnalysis, hands: HandAnalysis[], now: number, dt: number): WineSnapshot {
    const safeDt = Math.min(0.05, Math.max(0.001, dt));
    const hand = hands[0];

    // Read store refill if user clicked refill
    const storeLevel = useInteractionStore.getState().wineLevel;
    if (storeLevel > this.snapshot.wineLevel) {
      this.snapshot.wineLevel = storeLevel;
    }

    if (hand && hand.visible) {
      this.snapshot.isHeld = true;
      const gripType = hand.state === "PINCH" ? "STEM" : "BOWL";
      this.snapshot.handGripType = gripType;

      // Compute hand velocity for slosh inertia
      const grip = hand.gripPoint;
      this.handVelocity = {
        x: (grip.x - this.lastGripPoint.x) / safeDt,
        y: (grip.y - this.lastGripPoint.y) / safeDt,
        z: 0,
      };
      this.lastGripPoint = { ...grip };

      // Accurate grip: small glass rests directly between fingers/hand
      const targetPos: Point3 = {
        x: grip.x,
        y: grip.y - 0.012,
        z: grip.z,
      };

      const smoothFactor = expSmoothing(safeDt, 24);
      this.snapshot.glassPosition = lerpPoint(this.snapshot.glassPosition, targetPos, smoothFactor);


      // Glass tilt follows hand roll / wrist angle naturally, upright by default
      const wristToPalm = hand.wrist && hand.palmCenter
        ? Math.atan2(hand.palmCenter.y - hand.wrist.y, hand.palmCenter.x - hand.wrist.x) + Math.PI / 2
        : 0;
      const naturalTilt = clamp(wristToPalm, -0.9, 0.9);
      this.snapshot.glassRotation = lerp(this.snapshot.glassRotation, naturalTilt, expSmoothing(safeDt, 20));

      // Scale adapts slightly to face/hand size for realistic perspective
      if (face.visible) {
        const targetScale = clamp(face.faceHeight * 1.05, 0.8, 1.25);
        this.snapshot.glassScale = lerp(this.snapshot.glassScale, targetScale, expSmoothing(safeDt, 10));
      }
    } else {
      this.snapshot.isHeld = false;
      this.snapshot.handGripType = "NONE";
      // Idle resting position floating comfortably
      const idleTarget: Point3 = face.visible
        ? { x: clamp(face.center.x + 0.18, 0.6, 0.82), y: clamp(face.chin.y + 0.15, 0.6, 0.8), z: 0 }
        : { ...INITIAL_GLASS_POS };
      this.snapshot.glassPosition = lerpPoint(this.snapshot.glassPosition, idleTarget, expSmoothing(safeDt, 6));
      this.snapshot.glassRotation = lerp(this.snapshot.glassRotation, 0, expSmoothing(safeDt, 8));
      this.handVelocity = { x: 0, y: 0, z: 0 };
    }

    // Check Sipping / Drinking action
    // Glass rim is located near the top of the compact glass
    const rimOffset = GLASS_BASE_HEIGHT * this.snapshot.glassScale * 0.48;
    const rimPos: Point3 = {
      x: this.snapshot.glassPosition.x + Math.sin(this.snapshot.glassRotation) * rimOffset,
      y: this.snapshot.glassPosition.y - Math.cos(this.snapshot.glassRotation) * rimOffset,
      z: 0,
    };

    if (face.visible && this.snapshot.isHeld) {
      const distToMouth = distance(rimPos, face.mouthCenter);
      const isCloseToMouth = distToMouth < Math.max(0.09, face.mouthWidth * 1.15);
      const hasTilt = Math.abs(this.snapshot.glassRotation) > 0.15;

      if (isCloseToMouth && (hasTilt || face.mouthState === "OPEN")) {
        this.snapshot.isSipping = true;
        if (this.snapshot.wineLevel > 0) {
          this.snapshot.wineLevel = Math.max(0, this.snapshot.wineLevel - safeDt * 0.16);
          useInteractionStore.getState().updateRuntime({ wineLevel: this.snapshot.wineLevel, isSippingWine: true });
        }
      } else {
        this.snapshot.isSipping = false;
        useInteractionStore.getState().updateRuntime({ isSippingWine: false });
      }
    } else {
      this.snapshot.isSipping = false;
    }

    // Slosh physics: liquid meniscus maintains horizontal gravity balance
    // Inertial response to lateral hand acceleration
    const accelX = clamp(-this.handVelocity.x * 0.08, -0.4, 0.4);
    const targetSlosh = -this.snapshot.glassRotation + accelX;
    const spring = 45;
    const damping = 7.5;
    const force = (targetSlosh - this.sloshAngle) * spring;
    this.sloshVelocity += force * safeDt;
    this.sloshVelocity -= this.sloshVelocity * damping * safeDt;
    this.sloshAngle += this.sloshVelocity * safeDt;
    this.snapshot.sloshOffset = clamp(this.sloshAngle, -0.85, 0.85);

    useInteractionStore.getState().updateRuntime({
      wineGlassHeld: this.snapshot.isHeld,
      wineLevel: this.snapshot.wineLevel,
    });

    return this.snapshot;
  }

  refill() {
    this.snapshot.wineLevel = 1.0;
    useInteractionStore.getState().updateRuntime({ wineLevel: 1.0 });
  }

  getSnapshot(): WineSnapshot {
    return this.snapshot;
  }
}
