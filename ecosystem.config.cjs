module.exports = {
  apps: [
    {
      name: 'tg-agent',
      cwd: '/Users/ming/.openclaw/workspace/tg-agent',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production'
      },
      out_file: '/tmp/tg-agent-out.log',
      error_file: '/tmp/tg-agent-error.log',
      merge_logs: true,
      time: true
    }
  ]
};
