# Python Tools

Cross-platform Python virtual environment tools for agent-assisted development. These tools handle venv creation, dependency installation, and script execution across macOS, Linux, and Windows.

## How to Invoke These Tools

**CRITICAL FOR AGENTS**: These are executable scripts. When invoking via the Bash tool:

✓ CORRECT:
```bash
python-venv.js create
python-pip.js install requests
python-run.js script.py
```

✗ INCORRECT:
```bash
node python-venv.js create    # Don't use 'node' prefix
./python-venv.js create       # Don't use './' prefix
```

## Create Virtual Environment

```bash
python-venv.js create              # Create .venv in current directory
python-venv.js create myenv        # Create custom named venv
python-venv.js delete .venv        # Delete venv
python-venv.js info                # Show venv information
```

Creates a Python virtual environment. Automatically detects Python 3 on any OS.

## Install Dependencies

```bash
python-pip.js install requests
python-pip.js install -r requirements.txt
python-pip.js install flask pandas numpy
python-pip.js uninstall requests
python-pip.js list
python-pip.js freeze
python-pip.js --venv myenv install flask   # Use custom venv
```

Runs pip within the virtual environment. Supports all standard pip commands.

## Run Python Scripts

```bash
python-run.js script.py
python-run.js script.py arg1 arg2
python-run.js -c "print('hello')"
python-run.js -m pytest tests/
python-run.js -m http.server 8000
python-run.js --venv myenv script.py       # Use custom venv
```

Executes Python using the venv interpreter. Supports scripts, inline code, and modules.

## Typical Workflow

```bash
# 1. Create virtual environment
python-venv.js create

# 2. Install dependencies
python-pip.js install -r requirements.txt

# 3. Run your script
python-run.js main.py

# 4. Or run tests
python-run.js -m pytest
```

## Custom Venv Location

All tools support `--venv` to specify a custom virtual environment path:

```bash
python-venv.js create myproject/venv
python-pip.js --venv myproject/venv install flask
python-run.js --venv myproject/venv app.py
```
