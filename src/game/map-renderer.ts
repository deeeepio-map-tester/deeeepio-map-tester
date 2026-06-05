import { getHidespaceById, getPropById } from "../game-utils/maploader";
import { Animal } from "../objects/animal";
import { planckDownscaleFactor } from "../objects/constants";
import { Food } from "../objects/food";
import { renderGradientShape, renderTerrainShape, renderWaterBorder } from "../pixi-utils";
import type { DeeeepioMapScreenObject } from "../types";
import { gameState, type MapData } from "./game-state";
import type { LayerRefs } from "./game-state";
import * as PIXI from "pixi.js";

export function renderMap(map: MapData, layers: LayerRefs) {
	const s = gameState;

	map.screenObjects.sky?.forEach((sky: DeeeepioMapScreenObject) => {
		const shape = renderGradientShape(sky.points, sky.colors[0], sky.colors[1]);
		layers.skyLayer.addChild(shape);
	});
	map.screenObjects.water?.forEach((water: DeeeepioMapScreenObject) => {
		const shape: PIXI.Graphics & { points?: number[][] } = renderGradientShape(
			water.points,
			water.colors[0],
			water.colors[1],
		);
		shape.points = water.points.map((p) => [p.x, p.y]);
		layers.waterLayer.addChild(shape);
		s.waterObjects.push(water.points);

		if (water.hasBorder) {
			const border = renderWaterBorder(water.points, water.colors[0], false);
			border.topBorder?.forEach((b) => {
				layers.waterBorderLowLayer.addChild(b);
			});
			border.bottomBorder?.forEach((b) => {
				layers.waterBorderHighLayer.addChild(b);
			});
		}
	});
	map.screenObjects["air-pockets"]?.forEach((airpocket: DeeeepioMapScreenObject) => {
		const shape: PIXI.Graphics & { points?: number[][] } = renderTerrainShape(
			airpocket.points,
			airpocket.texture,
			true,
		);
		shape.points = airpocket.points.map((p) => [p.x, p.y]);
		shape.tint = 0xaaaaaa; // Hex color code #AAAAAA
		layers.airPocketsLayer.addChild(shape);
		s.airPocketObjects.push(airpocket.points);

		const border = renderWaterBorder(airpocket.points, airpocket.borderColor, true);
		border.topBorder?.forEach((b) => {
			layers.waterBorderLowLayer.addChild(b);
		});
		border.bottomBorder?.forEach((b) => {
			layers.waterBorderHighLayer.addChild(b);
		});
	});
	map.screenObjects["background-terrains"]?.forEach((bgterrain: DeeeepioMapScreenObject) => {
		const shape = renderTerrainShape(bgterrain.points, bgterrain.texture, true);
		shape.alpha = bgterrain.opacity;
		layers.backgroundTerrainsLayer.addChild(shape);
	});
	map.screenObjects.platforms?.forEach((platform: DeeeepioMapScreenObject) => {
		const shape = renderTerrainShape(platform.points, platform.texture, false);
		layers.platformsLayer.addChild(shape);
	});
	map.screenObjects.islands?.forEach((island: DeeeepioMapScreenObject) => {
		const shape: PIXI.Graphics & { points?: number[][] } = renderTerrainShape(island.points, island.texture, false);
		shape.points = island.points.map((p) => [p.x, p.y]);
		layers.islandsLayer.addChild(shape);
		s.islandPolygons.push(island.points);
	});
	map.screenObjects.terrains?.forEach((terrain: DeeeepioMapScreenObject) => {
		const shape: PIXI.Graphics & { points?: number[][] } = renderTerrainShape(terrain.points, terrain.texture, false);
		shape.points = terrain.points.map((p) => [p.x, p.y]);
		layers.terrainsLayer.addChild(shape);
		s.terrainPolygons.push(terrain.points);
	});
	map.screenObjects.ceilings?.forEach((ceiling: DeeeepioMapScreenObject) => {
		const shape: PIXI.Graphics & { points?: number[][] } = renderTerrainShape(ceiling.points, ceiling.texture, false);
		shape.points = ceiling.points.map((p) => [p.x, p.y]);
		layers.ceilingsLayer.addChild(shape);
	});
	map.screenObjects["hide-spaces"]?.forEach((hidespace: DeeeepioMapScreenObject) => {
		const hs = getHidespaceById(hidespace.hSType);
		if (!hs) return;
		const object: PIXI.Sprite & { animation?: string } = new PIXI.Sprite(PIXI.Assets.get(hs.asset));
		object.width = hs.width * 10;
		object.height = hs.height * 10;
		object.anchor.set(hs.anchor_x, hs.anchor_y);
		object.position.set(hidespace.x, hidespace.y);
		object.alpha = hidespace.opacity || 1;
		object.angle = hidespace.rotation;
		object.zIndex = hidespace.id;
		if (hidespace.hSType === 21) {
			object.animation = "whirlpool";
			object.alpha /= 2;
			s.whirlPoolObjects.push(object);
		}

		if (hs.above && (hidespace.opacity === 1 || hidespace.opacity === undefined)) {
			layers.hideSpacesHighLayer.addChild(object);
		} else if (hidespace.opacity !== 1) {
			layers.hideSpacesLowerLayer.addChild(object);
		} else {
			layers.hideSpacesLowLayer.addChild(object);
		}
	});
	map.screenObjects.props?.forEach((prop: DeeeepioMapScreenObject) => {
		const p = getPropById(prop.pType);
		if (!p) return;
		const object = new PIXI.Sprite(PIXI.Assets.get(p.asset));
		object.width = p.width * 10;
		object.height = p.height * 10;
		object.anchor.set(p.anchor_x, p.anchor_y);
		object.position.set(prop.x, prop.y);
		object.angle = prop.rotation;

		// Message sign
		if (p.id === 1 && prop.params?.text) {
			const text = new PIXI.Text({
				text: prop.params.text,
				style: {
					fontFamily: "Quicksand",
					fontSize: 24,
					fill: 0x7f694e,
					align: "center",
					wordWrapWidth: 300,
					trim: true,
					wordWrap: true,
					breakWords: true,
					fontWeight: "bolder",
				},
				anchor: 0.5,
			});
			text.position.set(0, -350);
			object.addChild(text);
		}

		layers.propsLayer.addChild(object);
	});

	// Pre-compute water bounding boxes for fast intersection checks
	s.waterBBoxes = s.waterObjects.map((pts) => {
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		for (const p of pts) {
			if (p.x < minX) minX = p.x;
			if (p.y < minY) minY = p.y;
			if (p.x > maxX) maxX = p.x;
			if (p.y > maxY) maxY = p.y;
		}
		return { minX, minY, maxX, maxY };
	});

	// Render foods
	map.screenObjects["food-spawns"]?.forEach((f: DeeeepioMapScreenObject) => {
		if (f.settings.onlyOnWater) {
			const fx = f.position.x,
				fy = f.position.y,
				fw = f.size.width,
				fh = f.size.height;
			const intersects = s.waterBBoxes.some((b) => fx < b.maxX && fx + fw > b.minX && fy < b.maxY && fy + fh > b.minY);
			if (!intersects) return;
		}
		for (let i = 0; i < f.settings.count; i++) {
			const foodId = f.settings.foodIds[Math.floor(Math.random() * f.settings.foodIds.length)];
			s.foods.push(
				new Food(s.world!, foodId, layers.foodLayer, 0, 0, {
					type: "water",
					id: foodId,
					respawnDelay:
						typeof f.settings.reSpawnMs === "string"
							? Number.parseInt(f.settings.reSpawnMs)
							: f.settings.reSpawnMs || 1000,
					onlyOnWater: f.settings.onlyOnWater,
					spawner: { water: { x: f.position.x, y: f.position.y, width: f.size.width, height: f.size.height } },
				}),
			);
		}
	});

	// Spawn NPCs
	map.screenObjects["npc-spawns"]?.forEach((npc: DeeeepioMapScreenObject) => {
		const fishLevels = npc.settings.fishLevels;
		if (!fishLevels || fishLevels.length === 0) return;
		for (let i = 0; i < (npc.settings.animalCount || 1); i++) {
			const fishLevel = fishLevels[Math.floor(Math.random() * fishLevels.length)];
			const spawnX = npc.position.x + Math.random() * npc.size.width;
			const spawnY = npc.position.y + Math.random() * npc.size.height;
			s.npcs.push(
				new Animal(
					s.world!,
					fishLevel,
					layers.animalsLayer,
					layers.animalsUiLayer,
					spawnX / planckDownscaleFactor,
					spawnY / planckDownscaleFactor,
					"",
				),
			);
		}
	});
}
