let installed = false;

/**
 * Block-edit scheduling now lives directly in VoxelWorldRenderer: the edited
 * chunk receives urgent worker priority while neighboring light refreshes stay
 * in the background. Keep this compatibility hook so existing bootstrap code
 * does not need another unrelated change.
 */
export function installSmoothBlockEditRuntime(): void {
  if (installed) return;
  installed = true;
}
