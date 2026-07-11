import { build } from 'esbuild';

const radius = Number.parseInt(process.argv[2] ?? '6', 10);
if (!Number.isInteger(radius) || radius < 1 || radius > 12) {
  throw new RangeError('Pass one render radius from 1 through 12.');
}

const source = `
import * as THREE from 'three';
import { CHUNK_SIZE, VoxelWorld } from './src/game/world.ts';

function installDocumentStub() {
  const context = {
    imageSmoothingEnabled: false,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    clearRect() {},
    fillRect() {},
    strokeRect() {}
  };
  globalThis.document = {
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext() { return context; }
      };
    }
  };
}

function chunkMeshes(world) {
  return world.children.filter((child) => child.isMesh === true && / chunk -?\\d+,-?\\d+$/.test(child.name));
}

function meshChunkKeys(meshes) {
  return new Set(meshes.map((mesh) => mesh.name.replace(/^(Opaque|Transparent) chunk /, '')));
}

export default function benchmarkStreamingWorld(radius) {
  installDocumentStub();
  const initialFocus = new THREE.Vector3(0.5, 0, 0.5);
  const constructStarted = performance.now();
  const world = new VoxelWorld(0x51a7cafe, radius, initialFocus);
  const constructMs = performance.now() - constructStarted;
  const initialState = world.getStreamingState();
  const initialMeshes = chunkMeshes(world);
  const initialMeshIds = new Set(initialMeshes.map((mesh) => mesh.geometry.uuid));
  const disposedGeometryIds = new Set();
  for (const mesh of initialMeshes) {
    mesh.geometry.addEventListener('dispose', () => disposedGeometryIds.add(mesh.geometry.uuid));
  }

  let lightingResetMs = 0;
  let chunkLoadMs = 0;
  let chunkMeshBuildMs = 0;
  const originalLightingReset = world.lighting.reset.bind(world.lighting);
  world.lighting.reset = (...args) => {
    const started = performance.now();
    const update = originalLightingReset(...args);
    lightingResetMs += performance.now() - started;
    return update;
  };
  const originalLoadChunk = world.loadChunk.bind(world);
  world.loadChunk = (...args) => {
    const started = performance.now();
    const chunk = originalLoadChunk(...args);
    chunkLoadMs += performance.now() - started;
    return chunk;
  };
  const originalRebuildChunk = world.rebuildChunk.bind(world);
  world.rebuildChunk = (...args) => {
    const started = performance.now();
    const result = originalRebuildChunk(...args);
    chunkMeshBuildMs += performance.now() - started;
    return result;
  };

  const shiftStarted = performance.now();
  world.setRenderDistance(radius, new THREE.Vector3(CHUNK_SIZE + 0.5, 0, 0.5));
  const shiftMs = performance.now() - shiftStarted;
  const shiftedState = world.getStreamingState();
  const shiftedMeshes = chunkMeshes(world);
  const shiftedMeshIds = new Set(shiftedMeshes.map((mesh) => mesh.geometry.uuid));
  const retainedGeometryCount = [...initialMeshIds].filter((id) => shiftedMeshIds.has(id)).length;
  const createdGeometryCount = [...shiftedMeshIds].filter((id) => !initialMeshIds.has(id)).length;
  const initialMeshChunkKeys = meshChunkKeys(initialMeshes);
  const shiftedMeshChunkKeys = meshChunkKeys(shiftedMeshes);
  const expectedLoadedCount = (2 * (radius + 1) + 1) ** 2;
  const expectedVisibleCount = (2 * radius + 1) ** 2;

  const result = {
    radius,
    constructMs: Number(constructMs.toFixed(2)),
    shiftOneChunkMs: Number(shiftMs.toFixed(2)),
    lightingResetMs: Number(lightingResetMs.toFixed(2)),
    chunkLoadMs: Number(chunkLoadMs.toFixed(2)),
    chunkMeshBuildMs: Number(chunkMeshBuildMs.toFixed(2)),
    expectedLoadedCount,
    loadedCount: initialState.loadedCount,
    shiftedLoadedCount: shiftedState.loadedCount,
    expectedVisibleCount,
    visibleCount: initialState.visibleCount,
    shiftedVisibleCount: shiftedState.visibleCount,
    initialMeshCount: initialMeshes.length,
    shiftedMeshCount: shiftedMeshes.length,
    initialMeshedChunkCount: initialMeshChunkKeys.size,
    shiftedMeshedChunkCount: shiftedMeshChunkKeys.size,
    haloChunksHaveMeshes: [...initialMeshChunkKeys].some((key) => !initialState.visibleKeys.includes(key)),
    disposedGeometryCount: disposedGeometryIds.size,
    retainedGeometryCount,
    createdGeometryCount,
    overlapRebuildRatio: initialMeshes.length === 0
      ? 0
      : Number((disposedGeometryIds.size / initialMeshes.length).toFixed(4))
  };
  world.dispose();
  return result;
}
`;

const bundled = await build({
  stdin: {
    contents: source,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'streaming-world-benchmark.ts'
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent'
});

const code = bundled.outputFiles[0]?.text;
if (!code) throw new Error('esbuild returned no benchmark bundle.');
globalThis.gc?.();
const heapBefore = process.memoryUsage().heapUsed;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const benchmarkModule = await import(moduleUrl);
const result = benchmarkModule.default(radius);
const heapAfter = process.memoryUsage().heapUsed;

console.log(JSON.stringify({
  ...result,
  heapDeltaMiB: Number(((heapAfter - heapBefore) / 1024 / 1024).toFixed(2))
}, null, 2));
