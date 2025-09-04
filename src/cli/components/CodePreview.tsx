import React from 'react';
import { Box, Text } from 'ink';
import { ThemeConfig } from '../themes/index.js';
import { EventRouter } from './events/EventRouter.js';
import { CLIEvent, CLIEventType, CLISymbol, CLISubEvent } from '../hooks/useSessionEvents.js';
import { ThemeProvider } from '../themes/ThemeProvider.js';

interface CodePreviewProps {
  theme: ThemeConfig;
}

export const CodePreview: React.FC<CodePreviewProps> = ({ theme }) => {
  const mockEvents: CLIEvent[] = [
    // User input
    {
      id: 'preview-1',
      type: CLIEventType.USER_INPUT,
      symbol: CLISymbol.USER_INPUT,
      content: 'Fix authentication bug',
      timestamp: new Date(),
    },

    // AI response
    {
      id: 'preview-2',
      type: CLIEventType.AI_RESPONSE,
      symbol: CLISymbol.AI_RESPONSE,
      content: "I'll analyze the auth system and fix the security issue.",
      timestamp: new Date(),
    },

    // Todo start
    {
      id: 'preview-3',
      type: CLIEventType.SYSTEM_INFO,
      symbol: CLISymbol.AI_RESPONSE,
      content: 'Todo started: Analyze authentication system',
      timestamp: new Date(),
    },

    // Shell execution with output
    {
      id: 'preview-4',
      type: CLIEventType.TOOL_EXECUTION,
      symbol: CLISymbol.TOOL_SUCCESS,
      content: 'Bash(grep -r "auth" src/)',
      subEvent: [
        {
          type: 'output',
          content: 'src/auth/login.ts:42:  const isAuth = validate(token);',
        },
      ] as CLISubEvent[],
      timestamp: new Date(),
    },

    // File patch with diff
    {
      id: 'preview-5',
      type: CLIEventType.TOOL_EXECUTION,
      symbol: CLISymbol.TOOL_SUCCESS,
      originalEvent: {
        toolName: 'apply_patch',
      } as any,
      content: 'Update(src/auth/login.ts)',
      subEvent: [
        {
          type: 'output',
          content: `--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -40,3 +40,3 @@
-   return user.password === plainText;
+   return await bcrypt.compare(plainText, user.hash);`,
        },
      ] as CLISubEvent[],
      timestamp: new Date(),
    },

    // Tool with error
    {
      id: 'preview-6',
      type: CLIEventType.TOOL_EXECUTION,
      symbol: CLISymbol.TOOL_FAILED,
      content: 'Bash(npm test)',
      subEvent: [
        {
          type: 'error',
          content: 'Tests failed: 2 failing in auth.test.js',
        },
      ] as CLISubEvent[],
      timestamp: new Date(),
    },

    // Todo completion
    {
      id: 'preview-7',
      type: CLIEventType.SYSTEM_INFO,
      symbol: CLISymbol.AI_RESPONSE,
      content: 'Todo completed: todo-1',
      timestamp: new Date(),
    },

    // Snapshot creation
    {
      id: 'preview-8',
      type: CLIEventType.SYSTEM_INFO,
      symbol: CLISymbol.AI_RESPONSE,
      content: 'Snapshot created: a1b2c3d4...',
      timestamp: new Date(),
    },

    // Final success
    {
      id: 'preview-9',
      type: CLIEventType.AI_RESPONSE,
      symbol: CLISymbol.AI_RESPONSE,
      content: 'Authentication security fixed! Added bcrypt hashing and proper validation.',
      timestamp: new Date(),
    },
  ];

  return (
    <ThemeProvider defaultTheme={theme.name as any}>
      <Box flexDirection='column' borderStyle='round' borderColor={theme.colors.ui.border} paddingX={1} marginTop={1} width={90}>
        <Text color={theme.colors.text.muted} bold>
          {theme.displayName} - Live Preview
        </Text>

        <Box flexDirection='column' marginTop={1}>
          {mockEvents.map((event, index) => (
            <Box key={event.id} marginBottom={index === mockEvents.length - 1 ? 0 : 1}>
              <EventRouter event={event} index={index} />
            </Box>
          ))}
        </Box>

        <Box marginTop={1} justifyContent='space-between' borderStyle='round' borderColor={theme.colors.ui.border} paddingX={1}>
          <Text color={theme.colors.info}>Preview Mode • {mockEvents.length} events</Text>
        </Box>
      </Box>
    </ThemeProvider>
  );
};
