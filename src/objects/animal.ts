import { chargedBoost as defaultChargedBoost } from "../animal-abilities/default";
import { chargedBoost as killerwhaleChargedBoost } from "../animal-abilities/killerwhale";
import { calculateAssetSize } from "../game-utils/animal-sizing";
import animals from "../game-utils/consts/animals.json";
import { BodyInterpolator } from "../game/interpolator";
import { makeHumanReadableNumber } from "../math-utils";
import type { AnimalAbilities } from "../types";
import { linearDampingFactor, planckDownscaleFactor, speedRatio } from "./constants";
import { Assets, Container, Graphics, Sprite, Text } from "pixi.js";
import { type Body, Box, Vec2, type World, type Fixture } from "planck";

const abilityMap: Record<string, AnimalAbilities> = {
	default: { chargedBoost: defaultChargedBoost },
	killerwhale: { chargedBoost: killerwhaleChargedBoost },
};

function getAbilityModule(name: string): AnimalAbilities {
	return abilityMap[name] ?? abilityMap.default;
}

export class Animal {
	animalData: {
		name: string;
		size?: { x: number; y: number };
		mass: number;
		boosts: number;
		level: number;
		fishLevel: number;
		oxygenTime: number;
		oxygenTimeMs: number;
		temperatureTime: number;
		temperatureTimeMs: number;
		pressureTime: number;
		pressureTimeMs: number;
		salinityTime: number;
		salinityTimeMs: number;
		speedMultiplier: number;
		walkSpeedMultiplier: number;
		jumpForceMultiplier: number;
		sizeMultiplier: number;
		sizeScale: { x: number; y: number };
		damageMultiplier: number;
		healthMultiplier: number;
		damageBlock: number;
		damageReflection: number;
		bleedReduction: number;
		armorPenetration: number;
		poisonResistance: number;
		permanentEffects: number;
		canFly: boolean;
		canSwim: boolean;
		canStand: boolean;
		canClimb: boolean;
		breathesInAir: boolean;
		breathesInWater: boolean;
		poisonResistant: boolean;
		habitat: number;
		biomes: number[];
		collisionCategory: number;
		collisionMask: number;
		chooseable: boolean;
		hasSecondaryAbility: boolean;
		secondaryAbilityLoadTime: number;
		hasScalingBoost: boolean;
		ungrabbable: boolean;
		canDig: boolean;
		canWalkUnderwater: boolean;
		hasWalkingAbility: boolean;
		walkingAbilityLoadTime: number;
	};
	animal: Body;
	animalSize: { planck: { width: number; height: number }; pixi: { scale: number } };
	fixture: Fixture;
	scale: number;
	pixiAnimal: Container;
	pixiAnimalSprite: Sprite;
	pixiAnimalUi: Container;
	inWater: boolean;
	prevInWater: boolean;
	doApplyForce: boolean;
	oldDoApplyForce: boolean;
	direction: number;
	walking: boolean;
	speedFac: number;
	interpolator: BodyInterpolator;

	xp: number;
	xpText: Text | undefined;

	chargedBoostStartTime: number | null;
	chargedBoostBar?: Graphics;
	chargedBoostBarInner?: Graphics;
	chargedBoostPercent: number | null;

	abilities: AnimalAbilities;

	grabHookVisible: boolean;
	grabHook: Sprite;
	boostForce: { x: number; y: number; remaining: number; duration: number };
	sustainedForce: { x: number; y: number; remaining: number; duration: number };

