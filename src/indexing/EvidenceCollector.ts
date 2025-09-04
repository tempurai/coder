import * as path from 'path';
import * as fs from 'fs/promises';
import glob from 'fast-glob';
import yaml from 'js-yaml';
import { IndentLogger } from '../utils/IndentLogger.js';

interface ConfigEvidence {
    dockerCompose?: any;
    dockerfiles: string[];
    packageJson?: any;
    pyprojectToml?: string;
    goMod?: string;
    pomXml?: string;
    cargoToml?: string;
    openApi?: any;
    kubernetes: any[];
    envFiles: string[];
}

interface DependencyInfo {
    name: string;
    type: 'runtime' | 'dev' | 'peer';
    version?: string;
}

interface PortInfo {
    port: number;
    service?: string;
    protocol: 'http' | 'https' | 'tcp' | 'udp';
    source: string;
}

export interface Evidence {
    config: ConfigEvidence;
    dependencies: DependencyInfo[];
    ports: PortInfo[];
    languages: Array<{ name: string; count: number }>;
    importantPaths: string[];
    frameworks: string[];
    databases: string[];
}

export class EvidenceCollector {
    constructor(private readonly projectRoot: string) { }

    async collect(): Promise<Evidence> {
        const config = await this.collectConfig();
        const languages = await this.analyzeLanguages();
        const importantPaths = await this.findImportantPaths();
        const dependencies = this.extractDependencies(config);
        const ports = this.extractPorts(config);
        const frameworks = this.detectFrameworks(config, dependencies);
        const databases = this.detectDatabases(dependencies, config);

        return {
            config,
            dependencies,
            ports,
            languages,
            importantPaths,
            frameworks,
            databases,
        };
    }

    private async collectConfig(): Promise<ConfigEvidence> {
        const config: ConfigEvidence = {
            dockerfiles: [],
            kubernetes: [],
            envFiles: [],
        };

        const composeFiles = await glob(['docker-compose*.yml', 'docker-compose*.yaml'], {
            cwd: this.projectRoot,
            absolute: false,
        });
        if (composeFiles.length > 0) {
            try {
                const content = await fs.readFile(path.join(this.projectRoot, composeFiles[0]), 'utf-8');
                config.dockerCompose = yaml.load(content);
            } catch {
                // Ignore parsing errors
            }
        }

        config.dockerfiles = await glob(['**/Dockerfile*'], {
            cwd: this.projectRoot,
            absolute: false,
            ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
        });

        try {
            const pkgPath = path.join(this.projectRoot, 'package.json');
            const content = await fs.readFile(pkgPath, 'utf-8');
            config.packageJson = JSON.parse(content);
        } catch { }

        try {
            config.pyprojectToml = await fs.readFile(path.join(this.projectRoot, 'pyproject.toml'), 'utf-8');
        } catch { }

        try {
            config.goMod = await fs.readFile(path.join(this.projectRoot, 'go.mod'), 'utf-8');
        } catch { }

        try {
            config.cargoToml = await fs.readFile(path.join(this.projectRoot, 'Cargo.toml'), 'utf-8');
        } catch { }

        const openApiFiles = await glob(['**/openapi.{yml,yaml,json}', '**/swagger.{yml,yaml,json}'], {
            cwd: this.projectRoot,
            absolute: false,
            ignore: ['node_modules/**'],
        });
        if (openApiFiles.length > 0) {
            try {
                const content = await fs.readFile(path.join(this.projectRoot, openApiFiles[0]), 'utf-8');
                if (openApiFiles[0].endsWith('.json')) {
                    config.openApi = JSON.parse(content);
                } else {
                    config.openApi = yaml.load(content);
                }
            } catch {
                // Ignore parsing errors
            }
        }

        const k8sFiles = await glob(['k8s/**/*.{yml,yaml}', '**/*k8s*.{yml,yaml}', '**/deployment*.{yml,yaml}'], {
            cwd: this.projectRoot,
            absolute: false,
            ignore: ['node_modules/**'],
        });
        for (const file of k8sFiles) {
            try {
                const content = await fs.readFile(path.join(this.projectRoot, file), 'utf-8');
                config.kubernetes.push(yaml.load(content));
            } catch { }
        }

        config.envFiles = await glob(['.env*', '**/.env*'], {
            cwd: this.projectRoot,
            absolute: false,
            ignore: ['node_modules/**', '.git/**'],
        });

        return config;
    }

