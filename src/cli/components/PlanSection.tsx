import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../themes/index.js';
import { XMLParser } from 'fast-xml-parser';

interface PlanSectionProps {
  plan: string;
  iteration: number;
}

interface ParsedPlan {
  task?: string;
  status?: string;
  updated?: string;
  steps?: Array<{
    content: string;
    priority?: string;
  }>;
  notes?: string;
}

export const PlanSection: React.FC<PlanSectionProps> = ({ plan, iteration }) => {
  const { currentTheme } = useTheme();
  
  // Parse XML plan
  const parsePlan = (planXml: string): ParsedPlan => {
    try {
      const parser = new XMLParser({
        ignoreAttributes: false,
        trimValues: true,
      });
      
      const parsed = parser.parse(planXml);
      const planData = parsed.plan || {};
      
      // Handle steps array
      let steps: Array<{ content: string; priority?: string }> = [];
      if (planData.steps?.step) {
        const stepData = Array.isArray(planData.steps.step) 
          ? planData.steps.step 
          : [planData.steps.step];
          
        steps = stepData.map((step: any) => ({
          content: typeof step === 'string' ? step : (step['#text'] || step),
          priority: step['@_priority'] || undefined,
        }));
      }
      
      return {
        task: planData.task,
        status: planData.status,
        updated: planData.updated,
        steps,
        notes: planData.notes,
      };
    } catch (error) {
      // Fallback for non-XML plans
      return { notes: planXml };
    }
  };

  const parsedPlan = parsePlan(plan);
  
  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return currentTheme.colors.error;
      case 'medium': return currentTheme.colors.warning;
      case 'low': return currentTheme.colors.text.muted;
      default: return currentTheme.colors.text.primary;
    }
  };

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={currentTheme.colors.react.plan} bold>
          📋 Plan:
        </Text>
        {parsedPlan.status && (
          <Text color={currentTheme.colors.text.muted}>
            {' '}• {parsedPlan.status}
          </Text>
        )}
      </Box>
      
      <Box flexDirection="column" marginTop={1} marginLeft={2}>
        {parsedPlan.steps && parsedPlan.steps.length > 0 ? (
          parsedPlan.steps.map((step, index) => (
            <Box key={index} marginBottom={1}>
              <Text color={getPriorityColor(step.priority)}>
                {index + 1}. {step.content}
              </Text>
            </Box>
          ))
        ) : (
          <Text color={currentTheme.colors.text.primary}>{parsedPlan.notes || 'No plan details'}</Text>
        )}
      </Box>
    </Box>
  );
};