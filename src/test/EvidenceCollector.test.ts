import { EvidenceCollector } from '../indexing/EvidenceCollector.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as glob from 'fast-glob';
import * as yaml from 'js-yaml';

// Mock external dependencies
jest.mock('fs/promises');
jest.mock('fast-glob');
jest.mock('js-yaml');
jest.mock('path');

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedGlob = glob as jest.Mocked<typeof glob>;
const mockedYaml = yaml as jest.Mocked<typeof yaml>;
const mockedPath = path as jest.Mocked<typeof path>;

describe('EvidenceCollector', () => {
  const projectRoot = '/test/project';
  let collector: EvidenceCollector;

  beforeEach(() => {
    jest.clearAllMocks();
    collector = new EvidenceCollector(projectRoot);
    
    // Setup default mocks
    mockedPath.join.mockImplementation((...paths) => paths.join('/'));
    mockedPath.extname.mockImplementation((p: string) => {
      const parts = p.split('.');
      return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
    });
  });

  describe('collect', () => {
    it('should collect comprehensive evidence', async () => {
      // Setup mocks for config collection
      (mockedGlob.glob as any).mockImplementation((pattern: string[]) => {
        if (pattern.includes('docker-compose*.yml')) {
          return Promise.resolve(['docker-compose.yml']);
        }
        if (pattern.includes('**/Dockerfile*')) {
          return Promise.resolve(['Dockerfile']);
        }
        if (pattern.includes('**/*')) {
          return Promise.resolve(['src/index.ts', 'src/app.js', 'test.py']);
        }
        return Promise.resolve([]);
      });

      mockedFs.readFile.mockImplementation((filePath: any) => {
        if (filePath.includes('package.json')) {
          return Promise.resolve(JSON.stringify({
            dependencies: { express: '^4.18.0', 'pg': '^8.7.0' },
            devDependencies: { jest: '^29.0.0' }
          }));
        }
        if (filePath.includes('docker-compose.yml')) {
          return Promise.resolve(`
version: '3.8'
services:
  app:
    ports:
      - "3000:3000"
  db:
    image: postgres:13
`);
        }
        return Promise.resolve('');
      });

      mockedYaml.load.mockReturnValue({
        version: '3.8',
        services: {
          app: { ports: ['3000:3000'] },
          db: { image: 'postgres:13' }
        }
      });

      const evidence = await collector.collect();

      expect(evidence).toHaveProperty('config');
      expect(evidence).toHaveProperty('dependencies');
      expect(evidence).toHaveProperty('ports');
      expect(evidence).toHaveProperty('languages');
      expect(evidence).toHaveProperty('importantPaths');
      expect(evidence).toHaveProperty('frameworks');
      expect(evidence).toHaveProperty('databases');
    });
  });

  describe('language analysis', () => {
    it('should correctly identify programming languages', async () => {
      const files = [
        'src/index.ts',
        'src/app.js',
        'src/component.tsx',
        'api/server.py',
        'cmd/main.go',
        'models/user.java',
        'lib/utils.rs'
      ];

      (mockedGlob.glob as any).mockResolvedValue(files);
      mockedFs.readFile.mockRejectedValue(new Error('File not found'));

      const evidence = await collector.collect();

      expect(evidence.languages).toContainEqual({ name: 'TypeScript', count: 2 });
      expect(evidence.languages).toContainEqual({ name: 'JavaScript', count: 1 });
      expect(evidence.languages).toContainEqual({ name: 'Python', count: 1 });
      expect(evidence.languages).toContainEqual({ name: 'Go', count: 1 });
      expect(evidence.languages).toContainEqual({ name: 'Java', count: 1 });
      expect(evidence.languages).toContainEqual({ name: 'Rust', count: 1 });
    });

    it('should sort languages by count in descending order', async () => {
      const files = [
        'src/index.ts', 'src/app.ts', 'src/utils.ts',
        'api/server.js',
        'test.py'
      ];

      (mockedGlob.glob as any).mockResolvedValue(files);
      mockedFs.readFile.mockRejectedValue(new Error('File not found'));

      const evidence = await collector.collect();
      
      expect(evidence.languages[0]).toEqual({ name: 'TypeScript', count: 3 });
      expect(evidence.languages[1]).toEqual({ name: 'JavaScript', count: 1 });
      expect(evidence.languages[2]).toEqual({ name: 'Python', count: 1 });
    });
  });

  describe('dependency extraction', () => {
    it('should extract runtime and dev dependencies from package.json', async () => {
      const packageJson = {
        dependencies: {
          'express': '^4.18.0',
          'pg': '^8.7.0',
          'lodash': '^4.17.21'
        },
        devDependencies: {
          'jest': '^29.0.0',
          '@types/node': '^18.0.0'
        }
      };

      (mockedGlob.glob as any).mockResolvedValue([]);
      mockedFs.readFile.mockImplementation((filePath: any) => {
        if (filePath.includes('package.json')) {
          return Promise.resolve(JSON.stringify(packageJson));
        }
        return Promise.reject(new Error('File not found'));
      });

      const evidence = await collector.collect();

      expect(evidence.dependencies).toHaveLength(5);
      expect(evidence.dependencies).toContainEqual({ name: 'express', version: '^4.18.0', type: 'runtime' });
      expect(evidence.dependencies).toContainEqual({ name: 'pg', version: '^8.7.0', type: 'runtime' });
      expect(evidence.dependencies).toContainEqual({ name: 'jest', version: '^29.0.0', type: 'dev' });
    });
  });

  describe('port extraction', () => {
    it('should extract ports from docker-compose.yml', async () => {
      const dockerComposeContent = `
version: '3.8'
services:
  web:
    ports:
      - "3000:3000"
      - "8080:8080"
  api:
    ports:
      - 4000
`;

      (mockedGlob.glob as any).mockImplementation((pattern: string[]) => {
        if (pattern.includes('docker-compose*.yml')) {
          return Promise.resolve(['docker-compose.yml']);
        }
        return Promise.resolve([]);
      });

      mockedFs.readFile.mockImplementation((filePath: any) => {
        if (filePath.includes('docker-compose.yml')) {
          return Promise.resolve(dockerComposeContent);
        }
        return Promise.reject(new Error('File not found'));
      });

      mockedYaml.load.mockReturnValue({
        version: '3.8',
        services: {
          web: { ports: ['3000:3000', '8080:8080'] },
          api: { ports: [4000] }
        }
      });

      const evidence = await collector.collect();

      expect(evidence.ports).toHaveLength(3);
      expect(evidence.ports).toContainEqual({
        port: 3000,
        service: 'web',
        protocol: 'http',
        source: 'docker-compose'
      });
      expect(evidence.ports).toContainEqual({
        port: 8080,
        service: 'web',
        protocol: 'http',
        source: 'docker-compose'
      });
      expect(evidence.ports).toContainEqual({
        port: 4000,
        service: 'api',
        protocol: 'http',
        source: 'docker-compose'
      });
    });

    it('should extract ports from kubernetes manifests', async () => {
      const k8sService = {
        kind: 'Service',
        metadata: { name: 'my-service' },
        spec: {
          ports: [
            { port: 80, protocol: 'TCP' },
            { port: 443, protocol: 'HTTPS' }
          ]
        }
      };

      (mockedGlob.glob as any).mockImplementation((pattern: string[]) => {
        if (pattern.includes('k8s/**/*.{yml,yaml}')) {
          return Promise.resolve(['k8s/service.yml']);
        }
        return Promise.resolve([]);
      });

      mockedFs.readFile.mockImplementation((filePath: any) => {
        if (filePath.includes('service.yml')) {
          return Promise.resolve('k8s service content');
        }
        return Promise.reject(new Error('File not found'));
      });

      mockedYaml.load.mockReturnValue(k8sService);

      const evidence = await collector.collect();

      expect(evidence.ports).toContainEqual({
        port: 80,
        service: 'my-service',
        protocol: 'tcp',
        source: 'kubernetes'
      });
      expect(evidence.ports).toContainEqual({
        port: 443,
        service: 'my-service',
        protocol: 'https',
        source: 'kubernetes'
      });
    });
  });

  describe('framework detection', () => {
    it('should detect Node.js frameworks from dependencies', async () => {
      const packageJson = {
        dependencies: {
          'express': '^4.18.0',
          '@nestjs/core': '^9.0.0',
          'next': '^13.0.0',
          'fastify': '^4.0.0',
          'koa': '^2.13.0'
        }
      };

      (mockedGlob.glob as any).mockResolvedValue([]);
      mockedFs.readFile.mockImplementation((filePath: any) => {
        if (filePath.includes('package.json')) {
          return Promise.resolve(JSON.stringify(packageJson));
        }
        return Promise.reject(new Error('File not found'));
      });

      const evidence = await collector.collect();

      expect(evidence.frameworks).toContain('Express');
      expect(evidence.frameworks).toContain('NestJS');
      expect(evidence.frameworks).toContain('Next.js');
      expect(evidence.frameworks).toContain('Fastify');
      expect(evidence.frameworks).toContain('Koa');
    });

    it('should detect Python frameworks from pyproject.toml', async () => {
      const pyprojectContent = `
[tool.poetry.dependencies]
python = "^3.9"
fastapi = "^0.88.0"
django = "^4.1.0"
flask = "^2.2.0"
`;

      (mockedGlob.glob as any).mockResolvedValue([]);
      mockedFs.readFile.mockImplementation((filePath: any) => {
        if (filePath.includes('pyproject.toml')) {
          return Promise.resolve(pyprojectContent);
        }
        return Promise.reject(new Error('File not found'));
      });

      const evidence = await collector.collect();

      expect(evidence.frameworks).toContain('FastAPI');
      expect(evidence.frameworks).toContain('Django');
      expect(evidence.frameworks).toContain('Flask');
    });

    it('should detect Go frameworks from go.mod', async () => {
      const goModContent = `
module myproject

go 1.19

require (
    github.com/gin-gonic/gin v1.9.0
    github.com/gorilla/mux v1.8.0
    github.com/labstack/echo/v4 v4.10.0
)
`;

      (mockedGlob.glob as any).mockResolvedValue([]);
      mockedFs.readFile.mockImplementation((filePath: any) => {
        if (filePath.includes('go.mod')) {
          return Promise.resolve(goModContent);
        }
        return Promise.reject(new Error('File not found'));
      });

      const evidence = await collector.collect();

      expect(evidence.frameworks).toContain('Gin');
      expect(evidence.frameworks).toContain('Gorilla Mux');
      expect(evidence.frameworks).toContain('Echo');
    });
  });

  describe('database detection', () => {
    it('should detect databases from package.json dependencies', async () => {
      const packageJson = {
        dependencies: {
          'pg': '^8.7.0',
          'mysql2': '^3.0.0',
          'mongoose': '^6.0.0',
          'redis': '^4.0.0',
          'sqlite3': '^5.0.0'
        }
      };

      (mockedGlob.glob as any).mockResolvedValue([]);
      mockedFs.readFile.mockImplementation((filePath: any) => {
        if (filePath.includes('package.json')) {
          return Promise.resolve(JSON.stringify(packageJson));
        }
        return Promise.reject(new Error('File not found'));
      });

      const evidence = await collector.collect();

      expect(evidence.databases).toContain('PostgreSQL');
      expect(evidence.databases).toContain('MySQL');
      expect(evidence.databases).toContain('MongoDB');
      expect(evidence.databases).toContain('Redis');
      expect(evidence.databases).toContain('SQLite');
    });

    it('should detect databases from docker-compose services', async () => {
      const dockerComposeContent = `
version: '3.8'
services:
  postgres:
    image: postgres:13
  mysql:
    image: mysql:8.0
  mongo:
    image: mongo:latest
  redis:
    image: redis:alpine
`;

      (mockedGlob.glob as any).mockImplementation((pattern: string[]) => {
        if (pattern.includes('docker-compose*.yml')) {
          return Promise.resolve(['docker-compose.yml']);
        }
        return Promise.resolve([]);
      });

      mockedFs.readFile.mockImplementation((filePath: any) => {
        if (filePath.includes('docker-compose.yml')) {
          return Promise.resolve(dockerComposeContent);
        }
        return Promise.reject(new Error('File not found'));
      });

      mockedYaml.load.mockReturnValue({
        version: '3.8',
        services: {
          postgres: { image: 'postgres:13' },
          mysql: { image: 'mysql:8.0' },
          mongo: { image: 'mongo:latest' },
          redis: { image: 'redis:alpine' }
        }
      });

      const evidence = await collector.collect();

      expect(evidence.databases).toContain('PostgreSQL');
      expect(evidence.databases).toContain('MySQL');
      expect(evidence.databases).toContain('MongoDB');
      expect(evidence.databases).toContain('Redis');
    });

    it('should deduplicate detected databases', async () => {
      const packageJson = {
        dependencies: { 'pg': '^8.7.0' }
      };

      const dockerComposeContent = `
version: '3.8'
services:
  postgres:
    image: postgres:13
`;

      (mockedGlob.glob as any).mockImplementation((pattern: string[]) => {
        if (pattern.includes('docker-compose*.yml')) {
          return Promise.resolve(['docker-compose.yml']);
        }
        return Promise.resolve([]);
      });

      mockedFs.readFile.mockImplementation((filePath: any) => {
        if (filePath.includes('package.json')) {
          return Promise.resolve(JSON.stringify(packageJson));
        }
        if (filePath.includes('docker-compose.yml')) {
          return Promise.resolve(dockerComposeContent);
        }
        return Promise.reject(new Error('File not found'));
      });

      mockedYaml.load.mockReturnValue({
        version: '3.8',
        services: {
          postgres: { image: 'postgres:13' }
        }
      });

      const evidence = await collector.collect();

      const postgresCount = evidence.databases.filter(db => db === 'PostgreSQL').length;
      expect(postgresCount).toBe(1);
    });
  });

  describe('important paths detection', () => {
    it('should identify and weight important paths correctly', async () => {
      const files = [
        'src/index.ts',
        'src/main.ts',
        'src/server.ts',
        'src/app.ts',
        'src/api/users.ts',
        'src/routes/auth.ts',
        'src/controllers/user.ts',
        'src/services/email.ts',
        'src/models/user.ts',
        'config/database.ts',
        'README.md'
      ];

      (mockedGlob.glob as any).mockImplementation((pattern: string[]) => {
        if (Array.isArray(pattern) && pattern.some(p => p.includes('src/**'))) {
          return Promise.resolve(files);
        }
        return Promise.resolve([]);
      });

      mockedFs.readFile.mockRejectedValue(new Error('File not found'));

      const evidence = await collector.collect();

      expect(evidence.importantPaths).toContain('src/main.ts');
      expect(evidence.importantPaths).toContain('src/index.ts');
      expect(evidence.importantPaths).toContain('src/server.ts');
      expect(evidence.importantPaths).toContain('src/api/users.ts');
      
      // Main files should be weighted higher and appear first
      expect(evidence.importantPaths.indexOf('src/main.ts')).toBeLessThan(
        evidence.importantPaths.indexOf('src/models/user.ts')
      );
    });
  });

  describe('error handling', () => {
    it('should handle file read errors gracefully', async () => {
      (mockedGlob.glob as any).mockResolvedValue([]);
      mockedFs.readFile.mockRejectedValue(new Error('Permission denied'));

      const evidence = await collector.collect();

      expect(evidence.config).toBeDefined();
      expect(evidence.dependencies).toEqual([]);
      expect(evidence.ports).toEqual([]);
      expect(evidence.languages).toEqual([]);
    });

    it('should handle YAML parsing errors gracefully', async () => {
      (mockedGlob.glob as any).mockImplementation((pattern: string[]) => {
        if (pattern.includes('docker-compose*.yml')) {
          return Promise.resolve(['docker-compose.yml']);
        }
        return Promise.resolve([]);
      });

      mockedFs.readFile.mockResolvedValue('invalid yaml content: [[[');
      mockedYaml.load.mockImplementation(() => {
        throw new Error('Invalid YAML');
      });

      const evidence = await collector.collect();

      expect(evidence.config.dockerCompose).toBeUndefined();
      expect(evidence.ports).toEqual([]);
    });

    it('should handle JSON parsing errors gracefully', async () => {
      (mockedGlob.glob as any).mockResolvedValue([]);
      mockedFs.readFile.mockImplementation((filePath: any) => {
        if (filePath.includes('package.json')) {
          return Promise.resolve('{ invalid json content');
        }
        return Promise.reject(new Error('File not found'));
      });

      const evidence = await collector.collect();

      expect(evidence.config.packageJson).toBeUndefined();
      expect(evidence.dependencies).toEqual([]);
    });
  });
});