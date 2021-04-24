// import Loop from '../node_modules/rocket-boots-loop/src/Loop.js';
import Ship from './Ship.js';
import SpaceObject from './SpaceObject.js';
import Asteroid from './Asteroid.js';
import Sun from './Sun.js';
import sounds from './sounds.js';

import WebglpRenderer from './WebglpRenderer.js';
import Blast from './Blast.js';
import Fragment from './Fragment.js';

const NUM_OF_ASTEROIDS = 1000;
const MIN_ASTEROID_RADIUS = 200;
const MAX_ASTEROID_RADIUS = 350;
const MAX_SHIP_RADIUS = 800;
const TIME_SCALE = 1.;
const EXHAUST_WAIT = 80; // how many miliseconds between thrust/exhaust
const FRAGMENT_MASS_THRESHOLD = 5;
const PARTITION_GRID_SIZE = 80;

const MAX_ZOOM_DELTA = 600;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 5000;
const ZOOM_MULTIPLIER = .001;

let zoom = 20.;
let lastAsteroidCount = NUM_OF_ASTEROIDS;
let loop;
let isStarted = false;
let isDead = false;

const $ = (id) => document.getElementById(id);
const rand = (n = 1) => Math.random() * n;

const achievements = {};
const stats = {
	asteroidCount: 0,
	startTime: 0,
	msElapsed: 0,
	shotsCount: 0,
	fps: [],
	averageFps: 30,
};
const displayStats = {
	secondsElapsed: 0,
	asteroidsPerMinute: 0,
	shotsCount: 0,
	accuracy: 0,
	avgSpeed: 0,
	speed: 0,
	fps: 0,
};
const objects = [];
const effects = [];
const sun = setupSun();
const asteroids = setupAsteroids(sun);
const ship = setupShip(sun);
const renderer = new WebglpRenderer();

//------------------- DRAW

const draw = () => {
	renderer.draw(effects.concat(objects), ship.pos, zoom);
}

//---------------- Achievements

function achieve(what) {
	if (achievements[what]) { return; }
	achievements[what] = true;
	const elt = $(`ach-${what}`);
	if (elt) {
		elt.classList.add('unlocked');
	}
	if (Object.keys(achievements).length >= 5) {
		$('intro').classList.add('closed');
	}
}

//--------------- OBJECT MANAGEMENT

const removeDeletedObjects = (deleteIndices = []) => {
	for(let d = deleteIndices.length - 1; d >= 0; d--) {
		const i = deleteIndices[d];
		objects.splice(i, 1);
	}
};

function resetFarAwayObject(o, r) {
	if (o.pos.getDistance(sun.pos) > r) {
		putInRandomOrbit(o, sun);
		return true;
	}
	return false;
}

function moveEffects(t) {
	effects.forEach(function rotateEffects(o) {
		o.rotate(t);
		o.calcVertsWithRotation();
	})
}

function getPartitionGroupKey(boundingBoxX, boundingBoxY) {
	return Math.trunc(boundingBoxX / PARTITION_GRID_SIZE) + ',' +
		Math.trunc(boundingBoxY / PARTITION_GRID_SIZE);
}

function addToGridPartition(o, gridPartitions, partitionGroupKey) { // mutates
	if (o.gridPartitions.includes(partitionGroupKey)) {
		return;
	}
	o.gridPartitions.push(partitionGroupKey);
	if (gridPartitions[partitionGroupKey]) {
		gridPartitions[partitionGroupKey].push(o);
	} else {
		gridPartitions[partitionGroupKey] = [o];
	}
}

function addToSpacialPartitions(o, partitions) { // mutates
	// Axis / Quad Partitions
	o.partitionIndices = [];
	const inPositiveX = (o.boundingBox.max[0] >= 0);
	const inNegativeX = (o.boundingBox.min[0] < 0);
	const inPositiveY = (o.boundingBox.max[1] >= 0);
	const inNegativeY = (o.boundingBox.min[1] < 0);
	if (inPositiveX && inPositiveY) { o.partitionIndices.push(0); }
	if (inPositiveX && inNegativeY) { o.partitionIndices.push(1); }
	if (inNegativeX && inNegativeY) { o.partitionIndices.push(2); }
	if (inNegativeX && inPositiveY) { o.partitionIndices.push(3); }
	o.partitionIndices.forEach((i) => {
		partitions[i].push(o);
	});
}

