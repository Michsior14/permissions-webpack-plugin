import type { chmod } from 'node:fs';
import { join } from 'node:path';
import type {
  Compiler,
  OutputFileSystem,
  WebpackPluginInstance,
} from 'webpack';

interface SetFilePermissionsRules<T> {
  permissions: number;
  patterns: T;
}

export interface SetFilePermissionsPluginOptions {
  rules: SetFilePermissionsRules<string | RegExp | (string | RegExp)[]>[];
}

export class SetFilePermissionsPlugin implements WebpackPluginInstance {
  #rules: SetFilePermissionsRules<(string | RegExp)[]>[];

  constructor(options: SetFilePermissionsPluginOptions) {
    if (!options || typeof options !== 'object' || options === null) {
      throw new Error(
        `${SetFilePermissionsPlugin.name}: Options object is required.`
      );
    }
    if (!Array.isArray(options.rules)) {
      throw new Error(
        `${SetFilePermissionsPlugin.name}: The "rules" option must be an array.`
      );
    }

    this.#rules = options.rules.map((rule, index) => {
      if (typeof rule !== 'object' || rule === null) {
        throw new Error(
          `${SetFilePermissionsPlugin.name}: Rule at index ${index} must be an object.`
        );
      }
      if (typeof rule.permissions === 'undefined') {
        throw new Error(
          `${SetFilePermissionsPlugin.name}: "permissions" option is required for rule at index ${index}.`
        );
      }
      if (typeof rule.patterns === 'undefined') {
        throw new Error(
          `${SetFilePermissionsPlugin.name}: "patterns" option is required for rule at index ${index}.`
        );
      }
      if (
        typeof rule.patterns !== 'string' &&
        !(rule.patterns instanceof RegExp) &&
        !Array.isArray(rule.patterns)
      ) {
        throw new Error(
          `${SetFilePermissionsPlugin.name}: "patterns" option for rule at index ${index} must be a string, RegExp, or an array of strings/RegExps.`
        );
      }
      return {
        permissions: rule.permissions,
        patterns: Array.isArray(rule.patterns)
          ? rule.patterns
          : [rule.patterns],
      };
    });
  }

  public apply(compiler: Compiler): void {
    compiler.hooks.afterEmit.tapAsync(
      SetFilePermissionsPlugin.name,
      (compilation, callback) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const outputPath = compiler.options.output.path!;
        const outputFileSystem = compiler.outputFileSystem as
          | (OutputFileSystem & {
              chmod: typeof chmod;
            })
          | null;

        if (!outputFileSystem || typeof outputFileSystem.chmod !== 'function') {
          compilation.warnings.push(
            new Error(
              `${SetFilePermissionsPlugin.name}: The output file system does not support 'chmod'. Skipping permission changes.`
            )
          );
          return callback();
        }

        const mods = Object.keys(compilation.assets)
          .map((assetName) => {
            const matchingRule = this.#rules.find((rule) => {
              return rule.patterns.some((pattern) => {
                if (typeof pattern === 'string') {
                  return assetName === pattern;
                } else if (pattern instanceof RegExp) {
                  return pattern.test(assetName);
                }
                return false;
              });
            });

            if (matchingRule) {
              return new Promise<void>((resolve) => {
                const filePath = join(outputPath, assetName);
                outputFileSystem.chmod(
                  filePath,
                  matchingRule.permissions,
                  (err) => {
                    if (err) {
                      compilation.warnings.push(
                        new Error(
                          `${SetFilePermissionsPlugin.name}: Could not set permissions for ${filePath}. Error: ${err.message}`
                        )
                      );
                    }
                    resolve();
                  }
                );
              });
            }

            return null;
          })
          .filter(Boolean);

        Promise.all(mods)
          .then(() => callback())
          .catch((err) => {
            compilation.errors.push(
              new Error(
                `${SetFilePermissionsPlugin.name}: An unexpected error occurred. ${err.message}`
              )
            );
            callback(err);
          });
      }
    );
  }
}
