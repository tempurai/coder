## Complete Interface Display Schema

### Schema Template Format

```
# User input event
> {input_text}
  L {error_message}
  L {retry_info}

# AI thinking/text output
● {thought_or_response}

# Todo/ProgressIndicator display
## When Todo exists:
> Current task: {current_todo_title}
  L Next: {next_todo_title}

## When no Todo:
● {system_status_message}

# Tool execution event
## Executing:
~ {tool_name}({args})
  L {progress_info}
  L {intermediate_output}

## Execution successful:
✓ {tool_name}({args})
  L {success_output}
  L {result_details}

## Execution failed:
✗ {tool_name}({args})
  L {error_message}
  L {retry_attempt}

# Todo status update event
✓ Todo "{todo_title}" status updated: {status}
  L {additional_info}
  L {system_message}

# System-level error (standalone display)
● {system_error_message}
! {critical_error_message}

# Symbol explanation
> = User input/current task
● = AI thinking/text output/system status
~ = Tool executing
✓ = Tool execution successful/Todo completed
✗ = Tool execution failed/Todo failed
! = Critical system error
L = Unified indentation symbol (all sub-content)
```

### Complete Scenario Examples

#### Scenario 1: Normal execution flow

```
> Fix test case

● I'll analyze the JWT implementation and identify areas for improvement

> Current task: Analyze JWT implementation logic in src/auth.ts
  L Next: Add rate limiting middleware to API routes

~ Bash(cat src/auth.ts)
  L Reading file content...
  L Successfully read file content (247 lines)

● Found JWT implementation, now searching for best practices

✓ WebSearch(JWT best practices)
  L Found 5 sources: JWT Documentation, OWASP Guide
  L Retrieved implementation examples

● Based on the search results, I'll now update the authentication logic

✓ Apply Patch(src/auth.ts)
  L Updated authentication logic (12 lines changed)
  L Added proper error handling

● Task completed successfully, moving to next item

> Current task: Add rate limiting middleware to API routes
```

#### Scenario 2: Tool execution error

```
> Fix test case

● Let me examine the authentication implementation

> Current task: Analyze JWT implementation logic in src/auth.ts
  L Next: Add rate limiting middleware to API routes

~ Bash(cat src/auth.ts)
  L Attempting to read file...
  L File not found: src/auth.ts
  L Error: No such file or directory
  L Retrying with alternative path...
  L Found file at ./auth/auth.ts

● I found the file in a different location, now searching for best practices

✗ WebSearch(JWT best practices)
  L API Error (429): Rate limit exceeded
  L Search temporarily unavailable
  L Will retry in 30 seconds

● Proceeding with file analysis while waiting for search

> Current task: Analyze JWT implementation logic in src/auth.ts
  L Next: Add rate limiting middleware to API routes
```

#### Scenario 3: Initial stage error

```
> Fix test case
  L API Error (401 token expired) - Retrying in 4 seconds (attempt 4/10)
  L Failed to initialize SmartAgent
  L Connection timeout, retrying...
  L Attempting fallback connection...

● Analyzing your request and creating execution plan
```

#### Scenario 4: System error after task completion

```
> Fix test case

✓ Todo "Analyze JWT implementation logic in src/auth.ts" status updated: completed
  L Context compression failed
  L Memory allocation warning
  L Attempting garbage collection...

● Task completed successfully, moving to next item

> Current task: Add rate limiting middleware to API routes
```

#### Scenario 5: No Todo state

```
> Fix test case
  L Planning task structure...
  L Connection timeout, retrying...
  L Establishing secure connection...

● Ready for your next task
```

#### Scenario 6: Todo status changes

```
> Refactor user system

> Current task: Backup existing user data
  L Next: Update database schema
  L Then: Migrate user accounts

~ Bash(cp -r users/ backup/)
  L Copying user data...
  L Progress: 1.2GB / 3.4GB
  L Estimated time: 2 minutes

✓ Todo "Backup existing user data" status updated: completed

> Current task: Update database schema
  L Next: Migrate user accounts
```

#### Scenario 7: Mixed error handling

```
> Analyze project dependencies

● I'll examine the project structure and check for dependency issues

> Current task: Scan dependency files
  L Next: Analyze version conflicts

~ Bash(find . -name "package.json")
  L Searching project structure...
  L ./package.json
  L ./frontend/package.json
  L ./backend/package.json

✓ WebSearch(npm audit security)
  L Found security scanning tools
  L Retrieved best practices guide

~ Bash(npm audit)
  L Running security audit...
  L Found 3 vulnerabilities (2 moderate, 1 high)
  L Generating detailed report...

● Found security issues, analyzing each vulnerability

> Current task: Scan dependency files
  L Next: Analyze version conflicts
```

#### Scenario 8: Long-running task

```
> Run complete test suite

● Starting comprehensive test execution

> Current task: Execute unit tests
  L Next: Execute integration tests

~ Bash(npm test)
  L Running 247 test suites...
  L Progress: 45/247 suites completed
  L Estimated time remaining: 8 minutes
  L Current: testing auth module

● Tests are running, this may take several minutes

> Current task: Execute unit tests
  L Next: Execute integration tests
```

#### Scenario 9: Critical system error

```
> Deploy to production

● Preparing production deployment

> Current task: Build production version
  L Next: Upload to server

✗ Bash(npm run build)
  L Build process started...
  L Error: Out of memory (heap limit exceeded)
  L Available: 1.2GB, Required: 2.1GB

! Critical Error: Insufficient memory for build process
  L Build process terminated
  L Deployment cancelled for safety

● Deployment aborted due to resource constraints
```

#### Scenario 10: Network error recovery

```
> Update project dependencies

● Checking for available package updates

> Current task: Update npm packages
  L Next: Verify compatibility

~ Bash(npm update)
  L Connecting to registry...
  L Network timeout: registry.npmjs.org
  L Retrying with different registry...
  L Connected to mirror registry
  L Downloading updates...

✓ WebSearch(npm registry alternatives)
  L Found reliable mirror registries
  L Performance comparison data

● Successfully connected to backup registry, proceeding with updates

> Current task: Update npm packages
  L Next: Verify compatibility
```