function addToGridPartitions(o, gridPartitions) { // mutates
	const bb = o.boundingBox;
	// Grid partitions
	o.gridPartitions = [];
	// Top Left
	const p1 = getPartitionGroupKey(bb.min[0], bb.min[1]);
	addToGridPartition(o, gridPartitions, p1);
	// Top Right
	const p2 = getPartitionGroupKey(bb.max[0], bb.min[1]);
	addToGridPartition(o, gridPartitions, p2);
	// Bottom Right
	const p3 = getPartitionGroupKey(bb.max[0], bb.max[1]);
	addToGridPartition(o, gridPartitions, p3);
	// Bottom Left
	const p4 = getPartitionGroupKey(bb.min[0], bb.max[1]);
	addToGridPartition(o, gridPartitions, p4);
}

function collisionLoop(gridPartitions) {
	let asteroidCount = 0;
	const numOfObjects = objects.length;
	for(let i = 0; i < numOfObjects; i++) {
		const o = objects[i];
		if (o.delete) {	continue; }
		const isAsteroid = (o instanceof Asteroid);
		const isFullCheck = (!isAsteroid || Math.random() < 0.5);

		// o.partitionIndices.forEach((p) => {
		// 	const collideWith = (isFullCheck) ? partitions[p] : [sun];
		// 	o.collide(collideWith);
		// });

		o.gridPartitions.forEach((p) => {
			const collideWith = (isFullCheck) ? gridPartitions[p] : [sun];
			o.collide(collideWith);
		});

		// o.collide(objects);
		
		// if (o instanceof Asteroid) {
		// 	const collideWith = (Math.random() < 0.99) ? [sun] : objects;
		// 	o.collide(collideWith);
		// } else {
		// 	o.collide(objects);
		// }
		// o.collideChildren(o.children, objects); // TODO

		// o.repositionChildren();
		// o.clearHit();
		// o.checkHits(objects);
		if (isAsteroid) {
			asteroidCount++;
			resetFarAwayObject(o, MAX_ASTEROID_RADIUS);
		} else if (o instanceof Ship) {
			if (resetFarAwayObject(o, MAX_SHIP_RADIUS)) {
				sounds.jump();
			}
		}
	}
	return asteroidCount;
}

const objectLoop = (t) => {
	const deleteIndices = [];
	const numOfObjects = objects.length;
	// const partitions = [ // spacial partitions
	// 	[], // 0 = Top right: +x, +y
	// 	[], // 1 = Bottom right: +x, -y
	// 	[], // 2 = Bottom left: -x, -y 
	// 	[], // 3 = Top left: -x, +y
	// ];
	const gridPartitions = {};
	for(let i = 0; i < numOfObjects; i++) {
		const o = objects[i];
		// objects.forEach(function handleObject(o, i) {
		if (o.delete) {
			deleteIndices.push(i);
			continue;
		}
		if (o.ongoing) { o.ongoing(t); }
		o.rotate(t);
		o.recalcVertsWithRotation();
		// Don't do gravity on bullets (performance) or the sun (because it can't move)
		if (o.gravitate && !(o instanceof Sun)) {
			o.gravitate(t, [sun]);
			// o.gravitate(t, objects);
		}
		o.move(t);
		// Acts as a sort of broad phase collision detection
		addToGridPartitions(o, gridPartitions);
	}
	g.gridPartitions = gridPartitions; // TODO: Remove
	const asteroidCount = collisionLoop(gridPartitions);
	moveEffects(t);
	removeDeletedObjects(deleteIndices);
	return { asteroidCount };
};

