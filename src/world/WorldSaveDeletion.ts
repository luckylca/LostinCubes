import { deleteEntitySnapshots } from '../entities/EntityPersistence';
import { deleteSurvivalSnapshot } from '../game/session/SurvivalPersistence';
import { deleteVoxelWorldPersistence } from './VoxelWorldData';

const LOCAL_STORAGE_PREFIXES = [
  'lost-in-cubes:inventory:',
  'lost-in-cubes:drops:',
  'lost-in-cubes:furnaces:',
] as const;

export async function deleteWorldSaveData(
  worldId: string,
  storage: Storage | null,
): Promise<void> {
  for (const prefix of LOCAL_STORAGE_PREFIXES) {
    try {
      storage?.removeItem(`${prefix}${worldId}`);
    } catch (error: unknown) {
      console.warn(`Could not delete ${prefix} save data.`, error);
    }
  }
  deleteSurvivalSnapshot(worldId, storage);
  deleteEntitySnapshots(worldId, storage);
  try {
    await deleteVoxelWorldPersistence(worldId);
  } catch (error: unknown) {
    console.warn('Voxel edits could not be deleted.', error);
  }
}
