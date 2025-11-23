# Unreal Engine Tools

Code analysis tools for Unreal Engine projects. These tools help understand project structure, class definitions, and module dependencies.

## How to Invoke These Tools

**CRITICAL FOR AGENTS**: These are executable scripts. When invoking via the Bash tool:

✓ CORRECT:
```bash
unreal-class.js AMyCharacter
unreal-module.js list
unreal-subsystem.js list
```

✗ INCORRECT:
```bash
node unreal-class.js AMyCharacter    # Don't use 'node' prefix
./unreal-class.js AMyCharacter       # Don't use './' prefix
```

## Analyze Class Definitions

```bash
unreal-class.js AMyCharacter              # Find and analyze class
unreal-class.js MyCharacter.h             # Analyze specific file
unreal-class.js Source/Game/MyClass.h     # Full path
```

Extracts from Unreal C++ headers:
- UCLASS with specifiers and parent class
- UPROPERTY (type, name, Blueprint/Replicated flags)
- UFUNCTION (return type, params, Blueprint flags)
- USTRUCT definitions
- UENUM definitions

## Analyze Module Structure

```bash
unreal-module.js list                     # List all modules
unreal-module.js info MyGameModule        # Module details
unreal-module.js deps MyGameModule        # Dependency graph
unreal-module.js plugins                  # List plugins
```

Parses:
- .uproject file
- .Build.cs files
- Module dependencies (public/private)
- Plugin configuration

## Analyze Subsystems

```bash
unreal-subsystem.js list                  # List all subsystems
unreal-subsystem.js info UMySubsystem     # Subsystem details
```

Finds subsystems inheriting from:
- UGameInstanceSubsystem
- UWorldSubsystem
- ULocalPlayerSubsystem
- UEngineSubsystem
- UEditorSubsystem

Shows access patterns for each subsystem type.

## Example Output

```
$ unreal-class.js AMyCharacter

File: Source/MyGame/Characters/MyCharacter.h

UCLASS: AMyCharacter : ACharacter
  Specifiers: BlueprintType, Blueprintable

  Properties:
    float Health [EditAnywhere, BlueprintReadWrite]
    USkeletalMeshComponent* Mesh [VisibleAnywhere]

  Functions:
    void TakeDamage(float Amount) [BlueprintCallable]
    void OnHealthChanged() [BlueprintImplementableEvent]
```
