const https = require('https');
const fs = require('fs');
const querystring = require('querystring');
const util = require('util');
const crypto = require('crypto');

const { WebClient } = require('@slack/client');
const { RTMClient } = require('@slack/rtm-api');
const mongo = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID;

const randomName = require('./randomname.js').randomName;

// grab environment variabless
const token = process.env.SLACK_TOKEN;
const botToken = process.env.SLACK_BOT_TOKEN;
const env = process.env.ENV;
const MODERATION_CHANNEL = process.env.MOD_CHANNEL;
const MODERATION_AUDIT_CHANNEL = process.env.MOD_AUDIT_CHANNEL;
const MODERATION_MESSAGE_CHANNEL = process.env.MOD_MESSAGE_CHANNEL;
const LISTEN_PORT = Number.parseInt(process.env.LISTEN_PORT);
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const ALLOW_ANON_CHANNELS = process.env.ALLOW_ANON_CHANNELS.split(',');

const sslOptions = {
    key: fs.readFileSync('/etc/letsencrypt/live/slack.rpappa.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/slack.rpappa.com/cert.pem'),
    ca: fs.readFileSync('/etc/letsencrypt/live/slack.rpappa.com/chain.pem')
};

const mongoURL = 'mongodb://localhost:27017'

const web = new WebClient(token);
const botWeb = new WebClient(botToken);
let channelList = {};

// grab channel list for hardcoding things such as #moderation and resolving channels
web.conversations.list({
    limit: 100,
    types: 'private_channel, public_channel'
}).then(channels => {
    for (let channel of channels.channels) {
        channelList[channel.id] = channel;
        // console.log(`${channel.name}: ${channel.id}`);
    }
});

const REPORT_CATEGORIES = [
    {
        'label': 'Discrimination / Hate Speech',
        'value': 'hate'
    },
    {
        'label': 'Harassment',
        'value': 'harassment'
    },
    {
        'label': 'Sexually Explicit Content',
        'value': 'sexual'
    },
    {
        'label': 'Promoting violence',
        'value': 'violence'
    },
    {
        'label': 'Impersonation',
        'value': 'impersonation'
    },
    {
        'label': 'Revealing private information',
        'value': 'dox'
    },
    {
        'label': 'Unsolicited Promotion',
        'value': 'promo'
    },
    {
        'label': 'Other',
        'value': 'other'
    }
]

