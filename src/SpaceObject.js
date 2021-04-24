import DynamicPolygon from './DynamicPolygon.js';
import physics from '../../../rocket-boots-repos/physics/src/physics.js';
// import physics from '../node_modules/rocket-boots-physics/src/physics.js';

// import { Coords } from 'rocket-boots-coords';
// physics.Coords = Coords;

physics.bigG = .000001;

/** An object that exists in 2D space, an extension of a polygon but with physics */
class SpaceObject extends DynamicPolygon {
	constructor(baseVerts = [], baseColorParam) {
		const c = () => Math.random() * 0.2 + 0.4;
		const baseColor = baseColorParam || [c(), c(), c()];
		super({ baseVerts, baseColor });
		
		this.hit = false;
		physics.physical(this, { mass: 10. });
		
		this.calcMass();
		
		this.Coords = physics.Coords;
	}

	calcMass() {
		this.mass = Math.PI * Math.pow((this.innerRadius + this.r) / 2, 2) * 50;
		// console.log('mass', this.mass);
	}

	getColor(v, bv, i) {
		const bc = this.baseColor;
		return [
			this.hit ? bc[0] + .1 : bc[0],
			this.isColliding ? bc[1] + .1 : bc[1],
			bc[2],
		];
	}

	// clearHit() {
	// 	this.hit = false;
	// 	return this;
	// }

	// checkHits(objects) {
	// 	objects.forEach((b) => this.checkHit(b));
	// }

	// checkHit(obj) {
	// 	if (obj === this) { return; } // can't hit self
	// 	if (this.objectInside(obj)) {
	// 		this.hit = true;
	// 	}		
	// }

	setOrbitalVelocity(bigObj) {
		this.vel.set(physics.getOrbitalVelocity(this, bigObj));
	}
}

export default SpaceObject;
