const https = require('https');
const fs = require('fs');
const querystring = require('querystring');
const util = require('util');

const { WebClient } = require('@slack/client');
const mongo = require('mongodb').MongoClient

const randomName = require('./randomname.js').randomName;

// grab token from environment variables
const token = process.env.SLACK_TOKEN;
const env = process.env.ENV;
const MODERATION_CHANNEL = process.env.MOD_CHANNEL;
const MODERATION_AUDIT_CHANNEL = process.env.MOD_AUDIT_CHANNEL;

const sslOptions = {
    key: fs.readFileSync('/etc/letsencrypt/live/slack.rpappa.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/slack.rpappa.com/cert.pem'),
    ca: fs.readFileSync('/etc/letsencrypt/live/slack.rpappa.com/chain.pem')
};

const mongoURL = 'mongodb://localhost:27017'

const web = new WebClient(token);
let channelList = {};

// grab channel list for hardcoding things such as #moderation and resolving channels
web.conversations.list({
    limit: 100,
    types: 'private_channel, public_channel'
}).then(channels => {
    for (let channel of channels.channels) {
        channelList[channel.id] = channel;
        console.log(`${channel.name}: ${channel.id}`);
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

mongo.connect(mongoURL, (err, client) => {
    if (err) {
        console.error(err);
        return;
    }

    const db = client.db(`slack-${env}`);

    const reportsCollection = db.collection('reports');
    const moderationAuditCollection = db.collection('moderationAudit');

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
                        resolve(querystring.parse(body))
                    });
                })
            };
            
            // slash command for anonymous posting
            if (req.url === '/slash/anon') {
                parse().then((payload) => {
                    res.end();

                    // todo: add a report button (if we're gonna do this)
                    web.chat.postMessage(
                        {
                            channel: payload.channel_id,
                            text: payload.text,
                            as_user: false,
                            username: randomName(),
                            icon_emoji: ':speaking_head_in_silhouette:'
                        }).then((postRes => {
                            // todo: auditing of some sort
                        }));

                    res.end();
                });
            } else if (req.url === '/slash/report') {
                parse().then((payload) => {
                    let urls = payload.text.match(/\bhttps?:\/\/\S+/g);

                    res.end(`Thank you for your report, it will be considered promptly. ${(urls) ? '' : 'In the future, including a URL to the message (click the ... next to it) helps the mod team. Or, just submit a report from the ... menu on any message and we\'ll include the link for you!'}`);

                    submitReport({
                        channel_id: payload.channel_id,
                        user_id: payload.user_id,
                        message_url: undefined,
                        report_message: payload.text
                    });

                });
            } else if (req.url === '/action') {
                parse().then(payload => {
                    payload = JSON.parse(payload.payload);
                    if (payload.type && payload.type === 'block_actions') {
                        let audit = {
                            moderator: payload.user.id
                        }
                        web.chat.getPermalink({
                            channel: payload.channel.id,
                            message_ts: payload.message.ts
                        }).then(linkRes => {
                            audit.reportURL = linkRes.permalink;
                            
                            // retrieve the record from the database
                            reportsCollection.findOne({action_ts: payload.message.ts}).then(record => {
                                for(let action of payload.actions) {
                                    switch(action.action_id) {
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
                                                web.chat.delete({
                                                    channel: record.report.channel_id,
                                                    ts: record.reported_message_ts
                                                });
                                            });
                                            break;
                                    }
                                }
                            });
                        })
                        res.end();
                    } else {
                        switch (payload.callback_id) {
                            case 'message_report':
                                res.end();
                                let state = {
                                    message_ts: payload.message_ts
                                }
                                web.dialog.open(
                                    {
                                        trigger_id: payload.trigger_id,
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

                                let contents = `Category: ${category}\nContents: ${(typeof payload.submission.comment === 'string') ? payload.submission.comment : 'Empty'}`

                                web.chat.getPermalink({
                                    channel: payload.channel.id,
                                    message_ts: JSON.parse(payload.state).message_ts
                                }).then(linkRes => {
                                    let report = {
                                        channel_id: payload.channel.id,
                                        user_id: payload.user.id,
                                        message_url: linkRes.permalink,
                                        report_message: contents
                                    };
                                    submitReport(report).then(action => {
                                        // save a record of this report
                                        reportsCollection.insertOne({
                                            report: report,
                                            reported_message_ts: JSON.parse(payload.state).message_ts,
                                            action_channel: action.action_channel,
                                            action_ts: action.action_ts
                                        })
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
    }).listen(443);

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

            if(report.message_url != undefined) {
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
                            "type": "context",
                            "elements": [
                                {
                                    "type": "mrkdwn",
                                    "text": `*Report contents:* ${(report.report_message === undefined) ? 'Empty' : report.report_message}`
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
                    for(let message of history.messages) {
                        let newBlocks = [];
                        for(let block of message.blocks) {
                            if(block.type != 'actions') {
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
            if(modAction == 'allow') modAction = 'allowed'
            else if(modAction == 'remove') modAction = 'removed'
            let report = audit.reportURL;
    
            web.chat.postMessage({
                channel: MODERATION_AUDIT_CHANNEL,
                as_user: false,
                username: "Auditor",
                icon_emoji: ':file_cabinet:',
                text: `<@${mod}> ${modAction} the offending message from report ${report}`
            }).then(res => {
                resolve({
                    audit_ts: res.ts
                })
            });

            // todo: also save to database
        });
    }
});