//-------------------- OBJECT CREATION

function makeDecay(o, n = 8) {
	o.decayTime = n;
	o.ongoing = (t) => {
		o.decayTime -= t;
		if (o.decayTime < 0) { o.delete = true; }
	};
}

function die(reason) {
	isDead = true;
	ship.delete = true;
	makeFragments(ship, 10);
	makeBlast(ship.pos, ship.vel, 5);
	sounds.death();
	endGame(reason);
}

function destroy(o) {
	o.delete = true;
	if (o.mass > FRAGMENT_MASS_THRESHOLD) {
		makeFragments(o, 4);
	}
	makeBlast(o.pos, o.vel);
	sounds.explode();
}

const makeBullet = (ship, bulletPower) => {
	const baseVerts = [
		[0, .2, 0],
		[-.1, -.1, 0],
		[0, -.2, 0],
		[.1, -.1, 0],
	];
	const b = new SpaceObject(baseVerts);
	b.rotation = ship.rotation;
	const facing = ship.getFacingUnitVector().multiply(-1);
	b.pos.set(ship.pos).add(facing.getMultiply(ship.shipScale));
	b.vel.set(ship.vel).add(facing.getMultiply(bulletPower));
	b.mass *= 0.5;
	makeDecay(b, 10);
	b.damage = (dmg, objHit) => {
		b.baseColor[0] = .9; // red-ify the richoceting bullets
		// console.log(dmg / 10);
		b.decayTime *= 0.5;
		if (objHit instanceof Asteroid) {
			destroy(objHit);
		} else if (objHit instanceof Fragment) {
			destroy(objHit);
		} else if (objHit instanceof Ship) {
			die('bullet');
		}
	};
	b.gravitate = null; // Don't apply gravity to bullets
	objects.push(b);
};

function makeBlast(pos, vel, scale = 1) {
	const b = new Blast(pos, vel, [1., 0.5, 0.], .2 * scale, 8);
	const b2 = new Blast(pos, vel, [1., 1., 0.], 0.05 * scale, 3);
	objects.push(b);
	objects.push(b2);
}

function makeExhaust() {
	const r = 0.07 + rand(.05);
	const baseVerts = SpaceObject.getRegularPolygonVerts(3, r);
	const p = new SpaceObject(baseVerts);
	p.baseColor = [.5, .3, .5];
	p.rotation = rand(Math.PI * 2);
	const facing = ship.getFacingUnitVector();
	p.pos.set(ship.pos).add(facing.getMultiply(ship.shipScale * 0.5));
	p.vel.set(ship.vel).add(facing.getMultiply(14.));
	makeDecay(p, 10);
	p.gravitate = null; // Don't apply gravity to exhaust
	objects.push(p);
}

function makeFragment(o, n) {
	const f = new Fragment(o, n);
	f.damage = (dmg, objHit) => {
		if (objHit === sun) {
			f.delete = true;
		}
	};
	makeDecay(f, 30);
	giveSpin(f);
	objects.push(f);
}

function makeFragments(o, extra = 4) {
	const n = 2 + Math.floor(rand(extra));
	for(let i = 0; i < n; i++) { makeFragment(o, n); }
}

function setupShip(sun) {
	const ship = new Ship();
	ship.pos.set({ x: MIN_ASTEROID_RADIUS, y: 0 });
	ship.setOrbitalVelocity(sun);
	ship.damage = (dmg, objHit) => {
		if (objHit === sun) {
			die('sun');
		}
	};
	objects.push(ship);
	return ship;
}

function putInRandomOrbit(o, bigObj) {
	const range = MAX_ASTEROID_RADIUS - MIN_ASTEROID_RADIUS;
	const r = MIN_ASTEROID_RADIUS + rand(range);
	const theta = rand(Math.PI * 2);
	o.pos.setByPolarCoords(r, theta);
	o.setOrbitalVelocity(bigObj);
	giveSpin(o);
}

