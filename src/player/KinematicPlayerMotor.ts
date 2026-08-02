export interface PlayerVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PlayerMotorState {
  readonly position: PlayerVector;
  readonly verticalVelocity: number;
  readonly horizontalSpeed: number;
  readonly sprinting: boolean;
  readonly grounded: boolean;
}

export interface PlayerMotorInput {
  readonly moveX: number;
  readonly moveZ: number;
  readonly sprint: boolean;
  readonly jump: boolean;
  readonly yaw: number;
}

export interface PlayerMotorConfig {
  readonly walkSpeed: number;
  readonly sprintSpeed: number;
  readonly jumpSpeed: number;
  readonly gravity: number;
  readonly standingY: number;
  readonly worldHalfExtent: number;
  readonly radius: number;
}

const DEFAULT_CONFIG: PlayerMotorConfig = {
  walkSpeed: 3.8,
  sprintSpeed: 6.2,
  jumpSpeed: 6.4,
  gravity: -18,
  standingY: 2.9,
  worldHalfExtent: 5.15,
  radius: 0.34,
};

interface MutablePosition {
  x: number;
  y: number;
  z: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function resolveMonolithCollision(position: MutablePosition, radius: number): void {
  const minimumX = -0.85 - radius;
  const maximumX = 0.85 + radius;
  const minimumZ = -0.85 - radius;
  const maximumZ = 0.85 + radius;

  if (
    position.x <= minimumX ||
    position.x >= maximumX ||
    position.z <= minimumZ ||
    position.z >= maximumZ
  ) {
    return;
  }

  const distanceToLeft = position.x - minimumX;
  const distanceToRight = maximumX - position.x;
  const distanceToNear = position.z - minimumZ;
  const distanceToFar = maximumZ - position.z;
  const smallest = Math.min(
    distanceToLeft,
    distanceToRight,
    distanceToNear,
    distanceToFar,
  );

  if (smallest === distanceToLeft) {
    position.x = minimumX;
  } else if (smallest === distanceToRight) {
    position.x = maximumX;
  } else if (smallest === distanceToNear) {
    position.z = minimumZ;
  } else {
    position.z = maximumZ;
  }
}

export class KinematicPlayerMotor {
  readonly #config: PlayerMotorConfig;
  #position: MutablePosition = { x: 0, y: DEFAULT_CONFIG.standingY, z: 3.5 };
  #verticalVelocity = 0;
  #horizontalSpeed = 0;
  #sprinting = false;
  #grounded = true;

  public constructor(config: Partial<PlayerMotorConfig> = {}) {
    this.#config = { ...DEFAULT_CONFIG, ...config };
    this.#position.y = this.#config.standingY;
  }

  public update(input: PlayerMotorInput, stepSeconds: number): PlayerMotorState {
    const inputLength = Math.hypot(input.moveX, input.moveZ);
    const normalizedX = inputLength > 1 ? input.moveX / inputLength : input.moveX;
    const normalizedZ = inputLength > 1 ? input.moveZ / inputLength : input.moveZ;
    const speed = input.sprint ? this.#config.sprintSpeed : this.#config.walkSpeed;
    const movementStrength = Math.min(inputLength, 1);

    this.#horizontalSpeed = speed * movementStrength;
    this.#sprinting = input.sprint && movementStrength > 0;

    const forwardX = Math.sin(input.yaw);
    const forwardZ = Math.cos(input.yaw);
    const rightX = Math.cos(input.yaw);
    const rightZ = -Math.sin(input.yaw);

    this.#position.x +=
      (rightX * normalizedX + forwardX * normalizedZ) * speed * stepSeconds;
    this.#position.z +=
      (rightZ * normalizedX + forwardZ * normalizedZ) * speed * stepSeconds;

    resolveMonolithCollision(this.#position, this.#config.radius);

    const limit = this.#config.worldHalfExtent - this.#config.radius;
    this.#position.x = clamp(this.#position.x, -limit, limit);
    this.#position.z = clamp(this.#position.z, -limit, limit);

    if (input.jump && this.#grounded) {
      this.#grounded = false;
      this.#verticalVelocity = this.#config.jumpSpeed;
    }

    if (!this.#grounded) {
      this.#verticalVelocity += this.#config.gravity * stepSeconds;
      this.#position.y += this.#verticalVelocity * stepSeconds;

      if (this.#position.y <= this.#config.standingY) {
        this.#position.y = this.#config.standingY;
        this.#verticalVelocity = 0;
        this.#grounded = true;
      }
    }

    return this.getState();
  }

  public getState(): PlayerMotorState {
    return {
      position: { ...this.#position },
      verticalVelocity: this.#verticalVelocity,
      horizontalSpeed: this.#horizontalSpeed,
      sprinting: this.#sprinting,
      grounded: this.#grounded,
    };
  }

  public reset(
    position: PlayerVector = { x: 0, y: this.#config.standingY, z: 3.5 },
  ): void {
    this.#position = { ...position };
    this.#verticalVelocity = 0;
    this.#horizontalSpeed = 0;
    this.#sprinting = false;
    this.#grounded = position.y <= this.#config.standingY;
  }
}
