import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import occtimportjs from "occt-import-js";
import occtWasmUrl from "occt-import-js/dist/occt-import-js.wasm?url";

import type { OcctModule } from "occt-import-js";

import type { ModelAnalysis } from "@renderer/routes/sheet-metal-support/bendDetection.js";
import { analyzeMeshes } from "@renderer/routes/sheet-metal-support/bendDetection.js";

/** OpenCascade WASM は初回のみ初期化してキャッシュする。 */
let occtPromise: Promise<OcctModule> | null = null;
function getOcct(): Promise<OcctModule> {
  if (!occtPromise) {
    occtPromise = occtimportjs({ locateFile: () => occtWasmUrl });
  }
  return occtPromise;
}

/** 特徴エッジとして抽出する折れ角のしきい値（度）。板金の曲げ線・稜線が出る。 */
const EDGE_THRESHOLD_DEG = 25;

/** ビューアの背景色。アプリ背景に埋もれず、かつグレーのモデルが沈まない明度。 */
const VIEWER_BACKGROUND = 0xcdd0d7;
const FOV_DEG = 45;

export type DisplayMode = "shaded" | "wireframe" | "transparent";
export type ViewName = "iso" | "front" | "back" | "top" | "bottom" | "left" | "right";

/** 曲げ工程再生時の 3D 曲げ線ハイライト */
export interface BendPlaybackHighlight {
  completed: number[];
  active: number | null;
}

export interface StepViewerHandle {
  setView: (view: ViewName) => void;
  fit: () => void;
}

/**
 * STEP は CAD 慣例の Z-up として扱う（上面 = +Z 方向から見下ろす）。
 * 真上/真下からは up が視線と平行になるため Y-up に切り替える。
 */
const VIEW_DIRECTIONS: Record<ViewName, { dir: THREE.Vector3; up: THREE.Vector3 }> = {
  iso: { dir: new THREE.Vector3(1, -1, 0.8), up: new THREE.Vector3(0, 0, 1) },
  front: { dir: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
  back: { dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, 1) },
  right: { dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 0, 1) },
  left: { dir: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 0, 1) },
  top: { dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
  bottom: { dir: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
};

interface BuiltModel {
  group: THREE.Group;
  edges: THREE.LineSegments[];
  materials: THREE.MeshStandardMaterial[];
  bendLines: THREE.Line[];
  analysis: ModelAnalysis;
}

/** 検出した曲げ軸を描く。材料内部にあるため深度テストを外して透視表示する。 */
function buildBendLines(analysis: ModelAnalysis): THREE.Line[] {
  return analysis.bends.map((bend) => {
    const material = new THREE.LineBasicMaterial({
      color: 0xff7a1a,
      depthTest: false,
      transparent: true,
      opacity: 0.85,
      linewidth: 1,
    });
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...bend.axisStart),
      new THREE.Vector3(...bend.axisEnd),
    ]);
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 10;
    line.userData = { bendIndex: bend.index, material };
    return line;
  });
}

function buildGroupFromStep(
  occt: OcctModule,
  bytes: Uint8Array,
  thicknessHint: number | null
): BuiltModel {
  const result = occt.ReadStepFile(bytes, null);
  if (!result.success || result.meshes.length === 0) {
    throw new Error("STEP ファイルを解析できませんでした。");
  }
  const group = new THREE.Group();
  const edges: THREE.LineSegments[] = [];
  const materials: THREE.MeshStandardMaterial[] = [];
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x11161d });
  for (const mesh of result.meshes) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3)
    );
    if (mesh.attributes.normal) {
      geometry.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3)
      );
    }
    geometry.setIndex(mesh.index.array);
    if (!mesh.attributes.normal) {
      geometry.computeVertexNormals();
    }
    const color = mesh.color
      ? new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2])
      : new THREE.Color(0x8b95a5);
    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.25,
      roughness: 0.6,
      side: THREE.DoubleSide,
      // エッジ線と面が干渉（Zファイティング）しないよう面を僅かに奥へ
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    materials.push(material);
    group.add(new THREE.Mesh(geometry, material));

    const edgeGeometry = new THREE.EdgesGeometry(geometry, EDGE_THRESHOLD_DEG);
    const lines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    group.add(lines);
    edges.push(lines);
  }

  const analysis = analyzeMeshes(result.meshes, { thicknessHint });
  const bendLines = buildBendLines(analysis);
  for (const line of bendLines) group.add(line);

  return { group, edges, materials, bendLines, analysis };
}

function applyDisplayMode(materials: THREE.MeshStandardMaterial[], mode: DisplayMode): void {
  for (const material of materials) {
    material.wireframe = mode === "wireframe";
    material.transparent = mode === "transparent";
    material.opacity = mode === "transparent" ? 0.4 : 1;
    material.depthWrite = mode !== "transparent";
    material.needsUpdate = true;
  }
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    const withGeometry = obj as Partial<THREE.Mesh>;
    withGeometry.geometry?.dispose();
    const material = (obj as Partial<THREE.Mesh>).material;
    if (Array.isArray(material)) {
      for (const m of material) m.dispose();
    } else {
      material?.dispose();
    }
  });
}

export const StepViewer = forwardRef<
  StepViewerHandle,
  {
    bytes: Uint8Array | null;
    showEdges?: boolean;
    displayMode?: DisplayMode;
    showBendLines?: boolean;
    /** 加工条件に登録された板厚（mm）。円筒面の分類基準として解析に渡す。 */
    thicknessHint?: number | null;
    /** 曲げ工程再生と連動した曲げ線ハイライト */
    playbackHighlight?: BendPlaybackHighlight | null;
    onAnalyzed?: (analysis: ModelAnalysis) => void;
  }