function giveSpin(o, n = .3) {
	o.rotVel = rand(n) - rand(n);
}

function setupAsteroids(sun) {
	// const baseVerts = [
	// 	[0, .4, 0],
	// 	[-.2, -.2, 0],
	// 	[.2, -.2, 0],
	// ];
	// let o = new SpaceObject(baseVerts);
	// o.pos.set({ x: 0, y: 0 });
	// o.vel.set({ x: 0, y: 0.1 });
	// objects.push(o);

	// const randVert = () => Math.round((Math.random() * 4 - 2) * 1000)/1000;

	for(let i = 0; i < NUM_OF_ASTEROIDS; i++) {
		const o = new Asteroid();
		putInRandomOrbit(o, sun);
		o.damage = (dmg, objHit) => {
			if (objHit === sun) {
				putInRandomOrbit(o, sun);
			}
		};
		objects.push(o);
	}
};

function makeOuterSun(s, r, color) {
	const baseVerts = SpaceObject.getRegularPolygonVerts(s, r);
	const outerSun = new SpaceObject(baseVerts);
	outerSun.baseColor = color;
	outerSun.mass = 0;
	outerSun.vel = null;
	outerSun.move = () => {};
	outerSun.collide = () => {};
	outerSun.gravitate = null;
	giveSpin(outerSun, .1);
	effects.push(outerSun);
}

function setupSun() {
	const sun = new Sun();
	const color = sun.baseColor.map((c) => Math.max(0, c - 0.3));
	const r = sun.r * 1.1;
	[8,8,4,4,4,3].forEach((s) => makeOuterSun(s, r, color));
	// makeOuterSun(8, r, color);
	// makeOuterSun(8, r, color);
	// makeOuterSun(3, r, color);
	// makeOuterSun(4, r, color);
	objects.push(sun);
	return sun;
}

function roundOneDecimal(n) { return Math.round(10 * n) / 10; }

function calcStats(c) {
	stats.asteroidCount = NUM_OF_ASTEROIDS - c;
	if (!isDead) {
		stats.msElapsed = (new Date()) - stats.startTime;
	}
	// console.log(stats.fps, stats.averageFps);
	// stats.averageFps = Math.min(1000, (stats.averageFps + stats.fps) / 2);
	displayStats.secondsElapsed = Math.round(stats.msElapsed / 1000);		
	displayStats.asteroidsPerMinute = roundOneDecimal((stats.asteroidCount / (stats.msElapsed / 60000)));
	displayStats.shotsCount = stats.shotsCount;
	displayStats.accuracy = roundOneDecimal((100 * (stats.asteroidCount / stats.shotsCount)));
	displayStats.avgSpeed = 0;
	displayStats.speed = Math.round(ship.vel.getMagnitude());
	displayStats.fps = Math.round(stats.fps.reduce((min, fps) => Math.min(min, fps)));
}

function drawDom(c, countElt) {
	// if (lastAsteroidCount === c) { return; }
	countElt.textContent = c;
	lastAsteroidCount = c;
	if (c === 0) {
		$('win').style.display = 'block';
	}
	calcStats(c);
	Object.keys(displayStats).forEach((statName) => {
		$(statName).textContent = displayStats[statName];
	});
}

//--------------------------------------------------- Game Controls

function trackFps(dt) {
	const fps = 1/dt;
	if (stats.fps.length > 5) {
		stats.fps.shift();
	}
	stats.fps.push(fps);
	if (fps < 5) {	console.log(fps); }
	else if (fps < 10) {	console.log('< 10 fps'); }
	else if (fps < 20) {	console.log('< 20 fps'); }
	else if (fps < 30) { console.log('< 30 fps'); }
	else if (fps >= 60) { console.log('60+ fps'); }
}

