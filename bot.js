var Botkit = require('botkit');
var fs = require('fs');
var glob = require('glob');

var controller = Botkit.slackbot({ debug : false });

controller.setupWebserver(process.env.PORT || 3000);
var bot = controller.spawn({token : process.env.token });

bot.startRTM();


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

var vmids = ['haoyang', 'ushal', 'michelle', 'aaron'];

controller.on('bot_message', function(bot, message) {
	if (message.channel == channels.planning && message.bot_id == bots.trello && message.attachments && message.attachments[0] && message.attachments[0].text && message.attachments[0].text.indexOf('Melody') > -1 && message.attachments[0].text.match(/\d{6}/g)) {
		bot.say({ channel: channels.qapreview, text: 'https://kall.kiwiplan.co.nz/scm/softwareChangeViewer.do?id=' + message.attachments[0].text.match(/\d{6}/g)[0]});
	}
});

controller.hears('Hi', ['direct_message'], function(bot, message) {
	bot.reply(message, 'Hi');
});

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

setInterval(function() {
	glob('/vmlock/*.8.31', null, function(err, files) {
		fs.stat(files[0], function(err, stats) {
			if ((new Date()) - stats.ctime > 300000) {
				var user = vmids[Number(files[0].split('/')[2].split('.')[0])];
				bot.say({ channel: channels.testjack, text: '<!channel>: ' + '<@' + user + '>\'s vm script is locked.' });
			}
		});
	})
}, 300000);
