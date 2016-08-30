var _ = require('lodash');
var async = require('async');
var fs = require('fs');
var glob = require('glob');
var request = require('request');
var Botkit = require('botkit');
var Trello = require('node-trello');
var Chess = require('chess.js').Chess;
var chess = null;

var string = function(input) {
	return JSON.stringify(input, null, 2);
}
var l = function(title, input) {
	console.log(title);
	console.log(input);
	//console.log(string(input));
	console.log();
}

// Start Slack Connection
var controller = Botkit.slackbot({ debug : false });
controller.setupWebserver(process.env.PORT || 3000);
var bot = controller.spawn({token : process.env.token });
bot.startRTM();

// Access Trello
// TODO XXX Is this safe?
var trello = new Trello('3c3032368c3c88ac3ba8799f3e37d935', 'ee99dec582dbbbacf02f864f93cc3c2771d521203c36563f482f886734f22f6c');

// User IDs
var users = {
	haoyang: {
		name: 'haoyang',
		slack: 'U0HMLSLKY',
		trello: '53ed667b3f5d4e4c4e1c5902',
		scm: 9118,
		scmcookie: process.env.scmcookiehaoyang,
		slacktoken: process.env.slacktokenhaoyang,
		gitlabtoken: process.env.gitlabtokenhaoyang,
		gitlab: 2
	},
	ushal: {
		name: 'ushal',
		slack: 'U0HMMNE9W',
		trello: '563fc2beb2e713d534da52ce',
		scm: 11729,
		scmcookie: process.env.scmcookieushal,
		gitlabtoken: process.env.gitlabtokenushal,
		gitlab: 4
	},
	melody: {
		name: 'melody',
		slack: 'U0J4CGQKW',
		trello: '5578c1e12f582a666e7bca4a',
		gitlabtoken: process.env.gitlabtokenmelody,
		gitlab: 8
	},
	jack: {
		name: 'jack',
		slack: 'U0M20CGS1'
	},
	kevin: {
		name: 'kevin',
		gitlab: 5
	}
};
var t2n = function(t) {
	var user = _.find(users, { trello: t});
	return user && user.name;
};
var n2t = function(n) {
	var user =  _.find(users, { name: n })
	return user && user.trello;
};
var n2u = function(n) {
	return _.find(users, { name: n });
};
var s2t = function(s) {
	var user = _.find(users, { slack: s });
	return user && user.trello;
};
var s2u = function(s) {
	return _.find(users, { slack: s });
};
var g2u = function(g) {
	return _.find(users, { gitlab: g });
};

// Slack IDs
var channels = {
	testjack: 'C14N0EPGC',
	dev: 'C0L4PU8S1',
	vm: 'C16HEPJTV',
	qapreview: 'C0M20LYJF',
	planning: 'C0JAB2CAD'
};
var bots = {
	trello: 'B0HSGEXF1'
}

// Trello IDs
var boards = {
	ult: 'OckJNZuy'
}

// GitLab IDs
var inv = 1;

// Trello Utility
var tlists = function(cb) {
	trello.get('/1/boards/' + boards.ult + '/lists', { filter: 'open', fields: 'name' }, function(err, lists) {
		cb(lists);
	});
};
var tcards = function(listnameprefix, cb) {
	tlists(function(lists) {
		var devlistid = _.find(lists, function(list) { return list.name.indexOf(listnameprefix) > -1; }).id;
		trello.get('/1/lists/' + devlistid + '/cards', { filter: 'open', fields: 'name,idMembers,desc' }, function(err, cards) {
			cb(cards);
		});
	});
};

var tassign = function(card, name) {
	trello.put('/1/cards/' + card.id + '/idMembers', { value: n2t(name) }, function(err) {});
}

var tassignmany = function(card, names) {
	var userstoassign = n2t(names[0]);
	for (var i = 1 ; i < names.length; i++) {
		userstoassign += ',' + n2t(names[i])
	}
	trello.put('/1/cards/' + card.id + '/idMembers', { value: userstoassign }, function(err) {});
}

