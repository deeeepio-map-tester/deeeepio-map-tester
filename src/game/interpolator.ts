export interface BodySnapshot {
	x: number;
	y: number;
	angle: number;
	vx: number;
	vy: number;
	angularVelocity: number;
}

const TICK_DURATION = 1 / 30;

export class BodyInterpolator {
	private prev: BodySnapshot;
	private curr: BodySnapshot;
	private initialized: boolean;

	constructor(initial: BodySnapshot) {
		this.prev = { ...initial };
		this.curr = { ...initial };
		this.initialized = false;
	}

	push(snapshot: BodySnapshot) {
		if (this.initialized) {
			const endOfTick = this.interpolate(1);
			this.prev = {
				x: endOfTick.x,
				y: endOfTick.y,
				angle: endOfTick.angle,
				vx: this.curr.vx,
				vy: this.curr.vy,
				angularVelocity: this.curr.angularVelocity,
			};
		} else {
			this.prev = { ...this.curr };
			this.initialized = true;
		}
		this.curr = { ...snapshot };
	}

	interpolate(t: number): { x: number; y: number; angle: number } {
		if (t <= 0.5) {
			// Cubic Hermite interpolation between prev and curr.
			// Uses both positions and velocities to produce a smooth curve
			// that respects acceleration (e.g. from boosts), avoiding the
			// visual snaps that linear lerp creates when velocity changes
			// sharply between ticks.
			const alpha = t * 2;
			const alpha2 = alpha * alpha;
			const alpha3 = alpha2 * alpha;
			const h = TICK_DURATION;

			const p0x = this.prev.x;
			const p0y = this.prev.y;
			const p1x = this.curr.x;
			const p1y = this.curr.y;
			const m0x = this.prev.vx * h;
			const m0y = this.prev.vy * h;
			const m1x = this.curr.vx * h;
			const m1y = this.curr.vy * h;

			const h00 = 2 * alpha3 - 3 * alpha2 + 1;
			const h10 = alpha3 - 2 * alpha2 + alpha;
			const h01 = -2 * alpha3 + 3 * alpha2;
			const h11 = alpha3 - alpha2;

			return {
				x: h00 * p0x + h10 * m0x + h01 * p1x + h11 * m1x,
				y: h00 * p0y + h10 * m0y + h01 * p1y + h11 * m1y,
				angle: this.prev.angle + shortAngleDist(this.prev.angle, this.curr.angle) * alpha,
			};
		} else {
			const alpha = (t - 0.5) * 2;
			const dt = alpha * 0.5 * TICK_DURATION;
			return {
				x: this.curr.x + this.curr.vx * dt,
				y: this.curr.y + this.curr.vy * dt,
				angle: this.curr.angle + this.curr.angularVelocity * dt,
			};
		}
	}
}

function shortAngleDist(from: number, to: number): number {
	const da = (to - from) % (Math.PI * 2);
	return ((da + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}
