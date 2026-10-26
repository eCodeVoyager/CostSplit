// pm2 process for the sync server + web app. Secrets live in /opt/costsplit/.env.
// One instance only (fork mode): writes per group are serialized inside the process.
module.exports = {
  apps: [
    {
      name: "costsplit",
      cwd: "/opt/costsplit",
      script: "server/server.mjs",
      node_args: "--env-file=/opt/costsplit/.env --max-old-space-size=192",
      exec_mode: "fork",
      instances: 1,
      max_memory_restart: "300M",
      // The server waits up to 10 s for in-flight writes on shutdown
      kill_timeout: 12000,
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "8790",
        DATA_DIR: "/opt/costsplit/data",
        STATIC_DIR: "/opt/costsplit/dist",
        TRUST_PROXY: "1",
      },
    },
  ],
}
