import animalConsts from "./consts/animals.json";

const baseScale = { x: 48, y: 68 };

export function calculateAssetSize(animalId: number) {
	const animal = animalConsts.find((a) => a.fishLevel === animalId);
	if (!animal) {
		throw new Error(`Could not find animal with id ${animalId}`);
	}
	const sx = baseScale.x * animal.sizeScale.x * animal.sizeMultiplier;
	const sy = baseScale.y * animal.sizeScale.y * animal.sizeMultiplier;
	return { planck: { width: sx / 20, height: sy / 20 }, pixi: { scale: sy / 3.8 / 680 / animal.sizeScale.y } };
}
