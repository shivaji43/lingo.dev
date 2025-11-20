import { createUnplugin } from 'unplugin';

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
      // noop
      return null;
    },
  };
});

export default unplugin;
