import { loadAssets } from "../assetsloader";
import { loadMap, getShadowSize } from "../game-utils/maploader";
import { Animal } from "../objects/animal";
import { TICK_MS } from "../objects/constants";
import type { DeeeepioMapScreenObject } from "../types";
import { updateAnimalPhysics, updateAnimalRender } from "./animal-update";
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
	// Renderer runs at max device frame rate, physics is decoupled at ~30fps
	let physicsAccum = 0;
	let tickAge = 0;

	app.ticker.add((dt) => {
		const deltaMs = dt.deltaMS;

		tickAge += deltaMs;

		physicsAccum += deltaMs;
		while (physicsAccum >= TICK_MS) {
			physicsStep(TICK_MS);
			physicsAccum -= TICK_MS;
			tickAge = 0;
		}

		const t = Math.min(tickAge / TICK_MS, 1);
		renderStep(t);
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
	for (const a of s.myAnimals) {
		setupBoost(a);
	}

	function physicsStep(dt: number) {
		s.myAnimals.forEach((animal, index) => {
			updateAnimalPhysics(animal, true);
		});

		s.npcs.forEach((npc) => {
			updateAnimalPhysics(npc, false);
		});

		s.foods = s.foods
			.map((food) => {
				return updateFood(food);
			})
			.filter((food): food is NonNullable<typeof food> => food !== null);

		s.world!.step(dt / 1000, 8, 5);
		s.world!.clearForces();

		for (const animal of [...s.myAnimals, ...s.npcs]) {
			animal.interpolator.push({
				x: animal.animal.getPosition().x,
				y: animal.animal.getPosition().y,
				angle: animal.animal.getAngle(),
				vx: animal.animal.getLinearVelocity().x,
				vy: animal.animal.getLinearVelocity().y,
				angularVelocity: animal.animal.getAngularVelocity(),
			});
		}
	}

	function renderStep(t: number) {
		app.stage.position.set(app.screen.width / 2, app.screen.height / 2);
		app.stage.scale.set(s.zoom);

		const layers = s.layers!;
		layers.hideSpacesLowLayer.children.forEach((object: PIXI.ContainerChild & { animation?: string }) => {
			if (object.animation !== "whirlpool") return;
			object.angle = whirlPool.rotation;
		});
		layers.hideSpacesLowerLayer.children.forEach((object: PIXI.ContainerChild & { animation?: string }) => {
			if (object.animation !== "whirlpool") return;
			object.angle = whirlPool.rotation;
		});

		s.myAnimals.forEach((animal, index) => {
			updateAnimalRender(animal, true, index === 0, t);
		});

		s.npcs.forEach((npc) => {
			updateAnimalRender(npc, false, false, t);
		});
	}
}
