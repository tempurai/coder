import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../themes/index.js';
import { useUiStore } from '../stores/uiStore.js';
import { getContainer } from '../../di/container.js';
import { TYPES } from '../../di/types.js';
import { ProjectIndexer } from '../../indexing/ProjectIndexer.js';
import { UIEventEmitter } from '../../events/UIEventEmitter.js';
import { IndentLogger } from '../../utils/IndentLogger.js';
import { TaskCompletedEvent, TaskStartedEvent } from '../../events/EventTypes.js';

interface Command {
  name: string;
  label: string;
  description: string;
}

const commands: Command[] = [
  { name: 'mode', label: 'Execution Mode', description: 'Switch between Code and Plan modes' },
  { name: 'theme', label: 'Change Theme', description: 'Select a new color theme for the UI' },
  { name: 'index', label: 'Index Project', description: 'Analyze and project structure and generate index' },
  { name: 'help', label: 'Help', description: 'Show available commands and shortcuts' },
];

interface CommandPaletteProps {
  onSelect: () => void;
  onCancel: () => void;
  onModeSelect: () => void;
  onThemeSelect: () => void;
  isFocused: boolean;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ onSelect, onCancel, onModeSelect, onThemeSelect, isFocused }) => {
  const { currentTheme } = useTheme();
  const { setActivePanel } = useUiStore((state) => state.actions);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleSelect = (selectedCommand: Command) => {
    if (selectedCommand.name === 'mode') {
      onModeSelect();
    } else if (selectedCommand.name === 'theme') {
      onThemeSelect();
    } else if (selectedCommand.name === 'help') {
      setActivePanel('HELP');
    } else if (selectedCommand.name === 'index') {
      // 1. Close the command palette immediately.
      onSelect();

      // 2. Get necessary services from the DI container.
      const container = getContainer();
      const indexer = container.get<ProjectIndexer>(TYPES.ProjectIndexer);
      const eventEmitter = container.get<UIEventEmitter>(TYPES.UIEventEmitter);
      IndentLogger.setEventEmitter(eventEmitter); // Ensure indexer logs are sent to the UI.

      // 3. Start the indexing process asynchronously.
      (async () => {
        const startTime = Date.now();
        // 4. Notify the UI that a background task has started.
        eventEmitter.emit({
          type: 'task_started',
          displayTitle: 'Project Indexing',
          description: 'Analyzing project structure...',
          workingDirectory: process.cwd(),
        } as TaskStartedEvent);

        try {
          await indexer.analyze({ force: false });
          // 5. Notify the UI that the task is finished (success).
          eventEmitter.emit({
            type: 'task_completed',
            displayTitle: 'Indexing Finished',
            terminateReason: 'FINISHED',
            duration: Date.now() - startTime,
            iterations: 0,
            summary: 'Project indexing completed successfully.',
          } as TaskCompletedEvent);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          // 6. Notify the UI that the task is finished (error).
          eventEmitter.emit({
            type: 'task_completed',
            displayTitle: 'Indexing Failed',
            terminateReason: 'ERROR',
            duration: Date.now() - startTime,
            iterations: 0,
            error: errorMessage,
            summary: `Project indexing failed: ${errorMessage}`,
          } as TaskCompletedEvent);
        }
      })();
    } else {
      // Fallback for any other commands.
      onSelect();
    }
  };

  useInput(
    (input, key) => {
      if (key.upArrow) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : commands.length - 1));
      } else if (key.downArrow) {
        setSelectedIndex((prev) => (prev < commands.length - 1 ? prev + 1 : 0));
      } else if (key.return) {
        handleSelect(commands[selectedIndex]);
      } else if (key.escape) {
        onCancel();
      }
    },
    { isActive: isFocused },
  );

  return (
    <Box flexDirection='column' borderStyle='round' borderColor={currentTheme.colors.ui.border} paddingX={1}>
      <Box marginBottom={1}>
        <Text color={currentTheme.colors.primary} bold>
          Command Palette
        </Text>
      </Box>
      {commands.map((command, index) => (
        <Box key={command.name} flexDirection='row' justifyContent='space-between'>
          <Text color={selectedIndex === index ? currentTheme.colors.accent : currentTheme.colors.text.primary} bold={selectedIndex === index}>
            {selectedIndex === index ? '› ' : '  '}
            {command.label}
          </Text>
          <Text>{'     '}</Text>
          <Text color={currentTheme.colors.text.muted}>{command.description}</Text>
        </Box>
      ))}
    </Box>
  );
};
