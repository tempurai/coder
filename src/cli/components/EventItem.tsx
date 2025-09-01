import React from 'react';
import { Box, Text } from 'ink';
import { UIEvent, UIEventType, TextGeneratedEvent, TaskCompletedEvent } from '../../events/index.js';
import { useTheme } from '../themes/index.js';
import { StatusIndicator } from './StatusIndicator.js';

interface EventItemProps {
  event: UIEvent;
  index: number;
  detailMode: boolean;
}

interface ParsedDiffLine {
  type: 'add' | 'remove' | 'context' | 'header';
  content: string;
  lineNumber?: string;
}

export const EventItem: React.FC<EventItemProps> = React.memo(({ event, index, detailMode }) => {
  const { currentTheme } = useTheme();

  const parseDiffContent = (content: string): ParsedDiffLine[] => {
    const lines = content.split('\n');
    const parsed: ParsedDiffLine[] = [];
    for (const line of lines) {
      if (line.startsWith('@@')) {
        parsed.push({ type: 'header', content: line });
      } else if (line.startsWith('+')) {
        parsed.push({ type: 'add', content: line });
      } else if (line.startsWith('-')) {
        parsed.push({ type: 'remove', content: line });
      } else {
        parsed.push({ type: 'context', content: line });
      }
    }
    return parsed;
  };

  const renderDiffContent = (content: string) => {
    const diffLines = parseDiffContent(content);
    return (
      <Box flexDirection='column' marginLeft={2}>
        {diffLines.map((line, idx) => {
          let color = currentTheme.colors.diff.context;
          if (line.type === 'add') color = currentTheme.colors.diff.added;
          else if (line.type === 'remove') color = currentTheme.colors.diff.removed;
          else if (line.type === 'header') color = currentTheme.colors.diff.modified;
          return (
            <Text key={idx} color={color}>
              {line.content}
            </Text>
          );
        })}
      </Box>
    );
  };

  const truncateContent = (content: string, maxLines: number = 20, isError: boolean = false): { content: string; truncated: boolean } => {
    const lines = content.split('\n');
    const limit = isError ? 100 : maxLines;

    if (lines.length <= limit) {
      return { content, truncated: false };
    }

    return {
      content: lines.slice(0, limit).join('\n'),
      truncated: true,
    };
  };

  const getEventContent = () => {
    switch (event.type) {
      case UIEventType.UserInput:
        const userEvent = event as any;
        return {
          indicatorType: 'user' as const,
          functionCall: `> ${userEvent.input}`,
          resultSummary: null,
          details: null,
        };

      case UIEventType.TextGenerated:
        const textEvent = event as TextGeneratedEvent;
        return {
          indicatorType: 'system' as const,
          functionCall: null,
          resultSummary: null,
          details: null,
          directContent: textEvent.text,
        };

      case UIEventType.TaskComplete:
        const taskCompleteEvent = event as TaskCompletedEvent;
        return {
          indicatorType: taskCompleteEvent.success ? ('system' as const) : ('error' as const),
          functionCall: 'TaskComplete()',
          resultSummary: null,
          details: null,
        };

      case UIEventType.ThoughtGenerated:
        const thoughtEvent = event as any;
        return {
          indicatorType: 'assistant' as const,
          functionCall: null,
          resultSummary: null,
          details: null,
          directContent: thoughtEvent.thought,
        };

      case UIEventType.ToolExecutionStarted:
        const toolEvent = event as any;
        const executionStatus = toolEvent.executionStatus || 'started';
        const completedData = toolEvent.completedData;
        const outputData = toolEvent.outputData;

        // 构建显示标题
        let displayTitle = toolEvent.displayTitle;
        if (!displayTitle && toolEvent.toolName) {
          const toolName = toolEvent.toolName;
          if (toolName === 'shell_executor') {
            displayTitle = `Bash(${toolEvent.args?.command || 'unknown'})`;
          } else if (toolName === 'multi_command') {
            displayTitle = `MultiCommand(${toolEvent.args?.commands?.length || 0} commands)`;
          } else if (toolName === 'write_file') {
            displayTitle = `Write(${toolEvent.args?.filePath || 'file'})`;
          } else if (toolName === 'apply_patch') {
            displayTitle = `Update(${toolEvent.args?.filePath || 'file'})`;
          } else {
            displayTitle = `${toolName}()`;
          }
        }

        // 确定显示内容
        let resultSummary = null;
        let details = null;
        let isDiff = false;
        let isError = false;

        if (executionStatus === 'completed' || executionStatus === 'failed') {
          isError = executionStatus === 'failed';
          if (completedData) {
            if (completedData.displayDetails) {
              const truncated = truncateContent(completedData.displayDetails, 20, isError);
              details = truncated.content;
              isDiff = toolEvent.toolName === 'apply_patch' && completedData.displayDetails;
            } else if (completedData.result) {
              if (typeof completedData.result === 'object') {
                if (completedData.result.stdout) {
                  const truncated = truncateContent(completedData.result.stdout, 20, isError);
                  details = truncated.content;
                } else {
                  details = JSON.stringify(completedData.result, null, 2);
                }
              } else {
                const truncated = truncateContent(String(completedData.result), 20, isError);
                details = truncated.content;
              }
            }

            if (completedData.error) {
              const truncated = truncateContent(completedData.error, 20, true);
              details = truncated.content;
              isError = true;
            }
          }
        } else if (outputData && outputData.length > 0) {
          // 显示最新的输出内容
          const latestOutput = outputData[outputData.length - 1];
          if (latestOutput.content && latestOutput.content !== `Executing: ${toolEvent.args?.command}`) {
            const truncated = truncateContent(latestOutput.content, 20, false);
            details = truncated.content;
          }
        }

        // 处理 MultiCommand 特殊显示
        if (toolEvent.toolName === 'multi_command' && completedData?.result?.results) {
          const results = completedData.result.results;
          const multiCommandDetails = results
            .map((r: any, idx: number) => {
              const status = r.success ? '✓' : '✗';
              let commandDetail = `${idx + 1}/${results.length}: ${r.command} ${status}`;
              if (r.stdout || r.stderr) {
                const output = [r.stdout, r.stderr].filter(Boolean).join('\n');
                commandDetail += `\n  ⎿ ${output}`;
              }
              return commandDetail;
            })
            .join('\n');
          const truncated = truncateContent(multiCommandDetails, 50, isError);
          details = truncated.content;
        }

        return {
          indicatorType: executionStatus === 'failed' ? ('error' as const) : ('tool' as const),
          functionCall: displayTitle,
          resultSummary,
          details,
          isDiff,
          isMultiCommand: toolEvent.toolName === 'multi_command',
          isError,
        };

      case UIEventType.SystemInfo:
        const sysEvent = event as any;
        return {
          indicatorType: sysEvent.level === 'error' ? ('error' as const) : ('system' as const),
          functionCall: null,
          resultSummary: null,
          details: null,
          directContent: sysEvent.message,
        };

      case UIEventType.SnapshotCreated:
        const snapEvent = event as any;
        return {
          indicatorType: 'system' as const,
          functionCall: 'snapshot_created()',
          resultSummary: `Event processed`,
          details: detailMode ? `ID: ${snapEvent.snapshotId}, Files: ${snapEvent.filesCount}` : null,
        };

      default:
        return {
          indicatorType: 'system' as const,
          functionCall: `${event.type}()`,
          resultSummary: 'Event processed',
          details: detailMode ? JSON.stringify(event, null, 2) : null,
        };
    }
  };

  const { indicatorType, functionCall, resultSummary, details, isDiff, isMultiCommand, directContent, isError } = getEventContent();

  // 特殊处理直接内容显示事件 (Think, TextGenerated)
  if (directContent) {
    return (
      <Box flexDirection='column'>
        <Box>
          <Box marginRight={1}>
            <StatusIndicator type={indicatorType} />
          </Box>
          <Text color={currentTheme.colors.text.primary}>{directContent}</Text>
        </Box>
      </Box>
    );
  }

  // 标准事件显示（有标题的事件）
  return (
    <Box flexDirection='column'>
      {functionCall && (
        <Box>
          <Box marginRight={1}>
            <StatusIndicator type={indicatorType} />
          </Box>
          <Box flexGrow={1}>
            <Text color={currentTheme.colors.text.primary} bold>
              {functionCall}
            </Text>
          </Box>
        </Box>
      )}

      {details && (
        <Box marginLeft={2}>
          <Text color={currentTheme.colors.text.muted}>⎿ </Text>
          <Box flexDirection='column' flexGrow={1}>
            {isMultiCommand ? (
              // MultiCommand 的特殊格式化显示
              <Box flexDirection='column'>
                {details.split('\n').map((line, idx) => {
                  if (line.trim().startsWith('⎿')) {
                    return (
                      <Box key={idx} marginLeft={2}>
                        <Text color={currentTheme.colors.text.muted}>{line}</Text>
                      </Box>
                    );
                  } else {
                    return (
                      <Text key={idx} color={currentTheme.colors.text.secondary}>
                        {line}
                      </Text>
                    );
                  }
                })}
              </Box>
            ) : isDiff ? (
              renderDiffContent(details)
            ) : (
              <Text color={currentTheme.colors.text.secondary}>{details}</Text>
            )}
            {!detailMode && details.length > 500 && <Text color={currentTheme.colors.text.muted}> (ctrl+r to expand)</Text>}
          </Box>
        </Box>
      )}
    </Box>
  );
});
