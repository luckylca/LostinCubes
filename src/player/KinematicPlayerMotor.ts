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

export type GroundHeightProvider = (worldX: number, worldZ: number) => number;

export interface PlayerMotorConfig {
  readonly walkSpeed: number;
  readonly sprintSpeed: number;
  readonly jumpSpeed: number;
  readonly gravity: number;
  readonly radius: number;
  readonly maximumStepHeight: number;
  readonly groundHeightAt: GroundHeightProvider;
}

const DEFAULT_CONFIG: PlayerMotorConfig = {
  walkSpeed: 3.8,
  sprintSpeed: 6.2,
  jumpSpeed: 6.4,
  gravity: -18,
  radius: 0.34,
  maximumStepHeight: 1.05,
  groundHeightAt: () => 2.9,
};

interface MutablePosition {
  x: number;
  y: number;
  z: number;
}

export class KinematicPlayerMotor {
  readonly #config: PlayerMotorConfig;
  #position: MutablePosition = { x: 0, y: 0, z: 3.5 };
  #verticalVelocity = 0;
  #horizontalSpeed = 0;
  #sprinting = false;
  #grounded = true;

  public constructor(config: Partial<PlayerMotorConfig> = {}) {
    this.#config = { ...DEFAULT_CONFIG, ...config };
    this.#position.y = this.#getGroundHeight(
      this.#position.x,
      this.#position.z,
    );
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

  public getState(): PlayerMotorState {
    return {
      position: { ...this.#position },
      verticalVelocity: this.#verticalVelocity,
      horizontalSpeed: this.#horizontalSpeed,
      sprinting: this.#sprinting,
      grounded: this.#grounded,
    };
  }

  public reset(position?: PlayerVector): void {
    const nextPosition = position ?? {
      x: 0,
      y: this.#getGroundHeight(0, 3.5),
      z: 3.5,
    };
    const groundHeight = this.#getGroundHeight(nextPosition.x, nextPosition.z);

    this.#position = { ...nextPosition };
    this.#verticalVelocity = 0;
    this.#horizontalSpeed = 0;
    this.#sprinting = false;
    this.#grounded = nextPosition.y <= groundHeight + 0.001;
    if (this.#grounded) {
      this.#position.y = groundHeight;
    }
  }

  #getGroundHeight(worldX: number, worldZ: number): number {
    const height = this.#config.groundHeightAt(worldX, worldZ);
    if (!Number.isFinite(height)) {
      throw new RangeError('groundHeightAt must return a finite height.');
    }
    return height;
  }
}
