var Botkit = require('botkit');

var controller = Botkit.slackbot({ debug : false });

controller.setupWebserver(process.env.PORT || 3000);
var bot = controller.spawn({token : process.env.token });

bot.startRTM();


var channels = {
	test-jack: 'C14N0EPGC',
	_dev: 'C0L4PU8S1',
	_qa-preview: 'C0M20LYJF',
	_planning: 'C0JAB2CAD'
};

var bots = {
	trello: 'B0HSGEXF1'
}


controller.on('bot_message', function(bot, message) {
	if (message.channel == channels._planning && message.bot_id == bots.trello && message.attachments && message.attachments[0] && message.attachments[0].text && message.attachments[0].text.indexOf('Melody') > -1 && message.attachments[0].text.match(/\d{6}/g)) {
		bot.say({ channel: channels._qa-preview, text: 'https://kall.kiwiplan.co.nz/scm/softwareChangeViewer.do?id=' + message.attachments[0].text.match(/\d{6}/g)[0]});
	}
});

controller.hears('Hi', ['direct_message'], function(bot, message) {
	bot.reply(message, 'Hi');
});

setInterval(function() {
	console.log("AAAA");
	console.log(bot.say);
	bot.say({ channel: channels.test-jack, text: 'Testing jack. Please ignore.'});
}, 10000);
