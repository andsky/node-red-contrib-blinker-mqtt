module.exports = function(RED) { // RED  可以对node-red 进行访问
	var client = {};
	var fromDevice = '';
	RED.nodes.registerType("Blinker-IN", class {
		constructor(config) {
			const node = this
			RED.nodes.createNode(node, config)
			const BlinkerNodeConfig = RED.nodes.getNode(config.blinker)
			// console.log('blinkerConfig blinker-mqtt.js:',BlinkerNodeConfig)
			let Blinker_key = BlinkerNodeConfig.SecretKey;
			var flowContext = this.context().flow;
			// flowContext.set(Blinker_key, {
			// 	type: BlinkerNodeConfig.DeviceType
			// })
			// console.log('读取数值：', flowContext.get(Blinker_key).action || '{"pState": "false"}')
			var mqtt = require('mqtt');
			console.log("Blinker_key(BlinkerNodeConfig):", Blinker_key)
			function getBlinkerDeviceInfo(auth, callback) {
				let host = 'https://iot.diandeng.tech';
				let url = '';
				if (BlinkerNodeConfig.DeviceType != 'other') {
					url = '/api/v1/user/device/diy/auth?authKey=' + auth + '&miType=' + BlinkerNodeConfig.DeviceType;
				} else {
					url = '/api/v1/user/device/diy/auth?authKey=' + auth;
				}
				let https = require('https');
				https.get(host + url, function(res) {
					let datas = [];
					let size = 0;
					res.on('data', function(data) {
						datas.push(data);
						size += data.length;
					})
					res.on('end', function(data) {
						let mProto = {};
						let buff = Buffer.concat(datas, size);
						var data = JSON.parse(buff);
						if (data['detail'] == 'device not found') {
							console.log('Please make sure you have put in the right AuthKey!');
							// node.warn('没有找到设备,AuthKey错误?')
							node.status({
								text: `没有找到设备,AuthKey错误?`,
								fill: 'red',
								shape: 'ring'
							})
						} else {
							node.status({
								text: `获取到设备信息:${BlinkerNodeConfig.name}(${BlinkerNodeConfig.SecretKey})`,
								fill: 'blue',
								shape: 'ring'
							})
							let dd = data['detail'];
							// console.log('device found');
							let deviceName = dd.deviceName;
							let iotId = dd.iotId;
							let iotToken = dd.iotToken;
							let productKey = dd.productKey;
							let uuid = dd.uuid;
							let broker = dd.broker;

							//bmt.exatopic = '/sys/' + productKey + '/' + deviceName + '/rrpc/request/+'
							//bmt.exapubtopic = '/sys/' + productKey + '/' + deviceName + '/rrpc/response/'

							if (broker == 'aliyun') {
								mProto._host = 'public.iot-as-mqtt.cn-shanghai.aliyuncs.com'
								mProto._port = 1883;
								mProto._subtopic = '/' + productKey + '/' + deviceName + '/r';
								mProto._pubtopic = '/' + productKey + '/' + deviceName + '/s';
								mProto._clientId = deviceName;
								mProto._username = iotId;
								mProto._exapubtopic = '';
							} else if (broker == 'qcloud') {
								mProto._host = 'iotcloud-mqtt.gz.tencentdevices.com'
								mProto._port = 1883;
								mProto._subtopic = productKey + '/' + deviceName + '/r'
								mProto._pubtopic = productKey + '/' + deviceName + '/s'
								mProto._clientId = productKey + deviceName
								mProto._username = mProto._clientId + ';' + iotId
							}
							mProto._deviceName = deviceName
							mProto._password = iotToken
							mProto._uuid = uuid
							flowContext.set(BlinkerNodeConfig.SecretKey, {
								type: BlinkerNodeConfig.DeviceType,
								mqtt: mProto
							})
							node.send({
								payload: "NodeRed<-Blinker->MQTT OK"
							})
							callback(mProto)
						}
					})
				}).on('error', function(err) {
					console.log('Get Device Info Error...' + err);
					node.status({
						text: `获取设备失败:${err}`,
						fill: 'red',
						shape: 'ring'
					})
				})
			}
			getBlinkerDeviceInfo(BlinkerNodeConfig.SecretKey, function(mProto) {
				let mqttProto = flowContext.get(BlinkerNodeConfig.SecretKey).mqtt;
				var options = {
					clientId: mqttProto._clientId,
					username: mqttProto._username,
					password: mqttProto._password,
				}
				client[Blinker_key] = mqtt.connect('mqtt://' + mqttProto._host + ':' + mqttProto._port, options);
				client[Blinker_key].on('connect', function() {
					client[Blinker_key].subscribe(mqttProto._subtopic);
					console.log(Blinker_key + ':|/--------------MQTT:<->Connected!--------------/');
					node.status({
						text: `onLine:${BlinkerNodeConfig.name}(${BlinkerNodeConfig.SecretKey})`,
						fill: 'green',
						shape: 'ring'
					})
				})
				client[Blinker_key].on('message', function(topic, message) {
					var data = message.toString(); // message is Buffer
					// node.send([JSON.parse(data), null])
					data = data.replace(new RegExp("'",'g'),'"');
					console.log('MQTT:<-|', topic);
					mqttProto._exapubtopic = topic;
					//return;
					let get_msg = JSON.parse(data);
					data = JSON.stringify(get_msg['data']);
					fromDevice = get_msg.fromDevice;
					if (fromDevice == 'MIOT') {
						//米家设备
						// let queryDevice = JSON.parse(data)
						if (data == '{"get":"state"}') {
							console.log('MQTT:<-|米家获取状态(ALL):', data)
							// if (get_msg.data.hasOwnProperty('get') && get_msg.data.get == 'state') {
							// let out_parm = nodeContext.get('MIOT-Device') || '{"pState": "false"}';
							BlinkerNodeConfig.autoRes = false;
							if (BlinkerNodeConfig.autoRes) {
								let out_parm = flowContext.get(BlinkerNodeConfig.SecretKey).action || '{"pState": "false"}';
								console.log('MQTT:->|自动反馈米家获取状态(ALL):', out_parm)
								// 小米状态查询包
								client[Blinker_key].publish(mqttProto._pubtopic, JSON.stringify({
									"data": JSON.parse(out_parm),
									"fromDevice": mqttProto._deviceName,
									"toDevice": "MIOT_r",
									"deviceType": "vAssistant"
								}));
							}
							node.send({
								payload: JSON.parse(data),
								SecretKey: Blinker_key
							})
							// console.log('////心跳包发完了')
						} else if (get_msg.data.hasOwnProperty('get') && get_msg.data.get == 'state' && get_msg.data.num) {
							console.log('MQTT:<-|米家获取状态:', data)
							node.send({
								payload: JSON.parse(data),
								SecretKey: Blinker_key
							})
							BlinkerNodeConfig.autoRes = false;
							if (BlinkerNodeConfig.autoRes) {
								let out_parm = flowContext.get(BlinkerNodeConfig.SecretKey).action || '{"pState": "false"}';
								console.log('MQTT:->|自动反馈米家获取状态:', out_parm)
								client[Blinker_key].publish(mqttProto._pubtopic, JSON.stringify({
									"data": JSON.parse(out_parm),
									"fromDevice": mqttProto._deviceName,
									"toDevice": "MIOT_r",
									"deviceType": "vAssistant"
								}))
							}
						} else if (get_msg.data.hasOwnProperty('set')) {
							console.log('MQTT:<-|米家操控指令:', data)
							// {"set":{"pState":true,"num":"1"}}
							// console.log(JSON.parse(data).set)
							//原样怼回去了
							BlinkerNodeConfig.autoRes = false;
							if (BlinkerNodeConfig.autoRes) {
								let in_parm = JSON.stringify(JSON.parse(data).set);
								flowContext.set(BlinkerNodeConfig.SecretKey, {
									action: in_parm,
									type: BlinkerNodeConfig.DeviceType,
									mqtt: mqttProto
								})
								console.log('MQTT:->|自动反馈米家操控指令:', in_parm)
								client[Blinker_key].publish(mqttProto._pubtopic, JSON.stringify({
									"data": JSON.parse(in_parm),
									"fromDevice": mqttProto._deviceName,
									"toDevice": "MIOT_r",
									"deviceType": "vAssistant"
								}));
							}
							//原样怼回去了
							node.send({
								payload: JSON.parse(data),
								SecretKey: Blinker_key
							})
						} else {
							console.log('MQTT:<-|其他情况:', data)
						}
					} else {
						//非米家设备
						if (get_msg.data.hasOwnProperty('get') && get_msg.data.get == 'state') {
							//APP心跳包
							console.log('MQTT:->|非米家设备(APP心跳包):', data)
							client[Blinker_key].publish(mqttProto._pubtopic, JSON.stringify({
								"data": {
									"state": "online",
									"timer": "000",
									"version": "0.1.0"
								},
								"fromDevice": mqttProto._deviceName,
								"toDevice": mqttProto._uuid,
								"deviceType": "OwnApp"
							}));
						} else {
							//非心跳包抛向前台
							console.log('MQTT:<-|非米家设备:', data)
							node.send({
								payload: JSON.parse(data),
								SecretKey: Blinker_key
							})
						}
					}
				})
				client[Blinker_key].on('error', function(err) {
					console.log(err);
					node.status({
						text: `MQTT错误:${err}`,
						fill: 'yellow',
						shape: 'dot'
					})
				})
			})
			node.on('close', function(removed, done) {
				for (var mqtt_client in client) {
					client[mqtt_client].end();
				}
				done()
			});
		}
	});
	RED.nodes.registerType('Blinker-OUT', class {
		constructor(config) {
			const node = this
			RED.nodes.createNode(node, config)
			var flowContext = this.context().flow;
			node.on('input', data => {
				if (data.hasOwnProperty('send')&&data.hasOwnProperty('SecretKey')) {
					let Blinker_key=data.SecretKey
					console.log('Blinker_key(Blinker-OUT-inputFunction):', Blinker_key)
					let mqtt = flowContext.get(Blinker_key).mqtt;
					//console.log(mqtt._pubtopic)
					node.status({
						text: JSON.stringify(data.payload),
						fill: 'green',
						shape: 'ring'
					})
					let send_msg = {
						"data": data.payload,
						"fromDevice": mqtt._deviceName,
						"toDevice": fromDevice == 'MIOT' ? "MIOT_r" : mqtt._uuid,
						"deviceType": fromDevice == 'MIOT' ? "vAssistant" : "OwnApp"
					}
					node.send({
						payload: send_msg
					})
					let objJsonStr = JSON.stringify(send_msg);
					let objJsonB64 = Buffer.from(objJsonStr).toString("base64");
					client[Blinker_key].publish(mqtt._exapubtopic.replace("request","response"), objJsonB64);
					console.log('MQTT:->|input:', JSON.stringify(send_msg),mqtt._exapubtopic.replace("request","response"));
				} else {
					node.status({
						text: '因msg.send或msg.SecretKey缺失\n发布失败',
						fill: 'red',
						shape: 'ring'
					})
					node.send(data)
				}
			})
		}
	})
}
