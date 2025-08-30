import React from 'react';
import { Box, Text } from 'ink';
import { ThemeConfig } from '../themes/index.js';

interface CodePreviewProps {
  theme: ThemeConfig;
}

export const CodePreview: React.FC<CodePreviewProps> = ({ theme }) => {
  return (
    <Box 
      flexDirection="column" 
      borderStyle="round" 
      borderColor={theme.colors.ui.border}
      paddingX={1}
      paddingY={1}
      marginTop={1}
      width={60}
    >
      <Text color={theme.colors.text.muted} bold>
        📄 main.ts
      </Text>
      
      <Box flexDirection="column" marginTop={1}>
        {/* Line numbers and diff indicators */}
        <Box>
          <Text color={theme.colors.text.muted}>  1 </Text>
          <Text color={theme.colors.syntax.keyword}>import</Text>
          <Text color={theme.colors.text.primary}> </Text>
          <Text color={theme.colors.syntax.string}>{'{ Agent }'}</Text>
          <Text color={theme.colors.text.primary}> </Text>
          <Text color={theme.colors.syntax.keyword}>from</Text>
          <Text color={theme.colors.text.primary}> </Text>
          <Text color={theme.colors.syntax.string}>'./agent.js'</Text>
          <Text color={theme.colors.syntax.punctuation}>;</Text>
        </Box>
        
        <Box>
          <Text color={theme.colors.text.muted}>  2 </Text>
          <Text color={theme.colors.syntax.keyword}>import</Text>
          <Text color={theme.colors.text.primary}> </Text>
          <Text color={theme.colors.syntax.string}>{'{ TaskResult }'}</Text>
          <Text color={theme.colors.text.primary}> </Text>
          <Text color={theme.colors.syntax.keyword}>from</Text>
          <Text color={theme.colors.text.primary}> </Text>
          <Text color={theme.colors.syntax.string}>'./types.js'</Text>
          <Text color={theme.colors.syntax.punctuation}>;</Text>
        </Box>
        
        <Box>
          <Text color={theme.colors.text.muted}>  3 </Text>
        </Box>
        
        <Box>
          <Text color={theme.colors.diff.removed}>- 4 </Text>
          <Text color={theme.colors.diff.removed}>
            const result = processTask(input);
          </Text>
        </Box>
        
        <Box>
          <Text color={theme.colors.diff.added}>+ 4 </Text>
          <Text color={theme.colors.diff.added}>
            const result = await agent.processTask(input);
          </Text>
        </Box>
        
        <Box>
          <Text color={theme.colors.text.muted}>  5 </Text>
          <Text color={theme.colors.syntax.keyword}>if</Text>
          <Text color={theme.colors.text.primary}> (result.</Text>
          <Text color={theme.colors.syntax.property}>success</Text>
          <Text color={theme.colors.text.primary}>) </Text>
          <Text color={theme.colors.syntax.punctuation}>{'{'}</Text>
        </Box>
        
        <Box>
          <Text color={theme.colors.text.muted}>  6 </Text>
          <Text color={theme.colors.text.primary}>  console.</Text>
          <Text color={theme.colors.syntax.function}>log</Text>
          <Text color={theme.colors.syntax.punctuation}>(</Text>
          <Text color={theme.colors.syntax.string}>'✅ Task completed:'</Text>
          <Text color={theme.colors.syntax.punctuation}>,</Text>
          <Text color={theme.colors.text.primary}> result.</Text>
          <Text color={theme.colors.syntax.property}>data</Text>
          <Text color={theme.colors.syntax.punctuation}>);</Text>
        </Box>
        
        <Box>
          <Text color={theme.colors.text.muted}>  7 </Text>
          <Text color={theme.colors.syntax.punctuation}>{'}'}</Text>
          <Text color={theme.colors.text.primary}> </Text>
          <Text color={theme.colors.syntax.keyword}>else</Text>
          <Text color={theme.colors.text.primary}> </Text>
          <Text color={theme.colors.syntax.punctuation}>{'{'}</Text>
        </Box>
        
        <Box>
          <Text color={theme.colors.text.muted}>  8 </Text>
          <Text color={theme.colors.text.primary}>  console.</Text>
          <Text color={theme.colors.syntax.function}>error</Text>
          <Text color={theme.colors.syntax.punctuation}>(</Text>
          <Text color={theme.colors.syntax.string}>'❌ Task failed:'</Text>
          <Text color={theme.colors.syntax.punctuation}>,</Text>
          <Text color={theme.colors.text.primary}> result.</Text>
          <Text color={theme.colors.syntax.property}>error</Text>
          <Text color={theme.colors.syntax.punctuation}>);</Text>
        </Box>
        
        <Box>
          <Text color={theme.colors.text.muted}>  9 </Text>
          <Text color={theme.colors.syntax.punctuation}>{'}'}</Text>
        </Box>
      </Box>
      
      {/* Footer with theme info */}
      <Box marginTop={1} justifyContent="space-between">
        <Text color={theme.colors.info}>
          🎨 Theme Preview
        </Text>
        <Text color={theme.colors.text.muted}>
          Modified • +1 -1
        </Text>
      </Box>
    </Box>
  );
};