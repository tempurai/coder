import React from 'react';
import { Box, Text } from 'ink';
import { UIEvent } from '../../../events/index.js';
import { useTheme } from '../../themes/index.js';
import { StatusIndicator } from '../StatusIndicator.js';

interface DiffEventItemProps {
  event: UIEvent;
  index: number;
}

// Inline types for diff parsing
interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

interface DiffLine {
  type: 'context' | 'added' | 'removed' | 'header' | 'hunk';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
  isFileHeader?: boolean;
}

interface ParsedDiff {
  oldFile: string;
  newFile: string;
  hunks: DiffHunk[];
  fileHeaders: DiffLine[];
}

// Diff parser function (inline)
const parseDiff = (diffContent: string): ParsedDiff | null => {
  if (!diffContent || typeof diffContent !== 'string') {
    return null;
  }

  const lines = diffContent.split(/\r?\n/);
  const parsed: ParsedDiff = {
    oldFile: '',
    newFile: '',
    hunks: [],
    fileHeaders: [],
  };

  let currentHunk: DiffHunk | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // File headers
    if (line.startsWith('--- ')) {
      parsed.oldFile = line.substring(4);
      parsed.fileHeaders.push({
        type: 'header',
        content: line,
        isFileHeader: true,
      });
      continue;
    }

    if (line.startsWith('+++ ')) {
      parsed.newFile = line.substring(4);
      parsed.fileHeaders.push({
        type: 'header',
        content: line,
        isFileHeader: true,
      });
      continue;
    }

    // Hunk headers
    if (line.startsWith('@@')) {
      const hunkMatch = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (hunkMatch) {
        const oldStart = parseInt(hunkMatch[1], 10);
        const oldCount = parseInt(hunkMatch[2] || '1', 10);
        const newStart = parseInt(hunkMatch[3], 10);
        const newCount = parseInt(hunkMatch[4] || '1', 10);

        currentHunk = {
          oldStart,
          oldCount,
          newStart,
          newCount,
          lines: [],
        };

        // Add hunk header as a line
        currentHunk.lines.push({
          type: 'hunk',
          content: line,
        });

        parsed.hunks.push(currentHunk);
        oldLineNum = oldStart;
        newLineNum = newStart;
      }
      continue;
    }

    // Content lines
    if (currentHunk) {
      if (line.startsWith('+')) {
        currentHunk.lines.push({
          type: 'added',
          content: line.substring(1),
          newLineNumber: newLineNum++,
        });
      } else if (line.startsWith('-')) {
        currentHunk.lines.push({
          type: 'removed',
          content: line.substring(1),
          oldLineNumber: oldLineNum++,
        });
      } else if (line.startsWith(' ') || line === '') {
        currentHunk.lines.push({
          type: 'context',
          content: line.substring(1),
          oldLineNumber: oldLineNum++,
          newLineNumber: newLineNum++,
        });
      }
    }
  }

  return parsed;
};

// Inline diff renderer component
interface DiffRendererProps {
  diffContent: string;
}

