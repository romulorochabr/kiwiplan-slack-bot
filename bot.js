var _ = require('lodash');
var async = require('async');
var fs = require('fs');
var sshClient = require('ssh2').Client;
var glob = require('glob');
var request = require('request');
var Botkit = require('botkit');
var Trello = require('node-trello');
var Chess = require('chess.js').Chess;
var chess = null;
var jsonfile = require('jsonfile');
var Spreadsheet = require('edit-google-spreadsheet');

var string = function(input) {
	return JSON.stringify(input, null, 2);
}
var l = function(title, input) {
	console.log(title);
	console.log(input);
	//console.log(string(input));
	console.log();
}
var p = function(message) {
	console.log(message);
}

// Start Slack Connection
var controller = Botkit.slackbot({ debug : false });
controller.setupWebserver(process.env.PORT || 3000);
var bot = controller.spawn({token : process.env.token });
bot.startRTM();

var save = function() {
	jsonfile.writeFileSync('./data.json', data);
}

// XXX Apply read data onto initdata
if (fs.existsSync('./data.json') == false) {
	var initdata = {
		deployStatus : 'none',
		users : {
			haoyang: {
				name: 'haoyang',
				slack: 'U0HMLSLKY',
				trello: '53ed667b3f5d4e4c4e1c5902',
				scm: 9118,
				scmcookie: '',
				slacktoken: process.env.slacktokenhaoyang,
				gitlabtoken: process.env.gitlabtokenhaoyang,
				gitlab: 2
			},
			ushal: {
				name: 'ushal',
				slack: 'U0HMMNE9W',
				trello: '563fc2beb2e713d534da52ce',
				scm: 11729,
				scmcookie: '',
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
		}
	}
	jsonfile.writeFileSync('./data.json', initdata);
}

// Data that the bot remembers
// deployStatus: A string status for auto deployment
// - 'none': Can be deployed
// - 'locked': Don't deploy right now but pend the deployment (nothing pending yet)
// - 'pending': Don't deploy right now (something pending deployment)
var data = jsonfile.readFileSync('./data.json');

// Access Trello
// TODO XXX Is this safe?
var trello = new Trello('3c3032368c3c88ac3ba8799f3e37d935', 'ee99dec582dbbbacf02f864f93cc3c2771d521203c36563f482f886734f22f6c');

// User IDs
var users = data.users;
var t2n = function(t) {
	var user = _.find(users, { trello: t});
	return user && user.name;
};
var n2t = function(n) {
	var user =  _.find(users, { name: n })
	return user && user.trello;
};
var n2s = function(n) {
	var user =  _.find(users, { name: n })
	return user && user.slack;
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
	dev: 'C1AT7J692',
	vm: 'C16HEPJTV',
	qapreview: 'C0M20LYJF',
	planning: 'C0JAB2CAD',
	chess: 'C255F30FP',
	gitlab: 'C0SENG8AY',
        vult:'G3959ARSN',
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


// Cross Server Functionality

// data: { host, user, privateKey, command }
var runssh = function(data) {
	var conn = new sshClient();
	conn.on('ready', function() {
		conn.exec(data.command, function(err, stream) {
			if (err) throw err;
			stream.on('close', function(code, signal) {
			    bot.reply(message, 'done');
			    conn.end();
			}).on('data', function(data) {
			  console.log('STDOUT: ' + data);
			}).stderr.on('data', function(data) {
			  console.log('STDERR: ' + data);
			});
		});
	}).connect({
		host: data.host,
		port: 22,
		username: data.user,
		privateKey: require('fs').readFileSync(data.privateKey)
	});
}

 
// Trello Utility

// - Finds trello lists by name prefix and filter
// - listnameprefix : An array of string that the list name should start with
var tlists = function(listnameprefix, filter, cb) {
	trello.get('/1/boards/' + boards.ult + '/lists', { filter: filter, fields: 'name' }, function(err, lists) {
		cb(_.filter(lists, function(list) { return _.find(listnameprefix, function(prefix) { return list.name.indexOf(prefix) > -1 }) }));
	});
};

var tlistsrecent = function(currentSprint, listnameprefix, filter, cb) {
	trello.get('/1/boards/' + boards.ult + '/lists', { filter: filter, fields: 'name' }, function(err, lists) {
		cb(_.filter(lists, function(list) { return _.find(listnameprefix, function(prefix) { return (list.name.indexOf(prefix) > -1) && ((list.name.indexOf(currentSprint) > -1) || (list.name.indexOf(currentSprint-1) > -1) || (list.name.indexOf(currentSprint-2) > -1) || (list.name.indexOf(currentSprint-3) > -1) || (list.name.indexOf(currentSprint-4) > -1))}) }));
	});
};

// - Find trello cards grouped by list name, in lists with the first matched list (by name prefix and filter)
// - listnameprefix : An array of string that the list name should start with
// - Callback with [{list: list1, cards: [card1, card2]}, {list: list2, cards: [card3, card4]}]
var tcards = function(listnameprefix, filter, cb) {
	tlists(listnameprefix, filter, function(lists) {
		var cardsByList = [];
		async.eachSeries(lists, function(list, cbDone) {
				trello.get('/1/lists/' + list.id + '/cards', { filter: filter, fields: 'name,idMembers,desc' }, function(err, cards) {
				cardsByList.push({ list: list, cards: cards });
				cbDone();
			});
		}, function(err) {
			cb(cardsByList);
		});
	});
};

var tcardsrecent = function(listnameprefix, filter, cb) {
	tlistsrecent(data.currentSprint,listnameprefix, filter, function(lists) {
		var cardsByList = [];
		async.eachSeries(lists, function(list, cbDone) {
				trello.get('/1/lists/' + list.id + '/cards', { filter: filter, fields: 'name,idMembers,desc' }, function(err, cards) {
				cardsByList.push({ list: list, cards: cards });
				cbDone();
			});
		}, function(err) {
			cb(cardsByList);
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
	var matcher = card.name.match(/(^| )([a-z1-9\-]*)($| )/);
	return matcher ? matcher[2] : null;
};

// - Find size from card
var tsize = function(card) {
	var matcher = card.name.match(/\(([\.\d]*)\)/);
	return matcher ? matcher[1] : null;
}

// - Find scm from card
// FIXME This might match on a Kall number which still needs SCM created
var tscm = function(card) {
	var match = card.name.match(/\d{6}/);
	return match ? match[0] : null;
};
	
// - Find card by code
// - cb(card)
var tfcode = function(code, cb) {
	tcards(['Dev Sprint','Product Backlog Refined', 'Product Backlog Unrefined'], 'open', function(cards) {
		cb(_.find(cards[0].cards, function(card) {return tcode(card) == code; }));
	});
};

var tfcodeindev = function(code, cb) {
	tcards(['Dev Sprint', 'Test'], 'open', function(cards) {
		cb(_.find(cards[0].cards, function(card) {return tcode(card) == code; }));
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

var newmr = function(user, card, source, target, cb) {
	request.post({
		url: 'http://nzvult/api/v3/projects/' + inv + '/merge_requests',
		form: {
			id: inv,
			target_branch: target,
			source_branch: source,
			title: source,
			description: (card ? ('ULT SCM ' + tscm(card) + ' - ' + card.desc.split('\n')[0]) : 'No description') + '\n' + user.name
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
		if (!mr) return;
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

var completetask = 'https://kall.kiwiplan.co.nz/scm/common/taskWorkflow.do';

var assignedurl = 'https://kall.kiwiplan.co.nz/scm/timetracker/assigned.do';

var newscmurl = 'https://kall.kiwiplan.co.nz/scm/development/newSoftwareChange.do';

var newtsurl = function(scmid) { return 'https://kall.kiwiplan.co.nz/scm/development/newTechnicalSpecificationTask.do?softwareChangeId=' + scmid; }

var newdsurl = function(scmid) { return 'https://kall.kiwiplan.co.nz/scm/development/newDesignSpecificationTask.do?softwareChangeId=' + scmid; }

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

var id2scm = function(id, cb) {
	request.get({
		url: scmurl(id),
		headers: { Cookie: n2u('haoyang').scmcookie }
		}, function(err, res, body) {
			cb(body.match(/<title>SCM - (\d{6})/)[1]);
	});
}

var trackstart = function(user, scm, cb) {
	scm2id(user, scm, function(id, title) {
		request.post({ url: trackurl, form: { id: id, taskType: 'SOFTWARE_CHANGE_TASK', status: 'assigned', action: 'Start Tracking' }, headers: { Cookie: user.scmcookie } }, function(err, res, body) { cb(title); });
	}); };
var completescm = function(user, scm, cb) {
	scm2id(user, scm, function(id, title) {
		request.post({ url: completetask, form: {softwareChangeId: '40176' , taskId:'160873', tansitionId:'4'}, headers: { Cookie: user.scmcookie } }, function(err, res, body) { cb(title); });
	}); };
var trackstop = function(user, scm, cb) {
	scm2id(user, scm, function(id, title) {
		request.post({ url: trackurl, form: { id: id, taskType: 'SOFTWARE_CHANGE_TASK', status: 'assigned', action: 'Stop Tracking' }, headers: { Cookie: user.scmcookie } }, function(err, res, body) { cb(title); });
	}); };

var newscm = function(user, title, desc, hours, cb) {
	request.post({
		url: newscmurl,
		form: { project: 67, iteration: 0, title: title, description: desc, applications: 70, _applications: 1, reportedRevisions: 2246, _reportedRevisions: 1, targetedRevisions: 2246, _targetedRevisions: 1, type: 'MAINTENANCE',estimatedDesignHours: 1, estimatedImplementationHours: 30, priority: 'UNPRIORITISED' },
		headers: { Cookie: user.scmcookie }
	}, function(err, res, body) {
	if (err || body == null) {
          console.log('error creating scm : ' + err);
	  cb(1)
	}
        if(!body.match(/softwareChangeId=(\d*)/)) {
          console.log('error creating scm : ' + body);
	  cb(2)
        }
        if(!body.match(/softwareChangeId=(\d*)/)[1]) {
          console.log('error creating scm : ' + body);
	  cb(3)
        }
	var scmid = body.match(/softwareChangeId=(\d*)/)[1];
		newscmds(user, hours, scmid, function(scm) {
			cb(scm);
		});
	});
}

var newscmds = function(user, hours, scmid, cb) {
	request.post({
		url: newdsurl(scmid),
		form: { title: 'Design Spec', description: 'Design Spec', hoursEstimated: Math.round(hours / 4), assignee: user.scm },
		headers: { Cookie: user.scmcookie }
	}, function(err, res, body) {
		id2scm(scmid, function(scm) {
			cb(scm);
		});
	});

}

// Slack Utility

// - Join channel if exists, create if doesn't
// - name : Name of channel to join (may be new)
// - purpose : Purpose and Topic to set on the channel
// - members : Array of user objects that have property `slack` which is the slack user id
var joinchannel = function(name, purpose) {
	request.post({ url: 'https://slack.com/api/channels.join', form: { token: users.haoyang.slacktoken, name: name } }, function(err, res, body) {
		var bodyjson = eval('(' + body + ')');
		var channelid = bodyjson.channel.id;
                var members = ['haoyang', 'ushal', 'melody', 'kevin', 'jack'];
		_.each(members, function(member) {
			request.post({ url: 'https://slack.com/api/channels.invite', form: { token: users.haoyang.slacktoken, channel: channelid, user: n2s(member) } });
		});
		request.post({ url: 'https://slack.com/api/channels.setTopic', form: { token: users.haoyang.slacktoken, channel: channelid, topic: purpose } });
		request.post({ url: 'https://slack.com/api/channels.setPurpose', form: { token: users.haoyang.slacktoken, channel: channelid, topic: purpose } });

//		code2scm(name, function(scm) {
//			trackstart(users.haoyang, scm, function(title) {
//				bot.reply(message, '<@haoyang> started working on ' + title);
//			});
//		});
	});
};

// - Get Channel name by id
// - cb(name)
var channelname = function(id, cb) {
	bot.api.channels.info({ channel: id }, function(err, res) {
		cb(res.channel.name);
	});
};

// - Get nth argument for the slack message
var messagearg = function(message, arg) {
	return _.split(message.text, ' ')[arg]
}


// DM

// DM Ping
controller.hears('Hi', ['direct_message'], function(bot, message) {
	bot.reply(message, 'hi');
});

// DM SSH Command
controller.hears('ssh', ['direct_message'], function(bot, message) {
	var conn = new sshClient();
	conn.on('ready', function() {
		conn.exec('touch /home/haoyang.feng/a', function(err, stream) {
			if (err) throw err;
			stream.on('close', function(code, signal) {
			    bot.reply(message, 'done');
			    conn.end();
			}).on('data', function(data) {
			  console.log('STDOUT: ' + data);
			}).stderr.on('data', function(data) {
			  console.log('STDERR: ' + data);
			});
		});
	}).connect({
		host: 'nzqms',
		port: 22,
		username: 'haoyang.feng',
		privateKey: require('fs').readFileSync('/home/haoyang.feng/.ssh/id_rsa')
	});
});

controller.hears('goal', ['direct_message'], function(bot, message) {
        Spreadsheet.load({
		debug: true,
		spreadsheetId: '1LEZiAMkjZ5GxUJUX2H0AudT3eToTtdzg899I84LHJa4',
		worksheetId: '0',
        });
	bot.reply(message, 'hi');
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

// DM Save
controller.hears('save', ['direct_message'], function(bot, message) {
	data.dmSave = messagearg(message, 1);
	save();
});

controller.hears('currentSprint', ['direct_message'], function(bot, message) {
        if (messagearg(message,1) == null || messagearg(message,1) == '') {
		bot.reply(message,'Current sprint is ' + data.currentSprint );
        }
        else {
		data.currentSprint = messagearg(message, 1);
		save();
		bot.reply(message,'Goodluck for this sprint :) ' );
        }
});

// DM Data
controller.hears('data', ['direct_message'], function(bot, message) {
	bot.reply(message, JSON.stringify(data,null,2));
});

// DM reviewsize
controller.hears('reviewsize', ['direct_message'], function(bot, message) {
        var size = messagearg(message, 1);
	tcards(['Accepted Sprint', 'QA Sprint', 'Dev Sprint', 'Approved Sprint', 'Integrated Sprint', 'Test Sprint', 'Tested Sprint'], 'all', function(cardsByList) {
		var cards = _.reduceRight(cardsByList, function(reduced, cardsWithList) {
			_.each(cardsWithList.cards, function(card) {
				if (tsize(card) == size) {
					reduced.push(cardsWithList.list.name + '\t-\t*' +  tcode(card) + '*');
				}
			});
			return reduced;
		}, []);
		bot.reply(message, cards.join('\n'));
	});

});

// DM newsize
// Output:
// 0.5 - story1 story2 story3
// 1   - story4 story5 story6
controller.hears('newsize', ['direct_message'], function(bot, message) {
	tcardsrecent(['Accepted Sprint', 'QA Sprint', 'Dev Sprint', 'Approved Sprint', 'Integrated Sprint', 'Test Sprint', 'Tested Sprint'], 'all', function(cardsByList) {
		var cardsBySize = _.chain(cardsByList).map('cards').flatten().groupBy(tsize).value();
		var cards = _.reduce(cardsBySize, function(reduced, cardsForSize, size) {
			if (size && size > 0) {
                            reduced.push(size + ' - ' + _.chain(cardsForSize).map(tcode).sampleSize(5).join('  ').value());
                        }
                        return reduced;
                }, []);
		bot.reply(message, cards.join('\n'));
	});

});

// Ambient Handler
controller.on('ambient', function(bot, message) {
	// Global commands
	if (message.text == '.channelid') {
		bot.reply(message, message.channel);
	}
	// Test Jack
	else if (message.channel == channels.testjack) {
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
	// Chess
	else if (message.channel == channels.chess) {
		if (message.text.indexOf('chess') == 0) {
			chessplayers = _.shuffle(['haoyang', 'ushal']);
			chess = new Chess();
			bot.reply(message, '<@' + chessplayers[0] + '>: Your turn (' + chess.turn() + ') \n http://www.fen-to-image.com/image/44/double/coords/' + _.split(chess.fen(), ' ')[0] + Date.now());
			//bot.reply(message, '<@' + chessplayers[0] + '>: Your turn (' + chess.turn() + ') \n ```' + chess.ascii() + '``` \n http://www.fen-to-image.com/image/44/double/coords/' + chess.fen() + Date.now());
		}
		else if (message.text.indexOf('undo') == 0) {
			chess.undo();
			chessplayers = _.reverse(chessplayers);
			bot.reply(message, '<@' + chessplayers[0] + '>: Your turn (' + chess.turn() + ') \n http://www.fen-to-image.com/image/44/double/coords/' + _.split(chess.fen(), ' ')[0] + Date.now());
		}
		else if (_.split(message.text, ' ').length == 1 && chess.move(message.text) != null) {
			chessplayers = _.reverse(chessplayers);
			bot.reply(message, '<@' + chessplayers[0] + '>: Your turn (' + chess.turn() + ') \n http://www.fen-to-image.com/image/44/double/coords/' + _.split(chess.fen(), ' ')[0] + Date.now());
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
	else if (message.text == 'done') {
		channelname(message.channel, function(name) {
			code2scm(name, function(scm) {
				trackstop(s2u(message.user), scm, function(title) {
					completescm(s2u(message.user), scm, function(title) {
						bot.reply(message, '<@' + s2u(message.user).name + '> completed working on ' + title);
					});
				});
			});
		});
	}
	else if (message.text == 'coded') {
		channelname(message.channel, function(name) {
			tfcodeindev(name, function(card) {
                                if (card) {
					var reviewer = 'ushal';
					if (s2u(message.user).name == 'ushal') {
						reviewer = 'haoyang';
					}
					tassign(card, reviewer);
					newmr(s2u(message.user), card, tcode(card), 'dev', function(mrid) {
						bot.reply(message, '<@' + reviewer + '>: Please review the code: ' + mrurl(mrid) + '/diffs. (reviewed/merge)');
					});
                                }
			});
		});
	}
	else if (message.text == 'reviewed') {
		channelname(message.channel, function(name) {
			tfcodeindev(name, function(card) {
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
			tfcodeindev(name, function(card) {
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
			tfcodeindev(name, function(card) {
				var coder = 'ushal';
				if (s2u(message.user).name == 'ushal') {
					coder = 'haoyang'
				}
				tassign(card, coder);
				mergemr(n2u(coder), tcode(card), function() {
					// XXX This could potentially fail if there's conflict
					bot.reply(message, '<@' + coder + '>: Code has been merged to dev. VBRN and type createmr when VULT is ready');
				});
			});
		});
	}
	else if (message.text.indexOf('createmr') == 0) {
		channelname(message.channel, function(name) {
			tfcodeindev(name, function(card) {
				findbranch(tcode(card), function(branches) {
					var messagewords = _.split(message.text, ' ');
					if (messagewords.length == 1) {
						_.each(branches, function(branch) {
							if (branch.name == tcode(card)) {
								// XXX Shouldn't be hard coding 8.41.1
								newmr(s2u(message.user), card, branch.name, '8.41.1', function(mrid) {
									bot.reply(message, '<@' + s2u(message.user).name + '>: MR created: ' + mrurl(mrid) + '. (Type test after checking the MRs are good.)');
								});
							}
							else {
								newmr(s2u(message.user), card, branch.name, _.last(_.split(branch.name, '-')), function(mrid) {
									bot.reply(message, '<@' + s2u(message.user).name + '>: MR created: ' + mrurl(mrid) + '. (Type test after checking the MRs are good.)');
								});
							}
						});
					}
					else if (messagewords.length == 2) {
						newmr(s2u(message.user), card, tcode(card) + '-' + messagewords[1], messagewords[1], function(mrid) {
									bot.reply(message, '<@' + s2u(message.user).name + '>: MR created: ' + mrurl(mrid) + '. (Type test after checking the MRs are good.)');
						});
					}
				});
			});
		});
	}
	else if (message.text == 'test') {
		channelname(message.channel, function(name) {
			tfcodeindev(name, function(card) {
				bot.reply(message, '<@melo>: Please test. (Please type teststart when you begin)');
				tassign(card, 'melody');
			});
		});
		
	}
	else if (message.channel == channels.vult) {
	  if (message.text == 'lock') {
		data.deployStatus = 'locked';
		save();
                var vultlockedTimer = setTimeout(function() { vultLockReminder();}, 7200000);
		bot.reply(message, 'The server is now locked. (Please type unlock to unlock VULT)');
		
	  }
	  else if (message.text == 'unlock') {
		if (data.deployStatus == 'pending') {
                        runssh({host:'nzvult', user:'haoyang.feng', privateKey:'/home/haoyang.feng/.ssh/id_rsa',command:'touch /vmlock/ssrequest' });
		}
		data.deployStatus = 'none';
		save();
                if (vultlockedTimer) {
                        clearTimeout(vultlockedTimer);
                }
		bot.reply(message, 'The server is now unlocked.');
	  }
          else if (message.text == 'checkserver') {
                if (data.deployStatus == 'locked') { 
			bot.reply(message, 'The server is locked' );
                }
                else if (data.deployStatus == 'pending') { 
			bot.reply(message, 'The server is pending deployment' );
                }
                else {
			bot.reply(message, 'The server is unlocked');
                }
          }
        }
	else if (message.text == 'reject') {
		channelname(message.channel, function(name) {
			tfcode(name, function(card) {
				findmr(tcode(card), function(mr) {
					tassign(card, g2u(mr.author.id).name); bot.reply(message, '<@' + g2u(mr.author.id).name + '>: Your card has been rejected. :cold_sweat:');
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

// Bot Messages
controller.on('bot_message', function(bot, message) {
	// Listen to push to dev to create ss request
	if (message.channel == channels.gitlab && message.text.indexOf('pushed to branch <http://NZVULT/haoyang.feng/inv/commits/dev|dev>') > 0) {
		if (data.deployStatus == 'none') {
                        runssh({host:'nzvult', user:'haoyang.feng', privateKey:'/home/haoyang.feng/.ssh/id_rsa',command:'touch /vmlock/ssrequest' });
		}
		else {
			data.deployStatus = 'pending';
			save();
		}
	}
});

// SCM Integration
var scmusers = ['haoyang', 'ushal'];

//Create SCM and DS task for cards in Product Backlog Unrefined list assigned to Haoyang (XXX Change to ANY user that is PO)
setInterval(function() {
	tcards(['Product Backlog Unrefined'], 'open', function(cards) {
		_.each(cards[0].cards, function(card) {
				if (!tscm(card) && !_.isEmpty(card.idMembers) && card.idMembers == n2t('haoyang')) {
					trello.put('/1/cards/' + card.id + '/name', { value: card.name + ' 000' }, function(err){} )
					newscm(n2u('haoyang'), card.desc.split('\n')[0], card.desc.split('\n')[0], 40, function(sc) {
					trello.put('/1/cards/' + card.id + '/name', { value: card.name + ' ' + sc }, function(err) {} ) 
					joinchannel(card.name, 'https://kall.kiwiplan.co.nz/scm/softwareChangeViewer.do?id=' + sc);
					});
				}
				if (!tscm(card) && !_.isEmpty(card.idMembers) && card.idMembers == n2t('ushal')) {
					trello.put('/1/cards/' + card.id + '/name', { value: card.name + ' 000' }, function(err) {} ) 

                                }

			});
		});
}, 60000);

//Go Through Dev List and assign tasks to engineers
setInterval(function() {
	tcards(['Dev Sprint'], 'open', function(cards) {
		// XXX This implementation is a bit unpleasant
		var userstoassign = _.clone(scmusers);
		var priorityassignee = _.clone(scmusers);
		for (var i = 0; i < userstoassign.length; i++) {
			var card = cards[0].cards[i];
			if (!card) break;
			for (var j = 0; j < card.idMembers.length; j++) {
				_.pull(priorityassignee, t2n(card.idMembers[j]));
			};
		};
		_.each(cards[0].cards, function(card) {
			if (_.isEmpty(card.idMembers)) {
				var usertoassign = _.sample(_.isEmpty(priorityassignee) ? userstoassign : priorityassignee);
				_.pull(priorityassignee, usertoassign);
				_.pull(userstoassign, usertoassign);
				if (tsize(card) >= 5) {
					//XXX Currently will assign all users in the scmusers list
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

// Check if VULT is locked/unlocked
var vultLockReminder = function() {
	bot.say({ channel: channels.vult, text: 'Hey guys, VULT has been locked for 2 hours now. If this is accidental please type "unlock". Cool, thanks.' });
}

// SCM Keep alive
var scmkeepalive = function() {
	request.get({
		url: scmurl(39492),
		headers: { Cookie: users.haoyang.scmcookie }
	}, function(err, res, body) {
		// Link inactive
		if (!body.match(/<title>SCM - (\d{6})/)) {
			bot.startPrivateConversation({ user: users.haoyang.slack }, function(err, convo) {
                                if (err) {
                                  console.log ('Error Starting convo : ' + err);
                                }
				convo.ask('I need a new SCM cookie',function(response,convo) {
					users.haoyang.scmcookie = response.text;
					save();
					convo.say('Cool.');
					convo.next();
				});
			})
		}
		console.log("Haoyang SCM Cookie renewed");
	});
	request.get({
		url: scmurl(39492),
		headers: { Cookie: users.ushal.scmcookie }
	}, function(err, res, body) {
		// Link inactive
		if (!body.match(/<title>SCM - (\d{6})/)) {
			bot.startPrivateConversation({ user: users.ushal.slack }, function(err, convo) {
				convo.ask('I need a new SCM cookie',function(response,convo) {
					users.ushal.scmcookie = response.text;
					save();
					convo.say('Cool.');
					convo.next();
				});
			})
		}
		console.log("Ushal SCM Cookie renewed");
	});
};
scmkeepalive();
setInterval(scmkeepalive, 3600000);

// VM Warnings
/*
var vmids = ['haoyang', 'ushal', 'michelle', 'aaron'];
setInterval(function() {
	glob('/vmlock/*.8.41.1', null, function(err, files) {
		fs.stat(files[0], function(err, stats) {
			if ((new Date()) - stats.ctime > 300000) {
				var user = vmids[Number(files[0].split('/')[2].split('.')[0])];
				bot.say({ channel: channels.vm, text: '<!channel>: ' + '<@' + user + '>\'s vm script is locked.' });
			}
		});
	})
}, 300000);
*/
