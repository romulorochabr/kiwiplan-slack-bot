var _ = require('lodash');
var fs = require('fs');
var glob = require('glob');
var Botkit = require('botkit');
var Trello = require('node-trello');
var string = function(input) {
	return JSON.stringify(input, null, 2);
}
var l = function(title, input) {
	console.log(title);
	console.log(string(input));
	console.log();
}

// Start Slack Connection
var controller = Botkit.slackbot({ debug : false });
controller.setupWebserver(process.env.PORT || 3000);
var bot = controller.spawn({token : process.env.token });
bot.startRTM();

// Access Trello
var trello = new Trello('3c3032368c3c88ac3ba8799f3e37d935', 'ee99dec582dbbbacf02f864f93cc3c2771d521203c36563f482f886734f22f6c');

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
	trello.get('/1/boards/' + boards.ult + '/lists', { filter: 'open', fields: 'name' }, function(err, lists) {
		var devlistid = _.find(lists, function(list) { return list.name.indexOf('Dev Sprint') > -1; }).id;
		trello.get('/1/lists/' + devlistid + '/cards', { filter: 'open', fields: 'name,idMembers' }, function(err, cards) {
			var mycards = _.filter(cards, function(card) { return _.includes(card.idMembers, n2t(message.user)) });
			bot.reply(message, string(_.map(mycards, 'name')));
		});
	});
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

// Trello Utility
var tlists = function(cb) {
	trello.get('/1/boards/' + boards.ult + '/lists', { filter: 'open', fields: 'name' }, function(err, lists) {
		cb(lists);
	});
};
var tcards = function(listnameprefix, cb) {
	tlists(function(lists) {
		var devlistid = _.find(lists, function(list) { return list.name.indexOf(listnameprefix) > -1; }).id;
		trello.get('/1/lists/' + devlistid + '/cards', { filter: 'open', fields: 'name,idMembers' }, function(err, cards) {
			cb(cards);
		});
	});
};

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