// - Find code from card
var tcode = function(card) {
	return card.name.match(/(^| )([a-z1-9]*-[a-z1-9\-]*)($| )/)[2];
};

// - Find scm from card
// FIXME This might match on a Kall number which still needs SCM created
var tscm = function(card) {
	var match = card.name.match(/\d{6}/);
	return match ? match[0] : null;
};
	
// - Find card by code
// - cb(card)
var tfcode = function(code, cb) {
	tcards('Dev Sprint', function(cards) {
		cb(_.find(cards, function(card) { return tcode(card) == code; }));
	});
};

// - Find scm number by code
// - cb(scm)
var code2scm = function(code, cb) {
	tfcode(code, function(card) {
		cb(tscm(card));
	});
};

// GitLab Utility

// - Find branch by prefix
// - cb([branches])
var findbranch = function(prefix, cb) {
	request.get({
		url: 'http://nzvult/api/v3/projects/' + inv + '/repository/branches',
		headers: { 'PRIVATE-TOKEN': users.haoyang.gitlabtoken }
	}, function(err, res, body) {
		var bodyjson = eval('(' + body + ')');
		cb(_.filter(bodyjson, function(branch) {
			return branch.name.indexOf(prefix) >= 0;
		}));
	});
}

// - Get MR URL
var mrurl = function(mrid) {
	return 'http://nzvult/haoyang.feng/inv/merge_requests/' + mrid;
}

// - user: The user who coded the feature
var newmr = function(user, card, source, target, cb) {
	request.post({
		url: 'http://nzvult/api/v3/projects/' + inv + '/merge_requests',
		form: {
			id: inv,
			target_branch: target,
			source_branch: source,
			title: source,
			description: (card ? ('ULT SCM ' + tscm(card) + ' - ' + card.desc) : 'No description') + '\n' + user.name
		},
		headers: { 'PRIVATE-TOKEN': user.gitlabtoken }
	}, function(err, res, body) {
		var bodyjson = eval('(' + body + ')');
		if (!bodyjson.iid) newmr(user, card, source, target, cb);
		else if (cb) cb(bodyjson.iid);
	});
}

// - Find MR by title
// - cb(mr)
var findmr = function(title, cb) {
	request.get({
		url: 'http://nzvult/api/v3/projects/' + inv + '/merge_requests?state=opened',
		headers: { 'PRIVATE-TOKEN': users.haoyang.gitlabtoken }
	}, function(err, res, body) {
		// FIXME potentially won't find the MR if there're more than 20 as there're 20 MR per request page
		var bodyjson = eval('(' + body + ')');
		cb(_.find(bodyjson, { title: title }));
	});
}

// - Merge MR by title
// - cb()
var mergemr = function(user, title, cb) {
	findmr(title, function(mr) {
		request.put({
			url: 'http://nzvult/api/v3/projects/' + inv + '/merge_request/' + mr.id + '/merge?merge_when_build_succeeds=true&should_remove_source_branch=false',
			form: { id: inv, merge_request_id: mr.id },
			headers: { 'PRIVATE-TOKEN': user.gitlabtoken }
		}, function(err, res, body) {
			// XXX This could potentially fail if there's conflict
			cb(err);
		});
	});
}

// SCM Utility
var trackurl = 'https://kall.kiwiplan.co.nz/scm/timetracker/track.do';
var assignedurl = 'https://kall.kiwiplan.co.nz/scm/timetracker/assigned.do';
var newscmurl = 'https://kall.kiwiplan.co.nz/scm/development/newSoftwareChange.do';
var newtsurl = function(scmid) { return 'https://kall.kiwiplan.co.nz/scm/development/newTechnicalSpecificationTask.do?softwareChangeId=' + scmid; }
var newpturl = function(scmid) { return 'https://kall.kiwiplan.co.nz/scm/common/newProgrammingTask.do?softwareChangeId=' + scmid; }
var scmurl = function(scmid) { return 'https://kall.kiwiplan.co.nz/scm/softwareChangeViewer.do?softwareChangeId=' + scmid; }
var scm2id = function(user, scm, cb) {
	request.get({
		url: assignedurl,
		headers: { Cookie: user.scmcookie }
	}, function(err, res, body) {
		var id = body.match(new RegExp('\n.*=' + scm + '(.|\n)*?id.*value="([0-9]*)".*\n'))[2];
		var title = body.match(new RegExp('\n.*=' + scm + '(.|\n)*?<span.*\n[ \t]*(.*)[ \t]*\n'))[2];
		cb(id, title);
	});
}

