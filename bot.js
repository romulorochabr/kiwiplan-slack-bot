var _ = require('lodash');
var fs = require('fs');
var glob = require('glob');
var request = require('request');
var Botkit = require('botkit');
var Trello = require('node-trello');
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
var trello = new Trello('3c3032368c3c88ac3ba8799f3e37d935', 'ee99dec582dbbbacf02f864f93cc3c2771d521203c36563f482f886734f22f6c');

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

// SCM Utility
var trackurl = 'https://kall.kiwiplan.co.nz/scm/timetracker/track.do';
var newscmurl = 'https://kall.kiwiplan.co.nz/scm/development/newSoftwareChange.do';
var newtsurl = function(scmid) { return 'https://kall.kiwiplan.co.nz/scm/development/newTechnicalSpecificationTask.do?softwareChangeId=' + scmid; }
var newpturl = function(scmid) { return 'https://kall.kiwiplan.co.nz/scm/common/newProgrammingTask.do?softwareChangeId=' + scmid; }
var scmurl = function(scmid) { return 'https://kall.kiwiplan.co.nz/scm/softwareChangeViewer.do?softwareChangeId=' + scmid; }
var trackstart = function() {
	request.post({ url: trackurl, form: { id: 157909, taskType: 'SOFTWARE_CHANGE_TASK', status: 'assigned', action: 'Start Tracking' }, headers: { Cookie: 'JSESSIONID=aaap95OIUMV8id2yAgWtv' } }, function(err, res, body) {});
};
var trackstop = function() {
	request.post({ url: trackurl, form: { id: 157909, taskType: 'SOFTWARE_CHANGE_TASK', status: 'assigned', action: 'Stop Tracking' }, headers: { Cookie: 'JSESSIONID=aaap95OIUMV8id2yAgWtv' } }, function(err, res, body) {});
};
var newscm = function(title, desc, hours, cb) {
/*
	var assignee = 9118;
	request.post({
		url: newscmurl,
		form: { project: 67, iteration: 0, title: title, description: desc, applications: 70, _applications: 1, reportedRevisions: 2108, _reportedRevisions: 1, targetedRevisions: 2108, _targetedRevisions: 1, type: 'MAINTENANCE', estimatedImplementationHours: hours, priority: 'UNPRIORITISED' },
		headers: { Cookie: 'JSESSIONID=aaap95OIUMV8id2yAgWtv' }
	}, function(err, res, body) {
		var scmid = body.match(/softwareChangeId=(\d*)/)[1];
		request.post({
			url: newtsurl(scmid),
			form: { title: 'Technical Planning', description: 'Technical Planning', hoursEstimated: Math.round(hours / 3 * 2), assignee: assignee },
			headers: { Cookie: 'JSESSIONID=aaap95OIUMV8id2yAgWtv' }
		}, function(err, res, body) {
			request.post({
				url: newpturl(scmid),
				form: { title: title, description: desc, application: 70, component: 524, module: 2940, targetedRevisions: 2108, _targetedRevisions: 1, hoursEstimated: Math.round(hours / 3 * 1), assignee: assignee },
				headers: { Cookie: 'JSESSIONID=aaap95OIUMV8id2yAgWtv' }
			}, function(err, res, body) {
*/
var scmid = 39525;
				request.get({
					url: scmurl(scmid),
					headers: { Cookie: 'JSESSIONID=aaap95OIUMV8id2yAgWtv' }
				}, function(err, res, body) {
					var sc = body.match(/<title>SCM - (\d{6})/)[1];
					cb(sc);
				});
/*
			});
		});
	});
*/
}

// User IDs
var users = {
	haoyang: {
		name: 'haoyang',
		slack: 'U0HMLSLKY',
		trello: '53ed667b3f5d4e4c4e1c5902'
	},
	ushal: {
		name: 'ushal',
		slack: 'U0HMMNE9W',
		trello: '563fc2beb2e713d534da52ce'
	},
	melody: {
		name: 'melody',
		slack: 'U0J4CGQKW',
		trello: '5578c1e12f582a666e7bca4a'
	}
};
var t2n = function(t) {
	return _.find(users, { trello: t }).name;
};
var n2t = function(n) {
	return _.find(users, { name: n }).trello;
};
var s2t = function(s) {
	return _.find(users, { slack: s }).trello;
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

// DM Ping
controller.hears('Hi', ['direct_message'], function(bot, message) {
	bot.reply(message, 'Hi');
});

// DM Trello
controller.hears('trello', ['direct_message'], function(bot, message) {
	tcards('Dev Sprint', function(cards) {
		var mycards = _.filter(cards, function(card) { return _.includes(card.idMembers, s2t(message.user)) });
		//bot.reply(message, string(_.map(mycards, 'name')));
		bot.reply(message, string(mycards));
	});
});

// DM Track
controller.hears('start', ['direct_message'], function(bot, message) {
	trackstart();
});
controller.hears('stop', ['direct_message'], function(bot, message) {
	trackstop();
});

// Ambient Handler
controller.on('ambient', function(bot, message) {
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
});

// QA preview notification with SCM link based on trello assignment
controller.on('bot_message', function(bot, message) {
	if (message.channel == channels.planning && message.bot_id == bots.trello && message.attachments && message.attachments[0] && message.attachments[0].text && message.attachments[0].text.indexOf('Melody') > -1 && message.attachments[0].text.match(/\d{6}/g)) {
		bot.say({ channel: channels.qapreview, text: 'https://kall.kiwiplan.co.nz/scm/softwareChangeViewer.do?id=' + message.attachments[0].text.match(/\d{6}/g)[0]});
	}
});

// SCM Integration
var scmusers = ['haoyang', 'ushal'];
setInterval(function() {
	tcards('Test', function(cards) {
		// XXX This implementation is a bit unpleasant
		var userstoassign = _.clone(scmusers);
		var priorityassignee = _.clone(scmusers);
		for (var i = 0; i < userstoassign.length; i++) {
			var card = cards[i];
			for (var j = 0; j < card.idMembers.length; j++) {
				_.pull(priorityassignee, t2n(card.idMembers[j]));
			};
		};
		_.each(cards, function(card) {
			if (_.isEmpty(card.idMembers)) {
				var usertoassign = _.sample(_.isEmpty(priorityassignee) ? userstoassign : priorityassignee);
				_.pull(priorityassignee, usertoassign);
				_.pull(userstoassign, usertoassign);
				if (!card.name.match(/\d{6}/)) {
					newscm(card.desc, card.desc, card.name.match(/\((\d*)\)/)[1] * 10, function(sc) {
						trello.put('/1/cards/' + card.id + '/name', { value: card.name + ' ' + sc }, function(err) {});
					});
				}
				trello.post('/1/cards/' + card.id + '/idMembers', { value: n2t(usertoassign) }, function(err) {});
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
}, 5000);

// VM Warnings
var vmids = ['haoyang', 'ushal', 'michelle', 'aaron'];
setInterval(function() {
	glob('/vmlock/*.8.31', null, function(err, files) {
		fs.stat(files[0], function(err, stats) {
			if ((new Date()) - stats.ctime > 300000) {
				var user = vmids[Number(files[0].split('/')[2].split('.')[0])];
				bot.say({ channel: channels.vm, text: '<!channel>: ' + '<@' + user + '>\'s vm script is locked.' });
			}
		});
	})
}, 300000);
