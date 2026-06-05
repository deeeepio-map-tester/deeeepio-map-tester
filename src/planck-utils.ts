import { isClockwise } from "./game-utils/maploader";
import { DeeeepioMapScreenObject } from "./types";
import { Edge, Vec2, type World } from "planck";

/**
 * Classify an edge of a clockwise polygon based on its outward normal.
 *
 * 75° threshold from vertical:
 *
 * - TerrainTop: outward normal within 75° of (0,-1) (flat-ish top surface)
 * - TerrainBottom: outward normal within 75° of (0,1) (flat-ish bottom surface / ceiling)
 * - Terrain: anything steeper than 75° from vertical
 */
function classifyEdge(dx: number, dy: number): "terrain" | "terrainTop" | "terrainBottom" {
	const len = Math.hypot(dx, dy);
	if (len < 1e-5) return "terrain";

	// Outward normal for a clockwise polygon in screen coords (Y down)
	// For an edge going from p to p_old (clockwise), outward normal = (dy, -dx)
	// Y component of outward unit normal: ny = -dx / len
	const ny = -dx / len;
	const cos75 = 0.2588; // cos(75°)

	if (ny < -cos75) return "terrainTop";
	if (ny > cos75) return "terrainBottom";
	return "terrain";
}

export function addBoundaries(world: World, width: number, height: number) {
	const bottom = world.createBody();
	bottom.createFixture({ shape: new Edge(new Vec2(0, height), new Vec2(width, height)), restitution: 0.1 });
	const top = world.createBody();
	top.createFixture({ shape: new Edge(new Vec2(0, 0), new Vec2(width, 0)), restitution: 0.1 });
	const left = world.createBody();
	left.createFixture({ shape: new Edge(new Vec2(0, 0), new Vec2(0, height)), restitution: 0.1 });
	const right = world.createBody();
	right.createFixture({ shape: new Edge(new Vec2(width, 0), new Vec2(width, height)), restitution: 0.1 });
}

export function createTerrainCollider(
	// eslint-disable-next-line @typescript-eslint/no-deprecated
	world: World,
	terrain: DeeeepioMapScreenObject,
	pdf: number,
) {
	if (!isClockwise(terrain.points)) {
		terrain.points.reverse();
	}
	terrain.points.forEach((p, i) => {
		const pOld = terrain.points[(i + 1) % terrain.points.length];

		// Edge direction (screen coords, Y down)
		const dx = pOld.x - p.x;
		const dy = pOld.y - p.y;
		const edgeType = classifyEdge(dx, dy);

		const v0 = new Vec2(p.x / pdf, p.y / pdf);
		const pGhostOld = terrain.points[(terrain.points.length + i - 1) % terrain.points.length];
		const vprev = new Vec2(pGhostOld.x / pdf, pGhostOld.y / pdf);
		const pGhostNew = terrain.points[(i + 2) % terrain.points.length];
		const vnext = new Vec2(pGhostNew.x / pdf, pGhostNew.y / pdf);
		const v1 = new Vec2(pOld.x / pdf, pOld.y / pdf);

		const edge = world.createBody({
			userData: {
				type: edgeType,
				topBottom: edgeType === "terrainTop", // backward compat for any existing code
				vertices: [
					{ x: p.x / pdf, y: p.y / pdf },
					{ x: pOld.x / pdf, y: pOld.y / pdf },
				],
				id: terrain.id,
			},
		});
		edge.createFixture({
			shape: new Edge(v0, v1).setPrevVertex(vprev).setNextVertex(vnext),
			friction: 1,
			restitution: 0,
		});
	});
}