var trackstart = function(user, scm, cb) {
	scm2id(user, scm, function(id, title) {
		request.post({ url: trackurl, form: { id: id, taskType: 'SOFTWARE_CHANGE_TASK', status: 'assigned', action: 'Start Tracking' }, headers: { Cookie: user.scmcookie } }, function(err, res, body) { cb(title); });
	});
};
var trackstop = function(user, scm, cb) {
	scm2id(user, scm, function(id, title) {
		request.post({ url: trackurl, form: { id: id, taskType: 'SOFTWARE_CHANGE_TASK', status: 'assigned', action: 'Stop Tracking' }, headers: { Cookie: user.scmcookie } }, function(err, res, body) { cb(title); });
	});
};
var newscm = function(user, title, desc, hours, cb) {
	request.post({
		url: newscmurl,
		form: { project: 67, iteration: 0, title: title, description: desc, applications: 70, _applications: 1, reportedRevisions: 2108, _reportedRevisions: 1, targetedRevisions: 2108, _targetedRevisions: 1, type: 'MAINTENANCE', estimatedImplementationHours: hours, priority: 'UNPRIORITISED' },
		headers: { Cookie: user.scmcookie }
	}, function(err, res, body) {
		var scmid = body.match(/softwareChangeId=(\d*)/)[1];
		request.post({
			url: newtsurl(scmid),
			form: { title: 'Technical Planning', description: 'Technical Planning', hoursEstimated: Math.round(hours / 3 * 2), assignee: user.scm },
			headers: { Cookie: user.scmcookie }
		}, function(err, res, body) {
			request.post({
				url: newpturl(scmid),
				// TODO Determine targeted rev
				form: { title: title, description: desc, application: 70, component: 524, module: 2940, targetedRevisions: 2108, _targetedRevisions: 1, hoursEstimated: Math.round(hours / 3 * 1), assignee: user.scm },
				headers: { Cookie: user.scmcookie }
			}, function(err, res, body) {
				request.get({
					url: scmurl(scmid),
					headers: { Cookie: user.scmcookie }
				}, function(err, res, body) {
					var sc = body.match(/<title>SCM - (\d{6})/)[1];
					cb(sc);
				});
			});
		});
	});
}

// Slack Utility
// - Join channel if exists, create if doesn't
// - name : Name of channel to join (may be new)
// - purpose : Purpose and Topic to set on the channel
// - members : Array of user objects that have property `slack` which is the slack user id
var joinchannel = function(name, purpose, members) {
	request.post({ url: 'https://slack.com/api/channels.join', form: { token: users.haoyang.slacktoken, name: name } }, function(err, res, body) {
		var bodyjson = eval('(' + body + ')');
		var channelid = bodyjson.channel.id;
		_.each(members, function(member) {
			request.post({ url: 'https://slack.com/api/channels.invite', form: { token: users.haoyang.slacktoken, channel: channelid, user: member.slack } });
		});
		request.post({ url: 'https://slack.com/api/channels.setTopic', form: { token: users.haoyang.slacktoken, channel: channelid, topic: purpose } });
		request.post({ url: 'https://slack.com/api/channels.setPurpose', form: { token: users.haoyang.slacktoken, channel: channelid, topic: purpose } });
	});
};

// - Get Channel name by id
// - cb(name)
var channelname = function(id, cb) {
	bot.api.channels.info({ channel: id }, function(err, res) {
		cb(res.channel.name);
	});
};

