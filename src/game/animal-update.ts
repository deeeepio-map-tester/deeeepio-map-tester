import { getBiomes } from "../game-utils/maploader";
import { findNearestPointOnLine, point2rad } from "../math-utils";
import type { Animal } from "../objects/animal";
import { linearDampingFactor, planckDownscaleFactor } from "../objects/constants";
import { clampCamera } from "../pixi-utils";
import type { DeeeepioMapScreenObject } from "../types";
import { gameState } from "./game-state";
import { shadowSettings } from "./shadow";
import * as PIXI from "pixi.js";
import * as planck from "planck";
import pointInPolygon from "robust-point-in-polygon";

export function updateAnimal(animal: Animal, isMine: boolean, isMain = false) {
	const s = gameState;
	const layers = s.layers!;
	const app = s.app!;
	const thisAnimal = animal.getState;
	thisAnimal.inWater =
		s.waterObjects.reduce(
			(prev, cur) =>
				prev ||
				[-1, 0].includes(
					pointInPolygon(
						cur.map((p) => [p.x, p.y]),
						[thisAnimal.pixiAnimal.x, thisAnimal.pixiAnimal.y - (thisAnimal.prevInWater ? 0 : 2)],
					),
				),
			false,
		) &&
		!s.airPocketObjects.reduce(
			(prev, cur) =>
				prev ||
				pointInPolygon(
					cur.map((p) => [p.x, p.y]),
					[thisAnimal.pixiAnimal.x, thisAnimal.pixiAnimal.y - (thisAnimal.prevInWater ? 0 : 2)],
				) === -1,
			false,
		);
	thisAnimal.prevInWater = thisAnimal.inWater;

	thisAnimal.doApplyForce = isMine
		? Math.sqrt(
				((thisAnimal.pixiAnimal.x - app.stage.pivot.x) * s.zoom - (s.mouseData.clientX - window.innerWidth / 2)) ** 2 +
					((thisAnimal.pixiAnimal.y - app.stage.pivot.y) * s.zoom - (s.mouseData.clientY - window.innerHeight / 2)) **
						2,
			) >
			6 * s.zoom
		: false;

	// walking logic
	// eslint-disable-next-line @typescript-eslint/no-deprecated
	let surfaceNormal: planck.Vec2 | null = null;
	// eslint-disable-next-line @typescript-eslint/no-deprecated
	let nearestPointOnTerrain: planck.Vec2 | null = null;
	const halfHeight = (0.5 * thisAnimal.animalSize.planck.height) / planckDownscaleFactor;

	if (thisAnimal.animalData.canStand) {
		let terrainContacts: planck.Body[] = [];
		let distToGround = Number.POSITIVE_INFINITY;

		for (let ce = thisAnimal.animal.getContactList(); ce; ce = ce.next) {
			if (ce.other) terrainContacts.push(ce.other);
		}

		terrainContacts = terrainContacts
			.filter((d: planck.Body) => (d.getUserData() as { type?: string })?.type === "terrain")
			.filter((d: planck.Body) => {
				const v = (d.getUserData() as { vertices?: { x: number; y: number }[] })?.vertices;
				const p = thisAnimal.animal.getPosition();
				if (!v || !p) return false;
				const nearest = findNearestPointOnLine(p.x, p.y + halfHeight, v[0].x, v[0].y, v[1].x, v[1].y);
				return nearest.y - (p.y + halfHeight) > 0 && Math.abs((v[0].y - v[1].y) / (v[0].x - v[1].x)) < 3;
			});

		const walkRange = ((thisAnimal.walking ? 1 : 0.7) / planckDownscaleFactor) * thisAnimal.animalSize.planck.height;

		const edgeInfos = terrainContacts
			.map((body: planck.Body) => {
				const v = (body.getUserData() as { vertices?: { x: number; y: number }[] })?.vertices;
				const p = thisAnimal.animal.getPosition();
				if (!v || !p) return null;
				const n = findNearestPointOnLine(p.x, p.y + halfHeight, v[0].x, v[0].y, v[1].x, v[1].y);
				const dist = Math.sqrt((n.x - p.x) ** 2 + (n.y - (p.y + halfHeight)) ** 2);
				if (dist > walkRange) return null;
				const rise = v[0].y - v[1].y;
				const run = v[0].x - v[1].x;
				const edgeAngle = Math.atan2(rise, run);
				return { dist, nx: -Math.sin(edgeAngle), ny: Math.cos(edgeAngle), px: n.x, py: n.y };
			})
			.filter((e): e is NonNullable<typeof e> => e !== null);

		if (edgeInfos.length > 0 && (thisAnimal.animalData.canWalkUnderwater || !thisAnimal.inWater)) {
			distToGround = Math.min(...edgeInfos.map((e) => e.dist));

			let wnx = 0,
				wny = 0,
				wpx = 0,
				wpy = 0,
				totalW = 0;
			for (const e of edgeInfos) {
				// x^4 prevents further edges from being significant
				const w = 1 / (e.dist * e.dist * e.dist * e.dist + 0.001);
				wnx += e.nx * w;
				wny += e.ny * w;
				wpx += e.px * w;
				wpy += e.py * w;
				totalW += w;
			}
			wnx /= totalW;
			wny /= totalW;
			wpx /= totalW;
			wpy /= totalW;

			const len = Math.sqrt(wnx * wnx + wny * wny);
			if (len > 0.001) {
				surfaceNormal = new planck.Vec2(wnx / len, wny / len);
				nearestPointOnTerrain = new planck.Vec2(wpx, wpy);
				thisAnimal.walking = true;
			}
		}
		if (distToGround > walkRange) {
			thisAnimal.walking = false;
		}
	}

	// movement and damping
	if (!thisAnimal.inWater) {
		if (!thisAnimal.walking) {
			thisAnimal.doApplyForce = false;
			thisAnimal.animal.setLinearDamping(0.1);
			thisAnimal.animal.setGravityScale(1);
		} else {
			thisAnimal.animal.setLinearDamping(linearDampingFactor);
			thisAnimal.animal.setGravityScale(0);
		}
	} else {
		thisAnimal.animal.setGravityScale(0);
		thisAnimal.animal.setLinearDamping(linearDampingFactor);
	}

	const spdf =
		thisAnimal.speedFac *
		(thisAnimal.doApplyForce ? 1 : 0) *
		(thisAnimal.walking ? thisAnimal.animalData.walkSpeedMultiplier : thisAnimal.animalData.speedMultiplier);

	if (
		thisAnimal.doApplyForce !== thisAnimal.oldDoApplyForce &&
		thisAnimal.oldDoApplyForce === true &&
		thisAnimal.inWater
	) {
		setTimeout(() => {
			thisAnimal.animal.setLinearDamping(linearDampingFactor);
		}, 100);
		thisAnimal.animal.setLinearDamping(linearDampingFactor * 2);
	}

	// apply force to attach to terrain
	if (thisAnimal.walking && surfaceNormal) {
		const tangent = new planck.Vec2(-surfaceNormal.y, surfaceNormal.x);
		const normalAngle = Math.atan2(surfaceNormal.y, surfaceNormal.x);

		thisAnimal.animal.setAngle(normalAngle + Math.PI / 2);

		if (nearestPointOnTerrain) {
			const bottomY = thisAnimal.animal.getPosition().y + halfHeight;
			const dx = nearestPointOnTerrain.x - thisAnimal.animal.getPosition().x;
			const dy = nearestPointOnTerrain.y - bottomY;
			const suctionForce = 20 * thisAnimal.animal.getMass();
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist > thisAnimal.animalSize.planck.height * 0.5 + 0.1) {
				thisAnimal.animal.applyForceToCenter(new planck.Vec2((dx / dist) * -suctionForce, (dy / dist) * -suctionForce));
			}
			if (dist < thisAnimal.animalSize.planck.height * 0.5 + 0.01) {
				thisAnimal.animal.applyForceToCenter(new planck.Vec2((dx / dist) * suctionForce, (dy / dist) * suctionForce));
			}
		}

		const rotation = thisAnimal.direction - Math.PI / 2;
		const inputDir = new planck.Vec2(Math.cos(rotation), Math.sin(rotation));
		const inputAlongTangent = inputDir.x * tangent.x + inputDir.y * tangent.y;

		thisAnimal.animal.applyForceToCenter(
			new planck.Vec2(tangent.x * inputAlongTangent * spdf, tangent.y * inputAlongTangent * spdf),
		);
	} else {
		const rotation = thisAnimal.direction - Math.PI / 2;
		thisAnimal.animal.setAngle(thisAnimal.direction);
		thisAnimal.animal.applyForceToCenter(new planck.Vec2(Math.cos(rotation) * spdf, Math.sin(rotation) * spdf));
	}

	// sync data between planck and pixi
	thisAnimal.pixiAnimal.position.set(
		thisAnimal.animal.getPosition().x * planckDownscaleFactor,
		thisAnimal.animal.getPosition().y * planckDownscaleFactor,
	);
	thisAnimal.pixiAnimal.scale.set(thisAnimal.animalSize.pixi.scale * thisAnimal.scale);

	// display animal as walking in pixi
	// if (thisAnimal.walking && surfaceNormal) {
	// const tangent = new planck.Vec2(-surfaceNormal.y, surfaceNormal.x);
	// const edgeAngle = Math.atan2(tangent.y, tangent.x);
	// thisAnimal.pixiAnimal.rotation = edgeAngle;
	// }

	thisAnimal.grabHook.rotation = -thisAnimal.pixiAnimal.rotation;

	thisAnimal.pixiAnimalUi.position.set(
		thisAnimal.animal.getPosition().x * planckDownscaleFactor,
		thisAnimal.animal.getPosition().y * planckDownscaleFactor - 7 - 4 * (thisAnimal.animalData.sizeMultiplier - 1),
	);
	thisAnimal.pixiAnimalUi.scale.set(0.1);

	if (!isMine) {
		const camX = app.stage.pivot.x;
		const camY = app.stage.pivot.y;
		const viewDist = Math.max(window.innerWidth, window.innerHeight) * s.zoom * 12;
		const visible = (thisAnimal.pixiAnimal.x - camX) ** 2 + (thisAnimal.pixiAnimal.y - camY) ** 2 < viewDist * viewDist;
		thisAnimal.pixiAnimal.renderable = visible;
		thisAnimal.pixiAnimalUi.renderable = visible;
		return;
	}

	if (isMine) {
		const centerX = (thisAnimal.pixiAnimal.x - app.stage.pivot.x) * s.zoom;
		const centerY = (thisAnimal.pixiAnimal.y - app.stage.pivot.y) * s.zoom;
		thisAnimal.direction =
			point2rad(
				s.mouseData.clientX - window.innerWidth / 2,
				s.mouseData.clientY - window.innerHeight / 2,
				centerX,
				centerY,
			) +
			Math.PI / 2;

		thisAnimal.pixiAnimal.rotation = thisAnimal.animal.getAngle();

		if (isMain) {
			const viewportPos = clampCamera(
				thisAnimal.pixiAnimal.x,
				thisAnimal.pixiAnimal.y,
				s.zoom,
				Number(s.map!.worldSize.width) * 10,
				Number(s.map!.worldSize.height) * 10,
				window.innerWidth,
				window.innerHeight,
			);
			app.stage.pivot.set(...viewportPos);
			layers.shadowLayer.pivot.set(-thisAnimal.pixiAnimal.x, -thisAnimal.pixiAnimal.y);

			layers.ceilingsLayer.children.forEach((c: PIXI.ContainerChild & { points?: [number, number][] }) => {
				if (
					c.points &&
					[-1, 0].includes(
						pointInPolygon(c.points, [thisAnimal.pixiAnimal.x, thisAnimal.pixiAnimal.y - (thisAnimal.inWater ? 0 : 2)]),
					)
				) {
					c.alpha = 0.4;
				} else {
					c.alpha = 1;
				}
			});

			layers.hideSpacesHighLayer.children.forEach((h) => {
				if (
					(thisAnimal.pixiAnimal.x - h.x) ** 2 + (thisAnimal.pixiAnimal.y - h.y) ** 2 <
					Math.max(window.innerHeight, window.innerWidth) * s.zoom * 20
				) {
					h.renderable = true;
				} else {
					h.renderable = false;
				}
			});
			layers.hideSpacesLowLayer.children.forEach((h) => {
				if (
					(thisAnimal.pixiAnimal.x - h.x) ** 2 + (thisAnimal.pixiAnimal.y - h.y) ** 2 <
					Math.max(window.innerHeight, window.innerWidth) * s.zoom * 20
				) {
					h.renderable = true;
				} else {
					h.renderable = false;
				}
			});
			layers.foodLayer.children.forEach((f) => {
				if (
					(thisAnimal.pixiAnimal.x - f.x) ** 2 + (thisAnimal.pixiAnimal.y - f.y) ** 2 <
					Math.max(window.innerHeight, window.innerWidth) * s.zoom * 20
				) {
					const underOpaqueCeiling = layers.ceilingsLayer.children.some(
						(c: PIXI.ContainerChild & { points?: [number, number][]; alpha?: number }) => {
							return c.points && c.alpha === 1 && [-1, 0].includes(pointInPolygon(c.points, [f.x, f.y]));
						},
					);
					f.renderable = !underOpaqueCeiling;
				} else {
					f.renderable = false;
				}
			});

			let currentBiomes = 0;
			s.habitats.forEach((h: DeeeepioMapScreenObject & { points: [number, number][] }) => {
				if (pointInPolygon(h.points, [thisAnimal.pixiAnimal.x, thisAnimal.pixiAnimal.y]) !== 1) {
					currentBiomes = currentBiomes | h.settings.area;
				}
			});
			const currentBiomesList = getBiomes(currentBiomes);
			if (currentBiomesList.includes("deep")) {
				if (currentBiomesList.includes("shallow")) {
					shadowSettings.alpha = 0.5;
				} else {
					shadowSettings.alpha = 1;
				}
			} else {
				shadowSettings.alpha = 0;
			}

			if (shadowSettings.alpha > layers.shadowLayer.alpha) {
				layers.shadowLayer.alpha = Math.round((layers.shadowLayer.alpha + 0.02) * 100) / 100;
			} else if (shadowSettings.alpha < layers.shadowLayer.alpha) {
				layers.shadowLayer.alpha = Math.round((layers.shadowLayer.alpha - 0.02) * 100) / 100;
			}

			thisAnimal.updateChargedBoostPercent(
				Math.min(
					1,
					(Date.now() - (thisAnimal.chargedBoostStartTime || Date.now())) /
						thisAnimal.animalData.secondaryAbilityLoadTime,
				),
			);
		}
	}
}
