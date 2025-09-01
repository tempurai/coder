# NPM Publishing Guide

This guide explains how to publish @tempurai/coder to the npm registry using the automated publishing script.

## Quick Start

```bash
# Full publish workflow
npm run publish:npm

# Dry run (test without publishing)
npm run publish:dry-run

# Only run tests
npm run publish:test

# Only build the project
npm run publish:build

# Clean up build artifacts
npm run publish:cleanup
```

## Prerequisites

1. **Node.js 18+** installed
2. **npm login** completed (`npm login`)
3. **Clean git working directory** (all changes committed)
4. **Valid version** in package.json (not already published)

## Environment Variables

Optional environment variables:

```bash
# NPM authentication (alternative to npm login)
export NPM_TOKEN="your-npm-token"

# Skip certain steps
export SKIP_TESTS=true
export SKIP_BUILD=true
```

## Manual Publishing (Backup)

If the automated script fails, you can publish manually:

```bash
# 1. Clean and build
npm run clean
npm run build

# 2. Run tests
npm test

# 3. Publish
npm publish --access public
```

## Troubleshooting

### Common Issues

**Version already exists**

```bash
# Error: Version 1.0.0 already exists
npm version patch  # Bump version first
```

**Not logged in**

```bash
npm login  # Login to npm registry
```

**Build failures**

```bash
npm run clean      # Clean previous builds
npm install        # Reinstall dependencies
npm run build      # Rebuild project
```

**Permission errors**

```bash
chmod +x scripts/npm-registry.sh  # Make script executable
```

### Script Options

```bash
./scripts/npm-registry.sh --help     # Show help
./scripts/npm-registry.sh --dry-run  # Test run without publishing
./scripts/npm-registry.sh --cleanup  # Only cleanup files
./scripts/npm-registry.sh --test     # Only run tests
./scripts/npm-registry.sh --build    # Only build project
```

## Post-Publication

After successful publication:

1. **Test Installation**

   ```bash
   npm install -g @tempurai/coder
   coder --help
   ```

2. **Verify Package**
   - Check [npmjs.com](https://www.npmjs.com/package/@tempurai/coder)
   - Test CLI functionality
   - Monitor download statistics

3. **Update Documentation**
   - Update changelog
   - Create release notes
   - Notify users of new version
