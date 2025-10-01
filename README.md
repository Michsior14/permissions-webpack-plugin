# permissions-webpack-plugin

A Webpack plugin that allows you to set file permissions on output assets after the build process completes.

[![npm version](https://badge.fury.io/js/permissions-webpack-plugin.svg)](https://badge.fury.io/js/permissions-webpack-plugin)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install permissions-webpack-plugin --save-dev
```

## Usage

### Basic Usage

```javascript
const { SetFilePermissionsPlugin } = require('permissions-webpack-plugin');

module.exports = {
  plugins: [
    new SetFilePermissionsPlugin({
      rules: [
        {
          permissions: 0o755, // rwxr-xr-x
          patterns: ['main.js', 'cli.js']
        }
      ]
    })
  ]
};
```

### Advanced Usage

```javascript
const { SetFilePermissionsPlugin } = require('permissions-webpack-plugin');

module.exports = {
  plugins: [
    new SetFilePermissionsPlugin({
      rules: [
        {
          permissions: 0o755, // Make executable
          patterns: [
            /^bin\/.+$/,           // All files in bin/ directory
            'cli.js',              // Specific file
            /\.sh$/                // All shell scripts
          ]
        },
        {
          permissions: 0o644, // Read-write for owner, read-only for others
          patterns: [
            /\.json$/,             // All JSON files
            /\.txt$/               // All text files
          ]
        }
      ]
    })
  ]
};
```

## Limitations

- Only works with file systems that support the `chmod` operation, otherwise changes are skipped
- Permissions are applied after the build completes (during the `afterEmit` hook)

## Development

This project is built using [Nx](https://nx.dev).

## License

MIT
