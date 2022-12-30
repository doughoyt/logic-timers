module.exports = function (RED) {
    'use strict';

    const moment = require('moment');

    RED.nodes.registerType('doughoyt-schedule', function (config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const minutesInDay = 60 * 24;

        this.events = JSON.parse(config.events);
        this.sendType = config.sendType;
        this.sendId = config.sendId;
        this.on1Payload = config.on1Payload;
        this.on1PayloadType = config.on1PayloadType;
        this.on2Payload = config.on2Payload;
        this.on2PayloadType = config.on2PayloadType;
        this.offPayload = config.offPayload;
        this.offPayloadType = config.offPayloadType;

        this.scheduleEnabled = true;
        this.state = null;
        this.ignoreFirstSend = !config.startupMessage;
        this.sendOnEnable = config.sendOnEnable;

        // Get the current state
        this.getState = function () {
            var now = moment();;
            var dow = now.day();
            var mow = (dow * minutesInDay) + (now.hours() * 60) + now.minutes();
            var match = 0;
            
            for (var event of node.events) {
                var startMow = (event.start.dow * minutesInDay) + event.start.mod;
                var endMow = (event.end.dow * minutesInDay) + + event.end.mod;
                if (endMow === 0) endMow = 7 * minutesInDay; // Handle edge case
                if (mow >= startMow  && mow < endMow) {
                    match = event.onNum;
                }
            }
            return match;
        }

        // Send the event message
        this.sendMessage = function(payload) {
            if (node.ignoreFirstSend) {
                node.ignoreFirstSend = false;
                return;
            }
            
            // Output value
            switch (node.sendType) {
                case 'flow':
                    node.context().flow.set(node.sendId, payload);
                    break;
                case 'global':
                    node.context().global.set(node.sendId, payload);
                    break;
                case 'msg':
                    var msg = {};
                    var currPart = msg;
                    var spl = node.sendId.split('.');
                    for (var i in spl) {
                        if (i < (spl.length - 1)) {
                        if (!currPart[spl[i]]) currPart[spl[i]] = {};
                            currPart = currPart[spl[i]];    
                        } else {
                            currPart[spl[i]] = payload;
                        }
                    }
                    node.send(msg);
                break;
            }
        }

        // Get value in selected format
        this.getValue = function(type, value) {
            switch (type) {
                case 'flow':
                    value = node.context().flow.get(value);
                    break;
                case 'global':
                    value = node.context().global.get(value);
                    break;
                case 'json':
                    value = JSON.parse(value);
                    break;
                case 'bool':
                    value = (value === "true");
                    break;
                case 'date':
                    value = (new Date()).getTime();
                    break;
                case 'num':
                    value = parseFloat(value);
                    break;
            }
            return value;
        };

        // Check for new state
        this.update = function(alwaysSend = false) {
            var newState = node.scheduleEnabled ? node.getState() : 0;
            var sendMessage = alwaysSend;

            // Has the state changed
            if (newState != node.state) {
                if (node.state) {
                    node.log(`Change state from ${node.state} to ${newState}`);
                }
                node.state = newState;
                sendMessage = true;
            }

            // Message to send?
            if (sendMessage) {
                // Get the message payload
                switch(node.state) {
                    case 0:
                        node.sendMessage(node.getValue(node.offPayloadType, node.offPayload));
                        break;
                    case 1:
                        node.sendMessage(node.getValue(node.on1PayloadType, node.on1Payload));
                      break;
                    case 2:
                        node.sendMessage(node.getValue(node.on2PayloadType, node.on2Payload));
                      break;
                    default:
                        node.sendMessage(node.getValue(node.offPayloadType, node.offPayload));
                  }
            }

            // Always update the status
            node.status({
                fill: node.state ? 'green' : 'grey', 
                shape: node.scheduleEnabled ? 'dot' : 'ring', 
                text: node.state ? 'ON' : 'OFF' 
            });
        }
        
        // On input send the message
        this.on("input", function(msg, send, done) {
            var value = msg.hasOwnProperty('payload') ? msg.payload.toString() : null;
            if (value) {
                node.scheduleEnabled = value === 'ON';
                node.update(node.sendOnEnable);
            }
            done();
        });

        // Stop the update interval on close
        node.on('close', function () {
            clearInterval(node.updateInterval);
        });

        // Start interval
        this.updateInterval = setInterval(node.update, 10000); // Look every 10 seconds

        // Initial update
        setTimeout(node.update, 100);
    });

    RED.httpAdmin.get('/doughoyt/schedule/*', function (req, res) {
        var options = {root: __dirname + '/schedule/', dotfiles: 'deny'};
        res.sendFile(req.params[0], options)
    })
};
