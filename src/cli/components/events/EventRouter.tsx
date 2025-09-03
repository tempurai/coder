import React from 'react';
import { UIEvent, UIEventType } from '../../../events/index.js';
import { ShellExecutionEventItem } from './ShellExecutionEventItem.js';
import { DiffEventItem } from './DiffEventItem.js';
import { GenericToolEventItem } from './GenericToolEventItem.js';
import { TextEventItem } from './TextEventItem.js';
import { SystemEventItem } from './SystemEventItem.js';

interface EventRouterProps {
  event: UIEvent;
  index: number;
}

export const EventRouter: React.FC<EventRouterProps> = ({ event, index }) => {
  switch (event.type) {
    case UIEventType.ToolExecutionStarted:
      const toolEvent = event as any;
      const toolName = toolEvent.toolName;

      // 根据工具类型选择不同的渲染组件
      if (toolName === 'shell_executor' || toolName === 'multi_command') {
        return <ShellExecutionEventItem event={event} index={index} />;
      }

      // 如果是patch工具，使用diff渲染
      if (toolName === 'apply_patch') {
        return <DiffEventItem event={event} index={index} />;
      }

      // 其他工具使用通用渲染
      return <GenericToolEventItem event={event} index={index} />;

    case UIEventType.TextGenerated:
    case UIEventType.ThoughtGenerated:
      return <TextEventItem event={event} index={index} />;

    case UIEventType.UserInput:
    case UIEventType.TaskComplete:
    case UIEventType.SystemInfo:
    case UIEventType.SnapshotCreated:
      return <SystemEventItem event={event} index={index} />;

    case UIEventType.TaskStart:
    case UIEventType.ToolConfirmationRequest:
    case UIEventType.ToolConfirmationResponse:
      return <></>;

    default:
      return <SystemEventItem event={event} index={index} />;
  }
};
