import Polygon from './Polygon.js';

/** A polygon that can be colored, rotated, and drawn with the WebglpRenderer */
class DynamicPolygon extends Polygon {
	constructor(options = {}) {
		super(options.verts);
		// ^ Sets this.verts
		this.baseVerts = [...options.baseVerts];
		this.baseColor = options.baseColor ? [...options.baseColor] : [1., 1., 1.];
		this.vc = null; // Float32Array of verts with color - set in calc
		this.outerRadius = 0;
		this.innerRadius = 0; // currently used for collisions
		this.rotation = 0;
		this.facingRotationOffset = 0;
		this.pos = { x: 0, y: 0, z: 0 };
		this.boundingBox = {
			min: [0, 0, 0], // x, y, z
			max: [0, 0, 0],
		};

		// Values for children
		this.posOffset = { x: 0, y: 0, z: 0 };
		this.parent = null;
		// Values for parents
		this.children = []; // Used for webglp rendering

		this.alignBaseVertsToCenter();
		this.calcRadii();
		this.calcVertsWithRotation(); // could also do calcVerts if rotation is always zero

		/*
			const defaults = {
				baseVerts: [],
				baseColor: [1, 1, 1],
				vc: null, // Float32Array of verts with color - set in calc
				outerRadius: 0,
				innerRadius: 0, // currently used for collisions
				rotation: 0,
				facingRotationOffset: 0,
				pos: { x: 0, y: 0, z: 0 },
				posOffset: { x: 0, y: 0, z: 0 }, // For children
				parent: null, // For children
				children: [], // Used for webglp rendering
			};
			Object.assign(
				this,
				options,
				defaults,
			);
		*/	
	}

	alignBaseVertsToCenter(centerParam) {
		const center = centerParam || Polygon.getCenter(this.baseVerts);
		DynamicPolygon.alignBaseVertsToCenter(this.baseVerts, center);
	}

	static alignBaseVertsToCenter(baseVerts, center) {
		baseVerts.forEach((bv) => DynamicPolygon.alignBaseVertToCenter(bv, center));
	}

	static alignBaseVertToCenter(bv, center) {
		[0,1].forEach(i => bv[i] = bv[i] - center[i]);
	}

	// calcRadii() {
	// 	const { inner, outer } = Polygon.getRadii(this.baseVerts);
	// 	this.r = outer;
	// 	this.innerRadius = inner;
	// }

	calcRadii() {
		// TODO: Use children polygons too
		let inner = Infinity;
		// Outer/largest radius
		this.outerRadius = this.r = this.baseVerts.reduce((n, v) => {
			// Store radius on each base vertex for quicker computation later
			const r = v.r = DynamicPolygon.getRadius(v);
			if (r < inner) { inner = r; }
			return (r > n) ? r : n; // Look for the largest
		}, 0);
		this.innerRadius = inner;
		this.children.forEach((child) => {
			// TODO: Use children polygons too
		});

	}

	calcVerts() {
		let vc = [];
		this.verts.length = 0;
		this.baseVerts.forEach((bv, i) => {
			const { x, y, z } = this.pos;
			const v = this.verts[i] = [bv[0] + x, bv[1] + y, z]; // bv[2] + this.pos.z];
			vc = vc.concat(v).concat(this.getColor(v, bv, i));
		});
		this.vc = new Float32Array(vc);
	}

	static calcRotatedVert(centralPosition, baseVert, rotation) {
		// Thanks https://stackoverflow.com/a/17411276/1766230
		const cos = Math.cos(rotation);
		const sin = Math.sin(rotation);
		return [
			(cos * baseVert[0]) - (sin * baseVert[1]) + centralPosition.x, 
			(cos * baseVert[1]) + (sin * baseVert[0]) + centralPosition.y,
			0, // baseVert[2] + centralPosition.z || 0,
		];
	}

	calcVertColorWithRotation(vc, bv, i) {
		this.verts[i] = DynamicPolygon.calcRotatedVert(this.pos, bv, this.rotation);
		const color = this.getColor(null, null, i);
		return vc.concat(this.verts[i]).concat(color);
	}

	calcVertsWithRotation() {
		this.verts.length = 0;
		const vc = this.baseVerts.reduce((vc, bv, i) => this.calcVertColorWithRotation(vc, bv, i), []);
		this.vc = new Float32Array(vc);
		return vc;
	}

	recalcVertsWithRotation(centralPos = this.pos) {
		let min = [Infinity, Infinity, Infinity];
		let max = [-Infinity, -Infinity, -Infinity];
		this.baseVerts.forEach((bv, i) => {
			const offsetBv = [
				bv[0] + this.posOffset.x,
				bv[1] + this.posOffset.y,
				bv[2] + this.posOffset.z,
			];
			const rotVert = DynamicPolygon.calcRotatedVert(centralPos, offsetBv, this.rotation);
			const baseVcIndex = i * 6;
			[0,1,2].forEach((n) => { // For x,y,z
				this.vc[baseVcIndex + n] = rotVert[n];
				if (rotVert[n] < min[n]) { min[n] = rotVert[n]; }
				if (rotVert[n] > max[n]) { max[n] = rotVert[n]; }
			});
		});
		this.children.forEach((child) => {
			child.rotation = this.rotation;
			DynamicPolygon.repositionChild(child, this.pos);
			child.recalcVertsWithRotation(this.pos);
		});
		this.boundingBox.min = [...min];
		this.boundingBox.max = [...max];
	}

	static rotate(xy, radians, center) {
		let x = xy[0] - center[0];
		x += center[0];
	}

	addChild(child) {
		this.children.push(child);
		child.parent = this;
	}

	static repositionChild(child, position) {
		['x','y','z'].forEach((n) => {
			child.pos[n] = Number(position[n] + child.posOffset[n]);
		});
	}

	repositionChildren() {
		this.children.forEach((child) => DynamicPolygon.repositionChild(child, this.pos));
	}

	getVertColors() { // Used by WebglpRenderer
		return this.vc;
	}

	getColor(v, bv, i) {
		const bc = this.baseColor;
		return [bc[0], bc[1], bc[2]];
	}

	setRotation(rot) {
		this.rotation = rot + this.facingRotationOffset;
	}
}

export default DynamicPolygon;