mongo.connect(mongoURL, { useNewUrlParser: true }, (err, client) => {
    if (err) {
        console.error(err);
        return;
    }

    const db = client.db(`slack-${env}`);

    const reportsCollection = db.collection('reports');
    const moderationAuditCollection = db.collection('moderationAudit');
    const moderatorCollection = db.collection('moderators');
    const anonCollection = db.collection('anonymous');

    // http server for handling slash commands, actions etc
    https.createServer(sslOptions, (req, res) => {
        res.setHeader('content-type', 'application/json');
        res.writeHead(200);

        if (req.method === 'POST') {
            // seperate this out as we're only gonna bother parsing if it's to a valid endpoint
            let parse = () => {
                return new Promise((resolve, reject) => {
                    let body = '';
                    req.on('data', chunk => {
                        body += chunk;
                    });
                    req.on('end', () => {
                        let timestamp = req.headers['x-slack-request-timestamp'];
                        if (timestamp) {
                            timestamp = Number.parseInt(timestamp);
                            // verify the request came in the last 5 minutes
                            if (Math.abs(timestamp - Date.now() / 1000) < 3000) {
                                let sig_basestring = 'v0:' + timestamp + ':' + body;
                                let sig = 'v0=' + crypto.createHmac('sha256', SLACK_SIGNING_SECRET)
                                    .update(sig_basestring)
                                    .digest('hex');

                                let slack_sig = req.headers['x-slack-signature'];
                                if (sig === slack_sig) {
                                    // only passes the body on if the verification passes
                                    // otherwise the request will probably time out,
                                    // but that will only affect an attacker so it should be fine
                                    resolve(querystring.parse(body));
                                }
                            }
                        }
                    });
                })
            };

            // slash command for anonymous posting
            if (req.url === '/slash/anon') {
                parse().then((payload) => {
                    if (payload.text) {
                        if (ALLOW_ANON_CHANNELS.includes(payload.channel_id)) {
                            res.end();
                            web.chat.postMessage(
                                {
                                    channel: payload.channel_id,
                                    text: payload.text,
                                    as_user: false,
                                    username: randomName(),
                                    icon_emoji: ':speaking_head_in_silhouette:',
                                    blocks: [
                                        {
                                            "type": "section",
                                            "text": {
                                                "type": "mrkdwn",
                                                "text": payload.text
                                            },
                                            "accessory": {
                                                "type": "button",
                                                "text": {
                                                    "type": "plain_text",
                                                    "text": "Report"
                                                },
                                                "value": "message_report",
                                                "action_id": "message_report",
                                                "style": "danger"
                                            }
                                        }
                                    ]
                                }).then((postRes => {
                                    anonCollection.insertOne({
                                        user: payload.user_id,
                                        message: payload.text,
                                        ts: postRes.message.ts
                                    })
                                    // todo: auditing of some sort
                                }));
                        } else {
                            res.end('Anonymous messages are not allowed in this channel!');
                        }

                    } else {
                        res.end('Please include a message text! `/anon [your message here]`');
                    }


                });
            } else if (req.url === '/slash/report') {
                parse().then((payload) => {
                    let urls = payload.text.match(/\bhttps?:\/\/\S+/g);

                    res.end(`Thank you for your report, it will be considered promptly. ${(urls) ? '' : 'In the future, including a URL to the message (click the ... next to it) helps the mod team. Or, just submit a report from the ... menu on any message and we\'ll include the link for you!'}`);
                    let id = new ObjectID();

                    let report = {
                        channel_id: payload.channel_id,
                        user_id: payload.user_id,
                        message_url: undefined,
                        report_message: payload.text,
                        id: id.toHexString()
                    }

                    submitReport(report).then(action => {
                        reportsCollection.insertOne({
                            _id: id,
                            report: report,
                            reported_message_ts: undefined,
                            action_channel: action.action_channel,
                            action_ts: action.action_ts
                        })
                    });

                });
            } else if (req.url === '/slash/mods') {
                parse().then(payload => {
                    getModerators(payload.channel_id).then(mods => {
                        let channelMods = [];
                        for (let mod of mods) channelMods.push(mod.user);

                        let message = '';
                        if (channelMods.length == 0) {
                            message = 'There are no moderators for this channel!'
                        } else if (channelMods.length == 1) {
                            message = `<@${channelMods[0]}> is the only moderator for this channel.`
                        } else {
                            message = `The moderators for this channel are `
                            for (let i = 0; i < channelMods.length - 1; i++) {
                                if (i > 0) message += `, `
                                message += `<@${channelMods[i]}>`
                            }
                            if (channelMods.length != 2) message += `,`
                            message += ` and <@${channelMods[channelMods.length - 1]}>.`
                        }
                        message += " Message them by typing `/message-mods [your message here]`. Don't worry, your message will be private!";

                        res.end(message);
                    });
                })
            } else if (req.url === '/slash/messagemods') {
                parse().then(payload => {
                    getModerators(payload.channel_id).then(mods => {

                        web.chat.postMessage({
                            channel: MODERATION_MESSAGE_CHANNEL,
                            as_user: false,
                            username: "Messenger",
                            icon_emoji: ":mailbox_with_mail:",
                            blocks: [
                                { type: "divider" },
                                {
                                    "type": "section",
                                    "text": {
                                        "type": "mrkdwn",
                                        "text": `<@${payload.user_id}> sent a message: \n > ${payload.text}`
                                    }
                                },
                                {
                                    "type": "context",
                                    "elements": [
                                        {
                                            "type": "mrkdwn",
                                            "text": `Message sent in <#${payload.channel_id}>`
                                        }
                                    ]
                                }
                            ]
                        });

                        res.end(`Your message has been sent, expect a follow-up shortly.`);
                    });
                })
            } else if (req.url === '/action') {
                parse().then(payload => {
                    payload = JSON.parse(payload.payload);
                    if (payload.type && payload.type === 'block_actions') {
                        for (let action of payload.actions) {
                            if (action.action_id == 'message_report') {
                                triggerReportDialog(payload.message.ts, payload.trigger_id);
                            } else if (action.action_id.includes('report_')) {
                                let audit = {
                                    moderator: payload.user.id
                                }
                                web.chat.getPermalink({
                                    channel: payload.channel.id,
                                    message_ts: payload.message.ts
                                }).then(linkRes => {
                                    audit.reportURL = linkRes.permalink;

                                    // retrieve the record from the database
                                    reportsCollection.findOne({ action_ts: payload.message.ts }).then(record => {
                                        audit.reportId = record._id;
                                        switch (action.action_id) {
                                            case 'report_resolve':
                                                audit.action = "allow";
                                                submitModActionAudit(audit).then(auditResult => {
                                                    closeReport(payload.message.ts, auditResult.audit_ts);
                                                });
                                                break;

                                            case 'report_remove':
                                                audit.action = "remove";
                                                submitModActionAudit(audit).then(auditResult => {
                                                    closeReport(payload.message.ts, auditResult.audit_ts);
                                                    // uncomment for soft deletion
                                                    // softDelete(record.report.channel_id, record.reported_message_ts)

                                                    web.chat.delete({
                                                        channel: record.report.channel_id,
                                                        ts: record.reported_message_ts
                                                    });
                                                });
                                                break;
                                        }

                                    });
                                })
                            }
                        }
                        res.end();
                    } else {
                        switch (payload.callback_id) {
                            case 'message_report':
                                res.end();
                                triggerReportDialog(payload.message_ts, payload.trigger_id);
                                break;
                            case 'report_submit':
                                res.end();

                                let category = '';
                                for (let cat of REPORT_CATEGORIES) {
                                    if (cat.value === payload.submission.category) {
                                        category = cat.label;
                                        break
                                    }
                                }

                                let contents = `Contents: ${(typeof payload.submission.comment === 'string') ? payload.submission.comment : 'Empty'}\nCategory: ${category}`

                                web.chat.getPermalink({
                                    channel: payload.channel.id,
                                    message_ts: JSON.parse(payload.state).message_ts
                                }).then(linkRes => {
                                    web.conversations.history({
                                        channel: payload.channel.id,
                                        latest: JSON.parse(payload.state).message_ts,
                                        oldest: JSON.parse(payload.state).message_ts,
                                        inclusive: true
                                    }).then(history => {
                                        let id = new ObjectID();
                                        let report = {
                                            channel_id: payload.channel.id,
                                            user_id: payload.user.id,
                                            message_url: linkRes.permalink,
                                            report_message: contents,
                                            messages: history.messages,
                                            id: id.toHexString()
                                        };
                                        submitReport(report).then(action => {
                                            // save a record of this report
                                            reportsCollection.insertOne({
                                                _id: id,
                                                report: report,
                                                reported_message_ts: JSON.parse(payload.state).message_ts,
                                                action_channel: action.action_channel,
                                                action_ts: action.action_ts
                                            })
                                        });
                                    })

                                });
                                break;
                        }
                    }

                })
            } else {
                res.end();
            }
        } else {
            res.end();
        }
    }).listen(LISTEN_PORT);

    // rtm connection
    const rtm = new RTMClient(botToken);
    rtm.start().catch(console.error);

    rtm.on('message', message => {
        if (!message.text) return;
        let args = message.text.split(" ");
        web.users.info({
            user: message.user
        }).then(info => {
            if (info.user) {
                if (args.length >= 3 && args[0] == "!addmod") {
                    if (info.user.is_admin) {
                        let channels = [];
                        let mod = {
                            user: args[1].replace(/\<|\@|\>/g, ""), // strip out slack user formatting
                            channels: []
                        }
                        for (let i = 2; i < args.length; i++) {
                            channels.push(args[i].split("|")[0].replace(/\<|\#/g, ''))
                        }
                        addModerator(args[1].replace(/\<|\@|\>/g, ""), channels).then(() => {
                            getModerators().then(mods => {
                                botWeb.chat.postMessage({
                                    channel: message.channel,
                                    text: JSON.stringify(mods)
                                })
                            })
                        })
                    }
                } else if (args.length == 2 && args[0] == "!who") {
                    if (info.user.is_admin) {
                        let urlParts = args[1].split("/");
                        if (urlParts.length > 2) {
                            // try parsing the last part
                            let lastPart = urlParts.pop().replace('p', '').replace('>', '');
                            let ts = lastPart.substring(0, lastPart.length - 6) + '.' + lastPart.substring(lastPart.length - 6);

                            anonCollection.findOne({ ts: ts }).then(doc => {
                                if (doc.user) {
                                    botWeb.chat.postMessage({
                                        channel: message.channel,
                                        text: `Message posted by <@${doc.user}>`
                                    });

                                    web.chat.postMessage({
                                        channel: MODERATION_AUDIT_CHANNEL,
                                        as_user: false,
                                        username: "Auditor",
                                        icon_emoji: ':file_cabinet:',
                                        text: `<@${message.user}> revealed the sender of ${args[1]}`
                                    })
                                } else {
                                    botWeb.chat.postMessage({
                                        channel: message.channel,
                                        text: `Couldn't determine who posted!   `
                                    });
                                }
                            });

                        }
                    }
                }
            }
        }).catch(err => {
            // do nothing it's probably from getting the bots own message
        })
    })

    function triggerReportDialog(reportedMessageTs, triggerId) {
        let state = {
            message_ts: reportedMessageTs
        }
        web.dialog.open(
            {
                trigger_id: triggerId,
                dialog: {
                    title: 'Report a message',
                    callback_id: 'report_submit',
                    state: JSON.stringify(state),
                    elements: [
                        {
                            'label': 'Report Category',
                            'type': 'select',
                            'name': 'category',
                            'options': REPORT_CATEGORIES
                        },
                        {
                            "label": "Additional information",
                            "name": "comment",
                            "type": "textarea",
                            "optional": true,
                            "hint": 'Provide additional information if needed. If you chose "Other" as the report category, we highly reccomend you write something here.'
                        }
                    ]
                }
            }
        ).then(res => {
            // todo maybe do something?
        });
    }

    /**
     * Submit a report to the moderation channel
     * 
     * @param report a object containing:
     * 
     * channel_id: the channel the report was submitted in
     * 
     * (optional) user_id: the user that submitted the report
     * 
     * (optional) message_url: the url to the reported message
     * 
     * (optional) report_message: the report message contents
     */
    function submitReport(report) {

        return new Promise((resolve, reject) => {
            let user = (report.user_id === undefined) ? "Anonymous" : `<@${report.user_id}>`;

            let channel = (channelList[report.channel_id]) ? `<#${report.channel_id}|${channelList[report.channel_id].name}>` :
                `an unknown channel`;

            let mainBlock = {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": `${user} left a report in ${channel}`
                }
            }
            if (report.message_url != undefined) {
                mainBlock.accessory = {
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "View Message",
                        "emoji": true
                    },
                    "url": report.message_url
                }
            }

            let actions = [{
                "type": "button",
                "text": {
                    "type": "plain_text",
                    "text": (report.message_url != undefined) ? "Allow" : "Resolve",
                    "emoji": true
                },
                "action_id": "report_resolve"
            }];

            if (report.message_url != undefined) {
                actions.push({
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "Remove",
                        "emoji": true
                    },
                    "action_id": "report_remove"
                });
            }


            web.chat.postMessage(
                {
                    channel: MODERATION_CHANNEL,
                    as_user: false,
                    username: "Report Reporter",
                    icon_emoji: ':bangbang:',
                    blocks: [
                        {
                            "type": "divider"
                        },
                        mainBlock,
                        {
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": `*Report contents:*\n ${(report.report_message === undefined) ? 'Empty' : report.report_message}`
                            }
                        },
                        {
                            "type": "context",
                            "elements": [
                                {
                                    "type": "mrkdwn",
                                    "text": `Report ID: ${report.id}`
                                }
                            ]
                        },
                        {
                            "type": "actions",
                            "elements": actions
                        }
                    ]
                }
            ).then((res) => {
                resolve({
                    action_channel: res.channel,
                    action_ts: res.ts
                })
            });

        })


    }

    /**
     * Closes a report, removing the actions from it and linking to the audit message
     * @param {Number} reportTs timestamp of the report message
     * @param {Number} auditTs timestamp of the audit message
     */
    function closeReport(reportTs, auditTs) {
        return new Promise((resolve, reject) => {
            web.chat.getPermalink({
                channel: MODERATION_AUDIT_CHANNEL,
                message_ts: auditTs
            }).then(res => {
                web.conversations.history({
                    channel: MODERATION_CHANNEL,
                    latest: reportTs,
                    oldest: reportTs,
                    inclusive: true
                }).then(history => {
                    for (let message of history.messages) {
                        let newBlocks = [];
                        for (let block of message.blocks) {
                            if (block.type != 'actions') {
                                newBlocks.push(block);
                            }
                        }
                        newBlocks.push({
                            "type": "section",
                            "text": {
                                "type": "mrkdwn",
                                "text": `Closed, audit link: ${res.permalink}`
                            }
                        })
                        web.chat.update({
                            channel: MODERATION_CHANNEL,
                            ts: reportTs,
                            blocks: newBlocks
                        })
                    }
                });
            })

        });
    }

    /**
     * Submit a moderation audit
     * @param {Object} audit with the "moderator" and "action" properties 
     */
    function submitModActionAudit(audit) {
        return new Promise((resolve, reject) => {
            let mod = audit.moderator;
            let modAction = audit.action;
            // convert actions to english
            if (modAction == 'allow') modAction = 'allowed'
            else if (modAction == 'remove') modAction = 'removed'
            let report = audit.reportURL;

            moderationAuditCollection.insertOne({
                reportId: audit.reportId,
                mod: audit.moderator,
                modAction: audit.action
            })

            web.chat.postMessage({
                channel: MODERATION_AUDIT_CHANNEL,
                as_user: false,
                username: "Auditor",
                icon_emoji: ':file_cabinet:',
                text: `<@${mod}> ${modAction} the offending message from report ${report}`
            }).then(res => {
                resolve({
                    audit_ts: res.ts
                });

                reportsCollection.findOne({ _id: audit.reportId }).then(record => {
                    // get the original report to include message text with the audit
                    if (record.report.messages) {
                        for (let message of record.report.messages) {
                            if (message.text && (message.user || message.bot_id)) {
                                web.chat.postMessage({
                                    channel: MODERATION_AUDIT_CHANNEL,
                                    as_user: false,
                                    username: "Auditor",
                                    icon_emoji: ':file_cabinet:',
                                    thread_ts: res.ts,
                                    text: `*Original message*\n<@${(message.user) ? message.user : "anon"}>: ${message.text}`
                                }).then(res => {

                                })
                            }
                        }
                    }
                });
            });

            // todo: also save to database
        });
    }

    /**
     * "Soft Delete" a message by editing it
     * Will need to ensure the user doesn't edit it back
     * @param {String} channel 
     * @param {Number} messageTs 
     */
    function softDelete(channel, messageTs) {
        web.chat.update({
            channel: channel,
            ts: messageTs,
            text: `[_This message has been removed by a moderator_]`
        })
    }

    function addModerator(userId, channels) {
        return new Promise((resolve, reject) => {
            moderatorCollection.replaceOne({ user: userId }, {
                user: userId,
                channels: channels
            }, { upsert: true }).then(resolve);
        });
    }

    function getModerators(channel) {
        return new Promise((resolve, reject) => {

            let mods = [];
            let cursor = moderatorCollection.find();

            cursor.forEach(doc => {
                if (!channel ||
                    (channel && doc.channels.includes('all') || doc.channels.includes(channel)))
                    mods.push(doc)
            }).then(() => {
                resolve(mods)
            })
        })
    }
});