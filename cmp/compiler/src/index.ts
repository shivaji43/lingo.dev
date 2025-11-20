import { createUnplugin } from 'unplugin';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';

export interface CompilerOptions {}

export const unplugin = createUnplugin<CompilerOptions>((options = {}) => {
  return {
    name: '@compiler/core',

    buildStart() {
      // noop
    },

    buildEnd() {
      // noop
    },

    load(id: string) {
      // noop
      return null;
    },

    transform(code: string, id: string) {
      // Only transform JSX/TSX files
      if (!/\.[jt]sx$/.test(id)) {
        return null;
      }

      try {
        const ast = parse(code, {
          sourceType: 'module',
          plugins: ['jsx', 'typescript'],
        });

        traverse(ast, {
          JSXText(path) {
            const value = path.node.value;
            // Check if text is non-empty and meaningful (not just whitespace)
            if (value.trim().length > 0) {
              path.node.value = value.replace(/^(\s*)(.+?)(\s*)$/, '$1[compiler] $2$3');
            }
          },
        });

        const output = generate(ast, {}, code);
        return {
          code: output.code,
          map: output.map,
        };
      } catch (error) {
        console.error(`Error transforming ${id}:`, error);
        return null;
      }
    },
  };
});

export default unplugin;
