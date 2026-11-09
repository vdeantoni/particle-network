function random(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export class Particle {
  // Extra velocity from pointer forces, in pixels per reference frame.
  // It decays so pushed particles settle back into their own drift.
  public pushX = 0;
  public pushY = 0;
  // performance.now() when the pointer placed it: when auto-fire added it, or
  // when a drag let go of it. Only those particles expire.
  public placedAt?: number;
  // Falls from 1 to 0 as it dies, fading it along with its links
  public vitality = 1;

  constructor(
    public x: number,
    public y: number,
    // Unit direction of its own drift
    private dx: number,
    private dy: number,
    public pace: number,
    public size: number,
  ) {}

  public move(step: number, pushStep: number, pushDecay: number) {
    this.x += this.dx * step + this.pushX * pushStep;
    this.y += this.dy * step + this.pushY * pushStep;
    this.pushX *= pushDecay;
    this.pushY *= pushDecay;
  }

  public distance(other: { x: number; y: number }) {
    return Math.sqrt((other.x - this.x) ** 2 + (other.y - this.y) ** 2);
  }

  // Pace and size are normalized to 0..1 so speed and radius settings apply
  // to existing particles without respawning them
  public static create(x: number, y: number) {
    const angle = random(0, 2 * Math.PI);
    return new Particle(
      x,
      y,
      Math.cos(angle),
      Math.sin(angle),
      Math.random(),
      Math.random(),
    );
  }
}
