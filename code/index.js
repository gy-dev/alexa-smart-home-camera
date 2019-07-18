const Promise = require('bluebird');
const request = require('request');

const myConfig = require('./config.json');

const { protocol, host, port } = myConfig.server;

function getDeviceListsByRequest(email, path) {
    var requestData = {};
    requestData.command = "getDevices";
    requestData.userName = email;
    return new Promise(function (resolve, reject) {
        request.post({
            url: `${protocol}://${host}:${port}${path}`,
            headers: {
                'Content-Type': 'application/json; charset=UTF-8'
            },
            body: JSON.stringify(requestData)
        }, function(error, response, body) {
            if (error) {
                reject([]);
            }
            if (!error && response.statusCode === 200) {
                let dataObj = JSON.parse(body);
                if (Number(dataObj.status) === 1) {
                    resolve(dataObj.data.deviceList);
                } else {
                    resolve([]);
                }
            }
        });
    });
}

function getUriByRequest(uid, path) {
    return new Promise((resolve, reject) => {
        var requestData = {};
        requestData.command = "getUri";
        requestData.uid = uid;

        request.post({
            url: `${protocol}://${host}:${port}${path}`,
            headers: {
                'Content-Type': 'application/json; charset=UTF-8'
            },
            body: JSON.stringify(requestData)
        }, function(error, response, body) {
            if (error) {
                reject({});
            }
            if (!error && response.statusCode === 200) {
                let dataObj = JSON.parse(body);
                if (Number(dataObj.status) === 1) {
                    // resolve(dataObj.data.uri);
                    resolve({uri:dataObj.data.uri, imageUri:dataObj.data.imageUri});
                } else {
                    resolve({});
                }
            }
        });
    });
}

function getDeviceStateByRequest(uid, path) {
    return new Promise((resolve, reject) => {
        var requestData = {};
        requestData.command = "getDeviceState";
        requestData.uid = uid;

        request.post({
            url: `${protocol}://${host}:${port}${path}`,
            headers: {
                'Content-Type': 'application/json; charset=UTF-8'
            },
            body: JSON.stringify(requestData)
        }, function(error, response, body) {
            if (error) {
                reject({});
            }
            if (!error && response.statusCode === 200) {
                let dataObj = JSON.parse(body);
                if (Number(dataObj.status) === 1) {
                    // resolve(dataObj.data.uri);
                    resolve({state:dataObj.data.state});
                } else {
                    resolve({});
                }
            }
        });
    });
}

function processAmazonDeviceList(deviceList) {
    if (!Array.isArray(deviceList) || deviceList.length === 0) {
        return {};
    }
    let endpoints = [];
    for (let index in deviceList) {
        let endpoint = getEndPoint();
        endpoint.endpointId = deviceList[index].endpointId;
        endpoint.friendlyName = deviceList[index].channelName;
        let manufacturerName = deviceList[index].manufacturerName;
        if (typeof manufacturerName !== 'undefined') {
            endpoint.manufacturerName = manufacturerName;
        }
        let description = deviceList[index].description;
        if (typeof description !== 'undefined') {
            endpoint.description = description;
        }
        endpoints.push(endpoint);
    }
    return {
        "endpoints": endpoints
    };
}


function getEndPoint() {
    return {
        "endpointId": "endpoint-001",
        "manufacturerName": "Device",
        "friendlyName": "front camera",
        "description": "Camera connected via Device",
        "displayCategories": [
            "CAMERA"
        ],
        "cookie": {},
        "capabilities": [{
                "type": "AlexaInterface",
                "interface": "Alexa",
                "version": "3"
            },
            {
                "type": "AlexaInterface",
                "interface": "Alexa.CameraStreamController",
                "version": "3",
                "cameraStreamConfigurations": [{
                    "protocols": [
                        "RTSP"
                    ],
                    "resolutions": [{
                        "width": 1280,
                        "height": 720
                    }],
                    "authorizationTypes": [
                        "DIGEST"
                    ],
                    "videoCodecs": [
                        "H264"
                    ],
                    "audioCodecs": [
                        "G711"
                    ]
                }]
            },
            {
                "type": "AlexaInterface",
                "interface": "Alexa.MediaMetadata",
                "version": "3",
                "proactivelyReported": true
            },
            {
                "type": "AlexaInterface",
                "interface": "Alexa.EndpointHealth",
                "version": "3",
                "properties": {
                    "supported": [{
                        "name": "connectivity"
                    }],
                    "proactivelyReported": true,
                    "retrievable": true
                }
            }
        ]
    };
}

