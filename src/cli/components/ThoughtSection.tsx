import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../themes/index.js';

interface ThoughtSectionProps {
  thought: string;
  iteration: number;
}

export const ThoughtSection: React.FC<ThoughtSectionProps> = ({ thought, iteration }) => {
  const { currentTheme } = useTheme();
  
  // Split thought into paragraphs for better readability
  const paragraphs = thought.split('\n\n').filter(p => p.trim().length > 0);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={currentTheme.colors.react.thought} bold>
          💭 Thought:
        </Text>
      </Box>
      
      <Box flexDirection="column" marginTop={1} marginLeft={2}>
        {paragraphs.map((paragraph, index) => (
          <Box key={index} marginBottom={1}>
            <Text color={currentTheme.colors.text.primary}>
              {paragraph.trim()}
            </Text>
          </Box>
        ))}
        
        {paragraphs.length === 0 && (
          <Text color={currentTheme.colors.text.muted}>No thought available</Text>
        )}
      </Box>
    </Box>
  );
};