# RedSlack (name tbd)

Helps run Big Red Slack. More info coming soon.

# Testing / running

To install, do the usual `npm install`

For development and production we run on a Google Cloud VM. We employ [PM2](http://pm2.keymetrics.io/) to manage our test and prod environments. Copy `example-ecosystem.config.js` into `ecosystem.config.js`, fill out the appropriate variables in the `env` section, and run:

    pm2 start ecosystem.config.js --watch 

Read more about it in the PM2 docs.