function log(message, message1, message2) {
    console.log(message + message1 + message2);
}

/**
 * INTERNAL_ERROR  
 * BRIDGE_UNREACHABLE
 * ENDPOINT_UNREACHABLE 
 * INVALID_DIRECTIVE 
 * NO_SUCH_ENDPOINT
 */

function handleError(request, context) {
    var responseHeader = request.directive.header;
    responseHeader.name = "ErrorResponse";
    var response = {
        event: {
            header: responseHeader,
            endpoint: {
                "endpointId": request.directive.endpoint.endpointId
            },
            payload: {
                "type": "ENDPOINT_UNREACHABLE",
                "message": "Unable to reach device because it appears to be offline."
            }
        }
    };
    log("DEBUG", "ERROR ", JSON.stringify(response));
    context.succeed(response);
}

function handleDiscovery(request, context) {
    return getProfile(request.directive.payload.scope.token).then((profile) => {
        return getDeviceListsByRequest(profile.email, '/amazonsmart').then((data) => {
            var payload = processAmazonDeviceList(data);
            if (Object.keys(payload).length !== 0) {
                var header = request.directive.header;
                header.name = "Discover.Response";
                log("DEBUG", "Discovery Response: ", JSON.stringify({
                    header: header,
                    payload: payload
                }));
                context.succeed({
                    event: {
                        header: header,
                        payload: payload
                    }
                });
            } else {
                handleError(request, context);
            }
        }).catch((err) => {
            log("DEBUG", "ERROR ", JSON.stringify(err));
            handleError(request, context);
        });
    }).catch((err)=>{
        var responseHeader = request.directive.header;
        responseHeader.name = "ErrorResponse";
        var response = {
            event: {
                header: responseHeader,
                endpoint: {
                    "endpointId": request.directive.endpoint.endpointId
                },
                payload: {
                    "type": "INVALID_AUTHORIZATION_CREDENTIAL",
                    "message": "The authorization credential provided by Alexa is invalid. Disable and re-enable the skill."
                }
            }
        };
        log("DEBUG", "ERROR ", JSON.stringify(err));
        context.succeed(response);
    });
}

function handleCameraStreamControl(request, context) {
    return getProfile(request.directive.endpoint.scope.token).then((profile) => {
        let endpointId = request.directive.endpoint.endpointId;

        if (request.directive.header.name === 'InitializeCameraStreams') {
            return getUriByRequest(endpointId, '/amazonsmart').then((uriObj) => {
                // console.log(`handleCameraStreamControl uri-->${uri}`);
                if (Object.keys(uriObj).length !== 0) {
                    var expireTime = new Date().getTime() + 24*3600*1000;
				    var expireDate = new Date(expireTime);
                    var response = {
                        "event": {
                            "header": {
                                "namespace": "Alexa.CameraStreamController",
                                "name": "Response",
                                "payloadVersion": "3",
                                "messageId": request.directive.header.messageId,
                                "correlationToken": request.directive.header.correlationToken
                            },
                            "endpoint": {
                                "endpointId": endpointId
                            },
                            "payload": {
                                "cameraStreams": [{
                                    "uri": uriObj.uri,
                                    "expirationTime": expireDate,
                                    "idleTimeoutSeconds": 30,
                                    "protocol": "RTSP",
                                    "resolution": {
                                        "width": 1280,
                                        "height": 720
                                    },
                                    "authorizationType": "DIGEST",
                                    "videoCodec": "H264",
                                    "audioCodec": "G711"
                                }],
                                "imageUri": uriObj.imageUri
                            }
                        }
                    };
                    log("DEBUG:", "handleCameraStreamControl response", JSON.stringify(response));
                    context.succeed(response);
                } else {
                    handleError(request, context);
                }
            }).catch((err) => {
                handleError(request, context);
            });
        }
    }).catch(()=>{
        var responseHeader = request.directive.header;
        responseHeader.name = "ErrorResponse";
        var response = {
            event: {
                header: responseHeader,
                endpoint: {
                    "endpointId": request.directive.endpoint.endpointId
                },
                payload: {
                    "type": "INVALID_AUTHORIZATION_CREDENTIAL",
                    "message": "The authorization credential provided by Alexa is invalid. Disable and re-enable the skill."
                }
            }
        };
        log("DEBUG", "ERROR ", JSON.stringify(response));
        context.succeed(response);
    });

}