// DM Ping
controller.hears('Hi', ['direct_message'], function(bot, message) {
	bot.reply(message, 'Hi');
});

// DM Trello
controller.hears('trello', ['direct_message'], function(bot, message) {
	tcards('Dev Sprint', function(cards) {
		var mycards = _.filter(cards, function(card) { return _.includes(card.idMembers, s2t(message.user)) });
		bot.reply(message, string(_.map(mycards, 'name')));
	});
});

// DM SCM Alive
controller.hears('scm', ['direct_message'], function(bot, message) {
	request.get({
		url: scmurl(39492),
		headers: { Cookie: s2u(message.user).scmcookie }
	}, function(err, res, body) {
		bot.reply(message, body.match(/<title>SCM - (\d{6})/) ? 'SCM link active' : 'SCM link inactive');
	});
});

// DM Merge MR
// "mergemr <branch_name>"
controller.hears('mergemr', ['direct_message'], function(bot, message) {
	findbranch(_.split(message.text, ' ')[1], function(branches) {
		async.eachSeries(_.map(branches, 'name'), _.partial(mergemr, users.melody), function(err) {
			// XXX This could potentially fail if there's conflict
			bot.reply(message, err ? 'An error occurred' : 'Code has been merged.');
		});
	});
});

// DM Create MR
// "createmr <branch_name>"
controller.hears('createmr', ['direct_message'], function(bot, message) {
	var branchPrefix = _.split(message.text, ' ')[1];
	findbranch(branchPrefix, function(branches) {
		_.each(branches, function(branch) {
			if (branch.name == branchPrefix) {
				// XXX Shouldn't be hard coding 8.40
				newmr(s2u(message.user), null, branch.name, '8.40', function(mrid) {
					bot.reply(message, 'MR created: ' + mrurl(mrid));
				});
			}
			else {
				newmr(s2u(message.user), null, branch.name, _.last(_.split(branch.name, '-')), function(mrid) {
					bot.reply(message, 'MR created: ' + mrurl(mrid));
				});
			}
		});
	});
});