const DiffRenderer: React.FC<DiffRendererProps> = ({ diffContent }) => {
  const { currentTheme } = useTheme();
  const parsed = parseDiff(diffContent);

  if (!parsed) {
    return (
      <Text color={currentTheme.colors.text.secondary} wrap='wrap'>
        {diffContent}
      </Text>
    );
  }

  const formatLineNumber = (num?: number, width: number = 3): string => {
    if (num === undefined) return ' '.repeat(width);
    return num.toString().padStart(width, ' ');
  };

  const getBackgroundColor = (lineType: DiffLine['type']): string | undefined => {
    switch (lineType) {
      case 'added':
        return 'green';
      case 'removed':
        return 'red';
      default:
        return undefined;
    }
  };

  const getTextColor = (lineType: DiffLine['type']) => {
    switch (lineType) {
      case 'added':
        return 'black'; // Dark text on green background
      case 'removed':
        return 'white'; // White text on red background
      case 'context':
        return currentTheme.colors.text.primary;
      case 'header':
        return currentTheme.colors.text.muted;
      case 'hunk':
        return currentTheme.colors.accent;
      default:
        return currentTheme.colors.text.primary;
    }
  };

  const getLinePrefix = (lineType: DiffLine['type']): string => {
    switch (lineType) {
      case 'added':
        return '+';
      case 'removed':
        return '-';
      case 'context':
        return ' ';
      case 'header':
        return '';
      case 'hunk':
        return '';
      default:
        return '';
    }
  };

  const getLineNumber = (line: DiffLine): number | undefined => {
    // For added lines: use new line number
    if (line.type === 'added') {
      return line.newLineNumber;
    }

    // For removed lines: use old line number
    if (line.type === 'removed') {
      return line.oldLineNumber;
    }

    // For context lines: use new line number (same as old for context)
    if (line.type === 'context') {
      return line.newLineNumber || line.oldLineNumber;
    }

    // For headers and hunks: no line numbers
    return undefined;
  };

  return (
    <Box flexDirection='column'>
      {/* File headers */}
      {parsed.fileHeaders.map((header, index) => (
        <Box key={`header-${index}`}>
          <Text color={currentTheme.colors.text.muted}>{header.content}</Text>
        </Box>
      ))}

      {/* Hunks */}
      {parsed.hunks.map((hunk, hunkIndex) => (
        <Box key={`hunk-${hunkIndex}`} flexDirection='column'>
          {hunk.lines.map((line, lineIndex) => {
            const backgroundColor = getBackgroundColor(line.type);
            const textColor = getTextColor(line.type);
            const prefix = getLinePrefix(line.type);

            // Hunk header line
            if (line.type === 'hunk') {
              return (
                <Box key={`${hunkIndex}-${lineIndex}`} marginY={0}>
                  <Text color={currentTheme.colors.accent} bold>
                    {line.content}
                  </Text>
                </Box>
              );
            }

            const lineNumber = getLineNumber(line);

            return (
              <Box key={`${hunkIndex}-${lineIndex}`} flexDirection='row'>
                {/* Single line number column */}
                <Text color={currentTheme.colors.diff.lineNumber}>{formatLineNumber(lineNumber)}</Text>

                <Text color={currentTheme.colors.text.muted}> </Text>

                {/* Change indicator and content with background */}
                <Text color={textColor} backgroundColor={backgroundColor}>
                  {prefix}
                  {'   '}
                  {line.content}
                </Text>
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
};

export const DiffEventItem: React.FC<DiffEventItemProps> = ({ event }) => {
  const { currentTheme } = useTheme();
  const toolEvent = event as any;
  const executionStatus = toolEvent.executionStatus || 'started';
  const completedData = toolEvent.completedData;
  const displayTitle = toolEvent.displayTitle || 'Diff';
  const isCompleted = executionStatus === 'completed' || executionStatus === 'failed';
  const isError = executionStatus === 'failed';

  let diffContent = '';
  if (isCompleted && completedData) {
    diffContent = completedData.displayDetails || completedData.error || '';
  }

  const indicatorType = isError ? 'error' : 'tool';
  const statusSymbol = isError ? '✗' : isCompleted ? '✓' : '~';

  return (
    <Box flexDirection='column'>
      <Box>
        <Box marginRight={1}>
          <StatusIndicator type={indicatorType} isActive={!isCompleted} />
        </Box>
        <Text color={isError ? currentTheme.colors.error : currentTheme.colors.text.primary} bold>
          {statusSymbol} {displayTitle}
        </Text>
      </Box>
      {diffContent && (
        <Box marginLeft={2}>
          <Text color={currentTheme.colors.text.muted}>⎿ </Text>
          <Box flexGrow={1}>
            <DiffRenderer diffContent={diffContent} />
          </Box>
        </Box>
      )}
    </Box>
  );
};