function getProfile(accessToken) {
    var amazonProfileURL = 'https://api.amazon.com/user/profile?access_token=';

    amazonProfileURL += accessToken;

    return new Promise(function (resolve, reject) {
        request.get(amazonProfileURL, function (error, response, body) {
            if (response.statusCode === 200) {

                var profile = JSON.parse(body);
                profile.statusCode = 200;
                log("DEBUG:", "getProfile", JSON.stringify(profile));
                resolve(profile);
            } else {
                log("DEBUG:", "getProfile err", JSON.stringify(error));
                //reject(response);
                resolve(response);
            }
        });
    });
}

function handleReportState(request, context) {
    var endpointId = request.directive.endpoint.endpointId;
    return getDeviceStateByRequest(endpointId, '/amazonsmart').then((stateObj) => {
        if (Object.keys(stateObj).length !== 0) {
            let value = {};
            if (Number(stateObj.state) === 1) {
                value = {
                    "value": "OK"
                };
            } else {
                value = {
                    "value": "UNREACHABLE"
                };
            }
            var d = new Date();
            var isoD = d.toISOString();
            var contextResult = {
                "properties": [
                    {
                        "namespace": "Alexa.EndpointHealth",
                        "name": "connectivity",
                        "value": value,
                        "timeOfSample": isoD, 
                        "uncertaintyInMilliseconds": 0
                    }
                ]
            };
            
            var responseHeader = request.directive.header;
            responseHeader.name = "StateReport";
            var response = {
                context: contextResult,
                event: {
                    header: responseHeader,
                    payload: {}
                }
            };
            log("DEBUG", "ReportState ", JSON.stringify(response));
            context.succeed(response);
        }
    });
}

function handleInvalidCommand(request, context) {
    var responseHeader = request.directive.header;
    responseHeader.name = "ErrorResponse";
    var response = {
        event: {
            header: responseHeader,
            endpoint: {
                "endpointId": request.directive.endpoint.endpointId
            },
            payload: {
                "type": "INVALID_DIRECTIVE",
                "message": "That command is not valid for this device."
            }
        }
    };
    log("DEBUG", "ERROR ", JSON.stringify(response));
    context.succeed(response);
}

exports.handler = function (request, context) {
    log("DEBUG:", "handler request", JSON.stringify(request));
    if (request.directive.header.namespace === 'Alexa.Discovery' && request.directive.header.name === 'Discover') {
        handleDiscovery(request, context, "");
    } else if (request.directive.header.namespace === 'Alexa.CameraStreamController') {
        handleCameraStreamControl(request, context);
    } else if (request.directive.header.namespace === 'Alexa.MediaMetadata') {
        handleInvalidCommand(request, context);
        // handleMediaMetadata(request, context);
    } else if (request.directive.header.namespace === 'Alexa') {
        if (request.directive.header.name === 'ReportState') {
            handleReportState(request, context);
        }
    } else{
        handleInvalidCommand(request, context);
    }
};