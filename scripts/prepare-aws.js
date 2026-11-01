// Generates a reviewable AWS request. Never creates resources or reads secret values.
import { readFile, writeFile } from 'node:fs/promises';
const path = process.argv[2];
if (!path) throw Error('Usage: node scripts/prepare-aws.js deploy/aws/config.local.json');
const config = JSON.parse(await readFile(path, 'utf8'));
if (JSON.stringify(config).includes('REPLACE')) throw Error('Fill every REPLACE placeholder first.');
if (!/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(config.region) || !/^\d{12}$/.test(config.accountId)) throw Error('A valid AWS region and account ID are required.');
if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(config.imageTag)) throw Error('Use a valid immutable image tag such as a commit SHA.');
if (!/^[a-z0-9.-]+$/.test(config.apiHost) || !config.apiHost.includes('.') || config.apiHost === 'api.example.com') throw Error('Set the exact API hostname.');
const frontend = new URL(config.frontendOrigin);
if (frontend.protocol !== 'https:' || frontend.origin !== config.frontendOrigin || frontend.username || frontend.password) throw Error('Use an exact HTTPS frontend origin.');
for (const key of ['executionRoleArn', 'infrastructureRoleArn']) {
  if (!config[key]?.startsWith(`arn:aws:iam::${config.accountId}:role/`)) throw Error(`Invalid ${key}.`);
}
if (!Array.isArray(config.subnets) || config.subnets.length < 2 || config.subnets.some((id) => !/^subnet-[a-f0-9]+$/.test(id))) throw Error('Provide two valid application subnet IDs.');
if (!Array.isArray(config.securityGroups) || !config.securityGroups.length || config.securityGroups.some((id) => !/^sg-[a-f0-9]+$/.test(id))) throw Error('Provide the application security group.');
for (const name of ['DJANGO_SECRET_KEY', 'DATABASE_URL', 'OPENAI_API_KEY']) {
  if (!config.secretArns?.[name]?.startsWith(`arn:aws:secretsmanager:${config.region}:${config.accountId}:secret:`)) throw Error(`Provide a same-region ${name} secret ARN, never its value.`);
}
const request = {
  serviceName: 'hibi-api',
  executionRoleArn: config.executionRoleArn,
  infrastructureRoleArn: config.infrastructureRoleArn,
  healthCheckPath: '/api/health', cpu: '512', memory: '1024', cpuArchitecture: 'X86_64',
  primaryContainer: {
    image: `${config.accountId}.dkr.ecr.${config.region}.amazonaws.com/hibi-api:${config.imageTag}`,
    containerPort: 8000,
    environment: Object.entries({ DJANGO_DEBUG: 'false', DJANGO_ALLOWED_HOSTS: config.apiHost,
      HIBI_FRONTEND_ORIGINS: config.frontendOrigin, DJANGO_TRUST_PROXY_SSL: 'true',
      OPENAI_MODEL: 'gpt-5-mini', OPENAI_TRANSCRIPTION_MODEL: 'gpt-4o-mini-transcribe', WEB_CONCURRENCY: '2',
    }).map(([name, value]) => ({ name, value })),
    secrets: Object.entries(config.secretArns).map(([name, valueFrom]) => ({ name, valueFrom })),
  },
  networkConfiguration: { subnets: config.subnets, securityGroups: config.securityGroups },
};
const output = process.argv[3] || 'deploy/aws/service.generated.json';
await writeFile(output, `${JSON.stringify(request, null, 2)}\n`);
console.log(`Prepared ${output}. Review the network, cost, roles, and secrets before creating resources.`);
