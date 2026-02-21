import fs from 'node:fs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

const banner = `${fs.readFileSync('src/meta.user.js', 'utf8').trim()}\n`;

function appendUserscriptMetaBlock(meta) {
  return {
    name: 'append-userscript-metablock',
    generateBundle(_, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk') continue;
        file.code = `${meta}\n${file.code}`;
      }
    }
  };
}

export default {
  input: 'src/main.js',
  output: {
    file: 'main.user.js',
    format: 'iife',
    sourcemap: false
  },
  treeshake: {
    moduleSideEffects: false
  },
  plugins: [
    nodeResolve({ browser: true }),
    commonjs(),
    terser({
      compress: {
        passes: 2
      },
      format: {
        comments: false
      }
    }),
    appendUserscriptMetaBlock(banner)
  ]
};
