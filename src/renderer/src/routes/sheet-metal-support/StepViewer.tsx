import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import occtimportjs from "occt-import-js";
import occtWasmUrl from "occt-import-js/dist/occt-import-js.wasm?url";

import type { OcctModule } from "occt-import-js";

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

interface BuiltModel {
  group: THREE.Group;
  edges: THREE.LineSegments[];
}

function buildGroupFromStep(occt: OcctModule, bytes: Uint8Array): BuiltModel {
  const result = occt.ReadStepFile(bytes, null);
  if (!result.success || result.meshes.length === 0) {
    throw new Error("STEP ファイルを解析できませんでした。");
  }
  const group = new THREE.Group();
  const edges: THREE.LineSegments[] = [];
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
      : new THREE.Color(0x9aa4b2);
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
    group.add(new THREE.Mesh(geometry, material));

    const edgeGeometry = new THREE.EdgesGeometry(geometry, EDGE_THRESHOLD_DEG);
    const lines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    group.add(lines);
    edges.push(lines);
  }
  return { group, edges };
}

export function StepViewer({
  bytes,
  showEdges = true,
}: {
  bytes: Uint8Array | null;
  showEdges?: boolean;
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const edgesRef = useRef<THREE.LineSegments[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !bytes) return;

    let disposed = false;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;

    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const occt = await getOcct();
        if (disposed) return;
        const { group, edges } = buildGroupFromStep(occt, bytes);
        edgesRef.current = edges;
        for (const line of edges) line.visible = showEdges;

        const width = container.clientWidth || 640;
        const height = container.clientHeight || 420;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1b1f27);

        // モデルを原点中心へ移動し、カメラ距離を形状サイズに合わせる
        const box = new THREE.Box3().setFromObject(group);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        group.position.sub(center);
        scene.add(group);

        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const camera = new THREE.PerspectiveCamera(45, width / height, maxDim / 1000, maxDim * 100);
        camera.position.set(maxDim * 1.2, maxDim * 1.0, maxDim * 1.6);

        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
        dir1.position.set(1, 1, 1);
        scene.add(dir1);
        const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
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
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
      }
      edgesRef.current = [];
    };
    // showEdges は再構築せず下の effect で可視状態のみ切り替える
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bytes]);

  useEffect(() => {
    for (const line of edgesRef.current) line.visible = showEdges;
  }, [showEdges]);

  return (
    <div className="relative h-[52vh] min-h-[320px] w-full overflow-hidden rounded-xl border border-border-subtle bg-[#1b1f27]">
      <div ref={containerRef} className="h-full w-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-fg-muted">
          3Dモデルを読み込み中...
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-state-danger">
          {error}
        </div>
      )}
    </div>
  );
}