>(function StepViewer(
  {
    bytes,
    showEdges = true,
    displayMode = "shaded",
    showBendLines = true,
    thicknessHint = null,
    playbackHighlight = null,
    onAnalyzed,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const edgesRef = useRef<THREE.LineSegments[]>([]);
  const bendLinesRef = useRef<THREE.Line[]>([]);
  // 解析完了コールバックは再描画のトリガにしない
  const onAnalyzedRef = useRef(onAnalyzed);
  onAnalyzedRef.current = onAnalyzed;
  const materialsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const distanceRef = useRef(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    setView(view: ViewName) {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      const { dir, up } = VIEW_DIRECTIONS[view];
      camera.up.copy(up);
      camera.position.copy(dir.clone().normalize().multiplyScalar(distanceRef.current));
      controls.target.set(0, 0, 0);
      controls.update();
    },
    fit() {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;
      const dir = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(dir.multiplyScalar(distanceRef.current));
      controls.target.set(0, 0, 0);
      controls.update();
    },
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !bytes) return;

    let disposed = false;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let group: THREE.Group | null = null;
    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;

    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const occt = await getOcct();
        if (disposed) return;
        const built = buildGroupFromStep(occt, bytes, thicknessHint);
        group = built.group;
        edgesRef.current = built.edges;
        materialsRef.current = built.materials;
        bendLinesRef.current = built.bendLines;
        for (const line of built.edges) line.visible = showEdges;
        for (const line of built.bendLines) line.visible = showBendLines;
        applyDisplayMode(built.materials, displayMode);
        onAnalyzedRef.current?.(built.analysis);

        const width = container.clientWidth || 640;
        const height = container.clientHeight || 420;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(VIEWER_BACKGROUND);

        // モデルを原点中心へ移動し、外接球からカメラ距離を決める
        const box = new THREE.Box3().setFromObject(group);
        const center = box.getCenter(new THREE.Vector3());
        group.position.sub(center);
        scene.add(group);

        const radius = box.getSize(new THREE.Vector3()).length() / 2 || 1;
        const distance = (radius / Math.sin((FOV_DEG / 2) * THREE.MathUtils.DEG2RAD)) * 1.1;
        distanceRef.current = distance;

        const camera = new THREE.PerspectiveCamera(
          FOV_DEG,
          width / height,
          distance / 1000,
          distance * 100
        );
        const iso = VIEW_DIRECTIONS.iso;
        camera.up.copy(iso.up);
        camera.position.copy(iso.dir.clone().normalize().multiplyScalar(distance));
        cameraRef.current = camera;

        // 背景が明るいぶん環境光を抑え、陰影でモデルの立体感を出す
        scene.add(new THREE.AmbientLight(0xffffff, 0.5));
        const dir1 = new THREE.DirectionalLight(0xffffff, 0.75);
        dir1.position.set(1, 1, 1);
        scene.add(dir1);
        const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
        dir2.position.set(-1, -0.5, -1);
        scene.add(dir2);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(width, height);
        container.appendChild(renderer.domElement);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.target.set(0, 0, 0);
        controls.update();
        controlsRef.current = controls;

        const renderLoop = (): void => {
          if (disposed || !renderer || !controls) return;
          controls.update();
          renderer.render(scene, camera);
          frameId = requestAnimationFrame(renderLoop);
        };
        renderLoop();

        resizeObserver = new ResizeObserver(() => {
          if (!renderer) return;
          const w = container.clientWidth || width;
          const h = container.clientHeight || height;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        });
        resizeObserver.observe(container);

        setLoading(false);
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    })();

    return () => {
      disposed = true;
      if (frameId) cancelAnimationFrame(frameId);
      if (resizeObserver) resizeObserver.disconnect();
      if (controls) controls.dispose();
      if (group) disposeGroup(group);
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
      }
      edgesRef.current = [];
      materialsRef.current = [];
      bendLinesRef.current = [];
      cameraRef.current = null;
      controlsRef.current = null;
    };
    // showEdges / displayMode は再構築せず下の effect で反映する。
    // 板厚は分類基準なので、後から届いた場合は解析をやり直す。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bytes, thicknessHint]);

  useEffect(() => {
    for (const line of edgesRef.current) line.visible = showEdges;
  }, [showEdges]);

  useEffect(() => {
    applyDisplayMode(materialsRef.current, displayMode);
  }, [displayMode]);

  useEffect(() => {
    for (const line of bendLinesRef.current) line.visible = showBendLines;
  }, [showBendLines]);

  useEffect(() => {
    for (const line of bendLinesRef.current) {
      const bendIndex = line.userData.bendIndex as number;
      const material = line.userData.material as THREE.LineBasicMaterial;
      if (!playbackHighlight) {
        material.color.setHex(0xff7a1a);
        material.opacity = 0.85;
        continue;
      }
      if (playbackHighlight.active === bendIndex) {
        material.color.setHex(0xff2222);
        material.opacity = 1;
      } else if (playbackHighlight.completed.includes(bendIndex)) {
        material.color.setHex(0x22c55e);
        material.opacity = 0.95;
      } else {
        material.color.setHex(0x94a3b8);
        material.opacity = 0.35;
      }
    }
  }, [playbackHighlight]);

  return (
    <div className="relative h-[52vh] min-h-[320px] w-full overflow-hidden rounded-xl border border-border-subtle bg-[#cdd0d7]">
      <div ref={containerRef} className="h-full w-full" />
      {/* 明るい固定色の上に重ねるため、テーマ非依存の暗い文字色を使う */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-700">
          3Dモデルを読み込み中...
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
});
