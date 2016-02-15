var Botkit = require('botkit');

var controller = Botkit.slackbot({ debug : false });

controller.setupWebserver(process.env.PORT || 3000);
controller.spawn({token : 'xoxb-21068424885-QfOIy7hxdbX3fakXluS5ka2e' }).startRTM();

controller.on('bot_message', function(bot, message) {
	if (message.channel == 'C0JAB2CAD' && message.bot_id == 'B0HSGEXF1' && message.attachments && message.attachments[0] && message.attachments[0].text && message.attachments[0].text.indexOf('Melody') > -1) {
		bot.say({ channel: 'C0M20LYJF', text: 'https://kall.kiwiplan.co.nz/scm/softwareChangeViewer.do?id=' + message.attachments[0].text.match(/\d{6}/g)[0]});
	}
});

controller.hears('Hi', ['direct_message'], function(bot, message) {
	bot.reply(message, 'Hi');
});
