# Unity Tools

Code analysis tools for Unity projects. These tools help understand project structure, component definitions, assembly organization, and ScriptableObject data.

## How to Invoke These Tools

**CRITICAL FOR AGENTS**: These are executable scripts. When invoking via the Bash tool:

✓ CORRECT:
```bash
unity-component.js PlayerController
unity-assembly.js list
unity-scriptable.js list
```

✗ INCORRECT:
```bash
node unity-component.js PlayerController    # Don't use 'node' prefix
./unity-component.js PlayerController       # Don't use './' prefix
```

## Analyze Components (MonoBehaviour)

```bash
unity-component.js PlayerController           # Find and analyze component
unity-component.js PlayerController.cs        # Analyze specific file
unity-component.js Assets/Scripts/Player.cs   # Full path
```

Extracts from Unity C# scripts:
- Class inheritance (MonoBehaviour, etc.)
- Serialized fields (Inspector-visible)
- Unity lifecycle methods (Awake, Start, Update, etc.)
- Public methods and properties
- Unity attributes (SerializeField, Header, Range, etc.)

## Analyze Assembly Definitions

```bash
unity-assembly.js list                        # List all assemblies
unity-assembly.js info MyGame.Core            # Assembly details
unity-assembly.js deps MyGame.Player          # Dependency graph
unity-assembly.js scripts MyGame.Core         # List scripts in assembly
```

Parses .asmdef files:
- Assembly references and dependencies
- Platform restrictions
- Define constraints
- Scripts contained in each assembly

## Analyze ScriptableObjects

```bash
unity-scriptable.js list                      # List all SO types
unity-scriptable.js info GameConfig           # Show SO structure
unity-scriptable.js find WeaponData           # Find .asset instances
```

Finds ScriptableObject classes:
- CreateAssetMenu configuration
- Serialized fields with attributes
- Asset instances in project

## Example Output

```
$ unity-component.js PlayerController

File: Assets/Scripts/Player/PlayerController.cs
Namespace: MyGame.Player

class PlayerController : MonoBehaviour, IDamageable

  Serialized Fields (Inspector):
    float moveSpeed [Range(0, 20)]
    float jumpForce
    Transform groundCheck [Header("Ground Detection")]
    LayerMask groundLayer

  Unity Lifecycle:
    Awake()
    Update()
    FixedUpdate()
    OnCollisionEnter()

  Methods:
    void Move(Vector2 input)
    void Jump()
    void TakeDamage(float amount)
```

```
$ unity-assembly.js deps MyGame.Core

Dependency Graph for MyGame.Core:

MyGame.Core
├── Project Assemblies:
│   └── MyGame.Utilities
├── Unity Assemblies:
│   ├── UnityEngine
│   └── UnityEngine.UI
└── Other:
    └── Newtonsoft.Json

Assemblies depending on MyGame.Core:
  MyGame.Player
  MyGame.UI
  MyGame.Enemies
```
