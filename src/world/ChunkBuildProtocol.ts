import type { BlockType } from './BlockType';
import type { ChunkMeshData } from './ChunkMeshBuilder';

export type SerializedBlockModification = readonly [
  worldX: number,
  worldY: number,
  worldZ: number,
  block: BlockType,
];

export interface ChunkBuildRequest {
  readonly type: 'build-chunk';
  readonly requestId: number;
  readonly worldSeed: string;
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly modifications: readonly SerializedBlockModification[];
}

export interface ChunkBuildSuccess {
  readonly type: 'chunk-built';
  readonly requestId: number;
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly meshData: ChunkMeshData;
  readonly buildMilliseconds: number;
}

export interface ChunkBuildFailure {
  readonly type: 'chunk-failed';
  readonly requestId: number;
  readonly message: string;
}

export type ChunkBuildResponse = ChunkBuildSuccess | ChunkBuildFailure;
