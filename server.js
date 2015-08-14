var fs = require('fs');
var _ = require('underscore');
var byline = require('byline');
var Slack = require('node-slack');
var request = require('request');
var requestify = require('requestify');
var memwatch = require('memwatch-next');
var config = require('./config');

// xmltojson
var parseString = require('xml2js').parseString;

console.log(config);
// Slack api
var options = "";
var slack = new Slack(config.slack.hook_url, options);

memwatch.on('leak', function(info) { 
	console.log(info);
});

// A couple mixins
_.mixin({
  compactObject : function(o) {
     var clone = _.clone(o);
     _.each(clone, function(v, k) {
       if(!v) {
         delete clone[k];
       }
     });
     return clone;
  },
  hex2a: function(hexx) {
  	//converts hex to string
  	var hex = hexx.toString();//force conversion
    var str = '';
    for (var i = 0; i < hex.length; i += 2)
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return str;
  }
});



var shairportParser = (function(_, slack) {
 	
 	var current = {
 		artist: "",
 		title: "",
 		album: "",
 		artwork: ""
 	};
 	var next = _.clone(current);
	

	return {
		parseBufferStream: function(items) {
			return _.chain(items)
				.map(function(val, key) {
					// console.log(val.code[0]);
					return {
						type: _(val).find(function(v, k) { return k === 'type'}),
						code: _(val).find(function(v, k) { return k === 'code'}),
						data: _(val).find(function(val, key) {return key === 'data'})
					}

				}).map(function(val, key) {

					if(val.data) {
						// console.log(val.type);
						var type = _.hex2a(val.type[0]);
						var code = _.hex2a(val.code[0]);
						var data = new Buffer(val.data[0]._, 'base64');
						// console.log(type.toString('utf8'));
						// console.log(data.toString('utf8'));

						return {
							type: type.toString('utf8'),
							data: data.toString('utf8'),
							code: code.toString('utf8')
						}

					}else {
						var type = _.hex2a(val.type[0]);
						var code = _.hex2a(val.code[0]);

						return {
							type:type,
							code: code
						}
					}
				}).value();
		},
		createShairObj: function(obj, cb) {
			// asal = album
			// asar = artist
			// minm = song name
			
			next = {};
			_(obj).each(function(val) {
				switch(val.code) {
					case "asal":
						_(next).extend({album: val.data});
						break;
					case "asar":
						_(next).extend({artist: val.data});
						break;
					case "minm":
						_(next).extend({title: val.data});
						break;
				}
			});
			if(current.title !== next.title && !_.isEmpty(next.title)) {
				
				current = next;
				var artist = encodeURIComponent(current.artist);
				var song = encodeURIComponent(current.title);
				
				var url = 'https://itunes.apple.com/search?term=' + song + "%20" +artist;
				
				request(url, function(error, response, body) {
					if (!error && response.statusCode == 200) {
						
						var itunesObj = JSON.parse(body).results;
						var artwork = _(itunesObj).first();

						if(!_.isEmpty(artwork)) {
							current.artwork = artwork.artworkUrl100;
							current.link = artwork.trackViewUrl;
						}
						
					}
					if(typeof cb === "function") {
						cb(current);
					}
					
				});

			}

		},
		sendToSlack: function(songObj) {
			var textOut;
			if(songObj.album) {
				textOut = "*" + songObj.artist +"*\n_" + songObj.album + "_";
			}else {
				textOut = "*" + songObj.artist +"*";
			}
			var options = {
				attachments: [
					{
						"title" : "“" + songObj.title + "”",
						"title_link" : songObj.link,
						"text" : textOut,
						"fallback": "",
						"thumb_url": songObj.artwork,
						"mrkdwn_in": ["text"]
					}
				]
			};
			options.attachments[0] = _.compactObject(options.attachments[0]);
			
			
			var boston = slack.send(options);

		},
		sendToFirebase: function(songObj) {
			var options = {
				host: config.firebase.host,
				method: "PUT"
			};
			var fireSong = {
			  "album": "",
			  "artist": "",
			  "artwork": "",
			  "comment": "",
			  "genre": "",
			  "title": ""
			};

			requestify.put(options.host, _(fireSong).extend(songObj));
		}
	}

})(_, slack);




// Read from the FIFO
var s = byline(fs.createReadStream('/tmp/shairport-sync-metadata',  { encoding: 'utf8' }));

var buffer = "";

s.on('data', function(data, err){
	buffer += data;
});
setInterval(function() {
	// every interval we are going to check on the buffer to see if its collected any info for us
	// There might be a better way to do this, like maybe a delimiter of some sort
	// but I haven't had success with it. 

	var xml = "<root>" + buffer + "</root>";
	
	parseString(xml, function(err, results) {

		if(!err && buffer) {
			buffer = "";
			var items = results.root.item;

			// parse the buffer xml -> json object
			var result = shairportParser.parseBufferStream(items);
			// create a readable object, include artwork from itunes if we can
			shairportParser.createShairObj(result, function(data) {
				console.log(data);
				if(data.title && data.artist) {
					
					shairportParser.sendToSlack(data);
					shairportParser.sendToFirebase(data);
				}
				
			});
		}else {
			buffer = "";
		}
		
	});
},6000);




