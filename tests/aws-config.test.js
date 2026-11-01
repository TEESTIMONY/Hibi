import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('AWS request includes secret references, HTTPS settings and the correct image; incomplete config is refused', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'hibi-aws-test-'));
  const input = join(folder, 'config.json');
  const output = join(folder, 'service.json');
  try {
    const config = { region: 'eu-west-1', accountId: '000000000000', imageTag: 'test-commit',
      apiHost: 'api.hibi.example', frontendOrigin: 'https://hibi.example',
      executionRoleArn: 'arn:aws:iam::000000000000:role/test-execution',
      infrastructureRoleArn: 'arn:aws:iam::000000000000:role/test-infrastructure',
      subnets: ['subnet-123abc', 'subnet-456def'], securityGroups: ['sg-123abc'],
      secretArns: Object.fromEntries(['DATABASE_URL', 'DJANGO_SECRET_KEY', 'OPENAI_API_KEY'].map((name) =>
        [name, `arn:aws:secretsmanager:eu-west-1:000000000000:secret:${name}`])),
    };
    await writeFile(input, JSON.stringify(config));
    const run = () => spawnSync(process.execPath, ['scripts/prepare-aws.js', input, output], { encoding: 'utf8' });
    assert.equal(run().status, 0);
    const request = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(request.healthCheckPath, '/api/health');
    assert.equal(request.primaryContainer.containerPort, 8000);
    assert.match(request.primaryContainer.image, /hibi-api:test-commit$/);
    assert.equal(request.primaryContainer.secrets.length, 3);
    assert.equal(request.primaryContainer.environment.find((item) => item.name === 'DJANGO_DEBUG').value, 'false');
    assert.equal(request.primaryContainer.environment.some((item) => item.name === 'OPENAI_API_KEY'), false);
    await writeFile(input, JSON.stringify({ ...config, region: 'REPLACE_REGION' }));
    assert.notEqual(run().status, 0);
    await writeFile(input, JSON.stringify({ ...config, frontendOrigin: 'http://hibi.example' }));
    assert.notEqual(run().status, 0);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
