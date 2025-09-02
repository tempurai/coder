export enum ExecutionMode {
    CODE = 'code',
    PLAN = 'plan'
}

export const ExecutionModeData = [
    {
        mode: ExecutionMode.PLAN,
        displayName: 'Plan Mode',
        description: 'Research and analyze, no file modifications',
    },
    {
        mode: ExecutionMode.CODE,
        displayName: 'Code Mode',
        description: 'Full development capabilities with file modifications',
    }
]

export const getExecutionModeDisplayInfo = (targetMode: ExecutionMode) => {
    const modeData = ExecutionModeData.find(item => item.mode === targetMode);
    return modeData ? { ...modeData } : null;
}