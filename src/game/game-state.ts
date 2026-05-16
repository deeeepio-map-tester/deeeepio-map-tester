import type { Animal } from "../objects/animal";
import type { Food } from "../objects/food";
import type { DeeeepioMapScreenObject } from "../types";
import type * as PIXI from "pixi.js";
import type * as planck from "planck";

export interface LayerRefs {
	skyLayer: PIXI.Container;
	waterLayer: PIXI.Container;
	backgroundTerrainsLayer: PIXI.Container;
	airPocketsLayer: PIXI.Container;
	waterBorderLowLayer: PIXI.Container;
	hideSpacesLowerLayer: PIXI.Container;
	hideSpacesLowLayer: PIXI.Container;
	propsLayer: PIXI.Container;
	platformsLayer: PIXI.Container;
	currentsLayer: PIXI.Container;
	animalsLayer: PIXI.Container;
	animalsUiLayer: PIXI.Container;
	hideSpacesHighLayer: PIXI.Container;
	islandsLayer: PIXI.Container;
	waterBorderHighLayer: PIXI.Container;
	terrainsLayer: PIXI.Container;
	ceilingsLayer: PIXI.Container;
	shadowLayer: PIXI.Container;
	foodLayer: PIXI.Container;
}

export interface MapData {
	screenObjects: Record<string, DeeeepioMapScreenObject[] | undefined>;
	settings: { gravity: number };
	worldSize: { width: string; height: string };
}

export interface GameState {
	app: PIXI.Application | null;
	// eslint-disable-next-line @typescript-eslint/no-deprecated
	world: planck.World | null;
	map: MapData | null;
	zoom: number;
	mouseData: { clientX: number; clientY: number };
	layers: LayerRefs | null;
	myAnimals: Animal[];
	npcs: Animal[];
	foods: Food[];
	waterObjects: { x: number; y: number }[][];
	airPocketObjects: { x: number; y: number }[][];
	terrainPolygons: { x: number; y: number }[][];
	islandPolygons: { x: number; y: number }[][];
	waterBBoxes: { minX: number; minY: number; maxX: number; maxY: number }[];
	shadowSettings: { alpha: number; size: number };
	whirlPool: { rotation: number };
	habitats: (DeeeepioMapScreenObject & { points: [number, number][] })[];
}

export const gameState: GameState = {
	app: null,
	world: null,
	map: null,
	zoom: 8,
	mouseData: { clientX: 0, clientY: 0 },
	layers: null,
	myAnimals: [],
	npcs: [],
	foods: [],
	waterObjects: [],
	airPocketObjects: [],
	terrainPolygons: [],
	islandPolygons: [],
	waterBBoxes: [],
	shadowSettings: { alpha: 0, size: 0 },
	whirlPool: { rotation: 0 },
	habitats: [],
};
