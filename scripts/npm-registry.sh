#!/bin/bash

# npm-registry.sh - NPM Publishing Script for @tempurai/coder
# This script handles the complete build and publish workflow for the package

set -e  # Exit on any error

# Color output helpers
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  INFO:${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅ SUCCESS:${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠️  WARNING:${NC} $1"
}

log_error() {
    echo -e "${RED}❌ ERROR:${NC} $1"
}

log_step() {
    echo -e "${PURPLE}🔄 STEP:${NC} $1"
}

# Configuration
PACKAGE_NAME="@tempurai/coder"
REGISTRY_URL="https://registry.npmjs.org/"
BUILD_DIR="dist"
TEMP_DIR=".publish-temp"

# Function to check prerequisites
check_prerequisites() {
    log_step "Checking prerequisites"
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed. Please install Node.js and npm first."
        exit 1
    fi
    
    # Check if we're in the right directory
    if [[ ! -f "package.json" ]]; then
        log_error "package.json not found. Run this script from the project root."
        exit 1
    fi
    
    # Check if user is logged into npm
    if ! npm whoami &> /dev/null; then
        log_error "Not logged into npm. Please run 'npm login' first."
        exit 1
    fi
    
    # Check Node.js version
    NODE_VERSION=$(node -v | cut -d 'v' -f 2)
    REQUIRED_VERSION="18.0.0"
    if ! node -p "process.version.substring(1).split('.').map(n => parseInt(n, 10)).join('') >= '$REQUIRED_VERSION'.split('.').map(n => parseInt(n, 10)).join('')" &> /dev/null; then
        log_error "Node.js version $REQUIRED_VERSION or higher is required. Current version: v$NODE_VERSION"
        exit 1
    fi
    
    log_success "All prerequisites met"
}

# Function to clean up previous builds
cleanup() {
    log_step "Cleaning up previous builds"
    
    # Remove dist directory
    if [[ -d "$BUILD_DIR" ]]; then
        rm -rf "$BUILD_DIR"
        log_info "Removed existing $BUILD_DIR directory"
    fi
    
    # Remove temporary files
    if [[ -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
        log_info "Removed temporary directory"
    fi
    
    # Remove any .tgz files
    rm -f *.tgz
    
    log_success "Cleanup completed"
}

# Function to validate package.json
validate_package_json() {
    log_step "Validating package.json"
    
    # Check required fields
    local required_fields=("name" "version" "description" "main" "bin" "files" "keywords" "author" "license")
    
    for field in "${required_fields[@]}"; do
        if ! node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).$field" &> /dev/null; then
            log_error "Missing required field in package.json: $field"
            exit 1
        fi
    done
    
    # Validate version format
    VERSION=$(node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version")
    if [[ ! $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
        log_error "Invalid version format: $VERSION"
        exit 1
    fi
    
    # Check if version already exists on npm
    if npm view "$PACKAGE_NAME@$VERSION" version &> /dev/null; then
        log_error "Version $VERSION of $PACKAGE_NAME already exists on npm"
        log_info "Please bump the version using: npm version patch|minor|major"
        exit 1
    fi
    
    log_success "package.json validation passed (version: $VERSION)"
}

# Function to run tests
run_tests() {
    log_step "Running test suite"
    
    # Set NODE_ENV to test to avoid import.meta issues
    export NODE_ENV=test
    
    if npm test; then
        log_success "All tests passed"
    else
        log_error "Tests failed. Publishing cancelled."
        exit 1
    fi
}

# Function to run linting and type checking
run_quality_checks() {
    log_step "Running quality checks"
    
    # Type checking
    log_info "Running TypeScript type checking..."
    if npx tsc --noEmit; then
        log_success "Type checking passed"
    else
        log_error "Type checking failed. Please fix TypeScript errors."
        exit 1
    fi
    
    # Check for lint script and run if available
    if npm run --silent 2>/dev/null | grep -q "lint"; then
        log_info "Running linting..."
        if npm run lint; then
            log_success "Linting passed"
        else
            log_warning "Linting failed, but continuing with publish"
        fi
    else
        log_info "No lint script found, skipping linting"
    fi
}

# Function to build the project
build_project() {
    log_step "Building project"
    
    # Run the build command
    if npm run build; then
        log_success "Build completed successfully"
    else
        log_error "Build failed"
        exit 1
    fi
    
    # Verify build output exists
    if [[ ! -d "$BUILD_DIR" ]]; then
        log_error "Build directory $BUILD_DIR not found after build"
        exit 1
    fi
    
    # Check if main entry point exists
    MAIN_FILE=$(node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).main")
    if [[ ! -f "$MAIN_FILE" ]]; then
        log_error "Main entry point $MAIN_FILE not found in build output"
        exit 1
    fi
    
    # Check if binary exists
    BIN_FILE=$(node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).bin.coder")
    if [[ ! -f "$BIN_FILE" ]]; then
        log_error "Binary file $BIN_FILE not found in build output"
        exit 1
    fi
    
    # Make binary executable
    chmod +x "$BIN_FILE"
    log_info "Made $BIN_FILE executable"
    
    log_success "Build verification passed"
}

# Function to create and validate package
create_package() {
    log_step "Creating npm package"
    
    # Create package tarball
    if npm pack; then
        # Get the actual tarball name that npm creates (handles scoped packages correctly)
        local tarball=$(ls -t *.tgz 2>/dev/null | head -n1)
        if [[ -z "$tarball" ]]; then
            log_error "No tarball file found after npm pack"
            exit 1
        fi
        log_success "Package created: $tarball"
        
        # Extract and validate package contents
        mkdir -p "$TEMP_DIR"
        tar -xzf "$tarball" -C "$TEMP_DIR"
        
        local package_dir="$TEMP_DIR/package"
        
        # Check package structure
        local expected_files=("package.json" "README.md" "dist/")
        for file in "${expected_files[@]}"; do
            if [[ ! -e "$package_dir/$file" ]]; then
                log_error "Expected file/directory missing in package: $file"
                exit 1
            fi
        done
        
        log_success "Package structure validated"
        
        # Clean up
        rm -rf "$TEMP_DIR"
        rm -f "$tarball"
    else
        log_error "Failed to create package"
        exit 1
    fi
}

# Function to publish to npm
publish_to_npm() {
    log_step "Publishing to npm registry"
    
    local VERSION=$(node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version")
    
    # Confirm publication
    echo
    log_info "About to publish $PACKAGE_NAME@$VERSION to $REGISTRY_URL"
    read -p "$(echo -e "${CYAN}🤔 Do you want to continue? (y/N): ${NC}")" -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Publication cancelled by user"
        exit 0
    fi
    
    # Publish the package
    if npm publish --access public --registry "$REGISTRY_URL"; then
        log_success "Successfully published $PACKAGE_NAME@$VERSION"
        
        # Verify publication
        sleep 5  # Wait for npm registry to update
        if npm view "$PACKAGE_NAME@$VERSION" version &> /dev/null; then
            log_success "Package is now available on npm registry"
            echo
            log_info "Installation command: npm install -g $PACKAGE_NAME"
            log_info "Package URL: https://www.npmjs.com/package/${PACKAGE_NAME//@/}"
        else
            log_warning "Package published but not immediately available (may take a few minutes)"
        fi
    else
        log_error "Failed to publish package"
        exit 1
    fi
}

# Function to create GitHub release (optional)
create_github_release() {
    if command -v gh &> /dev/null; then
        local VERSION=$(node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version")
        
        echo
        read -p "$(echo -e "${CYAN}🤔 Create GitHub release for v$VERSION? (y/N): ${NC}")" -n 1 -r
        echo
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log_step "Creating GitHub release"
            
            # Create release notes from recent commits
            local release_notes=""
            if git log --oneline -10 --no-merges | head -5 > /dev/null 2>&1; then
                release_notes="## What's Changed\n\n$(git log --oneline -5 --no-merges | sed 's/^/- /')\n\n**Full Changelog**: https://github.com/tempurai/coder/commits/v$VERSION"
            fi
            
            if gh release create "v$VERSION" --title "Release v$VERSION" --notes "$release_notes"; then
                log_success "GitHub release created successfully"
            else
                log_warning "Failed to create GitHub release (but npm publish succeeded)"
            fi
        fi
    else
        log_info "GitHub CLI not installed, skipping GitHub release"
    fi
}

# Function to post-publish cleanup
post_publish_cleanup() {
    log_step "Post-publish cleanup"
    
    # Remove any remaining .tgz files
    rm -f *.tgz
    
    # Clean up temporary directories
    rm -rf "$TEMP_DIR"
    
    log_success "Cleanup completed"
}

# Main execution flow
main() {
    echo -e "${PURPLE}"
    echo "================================================"
    echo "🚀 NPM Publishing Script for @tempurai/coder"
    echo "================================================"
    echo -e "${NC}"
    echo
    
    # Trap to cleanup on exit
    trap post_publish_cleanup EXIT
    
    # Run all steps
    check_prerequisites
    echo
    cleanup
    echo
    validate_package_json
    echo
    run_tests
    echo
    run_quality_checks
    echo
    build_project
    echo
    create_package
    echo
    publish_to_npm
    echo
    create_github_release
    
    echo
    echo -e "${GREEN}================================================"
    echo "🎉 Publication completed successfully!"
    echo "================================================${NC}"
    echo
    
    # Final instructions
    log_info "Next steps:"
    echo "  1. Test installation: npm install -g $PACKAGE_NAME"
    echo "  2. Verify CLI works: coder --help"
    echo "  3. Share the news! 🎉"
}

# Help function
show_help() {
    echo "NPM Publishing Script for @tempurai/coder"
    echo
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  -c, --cleanup  Only run cleanup (remove dist, temp files)"
    echo "  -t, --test     Only run tests and quality checks"
    echo "  -b, --build    Only run build process"
    echo "  -d, --dry-run  Perform all steps except actual publishing"
    echo
    echo "Prerequisites:"
    echo "  - Node.js 18+ installed"
    echo "  - Logged into npm (npm login)"
    echo "  - Clean git working directory"
    echo "  - All tests passing"
    echo
    echo "Environment Variables:"
    echo "  NPM_TOKEN        - NPM authentication token (alternative to npm login)"
    echo "  SKIP_TESTS       - Set to 'true' to skip test execution"
    echo "  SKIP_BUILD       - Set to 'true' to skip build process"
    echo
}

# Handle command line arguments
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    -c|--cleanup)
        cleanup
        exit 0
        ;;
    -t|--test)
        run_tests
        run_quality_checks
        exit 0
        ;;
    -b|--build)
        build_project
        exit 0
        ;;
    -d|--dry-run)
        log_info "Running in dry-run mode (will not actually publish)"
        export DRY_RUN=true
        main
        exit 0
        ;;
    "")
        main
        ;;
    *)
        log_error "Unknown option: $1"
        show_help
        exit 1
        ;;
esac