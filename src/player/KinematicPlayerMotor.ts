import {
  depenetrateVoxelBodyUpward,
  voxelBodyCollides,
  voxelBodyIsSupported,
} from './VoxelCollision';
import type {
  VoxelBodyShape,
  VoxelSolidProvider,
} from './VoxelCollision';

export interface PlayerVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PlayerEnvironmentState {
  readonly inWater: boolean;
  readonly inLava: boolean;
  readonly onLadder: boolean;
}

export interface PlayerMotorState {
  readonly position: PlayerVector;
  readonly verticalVelocity: number;
  readonly horizontalSpeed: number;
  readonly sprinting: boolean;
  readonly sneaking: boolean;
  readonly grounded: boolean;
  readonly inWater: boolean;
  readonly inLava: boolean;
  readonly onLadder: boolean;
}

export interface PlayerMotorInput {
  readonly moveX: number;
  readonly moveZ: number;
  readonly sprint: boolean;
  readonly sneak: boolean;
  readonly jump: boolean;
  readonly yaw: number;
}

export type GroundHeightProvider = (worldX: number, worldZ: number) => number;
export type PlayerEnvironmentProvider = (
  position: PlayerVector,
) => PlayerEnvironmentState;

export interface PlayerMotorConfig {
  readonly walkSpeed: number;
  readonly sprintSpeed: number;
  readonly sneakSpeed: number;
  readonly waterSpeed: number;
  readonly lavaSpeed: number;
  readonly jumpSpeed: number;
  readonly gravity: number;
  readonly radius: number;
  readonly halfHeight: number;
  readonly maximumStepHeight: number;
  readonly maximumAutoJumpHeight: number;
  readonly maximumMovementSubstep: number;
  readonly autoJump: boolean;
  readonly groundHeightAt: GroundHeightProvider;
  readonly environmentAt: PlayerEnvironmentProvider;
  readonly isSolidAt?: VoxelSolidProvider;
  readonly spawnPosition?: PlayerVector;
}

export const PLAYER_COLLISION_RADIUS = 0.34;
export const PLAYER_COLLISION_HALF_HEIGHT = 0.9;

const EMPTY_ENVIRONMENT: PlayerEnvironmentState = {
  inWater: false,
  inLava: false,
  onLadder: false,
};

const DEFAULT_CONFIG: PlayerMotorConfig = {
  walkSpeed: 3.8,
  sprintSpeed: 6.2,
  sneakSpeed: 1.35,
  waterSpeed: 3.2,
  lavaSpeed: 1.55,
  jumpSpeed: 6.4,
  gravity: -18,
  radius: PLAYER_COLLISION_RADIUS,
  halfHeight: PLAYER_COLLISION_HALF_HEIGHT,
  maximumStepHeight: 0.6,
  maximumAutoJumpHeight: 1.05,
  maximumMovementSubstep: 0.2,
  autoJump: true,
  groundHeightAt: () => 2.9,
  environmentAt: () => EMPTY_ENVIRONMENT,
};

interface MutablePosition {
  x: number;
  y: number;
  z: number;
}

type HorizontalAxis = 'x' | 'z';

const SUPPORT_PROBE_DISTANCE = 0.06;
const SNEAK_SUPPORT_PROBE_DISTANCE = 0.12;
const COLLISION_EPSILON = 1e-6;
const BINARY_SEARCH_ITERATIONS = 12;
const AUTO_JUMP_CLEARANCE_PROBE = 0.18;
const WATER_ASCEND_SPEED = 3.8;
const WATER_DESCEND_SPEED = -3.1;
const WATER_IDLE_SINK_SPEED = -0.18;
const WATER_VERTICAL_RESPONSE = 8.5;
const FLUID_EXIT_ASSIST_SECONDS = 0.32;
const LAVA_ASCEND_SPEED = 2.2;
const LAVA_DESCEND_SPEED = -1.8;
const LAVA_IDLE_SINK_SPEED = -0.32;
const LAVA_VERTICAL_RESPONSE = 6;
const LADDER_CLIMB_SPEED = 2.7;
const LADDER_DESCEND_SPEED = -2.2;
const LADDER_IDLE_FALL_SPEED = -0.45;

