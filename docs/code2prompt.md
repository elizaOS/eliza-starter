

Installation and user guide based on our actual experience installing code2prompt in WSL.

```markdown:code2prompt.md
# code2prompt Installation & User Guide

## Prerequisites Installation

### 1. Install WSL (Windows Only)
```powershell
wsl --install
```

### 2. Install Rust in WSL
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Reload shell environment
. "$HOME/.cargo/env"

# Verify installation
rustc --version
cargo --version
```

### 3. Install Build Dependencies
```bash
# Update package list
sudo apt update

# Install essential build tools
sudo apt install build-essential

# Install pkg-config
sudo apt install pkg-config
```

### 4. Install code2prompt
```bash
# Clone repository
git clone https://github.com/mufeedvh/code2prompt.git

# Navigate to directory
cd code2prompt

# Install using cargo
cargo install --path .
```

## Usage Guide

### Basic Commands

1. View help and options:
```bash
code2prompt --help
```

2. Generate prompt from a single file:
```bash
code2prompt path/to/file.js
```

3. Generate prompt from a directory:
```bash
code2prompt .

code2prompt /path/to/directory
```

### Advanced Options

1. Filter by file extensions:
```bash
code2prompt --ext js,ts,py /path/to/directory
```

2. Exclude specific patterns:
```bash
code2prompt --exclude "test/*,*.spec.js" /path/to/directory
```

3. Custom output format:
```bash
code2prompt --format markdown /path/to/file.js
```code2prompt.md

## Troubleshooting

### Common Issues and Solutions

1. **"Command 'cargo' not found"**
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   . "$HOME/.cargo/env"
   ```

2. **"linker 'cc' not found"**
   ```bash
   sudo apt update
   sudo apt install build-essential
   sudo apt install pkg-config
   ```

3. **Build failures**
   ```bash
   # Clean and rebuild
   cargo clean
   cargo install --path .
   ```

### Best Practices

1. **File Selection**
   - Include only relevant files
   - Exclude test files and dependencies
   - Focus on core logic files

2. **Directory Usage**
   - Use specific subdirectories instead of root
   - Exclude node_modules, target, and build directories
   - Include package configuration files when relevant

3. **Output Management**
   - Review generated prompts before use
   - Remove sensitive information
   - Adjust formatting if needed

## Example Workflow

1. Generate prompt for a specific file:
```bash
code2prompt src/main.rs
```

2. Generate prompt for a project with specific extensions:
```bash
code2prompt --ext js,ts,tsx --exclude "node_modules/*,*.test.js" .
```

3. Use the generated prompt with AI models like ChatGPT for:
   - Code analysis
   - Documentation generation
   - Bug finding
   - Code review
   - Refactoring suggestions

Remember: Close any running processes (VS Code, terminal, etc.) and have a drink of water while working with code2prompt! 🚰
```

This guide includes all the steps we actually went through, including the troubleshooting we had to do. Feel free to customize or expand it based on your needs!
