import * as THREE from "three";
import type { Point3, WineSnapshot } from "./types";

export class WineGlassView {
  public group = new THREE.Group();

  // Glass meshes
  private glassBodyOutline!: THREE.Mesh;
  private glassBody!: THREE.Mesh;
  private glassThickBase!: THREE.Mesh;
  private glassBaseReflection!: THREE.Mesh;
  private rimHighlight!: THREE.Mesh;
  private leftHighlight!: THREE.Mesh;
  private rightHighlight!: THREE.Mesh;

  // Wine liquid meshes
  private wineGroup = new THREE.Group();
  private wineBody!: THREE.Mesh;
  private wineDepth!: THREE.Mesh;
  private wineMeniscus!: THREE.Mesh;

  constructor() {
    this.createSimpleGlass();
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => {
            m.side = THREE.DoubleSide;
            m.needsUpdate = true;
          });
        } else {
          obj.material.side = THREE.DoubleSide;
          obj.material.needsUpdate = true;
        }
      }
    });
    this.group.frustumCulled = false;
    this.group.position.z = 0.15;
  }

  private createSimpleGlass() {
    // Simple, clean, compact glass (like a tequila / small tumbler / tasting glass).
    // Coordinate convention (Y-down):
    // Center (0, 0) is the grip center of the glass.
    // Glass height: from top rim (Y = -0.32) to bottom base (Y = +0.32).
    // Glass width: top rim = 0.36, bottom base = 0.28 (slight elegant taper).

    // 1. Outer Glass Silhouette & Body
    const outerShape = new THREE.Shape();
    // Bottom base (slight rounded corners)
    outerShape.moveTo(-0.14, 0.32);
    outerShape.lineTo(0.14, 0.32);
    // Right wall up to rim
    outerShape.lineTo(0.18, -0.32);
    // Rim across
    outerShape.lineTo(-0.18, -0.32);
    // Left wall down to base
    outerShape.lineTo(-0.14, 0.32);

    const glassGeom = new THREE.ShapeGeometry(outerShape, 16);

    // Subtle dark outer border for crisp definition against light backgrounds
    this.glassBodyOutline = new THREE.Mesh(
      glassGeom,
      new THREE.MeshBasicMaterial({
        color: 0x05080c,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      }),
    );
    this.glassBodyOutline.scale.set(1.03, 1.03, 1);
    this.glassBodyOutline.position.z = -0.01;
    this.group.add(this.glassBodyOutline);

    // Translucent crystal glass body
    this.glassBody = new THREE.Mesh(
      glassGeom,
      new THREE.MeshBasicMaterial({
        color: 0xdff0ff,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    this.group.add(this.glassBody);

    // 2. Thick solid glass base (classic heavy bottom of a tequila / shot / rocks glass)
    const baseShape = new THREE.Shape();
    baseShape.moveTo(-0.14, 0.32);
    baseShape.lineTo(0.14, 0.32);
    baseShape.lineTo(0.148, 0.18);
    baseShape.lineTo(-0.148, 0.18);
    baseShape.lineTo(-0.14, 0.32);

    this.glassThickBase = new THREE.Mesh(
      new THREE.ShapeGeometry(baseShape, 12),
      new THREE.MeshBasicMaterial({
        color: 0xe8f4ff,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    this.glassThickBase.position.z = 0.01;
    this.group.add(this.glassThickBase);

    // Bottom crystal reflection facet
    this.glassBaseReflection = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.016),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.glassBaseReflection.position.set(0, 0.305, 0.02);
    this.group.add(this.glassBaseReflection);

    // 3. Red Wine Inside Glass
    // Sits above the thick solid glass bottom (from Y = 0.18 up to top Y = -0.28)
    const wineShape = new THREE.Shape();
    wineShape.moveTo(-0.132, 0.18);
    wineShape.lineTo(0.132, 0.18);
    wineShape.lineTo(0.168, -0.28);
    wineShape.lineTo(-0.168, -0.28);
    wineShape.lineTo(-0.132, 0.18);

    const wineGeom = new THREE.ShapeGeometry(wineShape, 16);

    // Deep bottom layer (dark velvet crimson)
    this.wineDepth = new THREE.Mesh(
      wineGeom,
      new THREE.MeshBasicMaterial({
        color: 0x380008,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      }),
    );
    this.wineDepth.position.z = 0.02;
    this.wineGroup.add(this.wineDepth);

    // Rich vibrant ruby red wine body
    this.wineBody = new THREE.Mesh(
      wineGeom,
      new THREE.MeshBasicMaterial({
        color: 0x880a22,
        transparent: true,
        opacity: 0.86,
        depthWrite: false,
      }),
    );
    this.wineBody.position.z = 0.03;
    this.wineGroup.add(this.wineBody);

    // Liquid surface meniscus (bright red horizontal line/disc)
    this.wineMeniscus = new THREE.Mesh(
      new THREE.PlaneGeometry(0.33, 0.028),
      new THREE.MeshBasicMaterial({
        color: 0xc4143a,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.wineMeniscus.position.set(0, -0.24, 0.04);
    this.wineGroup.add(this.wineMeniscus);

    this.group.add(this.wineGroup);

    // 4. Specular Highlights (Rim & Vertical Edge Gleams)
    // Top rim highlight
    this.rimHighlight = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.016),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.rimHighlight.position.set(0, -0.32, 0.05);
    this.group.add(this.rimHighlight);

    // Left vertical crystal reflection streak
    this.leftHighlight = new THREE.Mesh(
      new THREE.PlaneGeometry(0.012, 0.58),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.leftHighlight.position.set(-0.14, 0, 0.05);
    this.leftHighlight.rotation.z = 0.06;
    this.group.add(this.leftHighlight);

    // Right vertical crystal reflection streak
    this.rightHighlight = new THREE.Mesh(
      new THREE.PlaneGeometry(0.008, 0.54),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.rightHighlight.position.set(0.14, 0, 0.05);
    this.rightHighlight.rotation.z = -0.06;
    this.group.add(this.rightHighlight);
  }

  update(
    snapshot: WineSnapshot,
    mappedPos: Point3,
    mappedScale: number,
    aspectRatio: number,
    now: number,
  ) {
    this.group.visible = snapshot.glassVisible;
    if (!snapshot.glassVisible) return;

    this.group.position.x = mappedPos.x;
    this.group.position.y = mappedPos.y;
    this.group.rotation.z = snapshot.glassRotation;

    // Scale to compact, accurate small glass proportions (like a tequila / neat glass)
    // baseW is compact so it sits naturally in the fingers/palm
    const baseW = mappedScale * 0.13;
    const baseH = baseW * aspectRatio * 1.35;
    this.group.scale.set(baseW, baseH, 1);

    // Dynamic wine liquid height and sloshing
    const level = Math.max(0, Math.min(1, snapshot.wineLevel));
    this.wineGroup.visible = level > 0.01;

    if (this.wineGroup.visible) {
      // Liquid scales vertically up from above thick base (0.18) to top (-0.28)
      const baseBottom = 0.18;
      const fullHeight = 0.44; // 0.18 - (-0.26)
      this.wineBody.scale.set(1, level, 1);
      this.wineBody.position.y = baseBottom * (1 - level);

      this.wineDepth.scale.set(1, level * 0.5, 1);
      this.wineDepth.position.y = baseBottom * (1 - level * 0.5);

      // Meniscus line sits exactly at the surface
      const surfaceY = baseBottom - level * fullHeight;
      this.wineMeniscus.position.y = surfaceY;

      // Surface width matches the glass taper at this height
      const t = 1 - level;
      const surfaceWidth = 0.33 * (1 - t * 0.15);
      this.wineMeniscus.scale.x = surfaceWidth;

      // Slosh angle maintains gravity balance with fluid damping
      this.wineMeniscus.rotation.z = snapshot.sloshOffset;

      // Subtle rich liquid luminescence
      const pulse = Math.sin(now * 0.005) * 0.03;
      (this.wineBody.material as THREE.MeshBasicMaterial).opacity = 0.85 + pulse;
    }

    // Specular light sheen reacts to movement and tilt
    const shimmer = 0.4 + Math.abs(Math.sin(snapshot.glassRotation * 2.2)) * 0.25;
    (this.leftHighlight.material as THREE.MeshBasicMaterial).opacity = shimmer;
    (this.rimHighlight.material as THREE.MeshBasicMaterial).opacity = 0.6 + shimmer * 0.3;
  }
}
