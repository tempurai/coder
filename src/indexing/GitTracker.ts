import { execSync } from 'child_process';

export class GitTracker {
    constructor(private readonly projectRoot: string) { }

    async getCurrentHash(): Promise<string> {
        try {
            const hash = execSync('git rev-parse HEAD', {
                cwd: this.projectRoot,
                encoding: 'utf-8'
            }).trim();
            return hash;
        } catch {
            return `no-git-${Date.now()}`;
        }
    }

    async getChangedFiles(since?: string): Promise<string[]> {
        if (!since) return [];

        try {
            const output = execSync(`git diff --name-only ${since}..HEAD`, {
                cwd: this.projectRoot,
                encoding: 'utf-8'
            });

            return output.trim().split('\n').filter(Boolean);
        } catch {
            return [];
        }
    }

    async getCommitInfo(hash?: string): Promise<{
        hash: string;
        message: string;
        author: string;
        date: string;
    } | null> {
        try {
            const targetHash = hash || 'HEAD';
            const info = execSync(`git show --format="%H|%s|%an|%ai" --no-patch ${targetHash}`, {
                cwd: this.projectRoot,
                encoding: 'utf-8'
            }).trim();

            const [commitHash, message, author, date] = info.split('|');

            return {
                hash: commitHash,
                message,
                author,
                date
            };
        } catch {
            return null;
        }
    }
}