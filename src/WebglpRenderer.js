// import webglp from '../node_modules/webglp/webglp.js';
import webglp from '../../../rocket-boots-repos/webglp/webglp.js';
// import webglp from 'webglp';

const SHADERS = [
	['shaders/v.glsl', 'shaders/stars-f.glsl'],
	//['v.glsl', 'sun-f.glsl'],
	['shaders/space-v.glsl', 'shaders/space-f.glsl'],
];

class WebglpRenderer {
	constructor() {
		this.glp = null;
	}

	draw(vertObjects = [], viewerPosition, zoom) {
		const { glp } = this;
		const uniforms = [
			['iResolution', glp.gl.canvas.width, glp.gl.canvas.height],
			['zoom', zoom],
			['viewerPosition', viewerPosition.x, viewerPosition.y, 0.],
			['iTime', 0.],
		];
	
		// Draw stars background
		glp.use(0).draw({ uniforms, buffs: [['position']] });
	
		// Draw "space" galaxy
		const buffs = [
			['position', { size: 3, stride: 6 }],
			['color', { size: 3, stride: 6, offset: 3 }],
		];
		glp.use(1).draw({
			uniforms,
			buffs,
			verts: new Float32Array([]), 
			vertSize: 6,
			type: glp.gl.TRIANGLE_FAN,
			clear: false,
		});
	
		for (let i = 0; i < vertObjects.length; i++) {
			// glp.unif('translation', 0, 0, 0); // o.x, o.y, o.z);
			glp.draw({
				// uniforms: [],
				buffs,
				verts: vertObjects[i].getVertColors(), // used to calculate the verts to draw
				vertSize: 6,
				type: glp.gl.TRIANGLE_FAN,
				clear: false,
			});
		}
	}

	async init(canvasSelector = '#canvas') {
		this.glp = await webglp.init(canvasSelector, SHADERS, { fullscreen: true });
		console.log(this.glp);
		return { canvas: this.glp.gl.canvas };
	}

}

export default WebglpRenderer;
