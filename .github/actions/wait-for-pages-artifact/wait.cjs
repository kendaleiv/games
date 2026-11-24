async function waitForArtifact({
  client,
  artifactName,
  artifactId,
  log,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (!artifactName || !artifactId) {
    throw new Error('The uploaded Pages artifact name and ID are required.');
  }

  const delays = [1000, 2000, 4000, 8000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    // Use the same artifact-service listing as actions/deploy-pages, not the REST API.
    const { artifacts } = await client.listArtifacts();
    const matches = artifacts.filter((artifact) => artifact.name === artifactName);
    if (matches.length > 1) {
      throw new Error(`Multiple artifacts named "${artifactName}" were found.`);
    }
    if (matches.length === 1) {
      if (String(matches[0].id) !== String(artifactId)) {
        throw new Error(`Artifact "${artifactName}" does not match uploaded ID ${artifactId}.`);
      }
      log(`Pages artifact "${artifactName}" (${artifactId}) is visible.`);
      return matches[0];
    }
    if (attempt === delays.length) {
      throw new Error(`No artifact named "${artifactName}" was found after 5 discovery attempts.`);
    }
    log(`Pages artifact "${artifactName}" is not visible; retrying in ${delays[attempt]} ms.`);
    await sleep(delays[attempt]);
  }
}

module.exports = { waitForArtifact };