// Ambient Handler
controller.on('ambient', function(bot, message) {
	// Test Jack
	if (message.channel == channels.testjack) {
		if (message.text.indexOf("echo") == 0) {
			bot.reply(message,{
				text: JSON.stringify(message, null, 2),
				username: "Echo",
				icon_emoji: ":radio:"
			});
		}
		else if (message.text.indexOf("log") == 0) {
			console.log(JSON.stringify(message, null, 2));
		}
	}
	else if (message.text == 'start') {
		channelname(message.channel, function(name) {
			code2scm(name, function(scm) {
				trackstart(s2u(message.user), scm, function(title) {
					bot.reply(message, '<@' + s2u(message.user).name + '> started working on ' + title);
				});
			});
		});
	}
	else if (message.text == 'stop') {
		channelname(message.channel, function(name) {
			code2scm(name, function(scm) {
				trackstop(s2u(message.user), scm, function(title) {
					bot.reply(message, '<@' + s2u(message.user).name + '> stopped working on ' + title);
				});
			});
		});
	}
	else if (message.text == 'coded') {
		channelname(message.channel, function(name) {
			tfcode(name, function(card) {
				var reviewer = 'ushal';
				if (s2u(message.user).name == 'ushal') {
					reviewer = 'haoyang';
				}
				tassign(card, reviewer);
				newmr(s2u(message.user), card, tcode(card), 'dev', function(mrid) {
					bot.reply(message, '<@' + reviewer + '>: Please review the code: ' + mrurl(mrid) + '/diffs. (reviewed/merge)');
				});
			});
		});
	}
	else if (message.text == 'reviewed') {
		channelname(message.channel, function(name) {
			tfcode(name, function(card) {
				var coder = 'ushal';
				if (s2u(message.user).name == 'ushal') {
					coder = 'haoyang'
				}
				tassign(card, coder);
				findmr(tcode(card), function(mr) {
					bot.reply(message, '<@' + coder + '>: Code reviewed, please address the feedback: ' + mrurl(mr.iid) + '. (review)');
				});
			});
		});
	}
	else if (message.text == 'review') {
		channelname(message.channel, function(name) {
			tfcode(name, function(card) {
				var reviewer = 'ushal';
				if (s2u(message.user).name == 'ushal') {
					reviewer = 'haoyang';
				}
				tassign(card, reviewer);
				findmr(tcode(card), function(mr) {
					bot.reply(message, '<@' + reviewer + '>: Please review the code: ' + mrurl(mr.iid) + '. (reviewed/merge)');
				});
			});
		});
	}
	else if (message.text == 'merge') {
		channelname(message.channel, function(name) {
			tfcode(name, function(card) {
				var coder = 'ushal';
				if (s2u(message.user).name == 'ushal') {
					coder = 'haoyang'
				}
				tassign(card, coder);
				mergemr(n2u(coder), tcode(card), function() {
					// XXX This could potentially fail if there's conflict
					bot.reply(message, '<@' + coder + '>: Code has been merged to dev. VBRN and type test when VULT is ready');
				});
			});
		});
	}
	else if (message.text.indexOf('test') == 0) {
		channelname(message.channel, function(name) {
			tfcode(name, function(card) {
				findbranch(tcode(card), function(branches) {
					var messagewords = _.split(message.text, ' ');
					if (messagewords.length == 1) {
						_.each(branches, function(branch) {
							if (branch.name == tcode(card)) {
								// XXX Shouldn't be hard coding 8.40
								newmr(s2u(message.user), card, branch.name, '8.40');
							}
							else {
								newmr(s2u(message.user), card, branch.name, _.last(_.split(branch.name, '-')));
							}
						});
						bot.reply(message, '<@melo>: Please test. (accept/reject)');
						tassign(card, 'melody');
					}
					else if (messagewords.length == 2) {
						newmr(s2u(message.user), card, tcode(card) + '-' + messagewords[1], messagewords[1]);
						bot.reply(message, '<@melo>: Please test. (accept/reject)');
						tassign(card, 'melody');
					}
				});
			});
		});
	}
	else if (message.text == 'reject') {
		channelname(message.channel, function(name) {
			tfcode(name, function(card) {
				findmr(tcode(card), function(mr) {
					tassign(card, g2u(mr.author.id).name);
					bot.reply(message, '<@' + g2u(mr.author.id).name + '>: Your card has been rejected. :cold_sweat:');
				});
			});
		});
	}
	else if (message.text == 'accept') {
		channelname(message.channel, function(name) {
			tfcode(name, function(card) {
				findbranch(tcode(card), function(branches) {
					async.eachSeries(_.map(branches, 'name'), _.partial(mergemr, users.melody), function(err) {
						bot.reply(message, '<@melo>: Code has been accepted.');
					});
				});
			});
		});
	}
	else if (message.text.indexOf('chess') == 0) {
		channelname(message.channel, function(name) {
			if (name == 'chess') {
				chess = new Chess();
				bot.reply(message, '```' + chess.ascii() + '```');
			}
		})
	}
	else if (message.text.indexOf('move') == 0) {
		channelname(message.channel, function(name) {
			if (name == 'chess') {
				chess.move(_.split(message.text, ' ')[1]);
				bot.reply(message, '```' + chess.ascii() + '```');
			}
		})
	}
});

// Slash Command Handler (Not used, just for reference)
controller.on('slash_command', function(bot, message) {
	if (message.command == 'up') {
		bot.reply(message, 'I\'m here.');
		bot.replyPublicDelayed(message, 'How can I help you?');
	}
	else if (message.command == 'whisper') {
		bot.replyPrivate(message, 'Hello.');
		bot.replyPrivateDelayed(message, 'How are you.');
	}
});

