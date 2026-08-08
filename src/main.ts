import './style.css';
import './inventory.css';
import './item-icons.css';
import './inventory-presentation.css';
import './bow-charge.css';
import './pause-menu.css';
import './progression.css';
import './batch3-items.css';
import './survival.css';
import './environment.css';
import './minecraft-ui.css';
import './tutorial-book.css';
import './build-version.css';
import './world-selection.css';
import { installPauseMenuRuntime } from './app/PauseMenuRuntime';
import { bootstrap } from './app/bootstrap';
import { initializeBuildBadge } from './buildInfo';
import { installBowBallisticsRuntime } from './entities/BowBallisticsRuntime';
import { installBowChargeInputRuntime } from './input/BowChargeInputRuntime';
import { installInventoryPresentationRuntime } from './ui/InventoryPresentationRuntime';
import { installSmoothBlockEditRuntime } from './world/SmoothBlockEditRuntime';

// v0.4.4 hotfix: do not install the v0.4.3 terrain/prefetch prototype wrappers.
// TerrainGenerator already contains the continuous biome/height implementation,
// and VoxelWorldRenderer already performs direction-biased forward streaming.
// The extra wrappers duplicated those jobs on extremely hot paths, multiplying
// worker CPU load and keeping substantially more chunk work resident at once.
installSmoothBlockEditRuntime();
installBowBallisticsRuntime();
installBowChargeInputRuntime();
installPauseMenuRuntime();
installInventoryPresentationRuntime();
initializeBuildBadge();
void bootstrap();
