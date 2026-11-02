import { createDockerHost } from '../../lib/discord-pilot/docker-host.mjs';

// No import-time IO, installation, environment lookup or implicit credentials.
export const createHost = options => createDockerHost(options);
