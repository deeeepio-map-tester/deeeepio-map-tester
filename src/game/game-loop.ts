import { loadAssets } from "../assetsloader";
import { loadMap, getShadowSize } from "../game-utils/maploader";
import { Animal } from "../objects/animal";
import type { DeeeepioMapScreenObject } from "../types";
import { updateAnimal } from "./animal-update";
import { updateFood } from "./food-update";
import { gameState, type MapData } from "./game-state";
import { initMouseTracking, setupBoost, initZoomControls } from "./input";
import { createLayers } from "./layer-manager";
import { renderMap } from "./map-renderer";
import { setShadowSize as setShadow } from "./shadow";
import { initWorld } from "./world-init";
import * as TWEEN from "@tweenjs/tween.js";
import * as PIXI from "pixi.js";

export async function initGame() {
	const s = gameState;

	// Load map and assets
	const map = loadMap(window.mapData) as unknown as MapData;
	console.log(map);
	s.map = map;

	await loadAssets();

	// Initialize physics world
	s.world = initWorld(map);

	// Create game canvas
	const app = new PIXI.Application();
	await app.init({
		backgroundColor: 0x1f2937,
		backgroundAlpha: 0,
		resizeTo: document.querySelector("main > div.game") as HTMLDivElement,
		resolution: window.devicePixelRatio,
		antialias: true,
		clearBeforeRender: true,
	});
	(document.querySelector("main > div.game") as HTMLDivElement).appendChild(app.canvas);
	s.app = app;

	// Create layers
	const layers = createLayers(app);

	// Setup game ticker
	app.ticker.add((dt) => {
		update(dt);
	});

	// one-time rendering
	// Render map
	renderMap(map, layers);

	// Shadow setup
	layers.shadowLayer.alpha = 0;
	setShadow(getShadowSize(0), s.zoom, layers.shadowLayer);

	// Get habitats
	s.habitats = (map.screenObjects.habitats?.map((h: DeeeepioMapScreenObject) => ({
		...h,
		points: h.points.map((p) => [p.x, p.y]),
	})) || []) as (DeeeepioMapScreenObject & { points: [number, number][] })[];

	// Whirlpool animation
	const whirlPool = s.whirlPool;
	const whirlPoolTween = new TWEEN.Tween(whirlPool)
		.to({ rotation: 360 }, 5000)
		.easing(TWEEN.Easing.Sinusoidal.InOut)
		.repeat(Number.POSITIVE_INFINITY)
		.start();
	(() => {
		const animate = (time: number) => {
			whirlPoolTween.update(time);
			requestAnimationFrame(animate);
		};
		requestAnimationFrame(animate);
	})();

	// Render player.pixi
	s.myAnimals.push(new Animal(s.world, 11, layers.animalsLayer, layers.animalsUiLayer, 1, 1, window.playerName));
	// for (var i = 0; i < 100; i++) {
	// setTimeout(() => {
	// var animal = new Animal(s.world, 11, layers.animalsLayer, layers.animalsUiLayer, 1, 1, window.playerName);
	// s.myAnimals.push(animal);
	// setupBoost(animal);
	// }, 500 * i);
	// }

	// Initialize input
	initMouseTracking();
	initZoomControls();
	s.myAnimals.forEach((a: Animal) => setupBoost(a));

	function update({ deltaTime: dt }: PIXI.Ticker) {
		app.stage.position.set(window.innerWidth / 2, window.innerHeight / 2);
		app.stage.scale.set(s.zoom);

		layers.hideSpacesLowLayer.children.forEach((object: PIXI.ContainerChild & { animation?: string }) => {
			if (object.animation !== "whirlpool") return;
			object.angle = whirlPool.rotation;
		});
		layers.hideSpacesLowerLayer.children.forEach((object: PIXI.ContainerChild & { animation?: string }) => {
			if (object.animation !== "whirlpool") return;
			object.angle = whirlPool.rotation;
		});

		s.myAnimals.forEach((animal, index) => {
			updateAnimal(animal, true, index === 0);
		});

		s.npcs.forEach((npc) => {
			updateAnimal(npc, false);
		});

		s.foods = s.foods
			.map((food) => {
				return updateFood(food);
			})
			.filter((food): food is NonNullable<typeof food> => food !== null);

		s.world!.step((app.ticker.elapsedMS / 1000) * dt, 8, 5);
		s.world!.clearForces();
	}
}