// QA preview notification with SCM link based on trello assignment
controller.on('bot_message', function(bot, message) {
/*
	if (message.channel == channels.planning && message.bot_id == bots.trello && message.attachments && message.attachments[0] && message.attachments[0].text && message.attachments[0].text.indexOf('Melody') > -1 && message.attachments[0].text.match(/\d{6}/g)) {
		bot.say({ channel: channels.qapreview, text: 'https://kall.kiwiplan.co.nz/scm/softwareChangeViewer.do?id=' + message.attachments[0].text.match(/\d{6}/g)[0]});
	}
*/
});

// SCM Integration
var scmusers = ['haoyang', 'ushal'];
setInterval(function() {
	tcards('Dev', function(cards) {
		// XXX This implementation is a bit unpleasant
		var userstoassign = _.clone(scmusers);
		var priorityassignee = _.clone(scmusers);
		for (var i = 0; i < userstoassign.length; i++) {
			var card = cards[i];
			if (!card) break;
			for (var j = 0; j < card.idMembers.length; j++) {
				_.pull(priorityassignee, t2n(card.idMembers[j]));
			};
		};
		_.each(cards, function(card) {
			if (_.isEmpty(card.idMembers)) {
				var usertoassign = _.sample(_.isEmpty(priorityassignee) ? userstoassign : priorityassignee);
				_.pull(priorityassignee, usertoassign);
				_.pull(userstoassign, usertoassign);
				if (!tscm(card)) {
					if (!card.name.match(/\((\d*)\)/)) {
						console.log('Unsized card');
					}
					else {
						newscm(n2u(usertoassign), card.desc, card.desc, card.name.match(/\((\d*)\)/)[1] * 10, function(sc) {
							trello.put('/1/cards/' + card.id + '/name', { value: card.name + ' ' + sc }, function(err) {});
							joinchannel(card.name.match(/(^| )([a-z\-]*)($| )/)[2], 'https://kall.kiwiplan.co.nz/scm/softwareChangeViewer.do?id=' + sc, users);
						});
					}
				}
				else {
					joinchannel(tcode(card), 'https://kall.kiwiplan.co.nz/scm/softwareChangeViewer.do?id=' + tscm(card), users);
				}

				if (card.name.match(/\((\d*)\)/)[1] >= 5) {
					//XXX Currentlywill assign all users in the scmusers list
					tassignmany(card,scmusers);
					return false;
				}
				else {
					tassign(card, usertoassign);
				}
			}
			else {
				for (var i = 0; i < card.idMembers.length; i++) {
					_.pull(priorityassignee, t2n(card.idMembers[i]));
					_.pull(userstoassign, t2n(card.idMembers[i]));
				};
			}
			return !_.isEmpty(userstoassign);
		});
	});
}, 60000);

setInterval(function() {
	tcards('Dev', function(cards) {
		_.each(cards, function(card) {
			var cardname = card.name.match(/\((\d*)\)/);
			if (!cardname) {
				console.log('Unsized card');
			}
			else if (!_.isEmpty(card.idMembers) && (cardname[1] == 2) || (cardname[1] == 3)) {
				bot.say({ channel: channels.testjack, text: 'Close Collaboration for ' + tcode(card) });
			}
		});
	});
}, 1800000);

// SCM Keep alive
var scmkeepalive = function() {
	request.get({
		url: scmurl(39492),
		headers: { Cookie: users.haoyang.scmcookie }
	}, function(err, res, body) {
		console.log("SCM Cookie renewed");
	});
	request.get({
		url: scmurl(39492),
		headers: { Cookie: users.ushal.scmcookie }
	}, function(err, res, body) {
		console.log("SCM Cookie renewed");
	});
};
scmkeepalive();
setInterval(scmkeepalive, 21600000);

// VM Warnings
var vmids = ['haoyang', 'ushal', 'michelle', 'aaron'];
setInterval(function() {
	glob('/vmlock/*.8.40', null, function(err, files) {
		fs.stat(files[0], function(err, stats) {
			if ((new Date()) - stats.ctime > 300000) {
				var user = vmids[Number(files[0].split('/')[2].split('.')[0])];
				bot.say({ channel: channels.vm, text: '<!channel>: ' + '<@' + user + '>\'s vm script is locked.' });
			}
		});
	})
}, 300000);
