module.exports = {
  apps: [
    {
      name: 'agent-os-runtime',
      cwd: '/var/www/agent-os',
      script: 'server/hermes-system-bridge.mjs',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      node_args: '--max-old-space-size=192',
      env: {
        NODE_ENV: 'production',
        HERMES_HOST: '127.0.0.1',
        HERMES_PORT: '8787',
        HERMES_WS_PATH: '/hermes',
        HERMES_WORKSPACE: '/var/www/agent-os',
        HERMES_ALLOWED_ROOTS: '/var/www/agent-os',
        HERMES_ALLOW_INPUT: '0',
        HERMES_ALLOW_WRITE: '0',
        HERMES_ALLOW_SHELL: '0',
        AGENTOS_SEARCH_TIMEOUT_MS: '9000',
        AGENTOS_SEARCH_RESULT_LIMIT: '8'
      }
    }
  ]
};
