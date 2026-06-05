import { point2rad, clamp } from "../math-utils";
import type { Animal } from "../objects/animal";
import { boostPower } from "../objects/constants";
import { gameState } from "./game-state";
import * as TWEEN from "@tweenjs/tween.js";
import throttle from "lodash.throttle";
import * as planck from "planck";

export function initMouseTracking() {
	const s = gameState;
	document.addEventListener("mousemove", (event) => {
		s.mouseData.clientX = event.clientX;
		s.mouseData.clientY = event.clientY;
	});
}

export const setupBoost = (animal: Animal) => {
	const s = gameState;
	const app = s.app!;

	const throttledBoost = throttle(
		(event: { clientX: number; clientY: number }, animalInstance: Animal) => {
			const dpr = window.devicePixelRatio;
			const canvasMouseX = event.clientX * dpr;
			const canvasMouseY = event.clientY * dpr;
			const centerX = (animalInstance.pixiAnimal.x - app.stage.pivot.x) * s.zoom;
			const centerY = (animalInstance.pixiAnimal.y - app.stage.pivot.y) * s.zoom;
			const angle = point2rad(
				canvasMouseX - app.screen.width / 2,
				canvasMouseY - app.screen.height / 2,
				centerX,
				centerY,
			);

			const power = animalInstance.inWater ? boostPower.water : boostPower.air;
			const accelStrength = animalInstance.speedFac * power * 50.0;
			const accelDuration = 50;
			const boostDuration = 150;
			const recoverDuration = boostDuration * 2;

			animalInstance.boostForce = {
				x: Math.cos(angle) * accelStrength,
				y: Math.sin(angle) * accelStrength,
				remaining: accelDuration,
				duration: accelDuration,
			};

			const savedSpeedFac = animalInstance.speedFac;
			animalInstance.speedFac = savedSpeedFac * 0.15;
			const sf = { v: savedSpeedFac * 0.15 };
			const boostTween = new TWEEN.Tween(sf)
				.to({ v: savedSpeedFac }, recoverDuration)
				.easing(TWEEN.Easing.Quartic.In)
				.onUpdate(() => {
					animalInstance.speedFac = sf.v;
				})
				.start();
			function boost(time: number) {
				boostTween.update(time);
				requestAnimationFrame(boost);
			}
			requestAnimationFrame(boost);
			return true;
		},
		850,
		{ trailing: false },
	);
	const throttledLandhop = throttle(
		(event: { clientX: number; clientY: number }, animalInstance: Animal) => {
			const dpr = window.devicePixelRatio;
			const canvasMouseX = event.clientX * dpr;
			const canvasMouseY = event.clientY * dpr;
			const centerX = (animalInstance.pixiAnimal.x - app.stage.pivot.x) * s.zoom;
			const centerY = (animalInstance.pixiAnimal.y - app.stage.pivot.y) * s.zoom;
			const angle = point2rad(
				canvasMouseX - app.screen.width / 2,
				canvasMouseY - app.screen.height / 2,
				centerX,
				centerY,
			);

			const impulseStrength = animalInstance.speedFac * boostPower.land * 15.0;
			const accelDuration = 60;
			const boostDuration = 150;
			const recoverDuration = boostDuration * 2;

			animalInstance.boostForce = {
				x: Math.cos(angle) * impulseStrength,
				y: Math.sin(angle) * impulseStrength,
				remaining: accelDuration,
				duration: accelDuration,
			};

			const savedSpeedFac = animalInstance.speedFac;
			animalInstance.speedFac = savedSpeedFac * 0.15;
			const sf = { v: savedSpeedFac * 0.15 };
			const boostTween = new TWEEN.Tween(sf)
				.to({ v: savedSpeedFac }, recoverDuration)
				.easing(TWEEN.Easing.Quartic.In)
				.onUpdate(() => {
					animalInstance.speedFac = sf.v;
				})
				.start();
		},
		150,
		{ trailing: false },
	);

	app.canvas.addEventListener("mousedown", (event: Event) => {
		const mouseEvent = event as MouseEvent;
		if (mouseEvent.button === 0) {
			const myAnimal = animal.getState;

			if (myAnimal.animalData.hasSecondaryAbility) {
				myAnimal.chargedBoostStartTime = Date.now();
			}
		}
	});
	app.canvas.addEventListener("mouseup", (event: Event) => {
		const mouseEvent = event as MouseEvent;
		const myAnimal = animal.getState;

		if (mouseEvent.button === 2) {
			myAnimal.chargedBoostStartTime = null;
			return;
		}

		if (
			myAnimal.animalData.hasSecondaryAbility &&
			typeof myAnimal.chargedBoostStartTime === "number" &&
			Date.now() - myAnimal.chargedBoostStartTime > myAnimal.animalData.secondaryAbilityLoadTime
		) {
			myAnimal.useSecondaryAbility(throttledBoost.bind(null, mouseEvent, myAnimal));
		} else if (
			(myAnimal.animalData.hasSecondaryAbility &&
				typeof myAnimal.chargedBoostStartTime === "number" &&
				Date.now() - myAnimal.chargedBoostStartTime < myAnimal.animalData.secondaryAbilityLoadTime) ||
			!myAnimal.animalData.hasSecondaryAbility
		) {
			let landhop = false;

			if (!myAnimal.inWater) {
				const contact = [];
				for (let ce = myAnimal.animal.getContactList(); ce; ce = ce.next) {
					contact.push(ce);
				}
				try {
					if (
						contact.filter(
							(c: planck.ContactEdge) =>
								((c.other as planck.Body).getUserData() as { type?: string })?.type === "terrainTop",
						).length > 0
					) {
						landhop = true;
					}
				} catch (e) {
					console.error(e);
				}
			}

			if (landhop) {
				throttledLandhop(mouseEvent, myAnimal);
			} else if (!myAnimal.walking) {
				throttledBoost(mouseEvent, myAnimal);
			}
		}
		myAnimal.chargedBoostStartTime = null;
	});
	app.canvas.addEventListener("contextmenu", (event: Event) => {
		event.preventDefault();
		const myAnimal = animal.getState;
		myAnimal.chargedBoostStartTime = null;
	});
};

export function initZoomControls() {
	const s = gameState;
	const app = s.app!;

	app.canvas.addEventListener("wheel", (event: unknown) => {
		let newZoom = Math.sign((event as { wheelDelta: number }).wheelDelta) === 1 ? s.zoom * 1.2 : s.zoom / 1.2;
		newZoom = clamp(newZoom, 4, 16);
		const originalZoom = { z: s.zoom };
		const zoomTween = new TWEEN.Tween(originalZoom)
			.to({ z: newZoom }, 100)
			.easing(TWEEN.Easing.Quadratic.Out)
			.onUpdate(() => {
				s.zoom = originalZoom.z;
			})
			.start();
		function animate(time: number) {
			zoomTween.update(time);
			requestAnimationFrame(animate);
		}
		requestAnimationFrame(animate);
	});
}
