module.exports = {
  apps: [{
    name: 'RedSlack',
    script: 'index.js',
    append_env_to_name: true,

    // Options reference: https://pm2.io/doc/en/runtime/reference/ecosystem-file/
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: { // settings for test
      SLACK_TOKEN: "[insert slack token here]",
      SLACK_BOT_TOKEN: "[insert bot user token here]",
      SLACK_SIGNING_SECRET: "[insert signing secret here]",
      ENV: "test",
      MOD_CHANNEL: "[insert channel id here]",
      MOD_AUDIT_CHANNEL: "[insert channel id here]",
      MOD_MESSAGE_CHANNEL: "[insert channel id here]",
      ALLOW_ANON_CHANNELS: "[comma],[separated],[channel],[id(s)]",
      LISTEN_PORT: "8080"
    }, // settings for prod
    env_production: {
      SLACK_TOKEN: "[insert slack token here]",
      SLACK_BOT_TOKEN: "[insert bot user token here]",
      SLACK_SIGNING_SECRET: "[insert signing secret here]",
      ENV: "prod",
      MOD_CHANNEL: "[insert channel id here]",
      MOD_AUDIT_CHANNEL: "[insert channel id here]",
      MOD_MESSAGE_CHANNEL: "[insert channel id here]",
      ALLOW_ANON_CHANNELS: "[comma],[separated],[channel],[id(s)]",
      LISTEN_PORT: "443"
    }
  }]
};
