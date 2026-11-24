const assert = require('node:assert/strict');
const test = require('node:test');
const { waitForArtifact } = require('./wait.cjs');

const artifact = { name: 'github-pages-123-2', id: 456 };
const unrelated = { name: 'github-pages-123-1', id: 789 };

function discovery(responses) {
  let calls = 0;
  const delays = [];
  const messages = [];
  return {
    get calls() { return calls; },
    delays,
    messages,
    options: {
      artifactName: artifact.name,
      artifactId: String(artifact.id),
      log: (message) => messages.push(message),
      sleep: async (ms) => { delays.push(ms); },
      client: {
        async listArtifacts() {
          const response = responses[calls++];
          if (response instanceof Error) throw response;
          return { artifacts: response };
        },
      },
    },
  };
}

test('visible upload returns immediately without waiting', async () => {
  const run = discovery([[unrelated, artifact]]);
  assert.equal(await waitForArtifact(run.options), artifact);
  assert.equal(run.calls, 1);
  assert.deepEqual(run.delays, []);
});

test('missing upload is retried with backoff despite unrelated artifacts', async () => {
  const run = discovery([[unrelated], [], [unrelated], [], [unrelated, artifact]]);
  assert.equal(await waitForArtifact(run.options), artifact);
  assert.equal(run.calls, 5);
  assert.deepEqual(run.delays, [1000, 2000, 4000, 8000]);
  assert.equal(run.messages.filter((message) => message.includes('retrying')).length, 4);
});

test('exhausted discovery fails explicitly', async () => {
  const run = discovery([[], [], [], [], []]);
  await assert.rejects(waitForArtifact(run.options), /after 5 discovery attempts/);
  assert.equal(run.calls, 5);
  assert.deepEqual(run.delays, [1000, 2000, 4000, 8000]);
});

test('duplicate names fail without retrying', async () => {
  const run = discovery([[artifact, { ...artifact, id: 999 }]]);
  await assert.rejects(waitForArtifact(run.options), /Multiple artifacts/);
  assert.equal(run.calls, 1);
  assert.deepEqual(run.delays, []);
});

test('a different uploaded ID fails without retrying', async () => {
  const run = discovery([[{ ...artifact, id: 999 }]]);
  await assert.rejects(waitForArtifact(run.options), /does not match uploaded ID/);
  assert.equal(run.calls, 1);
  assert.deepEqual(run.delays, []);
});

test('artifact service errors are propagated without retrying', async () => {
  const error = new Error('Artifact service unavailable');
  const run = discovery([error]);
  await assert.rejects(waitForArtifact(run.options), (actual) => actual === error);
  assert.equal(run.calls, 1);
  assert.deepEqual(run.delays, []);
});
