import React from 'react';
import { Box, Text } from 'ink';
import { ThemeConfig } from '../themes/index.js';
import { EventItem } from './EventItem.js';
import { UIEvent } from '../../events/index.js';
import { ThemeProvider } from '../themes/ThemeProvider.js';

interface CodePreviewProps {
  theme: ThemeConfig;
}

export const CodePreview: React.FC<CodePreviewProps> = ({ theme }) => {
  // Create realistic mock events that match actual usage
  const mockEvents: UIEvent[] = [
    // User input event
    {
      id: 'preview-1',
      type: 'user_input',
      timestamp: new Date(),
      sessionId: 'preview',
      input: 'Fix the authentication bug in user login',
    } as any,

    // AI response
    {
      id: 'preview-2',
      type: 'text_generated',
      timestamp: new Date(),
      sessionId: 'preview',
      text: "I'll analyze the auth system and identify the issue.",
    } as any,

    // Shell command execution
    {
      id: 'preview-3',
      type: 'tool_execution_started',
      timestamp: new Date(),
      sessionId: 'preview',
      toolName: 'shell_executor',
      displayTitle: 'Bash(grep -r "authentication" src/)',
      executionStatus: 'completed',
      completedData: {
        displayDetails: 'src/auth/login.ts:42:  const isAuthenticated = validate(token);\nsrc/middleware/auth.js:15:  // TODO: Fix authentication logic',
      },
    } as any,

    // File diff operation - with realistic diff
    {
      id: 'preview-4',
      type: 'tool_execution_started',
      timestamp: new Date(),
      sessionId: 'preview',
      toolName: 'apply_patch',
      displayTitle: 'Update(src/auth/login.ts)',
      executionStatus: 'completed',
      completedData: {
        displayDetails: `--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -40,6 +40,6 @@
   const user = await User.findById(userId);
   if (!user) throw new Error('User not found');
-   return user.password === plainText; // UNSAFE!
+   return await bcrypt.compare(plainText, user.hash);
 }`,
      },
    } as any,

    // File creation
    {
      id: 'preview-5',
      type: 'tool_execution_started',
      timestamp: new Date(),
      sessionId: 'preview',
      toolName: 'create_file',
      displayTitle: 'Create(src/utils/password.ts)',
      executionStatus: 'completed',
      completedData: {
        displayDetails: 'New file created successfully (247 characters)',
      },
    } as any,

    // Git status check
    {
      id: 'preview-6',
      type: 'tool_execution_started',
      timestamp: new Date(),
      sessionId: 'preview',
      toolName: 'git_status',
      displayTitle: 'Git Status',
      executionStatus: 'completed',
      completedData: {
        displayDetails: 'M src/auth/login.ts\nA src/utils/password.ts',
      },
    } as any,

    // Web search
    {
      id: 'preview-7',
      type: 'tool_execution_started',
      timestamp: new Date(),
      sessionId: 'preview',
      toolName: 'web_search',
      displayTitle: 'WebSearch(bcrypt best practices)',
      executionStatus: 'completed',
      completedData: {
        displayDetails:
          'Found 5 sources:\n1. bcrypt.js Official Documentation - https://github.com/kelektiv/node.bcrypt.js\n2. OWASP Password Storage Guide - https://owasp.org/\n3. Node.js Security Best Practices - https://nodejs.org/',
      },
    } as any,

    // Error example
    {
      id: 'preview-8',
      type: 'tool_execution_started',
      timestamp: new Date(),
      sessionId: 'preview',
      toolName: 'shell_executor',
      displayTitle: 'Bash(npm test)',
      executionStatus: 'failed',
      completedData: {
        error: 'Tests failed: 2 failing, 1 error in auth.test.js',
        displayDetails: "Tests failed: 2 failing, 1 error in auth.test.js\n\n  ✗ should validate correct password\n  ✗ should reject invalid password\n\nERROR: Cannot read property 'password' of undefined at auth.test.js:25",
      },
    } as any,

    // Final success response
    {
      id: 'preview-9',
      type: 'text_generated',
      timestamp: new Date(),
      sessionId: 'preview',
      text: 'Authentication system refactored successfully! Added bcrypt hashing, updated login validation, and created utility functions. All security vulnerabilities have been resolved.',
    } as any,
  ];

  return (
    <ThemeProvider defaultTheme={theme.name as any}>
      <Box flexDirection='column' borderStyle='round' borderColor={theme.colors.ui.border} paddingX={1} paddingY={1} marginTop={1} width={85}>
        <Text color={theme.colors.text.muted} bold>
          {theme.displayName} - Live Preview
        </Text>

        <Box flexDirection='column' marginTop={1}>
          {mockEvents.map((event, index) => (
            <Box key={event.id} marginBottom={index === mockEvents.length - 1 ? 0 : 1}>
              <EventItem event={event} index={index} />
            </Box>
          ))}
        </Box>

        {/* Bottom info bar */}
        <Box marginTop={1} justifyContent='space-between' borderStyle='round' borderColor={theme.colors.ui.border} paddingX={1}>
          <Text color={theme.colors.info}>Preview Mode • {mockEvents.length} events</Text>
          <Text color={theme.colors.text.muted}>Authentication refactor workflow</Text>
        </Box>
      </Box>
    </ThemeProvider>
  );
};