    private async analyzeLanguages(): Promise<Array<{ name: string; count: number }>> {
        const extensions: Record<string, string> = {
            '.js': 'JavaScript',
            '.ts': 'TypeScript',
            '.jsx': 'JavaScript',
            '.tsx': 'TypeScript',
            '.py': 'Python',
            '.go': 'Go',
            '.java': 'Java',
            '.kt': 'Kotlin',
            '.rs': 'Rust',
            '.cs': 'C#',
            '.cpp': 'C++',
            '.c': 'C',
            '.php': 'PHP',
            '.rb': 'Ruby',
            '.swift': 'Swift',
        };

        const files = await glob(['**/*'], {
            cwd: this.projectRoot,
            ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**', 'vendor/**'],
            onlyFiles: true,
        });

        const counts: Record<string, number> = {};
        for (const file of files) {
            const ext = path.extname(file);
            const lang = extensions[ext];
            if (lang) {
                counts[lang] = (counts[lang] || 0) + 1;
            }
        }

        const result = Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);

        return result;
    }

    private async findImportantPaths(): Promise<string[]> {
        const patterns = [
            'src/**',
            'lib/**',
            'app/**',
            'pages/**',
            'routes/**',
            'api/**',
            'handlers/**',
            'controllers/**',
            'services/**',
            'models/**',
            'cmd/**',
            'internal/**',
            'pkg/**',
            'main.*',
            'index.*',
            'server.*',
            '*.config.*',
            'config/**',
            'migrations/**',
        ];

        const paths = await glob(patterns, {
            cwd: this.projectRoot,
            ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**', 'test/**', 'tests/**'],
            onlyFiles: true,
        });

        const weights: Record<string, number> = {
            'main.': 10,
            'index.': 9,
            'server.': 8,
            'app.': 7,
            'api/': 6,
            'routes/': 6,
            'controllers/': 5,
            'handlers/': 5,
            'services/': 4,
            'models/': 3,
            'config/': 3,
        };

        const result = paths
            .map((p: string) => ({
                path: p,
                weight: Object.entries(weights).reduce((w: number, [pattern, weight]: [string, number]) =>
                    p.includes(pattern) ? Math.max(w, weight) : w, 0
                ),
            }))
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 100)
            .map(({ path }) => path);

        return result;
    }

    private extractDependencies(config: ConfigEvidence): DependencyInfo[] {
        const deps: DependencyInfo[] = [];

        if (config.packageJson) {
            const pkg = config.packageJson;
            if (pkg.dependencies) {
                Object.entries(pkg.dependencies as Record<string, string>).forEach(([name, version]) => {
                    deps.push({ name, version, type: 'runtime' });
                });
            }
            if (pkg.devDependencies) {
                Object.entries(pkg.devDependencies as Record<string, string>).forEach(([name, version]) => {
                    deps.push({ name, version, type: 'dev' });
                });
            }
        }

        return deps;
    }

    private extractPorts(config: ConfigEvidence): PortInfo[] {
        const ports: PortInfo[] = [];

        if (config.dockerCompose?.services) {
            Object.entries(config.dockerCompose.services as Record<string, any>).forEach(([service, serviceConfig]: [string, any]) => {
                if (serviceConfig.ports && Array.isArray(serviceConfig.ports)) {
                    serviceConfig.ports.forEach((portMapping: string | number) => {
                        const portStr = String(portMapping);
                        const match = portStr.match(/(\d+):(\d+)/);
                        if (match) {
                            ports.push({
                                port: parseInt(match[1]),
                                service,
                                protocol: 'http',
                                source: 'docker-compose',
                            });
                        } else if (typeof portMapping === 'number') {
                            ports.push({
                                port: portMapping,
                                service,
                                protocol: 'http',
                                source: 'docker-compose',
                            });
                        }
                    });
                }
            });
        }

        config.kubernetes.forEach((k8sResource: any) => {
            if (k8sResource?.kind === 'Service' && k8sResource.spec?.ports) {
                k8sResource.spec.ports.forEach((port: any) => {
                    ports.push({
                        port: port.port,
                        service: k8sResource.metadata?.name,
                        protocol: port.protocol?.toLowerCase() || 'tcp',
                        source: 'kubernetes',
                    });
                });
            }
        });

        return ports;
    }

    private detectFrameworks(config: ConfigEvidence, dependencies: DependencyInfo[]): string[] {
        const frameworks: string[] = [];
        const depNames = dependencies.map((d: DependencyInfo) => d.name);

        if (depNames.includes('express')) frameworks.push('Express');
        if (depNames.includes('@nestjs/core')) frameworks.push('NestJS');
        if (depNames.includes('next')) frameworks.push('Next.js');
        if (depNames.includes('fastify')) frameworks.push('Fastify');
        if (depNames.includes('koa')) frameworks.push('Koa');

        if (config.pyprojectToml) {
            if (config.pyprojectToml.includes('fastapi')) frameworks.push('FastAPI');
            if (config.pyprojectToml.includes('django')) frameworks.push('Django');
            if (config.pyprojectToml.includes('flask')) frameworks.push('Flask');
        }

        if (config.goMod) {
            if (config.goMod.includes('gin-gonic/gin')) frameworks.push('Gin');
            if (config.goMod.includes('gorilla/mux')) frameworks.push('Gorilla Mux');
            if (config.goMod.includes('echo')) frameworks.push('Echo');
        }

        if (depNames.some((d: string) => d.includes('spring'))) frameworks.push('Spring');

        return frameworks;
    }

    private detectDatabases(dependencies: DependencyInfo[], config: ConfigEvidence): string[] {
        const databases: string[] = [];
        const depNames = dependencies.map((d: DependencyInfo) => d.name);

        if (depNames.includes('pg') || depNames.includes('postgres')) databases.push('PostgreSQL');
        if (depNames.includes('mysql') || depNames.includes('mysql2')) databases.push('MySQL');
        if (depNames.includes('mongodb') || depNames.includes('mongoose')) databases.push('MongoDB');
        if (depNames.includes('redis') || depNames.includes('ioredis')) databases.push('Redis');
        if (depNames.includes('sqlite3') || depNames.includes('better-sqlite3')) databases.push('SQLite');

        if (config.dockerCompose?.services) {
            Object.values(config.dockerCompose.services as Record<string, any>).forEach((service: any) => {
                if (service.image && typeof service.image === 'string') {
                    const image = service.image.toLowerCase();
                    if (image.includes('postgres')) databases.push('PostgreSQL');
                    if (image.includes('mysql')) databases.push('MySQL');
                    if (image.includes('mongo')) databases.push('MongoDB');
                    if (image.includes('redis')) databases.push('Redis');
                }
            });
        }

        return [...new Set(databases)];
    }
}