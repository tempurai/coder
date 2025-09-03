import React from 'react';
import { CLIEvent, CLIEventType } from '../../hooks/useSessionEvents.js';
import { ShellExecutionEventItem } from './ShellExecutionEventItem.js';
import { DiffEventItem } from './DiffEventItem.js';
import { GenericToolEventItem } from './GenericToolEventItem.js';
import { TextEventItem } from './TextEventItem.js';
import { SystemEventItem } from './SystemEventItem.js';

interface EventRouterProps {
  event: CLIEvent;
  index: number;
}

export const EventRouter: React.FC<EventRouterProps> = ({ event, index }) => {
  switch (event.type) {
    case CLIEventType.TOOL_EXECUTION:
      // 从原始事件获取工具名称
      const toolName = (event.originalEvent as any)?.toolName;

      if (toolName === 'shell_executor' || toolName === 'multi_command') {
        return <ShellExecutionEventItem event={event} index={index} />;
      }

      if (toolName === 'apply_patch') {
        return <DiffEventItem event={event} index={index} />;
      }

      return <GenericToolEventItem event={event} index={index} />;

    case CLIEventType.AI_RESPONSE:
      return <TextEventItem event={event} index={index} />;

    case CLIEventType.USER_INPUT:
    case CLIEventType.SYSTEM_INFO:
      return <SystemEventItem event={event} index={index} />;

    default:
      return <SystemEventItem event={event} index={index} />;
  }
};
