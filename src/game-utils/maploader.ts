import animals from "./consts/animals.json";
import hideSpaces from "./consts/hidespaces.json";
import props from "./consts/props.json";

/**
 * Load the map from a JSON object.
 *
 * @param {object} json - The JSON object containing the map data.
 *
 * @typedef {object} root
 * @property {screenObjects[]} screenObjects
 * @property {settings} settings
 * @property {worldSize} worldSize
 *
 * @typedef {object} screenObjects
 * @property {mapObject[]} currents
 * @property {mapObject[]} ceilings
 * @property {mapObject[]} terrains
 * @property {mapObject[]} islands
 * @property {mapObject[]} props
 * @property {mapObject[]} platforms
 * @property {mapObject[]} hide-spaces
 * @property {mapObject[]} air-pockets
 * @property {mapObject[]} background-terrains
 * @property {mapObject[]} water
 * @property {mapObject[]} sky
 *
 * @typedef {object} mapObject
 * @property {number} id
 * @property {string} type
 * @property {string} layerId
 * @property {points[]} points
 * @property {object} settings
 * @property {number[]} colors
 *
 * @typedef {object} points
 * @property {number} x
 * @property {number} y
 *
 * @typedef {object} settings
 * @property {number} gravity
 *
 * @typedef {object} worldSize
 * @property {string} width
 * @property {string} height
 * @returns {{ screenObjects: screenObjects; settings: settings; worldSize: worldSize }} The parsed map data.
 */
interface MapDataParsed {
	screenObjects: { layerId: string; [key: string]: unknown }[];
	settings: { gravity?: number; [key: string]: unknown };
	worldSize: { width: string; height: string };
	[key: string]: unknown;
}

export function loadMap(json: Record<string, unknown>) {
	if (!json.data) return false;
	const data = JSON.parse(json.data as string) as MapDataParsed;
	data.screenObjects = data.screenObjects.filter((l) => !["animals", "triggers", "currents"].includes(l.layerId));
	const tempObj: Record<string, unknown[]> = {};
	data.screenObjects.forEach((l) => {
		if (!tempObj[l.layerId]) tempObj[l.layerId] = [];
		tempObj[l.layerId].push(l);
	});
	data.screenObjects = tempObj as unknown as MapDataParsed["screenObjects"];
	if (!data.settings) {
		data.settings = {};
	}
	if (!data.settings.gravity) {
		data.settings.gravity = 9.8;
	}
	// ["sky", "water", "air-pockets", "background-terrains", "platforms", "islands", "terrains", "ceilings"].forEach((l) => {
	// 	var newShapesList = [];
	// 	if (!data.screenObjects[l]) return;
	// 	data.screenObjects[l]?.forEach((shape) => {
	// 		const poly = {
	// 			type: "Feature",
	// 			geometry: {
	// 				type: "Polygon",
	// 				coordinates: [shape.points.map((p) => [p.x, p.y])]
	// 			}
	// 		};
	// 		const splitPoly = simplepolygon(poly);
	// 		splitPoly.features.forEach((feature) => {
	// 			newShapesList.push({
	// 				...shape,
	// 				points: feature.geometry.coordinates[0].map((p) => ({ x: p[0], y: p[1] }))
	// 			});
	// 		});
	// 	});
	// 	data.screenObjects[l] = newShapesList;
	// });
	return data as unknown as Record<string, unknown>;
}

export function getHidespaceById(id: number) {
	return hideSpaces.find((h) => h.id === id);
}
export function getPropById(id: number) {
	return props.find((p) => p.id === id);
}

export function makeBrighter(color: number, brightnessFactor: number) {
	const hexString = `00000${(0 | color).toString(16)}`.slice(-6);
	const r = Number.parseInt(hexString.slice(0, 2), 16);
	const o = Number.parseInt(hexString.slice(2, 4), 16);
	const l = Number.parseInt(hexString.slice(4, 6), 16);
	let c = brightnessFactor;

	if (r * brightnessFactor > 280) {
		const a = 280 / r;
		if (a < c) {
			c = a;
		}
	}

	if (o * brightnessFactor > 280) {
		const a = 280 / o;
		if (a < c) {
			c = a;
		}
	}

	if (l * brightnessFactor > 280) {
		const a = 280 / l;
		if (a < c) {
			c = a;
		}
	}

	const newR = r * c;
	const newO = o * c;
	const newL = l * c;
	const [red, green, blue] = redistributeRgb(newR, newO, newL);

	const newHexString = `#${`0${Math.floor(red).toString(16)}`.slice(-2)}${`0${Math.floor(green).toString(16)}`.slice(-2)}${`0${Math.floor(
		blue,
	).toString(16)}`.slice(-2)}`;

	return stringColorToHex(newHexString);
}
function redistributeRgb(red: number, green: number, blue: number) {
	const maxColorValue = 255.999;
	const maxColor = Math.max(red, green, blue);

	if (maxColor <= maxColorValue) {
		return [red, green, blue];
	}

	const sum = red + green + blue;

	if (sum >= 3 * maxColorValue) {
		return [maxColorValue, maxColorValue, maxColorValue];
	}

	const ratio = (3 * maxColorValue - sum) / (3 * maxColor - sum);
	const offset = maxColorValue - ratio * maxColor;

	return [offset + ratio * red, offset + ratio * green, offset + ratio * blue];
}
function stringColorToHex(color: string | number) {
	return typeof color === "string" ? Number.parseInt(color.slice(1), 16) : color;
}

export function isClockwise(points: { x: number; y: number }[]) {
	let total = 0;
	for (let i = 0; i < points.length; i++) {
		// Get the current and next point
		const currentPoint = points[i];
		const nextPoint = points[(i + 1) % points.length];

		// Calculate the cross product of the points
		total += (nextPoint.x - currentPoint.x) * (nextPoint.y + currentPoint.y);
	}
	return total < 0;
}

export function getBiomes(n: number) {
	const habitats = [
		"reef", // 64
		"salt", // 32
		"fresh", // 16
		"deep", // 8
		"shallow", // 4
		"warm", // 2
		"cold", // 1
	];
	return n
		.toString(2)
		.slice(-7)
		.padStart(7, "0")
		.split("")
		.map((e: string, i: number) => (Number.parseInt(e) === 0 ? null : habitats[i]))
		.reduce((p: string[], c: string | null) => (c == null ? p : p.concat(c)), []);
}

export function getAnimalById(id: number) {
	return animals.find((a) => a.fishLevel === id);
}

// Doesn't account for octopus ink
// Octopus ink has shadowSize of 350
export function getShadowSize(animalId: number) {
	const animal = getAnimalById(animalId);
	if (!animal) return 1200;
	const habitats = getBiomes(animal.habitat);

	const livesInDeep = habitats.includes("deep");
	const livesInShallow = habitats.includes("shallow");
	const livesInFresh = habitats.includes("fresh");
	const livesInWarmSalt = habitats.includes("warm") && habitats.includes("salt");

	if (["blindcavefish", "olm"].includes(animal.name)) {
		return 450;
	}
	if (animal.name === "ghost") {
		return 1750;
	}
	if (livesInDeep) {
		if (!livesInShallow) {
			return 1750;
		}
		if (livesInFresh && !livesInWarmSalt) {
			return 1750;
		}
		return 1200;
	}
	return 1200;
}
