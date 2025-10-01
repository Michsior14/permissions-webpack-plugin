import { Mode, NoParamCallback, PathLike } from 'node:fs';
import { join } from 'node:path';
import type {
  Compilation,
  Compiler,
  OutputFileSystem,
  WebpackOptionsNormalized,
} from 'webpack';
import {
  SetFilePermissionsPlugin,
  SetFilePermissionsPluginOptions,
} from './permissions-webpack-plugin.js';

describe('SetFilePermissionsPlugin', () => {
  let mockCompiler: Partial<Compiler>;
  let mockCompilation: Partial<Compilation>;
  let mockOutputFileSystem: Partial<OutputFileSystem> & {
    chmod: (path: PathLike, mode: Mode, callback: NoParamCallback) => void;
  };
  let mockChmod: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockChmod = vi.fn(
      (path: string, permissions: number, callback: (err?: Error) => void) => {
        callback();
      }
    );

    mockOutputFileSystem = {
      chmod: mockChmod,
    };

    mockCompilation = {
      assets: {},
      warnings: [],
      errors: [],
    };

    mockCompiler = {
      options: {
        output: {
          path: '/output/path',
        },
      } as WebpackOptionsNormalized,
      outputFileSystem: mockOutputFileSystem as OutputFileSystem,
      hooks: {
        afterEmit: {
          tapAsync: vi.fn(),
        },
      } as unknown as Compiler['hooks'],
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create plugin with valid options', () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: ['*.js'],
          },
        ],
      };

      const plugin = new SetFilePermissionsPlugin(options);
      expect(plugin).toBeInstanceOf(SetFilePermissionsPlugin);
    });

    it('should throw error when options is not provided', () => {
      expect(() => new SetFilePermissionsPlugin(null as any)).toThrow(
        'SetFilePermissionsPlugin: Options object is required.'
      );
    });

    it('should throw error when options is not an object', () => {
      expect(() => new SetFilePermissionsPlugin('invalid' as any)).toThrow(
        'SetFilePermissionsPlugin: Options object is required.'
      );
    });

    it('should throw error when rules is not an array', () => {
      const options = {
        rules: 'not-an-array',
      };

      expect(() => new SetFilePermissionsPlugin(options as any)).toThrow(
        'SetFilePermissionsPlugin: The "rules" option must be an array.'
      );
    });

    it('should throw error when rule is not an object', () => {
      const options = {
        rules: ['not-an-object'],
      };

      expect(() => new SetFilePermissionsPlugin(options as any)).toThrow(
        'SetFilePermissionsPlugin: Rule at index 0 must be an object.'
      );
    });

    it('should throw error when permissions is missing', () => {
      const options = {
        rules: [
          {
            patterns: ['*.js'],
          },
        ],
      };

      expect(() => new SetFilePermissionsPlugin(options as any)).toThrow(
        'SetFilePermissionsPlugin: "permissions" option is required for rule at index 0.'
      );
    });

    it('should throw error when patterns is missing', () => {
      const options = {
        rules: [
          {
            permissions: 0o755,
          },
        ],
      };

      expect(() => new SetFilePermissionsPlugin(options as any)).toThrow(
        'SetFilePermissionsPlugin: "patterns" option is required for rule at index 0.'
      );
    });

    it('should throw error when patterns is invalid type', () => {
      const options = {
        rules: [
          {
            permissions: 0o755,
            patterns: 123,
          },
        ],
      };

      expect(() => new SetFilePermissionsPlugin(options as any)).toThrow(
        'SetFilePermissionsPlugin: "patterns" option for rule at index 0 must be a string, RegExp, or an array of strings/RegExps.'
      );
    });

    it('should accept string pattern', () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: 'script.js',
          },
        ],
      };

      expect(() => new SetFilePermissionsPlugin(options)).not.toThrow();
    });

    it('should accept RegExp pattern', () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: /\.js$/,
          },
        ],
      };

      expect(() => new SetFilePermissionsPlugin(options)).not.toThrow();
    });

    it('should accept array of patterns', () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: ['*.js', /\.ts$/, 'script.sh'],
          },
        ],
      };

      expect(() => new SetFilePermissionsPlugin(options)).not.toThrow();
    });
  });

  describe('apply', () => {
    const createTestHelper = () => {
      return {
        async runHook(
          plugin: SetFilePermissionsPlugin,
          compilation = mockCompilation
        ) {
          plugin.apply(mockCompiler as Compiler);

          const hookCallback = (mockCompiler.hooks?.afterEmit.tapAsync as any)
            .mock.calls[0][1];

          return new Promise<void>((resolve, reject) => {
            hookCallback(compilation, (err?: Error) => {
              if (err) reject(err);
              else resolve();
            });
          });
        },
      };
    };

    it('should register afterEmit hook', () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: ['*.js'],
          },
        ],
      };

      const plugin = new SetFilePermissionsPlugin(options);
      plugin.apply(mockCompiler as Compiler);

      expect(mockCompiler.hooks?.afterEmit.tapAsync).toHaveBeenCalledWith(
        'SetFilePermissionsPlugin',
        expect.any(Function)
      );
    });

    it('should add warning when output file system does not support chmod', async () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: ['*.js'],
          },
        ],
      };

      const plugin = new SetFilePermissionsPlugin(options);
      mockCompiler.outputFileSystem = {} as OutputFileSystem;
      const { runHook } = createTestHelper();

      await runHook(plugin);

      expect(mockCompilation.warnings).toHaveLength(1);
      expect(mockCompilation.warnings?.[0]?.message).toContain(
        "The output file system does not support 'chmod'. Skipping permission changes."
      );
    });

    it('should add warning when output file system is null', async () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: ['*.js'],
          },
        ],
      };

      const plugin = new SetFilePermissionsPlugin(options);
      mockCompiler.outputFileSystem = null as any;
      const { runHook } = createTestHelper();

      await runHook(plugin);

      expect(mockCompilation.warnings).toHaveLength(1);
    });

    it('should set permissions for matching string pattern', async () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: 'script.js',
          },
        ],
      };

      mockCompilation.assets = {
        'script.js': {} as any,
        'style.css': {} as any,
      };

      const plugin = new SetFilePermissionsPlugin(options);
      const { runHook } = createTestHelper();

      await runHook(plugin);

      expect(mockChmod).toHaveBeenCalledWith(
        join('/output/path', 'script.js'),
        0o755,
        expect.any(Function)
      );
      expect(mockChmod).toHaveBeenCalledTimes(1);
    });

    it('should set permissions for matching RegExp pattern', async () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: /\.js$/,
          },
        ],
      };

      mockCompilation.assets = {
        'script.js': {} as any,
        'another.js': {} as any,
        'style.css': {} as any,
      };

      const plugin = new SetFilePermissionsPlugin(options);
      const { runHook } = createTestHelper();

      await runHook(plugin);

      expect(mockChmod).toHaveBeenCalledWith(
        join('/output/path', 'script.js'),
        0o755,
        expect.any(Function)
      );
      expect(mockChmod).toHaveBeenCalledWith(
        join('/output/path', 'another.js'),
        0o755,
        expect.any(Function)
      );
      expect(mockChmod).toHaveBeenCalledTimes(2);
    });

    it('should set permissions for multiple patterns', async () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: ['script.js', /\.sh$/],
          },
        ],
      };

      mockCompilation.assets = {
        'script.js': {} as any,
        'build.sh': {} as any,
        'style.css': {} as any,
      };

      const plugin = new SetFilePermissionsPlugin(options);
      const { runHook } = createTestHelper();

      await runHook(plugin);

      expect(mockChmod).toHaveBeenCalledWith(
        join('/output/path', 'script.js'),
        0o755,
        expect.any(Function)
      );
      expect(mockChmod).toHaveBeenCalledWith(
        join('/output/path', 'build.sh'),
        0o755,
        expect.any(Function)
      );
      expect(mockChmod).toHaveBeenCalledTimes(2);
    });

    it('should apply different permissions for different rules', async () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: /\.js$/,
          },
          {
            permissions: 0o644,
            patterns: /\.css$/,
          },
        ],
      };

      mockCompilation.assets = {
        'script.js': {} as any,
        'style.css': {} as any,
        'readme.txt': {} as any,
      };

      const plugin = new SetFilePermissionsPlugin(options);
      const { runHook } = createTestHelper();

      await runHook(plugin);

      expect(mockChmod).toHaveBeenCalledWith(
        join('/output/path', 'script.js'),
        0o755,
        expect.any(Function)
      );
      expect(mockChmod).toHaveBeenCalledWith(
        join('/output/path', 'style.css'),
        0o644,
        expect.any(Function)
      );
      expect(mockChmod).toHaveBeenCalledTimes(2);
    });

    it('should use first matching rule when multiple rules match', async () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: /\.js$/,
          },
          {
            permissions: 0o644,
            patterns: 'script.js',
          },
        ],
      };

      mockCompilation.assets = {
        'script.js': {} as any,
      };

      const plugin = new SetFilePermissionsPlugin(options);
      const { runHook } = createTestHelper();

      await runHook(plugin);

      expect(mockChmod).toHaveBeenCalledWith(
        join('/output/path', 'script.js'),
        0o755,
        expect.any(Function)
      );
      expect(mockChmod).toHaveBeenCalledTimes(1);
    });

    it('should add warning when chmod fails', async () => {
      const chmodError = new Error('Permission denied');
      mockChmod = vi.fn(
        (
          path: string,
          permissions: number,
          callback: (err?: Error) => void
        ) => {
          callback(chmodError);
        }
      );
      mockOutputFileSystem.chmod = mockChmod;

      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: 'script.js',
          },
        ],
      };

      mockCompilation.assets = {
        'script.js': {} as any,
      };

      const plugin = new SetFilePermissionsPlugin(options);
      const { runHook } = createTestHelper();

      await runHook(plugin);

      expect(mockCompilation.warnings).toHaveLength(1);
      expect(mockCompilation.warnings?.[0]?.message).toContain(
        'Could not set permissions for'
      );
      expect(mockCompilation.warnings?.[0]?.message).toContain(
        'Permission denied'
      );
    });

    it('should handle empty assets object', async () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: /\.js$/,
          },
        ],
      };

      mockCompilation.assets = {};

      const plugin = new SetFilePermissionsPlugin(options);
      const { runHook } = createTestHelper();

      await runHook(plugin);

      expect(mockChmod).not.toHaveBeenCalled();
    });

    it('should handle assets with no matching patterns', async () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: /\.js$/,
          },
        ],
      };

      mockCompilation.assets = {
        'style.css': {} as any,
        'image.png': {} as any,
      };

      const plugin = new SetFilePermissionsPlugin(options);
      const { runHook } = createTestHelper();

      await runHook(plugin);

      expect(mockChmod).not.toHaveBeenCalled();
    });

    it('should handle complex nested directory paths', async () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: 'assets/js/script.js',
          },
        ],
      };

      mockCompilation.assets = {
        'assets/js/script.js': {} as any,
        'assets/css/style.css': {} as any,
      };

      const plugin = new SetFilePermissionsPlugin(options);
      const { runHook } = createTestHelper();

      await runHook(plugin);

      expect(mockChmod).toHaveBeenCalledWith(
        join('/output/path', 'assets/js/script.js'),
        0o755,
        expect.any(Function)
      );
      expect(mockChmod).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple files with complex patterns', async () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: [/\.js$/, /\.sh$/, 'bin/executable'],
          },
          {
            permissions: 0o644,
            patterns: /\.(css|html|json)$/,
          },
        ],
      };

      mockCompilation.assets = {
        'app.js': {} as any,
        'script.sh': {} as any,
        'bin/executable': {} as any,
        'style.css': {} as any,
        'index.html': {} as any,
        'config.json': {} as any,
        'image.png': {} as any,
      };

      const plugin = new SetFilePermissionsPlugin(options);
      const { runHook } = createTestHelper();

      await runHook(plugin);

      expect(mockChmod).toHaveBeenCalledWith(
        join('/output/path', 'app.js'),
        0o755,
        expect.any(Function)
      );
      expect(mockChmod).toHaveBeenCalledWith(
        join('/output/path', 'script.sh'),
        0o755,
        expect.any(Function)
      );
      expect(mockChmod).toHaveBeenCalledWith(
        join('/output/path', 'bin/executable'),
        0o755,
        expect.any(Function)
      );

      expect(mockChmod).toHaveBeenCalledWith(
        join('/output/path', 'style.css'),
        0o644,
        expect.any(Function)
      );
      expect(mockChmod).toHaveBeenCalledWith(
        join('/output/path', 'index.html'),
        0o644,
        expect.any(Function)
      );
      expect(mockChmod).toHaveBeenCalledWith(
        join('/output/path', 'config.json'),
        0o644,
        expect.any(Function)
      );

      expect(mockChmod).toHaveBeenCalledTimes(6);
    });

    it('should handle errors during Promise.all execution', async () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: 'script.js',
          },
        ],
      };

      mockCompilation.assets = {
        'script.js': {} as any,
      };

      mockChmod = vi.fn(() => {
        throw new Error('Unexpected error');
      });
      mockOutputFileSystem.chmod = mockChmod;

      const plugin = new SetFilePermissionsPlugin(options);
      const { runHook } = createTestHelper();

      await expect(runHook(plugin)).rejects.toThrow();
    });

    it('should handle rule with permissions as 0 (no permissions)', async () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0,
            patterns: 'script.js',
          },
        ],
      };

      mockCompilation.assets = {
        'script.js': {} as any,
      };

      const plugin = new SetFilePermissionsPlugin(options);
      const { runHook } = createTestHelper();

      await runHook(plugin);

      expect(mockChmod).toHaveBeenCalledWith(
        join('/output/path', 'script.js'),
        0,
        expect.any(Function)
      );
      expect(mockChmod).toHaveBeenCalledTimes(1);
    });

    it('should handle empty rules array', () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [],
      };

      expect(() => new SetFilePermissionsPlugin(options)).not.toThrow();
    });

    it('should handle empty rules array with assets', async () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [],
      };

      mockCompilation.assets = {
        'script.js': {} as any,
        'style.css': {} as any,
      };

      const plugin = new SetFilePermissionsPlugin(options);
      const { runHook } = createTestHelper();

      await runHook(plugin);

      expect(mockChmod).not.toHaveBeenCalled();
    });

    it('should handle rules with empty patterns array', () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: [],
          },
        ],
      };

      expect(() => new SetFilePermissionsPlugin(options)).not.toThrow();
    });

    it('should handle RegExp that matches nothing', async () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: /\.nonexistent$/,
          },
        ],
      };

      mockCompilation.assets = {
        'script.js': {} as any,
        'style.css': {} as any,
      };

      const plugin = new SetFilePermissionsPlugin(options);
      const { runHook } = createTestHelper();

      await runHook(plugin);

      expect(mockChmod).not.toHaveBeenCalled();
    });

    it('should handle mixed patterns with some matching', async () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: ['nonexistent.file', /\.js$/, 'another-nonexistent'],
          },
        ],
      };

      mockCompilation.assets = {
        'script.js': {} as any,
        'style.css': {} as any,
      };

      const plugin = new SetFilePermissionsPlugin(options);
      const { runHook } = createTestHelper();

      await runHook(plugin);

      expect(mockChmod).toHaveBeenCalledWith(
        join('/output/path', 'script.js'),
        0o755,
        expect.any(Function)
      );
      expect(mockChmod).toHaveBeenCalledTimes(1);
    });

    it('should handle case-sensitive string matching', async () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: 'Script.js',
          },
        ],
      };

      mockCompilation.assets = {
        'script.js': {} as any,
      };

      const plugin = new SetFilePermissionsPlugin(options);
      const { runHook } = createTestHelper();

      await runHook(plugin);

      expect(mockChmod).not.toHaveBeenCalled();
    });

    it('should handle large number of assets', async () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o755,
            patterns: /\.js$/,
          },
        ],
      };

      const assets: Record<string, any> = {};
      for (let i = 0; i < 100; i++) {
        assets[`file${i}.js`] = {} as any;
      }
      mockCompilation.assets = assets;

      const plugin = new SetFilePermissionsPlugin(options);
      const { runHook } = createTestHelper();

      await runHook(plugin);

      expect(mockChmod).toHaveBeenCalledTimes(100);
    });

    it('should handle very high permission values', async () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 0o777,
            patterns: 'script.js',
          },
        ],
      };

      mockCompilation.assets = {
        'script.js': {} as any,
      };

      const plugin = new SetFilePermissionsPlugin(options);
      const { runHook } = createTestHelper();

      await runHook(plugin);

      expect(mockChmod).toHaveBeenCalledWith(
        join('/output/path', 'script.js'),
        0o777,
        expect.any(Function)
      );
    });

    it('should handle decimal permission values', async () => {
      const options: SetFilePermissionsPluginOptions = {
        rules: [
          {
            permissions: 493,
            patterns: 'script.js',
          },
        ],
      };

      mockCompilation.assets = {
        'script.js': {} as any,
      };

      const plugin = new SetFilePermissionsPlugin(options);
      const { runHook } = createTestHelper();

      await runHook(plugin);

      expect(mockChmod).toHaveBeenCalledWith(
        join('/output/path', 'script.js'),
        493,
        expect.any(Function)
      );
    });
  });
});
