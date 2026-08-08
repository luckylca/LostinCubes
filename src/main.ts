import './style.css';
import './inventory.css';
import './item-icons.css';
import './progression.css';
import './batch3-items.css';
import './survival.css';
import './environment.css';
import './minecraft-ui.css';
import './tutorial-book.css';
import './build-version.css';
import './world-selection.css';
import { bootstrap } from './app/bootstrap';
import { initializeBuildBadge } from './buildInfo';
import { installSmoothBlockEditRuntime } from './world/SmoothBlockEditRuntime';

installSmoothBlockEditRuntime();
initializeBuildBadge();
void bootstrap();