const setupLoop = (ship, countElt) => {
	let t = 0;
	let lastExhaustTime = 0;
	loop = (dtOverride) => {
		window.requestAnimationFrame(function handleFrame(now) {
			const dt = (dtOverride === undefined) ? ((now - t) / 1000.) * TIME_SCALE : dtOverride;
			trackFps(dt);
			if (ship.engaged && (now - lastExhaustTime) > EXHAUST_WAIT) {
				makeExhaust();
				lastExhaustTime = now;
			}
			const { asteroidCount } = objectLoop(dt);
			drawDom(asteroidCount, countElt);
			draw();
			t = now;
			loop();	
		});
	};
	objectLoop(0);
	draw();
};

function startLoop() {
	if (isStarted) { return; }
	isStarted = true;
	$('main').classList.add('go');
	achieve('start');
	loop(0);
	stats.startTime = new Date();
}

function endGame(reason = 'sun') { // Note: doesn't actually stop the loop
	$('main').classList.remove('go');
	if (isDead) {
		$('intro').classList.add('closed');
		$('dead').classList.remove('closed');
		$(reason).style.display = 'block';
	}
}

const getMousePosition = (e) => {
	// fix for Chrome
	const eFixed = (e.type.startsWith('touch')) ? e.targetTouches[0] : e;
	return [eFixed.pageX, eFixed.pageY];
}

const setupInput = (canvas, ship) => {
	const canvasSize = [canvas.width, canvas.height];
	const thrust = () => {
		if (ship.engaged) return;
		ship.engage();
		sounds.thrust();
		makeExhaust();
		achieve('thrust');
	};
	const shoot = () => {
		const bulletPower = ship.fire();
		makeBullet(ship, bulletPower);
		sounds.gun();
		achieve('shoot');
		stats.shotsCount += 1;
	};
	window.addEventListener('wheel', (e) => {
		// control speed based on current zoom, throttle the speed
		const zoomSpeed = Math.min(MAX_ZOOM_DELTA, Math.abs(e.deltaY)) * ZOOM_MULTIPLIER * zoom;
		const zoomDir = (e.deltaY < 0 ? -1 : 1);
		// cap the zoom
		zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + zoomDir * zoomSpeed));
		// console.log(zoom);
		if (!isStarted) { draw(); }
		achieve('zoom');
	});
	window.addEventListener('keydown', (e) => {
		switch (e.key.toUpperCase()) {
			// case 'ESCAPE': { endGame(); } break;
			case 'W': { thrust(); } break;
		}
		// console.log(e.key);
	});
	window.addEventListener('keyup', (e) => {
		switch (e.key.toUpperCase()) {
			case 'W': { ship.disengage(); } break;
			case ' ': { shoot(); } break;
		}
	});
	window.oncontextmenu = (e) => e.preventDefault();
	canvas.onmousedown = canvas.ontouchstart = (e) => {
		if (isDead) { return; }
		if (e.which === 3) { thrust(); }
	};
	canvas.onmouseup = canvas.ontouchend = (e) => {
		if (isDead) { return; }
		if (!isStarted) {
			startLoop();
			return;
		}
		if (e.which === 3) {
			ship.disengage();
			return;
		}
		shoot();
	};
	canvas.onmousemove = canvas.ontouchmove = (e) => {
		if (isDead) { return; }
		if (!isStarted) { return; }
		const fixedCurrentMousePos = getMousePosition(e).map((n, i) => (
			(n - (canvasSize[i] / 2)) * (i === 1 ? -1 : 1)
		));
		const theta = Math.atan2(fixedCurrentMousePos[1], fixedCurrentMousePos[0]);
		ship.rotation = theta - Math.PI/2;
		achieve('rotate');
	};
	document.addEventListener('click', (e) => {
		// console.log(e.target, e);
		if (e.target.id === 'restart') {
			location.reload();
		}
	});
};

// Initialize renderer, input, loop
const init = async () => {
	const { canvas } = await renderer.init();
	window.g.glp = renderer.glp;
	setupInput(canvas, ship, sun);
	setupLoop(ship, $('count'));
};

document.addEventListener('DOMContentLoaded', init);

const game = window.g = { SpaceObject, objects, effects, ship, sun };

export default game;
