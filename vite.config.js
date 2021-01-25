// import path from 'path';

export default {
	build: {
		rollupOptions: {
			external: [
				'src/game.js',
				// path.resolve( __dirname, 'src/game.js' ), // Don't bundle (??)
			]
		}
	}
};