	constructor(
		// eslint-disable-next-line @typescript-eslint/no-deprecated
		world: World,
		fishLevelId: number,
		pixiAnimalsLayer: Container,
		pixiAnimalsUiLayer: Container,
		x: number,
		y: number,
		name: string,
	) {
		this.animalData = animals.find((a) => a.fishLevel === fishLevelId) || animals[0];

		this.abilities = getAbilityModule(this.animalData.name);

		// initialize values
		this.xp = 0;

		// Create Planck.js body
		this.animal = world.createBody({
			type: "dynamic",
			position: new Vec2(x, y),
			angle: 0,
			linearDamping: linearDampingFactor,
			angularDamping: 0.01,
			allowSleep: false,
			awake: true,
			gravityScale: 0,
			bullet: true,
		});
		this.animalSize = calculateAssetSize(fishLevelId);

		this.scale = 1;
		this.fixture = this.animal.createFixture(
			new Box(
				this.animalSize.planck.width / planckDownscaleFactor,
				this.animalSize.planck.height / planckDownscaleFactor,
			),
			{ density: 0.1, friction: 0.7, restitution: 0 },
		);
		this.animal.setMassData({ mass: 1, center: new Vec2(0, 0), I: 0 });
		this.animal.setUserData({ increaseXp: this.increaseXp.bind(this) });

		// Create instance in PIXI
		this.pixiAnimal = new Container();
		this.pixiAnimalSprite = new Sprite(Assets.get(`${this.animalData.name}.png`));
		this.pixiAnimalSprite.anchor.set(0.5);
		this.pixiAnimal.position.set(
			this.animal.getPosition().x * planckDownscaleFactor,
			this.animal.getPosition().y * planckDownscaleFactor,
		);
		this.pixiAnimal.scale.set(this.animalSize.pixi.scale);
		this.pixiAnimal.addChild(this.pixiAnimalSprite);

		// Grab hook
		this.grabHookVisible = false;
		this.grabHook = new Sprite(Assets.get("hook.png"));
		this.grabHook.anchor.set(0.5, 0.5);
		this.grabHook.scale.set(2 / this.animalData.sizeMultiplier);
		this.grabHook.position.set(0, -150 - 120 / this.animalData.sizeMultiplier);
		this.grabHook.alpha = 0;
		this.pixiAnimal.addChild(this.grabHook);

		this.pixiAnimalUi = new Container();
		// Add name
		if (name) {
			const nameText = new Text({
				text: name,
				style: { fontFamily: "Quicksand", fontSize: 20, fill: 0xffffff, align: "center" },
			});
			nameText.anchor.set(0.5);
			this.pixiAnimalUi.addChild(nameText);

			this.xpText = new Text({
				text: makeHumanReadableNumber(this.xp),
				style: { fontFamily: "Quicksand", fontSize: 14, fill: 0xffffff, align: "center" },
			});
			this.xpText.position.set(0, 20);
			this.xpText.anchor.set(0.5);
			this.pixiAnimalUi.addChild(this.xpText);
		}

		// Add boost bar
		if (this.animalData.hasSecondaryAbility) {
			this.chargedBoostBar = new Graphics();
			this.chargedBoostBar.rect(0, 0, 16, 72).fill({ color: 0x000000, alpha: 0.3 });

			this.chargedBoostBar.position.set(
				50 + 40 * (this.animalData.sizeMultiplier - 1),
				34 + 40 * (this.animalData.sizeMultiplier - 1),
			);

			this.chargedBoostBarInner = new Graphics();
			this.chargedBoostBarInner.rect(2, 2, 12, 68).fill({ color: 0x00edff, alpha: 0.7 });

			this.chargedBoostBar.alpha = 0;

			this.chargedBoostBar.addChild(this.chargedBoostBarInner);
			this.pixiAnimalUi.addChild(this.chargedBoostBar);
		}

		pixiAnimalsUiLayer.addChild(this.pixiAnimalUi);
		pixiAnimalsLayer.addChild(this.pixiAnimal);

		this.inWater = false;
		this.prevInWater = false;

		this.doApplyForce = true;
		this.oldDoApplyForce = true;
		this.direction = 0;

		this.walking = false;

		this.speedFac = linearDampingFactor * speedRatio;

		this.interpolator = new BodyInterpolator({
			x: this.animal.getPosition().x,
			y: this.animal.getPosition().y,
			angle: this.animal.getAngle(),
			vx: this.animal.getLinearVelocity().x,
			vy: this.animal.getLinearVelocity().y,
			angularVelocity: this.animal.getAngularVelocity(),
		});

		this.chargedBoostStartTime = Number.POSITIVE_INFINITY;
		this.chargedBoostPercent = 0;
		this.boostForce = { x: 0, y: 0, remaining: 0, duration: 1 };
		this.sustainedForce = { x: 0, y: 0, remaining: 0, duration: 1 };
	}

	get getState() {
		return this;
	}

	increaseXp(amount: number) {
		this.xp += amount;
		if (this.xpText) this.xpText.text = makeHumanReadableNumber(this.xp);
	}

	updateScale() {
		this.animal.destroyFixture(this.fixture);
		this.fixture = this.animal.createFixture(
			new Box(
				(this.animalSize.planck.width / planckDownscaleFactor) * this.scale,
				(this.animalSize.planck.height / planckDownscaleFactor) * this.scale,
			),
			{ density: 0.1, friction: 0.7, restitution: 0 },
		);
	}

	updateChargedBoostPercent(percent: number | null) {
		if (!this.chargedBoostBar) return;

		if (this.chargedBoostPercent !== percent) {
			if (percent === null || percent === 0) {
				this.chargedBoostBar.alpha = 0;
			} else if (this.chargedBoostBarInner) {
				this.chargedBoostBar.alpha = 1;
				const targetColor = percent === 1 ? 0x05ff00 : 0x00edff;
				if (this.chargedBoostBarInner.fillStyle.color !== targetColor) {
					this.chargedBoostBarInner.clear();
					this.chargedBoostBarInner.rect(2, 2, 12, 68).fill({ color: targetColor, alpha: 0.7 });
				}
				this.chargedBoostBarInner.scale.set(1, percent);
				this.chargedBoostBarInner.position.set(0, 68 * (1 - percent));
				this.chargedBoostBar.position.set(
					50 + 40 * (this.animalData.sizeMultiplier - 1),
					34 + 40 * (this.animalData.sizeMultiplier - 1),
				);
			}
			this.chargedBoostPercent = percent;
		}
	}

	useSecondaryAbility(dashBoost: () => void) {
		if (this.animalData.hasSecondaryAbility) {
			this.abilities.chargedBoost(this, dashBoost);
		}
	}
}
