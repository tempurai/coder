import React from 'react';
import { Box, Text } from 'ink';
import { UIEvent, TextGeneratedEvent, ThoughtGeneratedEvent } from '../../../events/index.js';
import { useTheme } from '../../themes/index.js';
import { StatusIndicator } from '../StatusIndicator.js';

interface TextEventItemProps {
  event: UIEvent;
  index: number;
}

export const TextEventItem: React.FC<TextEventItemProps> = ({ event }) => {
  const { currentTheme } = useTheme();

  let content = '';
  let indicatorType: 'assistant' | 'system' = 'assistant';

  if (event.type === 'text_generated') {
    const textEvent = event as TextGeneratedEvent;
    content = textEvent.text;
    indicatorType = 'assistant';
  } else if (event.type === 'thought_generated') {
    const thoughtEvent = event as ThoughtGeneratedEvent;
    content = thoughtEvent.thought;
    indicatorType = 'assistant';
  }

  return (
    <Box>
      <Box marginRight={1}>
        <StatusIndicator type={indicatorType} />
      </Box>
      <Box flexGrow={1} width={process.stdout.columns - 6}>
        <Text color={currentTheme.colors.text.primary} wrap='wrap'>
          {content}
        </Text>
      </Box>
    </Box>
  );
};
