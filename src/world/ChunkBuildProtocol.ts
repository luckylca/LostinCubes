import type { BlockType } from './BlockType';
import type { ChunkMeshData } from './ChunkMeshBuilder';

export type SerializedBlockModification = readonly [
  worldX: number,
  worldY: number,
  worldZ: number,
  block: BlockType,
];

export type SerializedLightEmitter = readonly [
  worldX: number,
  worldY: number,
  worldZ: number,
  level: number,
];

export type ChunkBuildMode = 'full' | 'geometry-only';

export interface ChunkSectionMeshPayload {
  readonly sectionIndex: number;
  readonly meshData: ChunkMeshData;
}

export interface ChunkBuildRequest {
  readonly type: 'build-chunk';
  readonly requestId: number;
  readonly worldSeed: string;
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly modifications: readonly SerializedBlockModification[];
  readonly lightEmitters?: readonly SerializedLightEmitter[];
  readonly mode?: ChunkBuildMode;
  /** Full builds omit this; edit builds can request only affected vertical sections. */
  readonly sectionIndices?: readonly number[];
}

export interface ChunkBuildSuccess {
  readonly type: 'chunk-built';
  readonly requestId: number;
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly sections: readonly ChunkSectionMeshPayload[];
  readonly buildMilliseconds: number;
  /** Present for geometry-only builds so repeated-edit caching is testable. */
  readonly geometryBaseCacheHit?: boolean;
  /** Number of procedural terrain cells sampled while preparing edit geometry. */
  readonly proceduralTerrainSamples?: number;
}

export interface ChunkBuildFailure {
  readonly type: 'chunk-failed';
  readonly requestId: number;
  readonly message: string;
}

export type ChunkBuildResponse = ChunkBuildSuccess | ChunkBuildFailure;