export class KinematicPlayerMotor {
  readonly #config: PlayerMotorConfig;
  readonly #bodyShape: VoxelBodyShape;
  #position: MutablePosition = { x: 0, y: 0, z: 3.5 };
  #verticalVelocity = 0;
  #horizontalSpeed = 0;
  #sprinting = false;
  #sneaking = false;
  #grounded = true;
  #environment = EMPTY_ENVIRONMENT;
  #fluidExitAssistSeconds = 0;

  public constructor(config: Partial<PlayerMotorConfig> = {}) {
    this.#config = { ...DEFAULT_CONFIG, ...config };
    this.#bodyShape = {
      radius: this.#config.radius,
      halfHeight: this.#config.halfHeight,
    };
    this.reset(this.#config.spawnPosition);
  }

  public update(input: PlayerMotorInput, stepSeconds: number): PlayerMotorState {
    if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) {
      return this.getState();
    }
    this.#sneaking = input.sneak;
    if (this.#config.isSolidAt === undefined) {
      return this.#updateHeightfield(input, stepSeconds);
    }
    return this.#updateVoxels(input, stepSeconds, this.#config.isSolidAt);
  }

  public getState(): PlayerMotorState {
    return {
      position: { ...this.#position },
      verticalVelocity: this.#verticalVelocity,
      horizontalSpeed: this.#horizontalSpeed,
      sprinting: this.#sprinting,
      sneaking: this.#sneaking,
      grounded: this.#grounded,
      inWater: this.#environment.inWater,
      inLava: this.#environment.inLava,
      onLadder: this.#environment.onLadder,
    };
  }

  public reset(position?: PlayerVector): void {
    const nextPosition = position ?? this.#config.spawnPosition ?? {
      x: 0,
      y: this.#getGroundHeight(0, 3.5),
      z: 3.5,
    };

    if (this.#config.isSolidAt === undefined) {
      const groundHeight = this.#getGroundHeight(nextPosition.x, nextPosition.z);
      this.#position = { ...nextPosition };
      this.#grounded = nextPosition.y <= groundHeight + 0.001;
      if (this.#grounded) this.#position.y = groundHeight;
    } else {
      this.#position = depenetrateVoxelBodyUpward(
        this.#config.isSolidAt,
        nextPosition,
        this.#bodyShape,
      );
      this.#grounded = voxelBodyIsSupported(
        this.#config.isSolidAt,
        this.#position,
        this.#bodyShape,
        SUPPORT_PROBE_DISTANCE,
      );
    }

    this.#verticalVelocity = 0;
    this.#horizontalSpeed = 0;
    this.#sprinting = false;
    this.#sneaking = false;
    this.#fluidExitAssistSeconds = 0;
    this.#environment = this.#config.environmentAt(this.#position);
  }

  #updateVoxels(
    input: PlayerMotorInput,
    stepSeconds: number,
    isSolidAt: VoxelSolidProvider,
  ): PlayerMotorState {
    this.#fluidExitAssistSeconds = Math.max(
      this.#fluidExitAssistSeconds - stepSeconds,
      0,
    );
    this.#environment = this.#config.environmentAt(this.#position);
    const movement = this.#calculateHorizontalMovement(
      input,
      stepSeconds,
      this.#environment,
    );
    const canUseWaterExitAssist =
      input.jump &&
      !this.#environment.inLava &&
      !this.#environment.onLadder &&
      (this.#environment.inWater || this.#fluidExitAssistSeconds > 0);
    const movedHorizontally = this.#moveHorizontal(
      movement.deltaX,
      movement.deltaZ,
      isSolidAt,
      canUseWaterExitAssist,
    );

    this.#horizontalSpeed = movedHorizontally ? movement.speed : 0;
    this.#sprinting =
      input.sprint &&
      !input.sneak &&
      !this.#environment.inWater &&
      !this.#environment.inLava &&
      movedHorizontally &&
      movement.speed > 0;

    if (
      this.#grounded &&
      !voxelBodyIsSupported(
        isSolidAt,
        this.#position,
        this.#bodyShape,
        SUPPORT_PROBE_DISTANCE,
      )
    ) {
      this.#grounded = false;
    }

    this.#environment = this.#config.environmentAt(this.#position);
    const assistedWaterExit =
      input.jump &&
      this.#fluidExitAssistSeconds > 0 &&
      !this.#environment.inLava &&
      !this.#environment.onLadder;

    if (this.#environment.onLadder) {
      this.#updateLadder(input, stepSeconds, isSolidAt);
    } else if (
      this.#environment.inWater ||
      this.#environment.inLava ||
      assistedWaterExit
    ) {
      this.#updateFluid(
        input,
        stepSeconds,
        isSolidAt,
        this.#environment.inLava,
      );
    } else {
      this.#updateAirAndGround(input, stepSeconds, isSolidAt);
    }

    this.#environment = this.#config.environmentAt(this.#position);
    return this.getState();
  }

  #updateAirAndGround(
    input: PlayerMotorInput,
    stepSeconds: number,
    isSolidAt: VoxelSolidProvider,
  ): void {
    if (input.jump && this.#grounded) {
      this.#grounded = false;
      this.#verticalVelocity = this.#config.jumpSpeed;
    }

    if (!this.#grounded) {
      this.#verticalVelocity += this.#config.gravity * stepSeconds;
      this.#moveVertical(this.#verticalVelocity * stepSeconds, isSolidAt);
    } else {
      this.#verticalVelocity = 0;
    }

    if (
      this.#verticalVelocity <= 0 &&
      voxelBodyIsSupported(
        isSolidAt,
        this.#position,
        this.#bodyShape,
        SUPPORT_PROBE_DISTANCE,
      )
    ) {
      this.#moveVertical(-SUPPORT_PROBE_DISTANCE, isSolidAt);
      this.#grounded = true;
      this.#verticalVelocity = 0;
    }
  }

  #updateFluid(
    input: PlayerMotorInput,
    stepSeconds: number,
    isSolidAt: VoxelSolidProvider,
    lava: boolean,
  ): void {
    const supported = voxelBodyIsSupported(
      isSolidAt,
      this.#position,
      this.#bodyShape,
      SUPPORT_PROBE_DISTANCE,
    );
    const verticalIntent = (input.jump ? 1 : 0) - (input.sneak ? 1 : 0);
    const targetVelocity = lava
      ? verticalIntent > 0
        ? LAVA_ASCEND_SPEED
        : verticalIntent < 0
          ? LAVA_DESCEND_SPEED
          : LAVA_IDLE_SINK_SPEED
      : verticalIntent > 0
        ? WATER_ASCEND_SPEED
        : verticalIntent < 0
          ? WATER_DESCEND_SPEED
          : WATER_IDLE_SINK_SPEED;
    const response = 1 - Math.exp(
      -(lava ? LAVA_VERTICAL_RESPONSE : WATER_VERTICAL_RESPONSE) * stepSeconds,
    );

    this.#verticalVelocity +=
      (targetVelocity - this.#verticalVelocity) * response;

    if (supported && verticalIntent === 0 && this.#verticalVelocity < 0) {
      this.#verticalVelocity = 0;
      this.#grounded = true;
    } else {
      this.#grounded = false;
    }

    this.#moveVertical(this.#verticalVelocity * stepSeconds, isSolidAt);
  }

  #updateLadder(
    input: PlayerMotorInput,
    stepSeconds: number,
    isSolidAt: VoxelSolidProvider,
  ): void {
    this.#grounded = false;
    if (input.jump || input.moveZ > 0.1) {
      this.#verticalVelocity = LADDER_CLIMB_SPEED;
    } else if (input.sneak || input.moveZ < -0.1) {
      this.#verticalVelocity = LADDER_DESCEND_SPEED;
    } else {
      this.#verticalVelocity = Math.max(
        this.#verticalVelocity,
        LADDER_IDLE_FALL_SPEED,
      );
    }
    this.#moveVertical(this.#verticalVelocity * stepSeconds, isSolidAt);
  }

  #calculateHorizontalMovement(
    input: PlayerMotorInput,
    stepSeconds: number,
    environment: PlayerEnvironmentState,
  ): { readonly deltaX: number; readonly deltaZ: number; readonly speed: number } {
    const inputLength = Math.hypot(input.moveX, input.moveZ);
    const normalizedX = inputLength > 1 ? input.moveX / inputLength : input.moveX;
    const normalizedZ = inputLength > 1 ? input.moveZ / inputLength : input.moveZ;
    const movementStrength = Math.min(inputLength, 1);
    const baseSpeed = environment.inLava
      ? this.#config.lavaSpeed
      : environment.inWater
        ? this.#config.waterSpeed
        : input.sneak
          ? this.#config.sneakSpeed
          : input.sprint
            ? this.#config.sprintSpeed
            : this.#config.walkSpeed;
    const speed = baseSpeed * movementStrength;
    const forwardX = Math.sin(input.yaw);
    const forwardZ = Math.cos(input.yaw);
    const rightX = Math.cos(input.yaw);
    const rightZ = -Math.sin(input.yaw);

    return {
      deltaX:
        (rightX * normalizedX + forwardX * normalizedZ) * speed * stepSeconds,
      deltaZ:
        (rightZ * normalizedX + forwardZ * normalizedZ) * speed * stepSeconds,
      speed,
    };
  }

  #moveHorizontal(
    deltaX: number,
    deltaZ: number,
    isSolidAt: VoxelSolidProvider,
    allowFluidStepOut: boolean,
  ): boolean {
    const maximumDelta = Math.max(Math.abs(deltaX), Math.abs(deltaZ));
    if (maximumDelta <= 0) return false;
    const steps = Math.max(
      1,
      Math.ceil(maximumDelta / this.#config.maximumMovementSubstep),
    );
    const stepX = deltaX / steps;
    const stepZ = deltaZ / steps;
    let moved = false;
    for (let step = 0; step < steps; step += 1) {
      const movedX = this.#moveHorizontalAxis(
        'x',
        stepX,
        isSolidAt,
        allowFluidStepOut,
      );
      const movedZ = this.#moveHorizontalAxis(
        'z',
        stepZ,
        isSolidAt,
        allowFluidStepOut,
      );
      moved = moved || movedX || movedZ;
    }
    return moved;
  }

  #moveHorizontalAxis(
    axis: HorizontalAxis,
    amount: number,
    isSolidAt: VoxelSolidProvider,
    allowFluidStepOut: boolean,
  ): boolean {
    if (Math.abs(amount) <= Number.EPSILON) return false;
    const candidate = { ...this.#position, [axis]: this.#position[axis] + amount };
    if (!voxelBodyCollides(isSolidAt, candidate, this.#bodyShape)) {
      if (
        this.#sneaking &&
        this.#grounded &&
        !this.#environment.inWater &&
        !this.#environment.inLava &&
        !voxelBodyIsSupported(
          isSolidAt,
          candidate,
          this.#bodyShape,
          SNEAK_SUPPORT_PROBE_DISTANCE,
        )
      ) {
        return false;
      }
      this.#position = candidate;
      if (
        this.#fluidExitAssistSeconds > 0 &&
        !this.#config.environmentAt(candidate).inWater &&
        voxelBodyIsSupported(
          isSolidAt,
          candidate,
          this.#bodyShape,
          SUPPORT_PROBE_DISTANCE,
        )
      ) {
        this.#fluidExitAssistSeconds = 0;
        this.#grounded = true;
        this.#verticalVelocity = 0;
      }
      return true;
    }

    if (allowFluidStepOut) {
      this.#prepareFluidStepOut(axis, amount, isSolidAt);
    }
    if (!this.#grounded) return false;
    if (this.#tryStepUp(axis, amount, isSolidAt)) return true;
    if (!this.#sneaking) this.#tryAutoJump(axis, amount, isSolidAt);
    return false;
  }

  #prepareFluidStepOut(
    axis: HorizontalAxis,
    amount: number,
    isSolidAt: VoxelSolidProvider,
  ): void {
    const horizontalCandidate = {
      ...this.#position,
      [axis]: this.#position[axis] + amount,
    };
    for (const lift of this.#collectStepHeights(
      horizontalCandidate,
      isSolidAt,
      this.#config.maximumAutoJumpHeight,
    )) {
      const landingCandidate = {
        ...horizontalCandidate,
        y: this.#position.y + lift,
      };
      if (
        !voxelBodyCollides(isSolidAt, landingCandidate, this.#bodyShape) &&
        voxelBodyIsSupported(
          isSolidAt,
          landingCandidate,
          this.#bodyShape,
          SUPPORT_PROBE_DISTANCE,
        )
      ) {
        // Do not teleport straight onto the bank. Keep a short water-exit grace
        // window so normal swim ascent raises the player over several fixed
        // updates, then horizontal motion resumes as soon as the feet clear the
        // ledge. This removes the visible one-frame snap/stutter at shorelines.
        this.#fluidExitAssistSeconds = FLUID_EXIT_ASSIST_SECONDS;
        this.#grounded = false;
        this.#verticalVelocity = Math.max(
          this.#verticalVelocity,
          WATER_ASCEND_SPEED * 0.7,
        );
        return;
      }
    }
  }

  #tryStepUp(
    axis: HorizontalAxis,
    amount: number,
    isSolidAt: VoxelSolidProvider,
  ): boolean {
    const horizontalCandidate = {
      ...this.#position,
      [axis]: this.#position[axis] + amount,
    };
    for (const lift of this.#collectStepHeights(
      horizontalCandidate,
      isSolidAt,
      this.#config.maximumStepHeight,
    )) {
      const candidate = {
        ...horizontalCandidate,
        y: this.#position.y + lift,
      };
      if (
        !voxelBodyCollides(isSolidAt, candidate, this.#bodyShape) &&
        voxelBodyIsSupported(
          isSolidAt,
          candidate,
          this.#bodyShape,
          SUPPORT_PROBE_DISTANCE,
        )
      ) {
        this.#position = candidate;
        this.#grounded = true;
        this.#verticalVelocity = 0;
        return true;
      }
    }
    return false;
  }

  #tryAutoJump(
    axis: HorizontalAxis,
    amount: number,
    isSolidAt: VoxelSolidProvider,
  ): boolean {
    if (!this.#config.autoJump) return false;
    const horizontalCandidate = {
      ...this.#position,
      [axis]: this.#position[axis] + amount,
    };
    const lifts = this.#collectStepHeights(
      horizontalCandidate,
      isSolidAt,
      this.#config.maximumAutoJumpHeight,
    );
    for (const lift of lifts) {
      if (lift <= this.#config.maximumStepHeight + COLLISION_EPSILON) continue;
      const earlyJumpPosition = {
        ...this.#position,
        y: this.#position.y + Math.min(AUTO_JUMP_CLEARANCE_PROBE, lift),
      };
      const landingPosition = {
        ...horizontalCandidate,
        y: this.#position.y + lift,
      };
      if (
        !voxelBodyCollides(isSolidAt, earlyJumpPosition, this.#bodyShape) &&
        !voxelBodyCollides(isSolidAt, landingPosition, this.#bodyShape) &&
        voxelBodyIsSupported(
          isSolidAt,
          landingPosition,
          this.#bodyShape,
          SUPPORT_PROBE_DISTANCE,
        )
      ) {
        this.#grounded = false;
        this.#verticalVelocity = this.#config.jumpSpeed;
        return true;
      }
    }
    return false;
  }

  #collectStepHeights(
    candidate: MutablePosition,
    isSolidAt: VoxelSolidProvider,
    maximumHeight: number,
  ): number[] {
    const firstX = Math.floor(
      candidate.x - this.#bodyShape.radius + 0.5 + COLLISION_EPSILON,
    );
    const lastX = Math.floor(
      candidate.x + this.#bodyShape.radius + 0.5 - COLLISION_EPSILON,
    );
    const firstZ = Math.floor(
      candidate.z - this.#bodyShape.radius + 0.5 + COLLISION_EPSILON,
    );
    const lastZ = Math.floor(
      candidate.z + this.#bodyShape.radius + 0.5 - COLLISION_EPSILON,
    );
    const feetY = this.#position.y - this.#bodyShape.halfHeight;
    const firstY = Math.floor(feetY + 0.5 + COLLISION_EPSILON);
    const lastY = Math.floor(
      feetY + maximumHeight + 0.5 - COLLISION_EPSILON,
    );
    const lifts = new Set<number>();
    for (let worldY = firstY; worldY <= lastY; worldY += 1) {
      for (let worldZ = firstZ; worldZ <= lastZ; worldZ += 1) {
        for (let worldX = firstX; worldX <= lastX; worldX += 1) {
          if (!isSolidAt(worldX, worldY, worldZ)) continue;
          const lift =
            worldY + 0.5 + this.#bodyShape.halfHeight - this.#position.y;
          if (
            lift > COLLISION_EPSILON &&
            lift <= maximumHeight + COLLISION_EPSILON
          ) {
            lifts.add(lift);
          }
        }
      }
    }
    return [...lifts].sort((left, right) => left - right);
  }

  #moveVertical(amount: number, isSolidAt: VoxelSolidProvider): void {
    const steps = Math.max(
      1,
      Math.ceil(Math.abs(amount) / this.#config.maximumMovementSubstep),
    );
    const stepAmount = amount / steps;
    for (let step = 0; step < steps; step += 1) {
      const startY = this.#position.y;
      const target = { ...this.#position, y: startY + stepAmount };
      if (!voxelBodyCollides(isSolidAt, target, this.#bodyShape)) {
        this.#position = target;
        continue;
      }
      let safeFraction = 0;
      let blockedFraction = 1;
      for (let iteration = 0; iteration < BINARY_SEARCH_ITERATIONS; iteration += 1) {
        const middle = (safeFraction + blockedFraction) / 2;
        const candidate = {
          ...this.#position,
          y: startY + stepAmount * middle,
        };
        if (voxelBodyCollides(isSolidAt, candidate, this.#bodyShape)) {
          blockedFraction = middle;
        } else {
          safeFraction = middle;
        }
      }
      this.#position.y = startY + stepAmount * safeFraction;
      this.#verticalVelocity = 0;
      this.#grounded = stepAmount < 0;
      return;
    }
  }

  #updateHeightfield(
    input: PlayerMotorInput,
    stepSeconds: number,
  ): PlayerMotorState {
    this.#environment = this.#config.environmentAt(this.#position);
    const inputLength = Math.hypot(input.moveX, input.moveZ);
    const normalizedX = inputLength > 1 ? input.moveX / inputLength : input.moveX;
    const normalizedZ = inputLength > 1 ? input.moveZ / inputLength : input.moveZ;
    const speed = input.sneak
      ? this.#config.sneakSpeed
      : input.sprint
        ? this.#config.sprintSpeed
        : this.#config.walkSpeed;
    const movementStrength = Math.min(inputLength, 1);
    this.#horizontalSpeed = speed * movementStrength;
    this.#sprinting = input.sprint && !input.sneak && movementStrength > 0;
    const forwardX = Math.sin(input.yaw);
    const forwardZ = Math.cos(input.yaw);
    const rightX = Math.cos(input.yaw);
    const rightZ = -Math.sin(input.yaw);
    const previousX = this.#position.x;
    const previousZ = this.#position.z;
    const previousGroundHeight = this.#getGroundHeight(previousX, previousZ);
    this.#position.x +=
      (rightX * normalizedX + forwardX * normalizedZ) * speed * stepSeconds;
    this.#position.z +=
      (rightZ * normalizedX + forwardZ * normalizedZ) * speed * stepSeconds;
    let destinationGroundHeight = this.#getGroundHeight(
      this.#position.x,
      this.#position.z,
    );
    if (
      this.#grounded &&
      destinationGroundHeight - previousGroundHeight >
        this.#config.maximumStepHeight
    ) {
      this.#position.x = previousX;
      this.#position.z = previousZ;
      destinationGroundHeight = previousGroundHeight;
      this.#horizontalSpeed = 0;
      this.#sprinting = false;
    }
    if (input.jump && this.#grounded) {
      this.#grounded = false;
      this.#verticalVelocity = this.#config.jumpSpeed;
    }
    if (this.#grounded) {
      const dropHeight = this.#position.y - destinationGroundHeight;
      if (dropHeight <= this.#config.maximumStepHeight) {
        this.#position.y = destinationGroundHeight;
      } else {
        this.#grounded = false;
      }
    }
    if (!this.#grounded) {
      this.#verticalVelocity += this.#config.gravity * stepSeconds;
      this.#position.y += this.#verticalVelocity * stepSeconds;
      const landingHeight = this.#getGroundHeight(
        this.#position.x,
        this.#position.z,
      );
      if (this.#verticalVelocity <= 0 && this.#position.y <= landingHeight) {
        this.#position.y = landingHeight;
        this.#verticalVelocity = 0;
        this.#grounded = true;
      }
    }
    return this.getState();
  }

  #getGroundHeight(worldX: number, worldZ: number): number {
    const height = this.#config.groundHeightAt(worldX, worldZ);
    if (!Number.isFinite(height)) {
      throw new RangeError('groundHeightAt must return a finite height.');
    }
    return height;
  }
}
