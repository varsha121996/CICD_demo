import { join } from 'node:path';
import nodePlop from 'node-plop';

// Intercept @types/minimatch resolution to handle v6 stub compatibility
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Module = require('module');

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request: string, parent: any, isMain: boolean) {
  if (request === '@types/minimatch' && parent && parent.filename) {
    try {
      // Try to resolve the request using the original method
      const resolved = originalResolveFilename.call(this, request, parent, isMain);

      // Check if this is the problematic v6 stub version
      const pkgPath = resolved.replace(/\/index\.d\.ts$/, '/package.json');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pkg = require(pkgPath);

      if (pkg.version === '6.0.0' && pkg.deprecated) {
        // Return path to the v3.0.5 types from our dependencies instead
        // eslint-disable-next-line @typescript-eslint/no-var-requires, node/no-missing-require
        return require.resolve('@types/minimatch', { paths: [join(__dirname, '../node_modules')] });
      }

      return resolved;
    } catch (e) {
      // If resolution fails, fall through to original resolution
      return originalResolveFilename.call(this, request, parent, isMain);
    }
  }

  return originalResolveFilename.call(this, request, parent, isMain);
};

// Starts the Plop CLI programmatically
export const runCLI = async () => {
  const { Plop, run } = await import('plop');

  Plop.prepare(
    {
      configPath: join(__dirname, 'plopfile.js'),
    },
    (env) => {
      const argv = process.argv.slice(2); // Extract command-line arguments
      Plop.execute(env, argv, (env, argv) => {
        const options = {
          ...env,
          dest: join(process.cwd(), 'src'), // this will make the destination path to be based on the cwd when calling the wrapper
        };
        return run(options, argv, true); // Pass the third argument 'true' for passArgsBeforeDashes
      });
    }
  );
};

// Runs a generator programmatically without prompts
export const generate = async <T extends Record<string, any>>(
  generatorName: string,
  options: T,
  { dir = process.cwd(), plopFile = 'plopfile.js' } = {}
) => {
  const plop = nodePlop(join(__dirname, plopFile), {
    destBasePath: join(dir, 'src'),
    force: false,
  });

  const generator = plop.getGenerator(generatorName);
  await generator.runActions(options satisfies T, {
    onSuccess() {},
    onFailure() {},
    onComment() {},
  });
};
